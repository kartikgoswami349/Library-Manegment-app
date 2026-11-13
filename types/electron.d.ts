export {};

declare global {
  interface Window {
    libraryDesktop?: {
      isElectron: true;
      getAppInfo: () => Promise<{
        platform: string;
        version: string;
        packaged: boolean;
      }>;
      checkForUpdates: () => Promise<unknown>;
      chooseFile: (options?: {
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<string | null>;
      saveFile: (options?: {
        defaultPath?: string;
        filters?: { name: string; extensions: string[] }[];
        data?: string;
        encoding?: 'utf8' | 'base64';
      }) => Promise<string | null>;
      readFile: (path: string) => Promise<{ data: string; encoding: 'base64' }>;
      discoverLanDevices: () => Promise<{
        device_id: string;
        device_name: string;
        address: string;
        paired_devices: number;
        protocol_version?: 1;
        r58_address?: string;
      }[]>;
      getLanPairing: () => Promise<{
        pairing_code: string;
        pairings: {
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
        }[];
        r58_pairing_code?: string;
        r58_pairing_expires_at?: number;
      } | null>;
      saveLanPairing: (pairing: {
        pairing_code: string;
        pairings: {
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
        }[];
        r58_pairing_code?: string;
        r58_pairing_expires_at?: number;
      }) => Promise<void>;
      clearLanPairing: () => Promise<void>;
      lanRequest: (options: {
        address: string;
        token: string;
        path?: string;
        request: Record<string, unknown>;
      }) => Promise<{
        version: number;
        device_id: string;
        events: unknown[];
        peers: unknown[];
        host_cursor: number;
        has_more: boolean;
      }>;
      r58Request: (options: {
        address: string;
        packet: Record<string, unknown>;
      }) => Promise<Record<string, unknown>>;
      startLanTransferServer: (options: {
        token: string;
        device_id: string;
        device_name: string;
        paired_devices: number;
        r58_token?: string;
        r58_expires_at?: number;
      }) => Promise<number>;
      stopLanTransferServer: () => Promise<void>;
      saveSafetyBackup: (options: {
        data: string;
        sha256: string;
      }) => Promise<string>;
      onLanTransferRequest: (callback: (request: {
        request_id: string;
        path: string;
        body: string;
        peer_address: string;
      }) => Promise<{
        status: number;
        body: Record<string, unknown>;
      }>) => () => void;
      onR58Request: (callback: (request: {
        request_id: string;
        packet: Record<string, unknown>;
        peer_address: string;
      }) => Promise<Record<string, unknown>>) => () => void;
    };
  }
}
