const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const net = require('node:net');
const { getIpv4HostCandidates, isR58DiscoveryResponse, resolveR58Service } = require('../lib/lan-discovery-utils');
const { requestR58Packet } = require('./r58-transport.cjs');

const SERVICE_TYPE = 'r58inventory';
const SERVICE_PROTOCOL = 'tcp';
const PRIMARY_R58_PORT = 45858;
const FALLBACK_R58_PORT = 45859;
const THIRD_R58_PORT = 45860;
const PRIMARY_SYNC_PORT = 45831;
const FALLBACK_SYNC_PORT = 45832;
const THIRD_SYNC_PORT = 45833;
const DISCOVERY_WINDOW_MS = 1_500;
const PROBE_CONCURRENCY = 24;
const PROBE_TIMEOUT_MS = 1_200;

function createR58Discovery({
  Bonjour,
  os,
  getDeviceInfo,
  requestPacket = requestR58Packet,
}) {
  let bonjour = null;
  let browser = null;
  let publication = null;
  let expiryTimer = null;
  let publishedR58Port = null;
  let publishedSyncPort = null;
  const mdnsDevices = new Map();
  const serviceIds = new Map();
  const deviceServices = new Map();

  function isLikelyVirtualAdapter(name) {
    const lower = String(name || '').toLowerCase();
    return (
      lower.includes('vethernet') ||
      lower.includes('hyper-v') ||
      lower.includes('wsl') ||
      lower.includes('virtualbox') ||
      lower.includes('vmware') ||
      lower.includes('pseudo') ||
      lower.includes('bluetooth') ||
      lower.includes('tailscale') ||
      lower.includes('zerotier')
    );
  }

  function localNetworks() {
    const interfaces = os.networkInterfaces();
    const result = [];
    // Prioritize physical Wi-Fi and Ethernet adapters
    const names = Object.keys(interfaces).sort((a, b) => {
      const aVirt = isLikelyVirtualAdapter(a) ? 1 : 0;
      const bVirt = isLikelyVirtualAdapter(b) ? 1 : 0;
      return aVirt - bVirt;
    });

    for (const name of names) {
      const list = interfaces[name] || [];
      for (const info of list) {
        if (
          info &&
          (info.family === 'IPv4' || info.family === 4) &&
          !info.internal &&
          info.address &&
          !info.address.startsWith('169.254.')
        ) {
          result.push({
            name,
            address: info.address,
            netmask: info.netmask || '255.255.255.0',
            isVirtual: isLikelyVirtualAdapter(name),
          });
        }
      }
    }
    return result;
  }

  function stringValue(value) {
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    return value == null ? '' : String(value);
  }

  function serviceUp(service) {
    const device = resolveR58Service(service, localNetworks());
    if (!device) return;
    const local = getDeviceInfo();
    if (local && device.device_id === local.device_id) return;

    mdnsDevices.set(device.device_id, {
      device_id: device.device_id,
      device_name: device.device_name,
      address: `${device.address}:${device.sync_port || PRIMARY_SYNC_PORT}`,
      r58_address: `${device.address}:${device.port || PRIMARY_R58_PORT}`,
      paired_devices: 0,
      protocol_version: 1,
    });
    const serviceName = String(device.service_name || '').replace(/\.local\.?$/i, '');
    if (serviceName) {
      serviceIds.set(serviceName, device.device_id);
      deviceServices.set(device.device_id, serviceName);
    }
  }

  function serviceDown(service) {
    const serviceName = stringValue(service?.name || service?.fqdn).replace(/\.local\.?$/i, '');
    const deviceId = serviceIds.get(serviceName);
    if (!deviceId || deviceServices.get(deviceId)?.replace(/\.local\.?$/i, '') !== serviceName) return;
    serviceIds.delete(serviceName);
    deviceServices.delete(deviceId);
    mdnsDevices.delete(deviceId);
  }

  function ensureBonjour() {
    if (!bonjour) {
      bonjour = new Bonjour(undefined, (error) => {
        console.warn('Desktop LAN mDNS notice:', error?.message || error);
      });
    }
    return bonjour;
  }

  function ensureBrowser() {
    if (!browser) {
      try {
        browser = ensureBonjour().find(
          { type: SERVICE_TYPE, protocol: SERVICE_PROTOCOL },
          serviceUp
        );
        browser.on?.('down', serviceDown);
        browser.on?.('error', (error) => {
          console.warn('Desktop mDNS discovery browser warning:', error?.message || error);
        });
        for (const service of browser.services || []) serviceUp(service);
      } catch (err) {
        console.warn('Unable to initialize mDNS browser:', err?.message || err);
      }
    }
    if (!expiryTimer) {
      expiryTimer = setInterval(() => {
        try {
          browser?.expire?.();
        } catch {
          // ignore
        }
      }, 10_000);
      expiryTimer.unref?.();
    }
    return browser;
  }

  function safeServiceName(device) {
    const name = String(device.device_name || 'Library')
      .replace(/[^a-zA-Z0-9-_ ]/g, '')
      .trim()
      .slice(0, 30) || 'Library';
    return `R58-${name}-${String(device.device_id).slice(-6)}`;
  }

  async function start({ r58Port = PRIMARY_R58_PORT, syncPort = PRIMARY_SYNC_PORT } = {}) {
    const local = getDeviceInfo();
    if (!local?.device_id) return;
    try {
      const mdns = ensureBonjour();
      if (
        publication &&
        (publishedR58Port !== r58Port || publishedSyncPort !== syncPort)
      ) {
        try { publication.stop?.(); } catch {}
        publication = null;
      }
      if (!publication) {
        publication = mdns.publish({
          name: safeServiceName(local),
          type: SERVICE_TYPE,
          protocol: SERVICE_PROTOCOL,
          port: r58Port,
          disableIPv6: true,
          txt: {
            id: local.device_id,
            name: local.device_name,
            deviceId: local.device_id,
            deviceName: local.device_name,
            protocol: '1',
            syncPort: String(syncPort),
          },
        });
        publication.on?.('error', (error) => {
          console.warn('Unable to advertise desktop mDNS service:', error?.message || error);
        });
        publishedR58Port = r58Port;
        publishedSyncPort = syncPort;
      }
      ensureBrowser();
    } catch (err) {
      console.warn('mDNS start warning:', err?.message || err);
    }
  }

  function probeR58(
    host,
    port = PRIMARY_R58_PORT,
    expectedDeviceId,
    fallbackSyncPort = PRIMARY_SYNC_PORT
  ) {
    if (!host) return Promise.resolve(null);
    const packetId = crypto.randomUUID();
    const local = getDeviceInfo();
    const packet = {
      version: 1,
      packetId,
      sourceDevice: {
        id: local?.device_id || 'probe',
        name: local?.device_name || 'Library Desktop',
      },
      direction: 'REQUEST',
      type: 'discover',
      auth: '',
      records: [],
    };
    return requestPacket(`${host}:${port}`, packet, {
      connectTimeoutMs: PROBE_TIMEOUT_MS,
      responseTimeoutMs: PROBE_TIMEOUT_MS,
    })
      .then((response) => {
        if (!isR58DiscoveryResponse(response, packetId, expectedDeviceId)) return null;
        return {
          device_id: response.sourceDevice.id,
          device_name: response.sourceDevice.name || `Library Device ${response.sourceDevice.id.slice(-4)}`,
          address: `${host}:${
            Number.isSafeInteger(response.syncPort) &&
            response.syncPort > 0 &&
            response.syncPort < 65536
              ? response.syncPort
              : fallbackSyncPort
          }`,
          r58_address: `${host}:${port}`,
          paired_devices: 0,
          protocol_version: 1,
        };
      })
      .catch(() => null);
  }

  function probeLegacy(host, port = PRIMARY_SYNC_PORT) {
    return new Promise((resolve) => {
      let settled = false;
      let response = Buffer.alloc(0);
      const socket = net.createConnection({ host, port });
      const timeout = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

      function finish(device) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try { socket.destroy(); } catch {}
        resolve(device);
      }

      socket.setNoDelay(true);
      socket.once('connect', () => {
        if (settled) return;
        try {
          socket.write(`GET /discover HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: close\r\n\r\n`);
        } catch {
          finish(null);
        }
      });

      socket.on('data', (chunk) => {
        if (settled) return;
        response = Buffer.concat([response, chunk]);
        if (response.length > 8192) {
          finish(null);
          return;
        }
        const separatorIndex = response.indexOf('\r\n\r\n');
        if (separatorIndex < 0) return;
        const header = response.subarray(0, separatorIndex).toString('utf8');
        const lengthLine = header.split('\r\n').find((line) => line.toLowerCase().startsWith('content-length:'));
        const length = Number.parseInt(lengthLine?.split(':')[1]?.trim() || '', 10);
        const bodyStart = separatorIndex + 4;
        if (!Number.isSafeInteger(length) || length < 0 || response.length < bodyStart + length) return;

        try {
          const body = JSON.parse(response.subarray(bodyStart, bodyStart + length).toString('utf8'));
          if (
            header.split('\r\n')[0]?.includes(' 200 ') &&
            body.version === 1 &&
            typeof body.device_id === 'string' &&
            typeof body.device_name === 'string'
          ) {
            finish({
              device_id: body.device_id,
              device_name: body.device_name,
              address: `${host}:${
                Number.isSafeInteger(body.sync_port) &&
                body.sync_port > 0 &&
                body.sync_port < 65536
                  ? body.sync_port
                  : port
              }`,
              r58_address: `${host}:${
                Number.isSafeInteger(body.r58_port) &&
                body.r58_port > 0 &&
                body.r58_port < 65536
                  ? body.r58_port
                  : PRIMARY_R58_PORT
              }`,
              paired_devices: Number.isSafeInteger(body.paired_devices) ? body.paired_devices : 0,
              protocol_version: 1,
            });
          } else {
            finish(null);
          }
        } catch {
          finish(null);
        }
      });

      socket.on('error', () => finish(null));
      socket.once('close', () => finish(null));
    });
  }

  async function probeHost(host) {
    if (!host) return null;
    // Try the known R58 listener ports in bind order.
    const r1 = await probeR58(host, PRIMARY_R58_PORT);
    if (r1) return r1;
    const r2 = await probeR58(host, FALLBACK_R58_PORT);
    if (r2) return r2;
    const r3 = await probeR58(host, THIRD_R58_PORT);
    if (r3) return r3;
    const p1 = await probeLegacy(host, PRIMARY_SYNC_PORT);
    if (p1) return p1;
    const p2 = await probeLegacy(host, FALLBACK_SYNC_PORT);
    if (p2) return p2;
    return probeLegacy(host, THIRD_SYNC_PORT);
  }

  async function probeDirect(ipOrAddress) {
    const raw = String(ipOrAddress || '').trim().replace(/^(?:https?|tcp):\/\//i, '');
    const separator = raw.lastIndexOf(':');
    const host = separator > raw.lastIndexOf(']') ? raw.slice(0, separator) : raw;
    const explicitPort = separator > raw.lastIndexOf(']') ? Number.parseInt(raw.slice(separator + 1), 10) : null;

    if (explicitPort) {
      const legacy = await probeLegacy(host, explicitPort);
      if (legacy) return legacy;
      const r58 = await probeR58(host, explicitPort);
      if (r58) return r58;
    }
    return probeHost(host);
  }

  async function discover() {
    const local = getDeviceInfo();
    const verified = new Map();

    // 1. Gather mDNS candidates
    try {
      const mdnsBrowser = ensureBrowser();
      mdnsBrowser?.update?.();
      if (mdnsBrowser) {
        await new Promise((resolve) => setTimeout(resolve, DISCOVERY_WINDOW_MS));
      }
    } catch {}

    // Verify mDNS addresses before exposing them as pairable peers.
    const mdnsResults = await Promise.all(
      [...mdnsDevices.entries()]
        .filter(([id]) => id !== local?.device_id)
        .map(async ([id, device]) => {
          const separator = device.r58_address.lastIndexOf(':');
          const host = device.r58_address.slice(0, separator);
          const port = Number.parseInt(device.r58_address.slice(separator + 1), 10);
          const syncSeparator = device.address.lastIndexOf(':');
          const syncPort = Number.parseInt(device.address.slice(syncSeparator + 1), 10);
          if (
            separator <= 0 ||
            !Number.isInteger(port) ||
            syncSeparator <= 0 ||
            !Number.isInteger(syncPort)
          ) return null;
          return probeR58(host, port, id, syncPort);
        })
    );
    for (const device of mdnsResults) {
      if (device && device.device_id !== local?.device_id) {
        verified.set(device.device_id, device);
      }
    }
    if (verified.size > 0) {
      return [...verified.values()];
    }

    // 2. Scan physical Wi-Fi / Ethernet subnets
    const networks = localNetworks().filter((n) => !n.isVirtual);
    // If no physical networks identified, fall back to all
    const scanNetworks = networks.length ? networks : localNetworks();

    const candidateHosts = [...new Set(
      scanNetworks.flatMap((network) =>
        getIpv4HostCandidates(network.address, network.netmask || '255.255.255.0')
      )
    )];

    for (let offset = 0; offset < candidateHosts.length; offset += PROBE_CONCURRENCY) {
      const batch = candidateHosts.slice(offset, offset + PROBE_CONCURRENCY);
      const results = await Promise.all(batch.map((host) => probeHost(host)));
      for (const device of results) {
        if (!device || device.device_id === local?.device_id) continue;
        verified.set(device.device_id, device);
      }
      // If we found devices and probed local neighborhood, we can keep scanning or return
    }

    return [...verified.values()].filter((device) => device.device_id !== local?.device_id);
  }

  async function stop() {
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = null;
    mdnsDevices.clear();
    serviceIds.clear();
    deviceServices.clear();
    try { browser?.stop?.(); } catch {}
    try { publication?.stop?.(); } catch {}
    browser = null;
    publication = null;
    publishedR58Port = null;
    publishedSyncPort = null;
    if (bonjour) {
      try { bonjour.destroy(); } catch {}
    }
    bonjour = null;
  }

  return { start, discover, probeDirect, stop };
}

module.exports = { createR58Discovery };
