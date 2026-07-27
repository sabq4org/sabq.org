import { describe, expect, it } from "vitest";
import {
  hasFirstPartyFrame,
  isClientAbortError,
  shouldSendServerEvent,
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
