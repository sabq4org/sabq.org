import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  insertError: null as Error | null,
  apnsStarted: null as (() => void) | null,
  releaseApns: null as (() => void) | null,
  holdApns: false,
}));

function query(value: unknown) {
  const builder: any = {
    from() { return builder; },
    innerJoin() { return builder; },
    where() { return builder; },
    orderBy() { return builder; },
    offset() { return builder; },
    limit() { return Promise.resolve(value); },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (error: unknown) => unknown) {
      return Promise.resolve(value).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

vi.mock("../../server/db", () => ({
  db: {
    select: () => query(state.selectResults.shift() || []),
    insert: () => ({
      values: () => ({
        returning: async () => {
          if (state.insertError) throw state.insertError;
          return [{ id: "campaign-1" }];
        },
      }),
    }),
    update: () => ({
      set: () => query([]),
    }),
  },
}));

vi.mock("../../server/jobs/pushWorker", () => ({ sendImmediatePush: vi.fn() }));
vi.mock("../../server/services/fcmService", () => ({
  isAnyFcmConfigured: () => false,
  isFcmConfigured: () => false,
  sendToTopic: vi.fn(),
  getPushStats: vi.fn(),
  subscribeToTopic: vi.fn(),
  sendToFcmTargets: vi.fn(),
}));
vi.mock("../../server/services/apnsService", () => ({
  isApnsConfigured: () => true,
  createCustomNotificationPayload: vi.fn(() => ({ aps: { alert: { title: "t", body: "b" } } })),
  sendBatchPushNotifications: vi.fn(async () => {
    state.apnsStarted?.();
    if (!state.holdApns) return { success: 1, failed: 0, errors: [] };
    await new Promise<void>((resolve) => { state.releaseApns = resolve; });
    return { success: 1, failed: 0, errors: [] };
  }),
}));

import router from "../../server/routes/pushNotificationRoutes";

const servers: Server[] = [];
const article = { id: "article-1", title: "خبر تجريبي", excerpt: null, slug: "test", imageUrl: null };
const devices = [{ deviceToken: "a".repeat(64), platform: "ios", tokenProvider: "apns", bundleId: null }];

async function withServer(run: (origin: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

beforeEach(() => {
  state.selectResults = [];
  state.insertError = null;
  state.apnsStarted = null;
  state.releaseApns = null;
  state.holdApns = false;
});

afterAll(() => {
  for (const server of servers) server.close();
});

describe("quick-send broadcast admission", () => {
  it("returns 429 before 202 for an overlapping broadcast", async () => {
    state.selectResults = [[article], [], devices];
    state.holdApns = true;
    let started!: () => void;
    const apnsStarted = new Promise<void>((resolve) => { started = resolve; });
    state.apnsStarted = started;

    await withServer(async (origin) => {
      const first = await fetch(`${origin}/quick-send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId: article.id }),
      });
      expect(first.status).toBe(202);
      await apnsStarted;

      // The second request still passes article/duplicate reads; admission is
      // the point where it must be rejected before a second campaign insert.
      state.selectResults = [[article], []];
      const second = await fetch(`${origin}/quick-send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId: article.id }),
      });
      expect(second.status).toBe(429);
      expect(second.headers.get("retry-after")).toBe("15");
      state.releaseApns?.();
    });
  });

  it("releases admission when campaign insertion fails", async () => {
    state.selectResults = [[article], [], devices];
    state.insertError = new Error("synthetic db failure");

    await withServer(async (origin) => {
      const failed = await fetch(`${origin}/quick-send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId: article.id }),
      });
      expect(failed.status).toBe(500);

      state.insertError = null;
      state.holdApns = false;
      state.selectResults = [[article], [], devices];
      const accepted = await fetch(`${origin}/quick-send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ articleId: article.id }),
      });
      expect(accepted.status).toBe(202);
      state.releaseApns?.();
    });
  });
});
