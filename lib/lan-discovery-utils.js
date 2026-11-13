function ipv4ToInt(address) {
  const parts = String(address).split('.');
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)
  ) {
    return null;
  }
  return parts.reduce((value, part) => (value * 256 + Number(part)) >>> 0, 0);
}

function isUsableIpv4(address) {
  if (ipv4ToInt(address) === null) return false;
  const [first, second] = String(address).split('.').map(Number);
  return (
    first !== 0 &&
    first !== 127 &&
    first < 224 &&
    !(first === 169 && second === 254) &&
    !(first === 100 && second >= 64 && second <= 127)
  );
}

function normalizeTxtRecord(txt) {
  const normalized = {};
  if (!txt || typeof txt !== 'object') return normalized;
  for (const [key, value] of Object.entries(txt)) {
    let strVal = '';
    if (typeof Buffer !== 'undefined' && Buffer && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(value)) {
      strVal = value.toString('utf8');
    } else if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
      strVal = String.fromCharCode(...value.data);
    } else if (value != null) {
      strVal = String(value);
    }
    normalized[key.toLowerCase()] = strVal;
  }
  return normalized;
}

function getR58ZeroconfOptions() {
  return {
    type: 'r58inventory',
    protocol: 'tcp',
    domain: 'local.',
    implType: 'DNSSD',
  };
}

function chooseIpv4Address(addresses, localNetworks = []) {
  const candidates = Array.isArray(addresses)
    ? [...new Set(addresses.map(String).filter(isUsableIpv4))]
    : [];
  let bestAddress = null;
  let bestScore = -1;
  for (const address of candidates) {
    const value = ipv4ToInt(address);
    const parts = address.split('.').map(Number);
    const isPrivate =
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168);
    let score = isPrivate ? 20 : 0;
    for (const network of localNetworks) {
      const localAddress = ipv4ToInt(network.address);
      const mask = ipv4ToInt(network.netmask);
      if (localAddress !== null && mask !== null && (value & mask) === (localAddress & mask)) {
        score += 100;
      }
    }
    if (score > bestScore) {
      bestAddress = address;
      bestScore = score;
    }
  }
  return bestAddress;
}

function resolveR58Service(service, localNetworks = []) {
  if (!service || typeof service !== 'object') return null;
  const txt = normalizeTxtRecord(service.txt);
  if (txt.protocol && txt.protocol !== '1') return null;
  let deviceId = String(txt.id || txt.deviceid || '').trim();
  const rawPort = Number(service.port);
  const port = Number.isInteger(rawPort) ? rawPort : 0;
  if (![45858, 45859, 45860].includes(port)) return null;
  const rawSyncPort = Number(txt.syncport);
  const sync_port =
    Number.isInteger(rawSyncPort) && rawSyncPort > 0 && rawSyncPort < 65536
      ? rawSyncPort
      : null;
  const address = chooseIpv4Address(
    [
      ...(Array.isArray(service.ipv4) ? service.ipv4 : []),
      ...(Array.isArray(service.addresses) ? service.addresses : []),
      service.referer?.address,
      service.host,
    ],
    localNetworks
  );

  // If deviceId wasn't in TXT, attempt to extract from service name
  if (!deviceId && typeof service.name === 'string') {
    const match = service.name.match(/-(?:[a-f0-9]{4,36}|[A-Za-z0-9_-]{6,})$/);
    if (match) {
      deviceId = match[0].slice(1);
    }
  }

  if (!deviceId || !address) {
    return null;
  }

  return {
    device_id: deviceId,
    device_name: String(
      txt.name || txt.devicename || service.name || `Library Device ${deviceId.slice(-4)}`
    ),
    address,
    port,
    sync_port,
    service_name: String(service.name || ''),
  };
}

function getR58PairingAddressCandidates(device) {
  const advertised = String(device?.r58_address || '').trim();
  if (advertised) return [advertised];

  const address = String(device?.address || '').trim();
  const separator = address.lastIndexOf(':');
  const host =
    separator > address.lastIndexOf(']')
      ? address.slice(0, separator)
      : address;
  return host ? [`${host}:45858`] : [];
}

function isR58DiscoveryResponse(value, packetId, expectedDeviceId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const packet = value;
  const device = packet.sourceDevice;
  return (
    packet.version === 1 &&
    packet.packetId === packetId &&
    packet.direction === 'RESPONSE' &&
    packet.type === 'discover' &&
    packet.status === 'ok' &&
    Array.isArray(packet.records) &&
    device &&
    typeof device.id === 'string' &&
    device.id.length > 0 &&
    typeof device.name === 'string' &&
    (!expectedDeviceId || device.id === expectedDeviceId)
  );
}

function getIpv4HostCandidates(address, netmask = '255.255.255.0', maxHosts = 1022) {
  const addressValue = ipv4ToInt(address);
  const maskValue = ipv4ToInt(netmask);
  if (addressValue === null || maskValue === null || !isUsableIpv4(address)) return [];

  const bits = maskValue.toString(2).padStart(32, '0');
  if (!/^1*0*$/.test(bits)) return [];
  const prefixLength = bits.indexOf('0') < 0 ? 32 : bits.indexOf('0');
  const effectivePrefix = prefixLength < 22 ? 24 : prefixLength;
  const effectiveMask =
    effectivePrefix === 0 ? 0 : (0xffffffff << (32 - effectivePrefix)) >>> 0;
  const network = (addressValue & effectiveMask) >>> 0;
  const broadcast = (network | (~effectiveMask >>> 0)) >>> 0;
  const hostCount = Math.max(0, broadcast - network - 1);
  if (hostCount > maxHosts) return [];

  const toAddress = (value) =>
    [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');

  // Collect all hosts in the subnet
  const allSubnetHosts = [];
  for (let value = network + 1; value < broadcast; value += 1) {
    if (value !== addressValue) allSubnetHosts.push(value >>> 0);
  }

  // Smart sort: Neighboring IPs around addressValue come first!
  // E.g. +1, -1, +2, -2, +3, -3... then remaining
  allSubnetHosts.sort((a, b) => {
    const distA = Math.abs(a - addressValue);
    const distB = Math.abs(b - addressValue);
    return distA - distB;
  });

  return allSubnetHosts.map(toAddress);
}

module.exports = {
  chooseIpv4Address,
  getR58ZeroconfOptions,
  getIpv4HostCandidates,
  getR58PairingAddressCandidates,
  isR58DiscoveryResponse,
  isUsableIpv4,
  normalizeTxtRecord,
  resolveR58Service,
};
