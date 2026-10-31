import { beforeEach, describe, expect, it, vi } from "vitest";

// db وهمي: استعلام بلا leftJoin = الأعمدة الخفيفة لكل أخبار النافذة،
// ومع leftJoin = الأعمدة الكاملة للمعروض فقط، وجدول طلبات التعديل فارغ.
const state = vi.hoisted(() => ({
  briefs: [] as Array<Record<string, unknown>>,
  fullCalls: [] as number[],
}));

vi.mock("../../server/db", () => {
  const chain = (kind: "brief" | "full" | "requests") => {
    const q: any = {
      from: (table: any) => {
        if (table?.__name === "article_edit_requests") kind = "requests";
        return q;
      },
      leftJoin: () => {
        kind = "full";
        return q;
      },
      where: () => q,
      then: (resolve: (v: unknown) => void) => {
        if (kind === "requests") return resolve([]);
        if (kind === "brief") return resolve(state.briefs);
        const rows = state.briefs.map((b) => ({
          ...b, title: `t-${b.id}`, slug: `s-${b.id}`, englishSlug: null, reviewNotes: null,
          imageUrl: null, thumbnailUrl: null, views: 0, categoryName: null, createdAt: b.updatedAt,
          reviewedAt: null, scheduledAt: null, publishedAt: null,
        }));
        state.fullCalls.push(rows.length);
        return resolve(rows);
      },
    };
    return q;
  };
  return { db: { select: () => chain("brief") } };
});

vi.mock("@shared/schema", () => {
  const col = (n: string) => ({ name: n });
  return {
    articles: new Proxy({}, { get: (_t, k) => col(String(k)) }),
    categories: new Proxy({}, { get: (_t, k) => col(String(k)) }),
    articleEditRequests: new Proxy({ __name: "article_edit_requests" } as any, {
      get: (t, k) => (k === "__name" ? t.__name : col(String(k))),
    }),
  };
});

import { getMyNewsBoard } from "../../server/services/mobileEditorialService";

describe("getMyNewsBoard", () => {
  beforeEach(() => {
    state.fullCalls = [];
    const now = Date.parse("2026-10-31T10:00:00Z");
    // 150 منشورًا حديثًا، ثم خبر قيد المراجعة وآخر مُعاد أقدم منها كلها.
    state.briefs = Array.from({ length: 150 }, (_, i) => ({
      id: `p${i}`, status: "published", reviewStatus: null, updatedAt: new Date(now - i * 60_000),
    }));
    state.briefs.push(
      { id: "old-pending", status: "draft", reviewStatus: "pending_review", updatedAt: new Date(now - 90 * 86_400_000) },
      { id: "old-returned", status: "draft", reviewStatus: "needs_changes", updatedAt: new Date(now - 100 * 86_400_000) },
    );
  });

  it("counts every news item in the window, not only the shown hundred", async () => {
    const board = await getMyNewsBoard({ userId: "u1", filter: "all", now: new Date("2026-10-31T10:00:00Z") });
    expect(board.counts).toMatchObject({ all: 152, published: 150, pending: 1, needs_changes: 1 });
    expect(board.items).toHaveLength(100);
    expect(board.items[0].id).toBe("old-returned");
  });

  it("filters before the limit so older pending news still shows", async () => {
    const board = await getMyNewsBoard({ userId: "u1", filter: "pending", now: new Date("2026-10-31T10:00:00Z") });
    expect(board.items.map((i) => i.id)).toEqual(["old-pending"]);
  });
});
