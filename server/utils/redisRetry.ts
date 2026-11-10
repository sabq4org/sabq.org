/**
 * ioredis `retryStrategy` shared by every Redis client in the API.
 *
 * It never returns null. Returning null after N attempts (the previous
 * behaviour, N = 5 ≈ a few seconds) puts the client in its terminal `end`
 * state: nothing reconnects it, so one short Upstash blip left that instance
 * without Redis — sessions on the Postgres fallback, no cross-instance cache
 * invalidation, no leader lease — until the next deploy.
 *
 * Backoff grows 200ms per attempt and settles at one attempt every 30s.
 */
export const REDIS_RETRY_MAX_DELAY_MS = 30_000;

export function redisRetryDelay(times: number): number {
  return Math.min(Math.max(1, times) * 200, REDIS_RETRY_MAX_DELAY_MS);
}
