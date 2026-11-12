// مركز تنبيهات «مكتب سبق» (2026-10-29): تسجيل أحداث التغريدات ومقالات الرأي
// وأخبار «نشر سبق» في staff_desk_events، وقراءتها بالصلاحيات الحية لكل عضو.
//
// التسجيل لا يرمي أبداً ولا يؤخّر الفعل الأصلي: فشل الكتابة (أو غياب الجدول
// قبل تشغيل الترحيل) يُسجَّل في السجل فقط.
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  articleEditRequests,
  articles,
  opinionTickets,
  publishers,
  socialPostBotKeys,
  socialPosts,
  staffDeskEvents,
  systemSettings,
  users,
} from "@shared/schema";
import {
  STAFF_DESK_EVENTS_WINDOW_DAYS,
  STAFF_DESK_EVENT_CATEGORIES,
  STAFF_DESK_EVENT_LABELS,
  STAFF_DESK_UNREAD_CAP,
  botDraftsPublisherDisplayName,
  buildStaffDeskEventDetail,
  buildStaffDeskEventSource,
  buildStaffDeskEventTrail,
  staffDeskActorRole,
  resolveStaffDeskActorKind,
  clipStaffDeskTitle,
  decodeStaffDeskEventCursor,
  encodeStaffDeskEventCursor,
  staffDeskEventCategory,
  staffDeskEventDedupeKey,
  staffDeskEventIsDecisionKind,
  staffDeskEventDeeplink,
  staffDeskIncludesMessages,
  visibleStaffDeskCategories,
  type StaffDeskEventCategory,
  type StaffDeskEventKind,
  type StaffDeskNotification,
  type StaffDeskNotificationsResponse,
  type StaffDeskUnreadResponse,
} from "@shared/staffNotifications";
import { safeStaffAvatarUrl, type StaffCapabilities } from "@shared/staffApp";

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

/** اسم البوت المعروض إن كانت التغريدة من API البوت (social_post_bot_keys)، وإلا null. لا يرمي. */
async function resolveTweetBotName(postId: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ botName: socialPostBotKeys.botName })
      .from(socialPostBotKeys)
      .where(eq(socialPostBotKeys.postId, postId))
      .limit(1);
    return row?.botName ? botDraftsPublisherDisplayName(row.botName) : null;
  } catch {
    return null;
  }
}

/** إشعار «للعلم» بعد تسجيل حدث جديد (بوت → نشاط البوتات، غيره → متابعة النشر). لا يرمي. */
async function pushFollowEvent(input: {
  event: "tweet_scheduled" | "tweet_published" | "opinion_scheduled";
  targetId: string;
  title: string;
  actorName: string | null;
  actorUserId: string | null;
  scheduledAt?: Date | null;
}): Promise<void> {
  try {
    const botName = input.event === "opinion_scheduled" ? null : await resolveTweetBotName(input.targetId);
    const { notifyStaffDeskOfFollowEvent } = await import("./staffAppPushService");
    await notifyStaffDeskOfFollowEvent({
      event: input.event,
      targetId: input.targetId,
      title: input.title,
      detail:
        buildStaffDeskEventDetail({
          kind: input.event,
          // تغريدة البوت تُنسب للبوت في العنوان، لا لحساب الخدمة الذي يكتب باسمه.
          actorName: botName ? null : input.actorName,
          scheduledAt: input.scheduledAt ?? null,
        }) || null,
      botName,
      excludeUserId: botName ? null : input.actorUserId,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} إشعار المتابعة ${input.event} فشل:`, err);
  }
}

export async function recordTweetScheduledEvent(post: TweetLike, actorUserId?: string | null): Promise<void> {
  const actorName = await resolveStaffDeskUserName(actorUserId);
  const created = await recordStaffDeskEvent({
    kind: "tweet_scheduled",
    targetId: post.id,
    title: post.text,
    actorName,
    actorUserId: actorUserId ?? null,
    scheduledAt: post.scheduledAt ?? null,
  });
  if (!created) return;
  await pushFollowEvent({
    event: "tweet_scheduled",
    targetId: post.id,
    title: post.text,
    actorName,
    actorUserId: actorUserId ?? null,
    scheduledAt: post.scheduledAt ?? null,
  });
}

/** actorUserId غائب = نشرها العامل في موعدها. */
export async function recordTweetPublishedEvent(post: TweetLike, actorUserId?: string | null): Promise<void> {
  const actorName = await resolveStaffDeskUserName(actorUserId);
  const created = await recordStaffDeskEvent({
    kind: "tweet_published",
    targetId: post.id,
    title: post.text,
    actorName,
    actorUserId: actorUserId ?? null,
  });
  if (!created) return;
  await pushFollowEvent({
    event: "tweet_published",
    targetId: post.id,
    title: post.text,
    actorName,
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
  const actorName = await resolveStaffDeskUserName(input.authorId);
  const created = await recordStaffDeskEvent({
    kind: "opinion_scheduled",
    targetId: input.articleId,
    title: input.title,
    actorName,
    actorUserId: input.authorId,
    scheduledAt: input.scheduledAt,
  });
  if (!created) return;
  // actorUserId هنا كاتب المقال لا من جدوله، فلا يُستثنى أحد من فريق الرأي.
  await pushFollowEvent({
    event: "opinion_scheduled",
    targetId: input.articleId,
    title: input.title,
    actorName,
    actorUserId: null,
    scheduledAt: input.scheduledAt,
  });
}

/**
 * مسودة خبر أضافها بوت وتنتظر قرار محرر (2026-11-10): تُسجَّل مرة واحدة لكل
 * مسودة ثم يُرسل إشعار «نشاط البوتات». لا يرمي.
 */
export async function recordBotNewsDraftEvent(input: {
  articleId: string;
  title: string;
  botName: string | null;
  actorUserId?: string | null;
}): Promise<void> {
  const created = await recordStaffDeskEvent({
    kind: "news_bot_draft",
    targetId: input.articleId,
    title: input.title,
    actorName: input.botName,
    actorUserId: input.actorUserId ?? null,
  });
  if (!created) return;
  try {
    const { notifyStaffDeskOfBotDraft } = await import("./staffAppPushService");
    await notifyStaffDeskOfBotDraft({
      articleId: input.articleId,
      title: input.title,
      botName: input.botName,
      excludeUserId: input.actorUserId ?? null,
    });
  } catch (err) {
    console.error(`${LOG_PREFIX} إشعار مسودة البوت فشل:`, err);
  }
}

/** خبر مراسل بانتظار القرار أو طلب تعديل: أثر في الجرس (الإشعار يرسله notifyStaffDeskOfNewsItem). لا يرمي. */
export async function recordNewsDeskItemEvent(input: {
  kind: "draft" | "edit_request";
  articleId: string;
  requestId?: string | null;
  title: string;
  senderName: string | null;
  senderId?: string | null;
}): Promise<void> {
  const isRequest = input.kind === "edit_request";
  if (isRequest && !input.requestId) return;
  await recordStaffDeskEvent({
    kind: isRequest ? "news_edit_request" : "news_draft",
    targetId: isRequest ? input.requestId! : input.articleId,
    title: input.title,
    actorName: input.senderName,
    actorUserId: input.senderId ?? null,
  });
}

/** رسالة أو استفسار من كاتب: أثر في تبويب «رسائل» (الإشعار يرسله notifyDeskOfWriterInquiry). لا يرمي. */
export async function recordTicketMessageEvent(input: {
  ticketId: string;
  title: string;
  writerName: string | null;
  senderId?: string | null;
  at?: Date;
}): Promise<void> {
  await recordStaffDeskEvent({
    kind: "ticket_message",
    targetId: input.ticketId,
    title: input.title,
    actorName: input.writerName,
    actorUserId: input.senderId ?? null,
    at: input.at,
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
  // بلا صاحب توكن ولا وكالة = بوت بتوكن البيئة (قروك…): يتبع مفتاح «نشاط البوتات».
  const fromBot = !input.publisherUserId && !input.publisherId;
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
      fromBot,
      linkUrl,
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
  /** «مسح الكل» لكل فئة: ما سُجّل حتى هذا الوقت لا يظهر لهذا العضو (2026-11-10). */
  clearedAt: Partial<Record<StaffDeskEventCategory, Date>>;
  /** تنبيهات مسحها العضو فرادى (أحدث 300). */
  clearedIds: string[];
}

// الصف مادة كاملة (حتى 50 حدثاً)، فالسقف أكبر مما كان لحدث واحد.
const MAX_READ_IDS = 1000;
const MAX_CLEARED_IDS = 1000;
const EMPTY_SEEN: SeenState = { seenAt: null, readIds: [], clearedAt: {}, clearedIds: [] };

/** يقرأ القيمة المخزنة؛ أي حقل تالف يُهمل. دالة نقية للاختبار. */
export function parseStaffDeskSeenState(raw: unknown): SeenState {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const date = typeof value.seenAt === "string" ? new Date(value.seenAt) : null;
  const ids = (list: unknown, max: number) =>
    Array.isArray(list) ? list.filter((id): id is string => typeof id === "string").slice(-max) : [];
  const clearedAt: SeenState["clearedAt"] = {};
  const cleared = value.cleared && typeof value.cleared === "object" ? (value.cleared as Record<string, unknown>) : {};
  for (const category of STAFF_DESK_EVENT_CATEGORIES) {
    const at = typeof cleared[category] === "string" ? new Date(cleared[category] as string) : null;
    if (at && !Number.isNaN(at.getTime())) clearedAt[category] = at;
  }
  return {
    seenAt: date && !Number.isNaN(date.getTime()) ? date : null,
    readIds: ids(value.readIds, MAX_READ_IDS),
    clearedAt,
    clearedIds: ids(value.clearedIds, MAX_CLEARED_IDS),
  };
}

async function getSeenState(userId: string): Promise<SeenState> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, seenKey(userId)))
    .limit(1);
  return parseStaffDeskSeenState(row?.value);
}

/** يدمج الحقول المرسلة في الصف ذرياً، فيبقى ما مسحه العضو عند «تعليم الكل كمقروء» والعكس. */
async function mergeSeenState(userId: string, patch: Record<string, unknown>, now: Date) {
  await db
    .insert(systemSettings)
    .values({ key: seenKey(userId), value: patch, category: "staff_app", isPublic: false })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value: sql`(CASE WHEN jsonb_typeof(${systemSettings.value}) = 'object' THEN ${systemSettings.value} ELSE '{}'::jsonb END) || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: now,
      },
    });
}

/** يستبعد ما مسحه العضو: فرادى، أو كل ما سبق «مسح الكل» في فئته. */
function notClearedSql(seen: SeenState) {
  const parts = [];
  if (seen.clearedIds.length > 0) {
    parts.push(sql`${staffDeskEvents.id} not in (${sql.join(seen.clearedIds.map((id) => sql`${id}`), sql`, `)})`);
  }
  for (const category of STAFF_DESK_EVENT_CATEGORIES) {
    const at = seen.clearedAt[category];
    if (at) parts.push(sql`not (${staffDeskEvents.category} = ${category} and ${staffDeskEvents.createdAt} <= ${at})`);
  }
  return parts.length === 0 ? sql`true` : sql.join(parts, sql` and `);
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

/** ما لا يُعرف من صف الحدث وحده: بوت التغريدة، وهل ما زال الهدف ينتظر قراراً. */
interface NotificationContext {
  /** postId → اسم البوت المعروض. */
  tweetBots: Map<string, string>;
  /** معرّفات الأحداث التي حُسم هدفها؛ null = تعذّر الفحص فيُكتفى بالنوع. */
  settled: Set<string> | null;
  /** userId → صورة الحساب. */
  userAvatars: Map<string, string>;
  /** اسم الوكالة (مقصوص الأطراف) → شعارها أو null. */
  agencies: Map<string, string | null>;
}

const EMPTY_CONTEXT: NotificationContext = {
  tweetBots: new Map(),
  settled: null,
  userAvatars: new Map(),
  agencies: new Map(),
};

type EventRow = typeof staffDeskEvents.$inferSelect;

/**
 * المادة الواحدة صف واحد (2026-11-12): آخر أحداثها يحدد العنوان والحالة
 * والمعرّف، وأول أحداثها يحدد صاحبها وصورته. `group` بترتيب زمني تصاعدي.
 */
function toNotification(
  group: readonly EventRow[],
  since: Date,
  readIds: Set<string>,
  now: Date,
  context: NotificationContext = EMPTY_CONTEXT,
): StaffDeskNotification {
  const row = group[group.length - 1];
  const origin = group[0];
  const kind = row.kind as StaffDeskEventKind;
  const originKind = origin.kind as StaffDeskEventKind;
  const labels = STAFF_DESK_EVENT_LABELS[kind] ?? { label: row.kind, action: "فتح" };
  const tweetBotName = row.category === "tweet" ? context.tweetBots.get(row.targetId) ?? null : null;
  const originKey = origin.actorName?.trim() ?? "";
  const actorKind = resolveStaffDeskActorKind({
    kind: originKind,
    actorName: origin.actorName,
    actorUserId: origin.actorUserId,
    tweetBotName,
    isAgency: Boolean(originKey && context.agencies.has(originKey)),
  });
  const rawActor = tweetBotName ?? origin.actorName;
  const actorName = actorKind === "bot" && rawActor ? botDraftsPublisherDisplayName(rawActor) : rawActor;
  const actorAvatarUrl =
    actorKind === "agency"
      ? context.agencies.get(originKey) ?? null
      : actorKind === "person" && origin.actorUserId
        ? context.userAvatars.get(origin.actorUserId) ?? null
        : null;
  // للنسخ الأقدم من التطبيق: سطر المصدر يصف آخر حدث كما كان.
  const latestKey = row.actorName?.trim() ?? "";
  const latestKind = resolveStaffDeskActorKind({
    kind,
    actorName: row.actorName,
    actorUserId: row.actorUserId,
    tweetBotName,
    isAgency: Boolean(latestKey && context.agencies.has(latestKey)),
  });
  return {
    id: row.id,
    kind,
    category: row.category as StaffDeskEventCategory,
    label: labels.label,
    actionLabel: labels.action,
    title: row.title,
    detail: buildStaffDeskEventDetail({ kind, actorName: row.actorName, scheduledAt: row.scheduledAt }, now),
    actorName,
    targetId: row.targetId,
    linkUrl: row.linkUrl,
    deeplink: staffDeskEventDeeplink(kind, row.targetId),
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    isUnread: group.some((e) => e.createdAt.getTime() > since.getTime() && !readIds.has(e.id)),
    actorKind,
    actorAvatarUrl,
    needsDecision: staffDeskEventIsDecisionKind(kind) && !context.settled?.has(row.id),
    source: buildStaffDeskEventSource(
      { kind, actorName: tweetBotName ?? row.actorName, actorKind: latestKind, scheduledAt: row.scheduledAt },
      now,
    ),
    actorRole: staffDeskActorRole(originKind, actorKind),
    trail: buildStaffDeskEventTrail(
      group.map((e) => ({
        kind: e.kind as StaffDeskEventKind,
        // تغريدة البوت تُكتب باسم حساب خدمة: المرحلة تُنسب للبوت.
        actorName: actorKind === "bot" && e.category === "tweet" ? actorName : e.actorName,
        createdAt: e.createdAt,
        scheduledAt: e.scheduledAt,
      })),
      actorName,
      now,
    ),
    stageCount: group.length,
  };
}

/** كل أحداث المواد الظاهرة في الصفحة (بترتيب زمني)، مجمّعة بالمادة. لا يرمي. */
async function loadTargetGroups(
  page: readonly EventRow[],
  seen: SeenState,
  start: Date,
): Promise<Map<string, EventRow[]>> {
  const groups = new Map<string, EventRow[]>();
  const key = (r: Pick<EventRow, "category" | "targetId">) => `${r.category}:${r.targetId}`;
  for (const row of page) groups.set(key(row), []);
  const targetIds = [...new Set(page.map((r) => r.targetId))];
  if (targetIds.length > 0) {
    try {
      const rows = await db
        .select()
        .from(staffDeskEvents)
        .where(
          and(
            inArray(staffDeskEvents.targetId, targetIds),
            gte(staffDeskEvents.createdAt, start),
            notClearedSql(seen),
          ),
        )
        .orderBy(staffDeskEvents.createdAt, staffDeskEvents.id);
      for (const row of rows) groups.get(key(row))?.push(row);
    } catch (err) {
      console.error(`${LOG_PREFIX} تعذر جلب مراحل التنبيهات:`, err);
    }
  }
  // الصف نفسه آخر المراحل دائماً، حتى لو فشل الجلب.
  for (const row of page) {
    const group = groups.get(key(row))!;
    if (group[group.length - 1]?.id !== row.id) {
      groups.set(key(row), [...group.filter((e) => e.id !== row.id && e.createdAt <= row.createdAt), row]);
    }
  }
  return groups;
}

/**
 * يفحص أهداف صفحة واحدة: أي تغريدة من بوت، وأي حدث «يحتاج قراراً» حُسم هدفه
 * (تغريدة لم تعد مسودة، خبر أو مقال نُشر أو أُعيد، طلب تعديل بُتّ فيه، تذكرة
 * أُجيب عنها). استعلام واحد بالمفتاح الأساسي لكل جدول. لا يرمي: عند الفشل
 * يبقى التصنيف بالنوع وحده.
 */
async function loadNotificationContext(
  rows: Array<typeof staffDeskEvents.$inferSelect>,
): Promise<NotificationContext> {
  const ids = (kinds: readonly string[]) => [
    ...new Set(rows.filter((r) => kinds.includes(r.kind)).map((r) => r.targetId)),
  ];
  const tweetIds = [...new Set(rows.filter((r) => r.category === "tweet").map((r) => r.targetId))];
  const articleIds = ids(["opinion_draft", "news_bot_draft", "news_draft"]);
  const requestIds = ids(["news_edit_request"]);
  const ticketIds = ids(["ticket_message"]);
  const actorUserIds = [...new Set(rows.map((r) => r.actorUserId).filter((id): id is string => Boolean(id)))];
  const actorNames = [...new Set(rows.map((r) => r.actorName?.trim()).filter((n): n is string => Boolean(n)))];
  try {
    const [bots, openTweets, openArticles, openRequests, openTickets, people, agencyRows] = await Promise.all([
      tweetIds.length
        ? db
            .select({ postId: socialPostBotKeys.postId, botName: socialPostBotKeys.botName })
            .from(socialPostBotKeys)
            .where(inArray(socialPostBotKeys.postId, tweetIds))
        : [],
      tweetIds.length
        ? db
            .select({ id: socialPosts.id })
            .from(socialPosts)
            .where(and(inArray(socialPosts.id, tweetIds), inArray(socialPosts.status, ["draft", "failed"])))
        : [],
      articleIds.length
        ? db
            .select({ id: articles.id })
            .from(articles)
            .where(
              and(
                inArray(articles.id, articleIds),
                eq(articles.status, "draft"),
                sql`${articles.reviewStatus} is distinct from 'needs_changes'`,
                sql`${articles.reviewStatus} is distinct from 'rejected'`,
              ),
            )
        : [],
      requestIds.length
        ? db
            .select({ id: articleEditRequests.id })
            .from(articleEditRequests)
            .where(and(inArray(articleEditRequests.id, requestIds), eq(articleEditRequests.status, "pending")))
        : [],
      ticketIds.length
        ? db
            .select({ id: opinionTickets.id })
            .from(opinionTickets)
            .where(and(inArray(opinionTickets.id, ticketIds), eq(opinionTickets.status, "open")))
        : [],
      actorUserIds.length
        ? db
            .select({ id: users.id, imageUrl: users.profileImageUrl })
            .from(users)
            .where(inArray(users.id, actorUserIds))
        : [],
      actorNames.length
        ? db
            .select({ name: sql<string>`trim(${publishers.agencyName})`, logoUrl: publishers.logoUrl })
            .from(publishers)
            .where(inArray(sql`trim(${publishers.agencyName})`, actorNames))
        : [],
    ]);
    const userAvatars = new Map<string, string>();
    for (const person of people) {
      const url = safeStaffAvatarUrl(person.imageUrl);
      if (url) userAvatars.set(person.id, url);
    }
    const open = new Set([...openTweets, ...openArticles, ...openRequests, ...openTickets].map((r) => r.id));
    const settled = new Set(
      rows
        .filter((r) => staffDeskEventIsDecisionKind(r.kind as StaffDeskEventKind) && !open.has(r.targetId))
        .map((r) => r.id),
    );
    return {
      tweetBots: new Map(bots.map((b) => [b.postId, botDraftsPublisherDisplayName(b.botName)])),
      settled,
      userAvatars,
      agencies: new Map(agencyRows.map((a) => [a.name, safeStaffAvatarUrl(a.logoUrl)])),
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} تعذر فحص أهداف التنبيهات:`, err);
    return EMPTY_CONTEXT;
  }
}

export async function listStaffDeskNotifications(
  caps: StaffCapabilities,
  userId: string,
  query: { category: "all" | StaffDeskEventCategory; cursor?: string; limit: number; v?: number },
  now: Date = new Date(),
): Promise<StaffDeskNotificationsResponse> {
  const categories = visibleStaffDeskCategories(caps, { includeMessages: staffDeskIncludesMessages(query.v) });
  const empty = { all: 0, tweet: 0, opinion: 0, news: 0, message: 0 };
  const seen = await getSeenState(userId).catch((): SeenState => EMPTY_SEEN);
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

  // آخر حدث «ظاهر» لكل مادة: النافذة والممسوح يُطبَّقان قبل الترتيب، فلا تختفي
  // مادة مُسح أحدث أحداثها وبقي أقدمها. مسح واحد على فهرس (category, created_at).
  const items: EventRow[] = [];
  if (shown.length > 0) {
    const latest = await db.execute<{ id: string }>(sql`
      select id from (
        select ${staffDeskEvents.id} as id, ${staffDeskEvents.createdAt} as created_at,
          row_number() over (
            partition by ${staffDeskEvents.category}, ${staffDeskEvents.targetId}
            order by ${staffDeskEvents.createdAt} desc, ${staffDeskEvents.id} desc
          ) as rn
        from ${staffDeskEvents}
        where ${and(inArray(staffDeskEvents.category, shown), gte(staffDeskEvents.createdAt, start), notClearedSql(seen))}
      ) latest
      where rn = 1
        ${cursor ? sql`and (created_at < ${new Date(cursor.createdAt)} or (created_at = ${new Date(cursor.createdAt)} and id < ${cursor.id}))` : sql``}
      order by created_at desc, id desc
      limit ${query.limit + 1}
    `);
    const ids = latest.rows.map((r) => r.id);
    if (ids.length > 0) {
      const byId = new Map(
        (await db.select().from(staffDeskEvents).where(inArray(staffDeskEvents.id, ids))).map((r) => [r.id, r]),
      );
      for (const id of ids) {
        const row = byId.get(id);
        if (row) items.push(row);
      }
    }
  }

  const page = items.slice(0, query.limit);
  const last = page[page.length - 1];
  const nextCursor =
    items.length > query.limit && last
      ? encodeStaffDeskEventCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null;

  const countRows = await db
    .select({
      category: staffDeskEvents.category,
      // مادة لا حدث: صف واحد لكل مادة، و«جديدة» إن كان فيها حدث جديد لم يُقرأ.
      total: sql<number>`count(distinct ${staffDeskEvents.targetId})::int`,
      unread: sql<number>`count(distinct ${staffDeskEvents.targetId}) filter (where ${staffDeskEvents.createdAt} > ${since} and ${notReadSql(seen.readIds)})::int`,
    })
    .from(staffDeskEvents)
    .where(and(inArray(staffDeskEvents.category, categories), gte(staffDeskEvents.createdAt, start), notClearedSql(seen)))
    .groupBy(staffDeskEvents.category);

  const counts = { ...empty };
  let unread = 0;
  for (const row of countRows) {
    const key = row.category as StaffDeskEventCategory;
    if (key in counts) counts[key] = Number(row.total) || 0;
    unread += Number(row.unread) || 0;
  }
  counts.all = counts.tweet + counts.opinion + counts.news + counts.message;

  const groups = await loadTargetGroups(page, seen, start);
  const context = await loadNotificationContext([...groups.values()].flat());
  const readIds = new Set(seen.readIds);
  return {
    items: page.map((row) => toNotification(groups.get(`${row.category}:${row.targetId}`)!, since, readIds, now, context)),
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
  options: { v?: number } = {},
): Promise<StaffDeskUnreadResponse> {
  const { unreadCount, latest } = await getStaffDeskUnreadDetailed(caps, userId, now, [], options);
  return { unreadCount, latest };
}

/**
 * مثل `getStaffDeskUnread` مع `unreadExcludingKinds`: غير المقروء دون أنواع
 * بعينها. يستعمله عدّاد الأيقونة (/counts) ليستبعد تنبيهات «مسودة جديدة»
 * التي تُحسب أصلًا من مصدرها (المقترحات ومسودات الرأي) فلا تُعدّ مرتين.
 */
export async function getStaffDeskUnreadDetailed(
  caps: StaffCapabilities,
  userId: string,
  now: Date = new Date(),
  excludeKinds: readonly StaffDeskEventKind[] = [],
  options: { v?: number } = {},
): Promise<StaffDeskUnreadResponse & { unreadExcludingKinds: number }> {
  const categories = visibleStaffDeskCategories(caps, { includeMessages: staffDeskIncludesMessages(options.v) });
  if (categories.length === 0) return { unreadCount: 0, latest: null, unreadExcludingKinds: 0 };
  const keptSql =
    excludeKinds.length === 0
      ? sql`true`
      : sql`${staffDeskEvents.kind} not in (${sql.join(excludeKinds.map((kind) => sql`${kind}`), sql`, `)})`;
  const seen = await getSeenState(userId).catch((): SeenState => EMPTY_SEEN);
  const since = unreadSince(seen.seenAt, now);
  const start = windowStart(now);
  const [[countRow], [latestRow]] = await Promise.all([
    db
      .select({
        // مادة لا حدث، كما في القائمة.
        unread: sql<number>`count(distinct ${staffDeskEvents.category} || ':' || ${staffDeskEvents.targetId})::int`,
        kept: sql<number>`count(distinct ${staffDeskEvents.category} || ':' || ${staffDeskEvents.targetId}) filter (where ${keptSql})::int`,
      })
      .from(staffDeskEvents)
      .where(
        and(
          inArray(staffDeskEvents.category, categories),
          // نافذة المركز نفسها: لا يُحسب على الجرس ما لا يظهر في القائمة.
          gte(staffDeskEvents.createdAt, start),
          sql`${staffDeskEvents.createdAt} > ${since}`,
          notReadSql(seen.readIds),
          notClearedSql(seen),
        ),
      ),
    db
      .select()
      .from(staffDeskEvents)
      .where(and(inArray(staffDeskEvents.category, categories), gte(staffDeskEvents.createdAt, start), notClearedSql(seen)))
      .orderBy(desc(staffDeskEvents.createdAt), desc(staffDeskEvents.id))
      .limit(1),
  ]);
  return {
    unreadCount: Math.min(Number(countRow?.unread) || 0, STAFF_DESK_UNREAD_CAP),
    latest: latestRow ? toNotification([latestRow], since, new Set(seen.readIds), now) : null,
    unreadExcludingKinds: Math.min(Number(countRow?.kept) || 0, STAFF_DESK_UNREAD_CAP),
  };
}

/** «تعليم الكل كمقروء»: كل ما قبل الآن مقروء، وتُفرَّغ قائمة المقروء فرادى. */
export async function markStaffDeskNotificationsSeen(userId: string, now: Date = new Date()): Promise<string> {
  const seenAt = now.toISOString();
  await mergeSeenState(userId, { seenAt, readIds: [] }, now);
  return seenAt;
}

/**
 * «مسح الكل» (2026-11-10): يخفي عن هذا العضو وحده كل ما سُجّل حتى الآن في الفئة
 * المطلوبة، أو في كل فئاته المرئية عند "all". الأحداث نفسها تبقى لزملائه.
 * يعيد الفئات التي مُسحت.
 */
export async function clearStaffDeskNotifications(
  caps: StaffCapabilities,
  userId: string,
  category: "all" | StaffDeskEventCategory,
  options: { v?: number } = {},
  now: Date = new Date(),
): Promise<StaffDeskEventCategory[]> {
  const visible = visibleStaffDeskCategories(caps, { includeMessages: staffDeskIncludesMessages(options.v) });
  const targets = category === "all" ? visible : visible.filter((c) => c === category);
  if (targets.length === 0) return [];
  const seen = await getSeenState(userId).catch((): SeenState => EMPTY_SEEN);
  const cleared: Record<string, string> = {};
  for (const [key, at] of Object.entries(seen.clearedAt)) if (at) cleared[key] = at.toISOString();
  for (const target of targets) cleared[target] = now.toISOString();
  // مسح كل الفئات يُفرغ قائمة الممسوح فرادى أيضاً: كلها أقدم من الآن.
  const all = visible.every((c) => targets.includes(c));
  await mergeSeenState(userId, { cleared, ...(all ? { clearedIds: [] } : {}) }, now);
  return targets;
}

/** يلحق معرّفات بقائمة في صف العضو ذرياً (أحدث `max`)، دون لمس بقية الحقول. */
async function appendSeenStateIds(userId: string, field: "readIds" | "clearedIds", eventIds: string[], max: number, now: Date) {
  if (eventIds.length === 0) return;
  const key = seenKey(userId);
  const ids = JSON.stringify(eventIds);
  const initial = JSON.stringify({ seenAt: null, readIds: [], [field]: eventIds.slice(-max) });
  await db.execute(sql`
    INSERT INTO system_settings (key, value, category, is_public)
    VALUES (${key}, ${initial}::jsonb, 'staff_app', false)
    ON CONFLICT (key) DO UPDATE SET
      value = jsonb_set(
        system_settings.value,
        ARRAY[${field}::text],
        (
          SELECT COALESCE(jsonb_agg(t.id ORDER BY t.ord), '[]'::jsonb)
          FROM (
            SELECT e.id, e.ord
            FROM jsonb_array_elements(
              (CASE WHEN jsonb_typeof(system_settings.value->(${field}::text)) = 'array'
                    THEN system_settings.value->(${field}::text) ELSE '[]'::jsonb END)
              - ARRAY(SELECT jsonb_array_elements_text(${ids}::jsonb))
              || ${ids}::jsonb
            ) WITH ORDINALITY AS e(id, ord)
            ORDER BY e.ord DESC
            LIMIT ${max}
          ) t
        ),
        true
      ),
      updated_at = ${now}
  `);
}

/**
 * كل أحداث المادة التي ينتمي إليها التنبيه (الصف في الخط الزمني مادة كاملة)،
 * أو التنبيه وحده إن تعذّر الجلب. أحدث 50 حدثاً.
 */
async function eventIdsOfSameTarget(eventId: string): Promise<string[]> {
  try {
    const [row] = await db
      .select({ category: staffDeskEvents.category, targetId: staffDeskEvents.targetId })
      .from(staffDeskEvents)
      .where(eq(staffDeskEvents.id, eventId))
      .limit(1);
    if (!row) return [eventId];
    const rows = await db
      .select({ id: staffDeskEvents.id })
      .from(staffDeskEvents)
      .where(
        and(
          eq(staffDeskEvents.category, row.category),
          eq(staffDeskEvents.targetId, row.targetId),
          // نافذة المركز نفسها: على فهرس (category, created_at) لا مسح للجدول كله.
          gte(staffDeskEvents.createdAt, windowStart(new Date())),
        ),
      )
      .orderBy(staffDeskEvents.createdAt)
      .limit(50);
    const ids = rows.map((r) => r.id);
    return ids.includes(eventId) ? ids : [...ids, eventId];
  } catch {
    return [eventId];
  }
}

/** مسح تنبيه واحد (المادة كلها) عن هذا العضو وحده. */
export async function clearStaffDeskNotification(userId: string, eventId: string, now: Date = new Date()): Promise<void> {
  await appendSeenStateIds(userId, "clearedIds", await eventIdsOfSameTarget(eventId), MAX_CLEARED_IDS, now);
}

/** فتح تنبيه واحد يعلّم مادته كلها مقروءة دون غيرها. */
// تحديث ذري في قاعدة البيانات: طلبا قراءة متزامنان (أو قراءة مع «تعليم الكل») لا يلغي أحدهما الآخر،
// لأن هذا المسار يلمس readIds وحدها ويبقي seenAt كما هي في الصف لحظة الكتابة.
export async function markStaffDeskNotificationRead(userId: string, eventId: string, now: Date = new Date()): Promise<void> {
  await appendSeenStateIds(userId, "readIds", await eventIdsOfSameTarget(eventId), MAX_READ_IDS, now);
}
