import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../client/src/lib/queryClient";

type Listener = () => void;

class FakeXhr {
  static last: FakeXhr | undefined;
  listeners: Record<string, Listener[]> = {};
  upload = { addEventListener: vi.fn() };
  timeout = 0;
  withCredentials = false;
  status = 0;
  constructor() { FakeXhr.last = this; }
  addEventListener(name: string, fn: Listener) { (this.listeners[name] ||= []).push(fn); }
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
  getResponseHeader = vi.fn(() => null);
  fire(name: string) { this.listeners[name]?.forEach(fn => fn()); }
}

describe("FormData upload transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function start(timeoutMs?: number) {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    vi.stubGlobal("document", { cookie: "csrf-token=t" });
    const body = new FormData();
    body.append("file", new File(["x"], "a.png", { type: "image/png" }));
    const pending = apiRequest("/api/media/upload", { method: "POST", body, isFormData: true, timeoutMs });
    await vi.waitFor(() => expect(FakeXhr.last?.send).toHaveBeenCalled());
    return { pending, xhr: FakeXhr.last! };
  }

  it("applies the requested timeout and rejects when it fires", async () => {
    const { pending, xhr } = await start(120_000);
    expect(xhr.timeout).toBe(120_000);
    xhr.fire("timeout");
    await expect(pending).rejects.toThrow("Network error");
  });

  it("rejects when the request is aborted instead of hanging", async () => {
    const { pending, xhr } = await start();
    expect(xhr.timeout).toBe(0);
    xhr.fire("abort");
    await expect(pending).rejects.toThrow("Network error");
  });
});
