const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const net = require('node:net');
const test = require('node:test');

const {
  closeServer,
  listenOnAvailablePort,
  listenWithOwnership,
} = require('../lib/lan-server-utils');

class FakeServer extends EventEmitter {
  listen(options, callback) {
    this.options = options;
    this.callback = callback;
    return this;
  }

  close(callback) {
    callback?.();
    return this;
  }
}

test('binds with address reuse enabled and resolves only after listening', async () => {
  const server = new FakeServer();
  const listening = listenWithOwnership(server, 45858);

  assert.deepEqual(server.options, {
    port: 45858,
    host: '0.0.0.0',
    reuseAddress: true,
  });
  server.emit('listening');
  await listening;
});

test('tries the next reserved port when the preferred port is occupied', async () => {
  const server = new FakeServer();
  server.listen = function (options, callback) {
    this.options = options;
    queueMicrotask(() => {
      if (options.port === 45858) {
        this.emit('error', Object.assign(new Error('address already in use'), {
          code: 'EADDRINUSE',
        }));
      } else {
        this.emit('listening');
        callback?.();
      }
    });
    return this;
  };
  const listening = listenWithOwnership(server, 45858);
  await listening;
  assert.equal(server.options.port, 45859);
});

test('rejects after every reserved port is occupied', async () => {
  const server = new FakeServer();
  server.listen = function (options) {
    this.options = options;
    queueMicrotask(() => this.emit('error', Object.assign(
      new Error('address already in use'),
      { code: 'EADDRINUSE' }
    )));
    return this;
  };

  await assert.rejects(listenOnAvailablePort(server, [45858, 45859, 45860]), {
    code: 'EADDRINUSE',
    message: /45858, 45859, 45860/,
  });
});

test('recognizes native bind errors that expose EADDRINUSE only in the message', async () => {
  const server = new FakeServer();
  server.listen = function (options) {
    this.options = options;
    queueMicrotask(() => this.emit('error', new Error('bind failed: EADDRINUSE')));
    return this;
  };

  await assert.rejects(listenOnAvailablePort(server, [45858, 45859, 45860]), {
    code: 'EADDRINUSE',
    message: /45858, 45859, 45860/,
  });
});

test('binds the contender to the fallback when the preferred TCP port is owned', async () => {
  const owner = net.createServer();
  const contender = net.createServer();
  await listenWithOwnership(owner, 0, '127.0.0.1');
  const port = owner.address().port;

  try {
    const boundPort = await listenOnAvailablePort(
      contender,
      [port, port + 1],
      '127.0.0.1'
    );
    assert.equal(boundPort, port + 1);
    assert.equal(contender.address().port, port + 1);
  } finally {
    await Promise.all([closeServer(owner), closeServer(contender)]);
  }
});

test('closes a listener and treats an already-closed server as clean', async () => {
  const server = new FakeServer();
  await closeServer(server);
  await closeServer(null);

  const alreadyClosed = new FakeServer();
  alreadyClosed.close = (callback) =>
    callback(Object.assign(new Error('not running'), { code: 'ERR_SERVER_NOT_RUNNING' }));
  await closeServer(alreadyClosed);
});
