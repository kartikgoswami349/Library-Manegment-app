import { Buffer } from 'buffer';
import { NativeModules } from 'react-native';
import type TcpSocket from 'react-native-tcp-socket';
import { validateR58Request, type R58Packet } from './r58-protocol';
import {
  decodeUtf8,
  destroySocketWhenConnected,
  isSocketWritable,
} from './r58-socket-utils';

const MAX_R58_MESSAGE_BYTES = 20 * 1024 * 1024;
const DEFAULT_CONNECT_TIMEOUT_MS = 8_000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 60_000;
const PAIRING_TIMEOUT_MS = 15_000;

type R58RequestOptions = {
  connectTimeoutMs?: number;
  responseTimeoutMs?: number;
};

type R58RequestTransport = (
  address: string,
  packet: R58Packet,
  options?: R58RequestOptions
) => Promise<R58Packet>;

let tcpSocket: typeof TcpSocket | null = null;
let requestTransport: R58RequestTransport | null = null;

export function getTcpSocket(): typeof TcpSocket {
  if (!NativeModules.TcpSockets) {
    throw new Error(
      'LAN sync requires an iOS or Android development build with the TCP socket module installed.'
    );
  }
  if (!tcpSocket) {
    // Load the native module only after verifying it exists in the current runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tcpSocket = require('react-native-tcp-socket') as typeof TcpSocket;
  }
  return tcpSocket;
}

function parsePeerAddress(address: string): { host: string; port: number } {
  const normalized = address.trim().replace(/^(?:https?|tcp):\/\//i, '');
  const separator = normalized.lastIndexOf(':');
  const hasPort = separator > normalized.lastIndexOf(']');
  const host = hasPort ? normalized.slice(0, separator) : normalized;
  const port = hasPort
    ? Number.parseInt(normalized.slice(separator + 1), 10)
    : 45858;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The R58 host address must look like 192.168.1.12:45858.');
  }
  return { host, port };
}

function requestTimeouts(
  packet: R58Packet,
  options: R58RequestOptions
): { connectTimeoutMs: number; responseTimeoutMs: number } {
  const pairingResponseTimeout =
    packet.type === 'pair' || packet.type === 'unpair'
      ? PAIRING_TIMEOUT_MS
      : DEFAULT_RESPONSE_TIMEOUT_MS;
  return {
    connectTimeoutMs: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    responseTimeoutMs: options.responseTimeoutMs ?? pairingResponseTimeout,
  };
}

function requestR58Peer(
  address: string,
  packet: R58Packet,
  options: R58RequestOptions = {}
): Promise<R58Packet> {
  const { host, port } = parsePeerAddress(address);
  const timeouts = requestTimeouts(packet, options);
  const payload = Buffer.from(`${JSON.stringify(packet)}\n`, 'utf8');
  if (payload.length > MAX_R58_MESSAGE_BYTES) {
    return Promise.reject(new Error('The R58 request is too large.'));
  }

  return new Promise((resolve, reject) => {
    const socket = getTcpSocket().createConnection({
      host,
      port,
      reuseAddress: true,
      connectTimeout: timeouts.connectTimeoutMs,
    }, () => undefined);
    let responseBytes = Buffer.alloc(0);
    let completed = false;
    let connectionClosed = false;
    let connected = false;
    let responseTimer: ReturnType<typeof setTimeout> | null = null;

    const connectTimer = setTimeout(
      () =>
        finish(
          new Error(
            `Could not connect to ${host}:${port} on TCP port ${port}. Keep the Library app open on the target device and allow inbound TCP port ${port} through its firewall on a trusted private network.`
          )
        ),
      timeouts.connectTimeoutMs
    );

    function finish(error?: Error, response?: R58Packet): void {
      if (completed) return;
      completed = true;
      clearTimeout(connectTimer);
      if (responseTimer) clearTimeout(responseTimer);
      try {
        destroySocketWhenConnected(socket, connected, () => connectionClosed);
      } catch {
        // Request cleanup must not replace the original transport result.
      }
      if (error) reject(error);
      else if (response) resolve(response);
      else reject(new Error('The peer returned an empty R58 response.'));
    }

    socket.setNoDelay(true);
    socket.once('connect', () => {
      connected = true;
      if (completed) {
        try {
          destroySocketWhenConnected(socket, connected, () => connectionClosed);
        } catch {
          // A connection that arrives after its request timed out is discarded.
        }
        return;
      }
      clearTimeout(connectTimer);
      if (connectionClosed || !isSocketWritable(socket, () => connectionClosed)) {
        return;
      }
      responseTimer = setTimeout(
        () =>
          finish(
            new Error(`Timed out waiting for an R58 response from ${host}:${port}.`)
          ),
        timeouts.responseTimeoutMs
      );
      try {
        socket.write(payload, undefined, (error?: Error) => {
          if (error) {
            finish(new Error(`Unable to send the R58 request: ${error.message}`));
          }
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.on('data', (chunk) => {
      if (completed) return;
      responseBytes = Buffer.concat([responseBytes, Buffer.from(chunk)]);
      if (responseBytes.length > MAX_R58_MESSAGE_BYTES) {
        finish(new Error('The R58 peer response is too large.'));
        return;
      }
      const newline = responseBytes.indexOf(0x0a);
      if (newline < 0) return;
      try {
        const response = validateR58Request(
          JSON.parse(decodeUtf8(responseBytes, 0, newline))
        );
        if (response.status === 'error') {
          finish(new Error(response.error || 'The peer rejected the R58 request.'));
        } else {
          finish(undefined, response);
        }
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error('The peer returned an invalid R58 response.')
        );
      }
    });
    socket.on('error', (error) =>
      finish(error instanceof Error ? error : new Error(String(error)))
    );
    socket.on('close', () => {
      connectionClosed = true;
      if (!completed) finish(new Error('The R58 connection closed before a response arrived.'));
    });
  });
}

export function configureR58RequestTransport(
  transport: R58RequestTransport | null
): void {
  requestTransport = transport;
}

export function requestR58Packet(
  address: string,
  packet: R58Packet,
  options: R58RequestOptions = {}
): Promise<R58Packet> {
  return (requestTransport ?? requestR58Peer)(address, packet, options);
}
