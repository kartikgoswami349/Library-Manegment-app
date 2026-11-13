import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createSerialQueue } from './serialized-queue';

const PAIRING_INDEX_KEY = 'library_lan_pairing_ids_v2';
const PAIRING_CODE_KEY = 'library_lan_pairing_code_v2';
const R58_PAIRING_CODE_KEY = 'library_r58_pairing_code_v1';
const R58_PAIRING_EXPIRY_KEY = 'library_r58_pairing_expiry_v1';
const LEGACY_PAIRING_KEY = 'library_lan_pairing_v1';
const R58_PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
const enqueuePairingUpdate = createSerialQueue();

export type LanPairing = {
  device_id: string;
  device_name: string;
  address: string;
  password: string;
  legacy_password?: string;
  host_cursor: number;
  last_sync_at?: string;
  r58_address?: string;
  protocol_version?: 1;
  r58_ack_event_ids?: string[];
  content_sync_pending?: boolean;
};

export type LanPairingState = {
  pairing_code: string;
  pairings: LanPairing[];
  r58_pairing_code?: string;
  r58_pairing_expires_at?: number;
};

function getDesktopApi() {
  if (typeof window === 'undefined' || !window.libraryDesktop?.isElectron) {
    return null;
  }
  return window.libraryDesktop;
}

function isPairing(value: unknown): value is LanPairing {
  if (!value || typeof value !== 'object') return false;
  const pairing = value as Partial<LanPairing>;
  return (
    typeof pairing.device_id === 'string' &&
    typeof pairing.device_name === 'string' &&
    typeof pairing.address === 'string' &&
    typeof pairing.password === 'string' &&
    Number.isSafeInteger(pairing.host_cursor) &&
    (pairing.host_cursor ?? -1) >= 0 &&
    (pairing.legacy_password === undefined ||
      typeof pairing.legacy_password === 'string') &&
    (pairing.r58_address === undefined || typeof pairing.r58_address === 'string') &&
    (pairing.protocol_version === undefined || pairing.protocol_version === 1) &&
    (pairing.r58_ack_event_ids === undefined ||
      (Array.isArray(pairing.r58_ack_event_ids) &&
        pairing.r58_ack_event_ids.every((id) => typeof id === 'string'))) &&
    (pairing.content_sync_pending === undefined ||
      typeof pairing.content_sync_pending === 'boolean')
  );
}

function parsePairingState(value: unknown): LanPairingState {
  if (!value || typeof value !== 'object') {
    throw new Error('The saved LAN pairing data is invalid.');
  }
  const state = value as Partial<LanPairingState>;
  if (
    typeof state.pairing_code !== 'string' ||
    (state.pairing_code !== '' && !/^\d{6}$/.test(state.pairing_code)) ||
    !Array.isArray(state.pairings) ||
    !state.pairings.every(isPairing)
  ) {
    throw new Error('The saved LAN pairing data is invalid.');
  }
  return {
    pairing_code: state.pairing_code,
    pairings: state.pairings,
    r58_pairing_code:
      typeof state.r58_pairing_code === 'string' && /^\d{6}$/.test(state.r58_pairing_code)
        ? state.r58_pairing_code
        : undefined,
    r58_pairing_expires_at:
      typeof state.r58_pairing_expires_at === 'number' &&
      Number.isSafeInteger(state.r58_pairing_expires_at)
        ? state.r58_pairing_expires_at
        : undefined,
  };
}

function pairingKey(deviceId: string): string {
  return `library_lan_pairing_v2_${deviceId}`;
}

async function readMobilePairings(): Promise<LanPairingState> {
  const [storedCode, storedIds, storedR58Code, storedR58Expiry] = await Promise.all([
    SecureStore.getItemAsync(PAIRING_CODE_KEY),
    SecureStore.getItemAsync(PAIRING_INDEX_KEY),
    SecureStore.getItemAsync(R58_PAIRING_CODE_KEY),
    SecureStore.getItemAsync(R58_PAIRING_EXPIRY_KEY),
  ]);
  let ids: string[] = [];
  if (storedIds) {
    const parsed: unknown = JSON.parse(storedIds);
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
      throw new Error('The saved LAN device list is invalid.');
    }
    ids = parsed;
  }

  const pairings = (await Promise.all(
    ids.map(async (id) => {
      const saved = await SecureStore.getItemAsync(pairingKey(id));
      if (!saved) {
        throw new Error(`The saved pairing for device ${id.slice(-4)} is missing.`);
      }
      const parsed: unknown = JSON.parse(saved);
      if (!isPairing(parsed) || parsed.device_id !== id) {
        throw new Error(`The saved pairing for device ${id.slice(-4)} is invalid.`);
      }
      return parsed;
    })
  )).filter((pairing): pairing is LanPairing => pairing !== null);

  if (!storedIds) {
    const legacy = await SecureStore.getItemAsync(LEGACY_PAIRING_KEY);
    if (legacy) {
      const parsed: unknown = JSON.parse(legacy);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('The saved legacy LAN pairing is invalid.');
      }
      const old = parsed as {
        address?: unknown;
        host_device_id?: unknown;
        password?: unknown;
        host_cursor?: unknown;
        last_sync_at?: unknown;
      };
      if (
        typeof old.address !== 'string' ||
        typeof old.host_device_id !== 'string' ||
        typeof old.password !== 'string'
      ) {
        throw new Error('The saved legacy LAN pairing is invalid.');
      }
      const migrated: LanPairing = {
        device_id: old.host_device_id,
        device_name: `Library device ${old.host_device_id.slice(-4)}`,
        address: old.address,
        password: old.password,
        host_cursor:
          typeof old.host_cursor === 'number' && Number.isSafeInteger(old.host_cursor)
            ? old.host_cursor
            : 0,
        last_sync_at: typeof old.last_sync_at === 'string' ? old.last_sync_at : undefined,
      };
      await SecureStore.setItemAsync(pairingKey(migrated.device_id), JSON.stringify(migrated));
      pairings.push(migrated);
      await SecureStore.setItemAsync(
        PAIRING_INDEX_KEY,
        JSON.stringify(pairings.map((pairing) => pairing.device_id))
      );
      await SecureStore.deleteItemAsync(LEGACY_PAIRING_KEY);
    }
  }

  if (storedCode && !/^\d{6}$/.test(storedCode)) {
    throw new Error('The saved six-digit LAN pairing code is invalid.');
  }
  const parsedExpiry = storedR58Expiry ? Number.parseInt(storedR58Expiry, 10) : NaN;
  return {
    pairing_code: storedCode ?? '',
    pairings,
    r58_pairing_code:
      storedR58Code && /^\d{6}$/.test(storedR58Code) ? storedR58Code : undefined,
    r58_pairing_expires_at:
      Number.isSafeInteger(parsedExpiry) ? parsedExpiry : undefined,
  };
}

async function writeMobilePairingState(state: LanPairingState): Promise<void> {
  for (const pairing of state.pairings) {
    await SecureStore.setItemAsync(pairingKey(pairing.device_id), JSON.stringify(pairing));
  }
  await SecureStore.setItemAsync(
    PAIRING_INDEX_KEY,
    JSON.stringify(state.pairings.map((pairing) => pairing.device_id))
  );
  await SecureStore.setItemAsync(PAIRING_CODE_KEY, state.pairing_code);
  if (state.r58_pairing_code) {
    await SecureStore.setItemAsync(R58_PAIRING_CODE_KEY, state.r58_pairing_code);
  } else {
    await SecureStore.deleteItemAsync(R58_PAIRING_CODE_KEY);
  }
  if (state.r58_pairing_expires_at) {
    await SecureStore.setItemAsync(R58_PAIRING_EXPIRY_KEY, String(state.r58_pairing_expires_at));
  } else {
    await SecureStore.deleteItemAsync(R58_PAIRING_EXPIRY_KEY);
  }
}

export async function getLanPairingState(): Promise<LanPairingState> {
  if (Platform.OS === 'web') {
    const desktop = getDesktopApi();
    if (!desktop) {
      throw new Error('Secure LAN pairing is available in the iOS, Android, and Electron apps only.');
    }
    const value = await desktop.getLanPairing();
    if (value) return parsePairingState(value);
    return { pairing_code: '', pairings: [] };
  }
  return readMobilePairings();
}

export async function getLanPairings(): Promise<LanPairing[]> {
  return (await getLanPairingState()).pairings;
}

export async function getLanPairing(deviceId?: string): Promise<LanPairing | null> {
  const pairings = await getLanPairings();
  return (deviceId ? pairings.find((pairing) => pairing.device_id === deviceId) : pairings[0]) ?? null;
}

export async function getLocalLanPairingCode(): Promise<string> {
  const state = await updateLanPairingState(async (current) => {
    if (current.pairing_code) return current;
    const bytes = await Crypto.getRandomBytesAsync(4);
    const value = (((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0)) >>> 0;
    return {
      ...current,
      pairing_code: String(value % 1_000_000).padStart(6, '0'),
    };
  });
  return state.pairing_code;
}

export async function getTemporaryR58PairingCode(): Promise<string> {
  const state = await updateLanPairingState(async (current) => {
    if (
      current.r58_pairing_code &&
      current.r58_pairing_expires_at &&
      current.r58_pairing_expires_at > Date.now()
    ) {
      return current;
    }
    const bytes = await Crypto.getRandomBytesAsync(4);
    const value = (((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0)) >>> 0;
    return {
      ...current,
      r58_pairing_code: String(value % 1_000_000).padStart(6, '0'),
      r58_pairing_expires_at: Date.now() + R58_PAIRING_CODE_TTL_MS,
    };
  });
  return state.r58_pairing_code!;
}

export async function isValidTemporaryR58PairingCode(code: string): Promise<boolean> {
  const state = await getLanPairingState();
  const matchesTemp = isActiveTemporaryR58PairingCode(state, code);
  const matchesPermanent = Boolean(state.pairing_code && state.pairing_code === code);
  return matchesTemp || matchesPermanent;
}

function isActiveTemporaryR58PairingCode(
  state: LanPairingState,
  code: string
): boolean {
  return Boolean(
    state.r58_pairing_code === code &&
      state.r58_pairing_expires_at &&
      state.r58_pairing_expires_at > Date.now()
  );
}

export async function isCurrentTemporaryR58PairingCode(
  code: string
): Promise<boolean> {
  return isActiveTemporaryR58PairingCode(await getLanPairingState(), code);
}

export async function clearTemporaryR58PairingCode(): Promise<void> {
  await updateLanPairingState((state) => ({
    ...state,
    r58_pairing_code: undefined,
    r58_pairing_expires_at: undefined,
  }));
}

async function saveLanPairingState(state: LanPairingState): Promise<void> {
  if (Platform.OS === 'web') {
    const desktop = getDesktopApi();
    if (!desktop) {
      throw new Error('Secure LAN pairing is available in the iOS, Android, and Electron apps only.');
    }
    await desktop.saveLanPairing(state);
    return;
  }
  await writeMobilePairingState(state);
}

function updateLanPairingState(
  update: (state: LanPairingState) => LanPairingState | Promise<LanPairingState>
): Promise<LanPairingState> {
  return enqueuePairingUpdate(async () => {
    const state = await getLanPairingState();
    const updated = await update(state);
    if (updated !== state) {
      await saveLanPairingState(updated);
    }
    return updated;
  });
}

export async function saveLanPairing(pairing: LanPairing): Promise<void> {
  if (!isPairing(pairing)) throw new Error('The LAN device pairing is invalid.');
  await updateLanPairingState((state) => {
    const pairings = state.pairings.filter(
      (saved) => saved.device_id !== pairing.device_id
    );
    pairings.push(pairing);
    return { ...state, pairings };
  });
}

export async function removeLanPairing(deviceId: string): Promise<void> {
  await updateLanPairingState((state) => ({
    ...state,
    pairings: state.pairings.filter((pairing) => pairing.device_id !== deviceId),
  }));
}

export async function clearLanPairing(): Promise<void> {
  await updateLanPairingState((state) => ({ ...state, pairings: [] }));
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(LEGACY_PAIRING_KEY);
}
