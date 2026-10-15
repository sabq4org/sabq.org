import session from "express-session";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SessionFailoverStore,
  isInfrastructureStoreError,
} from "../../server/sessionFailoverStore";

/**
 * يعيد إنتاج شكل نوبة 2026-07-25 (NODE-EXPRESS-B / C / 9، 1176 حدثًا):
 * مهلة أمر واحدة من Redis كانت تحوّل كل حركة الجلسات إلى مسبح PG المعزول
 * (max=4، مهلة اتصال 2s) لثلاثين ثانية، فيموت كل طلب بـ
 * «timeout exceeded when trying to connect» ويصل الزائر 500.
 */

const CONNECT_TIMEOUT = () => new Error("timeout exceeded when trying to connect");
const SESSION_DATA = { cookie: {} } as unknown as session.SessionData;

/** مخزن وهمي يمكن ضبط نجاحه/فشله لكل عملية. */
class FakeStore extends session.Store {
  getError: Error | null = null;
  setError: Error | null = null;
  touchError: Error | null = null;
  value: session.SessionData | null = null;

  getCalls = 0;
  setCalls = 0;
  touchCalls = 0;
  destroyCalls = 0;

  get(_sid: string, cb: (err?: any, sess?: session.SessionData | null) => void) {
    this.getCalls++;
    setImmediate(() => (this.getError ? cb(this.getError) : cb(null, this.value)));
  }
  set(_sid: string, _sess: session.SessionData, cb?: (err?: any) => void) {
    this.setCalls++;
    setImmediate(() => cb?.(this.setError ?? undefined));
  }
  touch(_sid: string, _sess: session.SessionData, cb?: (err?: any) => void) {
    this.touchCalls++;
    setImmediate(() => cb?.(this.touchError ?? undefined));
  }
  destroy(_sid: string, cb?: (err?: any) => void) {
    this.destroyCalls++;
    setImmediate(() => cb?.());
  }
}

function get(store: SessionFailoverStore, sid = "sid-1") {
  return new Promise<{ err: any; sess: session.SessionData | null | undefined }>((resolve) => {
    store.get(sid, (err, sess) => resolve({ err, sess }));
  });
}

function touch(store: SessionFailoverStore, sid = "sid-1") {
  return new Promise<any>((resolve) => {
    store.touch(sid, SESSION_DATA, (err) => resolve(err));
  });
}

function set(store: SessionFailoverStore, sid = "sid-1") {
  return new Promise<any>((resolve) => {
    store.set(sid, SESSION_DATA, (err) => resolve(err));
  });
}

describe("isInfrastructureStoreError", () => {
  it("يتعرف على رسائل نفاد المسبح وانقطاع الاتصال الحقيقية من production", () => {
    expect(isInfrastructureStoreError(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isInfrastructureStoreError(new Error("Connection terminated due to connection timeout"))).toBe(true);
    expect(isInfrastructureStoreError(new Error("Query read timeout"))).toBe(true);
    expect(isInfrastructureStoreError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isInfrastructureStoreError(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }))).toBe(true);
    expect(isInfrastructureStoreError(Object.assign(new Error("sorry"), { code: "53300" }))).toBe(true);
  });

  it("لا يبتلع أخطاء البيانات الحقيقية", () => {
    expect(isInfrastructureStoreError(new Error('relation "sessions" does not exist'))).toBe(false);
    expect(isInfrastructureStoreError(new Error("Unexpected token < in JSON"))).toBe(false);
    expect(isInfrastructureStoreError(null)).toBe(false);
    expect(isInfrastructureStoreError(undefined)).toBe(false);
  });
});

describe("SessionFailoverStore — عتبة التحويل", () => {
  let primary: FakeStore;
  let fallback: FakeStore;
  let store: SessionFailoverStore;

  beforeEach(() => {
    primary = new FakeStore();
    fallback = new FakeStore();
    store = new SessionFailoverStore(primary, fallback, { isRevoked: async () => false, revokeSid: async () => {}, revokeUser: async () => {}, generationForUser: async () => "" }, 30_000, 3, 10_000);
  });

  it("نبضة Redis واحدة تُخدَم من الاحتياطي دون تحويل بقية الحركة", async () => {
    primary.getError = new Error("Command timed out");
    await get(store);
    expect(fallback.getCalls).toBe(1);

    // Redis تعافت: الطلب التالي يجب أن يمرّ عليها، لا أن يذهب للاحتياطي
    primary.getError = null;
    primary.value = SESSION_DATA;
    const second = await get(store);
    expect(primary.getCalls).toBe(2);
    expect(fallback.getCalls).toBe(1);
    expect(second.sess).toBe(SESSION_DATA);
  });

  it("تجاوز العتبة (3 إخفاقات) يحوّل كل الحركة للاحتياطي", async () => {
    primary.getError = new Error("Command timed out");
    await get(store);
    await get(store);
    await get(store);
    expect(primary.getCalls).toBe(3);

    // بعد التحويل لا يُلمَس Redis إطلاقًا حتى انتهاء المهلة
    await get(store);
    await get(store);
    expect(primary.getCalls).toBe(3);
    expect(fallback.getCalls).toBe(5);
  });

  it("انقضاء مهلة التبريد يعيد الحركة إلى Redis", async () => {
    vi.useFakeTimers();
    try {
      primary.getError = new Error("Command timed out");
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 3; i++) {
        const p = get(store);
        await vi.advanceTimersByTimeAsync(1);
        await p;
      }
      expect(primary.getCalls).toBe(3);

      primary.getError = null;
      await vi.advanceTimersByTimeAsync(31_000);
      const p = get(store);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(primary.getCalls).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SessionFailoverStore — التدهور الرشيق بدل 500", () => {
  let primary: FakeStore;
  let fallback: FakeStore;
  let store: SessionFailoverStore;

  beforeEach(() => {
    primary = new FakeStore();
    fallback = new FakeStore();
    store = new SessionFailoverStore(primary, fallback, { isRevoked: async () => false, revokeSid: async () => {}, revokeUser: async () => {}, generationForUser: async () => "" }, 30_000, 3, 10_000);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("فشل المخزنين على القراءة بخطأ بنية تحتية → طلب بلا جلسة، لا خطأ", async () => {
    primary.getError = new Error("Command timed out");
    fallback.getError = CONNECT_TIMEOUT();
    const { err, sess } = await get(store);
    expect(err).toBeNull();
    expect(sess).toBeNull();
  });

  it("خطأ بيانات حقيقي من الاحتياطي يظل يُرمى", async () => {
    primary.getError = new Error("Command timed out");
    fallback.getError = new Error('relation "sessions" does not exist');
    const { err } = await get(store);
    expect(err).toBeInstanceOf(Error);
    expect(String(err.message)).toContain("sessions");
  });

  it("touch لا تُفشل الطلب مهما فشل المخزنان — تجديد TTL أفضل جهد", async () => {
    primary.touchError = new Error("Command timed out");
    fallback.touchError = CONNECT_TIMEOUT();
    expect(await touch(store)).toBeUndefined();
  });

  it("touch الناجحة على Redis لا تمرّر خطأً زائفًا", async () => {
    expect(await touch(store)).toBeUndefined();
    expect(primary.touchCalls).toBe(1);
    expect(fallback.touchCalls).toBe(0);
  });

  it("الكتابة تظل تُبلّغ عن فشلها — لا نزعم حفظ جلسة لم تُحفظ", async () => {
    primary.setError = new Error("Command timed out");
    fallback.setError = CONNECT_TIMEOUT();
    const err = await set(store);
    expect(err).toBeInstanceOf(Error);
  });
});
