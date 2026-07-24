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

function sweep(): void {
  const now = Date.now();
  for (const [k, e] of memory) if (e.expiresAt <= now) memory.delete(k);
}

/** Record one failed attempt for `key`; returns the running count in the window. */
export async function recordFailure(key: string): Promise<number> {
  const redis = getRedisSessionAdapter();
  const k = PREFIX + key;
  if (redis) {
    const next = Number((await redis.get(k)) || "0") + 1;
    await redis.set(k, String(next), { expiration: { type: "EX", value: WINDOW_SECONDS } });
    return next;
  }
  sweep();
  const now = Date.now();
  const e = memory.get(k);
  if (!e || e.expiresAt <= now) {
    memory.set(k, { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 });
    return 1;
  }
  e.count += 1;
  return e.count;
}

/** True once `key` has reached `max` failures within the window. */
export async function isLockedOut(key: string, max: number): Promise<boolean> {
  const redis = getRedisSessionAdapter();
  const k = PREFIX + key;
  if (redis) return Number((await redis.get(k)) || "0") >= max;
  sweep();
  const e = memory.get(k);
  if (!e || e.expiresAt <= Date.now()) return false;
  return e.count >= max;
}

/** Clear the counter after a successful verification. */
export async function clearFailures(key: string): Promise<void> {
  const redis = getRedisSessionAdapter();
  const k = PREFIX + key;
  if (redis) {
    await redis.del(k);
    return;
  }
  memory.delete(k);
}
