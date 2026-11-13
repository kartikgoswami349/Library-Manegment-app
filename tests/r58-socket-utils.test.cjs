const assert = require('node:assert/strict');
const test = require('node:test');

const {
  decodeUtf8,
  destroySocketWhenConnected,
  endSocketWithData,
  isSocketWritable,
} = require('../lib/r58-socket-utils');
const {
  createDiscoveryCache,
  createPendingLibraryTransfer,
} = require('../lib/lan-auto-sync-utils');
const {
  isTransferVersionAuthoritative,
} = require('../lib/lan-transfer-version');
const { createSerialQueue } = require('../lib/serialized-queue');

test('decodes framed UTF-8 ranges without relying on typed-array toString', () => {
  const bytes = Uint8Array.from([123, 34, 120, 34, 58, 49, 125, 10]);

  assert.equal(bytes.subarray(0, 7).toString(), '123,34,120,34,58,49,125');
  assert.equal(decodeUtf8(bytes, 0, 7), '{"x":1}');
});

test('coalesces and throttles nearby-device refreshes for automatic sync recovery', async () => {
  let now = 0;
  let discoveries = 0;
  const cachedDiscovery = createDiscoveryCache(
    async () => [{ device_id: String(++discoveries) }],
    60_000,
    () => now
  );

  const [first, concurrent] = await Promise.all([
    cachedDiscovery(),
    cachedDiscovery(),
  ]);
  assert.equal(first, concurrent);
  assert.equal(discoveries, 1);
  assert.equal((await cachedDiscovery())[0].device_id, '1');
  assert.equal(discoveries, 1);

  assert.equal((await cachedDiscovery(true))[0].device_id, '2');
  assert.equal(discoveries, 2);

  now = 60_000;
  assert.equal((await cachedDiscovery())[0].device_id, '3');
  assert.equal(discoveries, 3);
});

test('keeps failed library transfers pending and retries them on the next sync', async () => {
  const savedStates = [];
  let transfers = 0;
  let failTransfer = true;
  const runTransfer = createPendingLibraryTransfer(
    async (pairing) => savedStates.push(pairing.content_sync_pending),
    async () => {
      transfers += 1;
      if (failTransfer) throw new Error('receiver unavailable');
    }
  );
  const pairing = { device_id: 'peer', content_sync_pending: false };

  await assert.rejects(runTransfer(pairing, true), /receiver unavailable/);
  assert.deepEqual(savedStates, [true]);

  failTransfer = false;
  const completed = await runTransfer(
    { ...pairing, content_sync_pending: true },
    false
  );
  assert.equal(completed.content_sync_pending, false);
  assert.deepEqual(savedStates, [true, true, false]);
  assert.equal(transfers, 2);

  await runTransfer(completed, false);
  assert.equal(transfers, 2);
});

test('prefers the device that owns an equal-version cover and does not erase it', () => {
  const sameVersion = {
    changed_at: '2026-11-13T00:00:00.000Z',
    device_id: 'phone',
  };
  assert.equal(isTransferVersionAuthoritative(sameVersion, sameVersion, 'phone'), true);
  assert.equal(isTransferVersionAuthoritative(sameVersion, sameVersion, 'laptop'), false);
  assert.equal(
    isTransferVersionAuthoritative(
      { ...sameVersion, changed_at: '2026-11-13T00:00:01.000Z' },
      sameVersion,
      'laptop'
    ),
    true
  );
});

test('serializes pairing read-modify-write updates without dropping concurrent devices', async () => {
  const queue = createSerialQueue();
  const state = { devices: [] };
  await Promise.all(
    ['laptop', 'phone-a', 'phone-b'].map((deviceId) =>
      queue(async () => {
        const snapshot = [...state.devices];
        await new Promise((resolve) => setTimeout(resolve, 2));
        snapshot.push(deviceId);
        state.devices = snapshot;
      })
    )
  );
  assert.deepEqual(state.devices.sort(), ['laptop', 'phone-a', 'phone-b']);
});

test('does not destroy a pending connection before the native socket exists', () => {
  let destroyed = 0;
  const socket = {
    destroyed: false,
    destroy() {
      destroyed += 1;
    },
  };

  assert.equal(destroySocketWhenConnected(socket, false), false);
  assert.equal(destroyed, 0);
  assert.equal(destroySocketWhenConnected(socket, true), true);
  assert.equal(destroyed, 1);
});

test('ends a response with its payload in one ordered socket operation', () => {
  const calls = [];
  const socket = {
    destroyed: false,
    write() {
      calls.push('write');
    },
    end(data) {
      calls.push(['end', data]);
      this.destroyed = true;
    },
  };

  assert.equal(endSocketWithData(socket, 'response\n'), true);
  assert.deepEqual(calls, [['end', 'response\n']]);
});

test('does not send data after the connection has closed', () => {
  const calls = [];
  const socket = {
    destroyed: false,
    end(data) {
      calls.push(data);
    },
  };

  assert.equal(isSocketWritable(socket, () => true), false);
  assert.equal(endSocketWithData(socket, 'late response\n', () => true), false);
  assert.deepEqual(calls, []);
});

test('does not send data through a destroyed socket', () => {
  const calls = [];
  const socket = {
    destroyed: true,
    end(data) {
      calls.push(data);
    },
  };

  assert.equal(isSocketWritable(socket), false);
  assert.equal(endSocketWithData(socket, 'late response\n'), false);
  assert.deepEqual(calls, []);
});
