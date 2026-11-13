function createSerialQueue() {
  let pending = Promise.resolve();

  return function enqueue(task) {
    const operation = pending.then(task);
    pending = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  };
}

module.exports = { createSerialQueue };
