const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('libraryDesktop', {
  isElectron: true,
  getAppInfo: () => ipcRenderer.invoke('library:app-info'),
  checkForUpdates: () => ipcRenderer.invoke('library:check-for-updates'),
  chooseFile: (options) => ipcRenderer.invoke('library:choose-file', options),
  saveFile: (options) => ipcRenderer.invoke('library:save-file', options),
  readFile: (filePath) => ipcRenderer.invoke('library:read-file', filePath),
  lanRequest: (options) => ipcRenderer.invoke('library:lan-request', options),
  r58Request: (options) => ipcRenderer.invoke('library:r58-request', options),
  discoverLanDevices: () => ipcRenderer.invoke('library:lan-discover'),
  probeLanDevice: (ip) => ipcRenderer.invoke('library:lan-probe-device', ip),
  getLanPairing: () => ipcRenderer.invoke('library:lan-pairing-get'),
  saveLanPairing: (pairing) => ipcRenderer.invoke('library:lan-pairing-save', pairing),
  clearLanPairing: () => ipcRenderer.invoke('library:lan-pairing-clear'),
  startLanTransferServer: (options) => ipcRenderer.invoke('library:lan-transfer-server-start', options),
  stopLanTransferServer: () => ipcRenderer.invoke('library:lan-transfer-server-stop'),
  saveSafetyBackup: (options) => ipcRenderer.invoke('library:save-safety-backup', options),
  onLanTransferRequest: (callback) => {
    const listener = (_event, request) => {
      Promise.resolve(callback(request))
        .then((response) => ipcRenderer.send('library:lan-transfer-response', {
          request_id: request.request_id,
          ...response,
        }))
        .catch((error) => ipcRenderer.send('library:lan-transfer-response', {
          request_id: request.request_id,
          status: 500,
          body: { error: error instanceof Error ? error.message : 'Unable to process the LAN transfer request.' },
        }));
    };
    ipcRenderer.on('library:lan-transfer-request', listener);
    return () => ipcRenderer.removeListener('library:lan-transfer-request', listener);
  },
  onR58Request: (callback) => {
    const listener = (_event, request) => {
      Promise.resolve(callback(request))
        .then((packet) => ipcRenderer.send('library:r58-response', {
          request_id: request.request_id,
          packet,
        }))
        .catch((error) => ipcRenderer.send('library:r58-response', {
          request_id: request.request_id,
          packet: {
            version: 1,
            packetId: request.packet.packetId,
            sourceDevice: request.packet.sourceDevice,
            direction: 'RESPONSE',
            type: request.packet.type,
            auth: '',
            status: 'error',
            error: error instanceof Error ? error.message : 'Unable to process the R58 request.',
            records: [],
          },
        }));
    };
    ipcRenderer.on('library:r58-request', listener);
    return () => ipcRenderer.removeListener('library:r58-request', listener);
  },
});
