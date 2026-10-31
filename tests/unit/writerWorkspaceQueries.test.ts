import { beforeEach, describe, expect, it, vi } from "vitest";

// بديل db يسجّل كل استعلام (الأعمدة المختارة والعمليات المتسلسلة) دون قاعدة.
type Recorded = { fields: Record<string, unknown>; ops: Array<[string, unknown[]]> };
const state = vi.hoisted(() => ({ queries: [] as Recorded[], rows: (_q: Recorded): unknown[] => [] }));

vi.mock("../../server/db", () => {
  const select = (fields: Record<string, unknown>) => {
    const record: Recorded = { fields, ops: [] };
    state.queries.push(record);
    const builder: Record<string, unknown> = {};
    for (const op of ["from", "where", "innerJoin", "leftJoin", "orderBy", "limit", "offset"]) {
      builder[op] = (...args: unknown[]) => { record.ops.push([op, args]); return builder; };
    }
    builder.then = (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.rows(record)).then(resolve, reject);
    return builder;
  };
  return { db: { select } };
});
vi.mock("../../server/ai/gateway", () => ({ aiGateway: { complete: vi.fn() } }));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { get: vi.fn(), set: vi.fn() } }));

import { articles, comments } from "../../shared/schema";
import { getOpinionAuthorWorkspace, WRITER_TRACKING_MAX_PAGE } from "../../server/services/opinionAuthorWorkspaceService";

const trackingQuery = () => state.queries.find((q) => "total" in q.fields)!;
const opArgs = (q: Recorded, op: string) => q.ops.filter(([name]) => name === op).map(([, args]) => args[0]);

describe("writer workspace queries", () => {
  beforeEach(() => {
    state.queries = [];
    state.rows = () => [];
  });

  it("never selects the article body and keeps the response keys", async () => {
    const workspace = await getOpinionAuthorWorkspace("writer-1");
    for (const query of state.queries) {
      expect(Object.values(query.fields)).not.toContain(articles.content);
    }
    // التعليق وحده يعيد نصًا (نص التعليق المميز يظهر في نبض القراء).
    const withCommentBody = state.queries.filter((q) => Object.values(q.fields).includes(comments.content));
    expect(withCommentBody).toHaveLength(1);
    expect(Object.keys(workspace).sort()).toEqual(
      ["calendar", "context", "desk", "followUp", "monthlyBrief", "readerPulse", "tracking", "trackingPage"],
    );
    expect(workspace.trackingPage).toEqual({ total: 0, offset: 0, limit: null, hasMore: false });
  });

  it("bounds every list except the default tracking list", async () => {
    await getOpinionAuthorWorkspace("writer-1");
    const unbounded = state.queries.filter((q) => opArgs(q, "limit").length === 0);
    // التتبع بلا حد (توافق العملاء)، وموجز الشهر صف تجميعي واحد.
    expect(unbounded.map((q) => Object.keys(q.fields).sort().join(","))).toEqual([
      Object.keys(trackingQuery().fields).sort().join(","),
      "publishedCount,views",
    ]);
    expect(opArgs(trackingQuery(), "offset")).toEqual([0]);
  });

  it("pushes tracking pagination into SQL and clamps it", async () => {
    await getOpinionAuthorWorkspace("writer-1", { trackingLimit: 25, trackingOffset: 50 });
    expect(opArgs(trackingQuery(), "limit")).toEqual([25]);
    expect(opArgs(trackingQuery(), "offset")).toEqual([50]);

    state.queries = [];
    await getOpinionAuthorWorkspace("writer-1", { trackingLimit: 10_000, trackingOffset: -5 });
    expect(opArgs(trackingQuery(), "limit")).toEqual([WRITER_TRACKING_MAX_PAGE]);
    expect(opArgs(trackingQuery(), "offset")).toEqual([0]);
  });

  it("reports total and hasMore from the window count, without leaking it into items", async () => {
    const now = new Date("2026-10-20T10:00:00Z");
    state.rows = (q) => ("total" in q.fields
      ? [1, 2].map((n) => ({
          id: `a${n}`, title: `t${n}`, status: "draft", reviewStatus: null, reviewNotes: null,
          scheduledAt: null, publishedAt: null, reviewedAt: null, updatedAt: null, createdAt: now, total: 5,
        }))
      : "publishedCount" in q.fields ? [{ publishedCount: 2, views: "1200" }] : []);
    const workspace = await getOpinionAuthorWorkspace("writer-1", { trackingLimit: 2 });
    expect(workspace.trackingPage).toEqual({ total: 5, offset: 0, limit: 2, hasMore: true });
    expect(Object.keys(workspace.tracking[0]).sort()).toEqual(
      ["createdAt", "id", "publishedAt", "reviewNotes", "reviewStatus", "reviewedAt", "scheduledAt", "status", "title", "updatedAt"],
    );
    expect(workspace.tracking[0].updatedAt).toBe(now);
    expect(workspace.monthlyBrief.publishedCount).toBe(2);
    expect(workspace.monthlyBrief.views).toBe(1200);
  });
});
