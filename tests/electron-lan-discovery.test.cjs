const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const { createR58Discovery } = require('../electron/lan-discovery.cjs');

function createFakeBonjour(service, delayService = false) {
  const browser = new EventEmitter();
  browser.services = [service];
  browser.update = () => {};
  browser.expire = () => {};
  browser.stop = () => {};

  const publication = new EventEmitter();
  publication.stop = () => {};

  const state = { publishes: 0, finds: 0, destroyed: 0, published: null };
  class Bonjour {
    publish(options) {
      state.publishes += 1;
      state.published = options;
      return publication;
    }

    find(_options, onUp) {
      state.finds += 1;
      if (delayService) setTimeout(() => onUp(service), 20);
      else onUp(service);
      return browser;
    }

    destroy() {
      state.destroyed += 1;
    }
  }

  return { Bonjour, state };
}

const remoteService = {
  name: 'R58-Phone-123456',
  port: 45859,
  addresses: ['192.168.31.41'],
  txt: {
    deviceId: 'phone-1',
    deviceName: 'Library phone',
    protocol: '1',
    syncPort: '45833',
  },
};

test('publishes and discovers only an R58 peer that answers the correlated probe', async () => {
  const { Bonjour, state } = createFakeBonjour(remoteService);
  const probes = [];
  const discovery = createR58Discovery({
    Bonjour,
    os: { networkInterfaces: () => ({}) },
    getDeviceInfo: () => ({
      device_id: 'desktop-1',
      device_name: 'Library desktop',
    }),
    requestPacket: async (address, packet, options) => {
      probes.push({ address, packet, options });
      return {
        version: 1,
        packetId: packet.packetId,
        sourceDevice: { id: 'phone-1', name: 'Library phone' },
        direction: 'RESPONSE',
        type: 'discover',
        auth: '',
        status: 'ok',
        syncPort: 45833,
        records: [],
      };
    },
  });

  await discovery.start({ r58Port: 45860, syncPort: 45832 });
  const devices = await discovery.discover();

  assert.equal(state.publishes, 1);
  assert.equal(state.finds, 1);
  assert.equal(state.published.port, 45860);
  assert.equal(state.published.txt.syncPort, '45832');
  assert.equal(state.published.txt.deviceId, 'desktop-1');
  assert.equal(probes.length, 1);
  assert.equal(probes[0].address, '192.168.31.41:45859');
  assert.equal(probes[0].options.connectTimeoutMs, 1_200);
  assert.deepEqual(devices, [{
    device_id: 'phone-1',
    device_name: 'Library phone',
    address: '192.168.31.41:45833',
    r58_address: '192.168.31.41:45859',
    paired_devices: 0,
    protocol_version: 1,
  }]);

  await discovery.stop();
  assert.equal(state.destroyed, 1);
});

test('ignores mDNS services whose TCP response does not match the advertised identity', async () => {
  const { Bonjour } = createFakeBonjour(remoteService);
  const discovery = createR58Discovery({
    Bonjour,
    os: { networkInterfaces: () => ({}) },
    getDeviceInfo: () => ({
      device_id: 'desktop-1',
      device_name: 'Library desktop',
    }),
    requestPacket: async (_address, packet) => ({
      version: 1,
      packetId: packet.packetId,
      sourceDevice: { id: 'other-phone', name: 'Other phone' },
      direction: 'RESPONSE',
      type: 'discover',
      auth: '',
      status: 'ok',
      records: [],
    }),
  });

  await discovery.start();
  assert.deepEqual(await discovery.discover(), []);
  await discovery.stop();
});

test('waits for mDNS service announcements before falling back to subnet scans', async () => {
  const { Bonjour } = createFakeBonjour(remoteService, true);
  const probes = [];
  const discovery = createR58Discovery({
    Bonjour,
    os: { networkInterfaces: () => ({}) },
    getDeviceInfo: () => ({
      device_id: 'desktop-1',
      device_name: 'Library desktop',
    }),
    requestPacket: async (address, packet) => {
      probes.push(address);
      return {
        version: 1,
        packetId: packet.packetId,
        sourceDevice: { id: 'phone-1', name: 'Library phone' },
        direction: 'RESPONSE',
        type: 'discover',
        auth: '',
        status: 'ok',
        syncPort: 45833,
        records: [],
      };
    },
  });

  await discovery.start();
  const devices = await discovery.discover();

  assert.equal(probes.length, 1);
  assert.equal(devices[0].device_id, 'phone-1');
  await discovery.stop();
});
