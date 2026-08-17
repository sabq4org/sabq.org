import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import {
  buildAuthorizeRequest,
  exchangeAuthorizationCode,
  revokeAccessToken,
  xOAuthConfigured,
  X_OAUTH_SCOPES,
} from "../../server/services/socialPublishing/xApiClient";
import { SocialProviderError } from "../../server/services/socialPublishing/types";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("xApiClient — OAuth وبناء طلب التفويض", () => {
  beforeEach(() => {
    vi.stubEnv("X_CLIENT_ID", "client-id-test");
    vi.stubEnv("X_CLIENT_SECRET", "client-secret-test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("xOAuthConfigured يعكس وجود متغيرات البيئة", () => {
    expect(xOAuthConfigured()).toBe(true);
    vi.stubEnv("X_CLIENT_SECRET", "");
    expect(xOAuthConfigured()).toBe(false);
  });

  it("يبني رابط تفويض PKCE S256 بكل النطاقات المطلوبة", () => {
    const { authorizeUrl, state, codeVerifier } = buildAuthorizeRequest(
      "https://sabq.org/api/social-publishing/x/oauth/callback",
    );
    const url = new URL(authorizeUrl);
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_id")).toBe("client-id-test");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("scope")).toBe(X_OAUTH_SCOPES);
    for (const scope of ["tweet.write", "media.write", "offline.access", "users.read"]) {
      expect(X_OAUTH_SCOPES).toContain(scope);
    }
    // التحدي مشتق من المحقق وليس هو نفسه
    expect(url.searchParams.get("code_challenge")).not.toBe(codeVerifier);
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
  });

  it("تبادل الكود الناجح يعيد الاعتماد وتاريخ الانتهاء", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        access_token: "at-1",
        refresh_token: "rt-1",
        expires_in: 7200,
        token_type: "bearer",
        scope: X_OAUTH_SCOPES,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await exchangeAuthorizationCode({
      code: "code-1",
      codeVerifier: "verifier-1",
      redirectUri: "https://sabq.org/cb",
    });
    expect(result.credentials.accessToken).toBe("at-1");
    expect(result.credentials.refreshToken).toBe("rt-1");
    expect(result.expiresAt).toBeInstanceOf(Date);
    // الطلب يحمل Basic auth للعميل السري
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("429 من X يصنَّف خطأً مؤقتاً قابلاً لإعادة المحاولة", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(429, { title: "Too Many Requests" })),
    );
    try {
      await exchangeAuthorizationCode({ code: "c", codeVerifier: "v", redirectUri: "https://r" });
      expect.unreachable("كان يجب أن يرمي");
    } catch (err) {
      expect(err).toBeInstanceOf(SocialProviderError);
      expect((err as SocialProviderError).opts.retryable).toBe(true);
      expect((err as SocialProviderError).opts.httpStatus).toBe(429);
    }
  });

  it("400 من X يصنَّف خطأً دائماً ولا يسرب أسراراً في الرسالة", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: "invalid_request",
          error_description: "Value passed for the token was invalid: refresh_token=super-secret",
        }),
      ),
    );
    try {
      await exchangeAuthorizationCode({ code: "c", codeVerifier: "v", redirectUri: "https://r" });
      expect.unreachable("كان يجب أن يرمي");
    } catch (err) {
      const pErr = err as SocialProviderError;
      expect(pErr.opts.retryable).toBe(false);
      expect(pErr.message).not.toContain("super-secret");
    }
  });

  it("فشل الشبكة يصنَّف مؤقتاً", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket hang up")));
    try {
      await exchangeAuthorizationCode({ code: "c", codeVerifier: "v", redirectUri: "https://r" });
      expect.unreachable("كان يجب أن يرمي");
    } catch (err) {
      expect((err as SocialProviderError).opts.retryable).toBe(true);
    }
  });

  it("revokeAccessToken لا يرمي حتى عند فشل الإبطال (أفضل جهد)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(revokeAccessToken("some-token")).resolves.toBeUndefined();
  });
});
