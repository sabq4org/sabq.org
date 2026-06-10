import { describe, it, expect, vi, afterEach } from "vitest";
import { safeErrorPayload } from "../../server/utils/safeError";

afterEach(() => vi.restoreAllMocks());

describe("safeErrorPayload — never leaks the raw error to the client", () => {
  it("returns only the public message + a short correlation id", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const payload = safeErrorPayload(
      new Error('relation "secret_table" does not exist'),
      "فشلت العملية",
    );
    expect(payload.message).toBe("فشلت العملية");
    expect(payload.message).not.toContain("secret_table");
    expect(payload.errorId).toMatch(/^[0-9a-f-]{8}$/);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("logs the real error server-side under the same correlation id", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const payload = safeErrorPayload(new Error("db timeout"), "خطأ", "my-route");
    const logged = spy.mock.calls[0].map(String).join(" ");
    expect(logged).toContain(payload.errorId);
    expect(logged).toContain("my-route");
    expect(logged).toContain("db timeout");
  });

  it("handles non-Error throwables without crashing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(safeErrorPayload("plain string failure").message).toBe(
      "حدث خطأ في الخادم. يرجى المحاولة لاحقاً",
    );
    expect(safeErrorPayload(undefined).errorId).toBeTruthy();
  });

  it("two calls produce distinct correlation ids", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(safeErrorPayload(new Error("a")).errorId).not.toBe(
      safeErrorPayload(new Error("b")).errorId,
    );
  });
});
