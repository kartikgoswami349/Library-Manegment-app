/* global __dirname */

const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const { Buffer } = require('node:buffer');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const { endSocketWithData } = require('../lib/r58-socket-utils');
const { createR58Discovery } = require('./lan-discovery.cjs');
const { requestR58Packet } = require('./r58-transport.cjs');

let rendererServer;
let lanTransferServer;
let r58LanServer;
let lanTransferToken;
let lanR58Token = null;
let lanR58ExpiresAt = null;
let lanTransferServerStartPromise;
let lanTransferStartingToken;
let lanDeviceInfo = null;
let activeLanTransferPort = 45831;
let activeR58Port = 45858;
const activeClientSockets = new Set();
const r58Discovery = createR58Discovery({
  Bonjour: require('bonjour-service'),
  os: require('node:os'),
  getDeviceInfo: () => lanDeviceInfo,
});
const pendingLanTransferRequests = new Map();
const pendingR58Requests = new Map();
const failedLanAuth = new Map();
const MAX_LAN_REQUEST_BYTES = 20 * 1024 * 1024;
const MAX_LAN_TRANSFER_PACKAGE_BYTES = 512 * 1024 * 1024;

if (!app.isPackaged) {
  app.setPath(
    'sessionData',
    path.join(app.getPath('userData'), 'ashram-library-dev-session')
  );
  app.commandLine.appendSwitch('disable-http-cache');
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  }[extension] || 'application/octet-stream';
}

function startRendererServer() {
  const root = app.isPackaged
    ? path.join(app.getAppPath(), 'dist')
    : path.resolve(__dirname, '..', 'dist');
  const entryFile = path.join(root, 'index.html');
  if (!fs.existsSync(entryFile)) {
    throw new Error(`The desktop renderer export is missing: ${entryFile}`);
  }

  rendererServer = http.createServer(async (request, response) => {
    const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
    const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const candidate = path.resolve(root, relativePath);
    const safeRoot = path.resolve(root);
    const filePath = candidate.startsWith(`${safeRoot}${path.sep}`) ? candidate : path.join(root, 'index.html');
    const resolvedPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
      ? filePath
      : entryFile;

    response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    try {
      const content = await fs.promises.readFile(resolvedPath);
      response.writeHead(200, { 'Content-Type': getMimeType(resolvedPath) });
      response.end(content);
    } catch (error) {
      console.error(`Unable to serve desktop renderer file ${resolvedPath}:`, error);
      response.writeHead(500);
      response.end(`Unable to load the desktop application: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  return new Promise((resolve, reject) => {
    rendererServer.once('error', reject);
    rendererServer.listen(0, '127.0.0.1', () => {
      const address = rendererServer.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to start the desktop renderer.'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#FFF7FA',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const rendererUrl = process.env.ELECTRON_START_URL || await startRendererServer();
  await window.loadURL(rendererUrl);

  return window;
}

ipcMain.handle('library:app-info', () => ({
  platform: process.platform,
  version: app.getVersion(),
  packaged: app.isPackaged,
}));

ipcMain.handle('library:choose-file', async (_event, options = {}) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: Array.isArray(options.filters) ? options.filters : undefined,
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('library:save-file', async (_event, options = {}) => {
  const result = await dialog.showSaveDialog({
    defaultPath: typeof options.defaultPath === 'string' ? options.defaultPath : undefined,
    filters: Array.isArray(options.filters) ? options.filters : undefined,
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  if (typeof options.data === 'string') {
    fs.writeFileSync(
      result.filePath,
      options.encoding === 'base64' ? Buffer.from(options.data, 'base64') : options.data,
      options.encoding === 'base64' ? undefined : 'utf8'
    );
  }
  return result.filePath;
});

ipcMain.handle('library:read-file', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    throw new Error('The selected file path is invalid.');
  }
  const data = await fs.promises.readFile(filePath);
  return { data: data.toString('base64'), encoding: 'base64' };
});

function lanPairingFile() {
  return path.join(app.getPath('userData'), 'lan-pairing.enc');
}

ipcMain.handle('library:lan-pairing-get', async () => {
  const file = lanPairingFile();
  if (!fs.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage is unavailable for the saved LAN pairing.');
  }
  const encrypted = await fs.promises.readFile(file);
  const saved = JSON.parse(safeStorage.decryptString(encrypted));
  if (saved && typeof saved.pairing_code === 'string' && Array.isArray(saved.pairings)) {
    return {
      pairing_code: saved.pairing_code,
      pairings: saved.pairings,
      r58_pairing_code: typeof saved.r58_pairing_code === 'string' ? saved.r58_pairing_code : undefined,
      r58_pairing_expires_at: typeof saved.r58_pairing_expires_at === 'number' ? saved.r58_pairing_expires_at : undefined,
    };
  }
  if (
    saved &&
    typeof saved.address === 'string' &&
    typeof saved.host_device_id === 'string' &&
    typeof saved.password === 'string'
  ) {
    return {
      pairing_code: '',
      pairings: [{
        device_id: saved.host_device_id,
        device_name: `Library device ${saved.host_device_id.slice(-4)}`,
        address: saved.address,
        password: saved.password,
        host_cursor: Number.isSafeInteger(saved.host_cursor) && saved.host_cursor >= 0
          ? saved.host_cursor
          : 0,
        last_sync_at: typeof saved.last_sync_at === 'string' ? saved.last_sync_at : undefined,
      }],
    };
  }
  throw new Error('The saved LAN pairing data is invalid.');
});

ipcMain.handle('library:lan-pairing-save', async (_event, pairing) => {
  if (
    !pairing ||
    typeof pairing.pairing_code !== 'string' ||
    (pairing.pairing_code !== '' && !/^\d{6}$/.test(pairing.pairing_code)) ||
    !Array.isArray(pairing.pairings) ||
    !pairing.pairings.every((saved) =>
      saved &&
      typeof saved.device_id === 'string' &&
      typeof saved.device_name === 'string' &&
      typeof saved.address === 'string' &&
      typeof saved.password === 'string' &&
      Number.isSafeInteger(saved.host_cursor) &&
      saved.host_cursor >= 0
    )
  ) {
    throw new Error('The saved LAN pairing is invalid.');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Windows secure storage is unavailable for saving the LAN pairing.');
  }
  const file = lanPairingFile();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, safeStorage.encryptString(JSON.stringify(pairing)), { flag: 'wx' });
    await fs.promises.rename(temporary, file);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true });
    throw error;
  }
});

ipcMain.handle('library:lan-pairing-clear', async () => {
  await fs.promises.rm(lanPairingFile(), { force: true });
});

function tokensMatch(left, right) {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length &&
    crypto.timingSafeEqual(leftBytes, rightBytes);
}

function sendLanResponse(socket, status, body) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  const response = Buffer.concat([
    Buffer.from(
      `HTTP/1.1 ${status} ${status === 200 ? 'OK' : 'Request Failed'}\r\nContent-Type: application/json\r\nContent-Length: ${payload.length}\r\nConnection: close\r\n\r\n`,
      'utf8'
    ),
    payload,
  ]);
  socket.end(response);
}

function getLanRequestInfo(bytes) {
  const separator = bytes.indexOf('\r\n\r\n');
  if (separator < 0) return null;
  const headers = bytes.subarray(0, separator).toString('utf8').split('\r\n');
  const [method, requestPath] = (headers[0] || '').split(' ');
  if (method === 'GET' && (requestPath === '/discover' || requestPath === '/')) {
    return { discover: true };
  }
  const lengthLine = headers.find((line) => line.toLowerCase().startsWith('content-length:'));
  const length = Number.parseInt(lengthLine?.split(':')[1]?.trim() || '', 10);
  if (
    method !== 'POST' ||
    !(requestPath === '/sync' || requestPath === '/pair' || requestPath === '/unpair' || requestPath?.startsWith('/transfer/')) ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    length > MAX_LAN_REQUEST_BYTES
  ) {
    return { error: 'The LAN transfer request is invalid.' };
  }
  const bodyStart = separator + 4;
  if (bytes.length < bodyStart + length) return null;
  const authorization = headers.find((line) => line.toLowerCase().startsWith('authorization:'));
  const token = authorization?.split(':').slice(1).join(':').trim().match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return {
    path: requestPath,
    token: token || '',
    body: bytes.subarray(bodyStart, bodyStart + length).toString('utf8'),
  };
}

function forwardLanTransferRequest(socket, requestPath, body) {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window || window.isDestroyed()) {
    sendLanResponse(socket, 503, { error: 'The Library desktop app is not ready to receive transfers.' });
    return;
  }
  const requestId = crypto.randomUUID();
  const timeout = setTimeout(() => {
    pendingLanTransferRequests.delete(requestId);
    sendLanResponse(socket, 504, { error: 'The desktop transfer request timed out.' });
  }, 60_000);
  pendingLanTransferRequests.set(requestId, (result) => {
    clearTimeout(timeout);
    pendingLanTransferRequests.delete(requestId);
    sendLanResponse(socket, result.status, result.body);
  });
  window.webContents.send('library:lan-transfer-request', {
    request_id: requestId,
    path: requestPath,
    body,
    peer_address: `${(socket.remoteAddress || '').replace(/^::ffff:/, '')}:${activeLanTransferPort}`,
  });
}

async function listenNetServer(server, candidatePorts) {
  const ports = Array.isArray(candidatePorts) ? candidatePorts : [candidatePorts];
  let lastError = null;
  for (const port of ports) {
    try {
      await new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          server.removeListener('listening', handleListening);
          server.removeListener('error', handleListenError);
        };
        const handleListening = () => {
          if (settled) return;
          settled = true;
          cleanup();
          server.on('error', (err) => console.error(`Desktop LAN listener error on ${port}:`, err));
          resolve();
        };
        const handleListenError = (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        };
        server.once('error', handleListenError);
        server.once('listening', handleListening);
        try {
          server.listen(port);
        } catch (err) {
          handleListenError(err);
        }
      });
      return port;
    } catch (error) {
      lastError = error;
      console.warn(`Desktop port ${port} unavailable (${error.code || error.message}), trying next candidate...`);
    }
  }
  throw (
    lastError ||
    new Error(
      `LAN sync cannot use port(s) ${ports.join(', ')} because they are in use or restricted. Close another Ashram Library instance or restart the app, then try again.`
    )
  );
}

function forwardR58Request(socket, packet) {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window || window.isDestroyed()) {
    endSocketWithData(socket, `${JSON.stringify({
      version: 1,
      packetId: typeof packet?.packetId === 'string' ? packet.packetId : '',
      sourceDevice: { id: lanDeviceInfo?.device_id || '', name: lanDeviceInfo?.device_name || '' },
      direction: 'RESPONSE',
      type: ['pair', 'sync', 'unpair', 'discover'].includes(packet?.type) ? packet.type : 'sync',
      auth: '',
      status: 'error',
      error: 'The Library desktop app is not ready.',
      records: [],
    })}\n`);
    return;
  }
  const requestId = crypto.randomUUID();
  let connectionClosed = false;
  let completed = false;
  const timeout = setTimeout(() => respond({
    version: 1,
    packetId: typeof packet?.packetId === 'string' ? packet.packetId : '',
    sourceDevice: { id: lanDeviceInfo?.device_id || '', name: lanDeviceInfo?.device_name || '' },
    direction: 'RESPONSE',
    type: ['pair', 'sync', 'unpair', 'discover'].includes(packet?.type) ? packet.type : 'sync',
    auth: '',
    status: 'error',
    error: 'The desktop did not finish processing the R58 request within 60 seconds.',
    records: [],
  }), 60_000);
  const respond = (response) => {
    if (completed) return;
    completed = true;
    clearTimeout(timeout);
    pendingR58Requests.delete(requestId);
    if (connectionClosed) return;
    try {
      const responseToSend =
        response?.type === 'discover' && response.status === 'ok'
          ? {
              ...response,
              syncPort: activeLanTransferPort,
              r58Port: activeR58Port,
            }
          : response;
      endSocketWithData(socket, `${JSON.stringify(responseToSend)}\n`, () => connectionClosed);
    } catch (error) {
      console.warn('Unable to return the R58 response to the connected peer.', error);
      if (!socket.destroyed) socket.destroy();
    }
  };
  socket.once('close', () => {
    connectionClosed = true;
    if (!completed) {
      completed = true;
      clearTimeout(timeout);
      pendingR58Requests.delete(requestId);
    }
  });
  pendingR58Requests.set(requestId, respond);
  try {
    window.webContents.send('library:r58-request', {
      request_id: requestId,
      packet,
      peer_address: `${(socket.remoteAddress || '').replace(/^::ffff:/, '')}:${activeR58Port}`,
    });
  } catch (error) {
    respond({
      version: 1,
      packetId: typeof packet?.packetId === 'string' ? packet.packetId : '',
      sourceDevice: { id: lanDeviceInfo?.device_id || '', name: lanDeviceInfo?.device_name || '' },
      direction: 'RESPONSE',
      type: ['pair', 'sync', 'unpair', 'discover'].includes(packet?.type) ? packet.type : 'sync',
      auth: '',
      status: 'error',
      error: error instanceof Error ? error.message : 'Unable to dispatch the R58 request to the desktop app.',
      records: [],
    });
  }
}

ipcMain.handle('library:lan-discover', async () => {
  return r58Discovery.discover();
});

ipcMain.handle('library:lan-probe-device', async (_event, ip) => {
  if (typeof ip !== 'string' || !ip.trim()) return null;
  return r58Discovery.probeDirect(ip.trim());
});

ipcMain.on('library:r58-response', (event, response) => {
  const window = BrowserWindow.getAllWindows()[0];
  if (
    !window ||
    event.sender !== window.webContents ||
    !response ||
    typeof response.request_id !== 'string' ||
    !response.packet ||
    typeof response.packet !== 'object' ||
    Array.isArray(response.packet)
  ) {
    return;
  }
  const resolve = pendingR58Requests.get(response.request_id);
  if (resolve) resolve(response.packet);
});

ipcMain.on('library:lan-transfer-response', (event, response) => {
  const window = BrowserWindow.getAllWindows()[0];
  if (
    !window ||
    event.sender !== window.webContents ||
    !response ||
    typeof response.request_id !== 'string' ||
    !Number.isInteger(response.status) ||
    response.status < 200 ||
    response.status > 599 ||
    !response.body ||
    typeof response.body !== 'object' ||
    Array.isArray(response.body)
  ) {
    return;
  }
  const resolve = pendingLanTransferRequests.get(response.request_id);
  if (resolve) resolve(response);
});

ipcMain.handle('library:lan-transfer-server-start', async (_event, options = {}) => {
  const token = typeof options.token === 'string' ? options.token : '';
  if (
    !/^(?:\d{6}|[A-Za-z0-9._~-]{16,128})$/.test(token) ||
    typeof options.device_id !== 'string' ||
    typeof options.device_name !== 'string' ||
    !Number.isSafeInteger(options.paired_devices) ||
    options.paired_devices < 0
  ) {
    throw new Error('The LAN pairing code is invalid.');
  }
  if (lanTransferServer) {
    lanDeviceInfo = {
      device_id: options.device_id,
      device_name: options.device_name.slice(0, 40),
      paired_devices: options.paired_devices,
    };
    lanTransferToken = token;
    lanR58Token = typeof options.r58_token === 'string' ? options.r58_token : null;
    lanR58ExpiresAt = typeof options.r58_expires_at === 'number' ? options.r58_expires_at : null;
    return activeLanTransferPort;
  }
  if (lanTransferServerStartPromise) {
    return lanTransferServerStartPromise;
  }
  lanTransferStartingToken = token;
  lanR58Token = typeof options.r58_token === 'string' ? options.r58_token : null;
  lanR58ExpiresAt = typeof options.r58_expires_at === 'number' ? options.r58_expires_at : null;
  lanDeviceInfo = {
    device_id: options.device_id,
    device_name: options.device_name.slice(0, 40),
    paired_devices: options.paired_devices,
  };

  const server = net.createServer((socket) => {
    activeClientSockets.add(socket);
    socket.once('close', () => activeClientSockets.delete(socket));
    let requestBytes = Buffer.alloc(0);
    let handled = false;
    socket.setTimeout(60_000, () => {
      if (!handled) sendLanResponse(socket, 408, { error: 'The LAN transfer request timed out.' });
    });
    socket.on('data', (chunk) => {
      if (handled) return;
      requestBytes = Buffer.concat([requestBytes, chunk]);
      if (requestBytes.length > MAX_LAN_REQUEST_BYTES) {
        handled = true;
        sendLanResponse(socket, 413, { error: 'The LAN transfer request is too large.' });
        return;
      }
      const request = getLanRequestInfo(requestBytes);
      if (!request) return;
      handled = true;
      if (request.error) {
        sendLanResponse(socket, 400, { error: request.error });
        return;
      }
      if (request.discover) {
        sendLanResponse(socket, 200, {
          version: 1,
          device_id: lanDeviceInfo?.device_id || 'desktop',
          device_name: lanDeviceInfo?.device_name || 'Library Desktop',
          paired_devices: lanDeviceInfo?.paired_devices || 0,
          protocol_version: 1,
          sync_port: activeLanTransferPort,
          r58_port: activeR58Port,
        });
        return;
      }
      const peerAddress = (socket.remoteAddress || '').replace(/^::ffff:/, '');
      if (request.path === '/pair') {
        failedLanAuth.delete(peerAddress);
        forwardLanTransferRequest(socket, request.path, request.body);
        return;
      }
      const authState = failedLanAuth.get(peerAddress);
      if (authState && authState.blockedUntil > Date.now()) {
        sendLanResponse(socket, 429, { error: 'Too many incorrect pairing codes. Try again in one minute.' });
        return;
      }
      const isLanToken = tokensMatch(request.token, token);
      const isR58Token = lanR58Token && tokensMatch(request.token, lanR58Token) && (!lanR58ExpiresAt || Date.now() <= lanR58ExpiresAt);
      if (!isLanToken && !isR58Token) {
        const failures = (authState?.failures || 0) + 1;
        failedLanAuth.set(peerAddress, {
          failures: failures >= 5 ? 0 : failures,
          blockedUntil: failures >= 5 ? Date.now() + 60_000 : 0,
        });
        sendLanResponse(socket, 401, { error: 'The six-digit pairing code is invalid.' });
        return;
      }
      failedLanAuth.delete(peerAddress);
      forwardLanTransferRequest(socket, request.path, request.body);
    });
    socket.on('error', () => {});
  });

  const r58Server = net.createServer((socket) => {
    activeClientSockets.add(socket);
    socket.once('close', () => activeClientSockets.delete(socket));
    socket.setNoDelay(true);
    let requestBytes = Buffer.alloc(0);
    let handled = false;
    socket.setTimeout(60_000, () => {
      if (!handled) {
        handled = true;
        socket.end(`${JSON.stringify({ version: 1, status: 'error', error: 'The R58 request timed out.' })}\n`);
      }
    });
    socket.on('data', (chunk) => {
      if (handled) return;
      requestBytes = Buffer.concat([requestBytes, chunk]);
      if (requestBytes.length > MAX_LAN_REQUEST_BYTES) {
        handled = true;
        socket.end(`${JSON.stringify({ version: 1, status: 'error', error: 'The R58 packet is too large.' })}\n`);
        return;
      }
      const newline = requestBytes.indexOf(0x0a);
      if (newline < 0) return;
      handled = true;
      try {
        const packet = JSON.parse(requestBytes.subarray(0, newline).toString('utf8'));
        forwardR58Request(socket, packet);
      } catch {
        socket.end(`${JSON.stringify({ version: 1, status: 'error', error: 'The R58 packet is invalid JSON.' })}\n`);
      }
    });
    socket.on('error', () => {});
  });

  const startPromise = (async () => {
    try {
      const [boundTransferPort, boundR58Port] = await Promise.all([
        listenNetServer(server, [45831, 45832, 45833]),
        listenNetServer(r58Server, [45858, 45859, 45860]),
      ]);
      activeLanTransferPort = boundTransferPort;
      activeR58Port = boundR58Port;
      lanTransferServer = server;
      r58LanServer = r58Server;
      lanTransferToken = token;
      await r58Discovery.start({
        r58Port: activeR58Port,
        syncPort: activeLanTransferPort,
      }).catch((error) => {
        console.warn('Desktop LAN mDNS is unavailable; TCP sync remains active.', error);
      });
      return activeLanTransferPort;
    } catch (error) {
      await Promise.all([server, r58Server].map((listener) => new Promise((resolve) => {
        try {
          listener.close(() => resolve());
        } catch {
          resolve();
        }
      })));
      lanTransferServer = null;
      r58LanServer = null;
      lanTransferToken = null;
      lanR58Token = null;
      lanR58ExpiresAt = null;
      throw error;
    }
  })().finally(() => {
    if (lanTransferServerStartPromise === startPromise) {
      lanTransferServerStartPromise = null;
      lanTransferStartingToken = null;
    }
  });
  lanTransferServerStartPromise = startPromise;
  return startPromise;
});

ipcMain.handle('library:lan-transfer-server-stop', async () => {
  const servers = [lanTransferServer, r58LanServer].filter(Boolean);
  lanTransferServer = null;
  r58LanServer = null;
  lanTransferToken = null;
  lanR58Token = null;
  lanR58ExpiresAt = null;
  for (const socket of activeClientSockets) {
    try {
      socket.destroy();
    } catch {}
  }
  activeClientSockets.clear();
  await r58Discovery.stop();
  lanDeviceInfo = null;
  await Promise.all(servers.map((server) => new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  })));
});

ipcMain.handle('library:save-safety-backup', async (_event, options = {}) => {
  if (typeof options.data !== 'string' || typeof options.sha256 !== 'string') {
    throw new Error('The transfer safety backup is missing its data or checksum.');
  }
  const bytes = Buffer.from(options.data, 'base64');
  if (
    bytes.length === 0 ||
    bytes.length > MAX_LAN_TRANSFER_PACKAGE_BYTES ||
    crypto.createHash('sha256').update(bytes).digest('hex') !== options.sha256
  ) {
    throw new Error('The transfer safety backup failed its checksum or size check.');
  }
  const backupDirectory = path.join(app.getPath('userData'), 'library-safety-backups');
  await fs.promises.mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `LAN-Transfer-Safety-${stamp}.library`;
  const destination = path.join(backupDirectory, name);
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, bytes, { flag: 'wx' });
    await fs.promises.rename(temporary, destination);
    const saved = await fs.promises.readFile(destination);
    if (crypto.createHash('sha256').update(saved).digest('hex') !== options.sha256) {
      throw new Error('The transfer safety backup could not be verified.');
    }
  } catch (error) {
    await fs.promises.rm(temporary, { force: true });
    await fs.promises.rm(destination, { force: true });
    throw error;
  }
  const existing = (await fs.promises.readdir(backupDirectory))
    .filter((file) => /^LAN-Transfer-Safety-.*\.library$/.test(file))
    .sort()
    .reverse();
  for (const oldFile of existing.slice(5)) {
    await fs.promises.rm(path.join(backupDirectory, oldFile), { force: true });
  }
  return name;
});

ipcMain.handle('library:lan-request', async (_event, options = {}) => {
  const address = typeof options.address === 'string' ? options.address.trim() : '';
  const token = typeof options.token === 'string' ? options.token : '';
  const requestPath = typeof options.path === 'string' ? options.path : '/sync';
  const request = options.request;
  if (!address || !token || !request || typeof request !== 'object') {
    throw new Error('The desktop LAN request is missing required data.');
  }

  const normalized = address.replace(/^https?:\/\//i, '');
  const separator = normalized.lastIndexOf(':');
  const host = separator > normalized.lastIndexOf(']') ? normalized.slice(0, separator) : normalized;
  const port = separator > normalized.lastIndexOf(']')
    ? Number.parseInt(normalized.slice(separator + 1), 10)
    : 45831;
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('The host address must look like 192.168.1.12:45831.');
  }

  const payload = Buffer.from(JSON.stringify(request), 'utf8');
  if (payload.length > 20 * 1024 * 1024) {
    throw new Error('The LAN request is too large.');
  }

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setNoDelay(true);
    const chunks = [];
    let responseLength = 0;
    let settled = false;
    let responseTimer = null;
    const connectTimer = setTimeout(
      () => finish(new Error(
        `Could not connect to ${host}:${port}. Check that both devices are on the same Wi-Fi and allow inbound TCP port ${port} through the target device's firewall.`
      )),
      8000
    );
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      if (responseTimer) clearTimeout(responseTimer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value);
    };

    socket.on('error', (error) => finish(error));
    socket.on('data', (chunk) => {
      responseLength += chunk.length;
      if (responseLength > MAX_LAN_REQUEST_BYTES) {
        finish(new Error('The LAN device response is too large.'));
        return;
      }
      chunks.push(chunk);
    });
    socket.on('end', () => {
      const response = Buffer.concat(chunks).toString('utf8');
      const separatorIndex = response.indexOf('\r\n\r\n');
      if (separatorIndex < 0) {
        finish(new Error('The LAN device returned an invalid response.'));
        return;
      }
      const statusLine = response.slice(0, separatorIndex).split('\r\n')[0] || '';
      const status = Number.parseInt(statusLine.split(' ')[1], 10);
      let body;
      try {
        body = JSON.parse(response.slice(separatorIndex + 4));
      } catch {
        finish(new Error('The LAN device returned invalid JSON.'));
        return;
      }
      if (status < 200 || status >= 300) {
        finish(new Error(typeof body.error === 'string' ? body.error : `LAN request failed with status ${status}.`));
        return;
      }
      finish(null, body);
    });
    socket.once('connect', () => {
      clearTimeout(connectTimer);
      if (settled || socket.destroyed) return;
      responseTimer = setTimeout(
        () => finish(new Error(
          `The LAN device connected but did not respond to ${requestPath} within the allowed time.`
        )),
        requestPath.startsWith('/transfer/') ? 60000 : 15000
      );
      const headers = Buffer.from(
        `POST ${requestPath} HTTP/1.1\r\nHost: ${host}:${port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: ${payload.length}\r\nConnection: close\r\n\r\n`,
        'utf8'
      );
      socket.write(Buffer.concat([headers, payload]), (error) => {
        if (error) finish(new Error(`Unable to send the LAN request: ${error.message}`));
      });
    });
  });
});

ipcMain.handle('library:r58-request', async (_event, options = {}) => {
  const address = typeof options.address === 'string' ? options.address.trim() : '';
  const packet = options.packet;
  if (!address || !packet || typeof packet !== 'object' || Array.isArray(packet)) {
    throw new Error('The desktop R58 request is missing its address or packet.');
  }
  return requestR58Packet(address, packet);
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
}).catch((error) => {
  dialog.showErrorBox('Ashram Library could not start', error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on('window-all-closed', () => {
  rendererServer?.close();
  lanTransferServer?.close();
  r58LanServer?.close();
  lanTransferServer = null;
  r58LanServer = null;
  lanTransferToken = null;
  lanDeviceInfo = null;
  void r58Discovery.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
