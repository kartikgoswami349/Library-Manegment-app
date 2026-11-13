const net = require('node:net');

const PORT = 45858;
const MAX_REQUEST_BYTES = 20 * 1024 * 1024;
const DEFAULT_CONNECT_TIMEOUT_MS = 8_000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 60_000;

function parseAddress(address) {
  const normalized = String(address || '').trim().replace(/^(?:https?|tcp):\/\//i, '');
  const separator = normalized.lastIndexOf(':');
  const hasPort = separator > normalized.lastIndexOf(']');
  const host = hasPort ? normalized.slice(0, separator) : normalized;
  const port = hasPort
    ? Number.parseInt(normalized.slice(separator + 1), 10)
    : PORT;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The R58 host address must look like 192.168.1.12:45858.');
  }
  return { host, port };
}

function requestTimeouts(packet, options = {}) {
  const requestTimeout = packet?.type === 'discover'
    ? 1_200
    : packet?.type === 'pair' || packet?.type === 'unpair'
      ? 15_000
      : DEFAULT_RESPONSE_TIMEOUT_MS;
  return {
    connectTimeoutMs: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    responseTimeoutMs: options.responseTimeoutMs ?? requestTimeout,
  };
}

function requestR58Packet(address, packet, options = {}) {
  const { host, port } = parseAddress(address);
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    return Promise.reject(new Error('The R58 request packet is invalid.'));
  }
  const payload = Buffer.from(`${JSON.stringify(packet)}\n`, 'utf8');
  if (payload.length > MAX_REQUEST_BYTES) {
    return Promise.reject(new Error('The R58 request is too large.'));
  }
  const { connectTimeoutMs, responseTimeoutMs } = requestTimeouts(packet, options);

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let responseLength = 0;
    let response = Buffer.alloc(0);
    let settled = false;
    let responseTimer = null;
    const connectTimer = setTimeout(
      () => finish(new Error(
        `Could not connect to ${host}:${port} on TCP port ${port}. Keep the Library app open on the target device and allow inbound TCP port ${port} through its firewall on a trusted private network.`
      )),
      connectTimeoutMs
    );

    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      if (responseTimer) clearTimeout(responseTimer);
      if (!socket.destroyed) socket.destroy();
      if (error) reject(error);
      else resolve(value);
    }

    socket.setNoDelay(true);
    socket.once('connect', () => {
      clearTimeout(connectTimer);
      if (settled || socket.destroyed) return;
      responseTimer = setTimeout(
        () => finish(new Error(`Timed out waiting for an R58 response from ${host}:${port}.`)),
        responseTimeoutMs
      );
      try {
        socket.write(payload, (error) => {
          if (error) finish(new Error(`Unable to send the R58 request: ${error.message}`));
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.on('data', (chunk) => {
      if (settled) return;
      responseLength += chunk.length;
      if (responseLength > MAX_REQUEST_BYTES) {
        finish(new Error('The R58 device response is too large.'));
        return;
      }
      response = Buffer.concat([response, chunk]);
      const newline = response.indexOf(0x0a);
      if (newline < 0) return;
      try {
        finish(null, JSON.parse(response.subarray(0, newline).toString('utf8')));
      } catch {
        finish(new Error('The R58 device returned invalid JSON.'));
      }
    });
    socket.on('error', (error) => finish(error));
    socket.once('close', () => {
      if (!settled) {
        finish(new Error('The R58 connection closed before a response arrived.'));
      }
    });
  });
}

module.exports = { requestR58Packet };
