// خدمة إدارة كتّاب الرأي: قائمة الكتّاب بإحصائياتهم، اليوم الأسبوعي المخصص،
// وحساب موعد النشر القادم بتوقيت الرياض.
// Per ADR-001 all Drizzle access lives here; the route module is HTTP-only.
import { and, desc, asc, eq, exists, gte, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  articles,
  opinionWriterSchedules,
  roles,
  userRoles,
  users,
  type UpsertOpinionWriterSchedule,
} from "@shared/schema";
import { OPINION_WRITERS_PER_DAY_CAP } from "@shared/opinionWriterConstants";
import {
  mediaLicenseFlags,
} from "./mediaLicenseService";

export { OPINION_WRITERS_PER_DAY_CAP };

const DAY_MS = 24 * 60 * 60 * 1000;
// السعودية بلا توقيت صيفي — إزاحة ثابتة +03:00
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
// الحد الأدنى بين مقالتين للكاتب نفسه (أسبوع مع تسامح ساعات)
const MIN_GAP_MS = 6 * DAY_MS + 12 * 60 * 60 * 1000;
/** يجب أن تصل المقالة قبل موعد النشر بهذا الهامش */
const SUBMIT_LEAD_MS = 2 * DAY_MS;
/** نافذة التذكير: قبل آخر موعد للإرسال (وليس بعد فواته) */
const REMINDER_WINDOW_MS = 2 * DAY_MS;

/**
 * مقالة «أُرسلت» وتنتظر التحرير: مراجعة معلّقة، أو مسودة موبايل قديمة
 * بلا reviewStatus (إرسال iOS/Android كان يحفظ draft فقط قبل الإصلاح).
 */
const awaitingEditorialSql = sql`(
  ${articles.reviewStatus} = 'pending_review'
  OR (
    ${articles.status} = 'draft'
    AND ${articles.source} IN ('ios-app', 'android-app')
    AND ${articles.reviewStatus} IS NULL
  )
)`;

export type WriterScheduleInfo = {
  weekday: number;
  publishTime: string;
  active: boolean;
  notes: string | null;
};

export type OpinionWriterSummary = {
  id: string;
  name: string;
  email: string | null;
  profileImageUrl: string | null;
  jobTitle: string | null;
  gender: string | null;
  schedule: WriterScheduleInfo | null;
  publishedCount: number;
  pendingCount: number;
  totalViews: number;
  lastArticle: { id: string; title: string; slug: string | null; publishedAt: string } | null;
  nextScheduled: { id: string; title: string; scheduledAt: string } | null;
  nextSlot: string | null;
  commitment: "ok" | "due_soon" | "late" | "awaiting_first" | "unassigned";
  /** الترخيص المهني (هيئة تنظيم الإعلام) المرفوع من مساحة الكاتب */
  mediaLicense: {
    /** مرسل وضمن الصلاحية */
    hasLicense: boolean;
    expired: boolean;
    /** ساري ويتبقّى شهران أو أقل */
    expiringSoon: boolean;
    number: string | null;
    submittedAt: string | null;
    expiresAt: string | null;
    hasFile: boolean;
  };
};

/**
 * أعمدة timestamp تُخزَّن UTC بلا منطقة زمنية؛ نتائج sql`` الخام تصل نصاً
 * ويفسّرها new Date بتوقيت الجهاز — نثبّت التفسير على UTC دائماً.
 */
function parseDbTimestamp(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d =
    v instanceof Date
      ? v
      : new Date(
          (() => {
            const s = v.includes("T") ? v : v.replace(" ", "T");
            return /(?:[zZ]|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`;
          })(),
        );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** toISOString آمن — لا يُسقط قائمة الكتّاب بسبب تاريخ فاسد في صف واحد. */
function toIsoOrNull(v: string | Date | null | undefined): string | null {
  const d = parseDbTimestamp(v);
  return d ? d.toISOString() : null;
}

function riyadhDateParts(d: Date): { y: number; m: number; d: number; weekday: number } {
  const shifted = new Date(d.getTime() + RIYADH_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(), // 0=الأحد بعد الإزاحة
  };
}

/** يبني تاريخ UTC من يوم رياضي محدد + وقت HH:mm بتوقيت الرياض */
function riyadhDateTime(y: number, m: number, d: number, publishTime: string): Date {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  // اقبل HH:mm أو HH:mm:ss — غير ذلك → 06:00 افتراضي
  const time = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(publishTime.trim())
    ? publishTime.trim().slice(0, 5)
    : "06:00";
  return new Date(`${y}-${mm}-${dd}T${time}:00+03:00`);
}

/**
 * أول موعد قادم يوافق اليوم المخصص للكاتب، بعد "الأرضية" (آخر نشر/جدولة + أسبوع).
 * يبحث حتى 5 أسابيع للأمام.
 */
export function computeNextSlot(
  weekday: number,
  publishTime: string,
  floor: Date | null,
  now: Date = new Date(),
): Date | null {
  const today = riyadhDateParts(now);
  for (let i = 0; i < 35; i++) {
    const candidateDay = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    if (candidateDay.getUTCDay() !== weekday) continue;
    const candidate = riyadhDateTime(
      candidateDay.getUTCFullYear(),
      candidateDay.getUTCMonth() + 1,
      candidateDay.getUTCDate(),
      publishTime,
    );
    if (candidate.getTime() <= now.getTime()) continue;
    if (floor && candidate.getTime() - floor.getTime() < MIN_GAP_MS) continue;
    return candidate;
  }
  return null;
}

async function fetchWriterUsers(writerId?: string) {
  const isOpinionAuthor = or(
    eq(users.role, "opinion_author"),
    exists(
      db
        .select({ one: sql`1` })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(userRoles.userId, users.id), eq(roles.name, "opinion_author"))),
    ),
  );
  return db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      profileImageUrl: users.profileImageUrl,
      jobTitle: users.jobTitle,
      gender: users.gender,
      mediaLicenseNumber: users.mediaLicenseNumber,
      mediaLicenseFileKey: users.mediaLicenseFileKey,
      mediaLicenseSubmittedAt: users.mediaLicenseSubmittedAt,
      mediaLicenseExpiresAt: users.mediaLicenseExpiresAt,
      scheduleWeekday: opinionWriterSchedules.weekday,
      schedulePublishTime: opinionWriterSchedules.publishTime,
      scheduleActive: opinionWriterSchedules.active,
      scheduleNotes: opinionWriterSchedules.notes,
      scheduleCreatedAt: opinionWriterSchedules.createdAt,
    })
    .from(users)
    .leftJoin(opinionWriterSchedules, eq(opinionWriterSchedules.writerId, users.id))
    .where(writerId ? and(isOpinionAuthor, eq(users.id, writerId)) : isOpinionAuthor)
    .orderBy(asc(users.firstName));
}

export async function listOpinionWriters(): Promise<OpinionWriterSummary[]> {
  const writerRows = await fetchWriterUsers();
  if (writerRows.length === 0) return [];
  const ids = writerRows.map((w) => w.id);
  const now = new Date();

  const [stats, lastArticles, nextScheduled] = await Promise.all([
    db
      .select({
        authorId: articles.authorId,
        publishedCount: sql<number>`count(*) filter (where ${articles.status} = 'published')::int`,
        pendingCount: sql<number>`count(*) filter (where ${awaitingEditorialSql})::int`,
        totalViews: sql<number>`coalesce(sum(${articles.views}) filter (where ${articles.status} = 'published'), 0)::int`,
        maxScheduledAt: sql<string | null>`max(${articles.scheduledAt}) filter (where ${articles.status} = 'scheduled')`,
      })
      .from(articles)
      .where(and(eq(articles.articleType, "opinion"), inArray(articles.authorId, ids)))
      .groupBy(articles.authorId),
    db
      .selectDistinctOn([articles.authorId], {
        authorId: articles.authorId,
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(
        and(
          eq(articles.articleType, "opinion"),
          inArray(articles.authorId, ids),
          eq(articles.status, "published"),
        ),
      )
      .orderBy(articles.authorId, desc(articles.publishedAt)),
    db
      .selectDistinctOn([articles.authorId], {
        authorId: articles.authorId,
        id: articles.id,
        title: articles.title,
        scheduledAt: articles.scheduledAt,
      })
      .from(articles)
      .where(
        and(
          eq(articles.articleType, "opinion"),
          inArray(articles.authorId, ids),
          eq(articles.status, "scheduled"),
          gte(articles.scheduledAt, now),
        ),
      )
      .orderBy(articles.authorId, asc(articles.scheduledAt)),
  ]);

  const statsByWriter = new Map(stats.map((s) => [s.authorId, s]));
  const lastByWriter = new Map(lastArticles.map((a) => [a.authorId, a]));
  const nextByWriter = new Map(nextScheduled.map((a) => [a.authorId, a]));

  return writerRows.map((w) => {
    const s = statsByWriter.get(w.id);
    const last = lastByWriter.get(w.id);
    const next = nextByWriter.get(w.id);
    const schedule: WriterScheduleInfo | null =
      w.scheduleWeekday !== null && w.scheduleWeekday !== undefined
        ? {
            weekday: w.scheduleWeekday,
            publishTime: w.schedulePublishTime ?? "06:00",
            active: w.scheduleActive ?? true,
            notes: w.scheduleNotes ?? null,
          }
        : null;

    const lastPublishedAt = last?.publishedAt ? new Date(last.publishedAt) : null;
    const maxScheduledAt = parseDbTimestamp(s?.maxScheduledAt);
    const floor =
      lastPublishedAt && maxScheduledAt
        ? new Date(Math.max(lastPublishedAt.getTime(), maxScheduledAt.getTime()))
        : lastPublishedAt ?? maxScheduledAt;

    const nextSlot =
      schedule && schedule.active
        ? computeNextSlot(schedule.weekday, schedule.publishTime, floor, now)
        : null;

    const hasUpcoming = Boolean(next) || (s?.pendingCount ?? 0) > 0;
    // فترة سماح: تخصيص اليوم حديث (< أسبوع) لا يجعل الكاتب "متأخراً" فوراً
    const scheduleIsFresh =
      w.scheduleCreatedAt != null && now.getTime() - w.scheduleCreatedAt.getTime() < 7 * DAY_MS;
    const submitDeadlineMs = nextSlot ? nextSlot.getTime() - SUBMIT_LEAD_MS : null;
    let commitment: OpinionWriterSummary["commitment"];
    if (!schedule || !schedule.active) commitment = "unassigned";
    else if (!lastPublishedAt && !hasUpcoming) commitment = "awaiting_first";
    else if (hasUpcoming) commitment = "ok";
    else if (
      !scheduleIsFresh &&
      ((submitDeadlineMs != null && now.getTime() >= submitDeadlineMs) ||
        (lastPublishedAt && now.getTime() - lastPublishedAt.getTime() > 8 * DAY_MS))
    )
      commitment = "late";
    else if (
      submitDeadlineMs != null &&
      now.getTime() < submitDeadlineMs &&
      submitDeadlineMs - now.getTime() <= REMINDER_WINDOW_MS
    )
      commitment = "due_soon";
    else commitment = "ok";

    const submitted = Boolean(
      w.mediaLicenseNumber && w.mediaLicenseFileKey && w.mediaLicenseSubmittedAt,
    );
    const licenseFlags = mediaLicenseFlags(submitted, w.mediaLicenseExpiresAt ?? null, now);

    return {
      id: w.id,
      name: [w.firstName, w.lastName].filter(Boolean).join(" ") || w.email || w.id,
      email: w.email,
      profileImageUrl: w.profileImageUrl,
      jobTitle: w.jobTitle,
      gender: w.gender,
      schedule,
      publishedCount: s?.publishedCount ?? 0,
      pendingCount: s?.pendingCount ?? 0,
      totalViews: s?.totalViews ?? 0,
      lastArticle: (() => {
        const publishedAt = toIsoOrNull(last?.publishedAt);
        if (!last || !publishedAt) return null;
        return {
          id: last.id,
          title: last.title,
          slug: last.slug,
          publishedAt,
        };
      })(),
      nextScheduled: (() => {
        const scheduledAt = toIsoOrNull(next?.scheduledAt);
        if (!next || !scheduledAt) return null;
        return {
          id: next.id,
          title: next.title,
          scheduledAt,
        };
      })(),
      nextSlot: toIsoOrNull(nextSlot),
      commitment,
      mediaLicense: {
        hasLicense: licenseFlags.hasLicense,
        expired: licenseFlags.expired,
        expiringSoon: licenseFlags.expiringSoon,
        number: w.mediaLicenseNumber ?? null,
        submittedAt: toIsoOrNull(w.mediaLicenseSubmittedAt),
        expiresAt: licenseFlags.expiresAtIso,
        hasFile: Boolean(w.mediaLicenseFileKey),
      },
    };
  });
}

/** مفتاح ملف الترخيص الخاص — للأدمن فقط عبر رابط موقّت. */
export async function getWriterMediaLicenseFileKey(writerId: string): Promise<string | null> {
  const [row] = await db
    .select({ mediaLicenseFileKey: users.mediaLicenseFileKey })
    .from(users)
    .where(eq(users.id, writerId))
    .limit(1);
  return row?.mediaLicenseFileKey ?? null;
}

export async function upsertWriterSchedule(
  writerId: string,
  data: UpsertOpinionWriterSchedule,
  updatedBy: string,
): Promise<WriterScheduleInfo> {
  const [row] = await db
    .insert(opinionWriterSchedules)
    .values({
      writerId,
      weekday: data.weekday,
      publishTime: data.publishTime ?? "06:00",
      active: data.active ?? true,
      notes: data.notes ?? null,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: opinionWriterSchedules.writerId,
      set: {
        weekday: data.weekday,
        // تحديد يوم = تفعيل ضمني ما لم يُطلب الإيقاف صراحة
        active: data.active ?? true,
        ...(data.publishTime !== undefined ? { publishTime: data.publishTime } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning();
  return {
    weekday: row.weekday,
    publishTime: row.publishTime,
    active: row.active,
    notes: row.notes,
  };
}

/** عدد الكتّاب النشطين على كل يوم — لإظهار الازدحام قبل اختيار الكاتب يومه */
export async function getWriterDayLoads(): Promise<number[]> {
  const rows = await db
    .select({
      weekday: opinionWriterSchedules.weekday,
      count: sql<number>`count(*)::int`,
    })
    .from(opinionWriterSchedules)
    .where(eq(opinionWriterSchedules.active, true))
    .groupBy(opinionWriterSchedules.weekday);
  const loads = Array(7).fill(0) as number[];
  for (const r of rows) loads[r.weekday] = r.count;
  return loads;
}

/** هل امتلأ يوم النشر؟ (≥ حد المقالات/الكتّاب لكل يوم) */
export function isWriterDayFull(load: number): boolean {
  return load >= OPINION_WRITERS_PER_DAY_CAP;
}

/**
 * اختيار الكاتب يومه بنفسه — مرة واحدة فقط: أي صف موجود (حتى المعطَّل،
 * لأنه قرار إداري) يمنع الاختيار الذاتي ويُحال الكاتب للإدارة.
 */
export async function selfAssignWriterSchedule(
  writerId: string,
  weekday: number,
): Promise<
  | { ok: true; schedule: WriterScheduleInfo }
  | { ok: false; status: number; message: string }
> {
  const [existing] = await db
    .select({ id: opinionWriterSchedules.id })
    .from(opinionWriterSchedules)
    .where(eq(opinionWriterSchedules.writerId, writerId))
    .limit(1);
  if (existing) {
    return {
      ok: false,
      status: 409,
      message: "يومك محدد مسبقاً — لتغييره تواصل مع إدارة التحرير",
    };
  }
  const loads = await getWriterDayLoads();
  if (isWriterDayFull(loads[weekday] ?? 0)) {
    return {
      ok: false,
      status: 409,
      message: `يوم النشر ممتلئ (${OPINION_WRITERS_PER_DAY_CAP}/${OPINION_WRITERS_PER_DAY_CAP}) — اختر يوماً آخر`,
    };
  }
  const schedule = await upsertWriterSchedule(writerId, { weekday }, writerId);
  return { ok: true, schedule };
}

/** هل يستطيع الكاتب اختيار يومه بنفسه؟ (لا يوجد أي صف جدولة له) */
export async function canSelfAssignSchedule(writerId: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: opinionWriterSchedules.id })
    .from(opinionWriterSchedules)
    .where(eq(opinionWriterSchedules.writerId, writerId))
    .limit(1);
  return !existing;
}

/** الموعد المقترح القادم لكاتب — يُستخدم لتعبئة الجدولة تلقائياً عند المراجعة */
export async function getNextSlotForWriter(writerId: string): Promise<{
  weekday: number;
  publishTime: string;
  nextSlot: string;
} | null> {
  const [schedule] = await db
    .select()
    .from(opinionWriterSchedules)
    .where(eq(opinionWriterSchedules.writerId, writerId))
    .limit(1);
  if (!schedule || !schedule.active) return null;

  const [floorRow] = await db
    .select({
      floor: sql<string | null>`greatest(
        max(${articles.publishedAt}) filter (where ${articles.status} = 'published'),
        max(${articles.scheduledAt}) filter (where ${articles.status} = 'scheduled')
      )`,
    })
    .from(articles)
    .where(and(eq(articles.articleType, "opinion"), eq(articles.authorId, writerId)));

  const floor = parseDbTimestamp(floorRow?.floor);
  const nextSlot = computeNextSlot(schedule.weekday, schedule.publishTime, floor);
  if (!nextSlot) return null;
  return {
    weekday: schedule.weekday,
    publishTime: schedule.publishTime,
    nextSlot: nextSlot.toISOString(),
  };
}

export type WriterArticleRow = {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  reviewStatus: string | null;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string | null;
  views: number;
  likes: number;
  comments: number;
};

export async function getWriterArticlesWithStats(
  writerId: string,
  page: number,
  limit: number,
): Promise<{
  writer: { id: string; name: string; profileImageUrl: string | null } | null;
  articles: WriterArticleRow[];
  totals: { totalArticles: number; totalViews: number; totalLikes: number; totalComments: number };
  pagination: { page: number; limit: number; total: number };
}> {
  const [writerRow] = await fetchWriterUsers(writerId);
  if (!writerRow) {
    return {
      writer: null,
      articles: [],
      totals: { totalArticles: 0, totalViews: 0, totalLikes: 0, totalComments: 0 },
      pagination: { page, limit, total: 0 },
    };
  }

  const baseWhere = and(eq(articles.articleType, "opinion"), eq(articles.authorId, writerId));

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        reviewStatus: articles.reviewStatus,
        publishedAt: articles.publishedAt,
        scheduledAt: articles.scheduledAt,
        createdAt: articles.createdAt,
        views: articles.views,
        likes: sql<number>`(select count(*)::int from reactions r where r.article_id = ${articles.id} and r.type = 'like')`,
        comments: sql<number>`(select count(*)::int from comments c where c.article_id = ${articles.id})`,
      })
      .from(articles)
      .where(baseWhere)
      .orderBy(desc(sql`coalesce(${articles.publishedAt}, ${articles.scheduledAt}, ${articles.createdAt})`))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({
        totalArticles: sql<number>`count(*)::int`,
        totalViews: sql<number>`coalesce(sum(${articles.views}) filter (where ${articles.status} = 'published'), 0)::int`,
        totalLikes: sql<number>`coalesce((select count(*)::int from reactions r join articles a2 on a2.id = r.article_id where a2.author_id = ${writerId} and a2.article_type = 'opinion' and r.type = 'like'), 0)`,
        totalComments: sql<number>`coalesce((select count(*)::int from comments c join articles a3 on a3.id = c.article_id where a3.author_id = ${writerId} and a3.article_type = 'opinion'), 0)`,
      })
      .from(articles)
      .where(baseWhere),
  ]);

  return {
    writer: {
      id: writerRow.id,
      name:
        [writerRow.firstName, writerRow.lastName].filter(Boolean).join(" ") ||
        writerRow.email ||
        writerRow.id,
      profileImageUrl: writerRow.profileImageUrl,
    },
    articles: rows.map((r) => ({
      ...r,
      publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
      scheduledAt: r.scheduledAt ? new Date(r.scheduledAt).toISOString() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
    })),
    totals: totals ?? { totalArticles: 0, totalViews: 0, totalLikes: 0, totalComments: 0 },
    pagination: { page, limit, total: totals?.totalArticles ?? 0 },
  };
}

/**
 * جدولة مقال رأي معتمد لموعد مستقبلي (بديل النشر الفوري).
 * يلتقطه ناشر المجدولات في notificationWorker كل دقيقتين.
 */
export async function scheduleApprovedOpinionArticle(
  articleId: string,
  scheduledAt: Date,
): Promise<
  | { ok: true; article: { id: string; status: string; scheduledAt: Date | null } }
  | { ok: false; status: number; message: string }
> {
  const [existing] = await db
    .select({
      id: articles.id,
      status: articles.status,
      reviewStatus: articles.reviewStatus,
    })
    .from(articles)
    .where(and(eq(articles.id, articleId), eq(articles.articleType, "opinion")))
    .limit(1);
  if (!existing) return { ok: false, status: 404, message: "مقال الرأي غير موجود" };
  if (existing.reviewStatus !== "approved")
    return { ok: false, status: 400, message: "يجب اعتماد المقال قبل جدولته" };
  if (existing.status === "published")
    return { ok: false, status: 400, message: "المقال منشور بالفعل" };
  if (scheduledAt.getTime() <= Date.now())
    return { ok: false, status: 400, message: "موعد الجدولة يجب أن يكون في المستقبل" };

  const [updated] = await db
    .update(articles)
    .set({
      status: "scheduled",
      publishType: "scheduled",
      scheduledAt,
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId))
    .returning({
      id: articles.id,
      status: articles.status,
      scheduledAt: articles.scheduledAt,
    });
  return { ok: true, article: updated };
}

export type WriterScheduleBanner = {
  weekday: number;
  publishTime: string;
  nextPublishAt: string;
  submitDeadline: string;
  state: "ok" | "reminder" | "late";
  hasUpcoming: boolean;
  lastPublishedAt: string | null;
};

/** بيانات البانر الثابت في لوحة الكاتب. null = لا يوجد يوم مخصص فتُخفى الرسالة. */
export async function getWriterScheduleBanner(
  writerId: string,
): Promise<WriterScheduleBanner | null> {
  const [schedule] = await db
    .select()
    .from(opinionWriterSchedules)
    .where(eq(opinionWriterSchedules.writerId, writerId))
    .limit(1);
  if (!schedule || !schedule.active) return null;

  const now = new Date();
  const [agg] = await db
    .select({
      lastPublishedAt: sql<string | null>`max(${articles.publishedAt}) filter (where ${articles.status} = 'published')`,
      upcomingCount: sql<number>`count(*) filter (where (${articles.status} = 'scheduled' and ${articles.scheduledAt} >= now()) or ${awaitingEditorialSql})::int`,
      maxScheduledAt: sql<string | null>`max(${articles.scheduledAt}) filter (where ${articles.status} = 'scheduled')`,
    })
    .from(articles)
    .where(and(eq(articles.articleType, "opinion"), eq(articles.authorId, writerId)));

  const lastPublishedAt = parseDbTimestamp(agg?.lastPublishedAt);
  const maxScheduledAt = parseDbTimestamp(agg?.maxScheduledAt);
  const hasUpcoming = (agg?.upcomingCount ?? 0) > 0;

  const floor =
    lastPublishedAt && maxScheduledAt
      ? new Date(Math.max(lastPublishedAt.getTime(), maxScheduledAt.getTime()))
      : lastPublishedAt ?? maxScheduledAt;
  const nextSlot = computeNextSlot(schedule.weekday, schedule.publishTime, floor, now);
  if (!nextSlot) return null;

  const submitDeadline = new Date(nextSlot.getTime() - SUBMIT_LEAD_MS);

  // فترة سماح: لا نُظهر "متأخر" لكاتب خُصص له يومه قبل أقل من أسبوع
  const scheduleIsFresh =
    schedule.createdAt != null && now.getTime() - schedule.createdAt.getTime() < 7 * DAY_MS;
  let state: WriterScheduleBanner["state"] = "ok";
  if (!hasUpcoming) {
    // فات آخر موعد للإرسال → متأخر (حتى لو بقي وقت قبل لحظة النشر)
    // التذكير فقط والمهلة ما زالت في المستقبل — يمنع «أرسلها قبل 18» ونحن في 20
    if (
      !scheduleIsFresh &&
      (now.getTime() >= submitDeadline.getTime() ||
        (lastPublishedAt != null && now.getTime() - lastPublishedAt.getTime() > 8 * DAY_MS))
    ) {
      state = "late";
    } else if (
      now.getTime() < submitDeadline.getTime() &&
      submitDeadline.getTime() - now.getTime() <= REMINDER_WINDOW_MS
    ) {
      state = "reminder";
    }
  }

  return {
    weekday: schedule.weekday,
    publishTime: schedule.publishTime,
    nextPublishAt: nextSlot.toISOString(),
    submitDeadline: submitDeadline.toISOString(),
    state,
    hasUpcoming,
    lastPublishedAt: lastPublishedAt ? lastPublishedAt.toISOString() : null,
  };
}
