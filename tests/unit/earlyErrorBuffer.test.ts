import { describe, expect, it } from "vitest";
import { drainEarlyErrors, installEarlyErrorBuffer } from "../../client/src/lib/earlyErrorBuffer";

function fakeTarget() {
  const listeners = new Map<string, EventListener>();
  return {
    listeners,
    addEventListener: (type: string, fn: EventListener) => { listeners.set(type, fn); },
    removeEventListener: (type: string, fn: EventListener) => { if (listeners.get(type) === fn) listeners.delete(type); },
  };
}

describe("early error buffer (Sentry loads after first paint)", () => {
  it("keeps Error objects thrown before Sentry loads and stops listening once drained", () => {
    const t = fakeTarget();
    installEarlyErrorBuffer(t as unknown as Window);
    const boom = new Error("chunk failed");
    t.listeners.get("error")!({ error: boom } as unknown as Event);
    t.listeners.get("unhandledrejection")!({ reason: new TypeError("x") } as unknown as Event);
    t.listeners.get("unhandledrejection")!({ reason: { noStack: true } } as unknown as Event);
    const drained = drainEarlyErrors(t as unknown as Window);
    expect(drained).toHaveLength(2);
    expect(drained[0]).toBe(boom);
    expect(t.listeners.size).toBe(0);
    expect(drainEarlyErrors(t as unknown as Window)).toEqual([]);
  });

  it("caps the buffer", () => {
    const t = fakeTarget();
    installEarlyErrorBuffer(t as unknown as Window);
    for (let i = 0; i < 50; i++) t.listeners.get("error")!({ error: new Error(String(i)) } as unknown as Event);
    expect(drainEarlyErrors(t as unknown as Window)).toHaveLength(20);
  });
});
