import session from "express-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_DEGRADED_HEADER,
  SessionFailoverStore,
  sessionIdFromCookieHeader,
} from "../../server/sessionFailoverStore";
import {
  SESSION_DEGRADED_MESSAGE,
  getQueryFn,
  isDegradedSessionResponse,
  isRetriableError,
} from "../../client/src/lib/queryClient";

/**
 * التمييز بين «انتهت جلستك» و«تعذّرت قراءة جلستك الآن».
 *
 * بدونه يصل الردّان إلى العميل بالشكل نفسه (401)، فتعرض الواجهة «انتهت
 * صلاحية جلستك» وتحوّل المحرّر إلى /login أثناء عطل عابر في Redis — وقد
 * يفقد مسودّة غير محفوظة. الجلسة في تلك اللحظة موجودة ولم تُحذف.
 */

const CONNECT_TIMEOUT = () => new Error("timeout exceeded when trying to connect");

class FakeStore extends session.Store {
  getError: Error | null = null;
  get(_sid: string, cb: (err?: any, sess?: session.SessionData | null) => void) {
    setImmediate(() => (this.getError ? cb(this.getError) : cb(null, null)));
  }
  set(_sid: string, _sess: session.SessionData, cb?: (err?: any) => void) {
    setImmediate(() => cb?.());
  }
  destroy(_sid: string, cb?: (err?: any) => void) {
    setImmediate(() => cb?.());
  }
}

function get(store: SessionFailoverStore, sid: string) {
  return new Promise<{ err: any; sess: unknown }>((resolve) => {
    store.get(sid, (err, sess) => resolve({ err, sess }));
  });
}

describe("sessionIdFromCookieHeader", () => {
  it("يستخرج المعرّف من الكوكي الموقّع", () => {
    expect(sessionIdFromCookieHeader("connect.sid=s%3AabC123.sIgNaTuRe")).toBe("abC123");
    expect(sessionIdFromCookieHeader("other=1; connect.sid=s%3AabC123.sig; x=2")).toBe("abC123");
    expect(sessionIdFromCookieHeader("connect.sid=abC123.sig")).toBe("abC123");
  });

  it("لا يلتقط كوكي اسمه يشبه الاسم", () => {
    expect(sessionIdFromCookieHeader("xconnect.sid=s%3Aevil.sig")).toBeNull();
  });

  it("يتحمّل المدخلات الناقصة", () => {
    expect(sessionIdFromCookieHeader(undefined)).toBeNull();
    expect(sessionIdFromCookieHeader("")).toBeNull();
    expect(sessionIdFromCookieHeader("theme=dark")).toBeNull();
    expect(sessionIdFromCookieHeader(123)).toBeNull();
  });
});

describe("علامة «تعذّرت القراءة» على الخادم", () => {
  let store: SessionFailoverStore;
  let primary: FakeStore;
  let fallback: FakeStore;

  beforeEach(() => {
    primary = new FakeStore();
    fallback = new FakeStore();
    store = new SessionFailoverStore(primary, fallback, { isRevoked: async () => false, revokeSid: async () => {}, revokeUser: async () => {}, generationForUser: async () => "" }, 30_000, 3, 10_000);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("تُسجَّل عند فشل المخزنين وتُقرأ مرة واحدة فقط", async () => {
    primary.getError = new Error("Command timed out");
    fallback.getError = CONNECT_TIMEOUT();

    const { err, sess } = await get(store, "sid-abc");
    expect(err).toBeNull();
    expect(sess).toBeNull();

    // الطلب نفسه يقرأ العلامة…
    expect(store.consumeDegradedRead("sid-abc")).toBe(true);
    // …ولا تبقى لطلب لاحق نجحت قراءته
    expect(store.consumeDegradedRead("sid-abc")).toBe(false);
  });

  it("لا تُسجَّل لجلسة أخرى ولا عند القراءة الناجحة", async () => {
    primary.getError = new Error("Command timed out");
    fallback.getError = CONNECT_TIMEOUT();
    await get(store, "sid-abc");
    expect(store.consumeDegradedRead("sid-other")).toBe(false);

    fallback.getError = null;
    await get(store, "sid-ok");
    expect(store.consumeDegradedRead("sid-ok")).toBe(false);
  });

  it("لا تُسجَّل عند خطأ بيانات حقيقي — ذاك يظل خطأً يُرمى", async () => {
    primary.getError = new Error("Command timed out");
    fallback.getError = new Error('relation "sessions" does not exist');
    const { err } = await get(store, "sid-abc");
    expect(err).toBeInstanceOf(Error);
    expect(store.consumeDegradedRead("sid-abc")).toBe(false);
  });

  it("تنتهي صلاحيتها فلا تُوسم بها طلبات لاحقة", async () => {
    const shortTtl = new SessionFailoverStore(primary, fallback, { isRevoked: async () => false, revokeSid: async () => {}, revokeUser: async () => {}, generationForUser: async () => "" }, 30_000, 3, 10_000, 50);
    primary.getError = new Error("Command timed out");
    fallback.getError = CONNECT_TIMEOUT();
    await get(shortTtl, "sid-abc");
    await new Promise((r) => setTimeout(r, 80));
    expect(shortTtl.consumeDegradedRead("sid-abc")).toBe(false);
  });

  it("اسم الترويسة ثابت بين الطرفين", () => {
    expect(SESSION_DEGRADED_HEADER.toLowerCase()).toBe("x-session-degraded");
  });
});

describe("سلوك العميل أمام 401 المتدهورة", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function response(status: number, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify({ message: "unauthorized" }), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  }

  it("isDegradedSessionResponse يميّز الحالتين", () => {
    expect(isDegradedSessionResponse(response(401, { "x-session-degraded": "1" }))).toBe(true);
    expect(isDegradedSessionResponse(response(401))).toBe(false);
    // 200 موسومة بالترويسة ليست حالة تدهور تخصّ العميل
    expect(isDegradedSessionResponse(response(200, { "x-session-degraded": "1" }))).toBe(false);
  });

  it("الخطأ المتدهور قابل لإعادة المحاولة", () => {
    expect(isRetriableError(new Error(SESSION_DEGRADED_MESSAGE))).toBe(true);
    // انتهاء الجلسة الحقيقي ليس كذلك — لا معنى لإعادة محاولته
    expect(isRetriableError(new Error("401: Unauthorized"))).toBe(false);
  });

  it("getQueryFn يرمي خطأً قابلاً لإعادة المحاولة بدل إعادة null", async () => {
    // لولا ذلك لاستنتجت الواجهة من /api/auth/user أن المستخدم غير مسجّل
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401, { "x-session-degraded": "1" })));
    const queryFn = getQueryFn({ on401: "returnNull" });
    await expect(
      queryFn({ queryKey: ["/api/auth/user"], signal: new AbortController().signal } as never),
    ).rejects.toThrow(SESSION_DEGRADED_MESSAGE);
  });

  it("401 العادية تبقى على سلوكها: returnNull يعيد null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(401)));
    const queryFn = getQueryFn({ on401: "returnNull" });
    await expect(
      queryFn({ queryKey: ["/api/auth/user"], signal: new AbortController().signal } as never),
    ).resolves.toBeNull();
  });
});
