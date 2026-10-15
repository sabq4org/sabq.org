import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptCredentials,
  encryptCredentials,
  sanitizeSecretText,
} from "../../server/services/socialPublishing/tokenCrypto";

describe("tokenCrypto — تشفير اعتماد النشر الاجتماعي", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIAL_PUBLISH_TOKEN_SECRET", "test-secret-for-social");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("يشفر ويفك التشفير ذهاباً وإياباً", () => {
    const creds = {
      accessToken: "at-123",
      refreshToken: "rt-456",
      tokenType: "bearer",
      scope: "tweet.read tweet.write",
    };
    const encrypted = encryptCredentials(creds);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(encrypted).not.toContain("at-123");
    expect(encrypted).not.toContain("rt-456");
    expect(decryptCredentials(encrypted)).toEqual(creds);
  });

  it("يفشل فك التشفير بمفتاح مختلف (يعيد null لا استثناء)", () => {
    const encrypted = encryptCredentials({ accessToken: "at" });
    vi.stubEnv("SOCIAL_PUBLISH_TOKEN_SECRET", "different-secret");
    expect(decryptCredentials(encrypted)).toBeNull();
  });

  it("يرفض التشفير بلا سر مضبوط", () => {
    vi.stubEnv("SOCIAL_PUBLISH_TOKEN_SECRET", "");
    vi.stubEnv("SESSION_SECRET", "");
    expect(() => encryptCredentials({ accessToken: "at" })).toThrow();
  });

  it("sanitizeSecretText يحجب Bearer والتوكنات في الروابط وJSON", () => {
    const dirty =
      'HTTP 401: Bearer abc.DEF-123 rejected; refresh_token=rt987&x=1 body {"access_token":"secret-at"}';
    const clean = sanitizeSecretText(dirty);
    expect(clean).not.toContain("abc.DEF-123");
    expect(clean).not.toContain("rt987");
    expect(clean).not.toContain("secret-at");
    expect(clean).toContain("Bearer [redacted]");
    expect(clean).toContain("refresh_token=[redacted]");
  });

  it("sanitizeSecretText يقص النص الطويل", () => {
    expect(sanitizeSecretText("x".repeat(1000)).length).toBe(500);
  });
});
