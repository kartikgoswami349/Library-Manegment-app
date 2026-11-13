import {
  compareLanPeerLibrary as compareNativeLanPeerLibrary,
  configureLanTransferRequestTransport,
  configureR58RequestTransport,
  handleDesktopLanRequest,
  pairWithR58Peer as pairNativeR58Peer,
  forgetR58Peer as forgetNativeR58Peer,
  syncWithR58Peer as syncNativeR58Peer,
  transferLibraryToLanPeer as transferNativeLibraryToLanPeer,
  SYNC_PORT,
  R58_PORT,
  type LanTransferComparison,
  type NearbyLanDevice,
} from './lan-sync.native';

export { SYNC_PORT, R58_PORT };
import { handleR58Request, type R58Packet } from './r58-protocol';
import type { LanPairing } from './lan-pairing';
import {
  applyRemoteSyncEvents,
  getLocalDeviceId,
  getLocalSyncEventsForPeer,
  markLocalSyncEventsSyncedForPeer,
  savePairedLanPeers,
  unregisterLanPeer,
  type LanPeer,
  type SyncEvent,
} from './local-database';
import {
  getLanPairing,
  getLanPairings,
  getLanPairingState,
  getLocalLanPairingCode,
  removeLanPairing,
  saveLanPairing,
} from './lan-pairing';

let desktopServerRunning = false;
let desktopServerToken: string | null = null;
let removeLanRequestListener: (() => void) | null = null;
let removeR58RequestListener: (() => void) | null = null;

function getDesktopApi() {
  if (typeof window === 'undefined' || !window.libraryDesktop?.isElectron) {
    return null;
  }
  return window.libraryDesktop;
}

export function isDesktopLanAvailable(): boolean {
  return Boolean(getDesktopApi());
}

export async function discoverNearbyLanDevices(): Promise<NearbyLanDevice[]> {
  const desktop = getDesktopApi();
  if (!desktop) {
    throw new Error('LAN device discovery is available in the iOS, Android, and Electron apps.');
  }
  const [devices, localDeviceId, existingPairings] = await Promise.all([
    desktop.discoverLanDevices(),
    getLocalDeviceId(),
    getLanPairings().catch(() => []),
  ]);
  const filtered = devices.filter((device) => device.device_id !== localDeviceId);
  for (const dev of filtered) {
    const match = existingPairings.find((p) => p.device_id === dev.device_id);
    if (match && dev.r58_address && match.r58_address !== dev.r58_address) {
      void saveLanPairing({
        ...match,
        r58_address: dev.r58_address,
        address: dev.address,
      }).catch((err: unknown) => {
        console.warn('Unable to refresh paired device address from discovery:', err);
      });
    }
  }
  return filtered;
}

export async function forgetLanPeer(
  address: string,
  token: string,
  expectedPeerId: string,
  localDeviceId: string
): Promise<void> {
  const desktop = getDesktopApi();
  if (!desktop) throw new Error('LAN device pairing requires the Electron desktop app.');
  const deviceId = await getLocalDeviceId();
  const actualDeviceId = await getLocalDeviceId();
  if (localDeviceId !== actualDeviceId) {
    throw new Error('The local device identity changed. Refresh and retry.');
  }
  const response = await desktop.lanRequest({
    address,
    token,
    path: '/unpair',
    request: {
      version: 2,
      device_id: deviceId,
      device_name: `Library desktop ${deviceId.slice(-4)}`,
      events: [],
      host_cursor: 0,
      include_peers: false,
      pairing_code: await getLocalLanPairingCode(),
    },
  });
  if (response.device_id !== expectedPeerId) {
    throw new Error('The saved paired device did not match the device response.');
  }
  await unregisterLanPeer(expectedPeerId);
  await removeLanPairing(expectedPeerId);
}

export async function probeDirectLanDevice(ip: string): Promise<NearbyLanDevice | null> {
  const desktop = getDesktopApi();
  if (!desktop || typeof (desktop as unknown as { probeLanDevice?: (ip: string) => Promise<NearbyLanDevice | null> }).probeLanDevice !== 'function') {
    return null;
  }
  return (desktop as unknown as { probeLanDevice: (ip: string) => Promise<NearbyLanDevice | null> }).probeLanDevice(ip);
}

export async function runLanSyncSelfTest(token: string): Promise<number> {
  const desktop = getDesktopApi();
  if (!desktop) throw new Error('LAN sync requires the Electron desktop app.');
  const pairingCode = await getLocalLanPairingCode();
  if (token !== pairingCode) {
    throw new Error('The LAN self-test code does not match this device.');
  }
  const deviceId = await getLocalDeviceId();
  let port = 45831;
  if (!isLanSyncServerRunning()) {
    port = await startLanSyncServer(pairingCode).catch(() => 45831);
  }
  let response: { peers?: unknown[] } | null = null;
  let lastError: Error | null = null;
  for (const candidatePort of [port, 45831, 45832]) {
    try {
      response = await desktop.lanRequest({
        address: `127.0.0.1:${candidatePort}`,
        token: pairingCode,
        request: {
          version: 2,
          device_id: deviceId,
          device_name: `Library desktop ${deviceId.slice(-4)}`,
          events: [],
          host_cursor: 0,
          include_peers: true,
          pairing_code: pairingCode,
        },
      });
      if (response) break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  if (!response) {
    throw lastError || new Error('LAN self-test could not reach the local sync server.');
  }
  return Array.isArray(response.peers) ? response.peers.length : 0;
}

export async function startLanSyncServer(
  token: string
): Promise<number> {
  const desktop = getDesktopApi();
  if (!desktop) throw new Error('LAN sync requires the Electron desktop app.');
  if (desktopServerToken && desktopServerToken !== token && desktopServerRunning) {
    throw new Error('The desktop transfer listener is already running with another pairing code.');
  }
  if (!removeLanRequestListener) {
    removeLanRequestListener = desktop.onLanTransferRequest((request) =>
      handleDesktopLanRequest(request.path, request.body, request.peer_address)
    );
  }
  if (!removeR58RequestListener) {
    removeR58RequestListener = desktop.onR58Request((request) =>
      handleR58Request(request.packet, request.peer_address) as Promise<R58Packet>
    );
  }
  const [deviceId, pairedPeers, pairingState] = await Promise.all([
    getLocalDeviceId(),
    getLanPairings(),
    getLanPairingState().catch(() => null),
  ]);
  const port = await desktop.startLanTransferServer({
    token,
    device_id: deviceId,
    device_name: `Library device ${deviceId.slice(-4)}`,
    paired_devices: pairedPeers.length,
    r58_token: pairingState?.r58_pairing_code,
    r58_expires_at: pairingState?.r58_pairing_expires_at,
  });
  desktopServerToken = token;
  desktopServerRunning = true;
  return port;
}

export function isLanSyncServerRunning(): boolean {
  return desktopServerRunning;
}

export async function stopLanSyncServer(): Promise<void> {
  const desktop = getDesktopApi();
  if (!desktop) return;
  try {
    await desktop.stopLanTransferServer();
  } finally {
    desktopServerRunning = false;
    desktopServerToken = null;
    removeLanRequestListener?.();
    removeLanRequestListener = null;
    removeR58RequestListener?.();
    removeR58RequestListener = null;
  }
}

function configureR58DesktopTransport(): void {
  const desktop = getDesktopApi();
  if (!desktop) {
    throw new Error('R58 LAN sync requires the Electron desktop app.');
  }
  configureR58RequestTransport(async (address, packet) =>
    desktop.r58Request({
      address,
      packet: packet as unknown as Record<string, unknown>,
    }) as Promise<R58Packet>
  );
}

export async function pairWithR58Peer(
  device: NearbyLanDevice,
  pairingCode: string
): Promise<{ pairing: LanPairing }> {
  configureR58DesktopTransport();
  return pairNativeR58Peer(device, pairingCode);
}

export async function syncWithR58Peer(
  pairing: LanPairing
): Promise<{ sent: number; received: number; pairing: LanPairing }> {
  configureR58DesktopTransport();
  return syncNativeR58Peer(pairing);
}

export async function forgetR58Peer(pairing: LanPairing): Promise<void> {
  configureR58DesktopTransport();
  await forgetNativeR58Peer(pairing);
}

export async function compareLanPeerLibrary(
  address: string,
  token: string,
  targetDeviceId: string,
  targetDeviceName: string
): Promise<LanTransferComparison> {
  const desktop = getDesktopApi();
  if (!desktop) throw new Error('Direct LAN library transfer requires a native or Electron app.');
  configureLanTransferRequestTransport(async (peerAddress, peerToken, path, request) =>
    desktop.lanRequest({
      address: peerAddress,
      token: peerToken,
      path,
      request,
    }) as Promise<Record<string, unknown>>
  );
  return compareNativeLanPeerLibrary(address, token, targetDeviceId, targetDeviceName);
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
  const desktop = getDesktopApi();
  if (!desktop) throw new Error('Direct LAN library transfer requires a native or Electron app.');
  configureLanTransferRequestTransport(async (peerAddress, peerToken, path, request) =>
    desktop.lanRequest({
      address: peerAddress,
      token: peerToken,
      path,
      request,
    }) as Promise<Record<string, unknown>>
  );
  return transferNativeLibraryToLanPeer(address, token, targetDeviceId, onProgress);
}

export async function syncWithLanPeer(
  address: string,
  token: string,
  initialHostCursor = 0,
  includePeers = true,
  peerDeviceId?: string
): Promise<{
  sent: number;
  received: number;
  peers: LanPeer[];
  host_cursor: number;
}> {
  const desktop = getDesktopApi();
  if (!desktop) {
    throw new Error('LAN sync is available in the iOS and Android apps only.');
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
    const response = await desktop.lanRequest({
      address,
      token,
      request: {
        version: 2,
        device_id: deviceId,
        device_name: `Library desktop ${deviceId.slice(-4)}`,
        events,
        host_cursor: hostCursor,
        include_peers: includePeers && sent === 0 && received === 0,
        pairing_code: pairingCode,
      },
    });
    const remoteEvents = response.events as SyncEvent[];
    await applyRemoteSyncEvents(remoteEvents);
    await markLocalSyncEventsSyncedForPeer(
      targetDeviceId,
      events.map((event) => event.id)
    );
    if (response.peers.length > 0) {
      peers = response.peers as LanPeer[];
      await savePairedLanPeers(peers);
    }
    sent += events.length;
    received += remoteEvents.length;
    hasMore = response.has_more;
    hostCursor = response.host_cursor;
    hasOutgoing = (await getLocalSyncEventsForPeer(targetDeviceId)).length > 0;
  }

  return { sent, received, peers, host_cursor: hostCursor };
}
