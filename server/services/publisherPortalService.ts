import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  articles,
  publisherCredits,
  publishers,
  users,
  type Publisher,
} from "@shared/schema";

/**
 * بوابة الناشر (وكالات المحتوى الخارجية).
 *
 * الوصول لا يشترط دور "publisher" حصراً: بعض حسابات الوكالات (مثل مديري
 * المحتوى المرتبطين عبر users.linkedPublisherId) تنشر من المحرر الرئيسي —
 * لذلك يُحل الناشر إما بملكية سجل publishers أو بالربط.
 */
export async function resolvePublisherForUser(userId: string): Promise<Publisher | null> {
  const [owned] = await db
    .select()
    .from(publishers)
    .where(eq(publishers.userId, userId))
    .limit(1);
  if (owned) return owned;

  const [user] = await db
    .select({ linkedPublisherId: users.linkedPublisherId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.linkedPublisherId) return null;

  const [linked] = await db
    .select()
    .from(publishers)
    .where(eq(publishers.id, user.linkedPublisherId))
    .limit(1);
  return linked ?? null;
}

export type PublishingGate = {
  allowed: boolean;
  /** machine-readable سبب المنع */
  code: "OK" | "NO_PUBLISHER" | "INACTIVE" | "WINDOW_CLOSED";
  message?: string;
  publisher: Publisher | null;
};

/**
 * بوابة النشر الموحدة: نشط + داخل نافذة النشر (publishingEndsAt).
 * تُستدعى قبل إنشاء/نشر أي مادة لحساب مرتبط بناشر.
 */
export async function getPublishingGate(userId: string): Promise<PublishingGate> {
  const publisher = await resolvePublisherForUser(userId);
  if (!publisher) return { allowed: true, code: "NO_PUBLISHER", publisher: null };

  if (!publisher.isActive) {
    return {
      allowed: false,
      code: "INACTIVE",
      message: "حساب الناشر معطل. يرجى التواصل مع الإدارة.",
      publisher,
    };
  }

  if (publisher.publishingEndsAt && publisher.publishingEndsAt.getTime() < Date.now()) {
    const endDate = publisher.publishingEndsAt.toLocaleDateString("ar-SA-u-ca-gregory");
    return {
      allowed: false,
      code: "WINDOW_CLOSED",
      message: `انتهت فترة النشر المتاحة لحسابكم بتاريخ ${endDate}. للتجديد يرجى التواصل مع إدارة سبق.`,
      publisher,
    };
  }

  return { allowed: true, code: "OK", publisher };
}

/** مواد الناشر = ما كتبه المستخدم + ما نُسب لوكالته (يشمل الأرشيف المرحَّل). */
function publisherArticlesCondition(publisher: Publisher) {
  const conditions = [eq(articles.publisherId, publisher.id)];
  if (publisher.userId) conditions.push(eq(articles.authorId, publisher.userId));
  return or(...conditions);
}

const articleListSelection = {
  id: articles.id,
  title: articles.title,
  slug: articles.slug,
  englishSlug: articles.englishSlug,
  status: articles.status,
  imageUrl: articles.imageUrl,
  views: articles.views,
  createdAt: articles.createdAt,
  publishedAt: articles.publishedAt,
  publisherSubmittedAt: articles.publisherSubmittedAt,
  publisherApprovedAt: articles.publisherApprovedAt,
  publisherReviewNotes: articles.publisherReviewNotes,
};

export async function getPortalArticles(
  publisher: Publisher,
  opts: { status?: string; searchQuery?: string; page?: number; limit?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

  const conditions: any[] = [publisherArticlesCondition(publisher)];
  if (opts.status && opts.status !== "all") conditions.push(eq(articles.status, opts.status));
  if (opts.searchQuery?.trim()) {
    conditions.push(sql`${articles.title} ILIKE ${"%" + opts.searchQuery.trim() + "%"}`);
  }

  const where = and(...conditions);
  const [rows, [{ count }]] = await Promise.all([
    db
      .select(articleListSelection)
      .from(articles)
      .where(where)
      .orderBy(desc(articles.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)` }).from(articles).where(where),
  ]);

  return { articles: rows, total: Number(count) || 0, page, limit };
}

export async function getPortalOverview(userId: string) {
  const publisher = await resolvePublisherForUser(userId);
  if (!publisher) return null;

  const condition = publisherArticlesCondition(publisher);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [
    [stats],
    [activeCredit],
    recentArticles,
    monthlyPublishing,
    topArticles,
  ] = await Promise.all([
    db
      .select({
        totalArticles: sql<number>`count(*)`,
        publishedArticles: sql<number>`count(*) filter (where ${articles.status} = 'published')`,
        draftArticles: sql<number>`count(*) filter (where ${articles.status} = 'draft')`,
        publishedThisMonth: sql<number>`count(*) filter (where ${articles.status} = 'published' and ${articles.publishedAt} >= ${monthStart})`,
        totalViews: sql<number>`coalesce(sum(${articles.views}) filter (where ${articles.status} = 'published'), 0)`,
      })
      .from(articles)
      .where(condition),
    db
      .select()
      .from(publisherCredits)
      .where(
        and(
          eq(publisherCredits.publisherId, publisher.id),
          eq(publisherCredits.isActive, true),
          or(
            sql`${publisherCredits.expiryDate} IS NULL`,
            gte(publisherCredits.expiryDate, now),
          ),
        ),
      )
      .orderBy(desc(publisherCredits.createdAt))
      .limit(1),
    db
      .select(articleListSelection)
      .from(articles)
      .where(condition)
      .orderBy(desc(articles.createdAt))
      .limit(8),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${articles.publishedAt}), 'YYYY-MM')`,
        published: sql<number>`count(*)`,
        views: sql<number>`coalesce(sum(${articles.views}), 0)`,
      })
      .from(articles)
      .where(and(condition, eq(articles.status, "published"), gte(articles.publishedAt, sixMonthsAgo)))
      .groupBy(sql`date_trunc('month', ${articles.publishedAt})`)
      .orderBy(sql`date_trunc('month', ${articles.publishedAt})`),
    db
      .select(articleListSelection)
      .from(articles)
      .where(and(condition, eq(articles.status, "published")))
      .orderBy(desc(articles.views))
      .limit(5),
  ]);

  // شارات «يتطلب انتباهك» تُحسب في الخادم لتبقى الواجهة عرضاً فقط
  const attention: Array<{ type: string; severity: "warning" | "critical"; message: string }> = [];

  if (publisher.publishingEndsAt) {
    const daysLeft = Math.ceil((publisher.publishingEndsAt.getTime() - now.getTime()) / 86_400_000);
    if (daysLeft < 0) {
      attention.push({
        type: "window_closed",
        severity: "critical",
        message: "انتهت فترة النشر المتاحة لحسابكم. تواصلوا مع الإدارة للتجديد.",
      });
    } else if (daysLeft <= 14) {
      attention.push({
        type: "window_ending",
        severity: "warning",
        message: `تنتهي فترة النشر المتاحة لحسابكم خلال ${daysLeft} ${daysLeft <= 10 ? "أيام" : "يوماً"}.`,
      });
    }
  }

  if (activeCredit) {
    const ratio = activeCredit.totalCredits > 0
      ? activeCredit.remainingCredits / activeCredit.totalCredits
      : 0;
    if (activeCredit.remainingCredits <= 0) {
      attention.push({
        type: "credits_exhausted",
        severity: "critical",
        message: "نفد رصيد باقتكم الحالية. لا يمكن نشر مواد جديدة حتى التجديد.",
      });
    } else if (ratio <= 0.2) {
      attention.push({
        type: "credits_low",
        severity: "warning",
        message: `تبقى ${activeCredit.remainingCredits} فقط من رصيد باقة «${activeCredit.packageName}».`,
      });
    }
    if (activeCredit.expiryDate) {
      const expiryDays = Math.ceil((activeCredit.expiryDate.getTime() - now.getTime()) / 86_400_000);
      if (expiryDays >= 0 && expiryDays <= 14) {
        attention.push({
          type: "package_expiring",
          severity: "warning",
          message: `تنتهي صلاحية باقة «${activeCredit.packageName}» خلال ${expiryDays} ${expiryDays <= 10 ? "أيام" : "يوماً"}.`,
        });
      }
    }
  } else {
    attention.push({
      type: "no_active_package",
      severity: "critical",
      message: "لا توجد باقة رصيد نشطة لحسابكم.",
    });
  }

  return {
    publisher: {
      id: publisher.id,
      agencyName: publisher.agencyName,
      agencyNameEn: publisher.agencyNameEn,
      contactPerson: publisher.contactPerson,
      email: publisher.email,
      phoneNumber: publisher.phoneNumber,
      logoUrl: publisher.logoUrl,
      isActive: publisher.isActive,
      publishingEndsAt: publisher.publishingEndsAt,
      autoPublish: publisher.autoPublish,
    },
    stats: {
      totalArticles: Number(stats?.totalArticles) || 0,
      publishedArticles: Number(stats?.publishedArticles) || 0,
      draftArticles: Number(stats?.draftArticles) || 0,
      publishedThisMonth: Number(stats?.publishedThisMonth) || 0,
      totalViews: Number(stats?.totalViews) || 0,
    },
    activeCredit: activeCredit ?? null,
    recentArticles,
    topArticles,
    monthlyPublishing: monthlyPublishing.map((m) => ({
      month: m.month,
      published: Number(m.published) || 0,
      views: Number(m.views) || 0,
    })),
    attention,
  };
}
