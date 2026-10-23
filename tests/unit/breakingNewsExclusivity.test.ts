import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { articles, enArticles, urArticles } from "@shared/schema";

const hoisted = vi.hoisted(() => ({
  invalidateArticleWrite: vi.fn(),
  purgeBreakingNews: vi.fn().mockResolvedValue(undefined),
  deleteCache: vi.fn(),
  invalidatePattern: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: {},
}));

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
  BREAKING_NEWS_TYPE,
  REGULAR_NEWS_TYPE,
  applyExclusiveBreakingToList,
  buildClearOtherBreakingWhere,
  buildMobileAdminArticleUpdates,
  clearOtherBreakingArticles,
  clearOtherEnBreakingArticles,
  clearOtherUrBreakingArticles,
  installStorageBreakingExclusivity,
  invalidateClearedBreakingArticles,
  isBreakingNewsType,
  runWithExclusiveBreaking,
  runWithExclusiveEnBreaking,
  runWithExclusiveUrBreaking,
  toggleArticleBreakingExclusive,
  toggleEnArticleBreakingExclusive,
  toggleUrArticleBreakingExclusive,
  type BreakingDbExecutor,
  type ClearedBreakingArticle,
} from "../../server/services/breakingNewsService";

interface FakeTableState {
  articles: Array<{
    id: string;
    slug: string | null;
    englishSlug: string | null;
    newsType: string;
    status?: string;
  }>;
  enArticles: Array<{
    id: string;
    slug: string | null;
    englishSlug: string | null;
    newsType: string;
    seoMetadata?: { sourceArticleId?: string } | null;
  }>;
  urArticles: Array<{
    id: string;
    slug: string | null;
    englishSlug: string | null;
    newsType: string;
  }>;
}

/**
 * In-memory fake executor that records operations and simulates the atomic
 * `UPDATE ... WHERE id <> keepId AND news_type = 'breaking'` behavior inside a
 * single transaction.
 */
function createFakeExecutor(initial: Partial<FakeTableState> = {}) {
  const state: FakeTableState = {
    articles: (initial.articles ?? []).map((r) => ({ ...r })),
    enArticles: (initial.enArticles ?? []).map((r) => ({ ...r })),
    urArticles: (initial.urArticles ?? []).map((r) => ({ ...r })),
  };
  let transactionCount = 0;
  const operations: string[] = [];

  const dialect = new PgDialect();

  const resolveRows = (table: unknown) => {
    if (table === articles) return state.articles;
    if (table === enArticles) return state.enArticles;
    if (table === urArticles) return state.urArticles;
    throw new Error("Unknown table");
  };

  const executor: BreakingDbExecutor = {
    select: (() => ({
      from: (table: unknown) => ({
        where: (cond: unknown) => ({
          limit: async () => {
            const q = dialect.sqlToQuery(cond as never);
            const idParam = q.params[0];
            const rows = resolveRows(table);
            return rows.filter((r) => r.id === idParam).slice(0, 1).map((r) => ({ ...r }));
          },
        }),
      }),
    })) as unknown as BreakingDbExecutor["select"],

    insert: ((table: unknown) => ({
      values: (val: unknown) => ({
        returning: async () => {
          const item = (Array.isArray(val) ? val[0] : val) as {
            id?: string;
            slug?: string | null;
            englishSlug?: string | null;
            newsType?: string;
            status?: string;
          };
          const created = {
            id: item.id ?? `new-${Date.now()}`,
            slug: item.slug ?? "new-slug",
            englishSlug: item.englishSlug ?? "new-en-slug",
            newsType: item.newsType ?? REGULAR_NEWS_TYPE,
            status: item.status ?? "published",
          };
          operations.push(`insert:${created.id}:${created.newsType}`);
          resolveRows(table).push(created);
          return [created];
        },
      }),
    })) as unknown as BreakingDbExecutor["insert"],

    update: ((table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (cond: unknown) => {
          const q = dialect.sqlToQuery(cond as never);
          const executeUpdate = () => {
            const rows = resolveRows(table);
            // Case 1: clearOther*BreakingArticles (`id <> $1 and news_type = $2`)
            if (q.sql.includes("<>") && q.params.includes(BREAKING_NEWS_TYPE)) {
              const keepId = String(q.params[0]);
              const affected = rows.filter((r) => r.id !== keepId && r.newsType === BREAKING_NEWS_TYPE);
              for (const row of affected) {
                row.newsType = String(patch.newsType ?? REGULAR_NEWS_TYPE);
              }
              operations.push(`clearOther:${keepId}:demoted=${affected.map((a) => a.id).join(",")}`);
              return affected.map((r) => ({ ...r }));
            }
            // Case 2: EN translation sync by sourceArticleId IN (...)
            if (table === enArticles && q.sql.includes("sourceArticleId")) {
              const stringParams = q.params.map(String);
              const affected = state.enArticles.filter((r) => {
                const src = r.seoMetadata?.sourceArticleId;
                if (!src) return false;
                if (q.sql.includes(" in ")) {
                  return r.newsType === BREAKING_NEWS_TYPE && stringParams.includes(src);
                }
                return stringParams.includes(src);
              });
              for (const row of affected) {
                row.newsType = String(patch.newsType ?? REGULAR_NEWS_TYPE);
              }
              operations.push(`syncEnSource:${affected.map((a) => a.id).join(",")}`);
              return affected.map((r) => ({ ...r }));
            }
            // Case 3: direct single-row update by id (`id = $1`)
            const targetId = String(q.params[0]);
            const affected = rows.filter((r) => r.id === targetId);
            for (const row of affected) {
              Object.assign(row, patch);
            }
            operations.push(`update:${targetId}:${String(patch.newsType ?? "unchanged")}`);
            return affected.map((r) => ({ ...r }));
          };

          const promise = Promise.resolve().then(() => executeUpdate());
          return Object.assign(promise, {
            returning: async () => promise,
          });
        },
      }),
    })) as unknown as BreakingDbExecutor["update"],

    transaction: (async <T>(fn: (tx: BreakingDbExecutor) => Promise<T>): Promise<T> => {
      transactionCount += 1;
      const snapshot: FakeTableState = JSON.parse(JSON.stringify(state));
      operations.push("tx:begin");
      try {
        const res = await fn(executor);
        operations.push("tx:commit");
        return res;
      } catch (err) {
        state.articles = snapshot.articles;
        state.enArticles = snapshot.enArticles;
        state.urArticles = snapshot.urArticles;
        operations.push("tx:rollback");
        throw err;
      }
    }) as unknown as BreakingDbExecutor["transaction"],
  };

  return {
    executor,
    state,
    operations,
    getTransactionCount: () => transactionCount,
  };
}

describe("breakingNewsService — single breaking news exclusivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("pure helpers & SQL predicate", () => {
    it("identifies breaking newsType accurately", () => {
      expect(isBreakingNewsType("breaking")).toBe(true);
      expect(isBreakingNewsType("regular")).toBe(false);
      expect(isBreakingNewsType("featured")).toBe(false);
      expect(isBreakingNewsType(null)).toBe(false);
      expect(isBreakingNewsType(undefined)).toBe(false);
    });

    it("demotes all other breaking items in a list when enabling breaking on one item", () => {
      const list = [
        { id: "a1", newsType: "breaking", title: "خبر 1" },
        { id: "a2", newsType: "regular", title: "خبر 2" },
        { id: "a3", newsType: "breaking", title: "خبر 3" },
      ];

      const afterEnablingA2 = applyExclusiveBreakingToList(list, "a2", "breaking");
      expect(afterEnablingA2).toEqual([
        { id: "a1", newsType: "regular", title: "خبر 1" },
        { id: "a2", newsType: "breaking", title: "خبر 2" },
        { id: "a3", newsType: "regular", title: "خبر 3" },
      ]);

      // Turning off breaking on a2 only changes a2
      const afterDisablingA2 = applyExclusiveBreakingToList(afterEnablingA2, "a2", "regular");
      expect(afterDisablingA2.map((x) => x.newsType)).toEqual(["regular", "regular", "regular"]);
    });

    it("compiles buildClearOtherBreakingWhere to atomic WHERE id <> $1 AND news_type = 'breaking'", () => {
      const dialect = new PgDialect();
      const arQuery = dialect.sqlToQuery(buildClearOtherBreakingWhere(articles, "art-new") as never);
      expect(arQuery.sql).toContain('"articles"."id" <> $1');
      expect(arQuery.sql).toContain('"articles"."news_type" = $2');
      expect(arQuery.params).toEqual(["art-new", "breaking"]);

      const enQuery = dialect.sqlToQuery(buildClearOtherBreakingWhere(enArticles, "en-new") as never);
      expect(enQuery.sql).toContain('"en_articles"."id" <> $1');
      expect(enQuery.params).toEqual(["en-new", "breaking"]);

      const urQuery = dialect.sqlToQuery(buildClearOtherBreakingWhere(urArticles, "ur-new") as never);
      expect(urQuery.sql).toContain('"ur_articles"."id" <> $1');
      expect(urQuery.params).toEqual(["ur-new", "breaking"]);
    });
  });

  describe("create / edit / publish / scheduled / bot-drafts with runWithExclusiveBreaking", () => {
    it("clears breaking from all previous breaking articles in one transaction when creating or publishing a breaking article", async () => {
      const { executor, state, operations, getTransactionCount } = createFakeExecutor({
        articles: [
          { id: "old-breaking-1", slug: "old-1", englishSlug: "old1en", newsType: "breaking" },
          { id: "old-breaking-2", slug: "old-2", englishSlug: "old2en", newsType: "breaking" },
          { id: "regular-1", slug: "reg-1", englishSlug: "reg1en", newsType: "regular" },
        ],
        enArticles: [
          {
            id: "en-linked-1",
            slug: "old1en",
            englishSlug: "old1en",
            newsType: "breaking",
            seoMetadata: { sourceArticleId: "old-breaking-1" },
          },
        ],
      });

      const { article, cleared } = await runWithExclusiveBreaking(
        async (tx) => {
          const [created] = await tx
            .insert(articles)
            .values({
              id: "new-breaking",
              slug: "new-ar",
              englishSlug: "newen",
              newsType: "breaking",
            } as never)
            .returning();
          return created;
        },
        { executor, reason: "test-create-breaking" },
      );

      expect(getTransactionCount()).toBe(1);
      expect(article.id).toBe("new-breaking");
      expect(cleared.map((c) => c.id)).toEqual(["old-breaking-1", "old-breaking-2"]);

      // Only the newly written article remains breaking
      const breakingInDb = state.articles.filter((a) => a.newsType === "breaking");
      expect(breakingInDb.map((a) => a.id)).toEqual(["new-breaking"]);

      // Linked English translation of the demoted Arabic article is also demoted
      expect(state.enArticles[0].newsType).toBe("regular");

      // Both operations happened inside the transaction before commit
      expect(operations).toEqual([
        "tx:begin",
        "insert:new-breaking:breaking",
        "clearOther:new-breaking:demoted=old-breaking-1,old-breaking-2",
        "syncEnSource:en-linked-1",
        "tx:commit",
      ]);

      // Caches invalidated for both demoted articles
      expect(hoisted.invalidateArticleWrite).toHaveBeenCalledTimes(2);
      expect(hoisted.invalidateArticleWrite).toHaveBeenCalledWith(
        expect.objectContaining({ id: "old-breaking-1", slug: "old-1", englishSlug: "old1en", newsType: "breaking" }),
        { reason: "test-create-breaking", warm: false },
      );
      expect(hoisted.deleteCache).toHaveBeenCalledWith("lite-feed");
    });

    it("does not clear existing breaking article when saving/publishing a regular article", async () => {
      const { executor, state } = createFakeExecutor({
        articles: [
          { id: "current-breaking", slug: "cur-1", englishSlug: "cur1en", newsType: "breaking" },
        ],
      });

      const { article, cleared } = await runWithExclusiveBreaking(
        async (tx) => {
          const [created] = await tx
            .insert(articles)
            .values({
              id: "new-regular",
              slug: "new-reg",
              englishSlug: "newreg",
              newsType: "regular",
            } as never)
            .returning();
          return created;
        },
        { executor },
      );

      expect(article.newsType).toBe("regular");
      expect(cleared).toEqual([]);
      expect(state.articles.find((a) => a.id === "current-breaking")?.newsType).toBe("breaking");
      expect(hoisted.invalidateArticleWrite).not.toHaveBeenCalled();
    });

    it("rolls back and preserves the previous breaking article if the transaction throws", async () => {
      const { executor, state } = createFakeExecutor({
        articles: [
          { id: "current-breaking", slug: "cur-1", englishSlug: "cur1en", newsType: "breaking" },
        ],
      });

      await expect(
        runWithExclusiveBreaking(
          async (tx) => {
            await clearOtherBreakingArticles("failed-new", tx);
            throw new Error("NO_CREDITS");
          },
          { executor },
        ),
      ).rejects.toThrow("NO_CREDITS");

      expect(state.articles.find((a) => a.id === "current-breaking")?.newsType).toBe("breaking");
      expect(hoisted.invalidateArticleWrite).not.toHaveBeenCalled();
    });

    it("does not clear existing breaking articles when conditional update returns undefined (e.g. 409 lock/version conflict)", async () => {
      const { executor, state } = createFakeExecutor({
        articles: [
          { id: "current-breaking", slug: "cur-1", englishSlug: "cur1en", newsType: "breaking" },
        ],
      });

      const { article, cleared } = await runWithExclusiveBreaking(
        async () => undefined,
        { executor },
      );

      expect(article).toBeUndefined();
      expect(cleared).toEqual([]);
      expect(state.articles[0].newsType).toBe("breaking");
    });
  });

  describe("toggleArticleBreakingExclusive (AR / EN / UR)", () => {
    it("toggles an Arabic article ON to breaking and clears all other breaking articles", async () => {
      const { executor, state } = createFakeExecutor({
        articles: [
          { id: "art-1", slug: "s-1", englishSlug: "e-1", newsType: "breaking" },
          { id: "art-2", slug: "s-2", englishSlug: "e-2", newsType: "regular" },
        ],
      });

      const res = await toggleArticleBreakingExclusive("art-2", executor);
      expect(res).not.toBeNull();
      expect(res!.previousArticle.newsType).toBe("regular");
      expect(res!.updatedArticle.newsType).toBe("breaking");
      expect(res!.cleared.map((c) => c.id)).toEqual(["art-1"]);

      expect(state.articles.find((a) => a.id === "art-1")?.newsType).toBe("regular");
      expect(state.articles.find((a) => a.id === "art-2")?.newsType).toBe("breaking");
    });

    it("toggles an Arabic breaking article OFF to regular and purges edge breaking ticker", async () => {
      const { executor, state } = createFakeExecutor({
        articles: [
          { id: "art-1", slug: "s-1", englishSlug: "e-1", newsType: "breaking" },
        ],
      });

      const res = await toggleArticleBreakingExclusive("art-1", executor);
      expect(res).not.toBeNull();
      expect(res!.updatedArticle.newsType).toBe("regular");
      expect(res!.cleared).toEqual([]);
      expect(state.articles[0].newsType).toBe("regular");
      expect(hoisted.purgeBreakingNews).toHaveBeenCalledWith({ immediate: true });
    });

    it("returns null when toggling a non-existent article", async () => {
      const { executor } = createFakeExecutor();
      expect(await toggleArticleBreakingExclusive("missing", executor)).toBeNull();
      expect(await toggleEnArticleBreakingExclusive("missing", executor)).toBeNull();
      expect(await toggleUrArticleBreakingExclusive("missing", executor)).toBeNull();
    });

    it("enforces single breaking article for English and Urdu articles", async () => {
      const { executor, state } = createFakeExecutor({
        enArticles: [
          { id: "en-1", slug: "en-1", englishSlug: "en-1", newsType: "breaking" },
          { id: "en-2", slug: "en-2", englishSlug: "en-2", newsType: "regular" },
        ],
        urArticles: [
          { id: "ur-1", slug: "ur-1", englishSlug: "ur-1", newsType: "breaking" },
          { id: "ur-2", slug: "ur-2", englishSlug: "ur-2", newsType: "regular" },
        ],
      });

      await toggleEnArticleBreakingExclusive("en-2", executor);
      expect(state.enArticles.find((a) => a.id === "en-1")?.newsType).toBe("regular");
      expect(state.enArticles.find((a) => a.id === "en-2")?.newsType).toBe("breaking");

      await toggleUrArticleBreakingExclusive("ur-2", executor);
      expect(state.urArticles.find((a) => a.id === "ur-1")?.newsType).toBe("regular");
      expect(state.urArticles.find((a) => a.id === "ur-2")?.newsType).toBe("breaking");
    });

    it("supports runWithExclusiveEnBreaking and runWithExclusiveUrBreaking", async () => {
      const { executor, state } = createFakeExecutor({
        enArticles: [{ id: "en-old", slug: "en-old", englishSlug: "en-old", newsType: "breaking" }],
        urArticles: [{ id: "ur-old", slug: "ur-old", englishSlug: "ur-old", newsType: "breaking" }],
      });

      await runWithExclusiveEnBreaking(
        async (tx) => {
          const [created] = await tx
            .insert(enArticles)
            .values({ id: "en-new", slug: "en-new", englishSlug: "en-new", newsType: "breaking" } as never)
            .returning();
          return created;
        },
        { executor },
      );
      expect(state.enArticles.filter((a) => a.newsType === "breaking").map((a) => a.id)).toEqual(["en-new"]);

      await runWithExclusiveUrBreaking(
        async (tx) => {
          const [created] = await tx
            .insert(urArticles)
            .values({ id: "ur-new", slug: "ur-new", englishSlug: "ur-new", newsType: "breaking" } as never)
            .returning();
          return created;
        },
        { executor },
      );
      expect(state.urArticles.filter((a) => a.newsType === "breaking").map((a) => a.id)).toEqual(["ur-new"]);
    });
  });

  describe("installStorageBreakingExclusivity", () => {
    it("wraps storage createArticle and updateArticle so breaking writes clear other breaking rows", async () => {
      const { executor, state } = createFakeExecutor({
        articles: [
          { id: "existing-breaking", slug: "ex-b", englishSlug: "exb", newsType: "breaking" },
        ],
      });

      const fakeStorage = {
        createArticle: vi.fn(async (data: { id: string; newsType: string }, tx?: BreakingDbExecutor) => {
          const [created] = await (tx ?? executor).insert(articles).values(data as never).returning();
          return created;
        }),
      };

      installStorageBreakingExclusivity(fakeStorage);
      // Calling install twice is idempotent
      installStorageBreakingExclusivity(fakeStorage);

      const created = await fakeStorage.createArticle(
        { id: "via-storage", newsType: "breaking" },
        executor,
      );

      expect(created.id).toBe("via-storage");
      expect(state.articles.find((a) => a.id === "existing-breaking")?.newsType).toBe("regular");
      expect(state.articles.find((a) => a.id === "via-storage")?.newsType).toBe("breaking");
    });
  });

  describe("buildMobileAdminArticleUpdates & cache invalidation helpers", () => {
    it("preserves newsType and sets publishedAt when transitioning to published", () => {
      const updates = buildMobileAdminArticleUpdates(
        {
          title: "خبر عاجل",
          newsType: "breaking",
          status: "published",
          isFeatured: true,
        },
        { publishedAt: null, seo: { metaTitle: "قديم", keywords: ["أ"] } },
      );

      expect(updates.newsType).toBe("breaking");
      expect(updates.status).toBe("published");
      expect(updates.publishedAt).toBeInstanceOf(Date);
      expect(updates.isFeatured).toBe(true);
      expect(typeof updates.displayOrder).toBe("number");
    });

    it("no-ops when invalidateClearedBreakingArticles receives an empty list", () => {
      invalidateClearedBreakingArticles([] as ClearedBreakingArticle[]);
      expect(hoisted.invalidateArticleWrite).not.toHaveBeenCalled();
    });
  });
});
