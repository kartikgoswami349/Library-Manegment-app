export type Ipv4Network = {
  address: string;
  netmask: string;
};

export function chooseIpv4Address(
  addresses: unknown,
  localNetworks?: Ipv4Network[]
): string | null;
export function getR58ZeroconfOptions(): {
  type: 'r58inventory';
  protocol: 'tcp';
  domain: 'local.';
  implType: 'DNSSD';
};
export function getIpv4HostCandidates(
  address: string,
  netmask?: string,
  maxHosts?: number
): string[];
export function getR58PairingAddressCandidates(device: {
  address?: string;
  r58_address?: string;
}): string[];
export function isUsableIpv4(address: string): boolean;
export function isR58DiscoveryResponse(
  value: unknown,
  packetId: string,
  expectedDeviceId?: string
): value is {
  version: 1;
  packetId: string;
  sourceDevice: { id: string; name: string };
  direction: 'RESPONSE';
  type: 'discover';
  status: 'ok';
  records: unknown[];
};
export function normalizeTxtRecord(txt: unknown): Record<string, string>;
export function resolveR58Service(
  service: {
    txt?: unknown;
    ipv4?: unknown;
    addresses?: unknown;
    referer?: { address?: unknown };
    host?: unknown;
    name?: unknown;
    port?: unknown;
  } | null | undefined,
  localNetworks?: Ipv4Network[]
): {
  device_id: string;
  device_name: string;
  address: string;
  port: number;
  sync_port: number | null;
  service_name: string;
} | null;
