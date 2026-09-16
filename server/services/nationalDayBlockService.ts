// ----------------------------------------------------------------------------
// بلوك «اليوم الوطني الـ96» — طبقة الوصول للبيانات (ADR-001)
//
// نسخة ميلادية من نمط بلوك الحج: إعدادات singleton، جمع تلقائي للأخبار
// بالكلمات المفتاحية (عنوان + مقتطف) خلال نافذة زمنية، وتثبيت يدوي يتصدر
// دائمًا. المسارات في server/routes/nationalDayBlock.ts.
// ----------------------------------------------------------------------------

import { db } from "../db";
import { nationalDayBlockConfig, articles, categories, type NationalDayBlockConfig } from "@shared/schema";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";
import { sql, and, or, eq, gte, inArray, ilike, desc } from "drizzle-orm";

// تاريخ اليوم الوطني الـ96 — للعدّاد التنازلي في البلوك
const NATIONAL_DAY = { year: 2026, month: 9, day: 23 };

export type NationalDayBlockArticle = {
  id: string;
  title: string;
  slug: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  categoryName: string | null;
  isPinned: boolean;
};

export type NationalDayBlockPublic =
  | {
      isVisible: true;
      title: string;
      subtitle: string | null;
      daysRemaining: number | null;
      articles: NationalDayBlockArticle[];
      lastUpdatedAt: string;
    }
  | { isVisible: false; reason?: string };

/** عدد الأيام حتى 23 سبتمبر 2026 بتوقيت الرياض (سالب = انقضى) */
export function daysUntilNationalDay(now: Date = new Date()): number | null {
  try {
    const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(now)
      .split("-")
      .map(Number);
    if (!y || !m || !d) return null;
    return Math.round(
      (Date.UTC(NATIONAL_DAY.year, NATIONAL_DAY.month - 1, NATIONAL_DAY.day) -
        Date.UTC(y, m - 1, d)) /
        86_400_000,
    );
  } catch {
    return null;
  }
}

export async function loadNationalDayBlockConfig(): Promise<NationalDayBlockConfig | null> {
  const [row] = await db.select().from(nationalDayBlockConfig).limit(1);
  return row ?? null;
}

/** admin/system_admin عبر عمود الدور النصي أو جدول user_roles */
export async function isNationalDayBlockAdmin(user: {
  id: string;
  role?: string | null;
}): Promise<boolean> {
  if (user.role && (SUPERUSER_ROLE_NAMES as readonly string[]).includes(user.role)) {
    return true;
  }
  const result = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${user.id}
      AND r.name IN ('admin','system_admin','superadmin','system.admin')
  `);
  return Number((result.rows as Array<{ n: number }>)[0]?.n ?? 0) > 0;
}

const ARTICLE_COLUMNS = {
  id: articles.id,
  title: articles.title,
  slug: articles.slug,
  imageUrl: articles.imageUrl,
  publishedAt: articles.publishedAt,
  categoryName: categories.nameAr,
};

/** الحمولة العامة للرئيسية: مثبّت أولًا ثم المكتشف بالكلمات، أو إخفاء كامل */
export async function getNationalDayBlockPublic(
  now: Date = new Date(),
): Promise<NationalDayBlockPublic> {
  const config = await loadNationalDayBlockConfig();
  if (!config || !config.isActive) {
    return { isVisible: false };
  }
  if (config.seasonStartDate && now < config.seasonStartDate) {
    return { isVisible: false, reason: "before_season" };
  }
  if (config.seasonEndDate && now > config.seasonEndDate) {
    return { isVisible: false, reason: "after_season" };
  }

  const cutoff = new Date(now.getTime() - (config.lookbackHours ?? 72) * 60 * 60 * 1000);
  const keywords = (config.keywords ?? []).filter((k) => k && k.trim().length > 0);
  const pinned = (config.pinnedArticleIds ?? []).filter((id) => !!id);
  const limit = config.articleLimit ?? 3;

  const keywordConds = keywords.map((kw) =>
    or(ilike(articles.title, `%${kw}%`), ilike(articles.excerpt, `%${kw}%`)),
  );
  const whereConds = [
    eq(articles.status, "published"),
    gte(articles.publishedAt, cutoff),
    or(...keywordConds),
  ];
  if (pinned.length > 0) {
    whereConds.push(
      sql`${articles.id} NOT IN (${sql.join(pinned.map((id) => sql`${id}`), sql`, `)})`,
    );
  }

  const keywordMatched =
    keywords.length > 0
      ? await db
          .select(ARTICLE_COLUMNS)
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .where(and(...whereConds))
          .orderBy(desc(articles.publishedAt))
          .limit(limit)
      : [];

  const pinnedRows =
    pinned.length > 0
      ? await db
          .select(ARTICLE_COLUMNS)
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .where(and(eq(articles.status, "published"), inArray(articles.id, pinned)))
      : [];

  // المثبّت بترتيب المحرر ثم المكتشف الأحدث، بسقف العدد المضبوط
  const pinnedSorted = pinned
    .map((id) => pinnedRows.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r);
  const combined = [...pinnedSorted, ...keywordMatched].slice(0, limit);

  // بلا أخبار → إخفاء كامل بدل رأس فارغ (نفس قرار بلوك الحج)
  if (combined.length === 0) {
    return { isVisible: false, reason: "no_matching_articles" };
  }

  return {
    isVisible: true,
    title: config.title,
    subtitle: config.subtitle,
    daysRemaining: daysUntilNationalDay(now),
    articles: combined.map((a) => ({ ...a, isPinned: pinned.includes(a.id) })),
    lastUpdatedAt: now.toISOString(),
  };
}

/** upsert لصف الإعدادات الوحيد — الحقول تُنقّى في الراوت */
export async function upsertNationalDayBlockConfig(
  updates: Partial<NationalDayBlockConfig>,
): Promise<NationalDayBlockConfig | null> {
  const existing = await loadNationalDayBlockConfig();
  if (existing) {
    await db
      .update(nationalDayBlockConfig)
      .set(updates)
      .where(eq(nationalDayBlockConfig.id, "default"));
  } else {
    await db.insert(nationalDayBlockConfig).values({ id: "default", ...updates });
  }
  return loadNationalDayBlockConfig();
}
