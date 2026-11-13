const assert = require('node:assert/strict');
const test = require('node:test');

const {
  chooseIpv4Address,
  getR58PairingAddressCandidates,
  getR58ZeroconfOptions,
  getIpv4HostCandidates,
  isR58DiscoveryResponse,
  isUsableIpv4,
  normalizeTxtRecord,
  resolveR58Service,
} = require('../lib/lan-discovery-utils');

test('prefers the mDNS IPv4 address on the local interface subnet', () => {
  assert.equal(
    chooseIpv4Address(
      ['10.0.0.8', '192.168.31.41', '127.0.0.1'],
      [{ address: '192.168.31.20', netmask: '255.255.255.0' }]
    ),
    '192.168.31.41'
  );
});

test('accepts both device TXT key conventions and ignores non-IPv4 candidates', () => {
  assert.deepEqual(normalizeTxtRecord({ deviceId: 'peer-1', deviceName: 'Phone' }), {
    deviceid: 'peer-1',
    devicename: 'Phone',
  });
  assert.equal(isUsableIpv4('169.254.1.5'), false);
  assert.equal(isUsableIpv4('100.64.1.5'), false);
  assert.equal(isUsableIpv4('192.168.1.5'), true);
});

test('uses the verified R58 endpoint without retrying a different primary-port service', () => {
  assert.deepEqual(
    getR58PairingAddressCandidates({
      address: '192.168.31.41:45832',
      r58_address: '192.168.31.41:45859',
    }),
    ['192.168.31.41:45859']
  );
  assert.deepEqual(
    getR58PairingAddressCandidates({ address: '192.168.31.41:45832' }),
    ['192.168.31.41:45858']
  );
});

test('uses the Inventory-compatible Android mDNS implementation and resolves both TXT formats', () => {
  assert.deepEqual(getR58ZeroconfOptions(), {
    type: 'r58inventory',
    protocol: 'tcp',
    domain: 'local.',
    implType: 'DNSSD',
  });
  assert.deepEqual(
    resolveR58Service(
      {
        name: 'R58-Phone',
        port: 45858,
        addresses: ['10.0.0.8', '192.168.31.41'],
        txt: { deviceId: 'peer-1', deviceName: 'Phone', protocol: '1' },
      },
      [{ address: '192.168.31.20', netmask: '255.255.255.0' }]
    ),
    {
      device_id: 'peer-1',
      device_name: 'Phone',
      address: '192.168.31.41',
      port: 45858,
      sync_port: null,
      service_name: 'R58-Phone',
    }
  );
  assert.deepEqual(
    resolveR58Service({
      name: 'R58-Desktop',
      port: 45858,
      ipv4: ['192.168.31.5'],
      txt: { id: 'peer-2', name: 'Desktop', syncPort: '45832' },
    }),
    {
      device_id: 'peer-2',
      device_name: 'Desktop',
      address: '192.168.31.5',
      port: 45858,
      sync_port: 45832,
      service_name: 'R58-Desktop',
    }
  );
  assert.equal(
    resolveR58Service({
      name: 'R58-Desktop',
      port: 45859,
      ipv4: ['192.168.31.5'],
      txt: { id: 'peer-2', name: 'Desktop', syncPort: '45833' },
    }).port,
    45859
  );
  assert.equal(
    resolveR58Service({
      name: 'R58-Desktop',
      port: 45859,
      ipv4: ['192.168.31.5'],
      txt: { id: 'peer-2', name: 'Desktop', syncPort: '45833' },
    }).sync_port,
    45833
  );
  assert.equal(
    resolveR58Service({
      name: 'R58-Desktop',
      port: 45858,
      ipv4: ['192.168.31.5'],
      txt: { id: 'peer-2', name: 'Desktop', protocol: '2' },
    }),
    null
  );
  assert.equal(
    resolveR58Service({
      name: 'R58-Desktop',
      port: 45831,
      ipv4: ['192.168.31.5'],
      txt: { id: 'peer-2', name: 'Desktop', protocol: '1' },
    }),
    null
  );
});

test('accepts only a correlated response from the advertised R58 device', () => {
  const response = {
    version: 1,
    packetId: 'request-1',
    sourceDevice: { id: 'peer-1', name: 'Phone' },
    direction: 'RESPONSE',
    type: 'discover',
    auth: 'not-used-for-discovery',
    status: 'ok',
    records: [],
  };
  assert.equal(isR58DiscoveryResponse(response, 'request-1', 'peer-1'), true);
  assert.equal(isR58DiscoveryResponse(response, 'request-2', 'peer-1'), false);
  assert.equal(isR58DiscoveryResponse(response, 'request-1', 'peer-2'), false);
  assert.equal(
    isR58DiscoveryResponse({ type: 'R58_SYNC_RESULT', success: false }, 'request-1'),
    false
  );
});

test('builds bounded host candidates from the actual subnet mask', () => {
  const hosts = getIpv4HostCandidates('192.168.31.20', '255.255.255.248');
  assert.deepEqual(hosts, ['192.168.31.19', '192.168.31.21', '192.168.31.18', '192.168.31.22', '192.168.31.17']);
  assert.equal(getIpv4HostCandidates('10.0.0.1', '255.0.0.0').length, 253);
});
