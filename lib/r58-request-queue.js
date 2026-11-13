function createR58RequestQueue() {
  let pending = Promise.resolve();

  return function enqueue(task) {
    const result = pending.then(task);
    pending = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}

function dispatchR58Request(enqueue, type, task) {
  return type === 'discover' ? Promise.resolve().then(task) : enqueue(task);
}

module.exports = { createR58RequestQueue, dispatchR58Request };
