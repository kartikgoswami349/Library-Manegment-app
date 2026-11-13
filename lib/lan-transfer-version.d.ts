export function isTransferVersionAuthoritative(
  candidate: { changed_at: string; device_id: string },
  current: { changed_at: string; device_id: string } | undefined,
  candidateDeviceId: string
): boolean;
