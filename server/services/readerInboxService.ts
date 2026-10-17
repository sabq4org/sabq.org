/**
 * صندوق إشعارات القارئ وتفضيلاته — نفس جداول مركز الويب (/notifications و
 * /settings/notifications): notifications_inbox + user_notification_prefs +
 * user_recommendation_prefs. للتطبيقات عبر server/routes/readerInboxMobile.ts.
 *
 * التفضيلات المكشوفة هنا هي التي يقرؤها خادم الإرسال فعلًا فقط:
 * - الملخص اليومي: digestService يختار من user_recommendation_prefs.daily_digest
 *   ثم يتخطى من أطفأ user_notification_prefs.daily_digest، فنضبط العمودين معًا.
 * - أنواع التوصيات الأربعة وساعات الهدوء: recommendationNotificationService.
 * أعمدة breaking/interest/liked_updates/most_read لا تُكشف: دوال
 * notificationEngine التي تقرؤها لا يستدعيها شيء، وإشعارات العاجل والنشر
 * مستبعدة من الصندوق نفسه.
 */
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "../db";
import { notificationsInbox, userNotificationPrefs, userRecommendationPrefs } from "@shared/schema";

/** نفس استبعاد مركز الويب: إشعارات النشر التحريرية ليست إشعارات شخصية. */
export const EDITORIAL_INBOX_TYPES = [
  "ArticlePublished",
  "ReporterArticlePublished",
  "BreakingNews",
  "FeaturedArticle",
];

export interface InboxItem {
  id: string;
  type: string;
  title: string;
  body: string;
  deeplink: string | null;
  read: boolean;
  imageUrl: string | null;
  createdAt: string;
}

const personal = (userId: string) =>
  and(eq(notificationsInbox.userId, userId), notInArray(notificationsInbox.type, EDITORIAL_INBOX_TYPES));

export async function listInbox(
  userId: string,
  limit: number,
  offset: number,
): Promise<{ items: InboxItem[]; unread: number; hasMore: boolean }> {
  const rows = await db
    .select()
    .from(notificationsInbox)
    .where(personal(userId))
    .orderBy(desc(notificationsInbox.createdAt))
    .limit(limit + 1)
    .offset(offset);
  const unread = await countUnread(userId);
  const items = rows.slice(0, limit).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    deeplink: r.deeplink,
    read: r.read,
    imageUrl: typeof r.metadata?.imageUrl === "string" ? r.metadata.imageUrl : null,
    createdAt: r.createdAt.toISOString(),
  }));
  return { items, unread, hasMore: rows.length > limit };
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notificationsInbox)
    .where(and(personal(userId), eq(notificationsInbox.read, false)));
  return row?.n ?? 0;
}

export async function markRead(userId: string, id: string): Promise<boolean> {
  const updated = await db
    .update(notificationsInbox)
    .set({ read: true })
    .where(and(eq(notificationsInbox.id, id), eq(notificationsInbox.userId, userId)))
    .returning({ id: notificationsInbox.id });
  return updated.length > 0;
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notificationsInbox)
    .set({ read: true })
    .where(and(personal(userId), eq(notificationsInbox.read, false)));
}

export async function deleteItem(userId: string, id: string): Promise<boolean> {
  const removed = await db
    .delete(notificationsInbox)
    .where(and(eq(notificationsInbox.id, id), eq(notificationsInbox.userId, userId)))
    .returning({ id: notificationsInbox.id });
  return removed.length > 0;
}

// ---------- التفضيلات ----------

export interface ReaderNotificationPrefs {
  dailyDigest: boolean;
  becauseYouLiked: boolean;
  similarToSaved: boolean;
  withinReads: boolean;
  trendingForYou: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * يقبل الحقول المعروفة فقط بأنواعها؛ ساعات الهدوء HH:MM. لا إلغاء لها:
 * خدمة التوصيات تعامل القيمة الفارغة كـ 22:00–08:00 لا كـ«بلا هدوء».
 */
export function parsePrefsPatch(body: unknown): Partial<ReaderNotificationPrefs> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: Partial<ReaderNotificationPrefs> = {};
  for (const k of ["dailyDigest", "becauseYouLiked", "similarToSaved", "withinReads", "trendingForYou"] as const) {
    if (k in b) {
      if (typeof b[k] !== "boolean") return null;
      out[k] = b[k] as boolean;
    }
  }
  for (const k of ["quietHoursStart", "quietHoursEnd"] as const) {
    if (k in b) {
      const v = b[k];
      if (typeof v !== "string" || !HHMM.test(v)) return null;
      out[k] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function getPrefs(userId: string): Promise<ReaderNotificationPrefs> {
  const [n] = await db.select().from(userNotificationPrefs).where(eq(userNotificationPrefs.userId, userId)).limit(1);
  const [r] = await db.select().from(userRecommendationPrefs).where(eq(userRecommendationPrefs.userId, userId)).limit(1);
  return {
    // الملخص يصل فقط إن كان مفعّلًا في الجدولين (انظر رأس الملف)
    dailyDigest: (r?.dailyDigest ?? false) && (n?.dailyDigest ?? true),
    becauseYouLiked: r?.becauseYouLiked ?? true,
    similarToSaved: r?.similarToSaved ?? true,
    withinReads: r?.withinReads ?? true,
    trendingForYou: r?.trendingForYou ?? true,
    // القيمة الفعّالة كما تقرؤها recommendationNotificationService
    quietHoursStart: n?.quietHoursStart || "22:00",
    quietHoursEnd: n?.quietHoursEnd || "08:00",
  };
}

export async function updatePrefs(
  userId: string,
  patch: Partial<ReaderNotificationPrefs>,
): Promise<ReaderNotificationPrefs> {
  const now = new Date();
  const notif: Partial<typeof userNotificationPrefs.$inferInsert> = {};
  const rec: Partial<typeof userRecommendationPrefs.$inferInsert> = {};
  if (patch.dailyDigest !== undefined) {
    notif.dailyDigest = patch.dailyDigest;
    rec.dailyDigest = patch.dailyDigest;
  }
  if (patch.quietHoursStart !== undefined) notif.quietHoursStart = patch.quietHoursStart;
  if (patch.quietHoursEnd !== undefined) notif.quietHoursEnd = patch.quietHoursEnd;
  for (const k of ["becauseYouLiked", "similarToSaved", "withinReads", "trendingForYou"] as const) {
    if (patch[k] !== undefined) rec[k] = patch[k];
  }

  if (Object.keys(notif).length > 0) {
    await db
      .insert(userNotificationPrefs)
      .values({ userId, ...notif, updatedAt: now })
      .onConflictDoUpdate({ target: userNotificationPrefs.userId, set: { ...notif, updatedAt: now } });
  }
  if (Object.keys(rec).length > 0) {
    await db
      .insert(userRecommendationPrefs)
      .values({ userId, ...rec, updatedAt: now })
      .onConflictDoUpdate({ target: userRecommendationPrefs.userId, set: { ...rec, updatedAt: now } });
  }
  return getPrefs(userId);
}
