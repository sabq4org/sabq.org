/**
 * Pending-2FA challenge store for the token-based mobile auth flow.
 *
 * The web login holds its mid-2FA state in the Passport session
 * (`pending2FAUserId`). Mobile clients are session-less (bearer tokens), so a
 * successful password check on an account with 2FA enabled instead returns a
 * short-lived, single-use challenge token. The client must then present a valid
 * TOTP / backup code together with this token before any real session is minted.
 *
 * Storage: Redis when connected (multi-pod safe — production runs Redis), with
 * an in-memory fallback for single-instance / dev. The store never grants
 * access on its own; it only maps an opaque token → userId for a few minutes,
 * and fails closed (returns null) when the token is missing, expired, or reused.
 */
import crypto from "crypto";
import { getRedisClient } from "../redis";

const PREFIX = "m2fa:";
const TTL_SECONDS = 5 * 60;

// Fallback used only when Redis is not connected. `expiresAt` is epoch ms.
const memoryStore = new Map<string, { userId: string; expiresAt: number }>();

function sweepMemory(): void {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt <= now) memoryStore.delete(key);
  }
}

/** Create a single-use challenge for `userId`; returns the opaque token. */
export async function createTwoFactorChallenge(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const key = PREFIX + token;
  const redis = getRedisClient();
  if (redis) {
    await redis.set(key, userId, { expiration: { type: "EX", value: TTL_SECONDS } });
  } else {
    sweepMemory();
    memoryStore.set(key, { userId, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  }
  return token;
}

/**
 * Resolve and CONSUME a challenge token (single-use). Returns the userId on a
 * valid, unexpired token, or null otherwise. Consuming on read prevents a
 * captured token from being replayed across multiple TOTP guesses.
 */
export async function consumeTwoFactorChallenge(token: unknown): Promise<string | null> {
  if (typeof token !== "string" || token.length === 0) return null;
  const key = PREFIX + token;
  const redis = getRedisClient();
  if (redis) {
    const userId = await redis.get(key);
    if (userId) await redis.del(key);
    return userId || null;
  }
  sweepMemory();
  const entry = memoryStore.get(key);
  if (!entry) return null;
  memoryStore.delete(key);
  if (entry.expiresAt <= Date.now()) return null;
  return entry.userId;
}
