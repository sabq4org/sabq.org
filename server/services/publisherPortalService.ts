import { and, desc, eq, gte, inArray, lte, lt, or, sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import { db } from "../db";
import { sendEmailNotification } from "./email";
import { withCache, memoryCache } from "../memoryCache";
import {
  articles,
  categories,
  notificationsInbox,
  publisherCreditLogs,
  publisherCredits,
  publisherGuideSections,
  publisherRequests,
  publishers,
  roles,
  userRoles,
  users,
  type Publisher,
} from "@shared/schema";
import { storage } from "../storage";
import { deductPublisherCreditSafely } from "./publisherCreditService";
import { invalidatePublishedContent } from "./contentInvalidation";
import { PUBLISHER_GUIDE_DEFAULT_SECTIONS } from "@shared/publisherGuideDefaults";
import { getUserPermissionData } from "../rbac";

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

/**
 * مواد الناشر = ما خُتم بـ publisher_id فقط.
 * لا نجمع عبر authorId: مالك الوكالة قد يكون له أرشيف مراسل قديم (مئات الأخبار)
 * فيظهر كله داخل بوابة الناشر ويُحسب على الباقة بالخطأ.
 */
function publisherArticlesCondition(publisher: Publisher) {
  return eq(articles.publisherId, publisher.id);
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
  authorId: articles.authorId,
  categoryId: articles.categoryId,
};

function formatAuthorName(firstName: string | null, lastName: string | null) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

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
      .select({
        ...articleListSelection,
        categoryName: categories.nameAr,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .where(where)
      .orderBy(desc(articles.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)` }).from(articles).where(where),
  ]);

  return {
    articles: rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      englishSlug: row.englishSlug,
      status: row.status,
      imageUrl: row.imageUrl,
      views: row.views,
      createdAt: row.createdAt,
      publishedAt: row.publishedAt,
      publisherStatus: row.publisherStatus,
      publisherSubmittedAt: row.publisherSubmittedAt,
      publisherApprovedAt: row.publisherApprovedAt,
      publisherReviewNotes: row.publisherReviewNotes,
      authorId: row.authorId,
      categoryId: row.categoryId,
      categoryName: row.categoryName ?? null,
      authorName: formatAuthorName(row.authorFirstName, row.authorLastName),
    })),
    total: Number(count) || 0,
    page,
    limit,
  };
}

/** بداية يوم تقويمي (UTC) لتواريخ الباقات المخزّنة كتاريخ بدون وقت دقيق. */
function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * بداية فترة «النشر المفتوح» للوكالة:
 * بعد انتهاء آخر باقة محدودة (إن وُجدت)، وإلا أقدم بداية لباقة مفتوحة.
 * حتى لو أُنشئت باقة مفتوحة جديدة اليوم لا نُصفّر ما نُشر في الفترة المفتوحة.
 */
function resolveOpenPeriodStart(
  packages: Array<{
    startDate: Date;
    expiryDate: Date | null;
    isUnlimited: boolean;
    packageName: string;
  }>,
  fallback: Date,
): Date {
  const now = Date.now();
  const limitedEnds = packages
    .filter((p) => !p.isUnlimited && !/مفتوح/.test(p.packageName) && p.expiryDate)
    .map((p) => p.expiryDate!)
    .filter((d) => d.getTime() < now);

  if (limitedEnds.length > 0) {
    return startOfUtcDay(new Date(Math.max(...limitedEnds.map((d) => d.getTime()))));
  }

  const openRelated = packages.filter(
    (p) => p.isUnlimited || /مفتوح/.test(p.packageName),
  );
  if (openRelated.length === 0) return startOfUtcDay(fallback);
  const earliest = openRelated.reduce(
    (min, p) => (p.startDate.getTime() < min.getTime() ? p.startDate : min),
    openRelated[0].startDate,
  );
  return startOfUtcDay(earliest);
}

/** كل باقات الوكالة (نشطة ومعطّلة) كما تظهر في لوحة الإدارة. */
export async function getPortalCreditPackages(publisher: Publisher) {
  const now = new Date();
  const rows = await db
    .select()
    .from(publisherCredits)
    .where(eq(publisherCredits.publisherId, publisher.id))
    .orderBy(desc(publisherCredits.isActive), desc(publisherCredits.isUnlimited), desc(publisherCredits.createdAt));

  const articleCond = publisherArticlesCondition(publisher);
  const [publishedRows, usageLogs] = await Promise.all([
    db
      .select({ publishedAt: articles.publishedAt })
      .from(articles)
      .where(and(articleCond, eq(articles.status, "published"))),
    db
      .select({
        creditPackageId: publisherCreditLogs.creditPackageId,
        count: sql<number>`count(*)::int`,
      })
      .from(publisherCreditLogs)
      .where(
        and(
          eq(publisherCreditLogs.publisherId, publisher.id),
          eq(publisherCreditLogs.actionType, "credit_used"),
        ),
      )
      .groupBy(publisherCreditLogs.creditPackageId),
  ]);

  const publishedDates = publishedRows
    .map((r) => r.publishedAt)
    .filter((d): d is Date => d instanceof Date);
  const logsByPackage = new Map(
    usageLogs.map((r) => [r.creditPackageId, Number(r.count) || 0]),
  );

  const openPeriodStart = resolveOpenPeriodStart(rows, rows[0]?.startDate ?? now);

  // صحّح usedCredits للباقات المفتوحة إن تخلّف العداد عن الواقع
  const healUpdates: Array<{ id: string; used: number }> = [];

  const packages = rows.map((pkg) => {
    const expired = !!(pkg.expiryDate && pkg.expiryDate.getTime() < now.getTime());
    let status: "active" | "inactive" | "expired" = "inactive";
    if (pkg.isActive && !expired) status = "active";
    else if (expired) status = "expired";

    const windowStart = pkg.isUnlimited && status === "active"
      ? openPeriodStart
      : startOfUtcDay(pkg.startDate);
    const windowEnd = pkg.expiryDate ? endOfUtcDay(pkg.expiryDate) : now;

    const publishedInWindow = publishedDates.filter(
      (d) => d.getTime() >= windowStart.getTime() && d.getTime() <= windowEnd.getTime(),
    ).length;
    const loggedUses = logsByPackage.get(pkg.id) ?? 0;

    // الباقة المفتوحة: مصدر الحقيقة = المنشور في نافذتها (أو سجلات الاستخدام)
    // الباقة المحدودة: نثق بعدّاد الخصم مع عدم النزول تحت سجلات الاستخدام
    const usedCredits = pkg.isUnlimited
      ? Math.max(pkg.usedCredits, publishedInWindow, loggedUses)
      : Math.max(pkg.usedCredits, loggedUses);

    if (pkg.isUnlimited && usedCredits !== pkg.usedCredits) {
      healUpdates.push({ id: pkg.id, used: usedCredits });
    }

    return {
      id: pkg.id,
      packageName: pkg.packageName,
      totalCredits: pkg.totalCredits,
      usedCredits,
      publishedCount: publishedInWindow,
      remainingCredits: pkg.remainingCredits,
      isUnlimited: pkg.isUnlimited,
      period: pkg.period,
      startDate: pkg.startDate,
      /** بداية العدّ المعروضة للباقة المفتوحة النشطة (قد تكون أقدم من startDate) */
      countingFrom: windowStart,
      expiryDate: pkg.expiryDate,
      isActive: pkg.isActive,
      status,
      notes: pkg.notes,
      createdAt: pkg.createdAt,
    };
  });

  if (healUpdates.length > 0) {
    await Promise.all(
      healUpdates.map((u) =>
        db
          .update(publisherCredits)
          .set({ usedCredits: u.used, updatedAt: now })
          .where(eq(publisherCredits.id, u.id)),
      ),
    );
  }

  return { packages };
}

/** سجل عمليات الرصيد لبوابة الناشر — كانت الصفحة تستدعي مساراً غير موجود. */
export async function getPortalCreditLogs(
  publisher: Publisher,
  opts: { page?: number; limit?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: publisherCreditLogs.id,
        actionType: publisherCreditLogs.actionType,
        creditsBefore: publisherCreditLogs.creditsBefore,
        creditsChanged: publisherCreditLogs.creditsChanged,
        creditsAfter: publisherCreditLogs.creditsAfter,
        notes: publisherCreditLogs.notes,
        createdAt: publisherCreditLogs.createdAt,
        articleId: articles.id,
        articleTitle: articles.title,
        packageName: publisherCredits.packageName,
        packageIsUnlimited: publisherCredits.isUnlimited,
      })
      .from(publisherCreditLogs)
      .innerJoin(publisherCredits, eq(publisherCreditLogs.creditPackageId, publisherCredits.id))
      .leftJoin(articles, eq(publisherCreditLogs.articleId, articles.id))
      .where(eq(publisherCreditLogs.publisherId, publisher.id))
      .orderBy(desc(publisherCreditLogs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)` })
      .from(publisherCreditLogs)
      .where(eq(publisherCreditLogs.publisherId, publisher.id)),
  ]);

  return {
    logs: rows.map((row) => ({
      id: row.id,
      actionType: row.actionType,
      creditsBefore: row.creditsBefore,
      creditsChanged: row.creditsChanged,
      creditsAfter: row.creditsAfter,
      notes: row.notes,
      createdAt: row.createdAt,
      article: row.articleId ? { id: row.articleId, title: row.articleTitle } : null,
      creditPackage: {
        packageName: row.packageName,
        isUnlimited: row.packageIsUnlimited,
      },
    })),
    total: Number(count) || 0,
    page,
    limit,
  };
}

/** مادة واحدة لمحرر البوابة — كاتبها أو أي مادة منسوبة لنفس الوكالة. */
export async function getPortalArticle(
  userId: string,
  articleId: string,
  publisher?: Publisher | null,
) {
  const ownership = publisher
    ? or(eq(articles.authorId, userId), eq(articles.publisherId, publisher.id))
    : eq(articles.authorId, userId);

  const [article] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, articleId), ownership))
    .limit(1);
  return article ?? null;
}

/**
 * حذف/أرشفة مادة من بوابة الناشر.
 * المسودات والمرفوض: أرشفة مباشرة.
 * المنشور: للناشر الموثوق (auto_publish) فقط — أرشفة + إبطال كاش.
 */
export async function deletePortalArticle(
  userId: string,
  articleId: string,
  publisher: Publisher,
): Promise<{ ok: false; status: number; message: string } | { ok: true; message: string }> {
  const article = await getPortalArticle(userId, articleId, publisher);
  if (!article) return { ok: false, status: 404, message: "المادة غير موجودة" };
  if (article.status === "archived") {
    return { ok: false, status: 400, message: "المادة مؤرشفة بالفعل" };
  }
  if (article.status === "published" && !publisher.autoPublish) {
    return {
      ok: false,
      status: 403,
      message: "لا يمكن حذف مادة منشورة — تواصل مع التحرير إن لزم الأمر",
    };
  }

  const [updated] = await db
    .update(articles)
    .set({
      status: "archived",
      updatedAt: new Date(),
      publisherStatus: article.status === "published" ? "rejected" : article.publisherStatus,
      publisherReviewNotes:
        article.status === "published"
          ? "أُرشفت من بوابة الناشر"
          : article.publisherReviewNotes,
    })
    .where(
      and(
        eq(articles.id, articleId),
        or(eq(articles.authorId, userId), eq(articles.publisherId, publisher.id)),
      ),
    )
    .returning({ id: articles.id, slug: articles.slug, englishSlug: articles.englishSlug });

  if (!updated) return { ok: false, status: 404, message: "تعذر حذف المادة" };

  if (article.status === "published") {
    invalidatePublishedContent({
      articleSlug: updated.englishSlug || updated.slug,
      isBreaking: false,
      reason: `publisher-portal-delete:${articleId}`,
    });
  }
  invalidatePortalOverviewCache(publisher.id);

  return {
    ok: true,
    message: article.status === "published" ? "أُرشفت المادة وأُزيلت من الموقع" : "تم حذف المسودة",
  };
}

export type SubmitResult =
  | { ok: false; status: number; message: string; code?: string }
  | { ok: true; published: boolean; message: string };

/**
 * إرسال مادة للمراجعة — أو نشرها فوراً إذا كان الناشر موثوقاً (auto_publish).
 * تُستخدم من زر «إرسال للمراجعة» ومن إعادة الإرسال بعد «تحتاج تعديلات».
 */
export async function submitPortalArticle(userId: string, articleId: string): Promise<SubmitResult> {
  const gate = await getPublishingGate(userId);
  if (!gate.allowed) {
    return { ok: false, status: 403, message: gate.message ?? "النشر غير متاح", code: gate.code };
  }
  const publisher = gate.publisher;
  if (!publisher) return { ok: false, status: 404, message: "لم يتم العثور على حساب الناشر" };

  const article = await getPortalArticle(userId, articleId, publisher);
  if (!article) return { ok: false, status: 404, message: "المادة غير موجودة" };
  if (article.status !== "draft") {
    return { ok: false, status: 400, message: "لا يمكن إرسال مادة منشورة أو مؤرشفة" };
  }

  const now = new Date();

  if (await trustedPublisherCanPublish(userId, gate)) {
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
    invalidatePortalOverviewCache(publisher.id);
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
  invalidatePortalOverviewCache(publisher.id);
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

  // لوحة الوكالة كانت ~2.2ث بعد الإقلاع (5+ استعلامات). كاش دقيقة يكفي للأرقام.
  return withCache(`publisher:portal:overview:${publisher.id}`, 60_000, async () => {
    return buildPortalOverview(publisher);
  });
}

/** إبطال كاش نظرة عامة بعد نشر/حذف حتى لا تبقى الأرقام دقيقة واحدة خاطئة. */
export function invalidatePortalOverviewCache(publisherId: string): void {
  memoryCache.delete(`publisher:portal:overview:${publisherId}`);
}

async function buildPortalOverview(publisher: Publisher) {
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

  // شارات «يتطلب انتباهك» تُحسب في الخادم لتبقى الواجهة عرضاً فقط.
  // `action` يحوّل الرسالة من إخبار إلى إجراء: كانت الوكالة تقرأ «نفد
  // رصيدكم» بلا أي زر يفعل شيئاً حيالها.
  const attention: Array<{
    type: string;
    severity: "warning" | "critical";
    message: string;
    action?: { kind: "request"; requestType: string; label: string } | { kind: "link"; href: string; label: string };
  }> = [];

  const needsChangesCount = Number(stats?.needsChanges) || 0;
  if (needsChangesCount > 0) {
    attention.push({
      type: "needs_changes",
      severity: "warning",
      message: `لديك ${needsChangesCount} ${needsChangesCount === 1 ? "مادة تحتاج" : "مواد تحتاج"} تعديلات من المحرر — راجع الملاحظات وأعد الإرسال.`,
      action: { kind: "link", href: "/dashboard/publisher/articles", label: "عرض المواد" },
    });
  }

  const extendAction = {
    kind: "request" as const,
    requestType: "window_extension",
    label: "طلب تمديد الفترة",
  };
  const renewAction = { kind: "request" as const, requestType: "renewal", label: "طلب تجديد الباقة" };

  if (publisher.publishingEndsAt) {
    const daysLeft = Math.ceil((publisher.publishingEndsAt.getTime() - now.getTime()) / 86_400_000);
    if (daysLeft < 0) {
      attention.push({
        type: "window_closed",
        severity: "critical",
        message: "انتهت فترة النشر المتاحة لحسابكم.",
        action: extendAction,
      });
    } else if (daysLeft <= 14) {
      attention.push({
        type: "window_ending",
        severity: "warning",
        message: `تنتهي فترة النشر المتاحة لحسابكم خلال ${daysLeft} ${daysLeft <= 10 ? "أيام" : "يوماً"}.`,
        action: extendAction,
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
        action: renewAction,
      });
    } else if (!activeCredit.isUnlimited && ratio <= 0.2) {
      attention.push({
        type: "credits_low",
        severity: "warning",
        message: `تبقى ${activeCredit.remainingCredits} فقط من رصيد باقة «${activeCredit.packageName}».`,
        action: renewAction,
      });
    }
    if (activeCredit.expiryDate) {
      const expiryDays = Math.ceil((activeCredit.expiryDate.getTime() - now.getTime()) / 86_400_000);
      if (expiryDays >= 0 && expiryDays <= 14) {
        attention.push({
          type: "package_expiring",
          severity: "warning",
          message: `تنتهي صلاحية باقة «${activeCredit.packageName}» خلال ${expiryDays} ${expiryDays <= 10 ? "أيام" : "يوماً"}.`,
          action: renewAction,
        });
      }
    }
  } else {
    attention.push({
      type: "no_active_package",
      severity: "critical",
      message: "لا توجد باقة رصيد نشطة لحسابكم.",
      action: renewAction,
    });
  }

  // صحّح عدّاد الباقة المفتوحة من المنشور الفعلي (لا نعتمد على usedCredits المتخلّف)
  let enrichedActiveCredit = activeCredit ?? null;
  if (activeCredit?.isUnlimited) {
    const allPackages = await db
      .select({
        startDate: publisherCredits.startDate,
        expiryDate: publisherCredits.expiryDate,
        isUnlimited: publisherCredits.isUnlimited,
        packageName: publisherCredits.packageName,
      })
      .from(publisherCredits)
      .where(eq(publisherCredits.publisherId, publisher.id));
    const countingFrom = resolveOpenPeriodStart(allPackages, activeCredit.startDate);
    const windowEnd = activeCredit.expiryDate ? endOfUtcDay(activeCredit.expiryDate) : now;
    const [{ count: publishedInOpen }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(articles)
      .where(
        and(
          condition,
          eq(articles.status, "published"),
          gte(articles.publishedAt, countingFrom),
          lte(articles.publishedAt, windowEnd),
        ),
      );
    const used = Math.max(activeCredit.usedCredits, Number(publishedInOpen) || 0);
    enrichedActiveCredit = {
      ...activeCredit,
      usedCredits: used,
      countingFrom,
    } as typeof activeCredit & { countingFrom: Date };
  }

  // زر «خبر جديد» كان يُعطَّل بصمت عند انتهاء النافذة فقط، ويبقى فعّالاً
  // مع رصيد صفر ثم يرفض الخادم عند النشر. السبب يُحسب هنا مرة واحدة.
  const publishBlock: { reason: string; requestType: string } | null =
    !publisher.isActive
      ? { reason: "حساب الوكالة موقوف حالياً.", requestType: "other" }
      : publisher.publishingEndsAt && publisher.publishingEndsAt.getTime() < now.getTime()
        ? { reason: "انتهت فترة النشر المتاحة لحسابكم.", requestType: "window_extension" }
        : !activeCredit
          ? { reason: "لا توجد باقة رصيد نشطة.", requestType: "renewal" }
          : !activeCredit.isUnlimited && activeCredit.remainingCredits <= 0
            ? { reason: "نفد رصيد الباقة الحالية.", requestType: "renewal" }
            : null;

  const [openRequest] = await db
    .select({
      id: publisherRequests.id,
      type: publisherRequests.type,
      createdAt: publisherRequests.createdAt,
    })
    .from(publisherRequests)
    .where(and(eq(publisherRequests.publisherId, publisher.id), eq(publisherRequests.status, "open")))
    .orderBy(desc(publisherRequests.createdAt))
    .limit(1);

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
    publishBlock,
    openRequest: openRequest ?? null,
    stats: {
      totalArticles: Number(stats?.totalArticles) || 0,
      publishedArticles: Number(stats?.publishedArticles) || 0,
      draftArticles: Number(stats?.draftArticles) || 0,
      publishedThisMonth: Number(stats?.publishedThisMonth) || 0,
      totalViews: Number(stats?.totalViews) || 0,
      pendingReview: Number(stats?.pendingReview) || 0,
      needsChanges: needsChangesCount,
    },
    activeCredit: enrichedActiveCredit,
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

// ============================================
// المرحلة 4: دليل الناشر + طلبات التجديد + قائمة الناشرين الغنية
// ============================================

export async function getPublishedGuideSections() {
  return db
    .select({
      id: publisherGuideSections.id,
      title: publisherGuideSections.title,
      content: publisherGuideSections.content,
      displayOrder: publisherGuideSections.displayOrder,
      updatedAt: publisherGuideSections.updatedAt,
    })
    .from(publisherGuideSections)
    .where(eq(publisherGuideSections.isPublished, true))
    .orderBy(publisherGuideSections.displayOrder, publisherGuideSections.createdAt);
}

export async function listGuideSectionsAdmin() {
  return db
    .select()
    .from(publisherGuideSections)
    .orderBy(publisherGuideSections.displayOrder, publisherGuideSections.createdAt);
}

export async function createGuideSection(
  adminId: string,
  data: { title: string; content: string; displayOrder?: number; isPublished?: boolean },
) {
  const [section] = await db
    .insert(publisherGuideSections)
    .values({ ...data, updatedBy: adminId })
    .returning();
  return section;
}

export async function updateGuideSection(
  adminId: string,
  id: string,
  data: Partial<{ title: string; content: string; displayOrder: number; isPublished: boolean }>,
) {
  const [section] = await db
    .update(publisherGuideSections)
    .set({ ...data, updatedBy: adminId, updatedAt: new Date() })
    .where(eq(publisherGuideSections.id, id))
    .returning();
  return section ?? null;
}

export async function deleteGuideSection(id: string) {
  const [deleted] = await db
    .delete(publisherGuideSections)
    .where(eq(publisherGuideSections.id, id))
    .returning({ id: publisherGuideSections.id });
  return !!deleted;
}

/**
 * يزرع الأقسام الافتراضية للدليل — يتخطى أي عنوان موجود مسبقاً (آمن للإعادة).
 */
export async function seedDefaultGuideSections(adminId: string) {
  const existing = await db
    .select({ title: publisherGuideSections.title })
    .from(publisherGuideSections);
  const existingTitles = new Set(existing.map((row) => row.title.trim()));

  const toInsert = PUBLISHER_GUIDE_DEFAULT_SECTIONS.filter(
    (section) => !existingTitles.has(section.title.trim()),
  );

  if (toInsert.length === 0) {
    return {
      inserted: 0,
      skipped: PUBLISHER_GUIDE_DEFAULT_SECTIONS.length,
      sections: [] as Awaited<ReturnType<typeof createGuideSection>>[],
    };
  }

  const inserted = await db
    .insert(publisherGuideSections)
    .values(
      toInsert.map((section) => ({
        title: section.title,
        content: section.content,
        displayOrder: section.displayOrder,
        isPublished: section.isPublished,
        updatedBy: adminId,
      })),
    )
    .returning();

  return {
    inserted: inserted.length,
    skipped: PUBLISHER_GUIDE_DEFAULT_SECTIONS.length - inserted.length,
    sections: inserted,
  };
}

/** إشعار جرس لكل مديري النظام — للأحداث التي تتطلب إجراء إدارياً. */
async function notifyAdmins(payload: { title: string; body: string; deeplink?: string }) {
  try {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.role, "admin"), eq(users.role, "system_admin")));
    for (const admin of admins) {
      await storage.createNotification({
        userId: admin.id,
        type: "publisher_request",
        title: payload.title,
        body: payload.body,
        deeplink: payload.deeplink ?? "/dashboard/admin/publishers",
      });
    }
  } catch (err) {
    console.error("[Publisher Portal] notifyAdmins failed:", err);
  }
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  renewal: "تجديد الباقة",
  window_extension: "تمديد فترة النشر",
  other: "طلب آخر",
};

/** طلب من الناشر للإدارة (تجديد باقة ...) — يمنع تكرار الطلب المفتوح. */
export async function createPublisherRequest(
  publisher: Publisher,
  requestedBy: string,
  data: { type?: string; message?: string },
): Promise<{ ok: true; message: string } | { ok: false; status: number; message: string }> {
  const type = data.type && REQUEST_TYPE_LABELS[data.type] ? data.type : "renewal";

  const [existing] = await db
    .select({ id: publisherRequests.id })
    .from(publisherRequests)
    .where(
      and(
        eq(publisherRequests.publisherId, publisher.id),
        eq(publisherRequests.type, type),
        eq(publisherRequests.status, "open"),
      ),
    )
    .limit(1);
  if (existing) {
    return { ok: false, status: 409, message: "لديكم طلب مفتوح من نفس النوع قيد المعالجة بالفعل" };
  }

  await db.insert(publisherRequests).values({
    publisherId: publisher.id,
    requestedBy,
    type,
    message: data.message?.trim() || null,
  });

  await notifyAdmins({
    title: `طلب ${REQUEST_TYPE_LABELS[type]} من وكالة`,
    body: `«${publisher.agencyName}» أرسلت طلب ${REQUEST_TYPE_LABELS[type]}${data.message ? `: ${data.message.slice(0, 140)}` : ""}`,
    deeplink: `/dashboard/admin/publishers/${publisher.id}`,
  });

  return { ok: true, message: "أُرسل طلبكم للإدارة وسيتم التواصل معكم قريباً" };
}

export type PublisherRequestStatus = "open" | "closed" | "rejected";

/** طلبات الوكالة نفسها — لتعرف أن طلبها وصل وما مصيره. */
export async function listOwnPublisherRequests(publisherId: string) {
  return db
    .select({
      id: publisherRequests.id,
      type: publisherRequests.type,
      message: publisherRequests.message,
      status: publisherRequests.status,
      createdAt: publisherRequests.createdAt,
      handledAt: publisherRequests.handledAt,
      adminNote: publisherRequests.adminNote,
    })
    .from(publisherRequests)
    .where(eq(publisherRequests.publisherId, publisherId))
    .orderBy(desc(publisherRequests.createdAt))
    .limit(20);
}

/**
 * سجل الطلبات. الافتراضي «المفتوحة» فقط كما كان، لكن الإدارة تحتاج أيضاً
 * رؤية المعالج والمرفوض — الطلب كان يختفي بلا أثر بعد إغلاقه.
 */
export async function listPublisherRequests(status: PublisherRequestStatus | "all" = "open") {
  return db
    .select({
      id: publisherRequests.id,
      type: publisherRequests.type,
      message: publisherRequests.message,
      status: publisherRequests.status,
      createdAt: publisherRequests.createdAt,
      handledAt: publisherRequests.handledAt,
      adminNote: publisherRequests.adminNote,
      publisherId: publishers.id,
      agencyName: publishers.agencyName,
      logoUrl: publishers.logoUrl,
    })
    .from(publisherRequests)
    .innerJoin(publishers, eq(publisherRequests.publisherId, publishers.id))
    .where(status === "all" ? undefined : eq(publisherRequests.status, status))
    .orderBy(desc(publisherRequests.createdAt))
    .limit(200);
}

/**
 * معالجة الطلب: موافقة (`closed`) أو رفض (`rejected`).
 * الرفض كان غير موجود إطلاقاً، فكانت الموافقة هي المخرج الوحيد.
 * سبب الرفض يصل الوكالة في الإشعار (لا عمود له في الجدول حتى الآن).
 */
export async function resolvePublisherRequest(
  requestId: string,
  adminId: string,
  action: "close" | "reject",
  note?: string,
) {
  const rejected = action === "reject";
  const trimmedNote = note?.trim() || null;
  const [updated] = await db
    .update(publisherRequests)
    .set({
      status: rejected ? "rejected" : "closed",
      handledBy: adminId,
      handledAt: new Date(),
      adminNote: trimmedNote,
    })
    .where(and(eq(publisherRequests.id, requestId), eq(publisherRequests.status, "open")))
    .returning({ id: publisherRequests.id, requestedBy: publisherRequests.requestedBy, type: publisherRequests.type });

  if (!updated) return false;

  if (updated.requestedBy) {
    const typeLabel = REQUEST_TYPE_LABELS[updated.type] ?? updated.type;
    await notifyPublisherUser(updated.requestedBy, {
      title: rejected ? "لم تتم الموافقة على طلبكم" : "تمت معالجة طلبكم",
      body: rejected
        ? `اعتذرت الإدارة عن طلب ${typeLabel}${trimmedNote ? `: ${trimmedNote}` : " — تواصلوا معنا لمعرفة التفاصيل."}`
        : `أغلقت الإدارة طلب ${typeLabel} — تواصلوا معنا لأي استفسار.`,
      deeplink: "/dashboard/publisher",
    });
  }
  return true;
}

/** حذف نهائي — لطلبات التجربة التي لا قيمة لإبقائها في السجل. */
export async function deletePublisherRequest(requestId: string) {
  const [deleted] = await db
    .delete(publisherRequests)
    .where(eq(publisherRequests.id, requestId))
    .returning({ id: publisherRequests.id });
  return !!deleted;
}

/**
 * حالة الوكالة الواحدة المشتقة. البطاقة كانت تعرض خمس إشارات مستقلة
 * (نشط/موقوف، نشر فوري، الباقة، تاريخ الباقة، تاريخ النافذة) تتناقض فيما
 * بينها — فتظهر شارة خضراء «الباقة: بعد ٣٠٠ يوم» لوكالة موقوفة أصلاً.
 * الترتيب هنا هو أولوية العرض: الأخطر أولاً.
 */
export type PublisherHealth =
  | "suspended"
  | "window_ended"
  | "no_package"
  | "package_expired"
  | "credits_out"
  | "expiring_soon"
  | "healthy";

const EXPIRY_WARNING_DAYS = 7;

function daysUntil(date: Date | string | null | undefined, now: Date): number | null {
  if (!date) return null;
  const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - now.getTime()) / 86_400_000);
}

function derivePublisherHealth(params: {
  isActive: boolean;
  publishingEndsAt: Date | null;
  activeCredit: { isUnlimited: boolean; remainingCredits: number; expiryDate: Date | null } | null;
  hadPackageBefore: boolean;
  now: Date;
}): PublisherHealth {
  const { isActive, publishingEndsAt, activeCredit, hadPackageBefore, now } = params;

  if (!isActive) return "suspended";

  const windowDays = daysUntil(publishingEndsAt, now);
  if (windowDays !== null && windowDays < 0) return "window_ended";

  if (!activeCredit) return hadPackageBefore ? "package_expired" : "no_package";
  if (!activeCredit.isUnlimited && activeCredit.remainingCredits <= 0) return "credits_out";

  const packageDays = daysUntil(activeCredit.expiryDate, now);
  const soonest = [windowDays, packageDays].filter((d): d is number => d !== null);
  if (soonest.length > 0 && Math.min(...soonest) <= EXPIRY_WARNING_DAYS) return "expiring_soon";

  return "healthy";
}

/**
 * قائمة الناشرين الغنية للإدارة: الباقة النشطة وصحتها، آخر نشاط،
 * عدد المواد، والطلبات المفتوحة — بأربعة استعلامات مجمعة لا N+1.
 */
export async function listPublishersRich(opts: { page?: number; limit?: number; isActive?: boolean } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(60, Math.max(1, opts.limit ?? 24));

  const where = opts.isActive === undefined ? undefined : eq(publishers.isActive, opts.isActive);
  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(publishers)
      .where(where)
      .orderBy(desc(publishers.createdAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ count: sql<number>`count(*)` }).from(publishers).where(where),
  ]);

  if (rows.length === 0) return { publishers: [], total: Number(count) || 0, page, limit };
  const ids = rows.map((p) => p.id);
  const now = new Date();

  const [credits, articleAgg, openRequests] = await Promise.all([
    // كل الباقات (لا النشطة فقط) — نحتاج المنتهية أيضاً لنقول «انتهت في …»
    // بدل «لا توجد باقة» التي لا تفرّق بين وكالة جديدة وأخرى انتهى عقدها.
    db
      .select()
      .from(publisherCredits)
      .where(inArray(publisherCredits.publisherId, ids))
      .orderBy(desc(publisherCredits.isUnlimited), desc(publisherCredits.createdAt)),
    db
      .select({
        publisherId: articles.publisherId,
        totalArticles: sql<number>`count(*)`,
        publishedArticles: sql<number>`count(*) filter (where ${articles.status} = 'published')`,
        lastActivityAt: sql<string>`max(coalesce(${articles.publishedAt}, ${articles.createdAt}))`,
      })
      .from(articles)
      .where(inArray(articles.publisherId, ids))
      .groupBy(articles.publisherId),
    db
      .select({
        publisherId: publisherRequests.publisherId,
        openRequests: sql<number>`count(*)`,
      })
      .from(publisherRequests)
      .where(and(inArray(publisherRequests.publisherId, ids), eq(publisherRequests.status, "open")))
      .groupBy(publisherRequests.publisherId),
  ]);

  const isCreditUsable = (credit: typeof credits[number]) =>
    credit.isActive && (!credit.expiryDate || new Date(credit.expiryDate) >= now);

  const activeCreditByPublisher = new Map<string, typeof credits[number]>();
  const lastCreditByPublisher = new Map<string, typeof credits[number]>();
  for (const credit of credits) {
    if (isCreditUsable(credit) && !activeCreditByPublisher.has(credit.publisherId)) {
      activeCreditByPublisher.set(credit.publisherId, credit);
    }
    if (!lastCreditByPublisher.has(credit.publisherId)) {
      lastCreditByPublisher.set(credit.publisherId, credit);
    }
  }
  const articlesByPublisher = new Map(articleAgg.map((a) => [a.publisherId, a]));
  const requestsByPublisher = new Map(openRequests.map((r) => [r.publisherId, Number(r.openRequests) || 0]));

  return {
    publishers: rows.map((publisher) => {
      const credit = activeCreditByPublisher.get(publisher.id) ?? null;
      const lastCredit = lastCreditByPublisher.get(publisher.id) ?? null;
      const agg = articlesByPublisher.get(publisher.id);
      return {
        id: publisher.id,
        agencyName: publisher.agencyName,
        logoUrl: publisher.logoUrl,
        contactPerson: publisher.contactPerson,
        isActive: publisher.isActive,
        autoPublish: publisher.autoPublish,
        publishingEndsAt: publisher.publishingEndsAt,
        createdAt: publisher.createdAt,
        activeCredit: credit
          ? {
              packageName: credit.packageName,
              isUnlimited: credit.isUnlimited,
              totalCredits: credit.totalCredits,
              usedCredits: credit.usedCredits,
              remainingCredits: credit.remainingCredits,
              expiryDate: credit.expiryDate,
            }
          : null,
        lastPackage:
          !credit && lastCredit
            ? {
                packageName: lastCredit.packageName,
                expiryDate: lastCredit.expiryDate,
                cancelled: !lastCredit.isActive,
              }
            : null,
        health: derivePublisherHealth({
          isActive: publisher.isActive,
          publishingEndsAt: publisher.publishingEndsAt,
          activeCredit: credit,
          hadPackageBefore: !!lastCredit,
          now,
        }),
        totalArticles: Number(agg?.totalArticles) || 0,
        publishedArticles: Number(agg?.publishedArticles) || 0,
        lastActivityAt: agg?.lastActivityAt ?? null,
        openRequests: requestsByPublisher.get(publisher.id) ?? 0,
      };
    }),
    total: Number(count) || 0,
    page,
    limit,
  };
}

/**
 * أرقام الترويسة على كل الوكالات لا على الصفحة الحالية — البطاقات القديمة
 * كانت تقول «نشطة (الصفحة)» وهو رقم لا يعني شيئاً للإدارة.
 */
export async function getPublishersSummary() {
  const warningInterval = sql.raw(`interval '${EXPIRY_WARNING_DAYS} days'`);

  /** لا باقة صالحة: منتهية أو ملغاة أو نفدت موادها. */
  const noValidPackageSql = sql`not exists (
    select 1 from ${publisherCredits} pc
    where pc.publisher_id = ${publishers.id}
      and pc.is_active
      and (pc.expiry_date is null or pc.expiry_date >= now())
      and (pc.is_unlimited or pc.remaining_credits > 0)
  )`;

  // الأقواس ضرورية: `NOT` أعلى أولوية من `AND` في Postgres، فبدونها
  // يصبح `not (a and b)` هو `(not a) and b` — شرط لا يتحقق أبداً.
  const windowEndedSql = sql`(${publishers.publishingEndsAt} is not null
    and ${publishers.publishingEndsAt} < now())`;

  const expiringSoonSql = sql`(
    (${publishers.publishingEndsAt} between now() and now() + ${warningInterval})
    or exists (
      select 1 from ${publisherCredits} pc
      where pc.publisher_id = ${publishers.id}
        and pc.is_active
        and pc.expiry_date between now() and now() + ${warningInterval}
    )
  )`;

  const [[counts], [attention], [{ openRequests }]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${publishers.isActive})`,
        suspended: sql<number>`count(*) filter (where not ${publishers.isActive})`,
      })
      .from(publishers),
    db
      .select({
        noValidPackage: sql<number>`count(*) filter (where ${publishers.isActive} and ${noValidPackageSql})`,
        windowEnded: sql<number>`count(*) filter (where ${publishers.isActive} and ${windowEndedSql})`,
        // وكالة واحدة قد تكون بلا باقة وانتهت نافذتها معاً — الجمع الحسابي
        // للرقمين كان يعدّها مرتين ويجعل «تعمل الآن» أقل من الحقيقة.
        needsAttention: sql<number>`count(*) filter (where ${publishers.isActive}
          and (${noValidPackageSql} or ${windowEndedSql}))`,
        expiringSoon: sql<number>`count(*) filter (where ${publishers.isActive}
          and not ${windowEndedSql}
          and not ${noValidPackageSql}
          and ${expiringSoonSql})`,
      })
      .from(publishers),
    db
      .select({ openRequests: sql<number>`count(*)` })
      .from(publisherRequests)
      .where(eq(publisherRequests.status, "open")),
  ]);

  return {
    total: Number(counts?.total) || 0,
    active: Number(counts?.active) || 0,
    suspended: Number(counts?.suspended) || 0,
    noValidPackage: Number(attention?.noValidPackage) || 0,
    windowEnded: Number(attention?.windowEnded) || 0,
    needsAttention: Number(attention?.needsAttention) || 0,
    expiringSoon: Number(attention?.expiringSoon) || 0,
    openRequests: Number(openRequests) || 0,
  };
}

/**
 * طابور مراجعة مواد الوكالات (كل الناشرين): كان الواجهة تستدعي مساراً
 * غير موجود. المعلقة أولاً (الأقدم إرسالاً في الصدارة لعدالة SLA).
 */
export async function listAgencyReviewQueue(opts: { status?: string; page?: number; limit?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));

  const conditions: any[] = [
    or(sql`${articles.publisherId} IS NOT NULL`, sql`${articles.publisherStatus} IS NOT NULL`),
  ];
  if (opts.status && opts.status !== "all") conditions.push(eq(articles.status, opts.status));
  const where = and(...conditions);

  const joinCondition = eq(articles.publisherId, publishers.id);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        status: articles.status,
        publisherStatus: articles.publisherStatus,
        publisherSubmittedAt: articles.publisherSubmittedAt,
        createdAt: articles.createdAt,
        publishedAt: articles.publishedAt,
        authorId: articles.authorId,
        publisherName: publishers.agencyName,
      })
      .from(articles)
      .leftJoin(publishers, joinCondition)
      .where(where)
      .orderBy(
        sql`case when ${articles.status} = 'draft' and ${articles.publisherStatus} = 'pending' then 0 else 1 end`,
        sql`${articles.publisherSubmittedAt} asc nulls last`,
        desc(articles.createdAt),
      )
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(where),
  ]);

  return { articles: rows, total: Number(count) || 0, page, limit };
}

/**
 * الناشر الموثوق (auto_publish وبوابته مفتوحة) يملك قدرة نشر فعلية من
 * المحرر الأساسي دون منح دوره صلاحية articles.publish العامة.
 */
export async function trustedPublisherCanPublish(userId: string, knownGate?: PublishingGate): Promise<boolean> {
  const gate = knownGate ?? await getPublishingGate(userId);
  if (!gate.allowed || !gate.publisher?.autoPublish) return false;
  const { deniedPermissionCodes } = await getUserPermissionData(userId);
  return !deniedPermissionCodes.includes("articles.publish");
}
