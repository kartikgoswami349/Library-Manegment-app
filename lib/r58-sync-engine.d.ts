export type R58SyncEventLike = {
  id: string;
};

export type R58SyncExchangeResult<TEvent> = {
  incomingEvents: TEvent[];
};

export type R58SyncSessionResult = {
  sent: number;
  received: number;
  acknowledgments: string[];
  exchanges: number;
};

export const DEFAULT_BATCH_SIZE: 200;
export const DEFAULT_MAX_EXCHANGES: 1000;

export function runR58SyncSession<TEvent extends R58SyncEventLike>(
  options: {
    getPendingEvents: () => Promise<TEvent[]>;
    exchange: (
      outgoingEvents: TEvent[],
      acknowledgments: string[]
    ) => Promise<R58SyncExchangeResult<TEvent>>;
    applyIncomingEvents: (events: TEvent[]) => Promise<unknown>;
    markSentEvents: (eventIds: string[]) => Promise<unknown>;
    saveAcknowledgments: (eventIds: string[]) => Promise<unknown>;
    initialAcknowledgments?: string[];
    batchSize?: number;
    maxExchanges?: number;
  }
): Promise<R58SyncSessionResult>;
