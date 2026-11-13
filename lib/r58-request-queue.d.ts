export function createR58RequestQueue(): <T>(
  task: () => T | Promise<T>
) => Promise<T>;

export function dispatchR58Request<T>(
  enqueue: <TQueued>(task: () => TQueued | Promise<TQueued>) => Promise<TQueued>,
  type: string,
  task: () => T | Promise<T>
): Promise<T>;
