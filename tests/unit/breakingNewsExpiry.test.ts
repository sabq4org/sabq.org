import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { articles, enArticles, urArticles } from "@shared/schema";

const hoisted = vi.hoisted(() => ({
  invalidateArticleWrite: vi.fn(),
  purgeBreakingNews: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn(),
  invalidatePattern: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: {} }));

vi.mock("../../server/memoryCache", () => ({
  memoryCache: {
    delete: hoisted.deleteCache,
    invalidatePattern: hoisted.invalidatePattern,
  },
}));

vi.mock("../../server/services/contentInvalidation", () => ({
  invalidateArticleWrite: hoisted.invalidateArticleWrite,
}));

vi.mock("../../server/services/cloudflarePurge", () => ({
  purgeBreakingNews: hoisted.purgeBreakingNews,
}));

import {
  BREAKING_NEWS_MAX_AGE_MS,
  BREAKING_NEWS_TYPE,
  REGULAR_NEWS_TYPE,
  breakingExpiryCutoff,
  buildExpiredBreakingWhere,
  expireStaleBreakingArticles,
  type BreakingDbExecutor,
} from "../../server/services/breakingNewsService";

interface Row {
  id: string;
  slug: string | null;
  englishSlug: string | null;
  newsType: string;
  status: string;
  publishedAt: Date | null;
}

const NOW = new Date("2026-10-24T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
const row = (id: string, overrides: Partial<Row> = {}): Row => ({
  id,
  slug: `${id}-slug`,
  englishSlug: `${id}-en`,
  newsType: BREAKING_NEWS_TYPE,
  status: "published",
  publishedAt: hoursAgo(4),
  ...overrides,
});

/** Applies the expiry predicate by reading its bound params (status, flags, newsType, cutoff). */
function createFakeExecutor(tables: { ar?: Row[]; en?: Row[]; ur?: Row[] }) {
  const dialect = new PgDialect();
  const state = new Map<unknown, Row[]>([
    [articles, tables.ar ?? []],
    [enArticles, tables.en ?? []],
    [urArticles, tables.ur ?? []],
  ]);
  const patches: Record<string, unknown>[] = [];

  const executor = {
    update: (table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (cond: unknown) => ({
          returning: async () => {
            patches.push(patch);
            const { params } = dialect.sqlToQuery(cond as never);
            const status = params[0];
            const newsType = params[3];
            const cutoff = new Date(params[4] as string | Date);
            const affected = (state.get(table) ?? []).filter(
              (r) =>
                r.status === status &&
                r.newsType === newsType &&
                r.publishedAt !== null &&
                r.publishedAt < cutoff,
            );
            for (const r of affected) Object.assign(r, patch);
            return affected.map(({ id, slug, englishSlug }) => ({ id, slug, englishSlug }));
          },
        }),
      }),
    }),
  } as unknown as BreakingDbExecutor;

  return { executor, state, patches };
}

describe("breakingNewsService — breaking news auto-expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a three hour window", () => {
    expect(BREAKING_NEWS_MAX_AGE_MS).toBe(3 * 60 * 60 * 1000);
    expect(breakingExpiryCutoff(NOW).toISOString()).toBe(hoursAgo(3).toISOString());
  });

  it("builds an index-friendly predicate on published breaking rows older than the cutoff", () => {
    const { sql, params } = new PgDialect().sqlToQuery(
      buildExpiredBreakingWhere(articles, hoursAgo(3)) as never,
    );
    expect(sql).toContain('"articles"."status" = $1');
    expect(sql).toContain('"articles"."hide_from_homepage" in ($2, $3)');
    expect(sql).toContain('"articles"."news_type" = $4');
    expect(sql).toContain('"articles"."published_at" < $5');
    expect(params.slice(0, 4)).toEqual(["published", false, true, BREAKING_NEWS_TYPE]);
  });

  it("demotes only published breaking articles older than three hours, in all three tables", async () => {
    const { executor, state } = createFakeExecutor({
      ar: [
        row("ar-old"),
        row("ar-fresh", { publishedAt: hoursAgo(2.5) }),
        row("ar-draft", { status: "draft", publishedAt: null }),
        row("ar-regular", { newsType: REGULAR_NEWS_TYPE }),
      ],
      en: [row("en-old", { publishedAt: hoursAgo(3.1) })],
      ur: [row("ur-fresh", { publishedAt: hoursAgo(1) })],
    });

    const result = await expireStaleBreakingArticles(NOW, executor);

    expect(result.ar.map((r) => r.id)).toEqual(["ar-old"]);
    expect(result.en.map((r) => r.id)).toEqual(["en-old"]);
    expect(result.ur).toEqual([]);

    const arRows = state.get(articles)!;
    expect(arRows.find((r) => r.id === "ar-old")!.newsType).toBe(REGULAR_NEWS_TYPE);
    expect(arRows.find((r) => r.id === "ar-fresh")!.newsType).toBe(BREAKING_NEWS_TYPE);
    expect(arRows.find((r) => r.id === "ar-draft")!.newsType).toBe(BREAKING_NEWS_TYPE);
    expect(state.get(urArticles)![0].newsType).toBe(BREAKING_NEWS_TYPE);
  });

  it("does not bump updatedAt, so an open editor keeps a valid save version", async () => {
    const { executor, patches } = createFakeExecutor({ ar: [row("ar-old")] });
    await expireStaleBreakingArticles(NOW, executor);
    expect(patches).toHaveLength(3);
    for (const patch of patches) {
      expect(patch).toEqual({ newsType: REGULAR_NEWS_TYPE });
    }
  });

  it("invalidates caches and purges the edge ticker when something was demoted", async () => {
    const { executor } = createFakeExecutor({
      ar: [row("ar-old")],
      en: [row("en-old")],
    });
    await expireStaleBreakingArticles(NOW, executor);

    expect(hoisted.invalidateArticleWrite).toHaveBeenCalledWith(
      { id: "ar-old", slug: "ar-old-slug", englishSlug: "ar-old-en", newsType: BREAKING_NEWS_TYPE },
      { reason: "breaking-auto-expire", warm: false },
    );
    expect(hoisted.invalidateArticleWrite).toHaveBeenCalledWith(
      { id: "en-old", slug: "en-old-slug", englishSlug: "en-old-en", newsType: BREAKING_NEWS_TYPE },
      { reason: "en-breaking-auto-expire", warm: false },
    );
    expect(hoisted.invalidatePattern).toHaveBeenCalledWith("^en:article:base:");
    expect(hoisted.deleteCache).toHaveBeenCalledWith("lite-feed");
    expect(hoisted.purgeBreakingNews).toHaveBeenCalledWith({ immediate: true });
  });

  it("touches no cache when nothing expired", async () => {
    const { executor } = createFakeExecutor({
      ar: [row("ar-fresh", { publishedAt: hoursAgo(1) })],
    });
    const result = await expireStaleBreakingArticles(NOW, executor);

    expect(result).toEqual({ ar: [], en: [], ur: [] });
    expect(hoisted.invalidateArticleWrite).not.toHaveBeenCalled();
    expect(hoisted.purgeBreakingNews).not.toHaveBeenCalled();
    expect(hoisted.deleteCache).not.toHaveBeenCalled();
  });
});
