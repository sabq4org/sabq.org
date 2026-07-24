import { describe, it, expect, vi } from "vitest";
import {
  createTwoFactorChallenge,
  resolveTwoFactorChallenge,
  consumeTwoFactorChallenge,
} from "../../server/services/mobileTwoFactorChallenge";

// Guards the token-based mobile 2FA flow (security audit S-01). Without REDIS_URL
// the store uses its in-memory fallback, which is what these assertions exercise.
// Security-critical properties: resolve fails closed on every bad path, and a
// challenge only stops working once explicitly consumed (on successful verify) —
// so a wrong code can be retried but a password alone never mints a session.
describe("mobileTwoFactorChallenge", () => {
  it("resolves a challenge token to its userId", async () => {
    const token = await createTwoFactorChallenge("user-123");
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(await resolveTwoFactorChallenge(token)).toBe("user-123");
  });

  it("allows repeated resolve (retry) until consumed, then fails closed", async () => {
    const token = await createTwoFactorChallenge("user-abc");
    expect(await resolveTwoFactorChallenge(token)).toBe("user-abc"); // 1st (wrong code)
    expect(await resolveTwoFactorChallenge(token)).toBe("user-abc"); // 2nd (retry)
    await consumeTwoFactorChallenge(token); // success burns it
    expect(await resolveTwoFactorChallenge(token)).toBeNull();
  });

  it("fails closed on missing / malformed tokens", async () => {
    expect(await resolveTwoFactorChallenge("does-not-exist")).toBeNull();
    expect(await resolveTwoFactorChallenge("")).toBeNull();
    expect(await resolveTwoFactorChallenge(undefined)).toBeNull();
    expect(await resolveTwoFactorChallenge(null)).toBeNull();
    expect(await resolveTwoFactorChallenge(12345)).toBeNull();
  });

  it("expires after the 5-minute TTL", async () => {
    vi.useFakeTimers();
    try {
      const token = await createTwoFactorChallenge("user-exp");
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // TTL + 1s
      expect(await resolveTwoFactorChallenge(token)).toBeNull();
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
