function createDiscoveryCache(discover, cooldownMs, now = Date.now) {
  let cachedAt = Number.NEGATIVE_INFINITY;
  let cachedDevices = [];
  let inFlight = null;

  return function getDiscoveredDevices(force = false) {
    if (inFlight) return inFlight;
    if (!force && now() - cachedAt < cooldownMs) {
      return Promise.resolve(cachedDevices);
    }

    inFlight = Promise.resolve()
      .then(discover)
      .then((devices) => {
        cachedAt = now();
        cachedDevices = devices;
        return devices;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
}

function createPendingLibraryTransfer(savePairing, transfer) {
  return async function runTransfer(pairing, syncChanged) {
    if (!syncChanged && pairing.content_sync_pending === false) {
      return pairing;
    }

    const pending = { ...pairing, content_sync_pending: true };
    await savePairing(pending);
    await transfer(pending);

    const completed = { ...pending, content_sync_pending: false };
    await savePairing(completed);
    return completed;
  };
}

module.exports = { createDiscoveryCache, createPendingLibraryTransfer };
