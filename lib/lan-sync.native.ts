import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import type TcpSocket from 'react-native-tcp-socket';
import {
  discoverNativeLanDevices,
  startNativeLanDiscovery,
  stopNativeLanDiscovery,
} from './lan-discovery.native';
import { closeServer, listenOnAvailablePort, listenWithOwnership } from './lan-server-utils';
import {
  decodeUtf8,
  destroySocketWhenConnected,
  endSocketWithData,
} from './r58-socket-utils';
import { getR58PairingAddressCandidates } from './lan-discovery-utils';
import {
  getTcpSocket,
  requestR58Packet,
} from './r58-tcp-transport.native';
export { configureR58RequestTransport } from './r58-tcp-transport.native';

import {
  applyRemoteSyncEvents,
  createLocalId,
  getHostSyncBatch,
  getPairedLanPeers,
  getLocalDeviceId,
  getLocalSyncEventsForPeer,
  markLocalSyncEventsSyncedForPeer,
  registerLanPeer,
  savePairedLanPeers,
  unregisterLanPeer,
  type LanPeer,
  type SyncEvent,
} from './local-database';
import {
  applyLanTransfer,
  getLanTransferEvents,
  getLanTransferManifest,
  getLanTransferPlan,
  getLanTransferFingerprint,
  MAX_LAN_TRANSFER_BYTES,
  persistLanTransferCover,
  recordLanTransferSent,
  readLanTransferCoverChunk,
  validateLanTransferManifest,
  type LanTransferManifest,
} from './library-package';
import {
  getLanPairing,
  getLanPairings,
  getLocalLanPairingCode,
  isValidTemporaryR58PairingCode,
  removeLanPairing,
  saveLanPairing,
  type LanPairing,
} from './lan-pairing';
import {
  getR58ResponseEvents,
  handleR58Request,
  makeR58Auth,
  matchesR58Auth,
  toR58Records,
  validateR58Request,
  type R58Packet,
} from './r58-protocol';
import {
  DEFAULT_BATCH_SIZE as R58_SYNC_BATCH_SIZE,
  DEFAULT_MAX_EXCHANGES as R58_MAX_SYNC_EXCHANGES,
  runR58SyncSession,
} from './r58-sync-engine';
import { isTransferVersionAuthoritative } from './lan-transfer-version';

export const SYNC_PORT = 45831;
export const R58_PORT = 45858;
const MAX_MESSAGE_BYTES = 20 * 1024 * 1024;
const MAX_SYNC_BATCH_EVENTS = 500;
const TRANSFER_EVENT_BATCH_SIZE = 100;
const TRANSFER_COVER_CHUNK_SIZE = 256 * 1024;

type SyncRequest = {
  version: 2;
  device_id: string;
  device_name: string;
  events: SyncEvent[];
  host_cursor: number;
  include_peers: boolean;
  pairing_code?: string;
};

type CoverTransferDescriptor = {
  book_id: string;
  sha256: string | null;
  mime_type: string | null;
  byte_length: number;
};

type IncomingTransfer = {
  id: string;
  senderId: string;
  expectedEventCount: number;
  expectedBatchCount: number;
  expectedCovers: Map<string, CoverTransferDescriptor>;
  fingerprint: string;
  eventBatches: Map<number, SyncEvent[]>;
  eventBytes: number;
  coverBytes: number;
  receivedCovers: Map<string, string | null>;
  activeCover: {
    descriptor: CoverTransferDescriptor;
    chunkCount: number;
    nextChunk: number;
    chunks: Uint8Array[];
  } | null;
  createdAt: number;
};

type SyncResponse = {
  version: 2;
  device_id: string;
  events: SyncEvent[];
  peers: LanPeer[];
  host_cursor: number;
  has_more: boolean;
};

export type NearbyLanDevice = {
  device_id: string;
  device_name: string;
  address: string;
  paired_devices: number;
  protocol_version?: 1;
  r58_address?: string;
};

let server: ReturnType<typeof TcpSocket.createServer> | null = null;
let r58Server: ReturnType<typeof TcpSocket.createServer> | null = null;
let runningToken: string | null = null;
let serverStartingToken: string | null = null;
let serverStartPromise: Promise<number> | null = null;
let serverListening = false;
let activeSyncPort = SYNC_PORT;
let activeR58Port = R58_PORT;
let incomingSyncQueue: Promise<void> = Promise.resolve();
const failedAuthByAddress = new Map<string, { count: number; blockedUntil: number }>();
const failedR58AuthByAddress = new Map<string, { count: number; blockedUntil: number }>();
const incomingTransfers = new Map<string, IncomingTransfer>();
const outgoingTransferSessions = new Map<
  string,
  { transferId: string; fingerprint: string }
>();

type TcpConnection = ReturnType<typeof TcpSocket.createConnection>;
type LanResponseSink = {
  write: (data: Buffer) => unknown;
  end: () => void;
};

function createR58Server(): ReturnType<typeof TcpSocket.createServer> {
  const socketLibrary = getTcpSocket();
  return socketLibrary.createServer({ noDelay: true }, (socket) => {
    let requestBytes = Buffer.alloc(0);
    let handled = false;
    let connectionClosed = false;
    socket.setTimeout(10_000, () => {
      if (!handled) {
        handled = true;
        if (!connectionClosed && !socket.destroyed) {
          socket.destroy();
        }
      }
    });
    socket.once('close', () => {
      connectionClosed = true;
      socket.setTimeout(0);
    });
    const sendR58Response = (body: Record<string, unknown>) => {
      try {
        endSocketWithData(
          socket,
          Buffer.from(`${JSON.stringify(body)}\n`, 'utf8'),
          () => connectionClosed
        );
      } catch (error) {
        console.warn('Unable to write the R58 response to the connected peer.', error);
        if (!socket.destroyed) socket.destroy();
      }
    };
    socket.on('data', async (chunk) => {
      if (handled) return;
      requestBytes = Buffer.concat([requestBytes, Buffer.from(chunk)]);
      if (requestBytes.length > MAX_MESSAGE_BYTES) {
        handled = true;
        sendR58Response({ version: 1, status: 'error', error: 'The R58 packet is too large.' });
        return;
      }
      const newline = requestBytes.indexOf(0x0a);
      if (newline < 0) return;
      handled = true;
      socket.setTimeout(0);
      const peerAddress = peerAddressFromSocket(socket).replace(/:\d+$/, '');
      const authState = failedR58AuthByAddress.get(peerAddress);
      if (authState && authState.blockedUntil > Date.now()) {
        sendR58Response({
          version: 1,
          packetId: '',
          sourceDevice: { id: '', name: '' },
          direction: 'RESPONSE',
          type: 'sync',
          auth: '',
          status: 'error',
          error: 'Too many unsuccessful R58 pairing attempts. Try again in one minute.',
          records: [],
        });
        return;
      }
      try {
        const request = JSON.parse(decodeUtf8(requestBytes, 0, newline)) as unknown;
        const response = await handleR58Request(
          request,
          `${peerAddress}:${activeR58Port}`
        );
        if (
          request &&
          typeof request === 'object' &&
          'type' in request &&
          request.type === 'discover' &&
          response.status === 'ok'
        ) {
          response.syncPort = activeSyncPort;
          response.r58Port = activeR58Port;
        }
        failedR58AuthByAddress.delete(peerAddress);
        sendR58Response(response);
      } catch (error) {
        const failures = (authState?.count ?? 0) + 1;
        failedR58AuthByAddress.set(peerAddress, {
          count: failures >= 5 ? 0 : failures,
          blockedUntil: failures >= 5 ? Date.now() + 60_000 : 0,
        });
        const requestValue = (() => {
          try {
            return validateR58Request(
              JSON.parse(decodeUtf8(requestBytes, 0, newline))
            );
          } catch {
            return null;
          }
        })();
        const errorMessage =
          error instanceof Error ? error.message : 'Unable to process the R58 packet.';
        const response: Partial<R58Packet> = {
          version: 1,
          packetId: requestValue?.packetId ?? '',
          sourceDevice: { id: '', name: '' },
          direction: 'RESPONSE',
          type: requestValue?.type ?? 'sync',
          auth: '',
          status: 'error',
          error: errorMessage,
          records: [],
        };
        sendR58Response(response as Record<string, unknown>);
      }
    });
    socket.on('error', () => {});
  });
}

function listenLanServer(
  listener: ReturnType<typeof TcpSocket.createServer>,
  port: number | number[]
): Promise<number> {
  return listenOnAvailablePort(listener, port);
}

function assertToken(token: string): void {
  if (!/^(?:\d{6}|[A-Za-z0-9._~-]{16,128})$/.test(token)) {
    throw new Error(
      'Use a six-digit pairing code.'
    );
  }
}

function tokensMatch(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

function parsePeerAddress(input: string): { host: string; port: number } {
  const value = input.trim();
  if (!value) {
    throw new Error('Enter the paired device address before syncing.');
  }

  const normalized = value.replace(/^(?:https?|tcp):\/\//i, '');
  const lastColon = normalized.lastIndexOf(':');
  const hasExplicitPort = lastColon > normalized.lastIndexOf(']');

  if (hasExplicitPort) {
    const hostPart = normalized.slice(0, lastColon);
    const portPart = Number.parseInt(normalized.slice(lastColon + 1), 10);
    if (!hostPart || !Number.isInteger(portPart) || portPart <= 0 || portPart > 65535) {
      throw new Error('The device address must look like 192.168.1.12:45831.');
    }
    return { host: hostPart, port: portPart };
  }

  return { host: normalized, port: SYNC_PORT };
}

function sendJsonResponse(
  socket: LanResponseSink,
  status: number,
  body: Record<string, unknown> & { error?: string }
): void {
  let payload = Buffer.from(JSON.stringify(body), 'utf8');
  if (payload.length > MAX_MESSAGE_BYTES) {
    status = 413;
    payload = Buffer.from(
      JSON.stringify({ error: 'The sync response is too large.' }),
      'utf8'
    );
  }
  const reason =
    status === 200
      ? 'OK'
      : status === 400
        ? 'Bad Request'
        : status === 401
          ? 'Unauthorized'
          : status === 403
            ? 'Forbidden'
              : status === 409
                ? 'Conflict'
                : status === 413
                  ? 'Payload Too Large'
                  : status === 429
                    ? 'Too Many Requests'
                    : 'Internal Server Error';

  const headers = Buffer.from(
    `HTTP/1.1 ${status} ${reason}\r\nContent-Type: application/json\r\nContent-Length: ${payload.length}\r\nConnection: close\r\n\r\n`,
    'utf8'
  );

  socket.write(Buffer.concat([headers, payload]));
  socket.end();
}

function readRequestPayload(
  bytes: Buffer,
): {
  hasCompleteRequest: boolean;
  requestBody: string | null;
  path?: string;
  status?: number;
  error?: string;
} {
  const headerEnd = bytes.indexOf('\r\n\r\n');
  if (headerEnd < 0) {
    return { hasCompleteRequest: false, requestBody: null };
  }

  const headerText = decodeUtf8(bytes, 0, headerEnd);
  const [methodLine, ...headerLines] = headerText.split('\r\n');
  const normalizedLine = methodLine?.toLowerCase();
  if (normalizedLine === 'get /discover http/1.1') {
    return { hasCompleteRequest: true, requestBody: null, path: 'discover' };
  }
  const isUnpairRequest = normalizedLine === 'post /unpair http/1.1';
  const isPairRequest = normalizedLine === 'post /pair http/1.1';
  const transferPath = normalizedLine?.startsWith('post /transfer/')
    ? normalizedLine.slice('post '.length, -' http/1.1'.length)
    : null;
  const isSyncRequest = normalizedLine === 'post /sync http/1.1';
  if (!isUnpairRequest && !isPairRequest && !isSyncRequest && !transferPath) {
    return {
      hasCompleteRequest: true,
      requestBody: null,
      status: 400,
      error: 'The peer sent an unsupported request.',
    };
  }

  const contentLengthLine = headerLines.find((line) =>
    line.toLowerCase().startsWith('content-length:')
  );
  const contentLength = Number.parseInt(contentLengthLine?.split(':')[1]?.trim() ?? '', 10);
  if (!Number.isInteger(contentLength) || contentLength < 0) {
    return {
      hasCompleteRequest: true,
      requestBody: null,
      status: 400,
      error: 'The peer sent an invalid request body length.',
    };
  }

  const bodyStart = headerEnd + 4;
  if (bytes.length < bodyStart + contentLength) {
    return { hasCompleteRequest: false, requestBody: null };
  }

  return {
    hasCompleteRequest: true,
    path: isPairRequest ? 'pair' : isUnpairRequest ? 'unpair' : isSyncRequest ? 'sync' : transferPath ?? undefined,
    requestBody: decodeUtf8(bytes, bodyStart, bodyStart + contentLength),
  };
}

async function handleIncomingPairRequest(
  socket: LanResponseSink,
  payload: string,
  peerAddress: string
): Promise<void> {
  let request: unknown;
  try {
    request = JSON.parse(payload);
  } catch {
    sendJsonResponse(socket, 400, { error: 'The pairing request is invalid.' });
    return;
  }
  if (
    !request ||
    typeof request !== 'object' ||
    !('device_id' in request) ||
    typeof request.device_id !== 'string' ||
    !('device_name' in request) ||
    typeof request.device_name !== 'string' ||
    !('pairing_code' in request) ||
    typeof request.pairing_code !== 'string' ||
    !/^\d{6}$/.test(request.pairing_code)
  ) {
    sendJsonResponse(socket, 400, { error: 'The pairing request payload is invalid.' });
    return;
  }

  const isTempValid = await isValidTemporaryR58PairingCode(request.pairing_code);
  const localCode = await getLocalLanPairingCode();
  const isPermanentValid = request.pairing_code === localCode;

  if (!isTempValid && !isPermanentValid) {
    sendJsonResponse(socket, 401, { error: 'The six-digit pairing code is incorrect or expired.' });
    return;
  }

  const localDeviceId = await getLocalDeviceId();
  const localDeviceName = `Library device ${localDeviceId.slice(-4)}`;
  const sharedSecretValue = 'shared_secret' in request ? request.shared_secret : undefined;
  const legacyPairingCodeValue =
    'legacy_pairing_code' in request ? request.legacy_pairing_code : undefined;
  const sharedSecret = typeof sharedSecretValue === 'string'
    ? sharedSecretValue
    : request.pairing_code;

  const peerHost = peerAddress.split(':')[0] || peerAddress;
  const pairing: LanPairing = {
    device_id: request.device_id,
    device_name: request.device_name.slice(0, 40),
    address: `${peerHost}:${activeSyncPort}`,
    r58_address: `${peerHost}:${activeR58Port}`,
    password: sharedSecret,
    legacy_password: typeof legacyPairingCodeValue === 'string'
      ? legacyPairingCodeValue
      : request.pairing_code,
    protocol_version: 1,
    host_cursor: 0,
  };

  await saveLanPairing(pairing);
  await registerLanPeer(pairing.device_id, pairing.device_name, pairing.address);

  sendJsonResponse(socket, 200, {
    status: 'ok',
    version: 1,
    device_id: localDeviceId,
    device_name: localDeviceName,
    legacy_pairing_code: localCode,
  });
}

async function handleIncomingSyncRequest(
  socket: LanResponseSink,
  payload: string,
  peerAddress: string
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as SyncRequest;
  } catch {
    sendJsonResponse(socket, 400, { error: 'The peer sent invalid sync data.' });
    return;
  }

  const request = parsed as Partial<SyncRequest>;
  if (
    request.version !== 2 ||
    typeof request.device_id !== 'string' ||
    !Array.isArray(request.events) ||
    request.events.length > MAX_SYNC_BATCH_EVENTS ||
    !Number.isSafeInteger(request.host_cursor) ||
    (request.host_cursor ?? -1) < 0 ||
    typeof request.include_peers !== 'boolean' ||
    (request.pairing_code !== undefined && !/^\d{6}$/.test(request.pairing_code))
  ) {
    sendJsonResponse(socket, 400, { error: 'The peer sent an invalid sync request.' });
    return;
  }

  const run = async () => {
    try {
      await registerLanPeer(
        request.device_id!,
        typeof request.device_name === 'string'
          ? request.device_name.slice(0, 40)
          : `Library device ${request.device_id!.slice(-4)}`,
        peerAddress
      );
      if (request.pairing_code && request.device_id !== (await getLocalDeviceId())) {
        const existing = await getLanPairing(request.device_id!);
        await saveLanPairing({
          device_id: request.device_id!,
          device_name:
            typeof request.device_name === 'string'
              ? request.device_name.slice(0, 40)
              : `Library device ${request.device_id!.slice(-4)}`,
          address: peerAddress,
          password: request.pairing_code,
          host_cursor: existing?.host_cursor ?? 0,
          last_sync_at: new Date().toISOString(),
        });
      }
      await applyRemoteSyncEvents(request.events!);
      const batch = await getHostSyncBatch(
        request.device_id!,
        request.host_cursor!,
        peerAddress
      );
      sendJsonResponse(socket, 200, {
        version: 2,
        device_id: await getLocalDeviceId(),
        events: batch.events,
        peers: request.include_peers ? await getPairedLanPeers() : [],
        host_cursor: batch.cursor,
        has_more: batch.hasMore,
      });
    } catch (error) {
      console.error('Unable to apply incoming LAN sync changes.', error);
      sendJsonResponse(socket, 400, {
        error: error instanceof Error ? error.message : 'Unable to apply incoming sync changes.',
      });
    }
  };
  const queued = incomingSyncQueue.then(run);
  incomingSyncQueue = queued.then(
    () => undefined,
    () => undefined
  );
  await queued;
}

function peerAddressFromSocket(socket: TcpConnection): string {
  const rawAddress = socket.remoteAddress;
  if (!rawAddress) return '';
  const address = rawAddress.startsWith('::ffff:')
    ? rawAddress.slice('::ffff:'.length)
    : rawAddress;
  return `${address}:${SYNC_PORT}`;
}

function allowPairingAttempt(address: string, accepted: boolean): boolean {
  const now = Date.now();
  const current = failedAuthByAddress.get(address);
  if (current && current.blockedUntil > now) return false;
  if (accepted) {
    failedAuthByAddress.delete(address);
    return true;
  }
  const count = (current?.count ?? 0) + 1;
  failedAuthByAddress.set(address, {
    count: count >= 5 ? 0 : count,
    blockedUntil: count >= 5 ? now + 60_000 : 0,
  });
  return true;
}

function isTransferEvent(value: unknown): value is SyncEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<SyncEvent>;
  return (
    typeof event.id === 'string' &&
    event.id.length > 0 &&
    (event.entity === 'books' || event.entity === 'profiles' || event.entity === 'borrowings') &&
    typeof event.entity_id === 'string' &&
    event.entity_id.length > 0 &&
    typeof event.payload === 'string' &&
    typeof event.changed_at === 'string' &&
    Number.isFinite(Date.parse(event.changed_at)) &&
    typeof event.device_id === 'string' &&
    event.device_id.length > 0
  );
}

function findIncomingTransfer(
  transferId: unknown,
  senderId: string
): IncomingTransfer | null {
  if (typeof transferId !== 'string') return null;
  const transfer = incomingTransfers.get(transferId);
  if (!transfer || transfer.senderId !== senderId) return null;
  if (Date.now() - transfer.createdAt > 30 * 60 * 1000) {
    incomingTransfers.delete(transferId);
    return null;
  }
  transfer.createdAt = Date.now();
  return transfer;
}

async function assertPairedTransferSender(senderId: string): Promise<void> {
  const peers = await getPairedLanPeers();
  if (!peers.some((peer) => peer.device_id === senderId)) {
    throw new Error('Only paired devices can transfer library data.');
  }
}

async function handleIncomingTransferRequest(
  socket: LanResponseSink,
  path: string,
  payload: string
): Promise<void> {
  let request: unknown;
  try {
    request = JSON.parse(payload);
  } catch {
    sendJsonResponse(socket, 400, { error: 'The transfer request is invalid.' });
    return;
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    sendJsonResponse(socket, 400, { error: 'The transfer request is invalid.' });
    return;
  }
  const body = request as Record<string, unknown>;
  const senderId = body.device_id;
  if (typeof senderId !== 'string' || !senderId) {
    sendJsonResponse(socket, 400, { error: 'The transfer request is missing its device ID.' });
    return;
  }

  try {
    await assertPairedTransferSender(senderId);
    if (path === '/transfer/manifest') {
      sendJsonResponse(socket, 200, {
        device_id: await getLocalDeviceId(),
        manifest: await getLanTransferManifest(),
      });
      return;
    }
    if (path === '/transfer/records') {
      if (
        !Array.isArray(body.records) ||
        body.records.length > 100 ||
        !body.records.every((record) =>
          record &&
          typeof record === 'object' &&
          'entity' in record &&
          ['books', 'profiles', 'borrowings'].includes(String(record.entity)) &&
          'entity_id' in record &&
          typeof record.entity_id === 'string'
        )
      ) {
        sendJsonResponse(socket, 400, { error: 'The requested transfer records are invalid.' });
        return;
      }
      sendJsonResponse(socket, 200, {
        events: await getLanTransferEvents(
          body.records as { entity: SyncEvent['entity']; entity_id: string }[]
        ),
      });
      return;
    }
    if (path === '/transfer/read-cover') {
      if (
        typeof body.book_id !== 'string' ||
        typeof body.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(body.sha256) ||
        !Number.isSafeInteger(body.chunk_index)
      ) {
        sendJsonResponse(socket, 400, { error: 'The requested cover is invalid.' });
        return;
      }
      const chunk = await readLanTransferCoverChunk(
        body.book_id,
        body.chunk_index as number,
        TRANSFER_COVER_CHUNK_SIZE,
        body.sha256
      );
      sendJsonResponse(socket, 200, {
        book_id: chunk.book_id,
        sha256: chunk.sha256,
        mime_type: chunk.mime_type,
        byte_length: chunk.byte_length,
        chunk_index: chunk.chunk_index,
        chunk_count: chunk.chunk_count,
        base64: Buffer.from(chunk.bytes).toString('base64'),
      });
      return;
    }

    if (path === '/transfer/start') {
      const transferId = body.transfer_id;
      const fingerprint = body.plan_fingerprint;
      const expectedEventCount = body.event_count;
      const expectedBatchCount = body.batch_count;
      const coverDescriptors = body.covers;
      if (
        typeof transferId !== 'string' ||
        !/^[a-f0-9-]{20,64}$/i.test(transferId) ||
        typeof fingerprint !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(fingerprint) ||
        !Number.isSafeInteger(expectedEventCount) ||
        (expectedEventCount as number) < 0 ||
        (expectedEventCount as number) > 20_000 ||
        !Number.isSafeInteger(expectedBatchCount) ||
        (expectedBatchCount as number) !==
          Math.ceil((expectedEventCount as number) / TRANSFER_EVENT_BATCH_SIZE) ||
        !Array.isArray(coverDescriptors) ||
        coverDescriptors.length > 20_000
      ) {
        sendJsonResponse(socket, 400, { error: 'The transfer plan is invalid.' });
        return;
      }
      for (const descriptor of coverDescriptors) {
        if (
          !descriptor ||
          typeof descriptor !== 'object' ||
          !('book_id' in descriptor) ||
          typeof descriptor.book_id !== 'string' ||
          !descriptor.book_id ||
          !('sha256' in descriptor) ||
          (descriptor.sha256 !== null &&
            (typeof descriptor.sha256 !== 'string' ||
              !/^[a-f0-9]{64}$/i.test(descriptor.sha256))) ||
          !('mime_type' in descriptor) ||
          (descriptor.mime_type !== null &&
            (typeof descriptor.mime_type !== 'string' ||
              !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(descriptor.mime_type))) ||
          !('byte_length' in descriptor) ||
          !Number.isSafeInteger(descriptor.byte_length) ||
          (descriptor.byte_length as number) < 0 ||
          (descriptor.byte_length as number) > 32 * 1024 * 1024 ||
          (descriptor.sha256 === null && descriptor.byte_length !== 0)
        ) {
          sendJsonResponse(socket, 400, { error: 'The transfer contains an invalid cover plan.' });
          return;
        }
      }

      const existing = incomingTransfers.get(transferId);
      if (
        existing &&
        Date.now() - existing.createdAt <= 30 * 60 * 1000 &&
        existing.senderId === senderId &&
        existing.fingerprint === fingerprint &&
        existing.expectedEventCount === expectedEventCount &&
        existing.expectedBatchCount === expectedBatchCount
      ) {
        existing.createdAt = Date.now();
        sendJsonResponse(socket, 200, {
          accepted: true,
          resumed: true,
          received_batches: [...existing.eventBatches.keys()],
          completed_covers: [...existing.receivedCovers.keys()],
          active_cover: existing.activeCover
            ? {
                book_id: existing.activeCover.descriptor.book_id,
                next_chunk: existing.activeCover.nextChunk,
              }
            : null,
        });
        return;
      }
      if (existing) incomingTransfers.delete(transferId);

      for (const [id, transfer] of incomingTransfers) {
        if (
          Date.now() - transfer.createdAt > 30 * 60 * 1000 ||
          (transfer.senderId === senderId && id !== transferId)
        ) {
          incomingTransfers.delete(id);
        }
      }
      if (incomingTransfers.size >= 2 && !incomingTransfers.has(transferId)) {
        sendJsonResponse(socket, 409, { error: 'This device is already receiving other transfers.' });
        return;
      }
      const expectedCovers = new Map<string, CoverTransferDescriptor>();
      const receivedCovers = new Map<string, string | null>();
      const coverBytes = (coverDescriptors as CoverTransferDescriptor[])
        .reduce((total, item) => total + item.byte_length, 0);
      if (coverBytes > MAX_LAN_TRANSFER_BYTES) {
        sendJsonResponse(socket, 413, { error: 'The transfer exceeds the 128 MiB per-transfer limit.' });
        return;
      }
      for (const item of coverDescriptors as CoverTransferDescriptor[]) {
        if (expectedCovers.has(item.book_id)) {
          sendJsonResponse(socket, 400, { error: 'The transfer contains duplicate covers.' });
          return;
        }
        expectedCovers.set(item.book_id, item);
        if (item.sha256 === null) receivedCovers.set(item.book_id, null);
      }
      incomingTransfers.set(transferId, {
        id: transferId,
        senderId,
        expectedEventCount: expectedEventCount as number,
        expectedBatchCount: expectedBatchCount as number,
        expectedCovers,
        fingerprint,
        eventBatches: new Map(),
        eventBytes: 0,
        coverBytes,
        receivedCovers,
        activeCover: null,
        createdAt: Date.now(),
      });
      sendJsonResponse(socket, 200, {
        accepted: true,
        resumed: false,
        received_batches: [],
        completed_covers: [...receivedCovers.keys()],
        active_cover: null,
      });
      return;
    }

    const transfer = findIncomingTransfer(body.transfer_id, senderId);
    if (!transfer) {
      sendJsonResponse(socket, 409, { error: 'The transfer is missing or has expired. Compare again.' });
      return;
    }

    if (path === '/transfer/events') {
      const batchIndex = body.batch_index;
      const batchCount = body.batch_count;
      const events = body.events;
      if (
        !Number.isSafeInteger(batchIndex) ||
        (batchIndex as number) < 0 ||
        (batchIndex as number) >= transfer.expectedBatchCount ||
        batchCount !== transfer.expectedBatchCount ||
        !Array.isArray(events) ||
        events.length < 1 ||
        events.length > TRANSFER_EVENT_BATCH_SIZE ||
        !events.every(isTransferEvent)
      ) {
        sendJsonResponse(socket, 400, { error: 'The transferred record batch is invalid.' });
        return;
      }
      const previous = transfer.eventBatches.get(batchIndex as number);
      if (previous && JSON.stringify(previous) !== JSON.stringify(events)) {
        sendJsonResponse(socket, 409, { error: 'A repeated transfer batch did not match its saved copy.' });
        return;
      }
      const batchBytes = Buffer.byteLength(JSON.stringify(events), 'utf8');
      if (
        !previous &&
        transfer.eventBytes + transfer.coverBytes + batchBytes > MAX_LAN_TRANSFER_BYTES
      ) {
        sendJsonResponse(socket, 413, { error: 'The transfer exceeds the 128 MiB per-transfer limit.' });
        return;
      }
      if (!previous) transfer.eventBytes += batchBytes;
      transfer.eventBatches.set(batchIndex as number, events as SyncEvent[]);
      sendJsonResponse(socket, 200, { accepted: true, batch_index: batchIndex });
      return;
    }

    if (path === '/transfer/cover-chunk') {
      const bookId = body.book_id;
      const hash = body.sha256;
      const mimeType = body.mime_type;
      const byteLength = body.byte_length;
      const chunkIndex = body.chunk_index;
      const chunkCount = body.chunk_count;
      const base64 = body.base64;
      const descriptor = typeof bookId === 'string'
        ? transfer.expectedCovers.get(bookId)
        : undefined;
      const activeCover = transfer.activeCover;
      const expectedChunkIndex =
        activeCover && activeCover.descriptor.book_id === bookId
          ? activeCover.nextChunk
          : 0;
      const expectedBytes = descriptor
        ? Math.max(
            0,
            Math.min(
              TRANSFER_COVER_CHUNK_SIZE,
              descriptor.byte_length - (Number(chunkIndex) || 0) * TRANSFER_COVER_CHUNK_SIZE
            )
          )
        : -1;
      if (
        !descriptor ||
        descriptor.sha256 === null ||
        descriptor.sha256 !== hash ||
        descriptor.mime_type !== mimeType ||
        descriptor.byte_length !== byteLength ||
        !Number.isSafeInteger(chunkIndex) ||
        !Number.isSafeInteger(chunkCount) ||
        (chunkCount as number) !== Math.max(1, Math.ceil(descriptor.byte_length / TRANSFER_COVER_CHUNK_SIZE)) ||
        (chunkIndex as number) !== expectedChunkIndex ||
        (activeCover !== null && activeCover.descriptor.book_id !== bookId) ||
        typeof base64 !== 'string' ||
        base64.length > 700_000 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64) ||
        Buffer.from(base64, 'base64').length !== expectedBytes
      ) {
        sendJsonResponse(socket, 400, { error: 'The transferred cover chunk is invalid.' });
        return;
      }
      if (!transfer.activeCover || transfer.activeCover.descriptor.book_id !== bookId) {
        transfer.activeCover = {
          descriptor,
          chunkCount: chunkCount as number,
          nextChunk: 0,
          chunks: [],
        };
      }
      const active = transfer.activeCover;
      if (active.chunkCount !== chunkCount) {
        sendJsonResponse(socket, 409, { error: 'The cover chunk count changed during transfer.' });
        return;
      }
      active.chunks.push(new Uint8Array(Buffer.from(base64, 'base64')));
      active.nextChunk += 1;
      if (active.nextChunk === active.chunkCount) {
        const bytes = Buffer.concat(active.chunks.map((chunk) => Buffer.from(chunk)));
        if (bytes.length !== descriptor.byte_length) {
          sendJsonResponse(socket, 400, { error: 'The received cover length did not match its manifest.' });
          return;
        }
        const uri = await persistLanTransferCover(
          descriptor.book_id,
          new Uint8Array(bytes),
          descriptor.mime_type!,
          descriptor.sha256!
        );
        transfer.receivedCovers.set(descriptor.book_id, uri);
        transfer.activeCover = null;
      }
      sendJsonResponse(socket, 200, {
        accepted: true,
        chunk_index: chunkIndex,
        cover_complete: !transfer.activeCover,
      });
      return;
    }

    if (path === '/transfer/commit') {
      if (
        transfer.eventBatches.size !== transfer.expectedBatchCount ||
        [...transfer.eventBatches.keys()].some((index) => index >= transfer.expectedBatchCount) ||
        transfer.receivedCovers.size !== transfer.expectedCovers.size ||
        transfer.activeCover
      ) {
        sendJsonResponse(socket, 409, { error: 'The transfer is incomplete and cannot be verified.' });
        return;
      }
      const events = Array.from(
        { length: transfer.expectedBatchCount },
        (_, index) => transfer.eventBatches.get(index) ?? []
      ).flat();
      if (events.length !== transfer.expectedEventCount) {
        sendJsonResponse(socket, 409, { error: 'The transferred record count did not match the plan.' });
        return;
      }
      const covers = [...transfer.expectedCovers.keys()].map((bookId) => ({
        book_id: bookId,
        uri: transfer.receivedCovers.get(bookId) ?? null,
      }));
      const result = await applyLanTransfer(events, covers, transfer.id);
      incomingTransfers.delete(transfer.id);
      sendJsonResponse(socket, 200, {
        verified: true,
        records: result.records,
        covers: result.covers,
        backup_name: result.backupName,
      });
      return;
    }

    sendJsonResponse(socket, 400, { error: 'The transfer request is unsupported.' });
  } catch (error) {
    console.error(`Unable to process LAN transfer request ${path}.`, error);
    sendJsonResponse(socket, 400, {
      error: error instanceof Error ? error.message : 'Unable to process the LAN transfer request.',
    });
  }
}

export async function handleDesktopLanRequest(
  path: string,
  payload: string,
  peerAddress: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  let response = Buffer.alloc(0);
  const sink: LanResponseSink = {
    write: (data) => {
      response = Buffer.from(data);
      return true;
    },
    end: () => undefined,
  };
  try {
    if (path === '/sync') {
      await handleIncomingSyncRequest(sink, payload, peerAddress);
    } else if (path === '/pair') {
      await handleIncomingPairRequest(sink, payload, peerAddress);
    } else if (path.startsWith('/transfer/')) {
      await handleIncomingTransferRequest(sink, path, payload);
    } else if (path === '/unpair') {
      let request: unknown;
      try {
        request = JSON.parse(payload);
      } catch {
        return {
          status: 400,
          body: { error: 'The device-management request is invalid.' },
        };
      }
      if (
        request &&
        typeof request === 'object' &&
        'device_id' in request &&
        typeof request.device_id === 'string' &&
        'pairing_code' in request &&
        typeof request.pairing_code === 'string'
      ) {
        const existing = await getLanPairing(request.device_id);
        if (existing?.password !== request.pairing_code || !/^\d{6}$/.test(request.pairing_code)) {
          sendJsonResponse(sink, 403, { error: 'This device is not paired with the sender.' });
        } else {
          await unregisterLanPeer(request.device_id);
          await removeLanPairing(request.device_id);
          sendJsonResponse(sink, 200, {
            version: 2,
            device_id: await getLocalDeviceId(),
            events: [],
            peers: await getPairedLanPeers(),
            host_cursor: 0,
            has_more: false,
          });
        }
      } else {
        sendJsonResponse(sink, 400, { error: 'The device-management request is invalid.' });
      }
    } else {
      sendJsonResponse(sink, 400, { error: 'The LAN request is unsupported.' });
    }
  } catch (error) {
    console.error('Unable to process the desktop LAN request.', error);
    return {
      status: 500,
      body: { error: 'Unable to process the LAN transfer request.' },
    };
  }
  const separator = response.indexOf('\r\n\r\n');
  if (separator < 0) {
    throw new Error('Unable to encode the desktop LAN transfer response.');
  }
  const statusLine = decodeUtf8(response, 0, separator).split('\r\n')[0] ?? '';
  const status = Number.parseInt(statusLine.split(' ')[1] ?? '', 10);
  const body: unknown = JSON.parse(decodeUtf8(response, separator + 4));
  if (
    !Number.isInteger(status) ||
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    throw new Error('The desktop LAN transfer response is invalid.');
  }
  return { status, body: body as Record<string, unknown> };
}

async function requestPeer(
  address: string,
  token: string,
  request: SyncRequest,
  path = '/sync'
): Promise<SyncResponse> {
  const { host, port } = parsePeerAddress(address);

  return new Promise((resolve, reject) => {
    let completed = false;
    let connected = false;
    let responseBytes = Buffer.alloc(0);
    const socket = getTcpSocket().createConnection(
      { host, port, connectTimeout: 20_000 },
      () => {
        connected = true;
        if (completed) {
          try {
            destroySocketWhenConnected(socket, connected);
          } catch {}
          return;
        }
        const payload = Buffer.from(JSON.stringify(request), 'utf8');
        if (payload.length > MAX_MESSAGE_BYTES) {
          finish(new Error('The sync request is too large.'));
          return;
        }
        const headers = Buffer.from(
          `POST ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: ${payload.length}\r\nConnection: close\r\n\r\n`,
          'utf8'
        );
        try {
          socket.write(Buffer.concat([headers, payload]));
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      }
    );

    const finish = (error?: Error, result?: SyncResponse) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      try {
        destroySocketWhenConnected(socket, connected);
      } catch {}
      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      } else {
        reject(new Error('The peer returned an empty sync response.'));
      }
    };

    const timeout = setTimeout(() => {
      finish(new Error('Timed out while connecting to the sync peer.'));
    }, 20000);

    socket.on('data', (chunk) => {
      responseBytes = Buffer.concat([responseBytes, Buffer.from(chunk)]);
      if (responseBytes.length > MAX_MESSAGE_BYTES) {
        finish(new Error('The peer response is too large.'));
        return;
      }

      const headerEnd = responseBytes.indexOf('\r\n\r\n');
      if (headerEnd < 0) {
        return;
      }

      const headerText = decodeUtf8(responseBytes, 0, headerEnd);
      const [statusLine, ...headerLines] = headerText.split('\r\n');
      const contentLengthLine = headerLines.find((line) =>
        line.toLowerCase().startsWith('content-length:')
      );
      const contentLength = Number.parseInt(contentLengthLine?.split(':')[1]?.trim() ?? '', 10);
      if (!Number.isInteger(contentLength) || contentLength < 0) {
        finish(new Error('The peer sent an invalid response.'));
        return;
      }

      const bodyStart = headerEnd + 4;
      if (responseBytes.length < bodyStart + contentLength) {
        return;
      }

      const status = Number.parseInt(statusLine?.split(' ')[1] ?? '', 10);
      const bodyText = decodeUtf8(responseBytes, bodyStart, bodyStart + contentLength);

      let body: SyncResponse & { error?: string };
      try {
        body = JSON.parse(bodyText) as SyncResponse & { error?: string };
      } catch {
        finish(new Error('The peer returned invalid sync data.'));
        return;
      }

      if (status !== 200) {
        finish(new Error(body.error ?? `Sync failed with status ${status}.`));
        return;
      }

      if (
        body.version !== 2 ||
        typeof body.device_id !== 'string' ||
        !Array.isArray(body.events) ||
        body.events.length > MAX_SYNC_BATCH_EVENTS ||
        !Array.isArray(body.peers) ||
        !Number.isSafeInteger(body.host_cursor) ||
        typeof body.has_more !== 'boolean'
      ) {
        finish(new Error('The peer returned an invalid sync event list.'));
        return;
      }

      clearTimeout(timeout);
      finish(undefined, body);
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      finish(error instanceof Error ? error : new Error(String(error)));
    });

    socket.on('close', () => {
      if (!completed) {
        clearTimeout(timeout);
        finish(new Error('The sync connection closed before a response arrived.'));
      }
    });
  });
}

type LanTransferRequestTransport = (
  address: string,
  token: string,
  path: string,
  request: Record<string, unknown>
) => Promise<Record<string, unknown>>;

let lanTransferRequestTransport: LanTransferRequestTransport | null = null;

export function configureLanTransferRequestTransport(
  transport: LanTransferRequestTransport | null
): void {
  lanTransferRequestTransport = transport;
}

async function requestTransferPeer(
  address: string,
  token: string,
  path: string,
  request: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (lanTransferRequestTransport) {
    return lanTransferRequestTransport(address, token, path, request);
  }
  const { host, port } = parsePeerAddress(address);
  return new Promise((resolve, reject) => {
    let completed = false;
    let connected = false;
    let responseBytes = Buffer.alloc(0);
    const socket = getTcpSocket().createConnection(
      { host, port, connectTimeout: 20_000 },
      () => {
        connected = true;
        if (completed) {
          try {
            destroySocketWhenConnected(socket, connected);
          } catch {}
          return;
        }
        const payload = Buffer.from(JSON.stringify(request), 'utf8');
        if (payload.length > MAX_MESSAGE_BYTES) {
          finish(new Error('The transfer request is too large.'));
          return;
        }
        const headers = Buffer.from(
          `POST ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: ${payload.length}\r\nConnection: close\r\n\r\n`,
          'utf8'
        );
        try {
          socket.write(Buffer.concat([headers, payload]));
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      }
    );

    const finish = (error?: Error, body?: Record<string, unknown>) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      try {
        destroySocketWhenConnected(socket, connected);
      } catch {}
      if (error) reject(error);
      else if (body) resolve(body);
      else reject(new Error('The paired device returned an empty transfer response.'));
    };
    const timeout = setTimeout(
      () => finish(new Error('Timed out while connecting to the paired device.')),
      60_000
    );

    socket.on('data', (chunk) => {
      responseBytes = Buffer.concat([responseBytes, Buffer.from(chunk)]);
      if (responseBytes.length > MAX_MESSAGE_BYTES) {
        finish(new Error('The paired device response is too large.'));
        return;
      }
      const headerEnd = responseBytes.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const headerLines = decodeUtf8(responseBytes, 0, headerEnd).split('\r\n');
      const contentLengthLine = headerLines.find((line) =>
        line.toLowerCase().startsWith('content-length:')
      );
      const contentLength = Number.parseInt(contentLengthLine?.split(':')[1]?.trim() ?? '', 10);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        finish(new Error('The paired device returned an invalid response length.'));
        return;
      }
      const bodyStart = headerEnd + 4;
      if (responseBytes.length < bodyStart + contentLength) return;
      const status = Number.parseInt(headerLines[0]?.split(' ')[1] ?? '', 10);
      let parsed: unknown;
      try {
        parsed = JSON.parse(
          decodeUtf8(responseBytes, bodyStart, bodyStart + contentLength)
        );
      } catch {
        finish(new Error('The paired device returned invalid transfer data.'));
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        finish(new Error('The paired device returned invalid transfer data.'));
        return;
      }
      const body = parsed as Record<string, unknown>;
      if (status !== 200) {
        finish(new Error(
          typeof body.error === 'string'
            ? body.error
            : `The paired device returned status ${status}.`
        ));
        return;
      }
      finish(undefined, body);
    });
    socket.on('error', (error) =>
      finish(error instanceof Error ? error : new Error(String(error)))
    );
    socket.on('close', () => {
      if (!completed) finish(new Error('The transfer connection closed before verification.'));
    });
  });
}

function isExpectedR58Response(
  response: R58Packet,
  packet: R58Packet,
  expectedPeerId: string
): boolean {
  return (
    response.version === 1 &&
    response.direction === 'RESPONSE' &&
    response.status === 'ok' &&
    response.type === packet.type &&
    response.packetId === packet.packetId &&
    response.sourceDevice?.id === expectedPeerId
  );
}

async function requestPairHttp(
  address: string,
  request: {
    device_id: string;
    device_name: string;
    pairing_code: string;
    shared_secret: string;
    legacy_pairing_code: string;
  }
): Promise<{ device_id: string; device_name: string; legacy_pairing_code?: string }> {
  const { host, port } = parsePeerAddress(address);
  return new Promise((resolve, reject) => {
    let completed = false;
    let connected = false;
    let responseBytes = Buffer.alloc(0);
    const socket = getTcpSocket().createConnection(
      { host, port, connectTimeout: 10_000 },
      () => {
        connected = true;
        if (completed) {
          try {
            destroySocketWhenConnected(socket, connected);
          } catch {}
          return;
        }
        const payload = Buffer.from(JSON.stringify(request), 'utf8');
        const headers = Buffer.from(
          `POST /pair HTTP/1.1\r\nHost: ${host}:${port}\r\nContent-Type: application/json\r\nContent-Length: ${payload.length}\r\nConnection: close\r\n\r\n`,
          'utf8'
        );
        try {
          socket.write(Buffer.concat([headers, payload]));
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)));
        }
      }
    );

    const finish = (error?: Error, result?: { device_id: string; device_name: string; legacy_pairing_code?: string }) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      try {
        destroySocketWhenConnected(socket, connected);
      } catch {}
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error('The peer closed without sending a pairing response.'));
    };

    const timeout = setTimeout(() => finish(new Error('Timed out while connecting to sync peer for pairing.')), 10000);

    socket.on('data', (chunk) => {
      responseBytes = Buffer.concat([responseBytes, Buffer.from(chunk)]);
      const headerEnd = responseBytes.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const headerText = decodeUtf8(responseBytes, 0, headerEnd);
      const statusLine = headerText.split('\r\n')[0] || '';
      const status = Number.parseInt(statusLine.split(' ')[1] || '', 10);
      const contentLengthLine = headerText.split('\r\n').find((l) => l.toLowerCase().startsWith('content-length:'));
      const contentLength = Number.parseInt(contentLengthLine?.split(':')[1]?.trim() || '', 10);
      const bodyStart = headerEnd + 4;
      if (!Number.isInteger(contentLength) || responseBytes.length < bodyStart + contentLength) return;

      try {
        const body = JSON.parse(decodeUtf8(responseBytes, bodyStart, bodyStart + contentLength));
        if (status === 200 && body.status === 'ok' && body.device_id) {
          finish(undefined, body);
        } else {
          finish(new Error(body.error || `Pairing rejected with status ${status}`));
        }
      } catch {
        finish(new Error('Invalid pairing response from peer.'));
      }
    });

    socket.on('error', (err) => finish(err instanceof Error ? err : new Error(String(err))));
    socket.on('close', () => {
      if (!completed) finish(new Error('Connection closed before pairing finished.'));
    });
  });
}

export async function pairWithR58Peer(
  device: NearbyLanDevice,
  pairingCode: string
): Promise<{ pairing: LanPairing }> {
  const code = pairingCode.trim();
  if (!device?.device_id || !device?.device_name || !device.address) {
    throw new Error('Select a discovered Library device before pairing.');
  }
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Enter the selected device’s current six-digit pairing code.');
  }

  const candidateAddresses = getR58PairingAddressCandidates(device);
  if (!candidateAddresses.length) {
    throw new Error('The selected device does not advertise the R58 sync protocol.');
  }
  const [deviceId, secretBytes] = await Promise.all([
    getLocalDeviceId(),
    Crypto.getRandomBytesAsync(32),
  ]);
  if (deviceId === device.device_id) {
    throw new Error('A device cannot pair with itself.');
  }
  const sharedSecret = Array.from(secretBytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  const packetId = createLocalId();
  const request: R58Packet = {
    version: 1,
    packetId,
    sourceDevice: {
      id: deviceId,
      name: `Library device ${deviceId.slice(-4)}`,
    },
    direction: 'REQUEST',
    type: 'pair',
    auth: await makeR58Auth(code, packetId, 'REQUEST'),
    pairingCode: code,
    legacyPairingCode: await getLocalLanPairingCode(),
    sharedSecret,
    records: [],
  };

  let response: R58Packet | null = null;
  let successfulAddress = '';
  let lastError: Error | null = null;

  for (const targetAddress of candidateAddresses) {
    let candidateResponse: R58Packet;
    try {
      candidateResponse = await requestR58Packet(targetAddress, request, {
        responseTimeoutMs: 15_000,
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`R58 pairing attempt failed on address ${targetAddress}:`, lastError.message);
      continue;
    }
    if (!isExpectedR58Response(candidateResponse, request, device.device_id)) {
      const actualDeviceId =
        typeof candidateResponse.sourceDevice?.id === 'string'
          ? candidateResponse.sourceDevice.id
          : 'unknown';
      throw new Error(
        `The pairing response from ${targetAddress} came from device ${actualDeviceId}, not selected device ${device.device_id}. Refresh nearby devices and select the intended device again.`
      );
    }
    if (!matchesR58Auth(
      candidateResponse.auth,
      await makeR58Auth(code, packetId, 'RESPONSE')
    )) {
      throw new Error('The pairing response failed authentication.');
    }
    response = candidateResponse;
    successfulAddress = targetAddress;
    break;
  }

  if (!response || !successfulAddress) {
    // Before giving up, try HTTP POST /pair fallback on device.address!
    let httpRes: Awaited<ReturnType<typeof requestPairHttp>>;
    try {
      httpRes = await requestPairHttp(device.address, {
        device_id: deviceId,
        device_name: `Library device ${deviceId.slice(-4)}`,
        pairing_code: code,
        shared_secret: sharedSecret,
        legacy_pairing_code: await getLocalLanPairingCode(),
      });
    } catch (httpErr) {
      throw lastError || httpErr;
    }
    if (httpRes.device_id !== device.device_id) {
      throw new Error(
        `The pairing response came from device ${httpRes.device_id}, not selected device ${device.device_id}. Refresh nearby devices and select the intended device again.`
      );
    }
    const peerName = httpRes.device_name?.trim() || device.device_name;
    const pairing: LanPairing = {
      device_id: device.device_id,
      device_name: peerName,
      address: device.address,
      r58_address:
        device.r58_address ??
        `${parsePeerAddress(device.address).host}:${R58_PORT}`,
      password: sharedSecret,
      legacy_password: httpRes.legacy_pairing_code || '',
      protocol_version: 1,
      host_cursor: 0,
    };
    await saveLanPairing(pairing);
    await registerLanPeer(device.device_id, peerName, pairing.address);
    return { pairing };
  }

  const peerName = response.sourceDevice.name.trim().slice(0, 40);
  if (!peerName) {
    throw new Error('The pairing response did not include a device name.');
  }
  const pairing: LanPairing = {
    device_id: device.device_id,
    device_name: peerName,
    address: device.address,
    r58_address: successfulAddress,
    password: sharedSecret,
    legacy_password:
      typeof response.legacyPairingCode === 'string'
        ? response.legacyPairingCode
        : '',
    protocol_version: 1,
    host_cursor: 0,
  };
  await saveLanPairing(pairing);
  const registered = await registerLanPeer(
    device.device_id,
    peerName,
    pairing.address
  );
  if (!registered) {
    throw new Error('The paired Library device could not be saved locally.');
  }
  return { pairing };
}

export async function forgetR58Peer(
  pairing: LanPairing
): Promise<void> {
  if (
    pairing.protocol_version !== 1 ||
    !pairing.r58_address ||
    !/^[a-f0-9]{64}$/i.test(pairing.password)
  ) {
    throw new Error('The saved R58 pairing is invalid.');
  }
  const [deviceId, packetId] = [await getLocalDeviceId(), createLocalId()];
  const request: R58Packet = {
    version: 1,
    packetId,
    sourceDevice: {
      id: deviceId,
      name: `Library device ${deviceId.slice(-4)}`,
    },
    direction: 'REQUEST',
    type: 'unpair',
    auth: await makeR58Auth(pairing.password, packetId, 'REQUEST'),
    records: [],
  };
  try {
    const response = await requestR58Packet(pairing.r58_address, request);
    if (isExpectedR58Response(response, request, pairing.device_id)) {
      matchesR58Auth(
        response.auth,
        await makeR58Auth(pairing.password, packetId, 'RESPONSE')
      );
    }
  } catch (error) {
    console.warn('Remote unpair request did not complete, removing local pairing.', error);
  }
  await unregisterLanPeer(pairing.device_id);
  await removeLanPairing(pairing.device_id);
}

export async function syncWithR58Peer(
  savedPairing: LanPairing
): Promise<{ sent: number; received: number; pairing: LanPairing }> {
  if (
    savedPairing.protocol_version !== 1 ||
    !savedPairing.r58_address ||
    !/^[a-f0-9]{64}$/i.test(savedPairing.password)
  ) {
    throw new Error('The R58 device pairing is invalid. Re-pair with its current six-digit code.');
  }
  const deviceId = await getLocalDeviceId();
  let pairing = { ...savedPairing };
  const result = await runR58SyncSession<SyncEvent>({
    initialAcknowledgments: pairing.r58_ack_event_ids ?? [],
    batchSize: R58_SYNC_BATCH_SIZE,
    maxExchanges: R58_MAX_SYNC_EXCHANGES,
    getPendingEvents: async () =>
      (await getLocalSyncEventsForPeer(pairing.device_id)).slice(
        0,
        R58_SYNC_BATCH_SIZE
      ),
    exchange: async (events, acknowledgments) => {
      const packetId = createLocalId();
      const request: R58Packet = {
        version: 1,
        packetId,
        sourceDevice: {
          id: deviceId,
          name: `Library device ${deviceId.slice(-4)}`,
        },
        direction: 'REQUEST',
        type: 'sync',
        auth: await makeR58Auth(pairing.password, packetId, 'REQUEST'),
        acknowledgeEventIds: acknowledgments,
        records: toR58Records(events),
      };

      let response: R58Packet;
      try {
        response = await requestR58Packet(pairing.r58_address!, request);
      } catch (r58Error) {
        const fallbackR58 = pairing.address.includes(`:${R58_PORT}`)
          ? pairing.address
          : `${pairing.address.replace(/:\d+$/, '')}:${R58_PORT}`;
        if (!fallbackR58 || fallbackR58 === pairing.r58_address) {
          throw r58Error;
        }
        response = await requestR58Packet(fallbackR58, request);
        pairing = { ...pairing, r58_address: fallbackR58 };
      }

      if (!isExpectedR58Response(response, request, pairing.device_id)) {
        throw new Error('The sync response came from a different device.');
      }
      if (!matchesR58Auth(
        response.auth,
        await makeR58Auth(pairing.password, packetId, 'RESPONSE')
      )) {
        throw new Error('The sync response failed authentication.');
      }

      return { incomingEvents: getR58ResponseEvents(response.records) };
    },
    applyIncomingEvents: (events) => applyRemoteSyncEvents(events),
    markSentEvents: (eventIds) =>
      markLocalSyncEventsSyncedForPeer(pairing.device_id, eventIds),
    saveAcknowledgments: async (eventIds) => {
      pairing = { ...pairing, r58_ack_event_ids: eventIds };
      await saveLanPairing(pairing);
    },
  });
  pairing = {
    ...pairing,
    r58_ack_event_ids: result.acknowledgments,
    last_sync_at: new Date().toISOString(),
  };
  await saveLanPairing(pairing);
  return {
    sent: result.sent,
    received: result.received,
    pairing,
  };
}

function probeLanDevice(address: string): Promise<NearbyLanDevice | null> {
  const { host, port } = parsePeerAddress(address);
  return new Promise((resolve) => {
    let completed = false;
    let connected = false;
    let responseBytes = Buffer.alloc(0);
    const socket = getTcpSocket().createConnection(
      { host, port, connectTimeout: 500 },
      () => {
        connected = true;
        if (completed) {
          try {
            destroySocketWhenConnected(socket, connected);
          } catch {}
          return;
        }
        try {
          socket.write(
            Buffer.from(
              `GET /discover HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: close\r\n\r\n`,
              'utf8'
            )
          );
        } catch {
          finish(null);
        }
      }
    );

    const finish = (device: NearbyLanDevice | null) => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      try {
        destroySocketWhenConnected(socket, connected);
      } catch {}
      resolve(device);
    };

    const timeout = setTimeout(() => finish(null), 500);
    socket.on('data', (chunk) => {
      responseBytes = Buffer.concat([responseBytes, Buffer.from(chunk)]);
      if (responseBytes.length > 4096) {
        finish(null);
        return;
      }
      const headerEnd = responseBytes.indexOf('\r\n\r\n');
      if (headerEnd < 0) {
        return;
      }
      const headerText = decodeUtf8(responseBytes, 0, headerEnd);
      const contentLengthLine = headerText
        .split('\r\n')
        .find((line) => line.toLowerCase().startsWith('content-length:'));
      const contentLength = Number.parseInt(contentLengthLine?.split(':')[1]?.trim() ?? '', 10);
      const bodyStart = headerEnd + 4;
      if (!Number.isInteger(contentLength) || contentLength < 0 || contentLength > 2048) {
        finish(null);
        return;
      }
      if (responseBytes.length < bodyStart + contentLength) {
        return;
      }
      try {
        const response = JSON.parse(
          decodeUtf8(responseBytes, bodyStart, bodyStart + contentLength)
        ) as Partial<NearbyLanDevice> & { version?: number };
        if (
          headerText.split('\r\n')[0]?.includes(' 200 ') &&
          response.version === 1 &&
          typeof response.device_id === 'string' &&
          typeof response.device_name === 'string' &&
          typeof response.paired_devices === 'number'
        ) {
          finish({
            device_id: response.device_id,
            device_name: response.device_name,
            address,
            paired_devices: response.paired_devices,
          });
        } else {
          finish(null);
        }
      } catch {
        finish(null);
      }
    });
    socket.on('error', () => finish(null));
    socket.on('close', () => finish(null));
  });
}

export async function discoverNearbyLanDevices(): Promise<NearbyLanDevice[]> {
  const deviceList = await discoverNativeLanDevices((address) =>
    probeLanDevice(address)
  );
  try {
    const existingPairings = await getLanPairings();
    for (const dev of deviceList) {
      const match = existingPairings.find((p) => p.device_id === dev.device_id);
      if (match && dev.r58_address && match.r58_address !== dev.r58_address) {
        await saveLanPairing({
          ...match,
          r58_address: dev.r58_address,
          address: dev.address,
        });
      }
    }
  } catch (err) {
    console.warn('Unable to refresh pairing addresses from discovery.', err);
  }

  return deviceList;
}

export function startLanSyncServer(
  token: string
): Promise<number> {
  assertToken(token);
  if (serverStartPromise) {
    if (serverStartingToken && !tokensMatch(serverStartingToken, token)) {
      return Promise.reject(new Error('A LAN sync listener is already starting with another pairing code.'));
    }
    return serverStartPromise;
  }
  if (server && r58Server && serverListening) {
    runningToken = token;
    return Promise.resolve(activeSyncPort);
  }

  serverStartingToken = token;
  const startPromise = startLanSyncServerInternal(token).finally(() => {
    if (serverStartPromise === startPromise) {
      serverStartPromise = null;
      serverStartingToken = null;
    }
  });
  serverStartPromise = startPromise;
  return startPromise;
}

async function startLanSyncServerInternal(token: string): Promise<number> {
  const socketLibrary = getTcpSocket();

  if (server || r58Server) {
    await Promise.all([closeServer(server), closeServer(r58Server)]);
    server = null;
    r58Server = null;
    serverListening = false;
    await new Promise((r) => setTimeout(r, 150));
  }

  const ownDeviceId = await getLocalDeviceId();
  let ownAddress: string | null = null;
  try {
    const ipAddress = await Network.getIpAddressAsync();
    if (ipAddress && ipAddress !== '0.0.0.0' && ipAddress.includes('.')) {
      ownAddress = `${ipAddress}:${SYNC_PORT}`;
    }
  } catch (error) {
    console.warn('Unable to read this device address for LAN transfer.', error);
  }
  const paired = await registerLanPeer(
    ownDeviceId,
    `Library device ${ownDeviceId.slice(-4)}`,
    ownAddress
  );
  if (!paired) {
    throw new Error('Unable to register this device for LAN sync.');
  }
  runningToken = token;
  server = socketLibrary.createServer((socket) => {
    let requestBytes = Buffer.alloc(0);
    let requestHandled = false;

    socket.on('data', async (chunk) => {
      if (requestHandled) {
        return;
      }
      requestBytes = Buffer.concat([requestBytes, Buffer.from(chunk)]);
      if (requestBytes.length > MAX_MESSAGE_BYTES) {
        sendJsonResponse(socket, 413, { error: 'The sync payload is too large.' });
        return;
      }

      const requestInfo = readRequestPayload(requestBytes);
      if (!requestInfo.hasCompleteRequest) {
        return;
      }

      if (requestInfo.status) {
        sendJsonResponse(socket, requestInfo.status, {
          error: requestInfo.error ?? 'Invalid request.',
        });
        return;
      }

      const headerText = decodeUtf8(
        requestBytes,
        0,
        requestBytes.indexOf('\r\n\r\n')
      );
      if (requestInfo.path === 'discover') {
        requestHandled = true;
        const deviceId = await getLocalDeviceId();
        const peers = await getPairedLanPeers();
        sendJsonResponse(socket, 200, {
          version: 1,
          device_id: deviceId,
          device_name: `Library device ${deviceId.slice(-4)}`,
          paired_devices: peers.length,
          protocol_version: 1,
          sync_port: activeSyncPort,
          r58_port: activeR58Port,
        });
        return;
      }
      if (requestInfo.path === 'pair') {
        requestHandled = true;
        await handleIncomingPairRequest(
          socket,
          requestInfo.requestBody ?? '',
          peerAddressFromSocket(socket)
        );
        return;
      }
      const authorizationLine = headerText
        .split('\r\n')
        .find((line) => line.toLowerCase().startsWith('authorization:'));
      const authorizationValue = authorizationLine?.split(':').slice(1).join(':').trim() ?? '';
      const bearerToken = authorizationValue.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
      const peerAddress = peerAddressFromSocket(socket);

      const isAuthValid =
        Boolean(bearerToken) &&
        (tokensMatch(bearerToken, token) ||
          (await isValidTemporaryR58PairingCode(bearerToken)));

      if (!isAuthValid) {
        requestHandled = true;
        if (!allowPairingAttempt(peerAddress, false)) {
          sendJsonResponse(socket, 429, { error: 'Too many incorrect pairing codes. Try again in one minute.' });
        } else {
          sendJsonResponse(socket, 401, { error: 'The six-digit pairing code is invalid.' });
        }
        return;
      }
      if (!allowPairingAttempt(peerAddress, true)) {
        requestHandled = true;
        sendJsonResponse(socket, 429, { error: 'Too many incorrect pairing codes. Try again in one minute.' });
        return;
      }

      requestHandled = true;
      try {
        if (requestInfo.path?.startsWith('/transfer/')) {
          await handleIncomingTransferRequest(
            socket,
            requestInfo.path,
            requestInfo.requestBody ?? ''
          );
          return;
        }
        if (requestInfo.path === 'unpair') {
          let unpairRequest: unknown;
          try {
            unpairRequest = JSON.parse(requestInfo.requestBody ?? '');
          } catch {
            sendJsonResponse(socket, 400, { error: 'The device-management request is invalid.' });
            return;
          }
          if (
            !unpairRequest ||
            typeof unpairRequest !== 'object' ||
            !('device_id' in unpairRequest) ||
            typeof unpairRequest.device_id !== 'string' ||
            !('pairing_code' in unpairRequest) ||
            typeof unpairRequest.pairing_code !== 'string'
          ) {
            sendJsonResponse(socket, 400, { error: 'The device-management request is invalid.' });
            return;
          }
          const existing = await getLanPairing(unpairRequest.device_id);
          if (
            !/^\d{6}$/.test(unpairRequest.pairing_code) ||
            existing?.password !== unpairRequest.pairing_code
          ) {
            sendJsonResponse(socket, 403, { error: 'This device is not paired with the sender.' });
            return;
          }
          await unregisterLanPeer(unpairRequest.device_id);
          await removeLanPairing(unpairRequest.device_id);
          sendJsonResponse(socket, 200, {
            version: 2,
            device_id: await getLocalDeviceId(),
            events: [],
            peers: await getPairedLanPeers(),
            host_cursor: 0,
            has_more: false,
          });
          return;
        }
        await handleIncomingSyncRequest(
          socket,
          requestInfo.requestBody ?? '',
          peerAddressFromSocket(socket)
        );
      } catch (error) {
        console.error('Unable to process the LAN sync request.', error);
        sendJsonResponse(socket, 500, { error: 'Unable to process the LAN sync request.' });
      }
    });

    socket.on('error', () => {
      // Connection-level errors are surfaced by the caller via the sync request.
    });
  });
  r58Server = createR58Server();

  const listeningServer = server;
  const listeningR58Server = r58Server;
  if (!listeningServer || !listeningR58Server) {
    server = null;
    r58Server = null;
    runningToken = null;
    throw new Error('Unable to initialize the LAN sync servers.');
  }
  try {
    const [boundSyncPort, boundR58Port] = await Promise.all([
      listenLanServer(listeningServer, [45831, 45832, 45833]),
      listenLanServer(listeningR58Server, [45858, 45859, 45860]),
    ]);
    activeSyncPort = boundSyncPort;
    activeR58Port = boundR58Port;
    serverListening = true;
    listeningServer.on('error', (error) => {
      if (server === listeningServer) {
        server = null;
        runningToken = null;
        serverListening = false;
      }
      console.error('Legacy LAN sync listener error.', error);
    });
    listeningR58Server.on('error', (error) => {
      if (r58Server === listeningR58Server) {
        r58Server = null;
        serverListening = false;
      }
      console.error('R58 LAN sync listener error.', error);
    });
    await startNativeLanDiscovery(
      ownDeviceId,
      `Library device ${ownDeviceId.slice(-4)}`,
      activeR58Port,
      activeSyncPort
    );
    return activeSyncPort;
  } catch (error) {
    const cleanupResults = await Promise.allSettled([
      closeServer(listeningServer),
      closeServer(listeningR58Server),
    ]);
    for (const result of cleanupResults) {
      if (result.status === 'rejected') {
        console.warn('Unable to close a partially started LAN listener.', result.reason);
      }
    }
    if (server === listeningServer) server = null;
    if (r58Server === listeningR58Server) r58Server = null;
    runningToken = null;
    serverListening = false;
    throw error;
  }
}

export function isLanSyncServerRunning(): boolean {
  return server !== null && r58Server !== null && serverListening;
}

export async function stopLanSyncServer(): Promise<void> {
  if (serverStartPromise) {
    try {
      await serverStartPromise;
    } catch {
      return;
    }
  }
  if (!server && !r58Server) {
    return;
  }

  const listeners = [server, r58Server].filter(
    (listener): listener is NonNullable<typeof listener> => listener !== null
  );
  const closeErrors: Error[] = [];
  await Promise.all(
    listeners.map(
      (listener) =>
        new Promise<void>((resolve) => {
          listener.close((error?: Error) => {
            if (error) closeErrors.push(error);
            resolve();
          });
        })
    )
  );
  server = null;
  r58Server = null;
  runningToken = null;
  serverListening = false;
  await stopNativeLanDiscovery();
  if (closeErrors.length) throw closeErrors[0];
}

export async function syncWithLanPeer(
  address: string,
  token: string,
  initialHostCursor = 0,
  includePeers = true,
  peerDeviceId?: string
): Promise<{ sent: number; received: number; peers: LanPeer[]; host_cursor: number }> {
  assertToken(token);
  if (!Number.isSafeInteger(initialHostCursor) || initialHostCursor < 0) {
    throw new Error('The saved sync cursor is invalid. Re-pair with this device.');
  }
  const deviceId = await getLocalDeviceId();
  const pairing =
    peerDeviceId
      ? await getLanPairing(peerDeviceId)
      : (await getLanPairings()).find((saved) => saved.address === address) ?? null;
  const targetDeviceId = peerDeviceId ?? pairing?.device_id;
  if (!targetDeviceId) {
    throw new Error('Save the paired device before starting synchronization.');
  }
  const pairingCode = await getLocalLanPairingCode();
  let hostCursor = initialHostCursor;
  let sent = 0;
  let received = 0;
  let peers: LanPeer[] = [];
  let hasMore = true;
  let hasOutgoing = true;
  while (hasMore || hasOutgoing) {
    const events = await getLocalSyncEventsForPeer(targetDeviceId);
    const responseBody = await requestPeer(address, token, {
      version: 2,
      device_id: deviceId,
      device_name: `Library device ${deviceId.slice(-4)}`,
      events,
      host_cursor: hostCursor,
      include_peers: includePeers && sent === 0 && received === 0,
      pairing_code: pairingCode,
    });

    if (responseBody.has_more && responseBody.host_cursor <= hostCursor) {
      throw new Error('The sync peer returned a non-advancing event cursor.');
    }
    await applyRemoteSyncEvents(responseBody.events);
    await markLocalSyncEventsSyncedForPeer(
      targetDeviceId,
      events.map((event) => event.id)
    );
    hasOutgoing = (await getLocalSyncEventsForPeer(targetDeviceId)).length > 0;
    if (responseBody.peers.length > 0) {
      await savePairedLanPeers(responseBody.peers);
      peers = responseBody.peers;
    }
    sent += events.length;
    received += responseBody.events.length;
    hostCursor = responseBody.host_cursor;
    hasMore = responseBody.has_more;
  }

  return {
    sent,
    received,
    peers,
    host_cursor: hostCursor,
  };
}

export type LanTransferComparison = {
  device_id: string;
  device_name: string;
  counts: { books: number; members: number; transactions: number; covers: number };
  estimatedBytes: number;
};

async function getRemoteTransferPlan(
  address: string,
  token: string,
  targetDeviceId: string
): Promise<{
  manifest: LanTransferManifest;
  plan: Awaited<ReturnType<typeof getLanTransferPlan>>;
}> {
  assertToken(token);
  const senderId = await getLocalDeviceId();
  const response = await requestTransferPeer(address, token, '/transfer/manifest', {
    device_id: senderId,
  });
  if (
    response.device_id !== targetDeviceId ||
    !response.manifest ||
    typeof response.manifest !== 'object'
  ) {
    throw new Error('The selected paired device returned an unexpected library identity.');
  }
  const manifest = response.manifest as LanTransferManifest;
  if (manifest.device_id !== targetDeviceId) {
    throw new Error('The paired device manifest did not match its device identity.');
  }
  return { manifest, plan: await getLanTransferPlan(manifest) };
}

function transferVersionIsNewer(
  incoming: { changed_at: string; device_id: string },
  current?: { changed_at: string; device_id: string }
): boolean {
  if (!current) return true;
  const incomingTime = Date.parse(incoming.changed_at);
  const currentTime = Date.parse(current.changed_at);
  return incomingTime > currentTime ||
    (incomingTime === currentTime && incoming.device_id > current.device_id);
}

async function applyReverseTransferChanges(
  address: string,
  token: string,
  senderId: string,
  remoteManifest: LanTransferManifest,
  onProgress?: (message: string) => void
): Promise<{
  books: number;
  members: number;
  transactions: number;
  covers: number;
  backupName: string;
}> {
  validateLanTransferManifest(remoteManifest);
  const localManifest = await getLanTransferManifest();
  const localRecords = new Map(
    localManifest.records.map((record) => [`${record.entity}:${record.entity_id}`, record])
  );
  const remoteNewerRecords = remoteManifest.records.filter((record) =>
    transferVersionIsNewer(
      { changed_at: record.changed_at, device_id: record.device_id },
      localRecords.get(`${record.entity}:${record.entity_id}`)
    )
  );
  const events: SyncEvent[] = [];
  for (let offset = 0; offset < remoteNewerRecords.length; offset += 100) {
    const records = remoteNewerRecords.slice(offset, offset + 100);
    const response = await requestTransferPeer(address, token, '/transfer/records', {
      device_id: senderId,
      records: records.map(({ entity, entity_id }) => ({ entity, entity_id })),
    });
    if (!Array.isArray(response.events) || !response.events.every(isTransferEvent)) {
      throw new Error('The receiving device returned invalid changed records.');
    }
    events.push(...response.events);
  }

  const localBookRecords = new Map(
    localManifest.records
      .filter((record) => record.entity === 'books')
      .map((record) => [record.entity_id, record])
  );
  const remoteBookRecords = new Map(
    remoteManifest.records
      .filter((record) => record.entity === 'books')
      .map((record) => [record.entity_id, record])
  );
  const localCovers = new Map(localManifest.covers.map((cover) => [cover.book_id, cover]));
  const remoteCovers = new Map(remoteManifest.covers.map((cover) => [cover.book_id, cover]));
  const coverChanges: { book_id: string; uri: string | null }[] = [];
  const incomingCoverIds = new Set<string>();

  for (const cover of remoteManifest.covers) {
    const remoteBook = remoteBookRecords.get(cover.book_id);
    const localBook = localBookRecords.get(cover.book_id);
    if (
      !remoteBook ||
      !isTransferVersionAuthoritative(
        remoteBook,
        localBook,
        remoteManifest.device_id
      ) ||
      cover.sha256 === localCovers.get(cover.book_id)?.sha256
    ) {
      continue;
    }
    const chunks: Uint8Array[] = [];
    let expectedChunkCount: number | null = null;
    for (let chunkIndex = 0; expectedChunkCount === null || chunkIndex < expectedChunkCount; chunkIndex += 1) {
      const response = await requestTransferPeer(address, token, '/transfer/read-cover', {
        device_id: senderId,
        book_id: cover.book_id,
        sha256: cover.sha256,
        chunk_index: chunkIndex,
      });
      if (
        response.book_id !== cover.book_id ||
        response.sha256 !== cover.sha256 ||
        response.mime_type !== cover.mime_type ||
        response.byte_length !== cover.byte_length ||
        response.chunk_index !== chunkIndex ||
        response.chunk_count !== Math.max(1, Math.ceil(cover.byte_length / TRANSFER_COVER_CHUNK_SIZE)) ||
        !Number.isSafeInteger(response.chunk_count) ||
        typeof response.base64 !== 'string'
      ) {
        throw new Error(`The cover for book ${cover.book_id} changed during transfer.`);
      }
      expectedChunkCount ??= response.chunk_count as number;
      if (expectedChunkCount > 128) {
        throw new Error(`The cover for book ${cover.book_id} exceeds the transfer limit.`);
      }
      const chunkBytes = Buffer.from(response.base64, 'base64');
      const expectedBytes = Math.max(
        0,
        Math.min(
          TRANSFER_COVER_CHUNK_SIZE,
          cover.byte_length - chunkIndex * TRANSFER_COVER_CHUNK_SIZE
        )
      );
      if (
        response.base64.length > 700_000 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(response.base64) ||
        chunkBytes.length !== expectedBytes
      ) {
        throw new Error(`The cover for book ${cover.book_id} returned an invalid chunk.`);
      }
      chunks.push(new Uint8Array(chunkBytes));
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    if (bytes.length !== cover.byte_length) {
      throw new Error(`The cover for book ${cover.book_id} failed its length check.`);
    }
    const uri = await persistLanTransferCover(
      cover.book_id,
      new Uint8Array(bytes),
      cover.mime_type,
      cover.sha256
    );
    coverChanges.push({ book_id: cover.book_id, uri });
    incomingCoverIds.add(cover.book_id);
  }

  for (const cover of localManifest.covers) {
    const remoteBook = remoteBookRecords.get(cover.book_id);
    const localBook = localBookRecords.get(cover.book_id);
    if (
      remoteBook &&
      isTransferVersionAuthoritative(
        remoteBook,
        localBook,
        remoteManifest.device_id
      ) &&
      !remoteCovers.has(cover.book_id) &&
      !incomingCoverIds.has(cover.book_id)
    ) {
      coverChanges.push({ book_id: cover.book_id, uri: null });
    }
  }

  const counts = { books: 0, members: 0, transactions: 0, covers: coverChanges.length };
  for (const event of events) {
    if (event.entity === 'books') counts.books += 1;
    if (event.entity === 'profiles') counts.members += 1;
    if (event.entity === 'borrowings') counts.transactions += 1;
  }
  let backupName = '';
  if (events.length || coverChanges.length) {
    onProgress?.('Creating the sender safety backup and verifying return changes…');
    const applied = await applyLanTransfer(events, coverChanges, createLocalId());
    backupName = applied.backupName;
  }
  return { ...counts, backupName };
}

export async function compareLanPeerLibrary(
  address: string,
  token: string,
  targetDeviceId: string,
  targetDeviceName: string
): Promise<LanTransferComparison> {
  const { plan } = await getRemoteTransferPlan(address, token, targetDeviceId);
  return {
    device_id: targetDeviceId,
    device_name: targetDeviceName,
    counts: plan.counts,
    estimatedBytes: plan.estimatedBytes,
  };
}

export async function transferLibraryToLanPeer(
  address: string,
  token: string,
  targetDeviceId: string,
  onProgress?: (message: string) => void
): Promise<{
  books: number;
  members: number;
  transactions: number;
  covers: number;
  backupName: string;
}> {
  assertToken(token);
  const { manifest, plan } = await getRemoteTransferPlan(address, token, targetDeviceId);
  const senderId = await getLocalDeviceId();
  if (plan.events.length === 0 && plan.covers.length === 0) {
    outgoingTransferSessions.delete(`${targetDeviceId}:${address}`);
    onProgress?.('Checking for newer changes on the receiving device…');
    const reverseCounts = await applyReverseTransferChanges(
      address,
      token,
      senderId,
      manifest,
      onProgress
    );
    if (
      reverseCounts.books + reverseCounts.members +
      reverseCounts.transactions + reverseCounts.covers === 0
    ) {
      onProgress?.('Libraries are already up to date.');
    }
    return {
      ...reverseCounts,
    };
  }

  const sessionKey = `${targetDeviceId}:${address}`;
  const fingerprint = getLanTransferFingerprint(plan);
  let session = outgoingTransferSessions.get(sessionKey);
  if (!session || session.fingerprint !== fingerprint) {
    session = { transferId: createLocalId(), fingerprint };
    outgoingTransferSessions.set(sessionKey, session);
    if (outgoingTransferSessions.size > 8) {
      const oldest = outgoingTransferSessions.keys().next().value;
      if (oldest) outgoingTransferSessions.delete(oldest);
    }
  }
  const transferId = session.transferId;
  const eventBatchCount = Math.ceil(plan.events.length / TRANSFER_EVENT_BATCH_SIZE);
  onProgress?.('Preparing the verified transfer…');
  const start = await requestTransferPeer(address, token, '/transfer/start', {
    device_id: senderId,
    transfer_id: transferId,
    plan_fingerprint: fingerprint,
    event_count: plan.events.length,
    batch_count: eventBatchCount,
    covers: plan.covers.map((cover) => ({
      book_id: cover.book_id,
      sha256: cover.sha256,
      mime_type: cover.mime_type,
      byte_length: cover.bytes?.length ?? 0,
    })),
  });
  if (start.accepted !== true) {
    throw new Error('The receiving device did not accept the transfer plan.');
  }
  if (
    !Array.isArray(start.received_batches) ||
    !start.received_batches.every((index) =>
      Number.isSafeInteger(index) && index >= 0 && index < eventBatchCount
    ) ||
    !Array.isArray(start.completed_covers) ||
    !start.completed_covers.every((bookId) => typeof bookId === 'string')
  ) {
    throw new Error('The receiving device returned invalid transfer-resume state.');
  }
  const receivedBatches = new Set(start.received_batches as number[]);
  const completedCovers = new Set(start.completed_covers as string[]);
  const planCoverIds = new Set(plan.covers.map((cover) => cover.book_id));
  if ([...completedCovers].some((bookId) => !planCoverIds.has(bookId))) {
    throw new Error('The receiving device returned an unexpected completed cover.');
  }
  let activeCover: { book_id: string; next_chunk: number } | null = null;
  if (start.active_cover !== null && start.active_cover !== undefined) {
    const active = start.active_cover as Record<string, unknown>;
    if (
      !active ||
      typeof active !== 'object' ||
      Array.isArray(active) ||
      typeof active.book_id !== 'string' ||
      !Number.isSafeInteger(active.next_chunk)
    ) {
      throw new Error('The receiving device returned invalid cover-resume state.');
    }
    activeCover = {
      book_id: active.book_id,
      next_chunk: active.next_chunk as number,
    };
    if (!planCoverIds.has(activeCover.book_id)) {
      throw new Error('The receiving device returned an unexpected active cover.');
    }
  }
  onProgress?.(
    start.resumed === true
      ? 'Resuming the interrupted transfer…'
      : 'Transferring the compared library changes…'
  );

  for (let index = 0; index < eventBatchCount; index += 1) {
    if (receivedBatches.has(index)) continue;
    const events = plan.events.slice(
      index * TRANSFER_EVENT_BATCH_SIZE,
      (index + 1) * TRANSFER_EVENT_BATCH_SIZE
    );
    await requestTransferPeer(address, token, '/transfer/events', {
      device_id: senderId,
      transfer_id: transferId,
      batch_index: index,
      batch_count: eventBatchCount,
      events,
    });
    onProgress?.(`Transferring records ${Math.min((index + 1) * TRANSFER_EVENT_BATCH_SIZE, plan.events.length).toLocaleString()} of ${plan.events.length.toLocaleString()}…`);
  }

  for (const [coverIndex, cover] of plan.covers.entries()) {
    if (completedCovers.has(cover.book_id)) continue;
    if (!cover.bytes || !cover.sha256 || !cover.mime_type) continue;
    const chunkCount = Math.max(1, Math.ceil(cover.bytes.length / TRANSFER_COVER_CHUNK_SIZE));
    const firstChunk = activeCover?.book_id === cover.book_id
      ? activeCover.next_chunk
      : 0;
    if (
      (activeCover && activeCover.book_id !== cover.book_id && !completedCovers.has(activeCover.book_id)) ||
      firstChunk < 0 ||
      firstChunk > chunkCount ||
      (activeCover?.book_id === cover.book_id && firstChunk >= chunkCount)
    ) {
      throw new Error('The receiving device returned inconsistent cover-resume state.');
    }
    for (let chunkIndex = firstChunk; chunkIndex < chunkCount; chunkIndex += 1) {
      const startOffset = chunkIndex * TRANSFER_COVER_CHUNK_SIZE;
      const chunk = cover.bytes.subarray(
        startOffset,
        Math.min(startOffset + TRANSFER_COVER_CHUNK_SIZE, cover.bytes.length)
      );
      await requestTransferPeer(address, token, '/transfer/cover-chunk', {
        device_id: senderId,
        transfer_id: transferId,
        book_id: cover.book_id,
        sha256: cover.sha256,
        mime_type: cover.mime_type,
        byte_length: cover.bytes.length,
        chunk_index: chunkIndex,
        chunk_count: chunkCount,
        base64: Buffer.from(chunk).toString('base64'),
      });
    }
    onProgress?.(`Transferring cover images ${coverIndex + 1} of ${plan.covers.length}…`);
  }

  onProgress?.('Creating the receiver safety backup and verifying received data…');
  const committed = await requestTransferPeer(address, token, '/transfer/commit', {
    device_id: senderId,
    transfer_id: transferId,
  });
  if (committed.verified !== true || typeof committed.backup_name !== 'string') {
    throw new Error('The receiving device could not verify the transferred library.');
  }
  outgoingTransferSessions.delete(sessionKey);

  onProgress?.('Checking for newer changes on the receiving device…');
  const finalManifest = await requestTransferPeer(
    address,
    token,
    '/transfer/manifest',
    { device_id: senderId }
  );
  if (
    finalManifest.device_id !== targetDeviceId ||
    !finalManifest.manifest ||
    typeof finalManifest.manifest !== 'object'
  ) {
    throw new Error('The receiving device returned an invalid final library manifest.');
  }
  const reverseCounts = await applyReverseTransferChanges(
    address,
    token,
    senderId,
    finalManifest.manifest as LanTransferManifest,
    onProgress
  );
  await recordLanTransferSent(plan.counts);
  return {
    books: plan.counts.books + reverseCounts.books,
    members: plan.counts.members + reverseCounts.members,
    transactions: plan.counts.transactions + reverseCounts.transactions,
    covers: plan.counts.covers + reverseCounts.covers,
    backupName: reverseCounts.backupName
      ? `Receiver: ${committed.backup_name}; Sender: ${reverseCounts.backupName}`
      : `Receiver: ${committed.backup_name}`,
  };
}

export async function forgetLanPeer(
  address: string,
  token: string,
  expectedPeerId: string,
  localDeviceId: string
): Promise<void> {
  assertToken(token);
  if (!localDeviceId) {
    throw new Error('The local device identity is unavailable.');
  }
  const deviceId = await getLocalDeviceId();
  if (localDeviceId !== deviceId) {
    throw new Error('The local device identity changed. Refresh and retry.');
  }
  const response = await requestPeer(
    address,
    token,
    {
      version: 2,
      device_id: deviceId,
      device_name: `Library device ${deviceId.slice(-4)}`,
      events: [],
      host_cursor: 0,
      include_peers: false,
      pairing_code: await getLocalLanPairingCode(),
    },
    '/unpair'
  );
  if (response.device_id !== expectedPeerId) {
    throw new Error('The saved paired device did not match the device response.');
  }
  await unregisterLanPeer(expectedPeerId);
  await removeLanPairing(expectedPeerId);
}

export async function runLanSyncSelfTest(token: string): Promise<number> {
  assertToken(token);
  if (!isLanSyncServerRunning()) {
    await startLanSyncServer(token);
  } else {
    runningToken = token;
  }
  const deviceId = await getLocalDeviceId();
  const response = await requestPeer(`127.0.0.1:${activeSyncPort}`, token, {
    version: 2,
    device_id: deviceId,
    device_name: `Library device ${deviceId.slice(-4)}`,
    events: [],
    host_cursor: 0,
    include_peers: true,
  });
  if (response.device_id !== deviceId) {
    throw new Error('The LAN self-test reached a different Library device.');
  }
  return response.peers.length;
}
