import { Platform } from 'react-native';

import {
  discoverNearbyLanDevices,
  isDesktopLanAvailable,
  SYNC_PORT,
  syncWithLanPeer,
  syncWithR58Peer,
  transferLibraryToLanPeer,
} from './lan-sync';
import { registerLanPeer } from './local-database';
import { getLanPairings, saveLanPairing, type LanPairing } from './lan-pairing';
import {
  createDiscoveryCache,
  createPendingLibraryTransfer,
} from './lan-auto-sync-utils';

export type LanPeerSyncResult = {
  sent: number;
  received: number;
  pairing: LanPairing;
};

export type LanSyncReport = {
  sent: number;
  received: number;
  successful: number;
  total: number;
  failures: string[];
};

let syncInFlight: Promise<LanSyncReport | null> | null = null;
const peerSyncInFlight = new Map<string, Promise<LanPeerSyncResult>>();
const getNearbyDevicesForRecovery = createDiscoveryCache(
  discoverNearbyLanDevices,
  60_000
);
const runPendingLibraryTransfer = createPendingLibraryTransfer(
  saveLanPairing,
  async (pairing) => {
    const token =
      pairing.legacy_password ||
      (pairing.protocol_version === undefined ? pairing.password : '');
    if (!/^\d{6}$/.test(token)) {
      throw new Error(
        "The peer's transfer code is unavailable. Re-pair the devices to refresh their saved codes."
      );
    }

    const savedSeparator = pairing.address.lastIndexOf(':');
    const hasSavedPort = savedSeparator > pairing.address.lastIndexOf(']');
    const savedPort = hasSavedPort
      ? Number.parseInt(pairing.address.slice(savedSeparator + 1), 10)
      : NaN;
    const syncPort =
      Number.isSafeInteger(savedPort) && savedPort > 0 && savedPort <= 65535
        ? savedPort
        : SYNC_PORT;
    const r58Separator = pairing.r58_address?.lastIndexOf(':') ?? -1;
    const r58Host =
      r58Separator >= 0 ? pairing.r58_address!.slice(0, r58Separator) : '';
    const savedHost =
      hasSavedPort
        ? pairing.address.slice(0, savedSeparator)
        : pairing.address;
    const address =
      r58Host && Number.isSafeInteger(syncPort) && syncPort > 0 && syncPort <= 65535
        ? `${r58Host}:${syncPort}`
        : savedHost
          ? hasSavedPort
            ? pairing.address
            : `${savedHost}:${syncPort}`
          : '';
    if (!address) {
      throw new Error("The peer's LAN address is unavailable. Find it again and retry sync.");
    }
    try {
      await transferLibraryToLanPeer(address, token, pairing.device_id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'The transfer failed.';
      throw new Error(
        `Sync events completed, but library and cover reconciliation is still pending: ${detail}`
      );
    }
  }
);

function isRecoverablePeerError(error: unknown): boolean {
  return error instanceof Error &&
    /could not connect|timed out|connection closed|connection reset|econn|ehost|invalid response|invalid json/i.test(
      error.message
    );
}

async function updatePairingAddress(
  pairing: LanPairing,
  devices: Awaited<ReturnType<typeof discoverNearbyLanDevices>>,
  savedPairings: LanPairing[]
): Promise<LanPairing | null> {
  const device = devices.find(
    (candidate) => candidate.device_id === pairing.device_id
  );
  if (!device) return null;

  const stored = savedPairings.find(
    (candidate) => candidate.device_id === pairing.device_id
  ) ?? pairing;
  const refreshed: LanPairing = {
    ...stored,
    address: device.address,
    ...(device.r58_address ? { r58_address: device.r58_address } : {}),
  };
  if (
    refreshed.address !== stored.address ||
    refreshed.r58_address !== stored.r58_address
  ) {
    await saveLanPairing(refreshed);
    await registerLanPeer(
      refreshed.device_id,
      refreshed.device_name,
      refreshed.address
    );
  }
  return refreshed;
}

async function refreshPairingAddress(
  pairing: LanPairing,
  forceDiscovery = false
): Promise<LanPairing | null> {
  const [devices, savedPairings] = await Promise.all([
    getNearbyDevicesForRecovery(forceDiscovery),
    getLanPairings(),
  ]);
  return updatePairingAddress(pairing, devices, savedPairings);
}

export async function refreshLanPairingAddresses(
  pairings: LanPairing[],
  forceDiscovery = false
): Promise<LanPairing[]> {
  const [devices, savedPairings] = await Promise.all([
    getNearbyDevicesForRecovery(forceDiscovery),
    getLanPairings(),
  ]);
  const refreshed = await Promise.all(
    pairings.map((pairing) =>
      updatePairingAddress(pairing, devices, savedPairings)
    )
  );
  return refreshed.map((pairing, index) => pairing ?? pairings[index]);
}

async function syncWithLegacyPeer(
  pairing: LanPairing,
  cause: unknown
): Promise<LanPeerSyncResult> {
  const fallbackSecret = pairing.legacy_password || pairing.password;
  if (!fallbackSecret) {
    throw cause instanceof Error ? cause : new Error('The peer is unavailable.');
  }
  const result = await syncWithLanPeer(
    pairing.address,
    fallbackSecret,
    pairing.host_cursor,
    false,
    pairing.device_id
  );
  const refreshedPairing: LanPairing = {
    ...pairing,
    host_cursor: result.host_cursor,
    last_sync_at: new Date().toISOString(),
  };
  await saveLanPairing(refreshedPairing);
  return {
    sent: result.sent,
    received: result.received,
    pairing: refreshedPairing,
  };
}

async function syncPairingWithRecovery(
  initialPairing: LanPairing
): Promise<LanPeerSyncResult> {
  let pairing = initialPairing;
  let result: LanPeerSyncResult;
  if (pairing.protocol_version === 1) {
    try {
      result = await syncWithR58Peer(pairing);
    } catch (r58Error) {
      let fallbackCause = r58Error;
      if (isRecoverablePeerError(r58Error)) {
        const refreshed = await refreshPairingAddress(pairing);
        if (!refreshed) throw r58Error;
        pairing = refreshed;
        try {
          result = await syncWithR58Peer(pairing);
        } catch (retryError) {
          fallbackCause = retryError;
          result = await syncWithLegacyPeer(pairing, fallbackCause);
        }
      } else {
        result = await syncWithLegacyPeer(pairing, fallbackCause);
      }
    }
  } else {
    try {
      result = await syncWithLegacyPeer(
        pairing,
        new Error('The paired device uses legacy sync.')
      );
    } catch (error) {
      if (!isRecoverablePeerError(error)) throw error;
      const refreshed = await refreshPairingAddress(pairing);
      if (!refreshed) throw error;
      result = await syncWithLegacyPeer(refreshed, error);
    }
  }
  const completedPairing = await runPendingLibraryTransfer(
    result.pairing,
    result.sent + result.received > 0
  );
  return { ...result, pairing: completedPairing };
}

export function syncLanPairingWithRecovery(
  pairing: LanPairing,
  options: { refreshAddress?: boolean } = {}
): Promise<LanPeerSyncResult> {
  const existing = peerSyncInFlight.get(pairing.device_id);
  if (existing) return existing;

  const operation = (async () => {
    const refreshed = options.refreshAddress
      ? await refreshPairingAddress(pairing, true)
      : null;
    return syncPairingWithRecovery(refreshed ?? pairing);
  })();
  peerSyncInFlight.set(pairing.device_id, operation);
  return operation.finally(() => {
    if (peerSyncInFlight.get(pairing.device_id) === operation) {
      peerSyncInFlight.delete(pairing.device_id);
    }
  });
}

export function syncPairedLanDevicesDetailed(
  options: { refreshAddresses?: boolean } = {}
): Promise<LanSyncReport | null> {
  if (Platform.OS === 'web' && !isDesktopLanAvailable()) {
    return Promise.resolve(null);
  }
  if (syncInFlight) {
    return syncInFlight;
  }

  const operation = (async (): Promise<LanSyncReport | null> => {
    let pairings = await getLanPairings();
    if (!pairings.length) return null;
    if (options.refreshAddresses) {
      try {
        pairings = await refreshLanPairingAddresses(pairings, true);
      } catch (error) {
        console.warn('Unable to refresh paired addresses before manual sync.', error);
      }
    }

    let sent = 0;
    let received = 0;
    const failures: string[] = [];
    for (const pairing of pairings) {
      try {
        const result = await syncLanPairingWithRecovery(pairing);
        sent += result.sent;
        received += result.received;
      } catch (error) {
        failures.push(
          `${pairing.device_name}: ${error instanceof Error ? error.message : 'unavailable'}`
        );
      }
    }
    return {
      sent,
      received,
      successful: pairings.length - failures.length,
      total: pairings.length,
      failures,
    };
  })();
  syncInFlight = operation;
  return operation.finally(() => {
    if (syncInFlight === operation) {
      syncInFlight = null;
    }
  });
}

export function syncPairedLanDevices(): Promise<number | null> {
  return syncPairedLanDevicesDetailed().then((report) => {
    if (!report) return null;
    if (report.failures.length) {
      throw new Error(
        `Automatic sync could not reach every paired device. ${report.failures.join('; ')}`
      );
    }
    return report.received;
  });
}
