export type SocketLifecycle = {
  readonly destroyed?: boolean;
};

export function decodeUtf8(bytes: Uint8Array, start?: number, end?: number): string;

export function isSocketWritable(
  socket: SocketLifecycle | null | undefined,
  isClosed?: () => boolean
): boolean;

export function destroySocketWhenConnected(
  socket: (SocketLifecycle & { destroy(): unknown }) | null | undefined,
  connected: boolean,
  isClosed?: () => boolean
): boolean;

export function endSocketWithData(
  socket: SocketLifecycle & {
    end(data: string | Uint8Array): unknown;
  },
  data: string | Uint8Array,
  isClosed?: () => boolean
): boolean;
