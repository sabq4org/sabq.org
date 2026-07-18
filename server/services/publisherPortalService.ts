import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import { db } from "../db";
import { sendEmailNotification } from "./email";
import {
  articles,
  notificationsInbox,
  publisherCreditLogs,
  publisherCredits,
  publishers,
  roles,
  userRoles,
  users,
  type Publisher,
} from "@shared/schema";
import { storage } from "../storage";
import { deductPublisherCreditSafely } from "./publisherCreditService";
import { invalidatePublishedContent } from "./contentInvalidation";

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
  publisherStatus: articles.publisherStatus,
  publisherSubmittedAt: articles.publisherSubmittedAt,
  publisherApprovedAt: articles.publisherApprovedAt,
  publisherReviewNotes: articles.publisherReviewNotes,
};

/** تنبيه شخصي للناشر في جرس اللوحة — لا يفشل النشر إن تعذر. */
export async function notifyPublisherUser(
  userId: string,
  payload: { title: string; body: string; deeplink?: string },
) {
  try {
    await storage.createNotification({
      userId,
      type: "publisher_article",
      title: payload.title,
      body: payload.body,
      deeplink: payload.deeplink ?? "/dashboard/publisher/articles",
    });
  } catch (err) {
    console.error("[Publisher Portal] notification failed:", err);
  }
}

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

/** مادة واحدة لمحرر البوابة — ملكية صارمة (كاتبها فقط). */
export async function getPortalArticle(userId: string, articleId: string) {
  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.authorId, userId)))
    .limit(1);
  return article ?? null;
}

export type SubmitResult =
  | { ok: false; status: number; message: string; code?: string }
  | { ok: true; published: boolean; message: string };

/**
 * إرسال مادة للمراجعة — أو نشرها فوراً إذا كان الناشر موثوقاً (auto_publish).
 * تُستخدم من زر «إرسال للمراجعة» ومن إعادة الإرسال بعد «تحتاج تعديلات».
 */
export async function submitPortalArticle(userId: string, articleId: string): Promise<SubmitResult> {
  const article = await getPortalArticle(userId, articleId);
  if (!article) return { ok: false, status: 404, message: "المادة غير موجودة" };
  if (article.status !== "draft") {
    return { ok: false, status: 400, message: "لا يمكن إرسال مادة منشورة أو مؤرشفة" };
  }

  const gate = await getPublishingGate(userId);
  if (!gate.allowed) {
    return { ok: false, status: 403, message: gate.message ?? "النشر غير متاح", code: gate.code };
  }
  const publisher = gate.publisher;
  if (!publisher) return { ok: false, status: 404, message: "لم يتم العثور على حساب الناشر" };

  const now = new Date();

  if (publisher.autoPublish) {
    const [published] = await db
      .update(articles)
      .set({
        status: "published",
        publishedAt: now,
        updatedAt: now,
        publisherId: publisher.id,
        isPublisherNews: true,
        publisherStatus: "approved",
        publisherSubmittedAt: article.publisherSubmittedAt ?? now,
        publisherApprovedAt: now,
        publisherApprovedBy: userId,
      })
      .where(and(eq(articles.id, articleId), eq(articles.status, "draft")))
      .returning();
    if (!published) return { ok: false, status: 409, message: "تعذر نشر المادة — حاول مجدداً" };

    await deductPublisherCreditSafely({ authorUserId: userId, articleId, actorId: userId });
    invalidatePublishedContent({
      articleSlug: published.slug,
      isBreaking: false,
      reason: `publisher-auto-publish:${articleId}`,
    });
    await notifyPublisherUser(userId, {
      title: "نُشر خبرك",
      body: `«${published.title}» نُشر مباشرة وخُصم من رصيد باقتكم.`,
    });
    return { ok: true, published: true, message: "نُشرت المادة مباشرة وخُصم رصيد واحد" };
  }

  await db
    .update(articles)
    .set({
      publisherStatus: "pending",
      publisherSubmittedAt: now,
      updatedAt: now,
    })
    .where(eq(articles.id, articleId));
  return { ok: true, published: false, message: "أُرسلت المادة للمراجعة التحريرية" };
}

/** إجراء إداري: إعادة المادة للناشر بملاحظات بدل الرفض النهائي. */
export async function requestArticleChanges(articleId: string, adminId: string, notes: string) {
  const [article] = await db
    .select({ id: articles.id, title: articles.title, authorId: articles.authorId, status: articles.status })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  if (!article) return { ok: false as const, status: 404, message: "المادة غير موجودة" };
  if (article.status !== "draft") {
    return { ok: false as const, status: 400, message: "طلب التعديلات متاح للمواد غير المنشورة فقط" };
  }

  await db
    .update(articles)
    .set({
      publisherStatus: "needs_changes",
      publisherReviewedBy: adminId,
      publisherReviewedAt: new Date(),
      publisherReviewNotes: notes,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId));

  if (article.authorId) {
    await notifyPublisherUser(article.authorId, {
      title: "مادتك تحتاج تعديلات",
      body: `«${article.title}»: ${notes.slice(0, 180)}`,
    });
  }
  return { ok: true as const, message: "أُعيدت المادة للناشر مع الملاحظات" };
}

// ============================================
// مستخدمو الوكالة (موظفو الناشر)
// المالك = publishers.userId؛ الموظفون = users.linkedPublisherId.
// أي موظف مرتبط: يدخل بوابة الناشر، تُنسب مواده للوكالة تلقائياً
// (storage.createArticle)، ويُخصم نشره من رصيدها.
// ============================================

const memberSelection = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  profileImageUrl: users.profileImageUrl,
  role: users.role,
  status: users.status,
};

export async function listPublisherMembers(publisherId: string) {
  const [publisher] = await db
    .select()
    .from(publishers)
    .where(eq(publishers.id, publisherId))
    .limit(1);
  if (!publisher) return null;

  const [owners, linked] = await Promise.all([
    publisher.userId
      ? db.select(memberSelection).from(users).where(eq(users.id, publisher.userId)).limit(1)
      : Promise.resolve([]),
    db
      .select(memberSelection)
      .from(users)
      .where(eq(users.linkedPublisherId, publisherId))
      .orderBy(users.firstName),
  ]);

  const owner = owners[0] ?? null;
  return [
    ...(owner ? [{ ...owner, isOwner: true }] : []),
    ...linked.filter((m) => m.id !== owner?.id).map((m) => ({ ...m, isOwner: false })),
  ];
}

type MemberResult =
  | { ok: false; status: number; message: string }
  | { ok: true; message: string };

/** ربط حساب موجود بالوكالة عبر بريده الإلكتروني. */
export async function addPublisherMemberByEmail(publisherId: string, email: string): Promise<MemberResult> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db
    .select({ id: users.id, linkedPublisherId: users.linkedPublisherId })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);
  if (!user) return { ok: false, status: 404, message: "لا يوجد مستخدم بهذا البريد الإلكتروني" };

  if (user.linkedPublisherId === publisherId) {
    return { ok: false, status: 400, message: "هذا المستخدم مرتبط بالوكالة بالفعل" };
  }
  if (user.linkedPublisherId) {
    return { ok: false, status: 409, message: "هذا المستخدم مرتبط بوكالة أخرى — فكّ ربطه أولاً" };
  }
  const [ownsOther] = await db
    .select({ id: publishers.id })
    .from(publishers)
    .where(eq(publishers.userId, user.id))
    .limit(1);
  if (ownsOther && ownsOther.id !== publisherId) {
    return { ok: false, status: 409, message: "هذا المستخدم مالك وكالة أخرى ولا يمكن ربطه كموظف" };
  }

  await db.update(users).set({ linkedPublisherId: publisherId }).where(eq(users.id, user.id));
  return { ok: true, message: "رُبط المستخدم بالوكالة بنجاح" };
}

/** إنشاء حساب موظف جديد بدور «ناشر» مربوط بالوكالة. */
export async function createPublisherMember(
  publisherId: string,
  data: { email: string; password: string; firstName: string; lastName: string },
): Promise<MemberResult> {
  const normalized = data.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalized}`)
    .limit(1);
  if (existing) {
    return { ok: false, status: 409, message: "البريد الإلكتروني مستخدم مسبقاً — استخدم «ربط حساب موجود»" };
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const userId = nanoid();
  await db.insert(users).values({
    id: userId,
    email: data.email.trim(),
    passwordHash,
    firstName: data.firstName,
    lastName: data.lastName,
    role: "publisher",
    authProvider: "local",
    isProfileComplete: true,
    status: "active",
    emailVerified: true,
    linkedPublisherId: publisherId,
  } as any);

  const [publisherRole] = await db.select().from(roles).where(eq(roles.name, "publisher")).limit(1);
  if (publisherRole) {
    await db.insert(userRoles).values({ userId, roleId: publisherRole.id });
  }

  return { ok: true, message: "أُنشئ حساب الموظف ورُبط بالوكالة" };
}

/** فك ربط موظف عن الوكالة (لا يمكن فك المالك). */
export async function removePublisherMember(publisherId: string, memberId: string): Promise<MemberResult> {
  const [publisher] = await db
    .select({ userId: publishers.userId })
    .from(publishers)
    .where(eq(publishers.id, publisherId))
    .limit(1);
  if (!publisher) return { ok: false, status: 404, message: "الوكالة غير موجودة" };
  if (publisher.userId === memberId) {
    return { ok: false, status: 400, message: "لا يمكن فك ربط مالك الوكالة" };
  }

  const [updated] = await db
    .update(users)
    .set({ linkedPublisherId: null })
    .where(and(eq(users.id, memberId), eq(users.linkedPublisherId, publisherId)))
    .returning({ id: users.id });
  if (!updated) return { ok: false, status: 404, message: "المستخدم غير مرتبط بهذه الوكالة" };

  return { ok: true, message: "فُك ربط الموظف عن الوكالة" };
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
        pendingReview: sql<number>`count(*) filter (where ${articles.status} = 'draft' and ${articles.publisherStatus} = 'pending')`,
        needsChanges: sql<number>`count(*) filter (where ${articles.status} = 'draft' and ${articles.publisherStatus} = 'needs_changes')`,
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
      .orderBy(desc(publisherCredits.isUnlimited), desc(publisherCredits.createdAt))
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

  const needsChangesCount = Number(stats?.needsChanges) || 0;
  if (needsChangesCount > 0) {
    attention.push({
      type: "needs_changes",
      severity: "warning",
      message: `لديك ${needsChangesCount} ${needsChangesCount === 1 ? "مادة تحتاج" : "مواد تحتاج"} تعديلات من المحرر — راجع الملاحظات وأعد الإرسال.`,
    });
  }

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
    // الباقة المفتوحة لا تنبيهات رصيد لها — تنبيه الانتهاء فقط
    if (!activeCredit.isUnlimited && activeCredit.remainingCredits <= 0) {
      attention.push({
        type: "credits_exhausted",
        severity: "critical",
        message: "نفد رصيد باقتكم الحالية. لا يمكن نشر مواد جديدة حتى التجديد.",
      });
    } else if (!activeCredit.isUnlimited && ratio <= 0.2) {
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
      pendingReview: Number(stats?.pendingReview) || 0,
      needsChanges: needsChangesCount,
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

// ============================================
// حماية الإيراد: تنبيهات استباقية + تقرير شهري
// تُستدعى من server/jobs/publisherAlertsJob.ts (على القائد فقط).
// منع التكرار عبر notificationsInbox (metadata.alertKey) بدل أعمدة جديدة.
// ============================================

const ALERT_TYPE = "publisher_alert";
const REPORT_TYPE = "publisher_monthly_report";

const arDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("ar-SA-u-ca-gregory") : "—";

/** هل أُرسل تنبيه بنفس المفتاح لهذا المستخدم خلال آخر N يوماً؟ */
async function alertRecentlySent(userId: string, alertKey: string, days: number): Promise<boolean> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [row] = await db
    .select({ id: notificationsInbox.id })
    .from(notificationsInbox)
    .where(
      and(
        eq(notificationsInbox.userId, userId),
        eq(notificationsInbox.type, ALERT_TYPE),
        gte(notificationsInbox.createdAt, since),
        sql`${notificationsInbox.metadata} ->> 'alertKey' = ${alertKey}`,
      ),
    )
    .limit(1);
  return !!row;
}

function alertEmailHtml(agencyName: string, title: string, body: string): string {
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><body style="font-family:Tahoma,Arial,sans-serif;background:#f5f7f8;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0">
    <h2 style="margin:0 0 4px;color:#0f172a">صحيفة سبق — بوابة الناشرين</h2>
    <p style="color:#64748b;margin:0 0 20px">${agencyName}</p>
    <h3 style="color:#b45309;margin:0 0 8px">${title}</h3>
    <p style="color:#334155;line-height:1.8;margin:0 0 20px">${body}</p>
    <a href="https://sabq.org/dashboard/publisher" style="display:inline-block;background:#0369a1;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px">فتح لوحة الناشر</a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">للاستفسار أو التجديد يرجى التواصل مع إدارة سبق.</p>
  </div></body></html>`;
}

type PublisherAlertEvent = {
  alertKey: string;
  title: string;
  body: string;
  /** أيام منع التكرار */
  cooldownDays: number;
};

function collectAlertEvents(
  publisher: Publisher,
  activeCredit: typeof publisherCredits.$inferSelect | null,
  now: Date,
): PublisherAlertEvent[] {
  const events: PublisherAlertEvent[] = [];

  if (activeCredit) {
    const ratio = activeCredit.totalCredits > 0
      ? activeCredit.remainingCredits / activeCredit.totalCredits
      : 0;
    if (!activeCredit.isUnlimited && activeCredit.remainingCredits <= 0) {
      events.push({
        alertKey: `credits_exhausted:${activeCredit.id}`,
        title: "نفد رصيد باقتكم",
        body: `استُهلك كامل رصيد باقة «${activeCredit.packageName}». لا يمكن نشر مواد جديدة حتى تجديد الباقة.`,
        cooldownDays: 7,
      });
    } else if (!activeCredit.isUnlimited && ratio <= 0.2) {
      events.push({
        alertKey: `credits_low:${activeCredit.id}`,
        title: "رصيد باقتكم يوشك على النفاد",
        body: `تبقى ${activeCredit.remainingCredits} من أصل ${activeCredit.totalCredits} في باقة «${activeCredit.packageName}». نوصي بترتيب التجديد مبكراً لتفادي انقطاع النشر.`,
        cooldownDays: 7,
      });
    }
    if (activeCredit.expiryDate) {
      const days = Math.ceil((new Date(activeCredit.expiryDate).getTime() - now.getTime()) / 86_400_000);
      if (days >= 0 && days <= 7) {
        events.push({
          alertKey: `package_expiring:${activeCredit.id}`,
          title: "باقتكم تنتهي قريباً",
          body: `تنتهي صلاحية باقة «${activeCredit.packageName}» بتاريخ ${arDate(activeCredit.expiryDate)} (خلال ${days} ${days <= 10 ? "أيام" : "يوماً"}).`,
          cooldownDays: 7,
        });
      }
    }
  } else {
    events.push({
      alertKey: `no_active_package:${publisher.id}`,
      title: "لا توجد باقة نشطة لحسابكم",
      body: "لا توجد باقة رصيد نشطة مرتبطة بحسابكم في سبق — لن يكون النشر متاحاً حتى تفعيل باقة جديدة.",
      cooldownDays: 14,
    });
  }

  if (publisher.publishingEndsAt) {
    const days = Math.ceil((new Date(publisher.publishingEndsAt).getTime() - now.getTime()) / 86_400_000);
    if (days >= 0 && days <= 7) {
      events.push({
        alertKey: `window_ending:${publisher.id}:${arDate(publisher.publishingEndsAt)}`,
        title: "فترة النشر المتاحة لحسابكم توشك على الانتهاء",
        body: `ينتهي النشر المتاح لحسابكم بتاريخ ${arDate(publisher.publishingEndsAt)}. للتمديد يرجى التواصل مع إدارة سبق.`,
        cooldownDays: 7,
      });
    } else if (days < 0 && days >= -2) {
      events.push({
        alertKey: `window_closed:${publisher.id}:${arDate(publisher.publishingEndsAt)}`,
        title: "انتهت فترة النشر المتاحة لحسابكم",
        body: `انتهت فترة النشر بتاريخ ${arDate(publisher.publishingEndsAt)} وتوقف قبول المواد الجديدة. للتجديد يرجى التواصل مع إدارة سبق.`,
        cooldownDays: 30,
      });
    }
  }

  return events;
}

/** التنبيهات اليومية: رصيد منخفض/منتهٍ، باقة تنتهي، نافذة نشر تنتهي/انتهت. */
export async function runPublisherDailyAlerts(): Promise<{ publishersChecked: number; alertsSent: number }> {
  const now = new Date();
  const activePublishers = await db.select().from(publishers).where(eq(publishers.isActive, true));
  let alertsSent = 0;

  for (const publisher of activePublishers) {
    try {
      const [activeCredit] = await db
        .select()
        .from(publisherCredits)
        .where(
          and(
            eq(publisherCredits.publisherId, publisher.id),
            eq(publisherCredits.isActive, true),
            or(sql`${publisherCredits.expiryDate} IS NULL`, gte(publisherCredits.expiryDate, now)),
          ),
        )
        .orderBy(desc(publisherCredits.isUnlimited), desc(publisherCredits.createdAt))
        .limit(1);

      const events = collectAlertEvents(publisher, activeCredit ?? null, now);
      if (events.length === 0) continue;

      const members = (await listPublisherMembers(publisher.id)) ?? [];
      const dedupUserId = publisher.userId ?? members[0]?.id;
      if (!dedupUserId) continue;

      for (const event of events) {
        if (await alertRecentlySent(dedupUserId, event.alertKey, event.cooldownDays)) continue;

        // تنبيه داخل اللوحة لكل أعضاء الوكالة
        for (const member of members) {
          try {
            await storage.createNotification({
              userId: member.id,
              type: ALERT_TYPE,
              title: event.title,
              body: event.body,
              deeplink: "/dashboard/publisher",
              metadata: { alertKey: event.alertKey, publisherId: publisher.id },
            });
          } catch (err) {
            console.error(`[Publisher Alerts] in-app failed for ${member.id}:`, err);
          }
        }

        // بريد إلى صندوق الوكالة الرسمي
        if (publisher.email) {
          await sendEmailNotification({
            to: publisher.email,
            subject: `سبق | ${event.title}`,
            html: alertEmailHtml(publisher.agencyName, event.title, event.body),
          });
        }
        alertsSent++;
      }
    } catch (err) {
      console.error(`[Publisher Alerts] failed for publisher ${publisher.id}:`, err);
    }
  }

  return { publishersChecked: activePublishers.length, alertsSent };
}

function monthlyReportHtml(params: {
  agencyName: string;
  monthLabel: string;
  published: number;
  totalViews: number;
  creditsUsed: number;
  remainingCredits: number | string | null;
  packageName: string | null;
  topArticles: Array<{ title: string; views: number | null }>;
}): string {
  const rows = params.topArticles
    .map(
      (a, i) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">${i + 1}. ${a.title}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap">${Number(a.views) || 0} مشاهدة</td></tr>`,
    )
    .join("");
  const stat = (label: string, value: string) =>
    `<td style="padding:12px;background:#f8fafc;border-radius:8px;text-align:center"><div style="font-size:22px;font-weight:bold;color:#0f172a">${value}</div><div style="font-size:12px;color:#64748b">${label}</div></td>`;

  return `<!DOCTYPE html><html dir="rtl" lang="ar"><body style="font-family:Tahoma,Arial,sans-serif;background:#f5f7f8;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;border:1px solid #e2e8f0">
    <h2 style="margin:0 0 4px;color:#0f172a">التقرير الشهري — ${params.monthLabel}</h2>
    <p style="color:#64748b;margin:0 0 20px">${params.agencyName} · صحيفة سبق</p>
    <table width="100%" cellspacing="8"><tr>
      ${stat("مادة منشورة", String(params.published))}
      ${stat("إجمالي المشاهدات", String(params.totalViews))}
      ${stat("رصيد مستهلك", String(params.creditsUsed))}
      ${stat("رصيد متبقٍ", params.remainingCredits === null ? "—" : String(params.remainingCredits))}
    </tr></table>
    ${params.packageName ? `<p style="color:#334155;margin:16px 0 0">الباقة الحالية: <b>${params.packageName}</b></p>` : ""}
    ${rows ? `<h3 style="color:#0f172a;margin:24px 0 8px">الأعلى مشاهدة هذا الشهر</h3><table width="100%" style="border-collapse:collapse">${rows}</table>` : ""}
    <a href="https://sabq.org/dashboard/publisher" style="display:inline-block;background:#0369a1;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;margin-top:24px">فتح لوحة الناشر</a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">يصلكم هذا الكشف مطلع كل شهر تلقائياً. لتجديد الباقات يرجى التواصل مع إدارة سبق.</p>
  </div></body></html>`;
}

/** التقرير الشهري: يُرسل مطلع كل شهر عن الشهر المنقضي لكل وكالة نشطة. */
export async function sendPublisherMonthlyReports(now = new Date()): Promise<{ reportsSent: number }> {
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
  const monthLabel = monthStart.toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", year: "numeric" });

  const activePublishers = await db.select().from(publishers).where(eq(publishers.isActive, true));
  let reportsSent = 0;

  for (const publisher of activePublishers) {
    try {
      const dedupUserId = publisher.userId;
      if (dedupUserId) {
        const since = new Date(now.getTime() - 40 * 86_400_000);
        const [already] = await db
          .select({ id: notificationsInbox.id })
          .from(notificationsInbox)
          .where(
            and(
              eq(notificationsInbox.userId, dedupUserId),
              eq(notificationsInbox.type, REPORT_TYPE),
              gte(notificationsInbox.createdAt, since),
              sql`${notificationsInbox.metadata} ->> 'month' = ${monthKey}`,
            ),
          )
          .limit(1);
        if (already) continue;
      }

      const condition = publisherArticlesCondition(publisher);
      const publishedInMonth = and(
        condition,
        eq(articles.status, "published"),
        gte(articles.publishedAt, monthStart),
        lt(articles.publishedAt, monthEnd),
      );

      const [[monthStats], topArticles, [creditUsage], [activeCredit]] = await Promise.all([
        db
          .select({
            published: sql<number>`count(*)`,
            totalViews: sql<number>`coalesce(sum(${articles.views}), 0)`,
          })
          .from(articles)
          .where(publishedInMonth),
        db
          .select({ title: articles.title, views: articles.views })
          .from(articles)
          .where(publishedInMonth)
          .orderBy(desc(articles.views))
          .limit(3),
        db
          .select({ used: sql<number>`count(*)` })
          .from(publisherCreditLogs)
          .where(
            and(
              eq(publisherCreditLogs.publisherId, publisher.id),
              eq(publisherCreditLogs.actionType, "credit_used"),
              gte(publisherCreditLogs.createdAt, monthStart),
              lt(publisherCreditLogs.createdAt, monthEnd),
            ),
          ),
        db
          .select()
          .from(publisherCredits)
          .where(and(eq(publisherCredits.publisherId, publisher.id), eq(publisherCredits.isActive, true)))
          .orderBy(desc(publisherCredits.isUnlimited), desc(publisherCredits.createdAt))
          .limit(1),
      ]);

      const published = Number(monthStats?.published) || 0;
      const creditsUsed = Number(creditUsage?.used) || 0;
      // لا نراسل وكالة بلا أي نشاط ولا باقة — لا قيمة للكشف الفارغ
      if (published === 0 && creditsUsed === 0 && !activeCredit) continue;

      const html = monthlyReportHtml({
        agencyName: publisher.agencyName,
        monthLabel,
        published,
        totalViews: Number(monthStats?.totalViews) || 0,
        creditsUsed,
        remainingCredits: activeCredit
          ? activeCredit.isUnlimited ? "مفتوح" : activeCredit.remainingCredits
          : null,
        packageName: activeCredit?.packageName ?? null,
        topArticles,
      });

      if (publisher.email) {
        await sendEmailNotification({
          to: publisher.email,
          subject: `سبق | التقرير الشهري لوكالة ${publisher.agencyName} — ${monthLabel}`,
          html,
        });
      }

      if (dedupUserId) {
        await storage.createNotification({
          userId: dedupUserId,
          type: REPORT_TYPE,
          title: `تقريركم الشهري — ${monthLabel}`,
          body: `نُشر ${published} مادة بإجمالي ${Number(monthStats?.totalViews) || 0} مشاهدة، واستُهلك ${creditsUsed} من الرصيد.`,
          deeplink: "/dashboard/publisher",
          metadata: { month: monthKey, publisherId: publisher.id },
        });
      }
      reportsSent++;
    } catch (err) {
      console.error(`[Publisher Monthly Report] failed for publisher ${publisher.id}:`, err);
    }
  }

  return { reportsSent };
}
