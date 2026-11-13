function isTransferVersionAuthoritative(candidate, current, candidateDeviceId) {
  if (!current) return true;
  const candidateTime = Date.parse(candidate.changed_at);
  const currentTime = Date.parse(current.changed_at);
  return candidateTime > currentTime ||
    (candidateTime === currentTime && (
      candidate.device_id > current.device_id ||
      (candidate.device_id === current.device_id &&
        candidate.device_id === candidateDeviceId)
    ));
}

module.exports = { isTransferVersionAuthoritative };
