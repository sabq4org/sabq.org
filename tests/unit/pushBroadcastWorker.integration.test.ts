import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  queries: [] as Array<{ value?: unknown; error?: Error }>,
  updates: [] as unknown[],
  returningResults: [] as unknown[][],
  updateErrors: [] as Array<Error | undefined>,
}));

function query(result: { value?: unknown; error?: Error }) {
  const builder: any = {
    from() { return builder; },
    innerJoin() { return builder; },
    where() { return builder; },
    orderBy() { return builder; },
    limit() { return builder; },
    returning() {
      return result.error
        ? Promise.reject(result.error)
        : Promise.resolve(state.returningResults.shift() || []);
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) {
      return (result.error ? Promise.reject(result.error) : Promise.resolve(result.value))
        .then(onFulfilled, onRejected);
    },
  };
  return builder;
}

vi.mock("../../server/db", () => ({
  db: {
    select: () => query(state.queries.shift() || { value: [] }),
    update: () => ({
      set: (values: unknown) => {
        state.updates.push(values);
        return query({ error: state.updateErrors.shift(), value: [] });
      },
    }),
  },
}));

vi.mock("../../server/services/fcmService", () => ({
  isAnyFcmConfigured: () => false,
  isFcmConfigured: () => false,
  sendToFcmTargets: vi.fn(),
  sendToTopic: vi.fn(),
}));
vi.mock("../../server/services/apnsService", () => ({
  isApnsConfigured: () => false,
  sendBatchPushNotifications: vi.fn(),
  createCustomNotificationPayload: vi.fn(),
}));
vi.mock("../../server/utils/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// This suite drives processPendingCampaigns()/processCampaign() directly outside
// server bootstrap, so leader election never ran; without this, isLeader()
// defaults to false and every admission check below short-circuits away.
vi.mock("../../server/leaderElection", () => ({
  isLeader: () => true,
}));

import { processPendingCampaigns } from "../../server/jobs/pushWorker";
import { pushBroadcastCoordinator } from "../../server/services/pushBroadcastCoordinator";

const campaign = {
  id: "scheduled-campaign",
  name: "scheduled",
  type: "topic_all_users",
  title: "title",
  body: "body",
  scheduledAt: new Date(Date.now() - 1000),
} as any;

beforeEach(() => {
  state.queries = [];
  state.updates = [];
  state.returningResults = [];
  state.updateErrors = [];
  expect(pushBroadcastCoordinator.snapshot()).toMatchObject({ active: 0, pending: 0 });
});

describe("scheduled push worker admission", () => {
  it("leaves a scheduled campaign untouched while another broadcast is active", async () => {
    const held = pushBroadcastCoordinator.acquire();
    held.start();
    state.queries = [{ value: [campaign] }];

    await processPendingCampaigns();

    // Every processPendingCampaigns() run unconditionally sweeps stale
    // "sending" campaigns first (a separate db.update() call, unrelated to
    // this test's campaign), so `state.updates` is not expected to stay
    // empty — only the tested campaign must never be moved to "sending".
    expect(state.updates).not.toContainEqual({ status: "sending", updatedAt: expect.any(Date) });
    expect(pushBroadcastCoordinator.snapshot()).toMatchObject({ active: 1, pending: 0 });
    held.release();
  });

  it("releases the lease after a campaign processing failure", async () => {
    state.queries = [
      { value: [campaign] },
      { error: new Error("synthetic audience query failure") },
    ];
    state.returningResults = [[{ id: campaign.id }]];

    await processPendingCampaigns();

    expect(state.updates).toContainEqual({ status: "sending", updatedAt: expect.any(Date) });
    // A crashed/failed sender may have already delivered some notifications, so
    // the campaign is quarantined for manual reconciliation instead of being
    // reset to "draft" for a blind automatic retry (which could double-send).
    expect(state.updates).toContainEqual({ status: "delivery_unknown", updatedAt: expect.any(Date) });
    expect(pushBroadcastCoordinator.snapshot()).toMatchObject({ active: 0, pending: 0 });

    const next = pushBroadcastCoordinator.acquire();
    next.release();
  });

  it("skips audience loading when another worker already claimed the row", async () => {
    state.queries = [{ value: [campaign] }];
    state.returningResults = [[]];

    await processPendingCampaigns();

    expect(state.updates).toContainEqual({ status: "sending", updatedAt: expect.any(Date) });
    expect(state.queries).toHaveLength(0);
    expect(pushBroadcastCoordinator.snapshot()).toMatchObject({ active: 0, pending: 0 });
  });

  it("does not mark a campaign draft when the atomic claim query fails", async () => {
    state.queries = [{ value: [campaign] }];
    // The leading `undefined` is consumed by the always-on stale-sender sweep
    // (its own db.update().set() call, before the campaign is even fetched);
    // the real error targets the campaign's atomic claim update.
    state.updateErrors = [undefined, new Error("synthetic claim failure")];

    await processPendingCampaigns();

    expect(state.updates).toContainEqual({ status: "sending", updatedAt: expect.any(Date) });
    expect(state.updates).not.toContainEqual({ status: "draft", updatedAt: expect.any(Date) });
    expect(pushBroadcastCoordinator.snapshot()).toMatchObject({ active: 0, pending: 0 });
  });
});
