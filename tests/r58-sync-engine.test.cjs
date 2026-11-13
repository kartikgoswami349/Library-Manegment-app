const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_BATCH_SIZE,
  runR58SyncSession,
} = require('../lib/r58-sync-engine');

test('exchanges bounded batches until both peers are caught up', async () => {
  let pending = Array.from({ length: 450 }, (_, index) => ({ id: `local-${index}` }));
  let remotePending = Array.from({ length: 230 }, (_, index) => ({ id: `remote-${index}` }));
  const applied = [];
  const acknowledgmentsSaved = [];
  const outgoingBatches = [];

  const result = await runR58SyncSession({
    getPendingEvents: async () => pending,
    exchange: async (outgoingEvents, acknowledgments) => {
      outgoingBatches.push(outgoingEvents.length);
      assert.ok(outgoingEvents.length <= DEFAULT_BATCH_SIZE);
      assert.ok(acknowledgments.length <= DEFAULT_BATCH_SIZE);
      const incomingEvents = remotePending.slice(0, DEFAULT_BATCH_SIZE);
      remotePending = remotePending.slice(incomingEvents.length);
      return { incomingEvents };
    },
    applyIncomingEvents: async (events) => applied.push(...events),
    markSentEvents: async (ids) => {
      const sent = new Set(ids);
      pending = pending.filter((event) => !sent.has(event.id));
    },
    saveAcknowledgments: async (ids) => acknowledgmentsSaved.push([...ids]),
  });

  assert.deepEqual(outgoingBatches, [200, 200, 50, 0]);
  assert.equal(result.sent, 450);
  assert.equal(result.received, 230);
  assert.equal(result.exchanges, 4);
  assert.deepEqual(
    applied.map((event) => event.id),
    Array.from({ length: 230 }, (_, index) => `remote-${index}`)
  );
  assert.equal(acknowledgmentsSaved.length, 4);
  assert.deepEqual(acknowledgmentsSaved[3], []);
});

test('does not acknowledge outgoing events when exchange fails', async () => {
  let marked = false;
  let saved = false;
  await assert.rejects(
    runR58SyncSession({
      getPendingEvents: async () => [{ id: 'local-1' }],
      exchange: async () => {
        throw new Error('peer unavailable');
      },
      applyIncomingEvents: async () => {},
      markSentEvents: async () => {
        marked = true;
      },
      saveAcknowledgments: async () => {
        saved = true;
      },
    }),
    /peer unavailable/
  );
  assert.equal(marked, false);
  assert.equal(saved, false);
});

test('rejects invalid batches and stops when the peer makes no progress', async () => {
  await assert.rejects(
    runR58SyncSession({
      getPendingEvents: async () => [{ id: '' }],
      exchange: async () => ({ incomingEvents: [] }),
      applyIncomingEvents: async () => {},
      markSentEvents: async () => {},
      saveAcknowledgments: async () => {},
    }),
    /without an ID/
  );

  await assert.rejects(
    runR58SyncSession({
      getPendingEvents: async () => [{ id: 'local-1' }],
      exchange: async () => ({ incomingEvents: [] }),
      applyIncomingEvents: async () => {},
      markSentEvents: async () => {},
      saveAcknowledgments: async () => {},
      maxExchanges: 2,
    }),
    /did not converge within 2 exchanges/
  );
});
