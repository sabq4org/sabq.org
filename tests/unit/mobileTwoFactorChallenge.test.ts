import { describe, it, expect, vi } from "vitest";
import {
  createTwoFactorChallenge,
  consumeTwoFactorChallenge,
} from "../../server/services/mobileTwoFactorChallenge";

// Guards the token-based mobile 2FA flow (security audit S-01). Without REDIS_URL
// the store uses its in-memory fallback, which is what these assertions exercise.
// The security-critical properties: a challenge resolves ONCE, and every other
// path fails closed (returns null) so a password alone can never mint a session.
describe("mobileTwoFactorChallenge", () => {
  it("round-trips a challenge token to its userId", async () => {
    const token = await createTwoFactorChallenge("user-123");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(await consumeTwoFactorChallenge(token)).toBe("user-123");
  });

  it("is single-use — a consumed token never resolves again", async () => {
    const token = await createTwoFactorChallenge("user-abc");
    expect(await consumeTwoFactorChallenge(token)).toBe("user-abc");
    expect(await consumeTwoFactorChallenge(token)).toBeNull();
  });

  it("fails closed on missing / malformed tokens", async () => {
    expect(await consumeTwoFactorChallenge("does-not-exist")).toBeNull();
    expect(await consumeTwoFactorChallenge("")).toBeNull();
    expect(await consumeTwoFactorChallenge(undefined)).toBeNull();
    expect(await consumeTwoFactorChallenge(null)).toBeNull();
    expect(await consumeTwoFactorChallenge(12345)).toBeNull();
  });

  it("expires after the 5-minute TTL", async () => {
    vi.useFakeTimers();
    try {
      const token = await createTwoFactorChallenge("user-exp");
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // TTL + 1s
      expect(await consumeTwoFactorChallenge(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("issues a unique, unguessable token per challenge", async () => {
    const a = await createTwoFactorChallenge("u1");
    const b = await createTwoFactorChallenge("u1");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex
  });
});
