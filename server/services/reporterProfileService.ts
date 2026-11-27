/**
 * ملف المراسل/الكاتب العام (/api/reporters/:slug و /en/...).
 * استُخرج من server/storage.ts في 2026-11-02 (ADR-001) مع إصلاحين من مراجعة Neon:
 *  - COUNT(*) بدل COUNT(DISTINCT id): حساب «صحيفة سبق» (690 ألف مقال) كان يفرز
 *    كل المعرّفات على القرص في كل طلب؛ id مفتاح أساسي ولا join يكرر الصفوف.
 *  - كاش 15 دقيقة للحسابات الضخمة بدل 5، لأن الاستعلام الإجمالي مسح كامل للجدول.
 */
import { db } from "../db";
import { memoryCache, CACHE_TTL } from "../memoryCache";
import { eq, desc, sql, and, or, inArray, gte } from "drizzle-orm";
import {
  articles,
  categories,
  comments,
  reactions,
  socialFollows,
  type Staff,
  type ReporterProfile,
  type ReporterArticle,
  type ReporterTimeseries,
} from "@shared/schema";

export interface ReporterProfileDeps {
  getReporterBySlug: (slug: string) => Promise<Staff | undefined>;
}

/** single-flight لملف المراسل — يمنع عاصفة استعلامات عند فتح نفس الصفحة متزامناً. */
const reporterProfileInflight = new Map<string, Promise<ReporterProfile | undefined>>();

export async function getReporterProfile(
  slug: string,
  windowDays: number,
  language: 'ar' | 'en',
  deps: ReporterProfileDeps,
): Promise<ReporterProfile | undefined> {
  // كاش أطول + single-flight: صفحة «صحيفة سبق» كانت تسحب كل مقالات 90 يوماً (~2ث).
  const cacheKey = `reporter:profile:v3:${language}:${slug}:${windowDays}`;
  const cached = memoryCache.get<ReporterProfile>(cacheKey);
  if (cached !== null) return cached;

  const existing = reporterProfileInflight.get(cacheKey);
  if (existing) return existing;

  const compute = computeReporterProfile(slug, windowDays, language, cacheKey, deps);
  reporterProfileInflight.set(cacheKey, compute);
  try {
    return await compute;
  } finally {
    reporterProfileInflight.delete(cacheKey);
  }
}

async function computeReporterProfile(
  slug: string,
  windowDays: number,
  language: 'ar' | 'en',
  cacheKey: string,
  deps: ReporterProfileDeps,
): Promise<ReporterProfile | undefined> {
  const reporter = await deps.getReporterBySlug(slug);
  if (!reporter?.userId) return undefined;

  const windowDate = new Date();
  windowDate.setDate(windowDate.getDate() - windowDays);
  const owner = or(eq(articles.reporterId, reporter.userId), eq(articles.authorId, reporter.userId));
  const published = eq(articles.status, 'published');

  // لا نجلب كل مقالات النافذة: آخر 5 للعرض + تجميع يومي في SQL للسلسلة الزمنية.
  // نُسقط AVG(reading_history) من المسار الحار — مسح ثقيل بلا فهرس مناسب؛ نستخدم افتراضياً.
  const [
    lastArticleRows,
    allTimeStatsResult,
    likesResult,
    categoryStatsResult,
    followersResult,
    dailyRows,
  ] = await Promise.all([
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        excerpt: articles.excerpt,
        imageUrl: articles.imageUrl,
        thumbnailUrl: articles.thumbnailUrl,
        imageFocalPoint: articles.imageFocalPoint,
        isAiGeneratedImage: articles.isAiGeneratedImage,
        updatedAt: articles.updatedAt,
        publishedAt: articles.publishedAt,
        newsType: articles.newsType,
        views: articles.views,
        categoryId: categories.id,
        categoryNameAr: categories.nameAr,
        categoryNameEn: categories.nameEn,
        categorySlug: categories.slug,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(and(owner, published))
      .orderBy(desc(articles.displayOrder), desc(articles.publishedAt))
      .limit(5),
    db
      .select({
        // id هو المفتاح الأساسي ولا join هنا: COUNT(*) يغني عن COUNT(DISTINCT) الذي كان
        // يفرز 690 ألف معرّف على القرص لحساب «صحيفة سبق» (36 MB temp لكل طلب).
        count: sql<number>`CAST(COUNT(*) AS INTEGER)`,
        totalViews: sql<number>`COALESCE(SUM(${articles.views}), 0)`,
      })
      .from(articles)
      .where(and(owner, published)),
    db
      .select({
        totalLikes: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(reactions)
      .innerJoin(articles, eq(reactions.articleId, articles.id))
      .where(and(owner, eq(reactions.type, 'like'))),
    db
      .select({
        categoryId: categories.id,
        categoryNameAr: categories.nameAr,
        categoryNameEn: categories.nameEn,
        categorySlug: categories.slug,
        categoryColor: categories.color,
        // تصنيف واحد لكل مقال، فلا تكرار: COUNT(*) بدل COUNT(DISTINCT).
        articlesCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
        totalViews: sql<number>`COALESCE(SUM(${articles.views}), 0)`,
      })
      .from(articles)
      .innerJoin(categories, eq(articles.categoryId, categories.id))
      .where(and(owner, published))
      .groupBy(categories.id, categories.nameAr, categories.nameEn, categories.slug, categories.color)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(5),
    db
      .select({
        followersCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(socialFollows)
      .where(eq(socialFollows.followingId, reporter.userId)),
    db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${articles.publishedAt}), 'YYYY-MM-DD')`,
        views: sql<number>`COALESCE(SUM(${articles.views}), 0)`,
      })
      .from(articles)
      .where(and(owner, published, gte(articles.publishedAt, windowDate)))
      .groupBy(sql`date_trunc('day', ${articles.publishedAt})`)
      .orderBy(sql`date_trunc('day', ${articles.publishedAt})`),
  ]);

  const totalArticles = allTimeStatsResult[0]?.count || 0;
  const totalViews = Number(allTimeStatsResult[0]?.totalViews) || 0;
  const totalLikes = likesResult[0]?.totalLikes || 0;
  const avgCompletionRate = 75;
  const avgReadTimeMin = 4;
  const followersCount = followersResult[0]?.followersCount || 0;

  const lastIds = lastArticleRows.map((a) => a.id);
  const commentsResult = lastIds.length
    ? await db
        .select({
          articleId: comments.articleId,
          count: sql<number>`CAST(COUNT(*) AS INTEGER)`,
        })
        .from(comments)
        .where(inArray(comments.articleId, lastIds))
        .groupBy(comments.articleId)
    : [];
  const commentsMap = new Map(commentsResult.map((r) => [r.articleId, r.count || 0]));

  const lastArticles: ReporterArticle[] = lastArticleRows.map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    englishSlug: a.englishSlug,
    excerpt: a.excerpt,
    imageUrl: a.imageUrl,
    thumbnailUrl: a.thumbnailUrl,
    imageFocalPoint: a.imageFocalPoint,
    isAiGeneratedImage: a.isAiGeneratedImage,
    updatedAt: a.updatedAt,
    publishedAt: a.publishedAt,
    category: a.categoryId
      ? {
          name:
            language === 'en'
              ? a.categoryNameEn || a.categoryNameAr || ''
              : a.categoryNameAr || '',
          slug: a.categorySlug || '',
          color: a.categoryColor,
          icon: a.categoryIcon,
        }
      : null,
    isBreaking: a.newsType === 'breaking',
    views: a.views || 0,
    likes: 0,
    comments: commentsMap.get(a.id) || 0,
    readingTime: avgReadTimeMin,
  }));

  const topCategories = categoryStatsResult.map((cat) => ({
    name: language === 'en' ? cat.categoryNameEn || cat.categoryNameAr || '' : cat.categoryNameAr || '',
    slug: cat.categorySlug || '',
    color: cat.categoryColor,
    articles: cat.articlesCount || 0,
    views: Number(cat.totalViews) || 0,
    sharePct: totalArticles > 0 ? Math.round(((cat.articlesCount || 0) / totalArticles) * 100) : 0,
  }));

  const timeseries: ReporterTimeseries[] = dailyRows
    .filter((r) => !!r.date)
    .map((r) => ({
      date: r.date,
      views: Number(r.views) || 0,
      likes: 0,
    }));

  const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);
  const badges: Array<{ key: string; label: string }> = [];
  if (reporter.isVerified) {
    badges.push({ key: 'verified', label: language === 'en' ? 'Verified' : 'موثق' });
  }
  if (totalArticles >= 20) {
    badges.push({
      key: 'active_contributor',
      label: language === 'en' ? 'Active Contributor' : 'كاتب نشط',
    });
  }
  const specs = reporter.specializations ?? [];
  if (specs.length > 0) {
    if (language === 'en') {
      const firstEnglishSpec = specs.find((spec) => !hasArabic(spec));
      if (firstEnglishSpec) {
        badges.push({ key: 'specialist', label: `Specialized in ${firstEnglishSpec}` });
      }
    } else {
      badges.push({ key: 'specialist', label: `متخصص في ${specs[0]}` });
    }
  }

  const profile: ReporterProfile = {
    id: reporter.id,
    userId: reporter.userId,
    slug: reporter.slug,
    fullName: language === 'en' ? reporter.name || reporter.nameAr : reporter.nameAr || reporter.name,
    title: language === 'en' ? reporter.title || reporter.titleAr : reporter.titleAr || reporter.title,
    avatarUrl: reporter.profileImage,
    bio: language === 'en' ? reporter.bio || reporter.bioAr : reporter.bioAr || reporter.bio,
    isVerified: reporter.isVerified,
    tags: specs,
    kpis: {
      totalArticles,
      totalViews,
      totalLikes,
      avgReadTimeMin,
      avgCompletionRate,
      followers: followersCount,
    },
    lastArticles,
    topCategories,
    timeseries: { windowDays, daily: timeseries },
    badges,
  };

  // الحسابات الضخمة (صحيفة سبق: ~690 ألف مقال) تكلّف مسحاً كاملاً للجدول في كل
  // حساب؛ أرقامها الإجمالية لا تتغير بما يُرى خلال ربع ساعة.
  const profileTtl = totalArticles >= 20_000 ? CACHE_TTL.LONG : CACHE_TTL.MEDIUM;
  memoryCache.set(cacheKey, profile, profileTtl);
  return profile;
}
