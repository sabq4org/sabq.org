import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

const { computeSuspicionScore, computeUserCommentStats, SUSPICION_RULES } = await import(
  "../../server/services/commentSuspicion"
);
const { isCommentAuthorHidden, pruneCommentTree } = await import("../../server/services/commentVisibility");
const { lowValueShare, TRUST_MAX_LOW_VALUE_SHARE } = await import("../../server/services/commentQuality");

const day = (d: number, h = 9) => new Date(Date.UTC(2026, 9, d, h, 0, 0));

describe("suspicion score / freeze", () => {
  it("a numeric farmer (35% numbers, rest junk) is suspicious → frozen", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => ({ content: String(i + 1), articleId: `a${i}`, createdAt: day(20) })),
      ...Array.from({ length: 6 }, (_, i) => ({ content: "..", articleId: `b${i}`, createdAt: day(21) })),
      ...Array.from({ length: 4 }, (_, i) => ({ content: "شكرا على الخبر المفيد", articleId: `c${i}`, createdAt: day(22) })),
    ];
    const stats = computeUserCommentStats(rows);
    expect(stats).toMatchObject({ total: 18, numeric: 14, distinctArticles: 18 });
    const s = computeSuspicionScore(stats);
    expect(s.suspicious).toBe(true);
    expect(s.junkRatio).toBeGreaterThan(SUSPICION_RULES.junkRatio);
    expect(s.score).toBeGreaterThan(50);
  });

  it("more than 20 comments on one day is suspicious even when the texts are fine", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      content: `رأي مختلف رقم ${i} حول هذا الموضوع`,
      articleId: `a${i}`,
      createdAt: day(23, 8 + (i % 10)),
    }));
    const stats = computeUserCommentStats(rows);
    expect(stats.maxPerDay).toBe(21);
    expect(computeSuspicionScore(stats).suspicious).toBe(true);
  });

  it("an active, genuine commenter is not frozen", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      content: i % 5 === 0 ? "رحمه الله" : `أتفق مع القرار لأن ${i} من الأسباب واضحة`,
      articleId: `a${i}`,
      createdAt: day(18 + (i % 5)),
    }));
    expect(computeSuspicionScore(computeUserCommentStats(rows)).suspicious).toBe(false);
  });

  it("fewer than 10 comments is never suspicious", () => {
    const rows = Array.from({ length: 9 }, () => ({ content: "1", articleId: "a", createdAt: day(20) }));
    expect(computeSuspicionScore(computeUserCommentStats(rows)).suspicious).toBe(false);
  });

  it("copied holds count as junk", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      content: `جملة طويلة منقولة من الخبر رقم ${i}`,
      articleId: `a${i}`,
      createdAt: day(20),
      moderationReason: i < 6 ? "منسوخ من نص الخبر" : null,
    }));
    const stats = computeUserCommentStats(rows);
    expect(stats.copied).toBe(6);
    expect(computeSuspicionScore(stats).suspicious).toBe(true);
  });
});

describe("trusted fast lane low-value share", () => {
  it("≥ 30% low-value among recent approved comments disqualifies", () => {
    const contents = [...Array(4).fill("65"), ...Array(6).fill("هذا قرار ممتاز يخدم المواطنين")];
    expect(lowValueShare(contents)).toBeGreaterThanOrEqual(TRUST_MAX_LOW_VALUE_SHARE);
  });
  it("clean history stays under the bar", () => {
    const contents = [...Array(2).fill("آمين"), ...Array(8).fill("هذا قرار ممتاز يخدم المواطنين")];
    expect(lowValueShare(contents)).toBeLessThan(TRUST_MAX_LOW_VALUE_SHARE);
  });
});

describe("public visibility of banned / suspended / deleted authors", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const future = new Date("2026-11-01T00:00:00Z");
  const past = new Date("2026-10-01T00:00:00Z");

  it.each([
    [{ status: "banned", bannedUntil: null }, true],
    [{ status: "banned", bannedUntil: future }, true],
    [{ status: "banned", bannedUntil: past }, false],
    [{ status: "suspended", suspendedUntil: null }, true],
    [{ status: "suspended", suspendedUntil: future }, true],
    [{ status: "suspended", suspendedUntil: past }, false],
    [{ status: "active", deletedAt: past }, true],
    [{ status: "active" }, false],
  ])("%o → hidden=%s", (author, hidden) => {
    expect(isCommentAuthorHidden(author, now)).toBe(hidden);
  });

  it("anonymized comments (no author row) stay visible", () => {
    expect(isCommentAuthorHidden(null, now)).toBe(false);
  });

  it("prunes hidden authors' comments (and their reply subtree) from a tree", () => {
    const tree = [
      { id: "1", userId: "ok", replies: [{ id: "1a", userId: "banned", replies: [] }, { id: "1b", userId: "ok", replies: [] }] },
      { id: "2", userId: "banned", replies: [{ id: "2a", userId: "ok", replies: [] }] },
      { id: "3", userId: null, replies: [] },
    ];
    const out = pruneCommentTree(tree, new Set(["banned"]));
    expect(out.map((n) => n.id)).toEqual(["1", "3"]);
    expect(out[0].replies.map((n) => n.id)).toEqual(["1b"]);
  });
});
