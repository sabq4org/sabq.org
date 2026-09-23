import { describe, expect, it } from "vitest";
import {
  PushBroadcastCapacityError,
  PushBroadcastCoordinator,
} from "../../server/services/pushBroadcastCoordinator";

describe("push broadcast admission", () => {
  it("rejects overlap and releases capacity after the first broadcast fails", () => {
    const coordinator = new PushBroadcastCoordinator({ retryAfterSeconds: 7 });
    const first = coordinator.acquire();
    first.start();

    expect(() => coordinator.acquire()).toThrowError(PushBroadcastCapacityError);
    first.release();

    const second = coordinator.acquire();
    second.start();
    second.release();
    expect(coordinator.snapshot()).toMatchObject({ active: 0, pending: 0 });
  });

  it("bounds a campaign waiting for the active slot", () => {
    const coordinator = new PushBroadcastCoordinator();
    const pending = coordinator.acquire();

    expect(coordinator.snapshot()).toMatchObject({ active: 0, pending: 1 });
    expect(() => coordinator.acquire()).toThrowError(PushBroadcastCapacityError);
    pending.release();
    expect(coordinator.snapshot()).toMatchObject({ active: 0, pending: 0 });
  });
});
