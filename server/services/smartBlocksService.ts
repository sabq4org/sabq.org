/**
 * Smart Blocks / Homepage Stage — خدمة المشاهد التحريرية الحية.
 *
 * مصدر الحقيقة للجداول: smart_blocks / en_smart_blocks / ur_smart_blocks.
 * لا تستورد هذه الخدمة من routes.ts القديم — المسارات الجديدة في
 * server/routes/smartBlocks.ts (ADR-001).
 */

import { db } from "../db";
import { CACHE_TTL, memoryCache, withSWR } from "../memoryCache";
import {
  articles,
  categories,
  smartBlocks,
  enSmartBlocks,
  urSmartBlocks,
  enArticles,
  urArticles,
  type SmartBlock,
  type InsertSmartBlock,
  type UpdateSmartBlock,
  type EnSmartBlock,
  type InsertEnSmartBlock,
  type UrSmartBlock,
  type InsertUrSmartBlock,
  type SmartBlockSourceType,
} from "@shared/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

export const SMART_BLOCK_PLACEMENTS = [
  "below_featured",
  "above_all_news",
  "between_all_and_murqap",
  "above_footer",
] as const;

/** سقف حماية من ضغط DB على الصفحة الرئيسية */
export const HOMEPAGE_MAX_ACTIVE_BLOCKS = 8;
export const HOMEPAGE_MAX_PER_PLACEMENT = 3;
export const MAX_SEARCH_TERMS = 5;

/**
 * افتراضي حداثة المقالات — يمنع full-table scan على articles.
 * المفتاح `blocks:` يتوافق مع invalidatePattern('^blocks:') عند النشر.
 */
const DEFAULT_LOOKBACK_HOURS: Record<string, number | null> = {
  keyword: 14 * 24,
  topic_cluster: 14 * 24,
  event_window: 72,
  trending: 48,
  category_feed: 30 * 24,
  curated: null,
};

/** إبطال كاش البلوكات (SWR + memory) — يُستدعى عند CRUD ويفعّله النشر أيضاً عبر ^blocks: */
export function invalidateSmartBlocksCache(): void {
  memoryCache.invalidatePattern("^blocks:smart:");
}

export type SmartBlockLocale = "ar" | "en" | "ur";

export type SmartBlockArticle = {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string | null;
  publishedAt: Date | string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  infographicBannerUrl?: string | null;
  excerpt?: string | null;
  newsType?: string | null;
  views?: number | null;
  aiGenerated?: boolean | null;
  isAiGeneratedThumbnail?: boolean | null;
  articleType?: string | null;
  imageFocalPoint?: { x: number; y: number } | null;
  category?: {
    nameAr?: string | null;
    nameEn?: string | null;
    nameUr?: string | null;
    slug: string;
    englishSlug?: string | null;
    color: string | null;
  } | null;
  pinned?: boolean;
};

type ListFilters = {
  isActive?: boolean;
  placement?: string;
  playbook?: string;
  /** إن true: استبعد المشاهد خارج نافذة الجدولة */
  respectSchedule?: boolean;
};

type ResolveOptions = {
  /** تجاوز حد المقالات من الطلب */
  limit?: number;
  /** للمعاينة قبل الحفظ — لا يفرض الجدولة */
  preview?: boolean;
};

function tableFor(locale: SmartBlockLocale) {
  if (locale === "en") return enSmartBlocks;
  if (locale === "ur") return urSmartBlocks;
  return smartBlocks;
}

function isWithinSchedule(
  start: Date | null | undefined,
  end: Date | null | undefined,
  now = new Date(),
): boolean {
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function collectSearchTerms(block: {
  keyword?: string | null;
  keywords?: string[] | null;
  sourceType?: string | null;
}): string[] {
  const terms = new Set<string>();
  if (block.keyword?.trim()) terms.add(block.keyword.trim());
  for (const k of block.keywords || []) {
    if (k?.trim()) terms.add(k.trim());
  }
  return Array.from(terms).slice(0, MAX_SEARCH_TERMS);
}

/**
 * مسار بحث رخيص نسبياً (تجنّب excerpt ILIKE + EXISTS على الوسوم لكل صف —
 * كان مصدر ضغط DB التاريخي مع N بلوكات × زوار).
 * الأولوية: تطابق seo.keywords الدقيق ثم عنوان يحتوي الكلمة.
 */
function keywordMatchSql(term: string): SQL {
  const pat = `%${term}%`;
  return or(
    sql`${articles.seo}::jsonb -> 'keywords' @> ${JSON.stringify([term])}::jsonb`,
    ilike(articles.title, pat),
  )!;
}

function effectiveLookbackHours(
  sourceType: string | null | undefined,
  explicit?: number | null,
): number | null {
  if (explicit != null && explicit > 0) return explicit;
  return DEFAULT_LOOKBACK_HOURS[sourceType || "keyword"] ?? DEFAULT_LOOKBACK_HOURS.keyword;
}

const articleSelect = {
  id: articles.id,
  title: articles.title,
  slug: articles.slug,
  englishSlug: articles.englishSlug,
  publishedAt: articles.publishedAt,
  imageUrl: articles.imageUrl,
  thumbnailUrl: articles.thumbnailUrl,
  infographicBannerUrl: articles.infographicBannerUrl,
  excerpt: articles.excerpt,
  newsType: articles.newsType,
  views: articles.views,
  aiGenerated: articles.aiGenerated,
  isAiGeneratedThumbnail: articles.isAiGeneratedThumbnail,
  articleType: articles.articleType,
  imageFocalPoint: articles.imageFocalPoint,
  category: {
    nameAr: categories.nameAr,
    slug: categories.slug,
    englishSlug: categories.englishSlug,
    color: categories.color,
  },
};

function basePublishedConditions(lookbackHours?: number | null): SQL[] {
  const conditions: SQL[] = [
    eq(articles.status, "published"),
    or(isNull(articles.articleType), ne(articles.articleType, "opinion"))!,
  ];
  if (lookbackHours && lookbackHours > 0) {
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
    conditions.push(gte(articles.publishedAt, since));
  }
  return conditions;
}

async function fetchArticlesByIds(ids: string[]): Promise<SmartBlockArticle[]> {
  if (!ids.length) return [];
  const rows = await db
    .select(articleSelect)
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(and(eq(articles.status, "published"), inArray(articles.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((r) => ({ ...r!, pinned: true }));
}

async function searchArArticles(opts: {
  terms: string[];
  limit: number;
  categories?: string[];
  dateFrom?: string;
  dateTo?: string;
  lookbackHours?: number | null;
  excludeIds?: string[];
  orderByViews?: boolean;
}): Promise<SmartBlockArticle[]> {
  const conditions = basePublishedConditions(opts.lookbackHours);

  if (opts.terms.length > 0) {
    conditions.push(or(...opts.terms.map((t) => keywordMatchSql(t)))!);
  }

  if (opts.categories?.length) {
    conditions.push(inArray(articles.categoryId, opts.categories));
  }
  if (opts.dateFrom) {
    conditions.push(gte(articles.publishedAt, new Date(opts.dateFrom)));
  }
  if (opts.dateTo) {
    conditions.push(lte(articles.publishedAt, new Date(opts.dateTo)));
  }
  if (opts.excludeIds?.length) {
    conditions.push(notInArray(articles.id, opts.excludeIds));
  }

  const order = opts.orderByViews
    ? [desc(articles.views), desc(articles.publishedAt)]
    : [desc(articles.displayOrder), desc(articles.publishedAt)];

  const rows = await db
    .select(articleSelect)
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(opts.limit);

  return rows.map((r) => ({ ...r, pinned: false }));
}

async function searchEnArticles(opts: {
  terms: string[];
  limit: number;
  categories?: string[];
  lookbackHours?: number | null;
  excludeIds?: string[];
  orderByViews?: boolean;
}): Promise<SmartBlockArticle[]> {
  const conditions: SQL[] = [eq(enArticles.status, "published")];
  if (opts.lookbackHours && opts.lookbackHours > 0) {
    conditions.push(
      gte(enArticles.publishedAt, new Date(Date.now() - opts.lookbackHours * 3600_000)),
    );
  }
  if (opts.terms.length) {
    // عنوان فقط — تجنّب ILIKE على excerpt (full scan مكلف)
    conditions.push(
      or(
        ...opts.terms.map((term) => ilike(enArticles.title, `%${term}%`)),
      )!,
    );
  }
  if (opts.categories?.length) {
    conditions.push(inArray(enArticles.categoryId, opts.categories));
  }
  if (opts.excludeIds?.length) {
    conditions.push(notInArray(enArticles.id, opts.excludeIds));
  }

  const order = opts.orderByViews
    ? [desc(enArticles.views), desc(enArticles.publishedAt)]
    : [desc(enArticles.publishedAt)];

  const rows = await db
    .select({
      id: enArticles.id,
      title: enArticles.title,
      slug: enArticles.slug,
      englishSlug: enArticles.englishSlug,
      publishedAt: enArticles.publishedAt,
      imageUrl: enArticles.imageUrl,
      excerpt: enArticles.excerpt,
      views: enArticles.views,
    })
    .from(enArticles)
    .where(and(...conditions))
    .orderBy(...order)
    .limit(opts.limit);

  return rows.map((r) => ({ ...r, thumbnailUrl: null, pinned: false, category: null }));
}

async function searchUrArticles(opts: {
  terms: string[];
  limit: number;
  categories?: string[];
  lookbackHours?: number | null;
  excludeIds?: string[];
  orderByViews?: boolean;
}): Promise<SmartBlockArticle[]> {
  const conditions: SQL[] = [eq(urArticles.status, "published")];
  if (opts.lookbackHours && opts.lookbackHours > 0) {
    conditions.push(
      gte(urArticles.publishedAt, new Date(Date.now() - opts.lookbackHours * 3600_000)),
    );
  }
  if (opts.terms.length) {
    conditions.push(
      or(
        ...opts.terms.map((term) => ilike(urArticles.title, `%${term}%`)),
      )!,
    );
  }
  if (opts.categories?.length) {
    conditions.push(inArray(urArticles.categoryId, opts.categories));
  }
  if (opts.excludeIds?.length) {
    conditions.push(notInArray(urArticles.id, opts.excludeIds));
  }

  const order = opts.orderByViews
    ? [desc(urArticles.views), desc(urArticles.publishedAt)]
    : [desc(urArticles.publishedAt)];

  const rows = await db
    .select({
      id: urArticles.id,
      title: urArticles.title,
      slug: urArticles.slug,
      englishSlug: urArticles.englishSlug,
      publishedAt: urArticles.publishedAt,
      imageUrl: urArticles.imageUrl,
      excerpt: urArticles.excerpt,
      views: urArticles.views,
    })
    .from(urArticles)
    .where(and(...conditions))
    .orderBy(...order)
    .limit(opts.limit);

  return rows.map((r) => ({ ...r, thumbnailUrl: null, pinned: false, category: null }));
}

export async function listSmartBlocks(
  locale: SmartBlockLocale,
  filters: ListFilters = {},
): Promise<SmartBlock[] | EnSmartBlock[] | UrSmartBlock[]> {
  const table = tableFor(locale);
  const conditions: SQL[] = [];

  if (filters.isActive !== undefined) {
    conditions.push(eq(table.isActive, filters.isActive));
  }
  if (filters.placement) {
    conditions.push(eq(table.placement, filters.placement));
  }
  if (filters.playbook) {
    conditions.push(eq(table.playbook, filters.playbook));
  }

  const rows = await db
    .select()
    .from(table)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(table.sortOrder), desc(table.createdAt))
    .limit(200);

  if (!filters.respectSchedule) return rows as any;

  return rows.filter((b: any) =>
    isWithinSchedule(b.scheduleStartAt, b.scheduleEndAt),
  ) as any;
}

export async function getSmartBlockById(
  locale: SmartBlockLocale,
  id: string,
): Promise<SmartBlock | EnSmartBlock | UrSmartBlock | null> {
  const table = tableFor(locale);
  const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
  return (row as any) || null;
}

export async function createSmartBlockRecord(
  locale: SmartBlockLocale,
  data: InsertSmartBlock | InsertEnSmartBlock | InsertUrSmartBlock,
): Promise<SmartBlock | EnSmartBlock | UrSmartBlock> {
  const table = tableFor(locale);
  const placement = (data as any).placement || "below_featured";
  const existing = await listSmartBlocks(locale, { placement });
  const maxSort = existing.reduce(
    (m, b: any) => Math.max(m, b.sortOrder ?? 0),
    -1,
  );
  const payload = {
    ...data,
    sortOrder: (data as any).sortOrder ?? maxSort + 1,
    keyword: (data as any).keyword ?? "",
    keywords: (data as any).keywords ?? [],
    pinnedArticleIds: (data as any).pinnedArticleIds ?? [],
    sourceType: (data as any).sourceType ?? "keyword",
    minArticles: (data as any).minArticles ?? 1,
  };
  const [row] = await db.insert(table).values(payload as any).returning();
  invalidateSmartBlocksCache();
  return row as any;
}

export async function updateSmartBlockRecord(
  locale: SmartBlockLocale,
  id: string,
  updates: UpdateSmartBlock | Partial<InsertEnSmartBlock> | Partial<InsertUrSmartBlock>,
): Promise<SmartBlock | EnSmartBlock | UrSmartBlock | null> {
  const table = tableFor(locale);
  const [row] = await db
    .update(table)
    .set({ ...updates, updatedAt: new Date() } as any)
    .where(eq(table.id, id))
    .returning();
  if (row) invalidateSmartBlocksCache();
  return (row as any) || null;
}

export async function deleteSmartBlockRecord(
  locale: SmartBlockLocale,
  id: string,
): Promise<boolean> {
  const table = tableFor(locale);
  const deleted = await db.delete(table).where(eq(table.id, id)).returning({ id: table.id });
  if (deleted.length > 0) invalidateSmartBlocksCache();
  return deleted.length > 0;
}

export async function reorderSmartBlocks(
  locale: SmartBlockLocale,
  placement: string,
  orderedIds: string[],
): Promise<void> {
  const table = tableFor(locale);
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(table)
        .set({ sortOrder: i, updatedAt: new Date() } as any)
        .where(and(eq(table.id, orderedIds[i]), eq(table.placement, placement)));
    }
  });
  invalidateSmartBlocksCache();
}

export async function activatePlaybook(
  locale: SmartBlockLocale,
  playbook: string,
): Promise<{ activated: number; deactivated: number }> {
  const table = tableFor(locale);
  const all = await db.select().from(table);
  let activated = 0;
  let deactivated = 0;
  for (const block of all) {
    const b = block as any;
    if (!b.playbook) continue;
    const shouldActive = b.playbook === playbook;
    if (b.isActive !== shouldActive) {
      await db
        .update(table)
        .set({ isActive: shouldActive, updatedAt: new Date() } as any)
        .where(eq(table.id, b.id));
      if (shouldActive) activated++;
      else deactivated++;
    }
  }
  if (activated + deactivated > 0) invalidateSmartBlocksCache();
  return { activated, deactivated };
}

export async function listPlaybooks(locale: SmartBlockLocale): Promise<
  Array<{ key: string; blockCount: number; activeCount: number }>
> {
  const rows = await listSmartBlocks(locale);
  const map = new Map<string, { blockCount: number; activeCount: number }>();
  for (const b of rows as any[]) {
    if (!b.playbook) continue;
    const cur = map.get(b.playbook) || { blockCount: 0, activeCount: 0 };
    cur.blockCount++;
    if (b.isActive) cur.activeCount++;
    map.set(b.playbook, cur);
  }
  return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
}

type ResolveInput = {
  sourceType?: string | null;
  keyword?: string | null;
  keywords?: string[] | null;
  limitCount?: number | null;
  filters?: { categories?: string[]; dateRange?: { from: string; to: string } } | null;
  pinnedArticleIds?: string[] | null;
  lookbackHours?: number | null;
  minArticles?: number | null;
  scheduleStartAt?: Date | null;
  scheduleEndAt?: Date | null;
  isActive?: boolean | null;
};

export async function resolveBlockArticles(
  locale: SmartBlockLocale,
  block: ResolveInput,
  options: ResolveOptions = {},
): Promise<{ items: SmartBlockArticle[]; total: number; hiddenReason?: string }> {
  if (!options.preview) {
    if (block.isActive === false) {
      return { items: [], total: 0, hiddenReason: "inactive" };
    }
    if (!isWithinSchedule(block.scheduleStartAt, block.scheduleEndAt)) {
      return { items: [], total: 0, hiddenReason: "schedule" };
    }
  }

  const limit = Math.min(Math.max(options.limit ?? block.limitCount ?? 6, 1), 24);
  const sourceType = (block.sourceType || "keyword") as SmartBlockSourceType;
  const pinnedIds = Array.isArray(block.pinnedArticleIds) ? block.pinnedArticleIds : [];
  const categoriesFilter = block.filters?.categories;
  const dateFrom = block.filters?.dateRange?.from;
  const dateTo = block.filters?.dateRange?.to;
  const terms = collectSearchTerms(block);
  const lookbackHours = effectiveLookbackHours(sourceType, block.lookbackHours);

  let pinned: SmartBlockArticle[] = [];
  if (locale === "ar" && pinnedIds.length) {
    pinned = await fetchArticlesByIds(pinnedIds.slice(0, limit));
  }

  const remaining = Math.max(limit - pinned.length, 0);
  let rest: SmartBlockArticle[] = [];

  if (remaining > 0) {
    const searchOpts = {
      terms:
        sourceType === "category_feed" || sourceType === "trending" || sourceType === "curated"
          ? sourceType === "curated"
            ? []
            : terms
          : terms.length
            ? terms
            : [],
      limit: remaining,
      categories: categoriesFilter,
      dateFrom,
      dateTo,
      lookbackHours,
      excludeIds: pinned.map((p) => p.id),
      orderByViews: sourceType === "trending",
    };

    if (sourceType === "curated") {
      // curated: pins only (already collected); optional fill from category if set
      if (categoriesFilter?.length) {
        rest =
          locale === "ar"
            ? await searchArArticles({ ...searchOpts, terms: [] })
            : locale === "en"
              ? await searchEnArticles({ ...searchOpts, terms: [] })
              : await searchUrArticles({ ...searchOpts, terms: [] });
      }
    } else if (sourceType === "category_feed") {
      rest =
        locale === "ar"
          ? await searchArArticles({ ...searchOpts, terms: [] })
          : locale === "en"
            ? await searchEnArticles({ ...searchOpts, terms: [] })
            : await searchUrArticles({ ...searchOpts, terms: [] });
    } else if (sourceType === "trending") {
      rest =
        locale === "ar"
          ? await searchArArticles({ ...searchOpts, terms: searchOpts.terms })
          : locale === "en"
            ? await searchEnArticles({ ...searchOpts, terms: searchOpts.terms })
            : await searchUrArticles({ ...searchOpts, terms: searchOpts.terms });
    } else {
      // keyword | topic_cluster | event_window
      if (terms.length === 0 && !categoriesFilter?.length) {
        rest = [];
      } else {
        rest =
          locale === "ar"
            ? await searchArArticles(searchOpts)
            : locale === "en"
              ? await searchEnArticles(searchOpts)
              : await searchUrArticles(searchOpts);
      }
    }
  }

  const items = [...pinned, ...rest].slice(0, limit);
  const minArticles = block.minArticles ?? 1;
  if (!options.preview && items.length < minArticles) {
    return { items: [], total: 0, hiddenReason: "min_articles" };
  }

  return { items, total: items.length };
}

export async function queryArticlesPreview(
  locale: SmartBlockLocale,
  params: ResolveInput & { limit?: number },
): Promise<{ items: SmartBlockArticle[]; total: number }> {
  return resolveBlockArticles(locale, params, {
    limit: params.limit,
    preview: true,
  });
}

/** حل مقالات بلوك محفوظ مع SWR — مفتاح تحت blocks: ليُبطَل عند النشر */
export async function resolveSavedBlockArticlesCached(
  locale: SmartBlockLocale,
  blockId: string,
  options: ResolveOptions = {},
): Promise<{ items: SmartBlockArticle[]; total: number; hiddenReason?: string }> {
  if (options.preview) {
    const block = await getSmartBlockById(locale, blockId);
    if (!block) return { items: [], total: 0, hiddenReason: "missing" };
    return resolveBlockArticles(locale, block as any, { ...options, preview: true });
  }

  return withSWR(
    `blocks:smart:articles:${locale}:${blockId}`,
    CACHE_TTL.SMART_BLOCKS,
    CACHE_TTL.SMART_BLOCKS * 3,
    async () => {
      const block = await getSmartBlockById(locale, blockId);
      if (!block) return { items: [], total: 0, hiddenReason: "missing" };
      return resolveBlockArticles(locale, block as any, options);
    },
  );
}

export type HomepageBlockPayload = {
  id: string;
  title: string;
  subtitle?: string | null;
  color: string;
  backgroundColor?: string | null;
  placement: string;
  layoutStyle: string;
  limitCount: number;
  sourceType?: string | null;
  isActive: boolean;
  articles: SmartBlockArticle[];
};

export type HomepageSmartBlocksBundle = {
  byPlacement: Record<string, HomepageBlockPayload[]>;
  blockCount: number;
  generatedAt: string;
};

/**
 * حزمة الصفحة الرئيسية: طلب واحد + كاش SWR.
 * يحدّ عدد البلوكات ويحل المقالات بالتتابع لتجنّب عاصفة استعلامات.
 */
export async function getHomepageSmartBlocksBundle(
  locale: SmartBlockLocale,
): Promise<HomepageSmartBlocksBundle> {
  return withSWR(
    `blocks:smart:homepage:${locale}`,
    CACHE_TTL.SMART_BLOCKS,
    CACHE_TTL.SMART_BLOCKS * 3,
    async () => {
      const active = (await listSmartBlocks(locale, {
        isActive: true,
        respectSchedule: true,
      })) as any[];

      const byPlacement: Record<string, HomepageBlockPayload[]> = {};
      for (const p of SMART_BLOCK_PLACEMENTS) byPlacement[p] = [];

      // سقف لكل موضع ثم إجمالي
      const selected: any[] = [];
      for (const p of SMART_BLOCK_PLACEMENTS) {
        const shelf = active
          .filter((b) => b.placement === p)
          .slice(0, HOMEPAGE_MAX_PER_PLACEMENT);
        selected.push(...shelf);
      }
      const capped = selected.slice(0, HOMEPAGE_MAX_ACTIVE_BLOCKS);

      let blockCount = 0;
      for (const block of capped) {
        const resolved = await resolveBlockArticles(locale, block);
        if (!resolved.items.length) continue;
        const payload: HomepageBlockPayload = {
          id: block.id,
          title: block.title,
          subtitle: block.subtitle ?? null,
          color: block.color,
          backgroundColor: block.backgroundColor ?? null,
          placement: block.placement,
          layoutStyle: block.layoutStyle || "grid",
          limitCount: block.limitCount,
          sourceType: block.sourceType,
          isActive: block.isActive,
          articles: resolved.items,
        };
        if (!byPlacement[block.placement]) byPlacement[block.placement] = [];
        byPlacement[block.placement].push(payload);
        blockCount++;
      }

      return {
        byPlacement,
        blockCount,
        generatedAt: new Date().toISOString(),
      };
    },
  );
}

export type DirectorSuggestion = {
  title: string;
  keyword: string;
  keywords: string[];
  sourceType: SmartBlockSourceType;
  placement: (typeof SMART_BLOCK_PLACEMENTS)[number];
  layoutStyle: "grid" | "list" | "featured" | "carousel";
  limitCount: number;
  color: string;
  rationale: string;
  lookbackHours?: number;
};

const DIRECTOR_COLORS = ["#0B6E4F", "#1D4ED8", "#B45309", "#9F1239", "#0E7490"];

export async function suggestDirectorScenes(
  locale: SmartBlockLocale = "ar",
): Promise<DirectorSuggestion[]> {
  // اقتراحات مبنية على أكثر الأقسام نشاطاً + كلمات من عناوين آخر 24 ساعة
  const since = new Date(Date.now() - 24 * 3600_000);
  const recent = await db
    .select({
      title: articles.title,
      categoryId: articles.categoryId,
      categoryName: categories.nameAr,
      views: articles.views,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(
      and(
        eq(articles.status, "published"),
        gte(articles.publishedAt, since),
        or(isNull(articles.articleType), ne(articles.articleType, "opinion"))!,
      ),
    )
    .orderBy(desc(articles.views))
    .limit(40);

  const catCounts = new Map<string, { name: string; count: number; views: number }>();
  for (const row of recent) {
    if (!row.categoryId || !row.categoryName) continue;
    const cur = catCounts.get(row.categoryId) || {
      name: row.categoryName,
      count: 0,
      views: 0,
    };
    cur.count++;
    cur.views += row.views || 0;
    catCounts.set(row.categoryId, cur);
  }

  const topCats = Array.from(catCounts.entries())
    .sort((a, b) => b[1].views - a[1].views || b[1].count - a[1].count)
    .slice(0, 3);

  const suggestions: DirectorSuggestion[] = [];

  topCats.forEach(([catId, info], idx) => {
    suggestions.push({
      title: `مشهد ${info.name}`,
      keyword: info.name,
      keywords: [info.name],
      sourceType: "category_feed",
      placement: SMART_BLOCK_PLACEMENTS[idx % SMART_BLOCK_PLACEMENTS.length],
      layoutStyle: idx === 0 ? "featured" : idx === 1 ? "grid" : "list",
      limitCount: idx === 0 ? 5 : 6,
      color: DIRECTOR_COLORS[idx % DIRECTOR_COLORS.length],
      rationale: `${info.count} مقالاً نُشرت خلال 24 ساعة في «${info.name}» بإجمالي ${info.views} مشاهدة.`,
      lookbackHours: 48,
    });
    // attach category via keyword only — UI will map filters.categories when applying
    (suggestions[suggestions.length - 1] as any)._categoryId = catId;
  });

  // مشهد ترند عام
  suggestions.push({
    title: "الأكثر قراءة الآن",
    keyword: "",
    keywords: [],
    sourceType: "trending",
    placement: "above_all_news",
    layoutStyle: "carousel",
    limitCount: 8,
    color: DIRECTOR_COLORS[3],
    rationale: "شريط حي لأكثر المقالات مشاهدة خلال آخر 48 ساعة.",
    lookbackHours: 48,
  });

  // مشهد كلمات من عناوين ساخنة
  const hotWord = recent[0]?.title?.split(/\s+/).find((w) => w.length >= 3);
  if (hotWord) {
    suggestions.push({
      title: `تغطية: ${hotWord}`,
      keyword: hotWord,
      keywords: [hotWord],
      sourceType: "topic_cluster",
      placement: "between_all_and_murqap",
      layoutStyle: "list",
      limitCount: 6,
      color: DIRECTOR_COLORS[4],
      rationale: `الكلمة «${hotWord}» تظهر في أبرز العناوين المقروءة حالياً.`,
      lookbackHours: 72,
    });
  }

  void locale; // محجوز لتوسيع EN/UR لاحقاً بنفس المنطق
  return suggestions.slice(0, 5);
}

export async function getStageSummary(locale: SmartBlockLocale) {
  const blocks = (await listSmartBlocks(locale)) as any[];
  const now = new Date();
  const active = blocks.filter(
    (b) => b.isActive && isWithinSchedule(b.scheduleStartAt, b.scheduleEndAt, now),
  );
  const scheduled = blocks.filter(
    (b) =>
      b.isActive &&
      b.scheduleStartAt &&
      new Date(b.scheduleStartAt) > now,
  );
  const byPlacement: Record<string, number> = {};
  for (const p of SMART_BLOCK_PLACEMENTS) {
    byPlacement[p] = active.filter((b) => b.placement === p).length;
  }
  return {
    total: blocks.length,
    active: active.length,
    inactive: blocks.filter((b) => !b.isActive).length,
    scheduled: scheduled.length,
    byPlacement,
    playbooks: await listPlaybooks(locale),
  };
}
