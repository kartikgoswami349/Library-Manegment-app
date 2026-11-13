const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_EXCHANGES = 1000;

function assertUniqueEventIds(events) {
  const ids = events.map((event) => event && event.id);
  if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error('The R58 sync batch contains an event without an ID.');
  }
  return [...new Set(ids)];
}

async function runR58SyncSession(options) {
  const {
    getPendingEvents,
    exchange,
    applyIncomingEvents,
    markSentEvents,
    saveAcknowledgments,
    initialAcknowledgments = [],
    batchSize = DEFAULT_BATCH_SIZE,
    maxExchanges = DEFAULT_MAX_EXCHANGES,
  } = options || {};

  if (
    typeof getPendingEvents !== 'function' ||
    typeof exchange !== 'function' ||
    typeof applyIncomingEvents !== 'function' ||
    typeof markSentEvents !== 'function' ||
    typeof saveAcknowledgments !== 'function'
  ) {
    throw new Error('The R58 sync session is missing a required operation.');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 250) {
    throw new Error('The R58 sync batch size is invalid.');
  }
  if (!Number.isSafeInteger(maxExchanges) || maxExchanges < 1) {
    throw new Error('The R58 sync exchange limit is invalid.');
  }
  if (
    !Array.isArray(initialAcknowledgments) ||
    initialAcknowledgments.length > 500 ||
    initialAcknowledgments.some((id) => typeof id !== 'string')
  ) {
    throw new Error('The saved R58 sync acknowledgments are invalid.');
  }

  const sentEventIds = new Set();
  const receivedEventIds = new Set();
  let acknowledgments = [...initialAcknowledgments];

  for (let exchangeNumber = 1; exchangeNumber <= maxExchanges; exchangeNumber += 1) {
    const pendingEvents = await getPendingEvents();
    if (!Array.isArray(pendingEvents)) {
      throw new Error('The local R58 outbox returned an invalid event list.');
    }

    const outgoingEvents = pendingEvents.slice(0, batchSize);
    const outgoingIds = assertUniqueEventIds(outgoingEvents);
    const response = await exchange(outgoingEvents, acknowledgments);
    if (!response || !Array.isArray(response.incomingEvents)) {
      throw new Error('The peer returned an invalid R58 sync batch.');
    }

    const incomingIds = assertUniqueEventIds(response.incomingEvents);
    await applyIncomingEvents(response.incomingEvents);
    await markSentEvents(outgoingIds);

    outgoingIds.forEach((id) => sentEventIds.add(id));
    incomingIds.forEach((id) => receivedEventIds.add(id));
    acknowledgments = incomingIds;
    await saveAcknowledgments(acknowledgments);

    if (outgoingEvents.length === 0 && response.incomingEvents.length === 0) {
      return {
        sent: sentEventIds.size,
        received: receivedEventIds.size,
        acknowledgments,
        exchanges: exchangeNumber,
      };
    }
  }

  throw new Error(
    `LAN sync did not converge within ${maxExchanges} exchanges. Retry to continue syncing.`
  );
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_EXCHANGES,
  runR58SyncSession,
};
