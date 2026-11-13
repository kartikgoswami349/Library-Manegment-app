export function closeServer(server: object | null | undefined): Promise<void>;
export function isAddressInUse(error: unknown): boolean;
export function listenOnAvailablePort(
  server: object,
  candidatePorts: number | number[],
  host?: string
): Promise<number>;
export function listenWithOwnership(
  server: object,
  port: number | number[],
  host?: string
): Promise<void>;
