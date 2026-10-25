import { describe, expect, it } from "vitest";
import {
  hasFirstPartyFrame,
  isClientAbortError,
  shouldSendServerEvent,
  sanitizeServerEvent,
  type MinimalServerEvent,
} from "../../server/utils/sentryServerNoise";

function nodeError(props: Record<string, unknown>): Error {
  return Object.assign(new Error(String(props.message ?? "socket error")), props);
}

/** حدث بمكدس كله في express/@sentry — هذا شكل NODE-EXPRESS-A حرفيًا. */
const VENDOR_ONLY_EVENT: MinimalServerEvent = {
  exception: {
    values: [
      {
        stacktrace: {
          frames: [
            { in_app: false },
            { in_app: false },
            { in_app: false },
          ],
        },
      },
    ],
  },
};

/** حدث فيه إطار من كودنا — أي خطأ مرّ بخدمة لنا. */
const APP_EVENT: MinimalServerEvent = {
  exception: {
    values: [{ stacktrace: { frames: [{ in_app: false }, { in_app: true }] } }],
  },
};

describe("isClientAbortError", () => {
  it("يتعرف على قطع العميل", () => {
    expect(isClientAbortError(nodeError({ code: "ECONNRESET", syscall: "read" }))).toBe(true);
    expect(isClientAbortError(nodeError({ code: "ECONNABORTED" }))).toBe(true);
    expect(isClientAbortError(nodeError({ code: "EPIPE", syscall: "write" }))).toBe(true);
    expect(isClientAbortError(nodeError({ type: "request.aborted" }))).toBe(true);
    expect(isClientAbortError(nodeError({ message: "request aborted" }))).toBe(true);
    expect(isClientAbortError(nodeError({ message: "Request aborted" }))).toBe(true);
  });

  it("لا يبتلع أخطاء التطبيق ولا انقطاعات قواعد البيانات المكتوبة", () => {
    expect(isClientAbortError(nodeError({ message: "Connection terminated unexpectedly" }))).toBe(false);
    expect(isClientAbortError(nodeError({ message: "timeout exceeded when trying to connect" }))).toBe(false);
    expect(isClientAbortError(nodeError({ code: "ETIMEDOUT", syscall: "connect" }))).toBe(false);
    expect(isClientAbortError(new TypeError("x is not a function"))).toBe(false);
    expect(isClientAbortError(null)).toBe(false);
    expect(isClientAbortError("ECONNRESET")).toBe(false);
  });
});

describe("hasFirstPartyFrame", () => {
  it("يميّز مكدس المكتبات عن مكدس فيه كودنا", () => {
    expect(hasFirstPartyFrame(VENDOR_ONLY_EVENT)).toBe(false);
    expect(hasFirstPartyFrame(APP_EVENT)).toBe(true);
    expect(hasFirstPartyFrame({})).toBe(false);
  });
});

describe("shouldSendServerEvent", () => {
  it("NODE-EXPRESS-A: قطع العميل بمكدس مكتبات فقط → يسقط", () => {
    const err = nodeError({ code: "ECONNRESET", syscall: "read", message: "read ECONNRESET" });
    expect(shouldSendServerEvent(VENDOR_ONLY_EVENT, err)).toBe(false);
  });

  it("NODE-EXPRESS-J: قطع Multer بحرف R كبير ومكدس مكتبات فقط → يسقط", () => {
    const err = nodeError({ message: "Request aborted" });
    expect(shouldSendServerEvent(VENDOR_ONLY_EVENT, err)).toBe(false);
  });

  it("قطع اتصال مرّ بكودنا → يمرّ (قد يكون خللًا حقيقيًا في خدمة لنا)", () => {
    const err = nodeError({ code: "ECONNRESET", syscall: "read" });
    expect(shouldSendServerEvent(APP_EVENT, err)).toBe(true);
  });

  it("خطأ تطبيق عادي بمكدس مكتبات → يمرّ", () => {
    expect(shouldSendServerEvent(VENDOR_ONLY_EVENT, new TypeError("boom"))).toBe(true);
  });

  it("مهلة مسبح Postgres لا تُصنَّف قطعَ عميل أبدًا", () => {
    const err = nodeError({ message: "timeout exceeded when trying to connect" });
    expect(shouldSendServerEvent(VENDOR_ONLY_EVENT, err)).toBe(true);
  });
});

describe("sanitizeServerEvent", () => {
  it("يزيل body/query/cookies والرؤوس الحساسة ويحتفظ بتشخيص الطلب الآمن", () => {
    const event = {
      request: {
        method: "POST",
        url: "https://api.example.test/api/auth/callback?code=synthetic-code&state=synthetic-state",
        data: { code: "synthetic-code", state: "synthetic-state" },
        body: { password: "synthetic-password" },
        query_string: { state: "synthetic-state" },
        cookies: { session: "synthetic-cookie" },
        env: { SECRET_VALUE: "synthetic-secret" },
        headers: {
          "content-type": "application/json",
          "user-agent": "synthetic-agent",
          accept: "application/json",
          host: "api.example.test",
          referer: "https://example.test/previous",
          origin: "https://example.test",
          Authorization: "Bearer synthetic-token",
          Cookie: "session=synthetic-cookie",
          "Set-Cookie": "session=synthetic-cookie",
          "X-API-Key": "synthetic-api-key",
        },
      },
      extra: {
        authToken: "synthetic-token",
        oauth_code: "synthetic-code",
        csrf_state: "synthetic-state",
        status_code: 500,
        diagnostic: "kept",
      },
      user: { id: "synthetic-user", email: "synthetic@example.test" },
    };

    const sanitized = sanitizeServerEvent(event);
    expect(sanitized.request).toEqual({
      method: "POST",
      url: "https://api.example.test/api/auth/callback",
      headers: {
        "content-type": "application/json",
        "user-agent": "synthetic-agent",
        accept: "application/json",
      },
    });
    expect(sanitized.extra).toEqual({ status_code: 500, diagnostic: "kept" });
    expect(sanitized.user).toBeUndefined();
    expect(event.request.url).toContain("synthetic-code");
  });

  it("ينقّي أسماء الحقول الحساسة داخل سياقات متداخلة دون تعديل الحدث الأصلي", () => {
    const event = {
      contexts: {
        oauth: {
          clientSecret: "synthetic-secret",
          passwordHash: "synthetic-password-hash",
          secret_key: "synthetic-secret-key",
          private_key: "synthetic-private-key",
          email: "synthetic@example.test",
          phone_number: "synthetic-phone",
          state: "synthetic-state",
        },
      },
      tags: { route: "/api/auth/callback", token_value: "synthetic-token", region: "iad" },
      breadcrumbs: [{ data: { password: "synthetic-password", ip_address: "synthetic-ip", status_code: 401 } }],
      exception: { values: [{ code: "E_SYNTHETIC", state: "workflow-state" }] },
    };

    const sanitized = sanitizeServerEvent(event);
    expect(sanitized).toEqual({
      contexts: { oauth: { state: "synthetic-state" } },
      tags: { route: "/api/auth/callback", region: "iad" },
      breadcrumbs: [{ data: { status_code: 401 } }],
      exception: { values: [{ code: "E_SYNTHETIC", state: "workflow-state" }] },
    });
    expect(event.contexts.oauth.clientSecret).toBe("synthetic-secret");
  });

  it("ينقّي query/body من breadcrumb ويجرد URL مع إبقاء data وstatus_code", () => {
    const event = {
      breadcrumbs: [{
        data: {
          "http.query": "synthetic-query",
          url: "https://api.example.test/callback?code=synthetic-code",
          body: { payload: "synthetic-body" },
          status_code: 502,
          data: { diagnostic: "kept" },
        },
      }],
    };

    expect(sanitizeServerEvent(event)).toEqual({
      breadcrumbs: [{
        data: {
          url: "https://api.example.test/callback",
          status_code: 502,
          data: { diagnostic: "kept" },
        },
      }],
    });
  });
});
