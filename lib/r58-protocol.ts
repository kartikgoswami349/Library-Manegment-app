import * as Crypto from 'expo-crypto';

import {
  applyRemoteSyncEvents,
  getLocalDeviceId,
  getLocalSyncEventsForPeer,
  markLocalSyncEventsSyncedForPeer,
  registerLanPeer,
  unregisterLanPeer,
  type SyncEvent,
} from './local-database';
import {
  clearTemporaryR58PairingCode,
  getLanPairing,
  getLocalLanPairingCode,
  isCurrentTemporaryR58PairingCode,
  removeLanPairing,
  saveLanPairing,
  type LanPairing,
} from './lan-pairing';
import {
  createR58RequestQueue,
  dispatchR58Request,
} from './r58-request-queue';
import { DEFAULT_BATCH_SIZE } from './r58-sync-engine';

const enqueueR58Request = createR58RequestQueue();

export type R58Entity = 'items' | 'departments' | 'people' | 'transactions' | 'audits';
export type R58Direction = 'REQUEST' | 'RESPONSE';

export type R58Record = {
  entity: R58Entity;
  id: string;
  revision: number;
  modifiedAt: string;
  modifiedBy: string;
  data: SyncEvent;
};

export type R58Packet = {
  version: 1;
  packetId: string;
  sourceDevice: {
    id: string;
    name: string;
  };
  direction: R58Direction;
  type: 'pair' | 'sync' | 'unpair' | 'discover';
  auth: string;
  status?: 'ok' | 'error';
  error?: string;
  syncPort?: number;
  r58Port?: number;
  pairingCode?: string;
  legacyPairingCode?: string;
  sharedSecret?: string;
  acknowledgeEventIds?: string[];
  records: R58Record[];
};

export async function makeR58Auth(
  sharedSecret: string,
  packetId: string,
  direction: R58Direction
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${sharedSecret}:${packetId}:${direction}`
  );
}

export function matchesR58Auth(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string' || !/^[a-f0-9]{64}$/i.test(actual)) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

export function toR58Records(events: SyncEvent[]): R58Record[] {
  const records: R58Record[] = [];
  for (const source of events) {
    const event = { ...source, revision: source.revision ?? 1 };
    const entity =
      event.entity === 'books'
        ? 'items'
        : event.entity === 'profiles'
          ? 'people'
          : 'transactions';
    const record = {
      revision: event.revision,
      modifiedAt: event.changed_at,
      modifiedBy: event.device_id,
      data: event,
    };
    records.push({ ...record, id: event.entity_id, entity });
    records.push({ ...record, id: event.id, entity: 'audits' });
  }
  return records;
}

export function eventsFromR58Records(records: unknown): SyncEvent[] {
  if (!Array.isArray(records)) throw new Error('The peer sent an invalid record list.');
  const events = new Map<string, SyncEvent>();
  for (const value of records) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('The peer sent an invalid sync record.');
    }
    const record = value as Partial<R58Record>;
    if (
      !['items', 'departments', 'people', 'transactions', 'audits'].includes(
        String(record.entity)
      ) ||
      typeof record.id !== 'string' ||
      !Number.isSafeInteger(record.revision) ||
      (record.revision ?? 0) < 1 ||
      typeof record.modifiedAt !== 'string' ||
      !Number.isFinite(Date.parse(record.modifiedAt)) ||
      typeof record.modifiedBy !== 'string'
    ) {
      throw new Error('The peer sent a malformed sync record.');
    }
    if (record.entity === 'departments') {
      // Gracefully skip department records without breaking synchronization
      continue;
    }
    if (!record.data || typeof record.data !== 'object') {
      throw new Error('The peer sent a sync record without event data.');
    }
    const event = record.data as Partial<SyncEvent>;
    const mappedEntity =
      record.entity === 'items'
        ? 'books'
        : record.entity === 'people'
          ? 'profiles'
          : record.entity === 'transactions'
            ? 'borrowings'
            : null;

    let normalizedEntity: SyncEvent['entity'];
    if (event.entity === 'books' || event.entity === 'profiles' || event.entity === 'borrowings') {
      normalizedEntity = event.entity;
    } else if (mappedEntity) {
      normalizedEntity = mappedEntity;
    } else {
      continue;
    }

    const eventId = event.id || record.id || '';
    const entityId = event.entity_id || (record.entity === 'audits' ? event.entity_id || record.id : record.id) || '';
    const payload = typeof event.payload === 'string'
      ? event.payload
      : JSON.stringify(event.payload ?? record.data ?? {});

    events.set(eventId, {
      id: eventId,
      entity: normalizedEntity,
      entity_id: entityId,
      payload,
      changed_at: record.modifiedAt,
      device_id: record.modifiedBy,
      revision: record.revision,
    });
  }
  return [...events.values()];
}

export function validateR58Request(value: unknown): R58Packet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The peer sent an invalid R58 packet.');
  }
  const packet = value as Partial<R58Packet>;
  const isErrorResponse =
    packet.direction === 'RESPONSE' && packet.status === 'error';
  if (
    packet.version !== 1 ||
    typeof packet.packetId !== 'string' ||
    (!isErrorResponse && !packet.packetId) ||
    !packet.sourceDevice ||
    typeof packet.sourceDevice.id !== 'string' ||
    (!isErrorResponse && !packet.sourceDevice.id) ||
    typeof packet.sourceDevice.name !== 'string' ||
    !['REQUEST', 'RESPONSE'].includes(String(packet.direction)) ||
    !['pair', 'sync', 'unpair', 'discover'].includes(String(packet.type)) ||
    !Array.isArray(packet.records)
  ) {
    throw new Error('The peer sent a malformed R58 packet.');
  }
  return packet as R58Packet;
}

function isValidSecret(secret: unknown): secret is string {
  return typeof secret === 'string' && /^[a-f0-9]{64}$/i.test(secret);
}

function legacyAddress(address: string): string {
  const host = address.replace(/:\d+$/, '');
  return `${host}:45831`;
}

async function responsePacket(
  request: R58Packet,
  localDeviceId: string,
  localDeviceName: string,
  secret: string,
  fields: Partial<R58Packet> = {}
): Promise<R58Packet> {
  return {
    version: 1,
    packetId: request.packetId,
    sourceDevice: { id: localDeviceId, name: localDeviceName },
    direction: 'RESPONSE',
    type: request.type,
    auth: await makeR58Auth(secret, request.packetId, 'RESPONSE'),
    status: 'ok',
    records: [],
    ...fields,
  };
}

async function processR58Request(
  request: R58Packet,
  peerAddress: string
): Promise<R58Packet> {
  if (request.direction !== 'REQUEST') {
    throw new Error('The peer packet must be a request.');
  }
  const localDeviceId = await getLocalDeviceId();
  if (request.sourceDevice.id === localDeviceId) {
    throw new Error('A device cannot sync with itself.');
  }
  const localDeviceName = `Library device ${localDeviceId.slice(-4)}`;

  if (request.type === 'discover') {
    return responsePacket(request, localDeviceId, localDeviceName, '', { status: 'ok' });
  }

  if (request.type === 'pair') {
    const pairingCode = request.pairingCode;
    const isTempValid = pairingCode && (await isCurrentTemporaryR58PairingCode(pairingCode));
    const isLocalValid = pairingCode && pairingCode === (await getLocalLanPairingCode());
    if (
      !pairingCode ||
      !/^\d{6}$/.test(pairingCode) ||
      (!isTempValid && !isLocalValid)
    ) {
      throw new Error('The six-digit pairing code has expired or is invalid. Ask the other device for its current code.');
    }
    const expectedAuth = await makeR58Auth(pairingCode, request.packetId, 'REQUEST');
    if (!matchesR58Auth(request.auth, expectedAuth)) {
      throw new Error('The R58 pairing authentication failed.');
    }
    if (!isValidSecret(request.sharedSecret)) {
      throw new Error('The peer did not provide a valid shared sync secret.');
    }
    const pairing: LanPairing = {
      device_id: request.sourceDevice.id,
      device_name: request.sourceDevice.name.slice(0, 40),
      address: legacyAddress(peerAddress),
      r58_address: peerAddress,
      password: request.sharedSecret,
      legacy_password: request.legacyPairingCode || '',
      protocol_version: 1,
      host_cursor: 0,
    };
    await saveLanPairing(pairing);
    await registerLanPeer(
      pairing.device_id,
      pairing.device_name,
      pairing.address
    );
    if (isTempValid) {
      await clearTemporaryR58PairingCode();
    }
    return responsePacket(
      request,
      localDeviceId,
      localDeviceName,
      pairingCode,
      { legacyPairingCode: await getLocalLanPairingCode() }
    );
  }

  const pairing = await getLanPairing(request.sourceDevice.id);
  if (!pairing || pairing.protocol_version !== 1 || !isValidSecret(pairing.password)) {
    throw new Error('This device is not trusted. Pair it with its current six-digit code first.');
  }
  const expectedAuth = await makeR58Auth(pairing.password, request.packetId, 'REQUEST');
  if (!matchesR58Auth(request.auth, expectedAuth)) {
    throw new Error('The trusted-device authentication failed.');
  }
  // Automatically update the connection address when a trusted peer connects from a new IP
  if (pairing.r58_address !== peerAddress) {
    await saveLanPairing({
      ...pairing,
      r58_address: peerAddress,
      address: legacyAddress(peerAddress),
    });
  }
  if (request.type === 'unpair') {
    await unregisterLanPeer(request.sourceDevice.id);
    await removeLanPairing(request.sourceDevice.id);
    return responsePacket(request, localDeviceId, localDeviceName, pairing.password);
  }
  if (request.acknowledgeEventIds?.length) {
    if (
      request.acknowledgeEventIds.length > 500 ||
      !request.acknowledgeEventIds.every((eventId) => typeof eventId === 'string')
    ) {
      throw new Error('The peer sent an invalid sync acknowledgment list.');
    }
    await markLocalSyncEventsSyncedForPeer(
      request.sourceDevice.id,
      request.acknowledgeEventIds
    );
  }
  const incomingEvents = eventsFromR58Records(request.records);
  await applyRemoteSyncEvents(incomingEvents);
  const outgoingEvents = (
    await getLocalSyncEventsForPeer(request.sourceDevice.id)
  ).slice(0, DEFAULT_BATCH_SIZE);
  const response = await responsePacket(
    request,
    localDeviceId,
    localDeviceName,
    pairing.password,
    {
      records: toR58Records(outgoingEvents),
    }
  );
  await registerLanPeer(
    request.sourceDevice.id,
    request.sourceDevice.name.slice(0, 40),
    legacyAddress(peerAddress)
  );
  return response;
}

export function handleR58Request(
  value: unknown,
  peerAddress: string
): Promise<R58Packet> {
  const request = validateR58Request(value);
  return dispatchR58Request(
    enqueueR58Request,
    request.type,
    () => processR58Request(request, peerAddress)
  );
}

export function getR58ResponseEvents(records: unknown): SyncEvent[] {
  return eventsFromR58Records(records);
}
