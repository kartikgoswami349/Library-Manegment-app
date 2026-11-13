const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');

const { requestR58Packet } = require('../electron/r58-transport.cjs');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('exchanges one newline-framed packet and accepts a fragmented response', async () => {
  const server = net.createServer((socket) => {
    let request = '';
    socket.on('data', (chunk) => {
      request += chunk.toString('utf8');
      const newline = request.indexOf('\n');
      if (newline < 0) return;
      const packet = JSON.parse(request.slice(0, newline));
      const response = Buffer.from(JSON.stringify({
        version: 1,
        packetId: packet.packetId,
        sourceDevice: { id: 'peer-1', name: 'Peer' },
        direction: 'RESPONSE',
        type: packet.type,
        auth: '',
        status: 'ok',
        records: [],
      }) + '\n');
      socket.write(response.subarray(0, 12));
      setTimeout(() => socket.end(response.subarray(12)), 5);
    });
  });
  const port = await listen(server);

  try {
    const response = await requestR58Packet(`127.0.0.1:${port}`, {
      version: 1,
      packetId: 'request-1',
      sourceDevice: { id: 'local-1', name: 'Local' },
      direction: 'REQUEST',
      type: 'discover',
      auth: '',
      records: [],
    });
    assert.equal(response.packetId, 'request-1');
    assert.equal(response.sourceDevice.id, 'peer-1');
    assert.equal(response.type, 'discover');
  } finally {
    await close(server);
  }
});

test('reports a closed connection instead of leaving a request pending', async () => {
  const server = net.createServer();
  const port = await listen(server);
  await close(server);

  await assert.rejects(
    requestR58Packet(`127.0.0.1:${port}`, {
      version: 1,
      packetId: 'request-2',
      sourceDevice: { id: 'local-1', name: 'Local' },
      direction: 'REQUEST',
      type: 'pair',
      auth: '',
      records: [],
    }, { connectTimeoutMs: 200 }),
    /connect|ECONNREFUSED|socket/i
  );
});
