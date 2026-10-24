import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { memoryCache } from "../memoryCache";
import { articles, enArticles, urArticles } from "@shared/schema";
import { invalidateArticleWrite } from "./contentInvalidation";
import { purgeBreakingNews } from "./cloudflarePurge";

export const BREAKING_NEWS_TYPE = "breaking" as const;
export const REGULAR_NEWS_TYPE = "regular" as const;

export interface ClearedBreakingArticle {
  id: string;
  slug: string | null;
  englishSlug: string | null;
}

export interface ArticleBreakingLike {
  id: string;
  newsType?: string | null;
  slug?: string | null;
  englishSlug?: string | null;
}

// Minimal Drizzle executor surface shared by `db` and `tx` inside `db.transaction`.
export type BreakingDbExecutor = Pick<typeof db, "select" | "insert" | "update"> & {
  transaction?: typeof db.transaction;
};

/** Pure check for whether an article's `newsType` represents breaking news (عاجل). */
export function isBreakingNewsType(newsType: unknown): newsType is typeof BREAKING_NEWS_TYPE {
  return newsType === BREAKING_NEWS_TYPE;
}

/**
 * Pure helper used by optimistic list updates and unit tests: when `targetId`
 * becomes `"breaking"`, every other item in the list that had `"breaking"` is
 * demoted to `"regular"`.
 */
export function applyExclusiveBreakingToList<T extends { id: string; newsType?: string | null }>(
  items: readonly T[],
  targetId: string,
  nextNewsType: string,
): T[] {
  const demoteOthers = isBreakingNewsType(nextNewsType);
  return items.map((item) => {
    if (item.id === targetId) {
      return { ...item, newsType: nextNewsType };
    }
    if (demoteOthers && isBreakingNewsType(item.newsType)) {
      return { ...item, newsType: REGULAR_NEWS_TYPE };
    }
    return item;
  });
}

/** Builds the WHERE clause `id <> keepArticleId AND news_type = 'breaking'`. */
export function buildClearOtherBreakingWhere(
  table: typeof articles | typeof enArticles | typeof urArticles,
  keepArticleId: string,
) {
  return and(ne(table.id, keepArticleId), eq(table.newsType, BREAKING_NEWS_TYPE));
}

async function runInTransaction<T>(
  executor: BreakingDbExecutor,
  fn: (tx: BreakingDbExecutor) => Promise<T>,
): Promise<T> {
  if (typeof executor.transaction === "function") {
    return executor.transaction(async (tx) => fn(tx as unknown as BreakingDbExecutor));
  }
  return fn(executor);
}

/**
 * Atomically clears `newsType = 'breaking'` (sets to `'regular'`) on every
 * Arabic article except `keepArticleId`, and keeps any linked English
 * translations (`en_articles.seo_metadata->>'sourceArticleId'`) in sync.
 */
export async function clearOtherBreakingArticles(
  keepArticleId: string,
  executor: BreakingDbExecutor = db,
): Promise<ClearedBreakingArticle[]> {
  if (!keepArticleId) return [];

  const cleared = await executor
    .update(articles)
    .set({
      newsType: REGULAR_NEWS_TYPE,
      updatedAt: new Date(),
    })
    .where(buildClearOtherBreakingWhere(articles, keepArticleId))
    .returning({
      id: articles.id,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
    });

  if (cleared.length > 0) {
    const clearedIds = cleared.map((row) => row.id);
    try {
      await executor
        .update(enArticles)
        .set({
          newsType: REGULAR_NEWS_TYPE,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(enArticles.newsType, BREAKING_NEWS_TYPE),
            inArray(sql`${enArticles.seoMetadata}->>'sourceArticleId'`, clearedIds),
          ),
        );
    } catch (err) {
      console.warn("[BreakingNews] Failed to sync EN translations for demoted AR breaking articles:", err);
    }
  }

  return cleared;
}

/**
 * Atomically clears `newsType = 'breaking'` on every English article except `keepEnArticleId`.
 */
export async function clearOtherEnBreakingArticles(
  keepEnArticleId: string,
  executor: BreakingDbExecutor = db,
): Promise<ClearedBreakingArticle[]> {
  if (!keepEnArticleId) return [];

  return executor
    .update(enArticles)
    .set({
      newsType: REGULAR_NEWS_TYPE,
      updatedAt: new Date(),
    })
    .where(buildClearOtherBreakingWhere(enArticles, keepEnArticleId))
    .returning({
      id: enArticles.id,
      slug: enArticles.slug,
      englishSlug: enArticles.englishSlug,
    });
}

/**
 * Atomically clears `newsType = 'breaking'` on every Urdu article except `keepUrArticleId`.
 */
export async function clearOtherUrBreakingArticles(
  keepUrArticleId: string,
  executor: BreakingDbExecutor = db,
): Promise<ClearedBreakingArticle[]> {
  if (!keepUrArticleId) return [];

  return executor
    .update(urArticles)
    .set({
      newsType: REGULAR_NEWS_TYPE,
      updatedAt: new Date(),
    })
    .where(buildClearOtherBreakingWhere(urArticles, keepUrArticleId))
    .returning({
      id: urArticles.id,
      slug: urArticles.slug,
      englishSlug: urArticles.englishSlug,
    });
}

/**
 * Purges per-article and feed/breaking caches for articles whose breaking flag
 * was automatically cleared. Passing `newsType: "breaking"` ensures the edge
 * breaking ticker and homepage are purged too.
 */
export function invalidateClearedBreakingArticles(
  cleared: readonly ClearedBreakingArticle[],
  reason = "breaking-exclusivity-clear",
): void {
  if (!cleared || cleared.length === 0) return;

  for (const prev of cleared) {
    invalidateArticleWrite(
      {
        id: prev.id,
        slug: prev.slug,
        englishSlug: prev.englishSlug,
        newsType: BREAKING_NEWS_TYPE,
      },
      { reason, warm: false },
    );
  }
  memoryCache.delete("lite-feed");
}

/** A published breaking article stops being breaking this long after `published_at`. */
export const BREAKING_NEWS_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export function breakingExpiryCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - BREAKING_NEWS_MAX_AGE_MS);
}

/**
 * Builds `status = 'published' AND hide_from_homepage IN (false, true) AND
 * news_type = 'breaking' AND published_at < cutoff`. The `hide_from_homepage`
 * term matches every row; it lets Postgres seek `idx_articles_breaking`
 * (status, hide_from_homepage, news_type, published_at) instead of scanning.
 */
export function buildExpiredBreakingWhere(
  table: typeof articles | typeof enArticles | typeof urArticles,
  cutoff: Date,
) {
  return and(
    eq(table.status, "published"),
    inArray(table.hideFromHomepage, [false, true]),
    eq(table.newsType, BREAKING_NEWS_TYPE),
    lt(table.publishedAt, cutoff),
  );
}

export interface ExpiredBreakingResult {
  ar: ClearedBreakingArticle[];
  en: ClearedBreakingArticle[];
  ur: ClearedBreakingArticle[];
}

/**
 * Demotes published breaking articles older than `BREAKING_NEWS_MAX_AGE_MS`
 * to regular in all three language tables. `updatedAt` is left alone so an
 * editor who has the article open does not get a save conflict.
 */
export async function expireStaleBreakingArticles(
  now: Date = new Date(),
  executor: BreakingDbExecutor = db,
): Promise<ExpiredBreakingResult> {
  const cutoff = breakingExpiryCutoff(now);

  const ar = await executor
    .update(articles)
    .set({ newsType: REGULAR_NEWS_TYPE })
    .where(buildExpiredBreakingWhere(articles, cutoff))
    .returning({ id: articles.id, slug: articles.slug, englishSlug: articles.englishSlug });

  const en = await executor
    .update(enArticles)
    .set({ newsType: REGULAR_NEWS_TYPE })
    .where(buildExpiredBreakingWhere(enArticles, cutoff))
    .returning({ id: enArticles.id, slug: enArticles.slug, englishSlug: enArticles.englishSlug });

  const ur = await executor
    .update(urArticles)
    .set({ newsType: REGULAR_NEWS_TYPE })
    .where(buildExpiredBreakingWhere(urArticles, cutoff))
    .returning({ id: urArticles.id, slug: urArticles.slug, englishSlug: urArticles.englishSlug });

  if (ar.length + en.length + ur.length > 0) {
    invalidateClearedBreakingArticles(ar, "breaking-auto-expire");
    invalidateClearedBreakingArticles(en, "en-breaking-auto-expire");
    invalidateClearedBreakingArticles(ur, "ur-breaking-auto-expire");
    if (en.length > 0) memoryCache.invalidatePattern("^en:article:base:");
    void purgeBreakingNews({ immediate: true });
  }

  return { ar, en, ur };
}

/**
 * Runs an Arabic article write inside a single transaction and, if the
 * resulting row has `newsType === 'breaking'`, atomically clears `breaking`
 * from all other articles in the same transaction, then invalidates caches
 * for any demoted articles after commit.
 */
export async function runWithExclusiveBreaking<T extends ArticleBreakingLike | null | undefined>(
  writeFn: (tx: BreakingDbExecutor) => Promise<T>,
  options: {
    executor?: BreakingDbExecutor;
    invalidateCleared?: boolean;
    reason?: string;
  } = {},
): Promise<{ article: T; cleared: ClearedBreakingArticle[] }> {
  const baseExecutor = options.executor ?? db;
  const { article, cleared } = await runInTransaction(baseExecutor, async (tx) => {
    const written = await writeFn(tx);
    if (written?.id && isBreakingNewsType(written.newsType)) {
      const demoted = await clearOtherBreakingArticles(written.id, tx);
      return { article: written, cleared: demoted };
    }
    return { article: written, cleared: [] as ClearedBreakingArticle[] };
  });

  if (options.invalidateCleared !== false && cleared.length > 0) {
    invalidateClearedBreakingArticles(cleared, options.reason ?? "breaking-exclusivity-clear");
  }

  return { article, cleared };
}

/**
 * Runs an English article write inside a single transaction and clears
 * `breaking` from all other `en_articles` rows when the written row has
 * `newsType === 'breaking'`.
 */
export async function runWithExclusiveEnBreaking<T extends ArticleBreakingLike | null | undefined>(
  writeFn: (tx: BreakingDbExecutor) => Promise<T>,
  options: {
    executor?: BreakingDbExecutor;
    invalidateCleared?: boolean;
    reason?: string;
  } = {},
): Promise<{ article: T; cleared: ClearedBreakingArticle[] }> {
  const baseExecutor = options.executor ?? db;
  const { article, cleared } = await runInTransaction(baseExecutor, async (tx) => {
    const written = await writeFn(tx);
    if (written?.id && isBreakingNewsType(written.newsType)) {
      const demoted = await clearOtherEnBreakingArticles(written.id, tx);
      return { article: written, cleared: demoted };
    }
    return { article: written, cleared: [] as ClearedBreakingArticle[] };
  });

  if (options.invalidateCleared !== false && cleared.length > 0) {
    invalidateClearedBreakingArticles(cleared, options.reason ?? "en-breaking-exclusivity-clear");
    memoryCache.invalidatePattern("^en:article:base:");
  }

  return { article, cleared };
}

/**
 * Runs an Urdu article write inside a single transaction and clears
 * `breaking` from all other `ur_articles` rows when the written row has
 * `newsType === 'breaking'`.
 */
export async function runWithExclusiveUrBreaking<T extends ArticleBreakingLike | null | undefined>(
  writeFn: (tx: BreakingDbExecutor) => Promise<T>,
  options: {
    executor?: BreakingDbExecutor;
    invalidateCleared?: boolean;
    reason?: string;
  } = {},
): Promise<{ article: T; cleared: ClearedBreakingArticle[] }> {
  const baseExecutor = options.executor ?? db;
  const { article, cleared } = await runInTransaction(baseExecutor, async (tx) => {
    const written = await writeFn(tx);
    if (written?.id && isBreakingNewsType(written.newsType)) {
      const demoted = await clearOtherUrBreakingArticles(written.id, tx);
      return { article: written, cleared: demoted };
    }
    return { article: written, cleared: [] as ClearedBreakingArticle[] };
  });

  if (options.invalidateCleared !== false && cleared.length > 0) {
    invalidateClearedBreakingArticles(cleared, options.reason ?? "ur-breaking-exclusivity-clear");
  }

  return { article, cleared };
}

/**
 * Toggles an Arabic article's breaking status in a single transaction,
 * clearing `breaking` from all other Arabic articles when turning breaking ON,
 * syncing linked English translations, and invalidating caches.
 */
export async function toggleArticleBreakingExclusive(
  articleId: string,
  executor: BreakingDbExecutor = db,
) {
  const txResult = await runInTransaction(executor, async (tx) => {
    const [existing] = await tx
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!existing) return null;

    const newNewsType = isBreakingNewsType(existing.newsType)
      ? REGULAR_NEWS_TYPE
      : BREAKING_NEWS_TYPE;

    const [updatedArticle] = await tx
      .update(articles)
      .set({
        newsType: newNewsType,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleId))
      .returning();

    const cleared = isBreakingNewsType(newNewsType)
      ? await clearOtherBreakingArticles(articleId, tx)
      : [];

    try {
      const updatedEn = await tx
        .update(enArticles)
        .set({
          newsType: newNewsType,
          updatedAt: new Date(),
        })
        .where(sql`${enArticles.seoMetadata}->>'sourceArticleId' = ${articleId}`)
        .returning({ id: enArticles.id });

      if (isBreakingNewsType(newNewsType) && updatedEn.length > 0) {
        await clearOtherEnBreakingArticles(updatedEn[0].id, tx);
      }
    } catch (syncErr) {
      console.warn(`[Breaking News] Failed to sync EN translation for ${articleId}:`, syncErr);
    }

    return {
      previousArticle: existing,
      updatedArticle,
      cleared,
    };
  });

  if (!txResult) return null;

  const { previousArticle, updatedArticle, cleared } = txResult;
  invalidateArticleWrite(updatedArticle, { reason: "article-toggle-breaking" });
  if (isBreakingNewsType(previousArticle.newsType) && !isBreakingNewsType(updatedArticle.newsType)) {
    void purgeBreakingNews({ immediate: true });
  }
  if (cleared.length > 0) {
    invalidateClearedBreakingArticles(cleared, "article-toggle-breaking-clear");
  }
  memoryCache.delete("lite-feed");

  return txResult;
}

/**
 * Toggles an English article's breaking status in a single transaction,
 * clearing `breaking` from all other English articles when turning breaking ON
 * and syncing the linked Arabic source article if present.
 */
export async function toggleEnArticleBreakingExclusive(
  articleId: string,
  executor: BreakingDbExecutor = db,
) {
  const txResult = await runInTransaction(executor, async (tx) => {
    const [existing] = await tx
      .select()
      .from(enArticles)
      .where(eq(enArticles.id, articleId))
      .limit(1);

    if (!existing) return null;

    const newNewsType = isBreakingNewsType(existing.newsType)
      ? REGULAR_NEWS_TYPE
      : BREAKING_NEWS_TYPE;

    const [updatedArticle] = await tx
      .update(enArticles)
      .set({
        newsType: newNewsType,
        updatedAt: new Date(),
      })
      .where(eq(enArticles.id, articleId))
      .returning();

    const clearedEn = isBreakingNewsType(newNewsType)
      ? await clearOtherEnBreakingArticles(articleId, tx)
      : [];

    let clearedAr: ClearedBreakingArticle[] = [];
    const sourceId =
      updatedArticle.seoMetadata && typeof updatedArticle.seoMetadata === "object"
        ? (updatedArticle.seoMetadata as { sourceArticleId?: string }).sourceArticleId
        : undefined;
    if (sourceId) {
      try {
        await tx
          .update(articles)
          .set({ newsType: newNewsType, updatedAt: new Date() })
          .where(eq(articles.id, sourceId));
        if (isBreakingNewsType(newNewsType)) {
          clearedAr = await clearOtherBreakingArticles(sourceId, tx);
        }
      } catch (syncErr) {
        console.warn(`[Breaking News] Failed to sync AR source for EN ${articleId}:`, syncErr);
      }
    }

    return {
      previousArticle: existing,
      updatedArticle,
      clearedEn,
      clearedAr,
    };
  });

  if (!txResult) return null;

  const { previousArticle, updatedArticle, clearedEn, clearedAr } = txResult;
  invalidateArticleWrite(updatedArticle, { reason: "en-article-toggle-breaking" });
  if (isBreakingNewsType(previousArticle.newsType) && !isBreakingNewsType(updatedArticle.newsType)) {
    void purgeBreakingNews({ immediate: true });
  }
  if (clearedEn.length > 0) {
    invalidateClearedBreakingArticles(clearedEn, "en-article-toggle-breaking-clear");
  }
  if (clearedAr.length > 0) {
    invalidateClearedBreakingArticles(clearedAr, "ar-from-en-toggle-breaking-clear");
  }
  memoryCache.invalidatePattern("^en:article:base:");
  memoryCache.delete("lite-feed");

  return txResult;
}

/**
 * Toggles an Urdu article's breaking status in a single transaction,
 * clearing `breaking` from all other Urdu articles when turning breaking ON.
 */
export async function toggleUrArticleBreakingExclusive(
  articleId: string,
  executor: BreakingDbExecutor = db,
) {
  const txResult = await runInTransaction(executor, async (tx) => {
    const [existing] = await tx
      .select()
      .from(urArticles)
      .where(eq(urArticles.id, articleId))
      .limit(1);

    if (!existing) return null;

    const newNewsType = isBreakingNewsType(existing.newsType)
      ? REGULAR_NEWS_TYPE
      : BREAKING_NEWS_TYPE;

    const [updatedArticle] = await tx
      .update(urArticles)
      .set({
        newsType: newNewsType,
        updatedAt: new Date(),
      })
      .where(eq(urArticles.id, articleId))
      .returning();

    const cleared = isBreakingNewsType(newNewsType)
      ? await clearOtherUrBreakingArticles(articleId, tx)
      : [];

    return {
      previousArticle: existing,
      updatedArticle,
      cleared,
    };
  });

  if (!txResult) return null;

  const { previousArticle, updatedArticle, cleared } = txResult;
  invalidateArticleWrite(updatedArticle, { reason: "ur-article-toggle-breaking" });
  if (isBreakingNewsType(previousArticle.newsType) && !isBreakingNewsType(updatedArticle.newsType)) {
    void purgeBreakingNews({ immediate: true });
  }
  if (cleared.length > 0) {
    invalidateClearedBreakingArticles(cleared, "ur-article-toggle-breaking-clear");
  }
  memoryCache.delete("lite-feed");

  return txResult;
}

const instrumentedStorages = new WeakSet<object>();

/**
 * Wraps `storage` article write methods (`createArticle`, `updateArticle`,
 * `toggleArticleBreaking`, `approvePublisherArticle`, `createUrArticle`,
 * `updateUrArticle`) so any code path calling `storage.*` directly also
 * enforces single-breaking-article exclusivity without needing edits to the
 * frozen `server/storage.ts` monolith.
 */
export function installStorageBreakingExclusivity(targetStorage: Record<string, unknown> | null | undefined): void {
  if (!targetStorage || typeof targetStorage !== "object" || instrumentedStorages.has(targetStorage)) {
    return;
  }
  instrumentedStorages.add(targetStorage);

  const wrapArWrite = (methodName: string, reason: string) => {
    const orig = targetStorage[methodName];
    if (typeof orig !== "function") return;
    targetStorage[methodName] = async function (this: unknown, ...args: unknown[]) {
      const result = (await orig.apply(this, args)) as ArticleBreakingLike | undefined;
      if (result?.id && isBreakingNewsType(result.newsType)) {
        const maybeTx =
          methodName === "createArticle" && args[1] && typeof (args[1] as BreakingDbExecutor).update === "function"
            ? (args[1] as BreakingDbExecutor)
            : db;
        const cleared = await clearOtherBreakingArticles(result.id, maybeTx);
        if (cleared.length > 0) {
          invalidateClearedBreakingArticles(cleared, reason);
        }
      }
      return result;
    };
  };

  wrapArWrite("createArticle", "storage-create-breaking-clear");
  wrapArWrite("updateArticle", "storage-update-breaking-clear");
  wrapArWrite("approvePublisherArticle", "storage-approve-publisher-breaking-clear");

  const origToggle = targetStorage.toggleArticleBreaking;
  if (typeof origToggle === "function") {
    targetStorage.toggleArticleBreaking = async function (this: unknown, id: string) {
      const toggled = await toggleArticleBreakingExclusive(id);
      if (!toggled) {
        throw new Error("Article not found");
      }
      return toggled.updatedArticle;
    };
  }

  const wrapUrWrite = (methodName: string, reason: string) => {
    const orig = targetStorage[methodName];
    if (typeof orig !== "function") return;
    targetStorage[methodName] = async function (this: unknown, ...args: unknown[]) {
      const result = (await orig.apply(this, args)) as ArticleBreakingLike | undefined;
      if (result?.id && isBreakingNewsType(result.newsType)) {
        const cleared = await clearOtherUrBreakingArticles(result.id, db);
        if (cleared.length > 0) {
          invalidateClearedBreakingArticles(cleared, reason);
        }
      }
      return result;
    };
  };

  wrapUrWrite("createUrArticle", "storage-create-ur-breaking-clear");
  wrapUrWrite("updateUrArticle", "storage-update-ur-breaking-clear");
}

const MOBILE_ADMIN_ARTICLE_STATUSES = ["draft", "scheduled", "published", "archived"] as const;

export function buildMobileAdminArticleUpdates(
  body: Record<string, unknown>,
  existing: {
    publishedAt: Date | null;
    seo: unknown;
  },
): Record<string, unknown> {
  const b = body || {};
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof b.title === "string") updates.title = b.title;
  if (typeof b.subtitle === "string") updates.subtitle = b.subtitle;
  if (typeof b.excerpt === "string") updates.excerpt = b.excerpt;
  if (typeof b.content === "string") updates.content = b.content;
  else if (typeof b.body === "string") updates.content = b.body;
  if (typeof b.slug === "string" && b.slug.trim()) updates.slug = b.slug.trim();
  if (typeof b.aiSummary === "string") updates.aiSummary = b.aiSummary;
  if (typeof b.imageUrl === "string") updates.imageUrl = b.imageUrl;

  if (b.categoryId === null || typeof b.categoryId === "string") updates.categoryId = b.categoryId || null;
  if (b.reporterId === null || typeof b.reporterId === "string") updates.reporterId = b.reporterId || null;
  if (b.authorId === null || typeof b.authorId === "string") updates.authorId = b.authorId || null;

  if (typeof b.articleType === "string") updates.articleType = b.articleType;
  if (typeof b.newsType === "string") updates.newsType = b.newsType;
  if (typeof b.isFeatured === "boolean") {
    updates.isFeatured = b.isFeatured;
    updates.displayOrder = b.isFeatured ? Math.floor(Date.now() / 1000) : 0;
  }
  if (typeof b.isReading === "boolean") updates.isReading = b.isReading;
  if (typeof b.hideFromHomepage === "boolean") updates.hideFromHomepage = b.hideFromHomepage;

  if (b.scheduledAt === null) {
    updates.scheduledAt = null;
  } else if (typeof b.scheduledAt === "string" && b.scheduledAt) {
    const d = new Date(b.scheduledAt);
    if (!isNaN(d.getTime())) updates.scheduledAt = d;
  }

  if (b.seo && typeof b.seo === "object") {
    const seoInput = b.seo as Record<string, unknown>;
    const prev = existing.seo && typeof existing.seo === "object" ? (existing.seo as Record<string, unknown>) : {};
    updates.seo = {
      ...prev,
      metaTitle: typeof seoInput.metaTitle === "string" ? seoInput.metaTitle : (prev.metaTitle ?? ""),
      metaDescription: typeof seoInput.metaDescription === "string" ? seoInput.metaDescription : (prev.metaDescription ?? ""),
      keywords: Array.isArray(seoInput.keywords) ? seoInput.keywords : (prev.keywords ?? []),
    };
  }

  if (typeof b.status === "string" && (MOBILE_ADMIN_ARTICLE_STATUSES as readonly string[]).includes(b.status)) {
    updates.status = b.status;
    if (b.status === "published" && !existing.publishedAt) {
      updates.publishedAt = new Date();
    }
  }

  return updates;
}


