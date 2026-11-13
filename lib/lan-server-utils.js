function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error
    ? error.code
    : undefined;
}

function isAddressInUse(error) {
  const code = errorCode(error);
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : String(error ?? '');
  return (
    code === 'EADDRINUSE' ||
    code === 'EACCES' ||
    message.includes('EADDRINUSE') ||
    message.includes('EACCES') ||
    message.includes('address already in use')
  );
}

function listenSingle(server, port, host = '0.0.0.0') {
  if (!server || typeof server.listen !== 'function') {
    return Promise.reject(new Error('The LAN listener is unavailable.'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      server.removeListener('listening', handleListening);
      server.removeListener('error', handleError);
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(port);
    };
    const handleListening = () => finish();
    const handleError = (error) => finish(error instanceof Error ? error : new Error(String(error)));

    server.once('listening', handleListening);
    server.once('error', handleError);
    try {
      server.listen({ port, host, reuseAddress: true }, handleListening);
    } catch (error) {
      handleError(error);
    }
  });
}

async function listenOnAvailablePort(server, candidatePorts, host = '0.0.0.0') {
  const ports = Array.isArray(candidatePorts) ? candidatePorts : [candidatePorts];
  let lastError = null;

  for (const port of ports) {
    try {
      await listenSingle(server, port, host);
      return port;
    } catch (error) {
      lastError = error;
      if (isAddressInUse(error)) {
        // Port is occupied; try next candidate in list
        continue;
      }
      throw error;
    }
  }

  const err = new Error(
    `LAN sync cannot bind TCP port(s) ${ports.join(', ')} because they are in use or restricted. Close the other app or restart it, then try again.`
  );
  err.code = 'EADDRINUSE';
  err.cause = lastError;
  throw err;
}

function listenWithOwnership(server, port, host = '0.0.0.0') {
  // If port is a number, allow fallback to port + 1 and port + 2 if EADDRINUSE occurs
  const candidates = typeof port === 'number' ? [port, port + 1, port + 2] : [port];
  return listenOnAvailablePort(server, candidates, host).then(() => undefined);
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  if (typeof server.close !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    try {
      server.close(finish);
      // Give a maximum of 500ms for clean close before proceeding
      setTimeout(finish, 500);
    } catch (error) {
      finish();
    }
  });
}

module.exports = {
  closeServer,
  isAddressInUse,
  listenOnAvailablePort,
  listenWithOwnership,
};
