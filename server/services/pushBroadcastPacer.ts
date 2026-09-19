/**
 * Bounded-concurrency scheduler for broadcast transports.
 * Rate pacing is opt-in; the default preserves the established batch
 * throughput and never inserts an intentional timer delay.
 */

export interface PushBroadcastPacerOptions {
  maxPerSecond?: number;
  maxConcurrent?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface PushedResult<T, R> {
  item: T;
  value?: R;
  error?: unknown;
}

export interface PushBroadcastPacer<T, R> {
  run(items: readonly T[], send: (item: T) => Promise<R>): Promise<PushedResult<T, R>[]>;
}

// Match the existing 100-token APNs batch; do not impose a delivery delay.
const DEFAULT_MAX_CONCURRENT = 100;

function bounded(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value as number)));
}

function envRate(): number | undefined {
  const raw = process.env.PUSH_BROADCAST_MAX_PER_SECOND;
  if (!raw) return undefined;
  const configured = Number(raw);
  return Number.isFinite(configured) && configured > 0 ? configured : undefined;
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function createPushBroadcastPacer<T, R>(options: PushBroadcastPacerOptions = {}): PushBroadcastPacer<T, R> {
  const maxPerSecond = Number.isFinite(options.maxPerSecond) && options.maxPerSecond! > 0
    ? options.maxPerSecond
    : envRate();
  const configuredConcurrency = bounded(Number.parseInt(process.env.PUSH_BROADCAST_MAX_CONCURRENT || "", 10), DEFAULT_MAX_CONCURRENT, 1, 100);
  const maxConcurrent = bounded(options.maxConcurrent, configuredConcurrency, 1, 100);
  const sleep = options.sleep || defaultSleep;
  const intervalMs = maxPerSecond === undefined ? 0 : 1000 / maxPerSecond;
  let nextStartAt = 0;

  return {
    async run(items, send) {
      const results: PushedResult<T, R>[] = new Array(items.length);
      let cursor = 0;

      const worker = async () => {
        while (true) {
          const index = cursor++;
          if (index >= items.length) return;

          if (maxPerSecond !== undefined) {
            const now = Date.now();
            const startAt = Math.max(now, nextStartAt);
            nextStartAt = startAt + intervalMs;
            if (startAt > now) await sleep(startAt - now);
          }

          try {
            results[index] = { item: items[index], value: await send(items[index]) };
          } catch (error) {
            // Keep one explicit result for every input. A transport exception
            // must be counted by the caller instead of silently dropping a token.
            results[index] = { item: items[index], error };
          }
        }
      };

      const workers = Math.min(maxConcurrent, items.length);
      await Promise.all(Array.from({ length: workers }, () => worker()));
      return results;
    },
  };
}

export async function runPacedBroadcast<T, R>(
  items: readonly T[],
  send: (item: T) => Promise<R>,
  options: PushBroadcastPacerOptions = {},
): Promise<PushedResult<T, R>[]> {
  return createPushBroadcastPacer<T, R>(options).run(items, send);
}
