// مركز تنبيهات «مكتب سبق» (2026-10-29): تسجيل أحداث التغريدات ومقالات الرأي
// وأخبار «نشر سبق» في staff_desk_events، وقراءتها بالصلاحيات الحية لكل عضو.
//
// التسجيل لا يرمي أبداً ولا يؤخّر الفعل الأصلي: فشل الكتابة (أو غياب الجدول
// قبل تشغيل الترحيل) يُسجَّل في السجل فقط.
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, publishers, staffDeskEvents, systemSettings, users } from "@shared/schema";
import {
  STAFF_DESK_EVENTS_WINDOW_DAYS,
  STAFF_DESK_EVENT_LABELS,
  STAFF_DESK_UNREAD_CAP,
  botDraftsPublisherDisplayName,
  buildStaffDeskEventDetail,
  clipStaffDeskTitle,
  decodeStaffDeskEventCursor,
  encodeStaffDeskEventCursor,
  staffDeskEventCategory,
  staffDeskEventDedupeKey,
  staffDeskEventDeeplink,
  visibleStaffDeskCategories,
  type StaffDeskEventCategory,
  type StaffDeskEventKind,
  type StaffDeskNotification,
  type StaffDeskNotificationsResponse,
  type StaffDeskUnreadResponse,
} from "@shared/staffNotifications";
import type { StaffCapabilities } from "@shared/staffApp";

const LOG_PREFIX = "[StaffDeskEvents]";
const SEEN_KEY_PREFIX = "staff_app.notif_seen:";
const SITE_ORIGIN = "https://sabq.org";

export class StaffDeskEventsCursorError extends Error {}

// ── التسجيل ────────────────────────────────────────────────────────────

let missingTableLogged = false;

export interface RecordStaffDeskEventInput {
  kind: StaffDeskEventKind;
  targetId: string;
  title: string;
  actorName?: string | null;
  actorUserId?: string | null;
  linkUrl?: string | null;
  scheduledAt?: Date | null;
  at?: Date;
}

/** يسجل الحدث مرة واحدة (مفتاح منع التكرار). يعيد true إن كان جديداً. لا يرمي. */
export async function recordStaffDeskEvent(input: RecordStaffDeskEventInput): Promise<boolean> {
  try {
    const title = clipStaffDeskTitle(input.title || "");
    if (!input.targetId || !title) return false;
    const rows = await db
      .insert(staffDeskEvents)
      .values({
        kind: input.kind,
        category: staffDeskEventCategory(input.kind),
        title,
        actorName: input.actorName?.trim() || null,
        actorUserId: input.actorUserId ?? null,
        targetId: input.targetId,
        linkUrl: input.linkUrl ?? null,
        scheduledAt: input.scheduledAt ?? null,
        dedupeKey: staffDeskEventDedupeKey(input),
        ...(input.at ? { createdAt: input.at } : {}),
      })
      .onConflictDoNothing({ target: staffDeskEvents.dedupeKey })
      .returning({ id: staffDeskEvents.id });
    return rows.length > 0;
  } catch (err: any) {
    if (err?.code === "42P01" || err?.cause?.code === "42P01") {
      if (!missingTableLogged) {
        missingTableLogged = true;
        console.warn(`${LOG_PREFIX} جدول staff_desk_events غير موجود بعد — شغّل migrations/20261029_staff_desk_events.sql`);
      }
      return false;
    }
    console.error(`${LOG_PREFIX} تعذر تسجيل الحدث ${input.kind}:`, err);
    return false;
  }
}

/** الاسم المعروض لعضو: الاسم الأول والأخير، وإلا null. لا يرمي. */
export async function resolveStaffDeskUserName(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const [row] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const name = [row?.firstName, row?.lastName].filter(Boolean).join(" ").trim();
    return name || null;
  } catch {
    return null;
  }
}

async function resolvePublisherName(publisherId: string | null | undefined): Promise<string | null> {
  if (!publisherId) return null;
  try {
    const [row] = await db
      .select({ agencyName: publishers.agencyName })
      .from(publishers)
      .where(eq(publishers.id, publisherId))
      .limit(1);
    return row?.agencyName?.trim() || null;
  } catch {
    return null;
  }
}

interface TweetLike {
  id: string;
  text: string;
  createdByUserId: string | null;
  publisherId?: string | null;
  scheduledAt?: Date | null;
}

export async function recordTweetDraftEvent(post: TweetLike): Promise<void> {
  const actorName =
    (await resolvePublisherName(post.publisherId)) ?? (await resolveStaffDeskUserName(post.createdByUserId));
  await recordStaffDeskEvent({
    kind: "tweet_draft",
    targetId: post.id,
    title: post.text,
    actorName,
    actorUserId: post.createdByUserId,
  });
}

export async function recordTweetScheduledEvent(post: TweetLike, actorUserId?: string | null): Promise<void> {
  await recordStaffDeskEvent({
    kind: "tweet_scheduled",
    targetId: post.id,
    title: post.text,
    actorName: await resolveStaffDeskUserName(actorUserId),
    actorUserId: actorUserId ?? null,
    scheduledAt: post.scheduledAt ?? null,
  });
}

/** actorUserId غائب = نشرها العامل في موعدها. */
export async function recordTweetPublishedEvent(post: TweetLike, actorUserId?: string | null): Promise<void> {
  await recordStaffDeskEvent({
    kind: "tweet_published",
    targetId: post.id,
    title: post.text,
    actorName: await resolveStaffDeskUserName(actorUserId),
    actorUserId: actorUserId ?? null,
  });
}

export async function recordOpinionDraftEvent(input: {
  articleId: string;
  title: string;
  authorId: string | null;
  authorName?: string | null;
}): Promise<void> {
  await recordStaffDeskEvent({
    kind: "opinion_draft",
    targetId: input.articleId,
    title: input.title,
    actorName: input.authorName ?? (await resolveStaffDeskUserName(input.authorId)),
    actorUserId: input.authorId,
  });
}

export async function recordOpinionScheduledEvent(input: {
  articleId: string;
  title: string;
  authorId: string | null;
  scheduledAt: Date;
}): Promise<void> {
  await recordStaffDeskEvent({
    kind: "opinion_scheduled",
    targetId: input.articleId,
    title: input.title,
    actorName: await resolveStaffDeskUserName(input.authorId),
    actorUserId: input.authorId,
    scheduledAt: input.scheduledAt,
  });
}

export function publishedArticleUrl(article: { slug: string; englishSlug?: string | null }): string {
  const slug = article.englishSlug || article.slug;
  return `${SITE_ORIGIN}/article/${encodeURIComponent(slug)}`;
}

/**
 * خبر نُشر من تطبيق «نشر سبق»: يُسجَّل في الخط الزمني ثم يُرسل إشعار الديسك
 * لمن يملك articles.publish (عدا الناشر نفسه). لا يرمي.
 */
export async function recordPublisherNewsEvent(input: {
  article: { id: string; title: string; slug: string; englishSlug?: string | null };
  publisherName: string | null;
  publisherUserId: string | null;
  /** حساب وكالة: يُعرض اسم الوكالة بدل اسم صاحب التوكن. */
  publisherId?: string | null;
}): Promise<void> {
  const linkUrl = publishedArticleUrl(input.article);
  const publisherName = (await resolvePublisherName(input.publisherId)) ?? input.publisherName;
  const created = await recordStaffDeskEvent({
    kind: "news_published",
    targetId: input.article.id,
    title: input.article.title,
    actorName: publisherName,
    actorUserId: input.publisherUserId,
    linkUrl,
  });
  if (!created) return;
  try {
    const { notifyStaffDeskOfPublisherNews } = await import("./staffAppPushService");
    await notifyStaffDeskOfPublisherNews({
      articleId: input.article.id,
      title: input.article.title,
      publisherName,
      excludeUserId: input.publisherUserId,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} إشعار خبر «نشر سبق» فشل:`, err);
  }
}

/**
 * مسودة بوت (نشر سبق، قروك…) نُشرت من مسار آخر غير API البوت: محرر لوحة التحكم
 * (ومنه «فتح في المحرر» داخل تطبيق «نشر سبق»)، أو النشر المجدول. يُستدعى عند كل
 * حدث `published` من notifyArticleStakeholders. يتجاهل ما ليس من بوت، ومنع
 * التكرار يجعل النشر عبر API البوت (المسجَّل أصلاً) لا يتكرر. لا يرمي.
 */
export async function recordBotDraftPublishedElsewhere(articleId: string): Promise<void> {
  try {
    const [row] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        englishSlug: articles.englishSlug,
        status: articles.status,
        source: articles.source,
        sourceMetadata: articles.sourceMetadata,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);
    if (!row || row.status !== "published") return;
    const meta = row.sourceMetadata;
    if (row.source !== "bot" && meta?.type !== "bot") return;
    let publisherId: string | null = null;
    if (meta?.publisherOwnerUserId) {
      const [agency] = await db
        .select({ id: publishers.id })
        .from(publishers)
        .where(eq(publishers.userId, meta.publisherOwnerUserId))
        .limit(1);
      publisherId = agency?.id ?? null;
    }
    const personName = await resolveStaffDeskUserName(meta?.publisherUserId);
    await recordPublisherNewsEvent({
      article: row,
      publisherName: personName ?? (meta?.bot ? botDraftsPublisherDisplayName(meta.bot) : null),
      publisherUserId: meta?.publisherUserId ?? null,
      publisherId,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} تسجيل خبر البوت المنشور من المحرر فشل:`, err);
  }
}

// ── القراءة ────────────────────────────────────────────────────────────

function seenKey(userId: string): string {
  return `${SEEN_KEY_PREFIX}${userId}`;
}

interface SeenState {
  seenAt: Date | null;
  /** تنبيهات فتحها العضو بعد آخر «تعليم الكل كمقروء» (أحدث 200). */
  readIds: string[];
}

const MAX_READ_IDS = 200;

async function getSeenState(userId: string): Promise<SeenState> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, seenKey(userId)))
    .limit(1);
  const value = (row?.value ?? {}) as { seenAt?: unknown; readIds?: unknown };
  const date = typeof value.seenAt === "string" ? new Date(value.seenAt) : null;
  const readIds = Array.isArray(value.readIds)
    ? value.readIds.filter((id): id is string => typeof id === "string").slice(-MAX_READ_IDS)
    : [];
  return { seenAt: date && !Number.isNaN(date.getTime()) ? date : null, readIds };
}

async function saveSeenState(userId: string, state: { seenAt: string | null; readIds: string[] }, now: Date) {
  await db
    .insert(systemSettings)
    .values({ key: seenKey(userId), value: state, category: "staff_app", isPublic: false })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: state, updatedAt: now } });
}

function notReadSql(readIds: string[]) {
  return readIds.length === 0 ? sql`true` : sql`${staffDeskEvents.id} not in (${sql.join(readIds.map((id) => sql`${id}`), sql`, `)})`;
}

function windowStart(now: Date): Date {
  return new Date(now.getTime() - STAFF_DESK_EVENTS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** حد «جديد»: آخر زيارة، وأول مرة = آخر 24 ساعة. */
function unreadSince(seenAt: Date | null, now: Date): Date {
  return seenAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

function toNotification(
  row: typeof staffDeskEvents.$inferSelect,
  since: Date,
  readIds: Set<string>,
  now: Date,
): StaffDeskNotification {
  const kind = row.kind as StaffDeskEventKind;
  const labels = STAFF_DESK_EVENT_LABELS[kind] ?? { label: row.kind, action: "فتح" };
  return {
    id: row.id,
    kind,
    category: row.category as StaffDeskEventCategory,
    label: labels.label,
    actionLabel: labels.action,
    title: row.title,
    detail: buildStaffDeskEventDetail({ kind, actorName: row.actorName, scheduledAt: row.scheduledAt }, now),
    actorName: row.actorName,
    targetId: row.targetId,
    linkUrl: row.linkUrl,
    deeplink: staffDeskEventDeeplink(kind, row.targetId),
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    isUnread: row.createdAt.getTime() > since.getTime() && !readIds.has(row.id),
  };
}

export async function listStaffDeskNotifications(
  caps: StaffCapabilities,
  userId: string,
  query: { category: "all" | StaffDeskEventCategory; cursor?: string; limit: number },
  now: Date = new Date(),
): Promise<StaffDeskNotificationsResponse> {
  const categories = visibleStaffDeskCategories(caps);
  const empty = { all: 0, tweet: 0, opinion: 0, news: 0 };
  const seen = await getSeenState(userId).catch((): SeenState => ({ seenAt: null, readIds: [] }));
  const seenAt = seen.seenAt;
  if (categories.length === 0) {
    return { items: [], nextCursor: null, categories, counts: empty, unreadCount: 0, seenAt: seenAt?.toISOString() ?? null };
  }

  const cursor = query.cursor ? decodeStaffDeskEventCursor(query.cursor) : null;
  if (query.cursor && !cursor) throw new StaffDeskEventsCursorError("مؤشر الصفحة غير صالح");

  const shown =
    query.category === "all" ? categories : categories.filter((c) => c === query.category);
  const start = windowStart(now);
  const since = unreadSince(seenAt, now);

  const items =
    shown.length === 0
      ? []
      : await db
          .select()
          .from(staffDeskEvents)
          .where(
            and(
              inArray(staffDeskEvents.category, shown),
              gte(staffDeskEvents.createdAt, start),
              cursor
                ? or(
                    lt(staffDeskEvents.createdAt, new Date(cursor.createdAt)),
                    and(
                      eq(staffDeskEvents.createdAt, new Date(cursor.createdAt)),
                      lt(staffDeskEvents.id, cursor.id),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(staffDeskEvents.createdAt), desc(staffDeskEvents.id))
          .limit(query.limit + 1);

  const page = items.slice(0, query.limit);
  const last = page[page.length - 1];
  const nextCursor =
    items.length > query.limit && last
      ? encodeStaffDeskEventCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null;

  const countRows = await db
    .select({
      category: staffDeskEvents.category,
      total: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) filter (where ${staffDeskEvents.createdAt} > ${since} and ${notReadSql(seen.readIds)})::int`,
    })
    .from(staffDeskEvents)
    .where(and(inArray(staffDeskEvents.category, categories), gte(staffDeskEvents.createdAt, start)))
    .groupBy(staffDeskEvents.category);

  const counts = { ...empty };
  let unread = 0;
  for (const row of countRows) {
    const key = row.category as StaffDeskEventCategory;
    if (key in counts) counts[key] = Number(row.total) || 0;
    unread += Number(row.unread) || 0;
  }
  counts.all = counts.tweet + counts.opinion + counts.news;

  return {
    items: page.map((row) => toNotification(row, since, new Set(seen.readIds), now)),
    nextCursor,
    categories,
    counts,
    unreadCount: Math.min(unread, STAFF_DESK_UNREAD_CAP),
    seenAt: seenAt?.toISOString() ?? null,
  };
}

/** رقم الجرس وآخر تنبيه (سطر «آخر تنبيه» في الرئيسية). */
export async function getStaffDeskUnread(
  caps: StaffCapabilities,
  userId: string,
  now: Date = new Date(),
): Promise<StaffDeskUnreadResponse> {
  const categories = visibleStaffDeskCategories(caps);
  if (categories.length === 0) return { unreadCount: 0, latest: null };
  const seen = await getSeenState(userId).catch((): SeenState => ({ seenAt: null, readIds: [] }));
  const since = unreadSince(seen.seenAt, now);
  const start = windowStart(now);
  const [[countRow], [latestRow]] = await Promise.all([
    db
      .select({ unread: sql<number>`count(*)::int` })
      .from(staffDeskEvents)
      .where(
        and(
          inArray(staffDeskEvents.category, categories),
          // نافذة المركز نفسها: لا يُحسب على الجرس ما لا يظهر في القائمة.
          gte(staffDeskEvents.createdAt, start),
          sql`${staffDeskEvents.createdAt} > ${since}`,
          notReadSql(seen.readIds),
        ),
      ),
    db
      .select()
      .from(staffDeskEvents)
      .where(and(inArray(staffDeskEvents.category, categories), gte(staffDeskEvents.createdAt, start)))
      .orderBy(desc(staffDeskEvents.createdAt), desc(staffDeskEvents.id))
      .limit(1),
  ]);
  return {
    unreadCount: Math.min(Number(countRow?.unread) || 0, STAFF_DESK_UNREAD_CAP),
    latest: latestRow ? toNotification(latestRow, since, new Set(seen.readIds), now) : null,
  };
}

/** «تعليم الكل كمقروء»: كل ما قبل الآن مقروء، وتُفرَّغ قائمة المقروء فرادى. */
export async function markStaffDeskNotificationsSeen(userId: string, now: Date = new Date()): Promise<string> {
  const seenAt = now.toISOString();
  await saveSeenState(userId, { seenAt, readIds: [] }, now);
  return seenAt;
}

/** فتح تنبيه واحد يعلّمه مقروءاً دون غيره. */
// تحديث ذري في قاعدة البيانات: طلبا قراءة متزامنان (أو قراءة مع «تعليم الكل») لا يلغي أحدهما الآخر،
// لأن هذا المسار يلمس readIds وحدها ويبقي seenAt كما هي في الصف لحظة الكتابة.
export async function markStaffDeskNotificationRead(userId: string, eventId: string, now: Date = new Date()): Promise<void> {
  const key = seenKey(userId);
  const initial = JSON.stringify({ seenAt: null, readIds: [eventId] });
  await db.execute(sql`
    INSERT INTO system_settings (key, value, category, is_public)
    VALUES (${key}, ${initial}::jsonb, 'staff_app', false)
    ON CONFLICT (key) DO UPDATE SET
      value = jsonb_set(
        system_settings.value,
        '{readIds}',
        (
          SELECT COALESCE(jsonb_agg(t.id ORDER BY t.ord), '[]'::jsonb)
          FROM (
            SELECT e.id, e.ord
            FROM jsonb_array_elements(
              (CASE WHEN jsonb_typeof(system_settings.value->'readIds') = 'array'
                    THEN system_settings.value->'readIds' ELSE '[]'::jsonb END)
              - ${eventId}::text
              || jsonb_build_array(${eventId}::text)
            ) WITH ORDINALITY AS e(id, ord)
            ORDER BY e.ord DESC
            LIMIT ${MAX_READ_IDS}
          ) t
        ),
        true
      ),
      updated_at = ${now}
  `);
}
