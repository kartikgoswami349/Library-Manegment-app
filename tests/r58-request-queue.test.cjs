const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createR58RequestQueue,
  dispatchR58Request,
} = require('../lib/r58-request-queue');

test('serializes R58 requests in arrival order', async () => {
  const enqueue = createR58RequestQueue();
  const order = [];

  const first = enqueue(async () => {
    order.push('first:start');
    await new Promise((resolve) => setTimeout(resolve, 10));
    order.push('first:end');
    return 'first';
  });
  const second = enqueue(async () => {
    order.push('second:start');
    order.push('second:end');
    return 'second';
  });

  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(order, [
    'first:start',
    'first:end',
    'second:start',
    'second:end',
  ]);
});

test('a rejected request does not block later R58 requests', async () => {
  const enqueue = createR58RequestQueue();
  const failure = enqueue(() => {
    throw new Error('request failed');
  });
  const next = enqueue(() => 'recovered');

  await assert.rejects(failure, /request failed/);
  assert.equal(await next, 'recovered');
});

test('discovery probes bypass queued sync work without changing mutation ordering', async () => {
  const enqueue = createR58RequestQueue();
  let releaseSync;
  const sync = enqueue(
    () =>
      new Promise((resolve) => {
        releaseSync = resolve;
      })
  );
  const discovery = dispatchR58Request(enqueue, 'discover', () => 'peer found');
  const pairing = dispatchR58Request(enqueue, 'pair', () => 'paired');

  assert.equal(await discovery, 'peer found');
  releaseSync();
  assert.equal(await sync, undefined);
  assert.equal(await pairing, 'paired');
});
