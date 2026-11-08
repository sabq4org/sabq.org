type RedisSubscriptionEvent = "ready" | "close" | "end" | "reconnecting";

export interface RedisSubscriptionClient {
  on(event: RedisSubscriptionEvent, listener: (...args: unknown[]) => void): unknown;
  off(event: RedisSubscriptionEvent, listener: (...args: unknown[]) => void): unknown;
  subscribe(channel: string): Promise<unknown>;
  status?: string;
}

export interface RedisSubscriptionOptions {
  channel: string;
  retryBaseMs?: number;
  retryMaxMs?: number;
  onReadyChange?: (ready: boolean) => void;
  onSubscribeError?: (error: unknown) => void;
}

/**
 * Owns one Redis channel subscription, including reconnects and bounded
 * exponential retries. Subscription failures are always observed here.
 */
export function createRedisSubscription(
  client: RedisSubscriptionClient,
  options: RedisSubscriptionOptions,
) {
  const retryBaseMs = Math.max(1, options.retryBaseMs ?? 500);
  const retryMaxMs = Math.max(retryBaseMs, options.retryMaxMs ?? 30_000);
  let started = false;
  let connectionReady = false;
  let ready = false;
  let epoch = 0;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: { epoch: number } | null = null;

  const setReady = (value: boolean) => {
    if (ready === value) return;
    ready = value;
    try {
      options.onReadyChange?.(value);
    } catch (error) {
      console.error("Redis subscription readiness handler failed:", error);
    }
  };

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };

  const scheduleRetry = (currentEpoch: number) => {
    if (!started || currentEpoch !== epoch || retryTimer) return;
    const delay = Math.min(retryBaseMs * 2 ** retryAttempt, retryMaxMs);
    retryAttempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void attemptSubscribe(currentEpoch);
    }, delay);
    retryTimer.unref?.();
  };

  const attemptSubscribe = async (currentEpoch: number): Promise<void> => {
    if (!started || !connectionReady || currentEpoch !== epoch || ready) return;
    if (inFlight?.epoch === currentEpoch) return;
    clearRetry();

    const flight = { epoch: currentEpoch };
    inFlight = flight;
    try {
      // Promise.resolve also captures a synchronous throw from test doubles or
      // clients with a nonstandard subscribe implementation.
      await Promise.resolve().then(() => client.subscribe(options.channel));
      if (!started || !connectionReady || currentEpoch !== epoch) return;
      retryAttempt = 0;
      setReady(true);
    } catch (error) {
      if (!started || !connectionReady || currentEpoch !== epoch) return;
      setReady(false);
      try {
        options.onSubscribeError?.(error);
      } catch (handlerError) {
        console.error("Redis subscription error handler failed:", handlerError);
      }
      scheduleRetry(currentEpoch);
    } finally {
      if (inFlight === flight) inFlight = null;
      // A reconnect can emit ready while an older subscription is still
      // settling. Once it settles, make one attempt for the current epoch.
      if (started && currentEpoch !== epoch && !ready && !retryTimer && inFlight?.epoch !== epoch) {
        void attemptSubscribe(epoch);
      }
    }
  };

  const onReady = () => {
    if (!started) return;
    connectionReady = true;
    if (ready || inFlight?.epoch === epoch) return;
    clearRetry();
    void attemptSubscribe(epoch);
  };

  const onUnavailable = () => {
    if (!started) return;
    connectionReady = false;
    epoch += 1;
    retryAttempt = 0;
    clearRetry();
    setReady(false);
  };

  return {
    start() {
      if (started) return this;
      started = true;
      client.on("ready", onReady);
      client.on("close", onUnavailable);
      client.on("end", onUnavailable);
      client.on("reconnecting", onUnavailable);
      if (client.status === "ready") onReady();
      return this;
    },
    stop() {
      if (!started) return;
      started = false;
      connectionReady = false;
      epoch += 1;
      clearRetry();
      client.off("ready", onReady);
      client.off("close", onUnavailable);
      client.off("end", onUnavailable);
      client.off("reconnecting", onUnavailable);
      setReady(false);
    },
    isReady: () => ready,
  };
}
