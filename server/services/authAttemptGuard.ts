/**
 * Per-account failed-attempt lockout for code-guessing surfaces (2FA verify,
 * password-reset code). The IP-keyed express-rate-limiters bound abuse per
 * source IP, but the exact threat model here is an attacker who already holds
 * the victim's password and can rotate source IPs — so the online guess of a
 * 6-digit TOTP / reset code must ALSO be bounded per ACCOUNT (audit #4).
 *
 * Backed by Redis when available (shared across pods), with an in-memory
 * fallback. Best-effort read-modify-write — a few extra attempts under a race
 * are acceptable; the point is to turn an unbounded online guess into a locked
 * one after N failures within the window.
 */
import { getRedisSessionAdapter } from "../redis";

const PREFIX = "authfail:";
const WINDOW_SECONDS = 15 * 60;

const memory = new Map<string, { count: number; expiresAt: number }>();
let lastRedisWarningAt = 0;

function sweep(): void {
  const now = Date.now();
  for (const [k, e] of memory) if (e.expiresAt <= now) memory.delete(k);
}

function memoryCount(k: string): number {
  sweep();
  const entry = memory.get(k);
  return entry && entry.expiresAt > Date.now() ? entry.count : 0;
}

function recordMemoryFailure(k: string): number {
  sweep();
  const now = Date.now();
  const entry = memory.get(k);
  if (!entry || entry.expiresAt <= now) {
    memory.set(k, { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function syncMemoryCount(k: string, count: number): void {
  if (count <= 0) {
    memory.delete(k);
    return;
  }
  memory.set(k, {
    count,
    expiresAt: Date.now() + WINDOW_SECONDS * 1000,
  });
}

function warnRedisFallback(err: unknown): void {
  const now = Date.now();
  if (now - lastRedisWarningAt < 30_000) return;
  lastRedisWarningAt = now;
  const message = err instanceof Error ? err.message : String(err);
  const reason = /temporarily rate-limited/i.test(message)
    ? "rate limited"
    : /command timed out|timeout/i.test(message)
      ? "command timed out"
      : "command failed";
  console.warn(`[AuthAttemptGuard] Redis ${reason} — using per-process lockout fallback`);
}

/** Record one failed attempt for `key`; returns the running count in the window. */
export async function recordFailure(key: string): Promise<number> {
  const redis = getRedisSessionAdapter();
  const k = PREFIX + key;
  // Mirror locally even while Redis is healthy. If the shared store becomes
  // unavailable between attempts, the pod keeps enforcing the attempts it
  // already observed instead of restarting the counter from zero.
  let fallbackCount = recordMemoryFailure(k);
  if (!redis) return fallbackCount;
  try {
    const next = Number((await redis.get(k)) || "0") + 1;
    // Preserve the shared count if the write itself is the command that fails.
    fallbackCount = Math.max(fallbackCount, next);
    syncMemoryCount(k, fallbackCount);
    await redis.set(k, String(next), { expiration: { type: "EX", value: WINDOW_SECONDS } });
    // Redis is authoritative whenever it is reachable. Reconcile stale local
    // state left by another pod clearing the shared counter.
    syncMemoryCount(k, next);
    return next;
  } catch (err) {
    warnRedisFallback(err);
    return fallbackCount;
  }
}

/** True once `key` has reached `max` failures within the window. */
export async function isLockedOut(key: string, max: number): Promise<boolean> {
  const redis = getRedisSessionAdapter();
  const k = PREFIX + key;
  if (!redis) return memoryCount(k) >= max;
  try {
    const sharedCount = Number((await redis.get(k)) || "0");
    syncMemoryCount(k, sharedCount);
    return sharedCount >= max;
  } catch (err) {
    // Login must not become an unhandled rejection when Upstash is throttled
    // or ioredis reaches commandTimeout. The in-process guard remains active.
    warnRedisFallback(err);
    return memoryCount(k) >= max;
  }
}

/** Clear the counter after a successful verification. */
export async function clearFailures(key: string): Promise<void> {
  const redis = getRedisSessionAdapter();
  const k = PREFIX + key;
  memory.delete(k);
  if (redis) {
    try {
      await redis.del(k);
    } catch (err) {
      warnRedisFallback(err);
    }
    return;
  }
}
