export function createDiscoveryCache<T>(
  discover: () => Promise<T[]>,
  cooldownMs: number,
  now?: () => number
): (force?: boolean) => Promise<T[]>;

export function createPendingLibraryTransfer<
  T extends { content_sync_pending?: boolean },
>(
  savePairing: (pairing: T) => Promise<void>,
  transfer: (pairing: T) => Promise<void>
): (pairing: T, syncChanged: boolean) => Promise<T>;
