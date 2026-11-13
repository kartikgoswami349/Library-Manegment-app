const { Buffer } = require('buffer');

function isSocketWritable(socket, isClosed = () => false) {
  return Boolean(socket && !socket.destroyed && !isClosed());
}

function decodeUtf8(bytes, start = 0, end = bytes.length) {
  return Buffer.prototype.toString.call(bytes, 'utf8', start, end);
}

function endSocketWithData(socket, data, isClosed = () => false) {
  if (!isSocketWritable(socket, isClosed)) return false;
  socket.end(data);
  return true;
}

function destroySocketWhenConnected(socket, connected, isClosed = () => false) {
  if (!connected || !isSocketWritable(socket, isClosed)) return false;
  socket.destroy();
  return true;
}

module.exports = {
  decodeUtf8,
  destroySocketWhenConnected,
  endSocketWithData,
  isSocketWritable,
};
