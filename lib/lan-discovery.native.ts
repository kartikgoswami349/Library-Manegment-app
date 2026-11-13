import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { NativeModules, Platform } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import {
  getIpv4HostCandidates,
  getR58ZeroconfOptions,
  isR58DiscoveryResponse,
  resolveR58Service,
} from './lan-discovery-utils';
import { decodeUtf8, destroySocketWhenConnected } from './r58-socket-utils';
import { getTcpSocket, requestR58Packet } from './r58-tcp-transport.native';
import type { R58Packet } from './r58-protocol';

const PRIMARY_SYNC_PORT = 45831;
const FALLBACK_SYNC_PORT = 45832;
const THIRD_SYNC_PORT = 45833;
const PRIMARY_R58_PORT = 45858;
const FALLBACK_R58_PORT = 45859;
const THIRD_R58_PORT = 45860;
const DISCOVERY_TIMEOUT_MS = 2_000;
const DISCOVERY_PROBE_TIMEOUT_MS = 1_200;
const SUBNET_PROBE_CONCURRENCY = 16;

export type NearbyLanDevice = {
  device_id: string;
  device_name: string;
  address: string;
  sync_port?: number;
  paired_devices: number;
  protocol_version?: 1;
  r58_address?: string;
};

let zeroconf: Zeroconf | null = null;
let listenersRegistered = false;
let scanning = false;
let localDeviceId = '';
let localDeviceName = '';
let localIpAddress: string | null = null;
let publishedServiceName: string | null = null;
let publishedR58Port: number | null = null;
let publishedSyncPort: number | null = null;
const nearbyDevices = new Map<string, NearbyLanDevice>();
const serviceNamesByDeviceId = new Map<string, string>();

function isZeroconfAvailable(): boolean {
  try {
    return Boolean(NativeModules?.RNZeroconf);
  } catch {
    return false;
  }
}

function addService(service: {
  name?: string;
  host?: string;
  port: number;
  ipv4?: string[];
  addresses?: string[];
  txt?: Record<string, unknown>;
}): void {
  const resolved = resolveR58Service(
    service,
    localIpAddress
      ? [{ address: localIpAddress, netmask: '255.255.255.0' }]
      : []
  );
  if (!resolved || resolved.device_id === localDeviceId) return;

  nearbyDevices.set(resolved.device_id, {
    device_id: resolved.device_id,
    device_name: resolved.device_name,
    address: `${resolved.address}:${resolved.sync_port || PRIMARY_SYNC_PORT}`,
    sync_port: resolved.sync_port ?? undefined,
    r58_address: `${resolved.address}:${resolved.port || PRIMARY_R58_PORT}`,
    paired_devices: 0,
    protocol_version: 1,
  });
  if (resolved.service_name) {
    serviceNamesByDeviceId.set(resolved.device_id, resolved.service_name);
  }
}

function getZeroconf(): Zeroconf | null {
  if (!isZeroconfAvailable()) return null;
  if (!zeroconf) zeroconf = new Zeroconf();
  if (!listenersRegistered) {
    zeroconf.on('resolved', addService);
    zeroconf.on('remove', (serviceName: string) => {
      for (const [deviceId, currentName] of serviceNamesByDeviceId) {
        if (currentName === serviceName) {
          serviceNamesByDeviceId.delete(deviceId);
          nearbyDevices.delete(deviceId);
        }
      }
    });
    zeroconf.on('error', (error: unknown) => {
      console.warn('LAN mDNS discovery error.', error);
    });
    listenersRegistered = true;
  }
  return zeroconf;
}

function startScan(refresh: boolean): Zeroconf | null {
  const discovery = getZeroconf();
  if (!discovery) return null;
  if (scanning) {
    try {
      discovery.stop('DNSSD');
    } catch {
      // ignore
    }
    scanning = false;
  }
  if (refresh) {
    nearbyDevices.clear();
    serviceNamesByDeviceId.clear();
  }
  const options = getR58ZeroconfOptions();
  discovery.scan(options.type, options.protocol, options.domain, options.implType);
  scanning = true;
  return discovery;
}

function safeServiceName(name: string, deviceId: string): string {
  const safeName =
    name.replace(/[^a-zA-Z0-9-_ ]/g, '').trim().slice(0, 30) || 'R58';
  return `R58-${safeName}-${deviceId.slice(-6)}`;
}

export async function startNativeLanDiscovery(
  deviceId: string,
  deviceName: string,
  r58Port = PRIMARY_R58_PORT,
  syncPort = PRIMARY_SYNC_PORT
): Promise<void> {
  localDeviceId = deviceId;
  localDeviceName = deviceName.slice(0, 40);
  if (!isZeroconfAvailable()) {
    return;
  }

  try {
    const discovery = getZeroconf();
    if (!discovery) return;
    localIpAddress = await Network.getIpAddressAsync().catch(() => null);
    const serviceName = safeServiceName(localDeviceName, localDeviceId);
    if (
      publishedServiceName !== serviceName ||
      publishedR58Port !== r58Port ||
      publishedSyncPort !== syncPort
    ) {
      if (publishedServiceName) {
        try {
          await discovery.unpublishService(publishedServiceName);
        } catch {
          // ignore
        }
      }
      const options = getR58ZeroconfOptions();
      const published: unknown = await discovery.publishService(
        options.type,
        options.protocol,
        options.domain,
        serviceName,
        r58Port,
        {
          id: localDeviceId,
          name: localDeviceName,
          deviceId: localDeviceId,
          deviceName: localDeviceName,
          protocol: '1',
          syncPort: String(syncPort),
        },
        options.implType
      );
      publishedServiceName =
        typeof published === 'object' &&
        published !== null &&
        'name' in published &&
        typeof published.name === 'string'
          ? published.name
          : serviceName;
      publishedR58Port = r58Port;
      publishedSyncPort = syncPort;
    }
    startScan(false);
  } catch (error) {
    console.warn('Unable to advertise mobile mDNS service:', error);
  }
}

function waitForMdnsResults(discovery: Zeroconf): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      try {
        Object.values(discovery.getServices()).forEach(addService);
        const elapsed = Date.now() - startedAt;
        if (
          (nearbyDevices.size > 0 && elapsed >= 600) ||
          elapsed >= DISCOVERY_TIMEOUT_MS
        ) {
          clearInterval(timer);
          resolve();
        }
      } catch {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

export async function probeR58Device(
  host: string,
  port = PRIMARY_R58_PORT,
  expectedDeviceId?: string,
  timeoutMs = DISCOVERY_PROBE_TIMEOUT_MS
): Promise<NearbyLanDevice | null> {
  const packetId = Crypto.randomUUID();
  const request: R58Packet = {
    version: 1,
    packetId,
    sourceDevice: {
      id: localDeviceId || 'probe',
      name: localDeviceName || 'Library device',
    },
    direction: 'REQUEST',
    type: 'discover',
    auth: '',
    records: [],
  };
  try {
    const response = await requestR58Packet(`${host}:${port}`, request, {
      connectTimeoutMs: timeoutMs,
      responseTimeoutMs: timeoutMs,
    });
    if (!isR58DiscoveryResponse(response, packetId, expectedDeviceId)) {
      return null;
    }
    const syncPort =
      Number.isSafeInteger(response.syncPort) &&
      response.syncPort! > 0 &&
      response.syncPort! < 65536
        ? response.syncPort!
        : PRIMARY_SYNC_PORT;
    return {
      device_id: response.sourceDevice.id,
      device_name:
        response.sourceDevice.name ||
        `Library Device ${response.sourceDevice.id.slice(-4)}`,
      address: `${host}:${syncPort}`,
      sync_port: syncPort,
      r58_address: `${host}:${port}`,
      paired_devices: 0,
      protocol_version: 1,
    };
  } catch {
    return null;
  }
}

export async function probeLegacyDevice(
  host: string,
  port = PRIMARY_SYNC_PORT,
  timeoutMs = DISCOVERY_PROBE_TIMEOUT_MS
): Promise<NearbyLanDevice | null> {
  return new Promise((resolve) => {
    let completed = false;
    let connected = false;
    let responseBytes = Buffer.alloc(0);
    let socket: ReturnType<ReturnType<typeof getTcpSocket>['createConnection']>;

    const finish = (device: NearbyLanDevice | null) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      try {
        destroySocketWhenConnected(socket, connected);
      } catch {}
      resolve(device);
    };

    const timeout = setTimeout(() => finish(null), timeoutMs);

    try {
      socket = getTcpSocket().createConnection({ host, port, connectTimeout: timeoutMs }, () => {
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
      });
    } catch {
      finish(null);
      return;
    }

    socket.on('data', (chunk) => {
      if (completed) return;
      responseBytes = Buffer.concat([responseBytes, Buffer.from(chunk)]);
      if (responseBytes.length > 8192) {
        finish(null);
        return;
      }
      const headerEnd = responseBytes.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const headers = decodeUtf8(responseBytes, 0, headerEnd);
      const contentLengthLine = headers
        .split('\r\n')
        .find((line) => line.toLowerCase().startsWith('content-length:'));
      const contentLength = Number.parseInt(
        contentLengthLine?.split(':')[1]?.trim() ?? '',
        10
      );
      const bodyStart = headerEnd + 4;
      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength < 0 ||
        contentLength > 4096
      ) {
        finish(null);
        return;
      }
      if (responseBytes.length < bodyStart + contentLength) return;
      try {
        const body = JSON.parse(
          decodeUtf8(responseBytes, bodyStart, bodyStart + contentLength)
        ) as {
          version?: number;
          device_id?: string;
          device_name?: string;
          paired_devices?: number;
          r58_port?: number;
          sync_port?: number;
        };
        if (
          headers.split('\r\n')[0]?.includes(' 200 ') &&
          body.version === 1 &&
          typeof body.device_id === 'string' &&
          typeof body.device_name === 'string'
        ) {
          const syncPort =
            Number.isSafeInteger(body.sync_port) &&
            body.sync_port! > 0 &&
            body.sync_port! < 65536
              ? body.sync_port!
              : port;
          const r58Port =
            Number.isSafeInteger(body.r58_port) &&
            body.r58_port! > 0 &&
            body.r58_port! < 65536
              ? body.r58_port!
              : PRIMARY_R58_PORT;
          finish({
            device_id: body.device_id,
            device_name: body.device_name,
            address: `${host}:${syncPort}`,
            sync_port: syncPort,
            r58_address: `${host}:${r58Port}`,
            paired_devices:
              typeof body.paired_devices === 'number' &&
              Number.isSafeInteger(body.paired_devices) &&
              body.paired_devices >= 0
                ? body.paired_devices
                : 0,
            protocol_version: 1,
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

export async function probeHostComprehensively(
  host: string
): Promise<NearbyLanDevice | null> {
  if (!host) return null;
  // Prefer the current protocol before trying legacy sync endpoints.
  const r1 = await probeR58Device(host, PRIMARY_R58_PORT);
  if (r1) return r1;
  const r2 = await probeR58Device(host, FALLBACK_R58_PORT);
  if (r2) return r2;
  const r3 = await probeR58Device(host, THIRD_R58_PORT);
  if (r3) return r3;
  const s1 = await probeLegacyDevice(host, PRIMARY_SYNC_PORT);
  if (s1) return s1;
  const s2 = await probeLegacyDevice(host, FALLBACK_SYNC_PORT);
  if (s2) return s2;
  return probeLegacyDevice(host, THIRD_SYNC_PORT);
}

export async function probeDirectNativeDevice(
  ipOrAddress: string
): Promise<NearbyLanDevice | null> {
  const raw = ipOrAddress.trim().replace(/^(?:https?|tcp):\/\//i, '');
  const separator = raw.lastIndexOf(':');
  const host = separator > raw.lastIndexOf(']') ? raw.slice(0, separator) : raw;
  const explicitPort = separator > raw.lastIndexOf(']')
    ? Number.parseInt(raw.slice(separator + 1), 10)
    : null;

  if (explicitPort) {
    const s = await probeLegacyDevice(host, explicitPort, 2000);
    if (s) return s;
    const r = await probeR58Device(host, explicitPort, undefined, 2000);
    if (r) return r;
  }
  return probeHostComprehensively(host);
}

export async function discoverNativeLanDevices(
  legacyProbe: (address: string) => Promise<NearbyLanDevice | null>
): Promise<NearbyLanDevice[]> {
  const localId = localDeviceId;
  const discovered = new Map<string, NearbyLanDevice>();
  const permissionDenied = { value: false };
  const discovery = startScan(true);

  if (discovery) {
    try {
      if (
        Platform.OS === 'ios' &&
        typeof (discovery as unknown as {
          checkLocalNetworkAccess?: (options: Record<string, unknown>) => Promise<string>;
        }).checkLocalNetworkAccess === 'function'
      ) {
        const checker = (discovery as unknown as {
          checkLocalNetworkAccess: (options: Record<string, unknown>) => Promise<string>;
        }).checkLocalNetworkAccess;
        permissionDenied.value =
          (await checker.call(discovery, {
            ...getR58ZeroconfOptions(),
            timeout: 2,
          })) === 'denied';
      }
      await waitForMdnsResults(discovery);
      const mdnsResults = await Promise.all(
        [...nearbyDevices.entries()]
          .filter(([id]) => id !== localId)
          .map(async ([id, device]) => {
            const separator = device.r58_address?.lastIndexOf(':') ?? -1;
            if (separator <= 0 || !device.r58_address) return null;
            const host = device.r58_address.slice(0, separator);
            const port = Number.parseInt(device.r58_address.slice(separator + 1), 10);
            if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
            const result = await probeR58Device(host, port, id);
            return result
              ? {
                  ...result,
                  address: device.sync_port ? device.address : result.address,
                  sync_port: device.sync_port ?? result.sync_port,
                }
              : null;
          })
      );
      for (const device of mdnsResults) {
        if (device && device.device_id !== localId) {
          discovered.set(device.device_id, device);
        }
      }
      if (discovered.size > 0) {
        return [...discovered.values()];
      }
    } catch (error) {
      console.warn('mDNS discovery warning:', error);
    }
  }

  // Subnet scan (prioritizing neighbors and known devices)
  try {
    const ipAddress = await Network.getIpAddressAsync().catch(() => null);
    localIpAddress = ipAddress;
    if (ipAddress) {
      const hosts = getIpv4HostCandidates(ipAddress);
      for (let offset = 0; offset < hosts.length; offset += SUBNET_PROBE_CONCURRENCY) {
        const batch = hosts.slice(offset, offset + SUBNET_PROBE_CONCURRENCY);
        const results = await Promise.all(batch.map((host) => probeHostComprehensively(host)));
        for (const device of results) {
          if (!device || device.device_id === localId) continue;
          discovered.set(device.device_id, device);
        }
      }
    }
  } catch (err) {
    console.warn('Subnet discovery error:', err);
  }

  if (discovered.size === 0 && permissionDenied.value) {
    throw new Error(
      'Local network access is disabled for Library. Allow it in your device settings, then search again.'
    );
  }

  return [...discovered.values()].filter((dev) => dev.device_id !== localId);
}

export async function stopNativeLanDiscovery(): Promise<void> {
  const active = zeroconf;
  if (active && scanning) {
    try {
      active.stop('DNSSD');
    } catch {
      // ignore
    }
  }
  scanning = false;
  if (active && publishedServiceName) {
    try {
      await active.unpublishService(publishedServiceName);
    } catch {
      // ignore
    }
  }
  try {
    (active as unknown as { removeDeviceListeners?: () => void } | null)
      ?.removeDeviceListeners?.();
  } catch {
    // ignore
  }
  zeroconf = null;
  listenersRegistered = false;
  localDeviceId = '';
  localDeviceName = '';
  localIpAddress = null;
  publishedServiceName = null;
  publishedR58Port = null;
  publishedSyncPort = null;
  nearbyDevices.clear();
  serviceNamesByDeviceId.clear();
}
