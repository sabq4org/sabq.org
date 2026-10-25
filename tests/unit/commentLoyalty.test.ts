import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  recordLoyaltyPointsInTx: vi.fn(),
  triggerLoyaltyPassUpdate: vi.fn(),
  isUserFrozen: vi.fn(async () => false),
}));

vi.mock("../../server/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("../../server/storage", () => ({
  storage: {
    recordLoyaltyPointsInTx: mocks.recordLoyaltyPointsInTx,
    triggerLoyaltyPassUpdate: mocks.triggerLoyaltyPassUpdate,
  },
}));
vi.mock("../../server/services/commentSuspicion", () => ({
  isUserFrozen: mocks.isUserFrozen,
}));

const {
  LOYALTY_ACTIONS,
  LOYALTY_ACTION_POINTS,
  LOYALTY_DAILY_CAPS,
  LOYALTY_DEDUP_HOURS,
  MOBILE_CLIENT_LOYALTY_ACTIONS,
  getLoyaltyActionMeta,
} = await import("@shared/loyalty");
const { awardPoints, awardPointsInTransaction } = await import("../../server/services/loyalty");
const {
  awardCommentPointsOnApproval,
  revokeCommentPoints,
  commentAwardBlocker,
} = await import("../../server/services/commentLoyalty");
type Deps = import("../../server/services/commentLoyalty").CommentLoyaltyDeps;
type CommentRow = import("../../server/services/commentLoyalty").CommentForAward;

// ── In-memory loyalty ledger behind the CommentLoyaltyDeps seam ─────────────

function makeFakeDeps(comment: Partial<CommentRow> = {}, opts: { frozen?: boolean; parentUserId?: string } = {}) {
  const row: CommentRow = {
    id: "c1",
    userId: "u1",
    status: "approved",
    content: "قرار موفق ويخدم المواطنين في كل المناطق",
    parentId: null,
    targetId: "article-1",
    aiClassification: "safe",
    moderationReason: null,
    createdAt: new Date("2026-10-25T10:00:00Z"),
    ...comment,
  };
  const events: Array<{ action: string; points: number; commentId: string; userId: string }> = [];
  let balance = 0;
  const deps: Deps = {
    loadComment: vi.fn(async (id) => (id === row.id ? row : null)),
    loadParentUserId: vi.fn(async () => opts.parentUserId ?? null),
    loadContext: vi.fn(async () => ({ title: "عنوان الخبر عن قرار جديد", excerpt: null, content: null })),
    loadUserComments: vi.fn(async () => []),
    isFrozen: vi.fn(async () => !!opts.frozen),
    awardOnce: vi.fn(async ({ commentId, userId }) => {
      if (events.some((e) => e.action === "COMMENT" && e.commentId === commentId)) {
        return { awarded: false as const, reason: "ALREADY_AWARDED" as const };
      }
      events.push({ action: "COMMENT", points: 1, commentId, userId });
      balance += 1;
      return { awarded: true as const, points: 1 };
    }),
    revokeOnce: vi.fn(async (commentId) => {
      const award = events.find((e) => e.action === "COMMENT" && e.commentId === commentId);
      if (!award) return { revoked: false as const, reason: "NOT_AWARDED" as const };
      if (events.some((e) => e.action === "COMMENT_REVOKED" && e.commentId === commentId)) {
        return { revoked: false as const, reason: "ALREADY_REVOKED" as const };
      }
      events.push({ action: "COMMENT_REVOKED", points: -award.points, commentId, userId: award.userId });
      balance = Math.max(0, balance - award.points);
      return { revoked: true as const, points: award.points };
    }),
  };
  return { deps, row, events, balance: () => balance };
}

describe("award on approval", () => {
  it("approval awards exactly once; repeated approvals are idempotent", async () => {
    const f = makeFakeDeps();
    expect(await awardCommentPointsOnApproval("c1", "article", f.deps)).toEqual({ awarded: true, points: 1 });
    expect(await awardCommentPointsOnApproval("c1", "article", f.deps)).toEqual({
      awarded: false,
      reason: "ALREADY_AWARDED",
    });
    expect(f.events.filter((e) => e.action === "COMMENT")).toHaveLength(1);
    expect(f.balance()).toBe(1);
    expect(f.deps.awardOnce).toHaveBeenCalledWith(
      expect.objectContaining({ source: "article-1", metadata: { articleId: "article-1", commentId: "c1" } }),
    );
  });

  it("pending / rejected comments never award", async () => {
    for (const status of ["pending", "rejected", "flagged"]) {
      const f = makeFakeDeps({ status });
      expect(await awardCommentPointsOnApproval("c1", "article", f.deps)).toEqual({
        awarded: false,
        reason: "NOT_APPROVED",
      });
      expect(f.deps.awardOnce).not.toHaveBeenCalled();
    }
  });

  it("skips replies to one's own comment", async () => {
    const f = makeFakeDeps({ parentId: "p1" }, { parentUserId: "u1" });
    expect(await awardCommentPointsOnApproval("c1", "article", f.deps)).toMatchObject({ reason: "SELF_REPLY" });
    const g = makeFakeDeps({ parentId: "p1" }, { parentUserId: "someone-else" });
    expect(await awardCommentPointsOnApproval("c1", "article", g.deps)).toMatchObject({ awarded: true });
  });

  it("skips low_value, junk content, copied and template comments", async () => {
    expect(
      await awardCommentPointsOnApproval("c1", "article", makeFakeDeps({ aiClassification: "low_value" }).deps),
    ).toMatchObject({ reason: "LOW_VALUE" });
    expect(await awardCommentPointsOnApproval("c1", "article", makeFakeDeps({ content: "65" }).deps)).toMatchObject({
      reason: "LOW_QUALITY",
    });
    expect(
      await awardCommentPointsOnApproval("c1", "article", makeFakeDeps({ moderationReason: "منسوخ من نص الخبر" }).deps),
    ).toMatchObject({ reason: "COPIED" });
    // moderator approval wipes moderationReason — the content check still catches the copy
    expect(
      await awardCommentPointsOnApproval("c1", "article", makeFakeDeps({ content: "عنوان الخبر عن قرار جديد" }).deps),
    ).toMatchObject({ reason: "COPIED" });

    const t = makeFakeDeps();
    (t.deps.loadUserComments as any).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ targetId: `a-${i}`, content: t.row.content, createdAt: new Date() })),
    );
    expect(await awardCommentPointsOnApproval("c1", "article", t.deps)).toMatchObject({ reason: "TEMPLATE" });
  });

  it("skips frozen accounts (suspicion freeze)", async () => {
    const f = makeFakeDeps({}, { frozen: true });
    expect(await awardCommentPointsOnApproval("c1", "article", f.deps)).toEqual({ awarded: false, reason: "FROZEN" });
    expect(f.deps.awardOnce).not.toHaveBeenCalled();
  });

  it("topic comments use the topic id as source", async () => {
    const f = makeFakeDeps({ targetId: "topic-9" });
    await awardCommentPointsOnApproval("c1", "topic", f.deps);
    expect(f.deps.awardOnce).toHaveBeenCalledWith(
      expect.objectContaining({ source: "topic-9", metadata: expect.objectContaining({ topicId: "topic-9" }) }),
    );
  });

  it("commentAwardBlocker is null for a clean approved comment", () => {
    const { row } = makeFakeDeps();
    expect(commentAwardBlocker(row, { title: "x" }, null)).toBeNull();
  });
});

describe("clawback", () => {
  it("revokes once after a later rejection; second call is a no-op", async () => {
    const f = makeFakeDeps();
    await awardCommentPointsOnApproval("c1", "article", f.deps);
    expect(await revokeCommentPoints("c1", "رفض التعليق", f.deps)).toEqual({ revoked: true, points: 1 });
    expect(await revokeCommentPoints("c1", "رفض التعليق", f.deps)).toEqual({
      revoked: false,
      reason: "ALREADY_REVOKED",
    });
    expect(f.balance()).toBe(0);
    expect(f.events.filter((e) => e.action === "COMMENT_REVOKED")).toHaveLength(1);
  });

  it("does nothing when the comment never earned points", async () => {
    const f = makeFakeDeps();
    expect(await revokeCommentPoints("c1", "رفض التعليق", f.deps)).toEqual({ revoked: false, reason: "NOT_AWARDED" });
    expect(f.events).toHaveLength(0);
  });

  it("a revoked comment is not re-awarded if approved again", async () => {
    const f = makeFakeDeps();
    await awardCommentPointsOnApproval("c1", "article", f.deps);
    await revokeCommentPoints("c1", "رفض التعليق", f.deps);
    expect(await awardCommentPointsOnApproval("c1", "article", f.deps)).toMatchObject({ reason: "ALREADY_AWARDED" });
  });
});

describe("loyalty constants", () => {
  it("COMMENT: cap 5/day, per-article lifetime dedup, 1 point", () => {
    expect(LOYALTY_DAILY_CAPS.COMMENT).toBe(5);
    expect(LOYALTY_DEDUP_HOURS.COMMENT).toBe(24 * 365 * 5);
    expect(LOYALTY_ACTION_POINTS.COMMENT).toBe(1);
  });

  it("COMMENT_REVOKED has a label and can never be awarded via awardPoints", () => {
    expect(getLoyaltyActionMeta(LOYALTY_ACTIONS.COMMENT_REVOKED).labelAr).toBe("سحب نقاط تعليق");
    expect(LOYALTY_ACTION_POINTS.COMMENT_REVOKED).toBe(0);
  });

  it("mobile /loyalty/events allowlist excludes COMMENT and COMMENT_REVOKED", () => {
    expect(MOBILE_CLIENT_LOYALTY_ACTIONS).not.toContain("COMMENT");
    expect(MOBILE_CLIENT_LOYALTY_ACTIONS).not.toContain("COMMENT_REVOKED");
    expect(MOBILE_CLIENT_LOYALTY_ACTIONS).toEqual(
      expect.arrayContaining(["READ", "READ_DEEP", "LIKE", "SHARE", "NOTIFICATION_OPEN"]),
    );
  });
});

// ── awardPointsInTransaction: per-article dedup + daily cap over a fake tx ──

function fakeTx(opts: { todayCount: number; existingForSource: boolean }) {
  const whereCalls: unknown[] = [];
  const tx = {
    execute: vi.fn(async () => undefined),
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          whereCalls.push(cond);
          const countResult = [{ value: opts.todayCount }];
          return Object.assign(Promise.resolve(countResult), {
            limit: async () => (opts.existingForSource ? [{ id: "evt-1" }] : []),
          });
        },
      }),
    }),
  };
  return { tx, whereCalls };
}

describe("awardPointsInTransaction for COMMENT", () => {
  beforeEach(() => {
    mocks.recordLoyaltyPointsInTx.mockReset();
    mocks.recordLoyaltyPointsInTx.mockResolvedValue({ pointsEarned: 1, totalPoints: 10, rankChanged: false });
  });

  it("stops at the daily cap of 5", async () => {
    const { tx } = fakeTx({ todayCount: 5, existingForSource: false });
    const out = await awardPointsInTransaction(tx, { userId: "u1", action: "COMMENT", source: "article-1" });
    expect(out).toEqual({ awarded: false, reason: "DAILY_CAP" });
    expect(mocks.recordLoyaltyPointsInTx).not.toHaveBeenCalled();
  });

  it("dedups a second paid comment on the same article (source = articleId)", async () => {
    const { tx, whereCalls } = fakeTx({ todayCount: 1, existingForSource: true });
    const out = await awardPointsInTransaction(tx, { userId: "u1", action: "COMMENT", source: "article-1" });
    expect(out).toEqual({ awarded: false, reason: "DEDUP" });
    expect(whereCalls).toHaveLength(2); // cap query + source dedup query
  });

  it("awards the first comment on a new article under the cap", async () => {
    const { tx } = fakeTx({ todayCount: 4, existingForSource: false });
    const out = await awardPointsInTransaction(tx, { userId: "u1", action: "COMMENT", source: "article-2" });
    expect(out).toMatchObject({ awarded: true, points: 1 });
    expect(mocks.recordLoyaltyPointsInTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "COMMENT", source: "article-2", points: 1 }),
      true,
    );
  });

  it("COMMENT_REVOKED cannot be minted through awardPointsInTransaction", async () => {
    const { tx } = fakeTx({ todayCount: 0, existingForSource: false });
    expect(await awardPointsInTransaction(tx, { userId: "u1", action: "COMMENT_REVOKED" })).toEqual({
      awarded: false,
      reason: "NEGATIVE_POINTS",
    });
  });
});

describe("awardPoints freeze guard", () => {
  beforeEach(() => {
    mocks.transaction.mockReset();
    mocks.isUserFrozen.mockReset();
  });

  it("frozen users get no engagement points (READ/LIKE/SHARE/COMMENT)", async () => {
    mocks.isUserFrozen.mockResolvedValue(true);
    for (const action of ["READ", "READ_DEEP", "LIKE", "SHARE", "COMMENT"] as const) {
      expect(await awardPoints({ userId: "u1", action, source: "a" })).toEqual({ awarded: false, reason: "FROZEN" });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("never blocks prediction wins / account bonuses", async () => {
    mocks.isUserFrozen.mockResolvedValue(true);
    mocks.transaction.mockResolvedValue({ awarded: false, reason: "DEDUP" });
    await awardPoints({ userId: "u1", action: "PREDICTION_WIN", source: "prediction:1", points: 50 });
    await awardPoints({ userId: "u1", action: "DAILY_LOGIN" });
    expect(mocks.isUserFrozen).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("comment creation no longer awards points", () => {
  const root = path.resolve(import.meta.dirname, "../..");

  it("web POST /api/articles/:slug/comments has no awardPoints call", () => {
    const src = readFileSync(path.join(root, "server/routes.ts"), "utf8");
    const start = src.indexOf('app.post("/api/articles/:slug/comments"');
    expect(start).toBeGreaterThan(0);
    const end = src.indexOf("\n  });\n", start);
    const handler = src.slice(start, end);
    expect(handler).toContain("evaluateCommentSubmission");
    expect(handler).not.toContain("awardPoints(");
  });

  it("topic comment route has no awardPoints call", () => {
    const src = readFileSync(path.join(root, "server/routes/topicComments.ts"), "utf8");
    expect(src).not.toContain("awardPoints(");
    expect(src).toContain("awardCommentPointsOnApproval");
  });

  it("mobile loyalty batch answers COMMENT as SERVER_AWARDED", () => {
    const src = readFileSync(path.join(root, "server/routes/mobileApiRoutes.ts"), "utf8");
    const start = src.indexOf('router.post("/loyalty/events"');
    const handler = src.slice(start, src.indexOf("\n});\n", start));
    expect(handler).toContain("MOBILE_CLIENT_LOYALTY_ACTIONS");
    expect(handler).toContain('"SERVER_AWARDED"');
    expect(handler).not.toContain("LOYALTY_ACTIONS.COMMENT,");
  });
});
