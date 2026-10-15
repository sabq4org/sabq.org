import { describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => {
  process.env.APNS_KEY_ID = "synthetic-key-id";
  process.env.APNS_TEAM_ID = "synthetic-team-id";
  process.env.APNS_KEY_P8 = "synthetic-private-key";

  class Emitter {
    private listeners = new Map<string, Array<(...args: any[]) => void>>();
    on(event: string, listener: (...args: any[]) => void) {
      const listeners = this.listeners.get(event) || [];
      listeners.push(listener);
      this.listeners.set(event, listeners);
      return this;
    }
    emit(event: string, ...args: any[]) {
      for (const listener of this.listeners.get(event) || []) listener(...args);
    }
  }

  class Stream extends Emitter {
    setTimeout() { return this; }
    close() { return this; }
    end() {
      queueMicrotask(() => {
        this.emit("response", { ":status": 200, "apns-id": "synthetic-apns-id" });
        this.emit("end");
      });
    }
  }

  class Session extends Emitter {
    closed = false;
    destroyed = false;
    unref() { return this; }
    ref() { return this; }
    setTimeout() { return this; }
    request() {
      transport.requestCount += 1;
      return new Stream();
    }
  }

  return {
    requestCount: 0,
    connect: vi.fn(() => new Session()),
    constants: { NGHTTP2_CANCEL: 8 },
  };
});

vi.mock("http2", () => ({ default: transport, constants: transport.constants }));
vi.mock("jsonwebtoken", () => ({ default: { sign: () => "synthetic-jwt" } }));
vi.mock("../../server/db", () => ({ db: {} }));

import { sendBatchPushNotifications } from "../../server/services/apnsService";

describe("APNs broadcast batch transport", () => {
  it("sends across batch boundaries without the legacy inter-batch timer", async () => {
    const tokens = Array.from({ length: 101 }, (_, i) => i.toString(16).padStart(64, "0"));
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    try {
      const result = await sendBatchPushNotifications(tokens, {
        aps: { alert: { title: "synthetic", body: "synthetic" } },
      });

      expect(result).toEqual({ success: 101, failed: 0, errors: [] });
      expect(transport.requestCount).toBe(101);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});
