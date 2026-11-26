// «غرفة المناوبة»: تحميل بيانات الورديات وحساب المؤشرات للبطاقة والغرفة والفريق والجدول.
// الحساب نفسه في shared/contentDuty.ts؛ هنا الاستعلامات والصلاحيات فقط.
import { and, eq, gt, gte, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { withCache } from "../../memoryCache";
import {
  articleEditLocks,
  articleVersions,
  articles,
  categories,
  staffActivityMinutes,
  users,
  articleEvents,
} from "@shared/schema";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";
import { canReadEnDashboardStats } from "@shared/enDashboardAccess";
import {
  addDays,
  attributeUnclaimedPublishes,
  averageReports,
  buildDeskItems,
  computeShiftReport,
  coverageGaps,
  DUTY_DAY_NAMES,
  expandOccurrences,
  initialOf,
  isOverdue,
  liveStatus,
  riyadhClock,
  riyadhDateKey,
  riyadhMidnight,
  rosterBlocks,
  waitingAt,
  weekStartKey,
  workCountFrom,
  DUTY_EARLY_WORK_MIN,
  type ActivityKind,
  type ContentDutyCardResponse,
  type ContentDutyRoomResponse,
  type ContentDutyRosterResponse,
  type ContentDutyTeamResponse,
  type DeskArticle,
  type DeskItem,
  type DutyAccess,
  type DutyOccurrence,
  type DutyThresholds,
  type ShiftReport,
  type VersionEvent,
  respondedAtOf,
  type WaitingDraft,
} from "@shared/contentDuty";
import { getUserRoleNames } from "../../rbac";
import {
  getAlertSettings,
  getThresholds,
  listActiveShifts,
  listDutyCandidates,
  listExceptions,
  loadAvatars,
  loadNames,
} from "./dutyRosterStore";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** المسودة المرسلة التي لم يلمسها أحد أسبوعًا لا تُحسب ضمن المنتظر. */
const PENDING_STALE_MS = 7 * DAY;
const OWN_ACTIONS = ["published", "updated", "created", "restored", "unpublished", "archived"];

// ---------- الصلاحية ----------

export interface DutyViewer {
  userId: string;
  access: DutyAccess;
}

/** lead = مسؤول (كل الأرقام وتعديل الجدول)؛ manager = مدير محتوى أو صاحب وردية (أرقامه فقط)؛ staff = البطاقة الأساسية. */
export async function resolveDutyViewer(userId: string, rosteredIds: ReadonlySet<string>): Promise<DutyViewer | null> {
  const roleNames = await getUserRoleNames(userId);
  if (roleNames.some((r) => (SUPERUSER_ROLE_NAMES as readonly string[]).includes(r))) return { userId, access: "lead" };
  if (roleNames.includes("content_manager") || rosteredIds.has(userId)) return { userId, access: "manager" };
  if (canReadEnDashboardStats(null, roleNames)) return { userId, access: "staff" };
  return null;
}

// ---------- التحميل ----------

export interface DutyData {
  minutes: Map<string, Map<number, ActivityKind>>;
  ownVersions: Map<string, VersionEvent[]>;
  ownReviews: Map<string, number[]>;
  items: DeskItem[];
  breakingIds: Set<string>;
  lastAction: Map<string, { articleId: string; at: number }>;
}

interface VersionRow { articleId: string; actorId: string | null; action: string; at: Date | string }

/**
 * يضم أحداث النشر من article_events إلى نسخ المواد. النشر نفسه قد يُسجَّل في الجدولين،
 * فيُعدّ نشر المادة نفسها من الشخص نفسه خلال 3 دقائق مرة واحدة.
 */
function mergePublishEvents(
  versions: readonly VersionRow[],
  events: ReadonlyArray<{ articleId: string; actorId: string | null; at: Date | string }>,
): VersionRow[] {
  const out = versions.slice();
  const publishes = versions.filter((v) => v.action === "published");
  for (const e of events) {
    const at = new Date(e.at).getTime();
    const dup = publishes.some((v) => v.articleId === e.articleId && v.actorId === e.actorId && Math.abs(new Date(v.at).getTime() - at) <= 3 * MINUTE);
    if (dup) continue;
    const row = { articleId: e.articleId, actorId: e.actorId, action: "published", at: e.at };
    out.push(row);
    publishes.push(row);
  }
  return out;
}

export async function loadDutyData(from: number, to: number, userIds: readonly string[], now: number): Promise<DutyData> {
  const ids = Array.from(new Set(userIds));
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const empty = ids.length === 0;
  // مادة تُركت عند نهاية الوردية قد تُحسم بعدها: نقرأ القرارات حتى يوم بعد النهاية
  // لنعيد بناء ما كان منتظرًا عندها، لا حالته الآن.
  const decisionsUntil = new Date(Math.min(now, to + DAY) + MINUTE);

  const [minuteRows, versionRowsRaw, publishEventRows, reviewRows, deskRows] = await Promise.all([
    empty ? [] : db
      .select({ userId: staffActivityMinutes.userId, minute: staffActivityMinutes.minute, kind: staffActivityMinutes.kind })
      .from(staffActivityMinutes)
      .where(and(inArray(staffActivityMinutes.userId, ids), gte(staffActivityMinutes.minute, fromDate), lt(staffActivityMinutes.minute, toDate))),
    empty ? [] : db
      .select({ articleId: articleVersions.articleId, actorId: articleVersions.actorId, action: articleVersions.action, at: articleVersions.createdAt })
      .from(articleVersions)
      .where(and(inArray(articleVersions.actorId, ids), gte(articleVersions.createdAt, fromDate), lt(articleVersions.createdAt, toDate), inArray(articleVersions.action, OWN_ACTIONS))),
    // زر النشر السريع و«مكتب سبق» والإنشاء منشورًا تسجّل النشر في article_events دون نسخة.
    empty ? [] : db
      .select({ articleId: articleEvents.articleId, actorId: articleEvents.actorId, at: articleEvents.createdAt })
      .from(articleEvents)
      .where(and(inArray(articleEvents.actorId, ids), eq(articleEvents.eventType, "published"), gte(articleEvents.createdAt, fromDate), lt(articleEvents.createdAt, toDate))),
    empty ? [] : db
      .select({ reviewedBy: articles.reviewedBy, reviewedAt: articles.reviewedAt })
      .from(articles)
      .where(and(inArray(articles.reviewedBy, ids), gte(articles.reviewedAt, fromDate), lt(articles.reviewedAt, toDate))),
    db
      .select({
        id: articles.id,
        title: articles.title,
        newsType: articles.newsType,
        ownerId: sql<string | null>`coalesce(${articles.submitterId}, ${articles.authorId})`,
        createdAt: articles.createdAt,
        status: articles.status,
        reviewStatus: articles.reviewStatus,
        reviewedAt: articles.reviewedAt,
        reviewedBy: articles.reviewedBy,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(or(
        and(eq(articles.status, "draft"), eq(articles.reviewStatus, "pending_review"), gte(articles.updatedAt, new Date(now - PENDING_STALE_MS))),
        and(gte(articles.publishedAt, fromDate), lt(articles.publishedAt, decisionsUntil), lt(articles.createdAt, toDate)),
        and(gte(articles.reviewedAt, fromDate), lt(articles.reviewedAt, decisionsUntil), lt(articles.createdAt, toDate)),
      ))
      .limit(5000),
  ]);


  const deskIds = deskRows.map((r) => r.id);
  const [deskVersionRows, deskPublishEvents] = deskIds.length === 0 ? [[], []] : await Promise.all([
    db
      .select({ articleId: articleVersions.articleId, actorId: articleVersions.actorId, action: articleVersions.action, at: articleVersions.createdAt })
      .from(articleVersions)
      .where(and(
        inArray(articleVersions.articleId, deskIds),
        gte(articleVersions.createdAt, new Date(from - PENDING_STALE_MS)),
        lt(articleVersions.createdAt, decisionsUntil),
        notInArray(articleVersions.action, ["autosave", "baseline"]),
      )),
    db
      .select({ articleId: articleEvents.articleId, actorId: articleEvents.actorId, at: articleEvents.createdAt })
      .from(articleEvents)
      .where(and(
        inArray(articleEvents.articleId, deskIds),
        eq(articleEvents.eventType, "published"),
        gte(articleEvents.createdAt, new Date(from - PENDING_STALE_MS)),
        lt(articleEvents.createdAt, decisionsUntil),
      )),
  ]);
  const deskVersionsRecorded = mergePublishEvents(deskVersionRows, deskPublishEvents);
  // نشر بلا ناشر مسجّل يُنسب لآخر من عمل على المادة قبل نشره (المجدول خاصة).
  const inferred = attributeUnclaimedPublishes(
    deskRows.filter((r) => r.status === "published").map((r) => ({
      id: r.id, ownerId: r.ownerId, publishedAt: r.publishedAt ? new Date(r.publishedAt).getTime() : null,
    })),
    deskVersionsRecorded.map((v) => ({ articleId: v.articleId, actorId: v.actorId, action: v.action, at: new Date(v.at).getTime() })),
  );
  const inferredRows: VersionRow[] = inferred.map((v) => ({ articleId: v.articleId, actorId: v.actorId, action: v.action, at: new Date(v.at) }));
  const deskVersions = [...deskVersionsRecorded, ...inferredRows];
  const idSet = new Set(ids);
  const versionRows = [
    ...mergePublishEvents(versionRowsRaw, publishEventRows),
    ...inferredRows.filter((v) => v.actorId && idSet.has(v.actorId) && new Date(v.at).getTime() >= from && new Date(v.at).getTime() < to),
  ];

  const ownArticleIds = Array.from(new Set(versionRows.filter((v) => v.action === "published").map((v) => v.articleId)));
  const breakingIds = new Set(deskRows.filter((r) => r.newsType === "breaking").map((r) => r.id));
  const missing = ownArticleIds.filter((id) => !deskIds.includes(id));
  if (missing.length > 0) {
    const rows = await db.select({ id: articles.id }).from(articles)
      .where(and(inArray(articles.id, missing), eq(articles.newsType, "breaking")));
    rows.forEach((r) => breakingIds.add(r.id));
  }

  const minutes = new Map<string, Map<number, ActivityKind>>();
  for (const r of minuteRows) {
    const map = minutes.get(r.userId) ?? new Map<number, ActivityKind>();
    map.set(new Date(r.minute).getTime(), r.kind === "action" ? "action" : "view");
    minutes.set(r.userId, map);
  }
  const ownVersions = new Map<string, VersionEvent[]>();
  const lastAction = new Map<string, { articleId: string; at: number }>();
  for (const v of versionRows) {
    if (!v.actorId) continue;
    const ev = { articleId: v.articleId, actorId: v.actorId, action: v.action, at: new Date(v.at).getTime() };
    const list = ownVersions.get(v.actorId) ?? [];
    list.push(ev);
    ownVersions.set(v.actorId, list);
    const prev = lastAction.get(v.actorId);
    if (!prev || prev.at < ev.at) lastAction.set(v.actorId, { articleId: ev.articleId, at: ev.at });
  }
  const ownReviews = new Map<string, number[]>();
  for (const r of reviewRows) {
    if (!r.reviewedBy || !r.reviewedAt) continue;
    const list = ownReviews.get(r.reviewedBy) ?? [];
    list.push(new Date(r.reviewedAt).getTime());
    ownReviews.set(r.reviewedBy, list);
  }
  const deskArticles: DeskArticle[] = deskRows.map((r) => ({
    id: r.id,
    title: r.title,
    breaking: r.newsType === "breaking",
    ownerId: r.ownerId,
    createdAt: new Date(r.createdAt).getTime(),
    status: r.status,
    reviewStatus: r.reviewStatus,
    reviewedAt: r.reviewedAt ? new Date(r.reviewedAt).getTime() : null,
    reviewedBy: r.reviewedBy,
  }));
  const items = buildDeskItems(deskArticles, deskVersions.map((v) => ({
    articleId: v.articleId, actorId: v.actorId, action: v.action, at: new Date(v.at).getTime(),
  })));
  return { minutes, ownVersions, ownReviews, items, breakingIds, lastAction };
}

function reportFor(
  occ: DutyOccurrence,
  data: DutyData,
  now: number,
  thresholds: DutyThresholds,
  all: readonly DutyOccurrence[],
  trackedFrom?: number,
): ShiftReport {
  return computeShiftReport({
    countFrom: workCountFrom(occ, all),
    occ,
    now,
    minutes: data.minutes.get(occ.userId) ?? new Map(),
    ownVersions: data.ownVersions.get(occ.userId) ?? [],
    ownReviews: data.ownReviews.get(occ.userId) ?? [],
    items: data.items,
    breakingIds: data.breakingIds,
    thresholds,
    trackedFrom,
  });
}

export async function loadRoster(from: number, to: number) {
  const shifts = await listActiveShifts();
  const exceptions = await listExceptions(addDays(riyadhDateKey(from), -1), riyadhDateKey(to));
  const occurrences = expandOccurrences(shifts, exceptions, from, to);
  return { shifts, exceptions, occurrences };
}

export async function rosteredIdsNow(): Promise<Set<string>> {
  const ids = await withCache("content-duty:rostered", 60_000, async () => {
    const now = Date.now();
    const { shifts, exceptions } = await loadRoster(now - DAY, now + 8 * DAY);
    const out = new Set(shifts.map((s) => s.userId));
    exceptions.forEach((e) => e.coverUserId && out.add(e.coverUserId));
    return Array.from(out);
  });
  return new Set(ids);
}

/**
 * أول دقيقة مسجّلة في staff_activity_minutes. الورديات التي بدأت قبلها لا بيانات حضور لها
 * (قبل تشغيل التسجيل)، فلا تدخل في المعدلات ولا «أداء الأسبوع» حتى لا تظهر غيابًا كاذبًا.
 */
export async function trackingSince(): Promise<number> {
  return withCache("content-duty:tracking-since", 10 * 60_000, async () => {
    const [row] = await db.select({ first: sql<string | Date | null>`min(${staffActivityMinutes.minute})` }).from(staffActivityMinutes);
    return row?.first ? new Date(row.first).getTime() : Date.now();
  });
}

const remainingMin = (occ: DutyOccurrence, now: number) => Math.max(0, Math.ceil((occ.end - now) / MINUTE));
const elapsedPct = (occ: DutyOccurrence, now: number) =>
  Math.max(0, Math.min(100, Math.round(((now - occ.start) / (occ.end - occ.start)) * 100)));

// ---------- البطاقة ----------

export async function getDutyCard(viewer: DutyViewer): Promise<ContentDutyCardResponse> {
  return withCache(`content-duty:card:${viewer.access}:${viewer.access === "manager" ? viewer.userId : ""}`, 20_000, async () => {
    const now = Date.now();
    const [thresholds, since] = await Promise.all([getThresholds(), trackingSince()]);
    const { occurrences } = await loadRoster(now - DAY, now + 7 * DAY);
    const current = occurrences.filter((o) => o.start <= now && now < o.end);
    const upcoming = occurrences.filter((o) => o.start > now).sort((a, b) => a.start - b.start)[0] ?? null;
    const ids = [...current.map((o) => o.userId), ...current.flatMap((o) => (o.coveredUserId ? [o.coveredUserId] : [])), ...(upcoming ? [upcoming.userId] : [])];
    const [names, avatars] = await Promise.all([loadNames(ids), loadAvatars(current.map((o) => o.userId))]);
    const from = Math.min(now - 15 * MINUTE, ...current.map((o) => workCountFrom(o, occurrences)));
    const data = await loadDutyData(from, now + MINUTE, current.map((o) => o.userId), now);
    const seesNumbers = viewer.access !== "staff";
    const pending = waitingAt(data.items, now);
    const overdue = pending.filter((i) => isOverdue(i, now, thresholds)).sort((a, b) => Number(b.breaking) - Number(a.breaking) || a.waitingSince - b.waitingSince);

    let alert: ContentDutyCardResponse["alert"] = null;
    if (seesNumbers && overdue[0]) {
      const [lock] = await db.select({ articleId: articleEditLocks.articleId }).from(articleEditLocks)
        .where(and(eq(articleEditLocks.articleId, overdue[0].articleId), gt(articleEditLocks.expiresAt, new Date(now)))).limit(1);
      alert = {
        articleId: overdue[0].articleId,
        title: overdue[0].title,
        waitMin: Math.round((now - overdue[0].waitingSince) / MINUTE),
        breaking: overdue[0].breaking,
        opened: Boolean(lock),
      };
    }

    return {
      access: viewer.access,
      generatedAt: new Date(now).toISOString(),
      onDuty: current.map((occ) => {
        const name = names.get(occ.userId) ?? "بلا اسم";
        const mine = viewer.access === "lead" || occ.userId === viewer.userId;
        const minutes = data.minutes.get(occ.userId) ?? new Map();
        const report = seesNumbers && mine ? reportFor(occ, data, now, thresholds, occurrences, since) : null;
        return {
          // المسؤول يرى الكل؛ والمناوب يرى معرّفه هو فقط (لشريط «محادثة المناوب»). مفتاح الذاكرة لكل مدير.
          userId: viewer.access === "lead" || (viewer.access === "manager" && occ.userId === viewer.userId) ? occ.userId : null,
          name,
          initial: initialOf(name),
          avatarUrl: avatars.get(occ.userId) ?? null,
          status: liveStatus(minutes, now),
          start: riyadhClock(occ.start),
          end: riyadhClock(occ.end),
          remainingMin: remainingMin(occ, now),
          elapsedPct: elapsedPct(occ, now),
          coveredName: occ.coveredUserId ? names.get(occ.coveredUserId) ?? null : null,
          published: report ? report.published : null,
          cells: report ? report.cells : null,
        };
      }),
      next: upcoming ? {
        name: names.get(upcoming.userId) ?? "بلا اسم",
        start: riyadhClock(upcoming.start),
        startsInMin: Math.max(0, Math.round((upcoming.start - now) / MINUTE)),
      } : null,
      waiting: seesNumbers ? { count: pending.length, overdue: overdue.length } : null,
      alert,
    };
  });
}

// ---------- الغرفة ----------

export async function getDutyRoom(viewer: DutyViewer, requestedKey: string | null): Promise<ContentDutyRoomResponse> {
  const now = Date.now();
  const thresholds = await getThresholds();
  const { occurrences } = await loadRoster(now - 14 * DAY, now + DAY);
  const visible = occurrences.filter((o) => o.start <= now && (viewer.access === "lead" || o.userId === viewer.userId));
  const recent = visible.slice().sort((a, b) => b.start - a.start).slice(0, 20);
  const names = await loadNames([...occurrences.map((o) => o.userId), ...occurrences.flatMap((o) => (o.coveredUserId ? [o.coveredUserId] : []))]);
  const options = recent.map((o) => ({
    key: `${o.key}:${o.userId}`,
    label: `${names.get(o.userId) ?? "بلا اسم"} · ${DUTY_DAY_NAMES[new Date(`${o.dutyDate}T00:00:00Z`).getUTCDay()]} ${o.dutyDate.slice(8)}/${o.dutyDate.slice(5, 7)} · ${riyadhClock(o.start)}–${riyadhClock(o.end)}`,
    live: o.start <= now && now < o.end,
  }));
  const selected = (requestedKey ? recent.find((o) => `${o.key}:${o.userId}` === requestedKey) : null)
    ?? recent.find((o) => now < o.end) ?? recent[0] ?? null;
  if (!selected) return { access: viewer.access, generatedAt: new Date(now).toISOString(), options, shift: null, thresholds };

  const cacheKey = `content-duty:room:${selected.key}:${selected.userId}:${viewer.access === "lead" ? "lead" : viewer.userId}`;
  return withCache(cacheKey, now < selected.end ? 30_000 : 10 * 60_000, async () => {
    // الورديات الأربع السابقة من النوع نفسه لنفس الشخص للمقارنة بنفسه.
    const since = await trackingSince();
    const previous = occurrences
      .filter((o) => o.shiftId === selected.shiftId && o.userId === selected.userId && o.end <= selected.start && o.start >= since)
      .sort((a, b) => b.start - a.start)
      .slice(0, 4);
    const from = Math.min(workCountFrom(selected, occurrences), ...previous.map((p) => workCountFrom(p, occurrences)));
    const data = await loadDutyData(from, Math.min(selected.end, now) + MINUTE, [selected.userId], now);
    const report = reportFor(selected, data, now, thresholds, occurrences, since);
    const averages = averageReports(previous.map((p) => reportFor(p, data, now, thresholds, occurrences)));
    const live = selected.start <= now && now < selected.end;

    let waiting: WaitingDraft[] = [];
    if (live) {
      const pending = waitingAt(data.items, now).sort((a, b) => a.waitingSince - b.waitingSince).slice(0, 30);
      if (pending.length > 0) {
        const pendingIds = pending.map((p) => p.articleId);
        const [details, locks] = await Promise.all([
          db.select({
            id: articles.id,
            category: categories.nameAr,
            firstName: users.firstName,
            lastName: users.lastName,
          })
            .from(articles)
            .leftJoin(categories, eq(categories.id, articles.categoryId))
            .leftJoin(users, eq(users.id, sql`coalesce(${articles.submitterId}, ${articles.authorId})`))
            .where(inArray(articles.id, pendingIds)),
          db.select({ articleId: articleEditLocks.articleId, userName: articleEditLocks.userName })
            .from(articleEditLocks)
            .where(and(inArray(articleEditLocks.articleId, pendingIds), gt(articleEditLocks.expiresAt, new Date(now)))),
        ]);
        const detail = new Map(details.map((d) => [d.id, d]));
        const lock = new Map(locks.map((l) => [l.articleId, l.userName]));
        waiting = pending.map((p) => {
          const d = detail.get(p.articleId);
          const submitter = d ? [d.firstName, d.lastName].filter(Boolean).join(" ").trim() || null : null;
          return {
            articleId: p.articleId,
            title: p.title,
            breaking: p.breaking,
            waitMin: Math.round((now - p.waitingSince) / MINUTE),
            overdue: isOverdue(p, now, thresholds),
            submitter,
            category: d?.category ?? null,
            openedBy: lock.get(p.articleId) ?? null,
          };
        });
      }
    }

    const nextOcc = occurrences.filter((o) => o.start >= selected.end - 5 * MINUTE && o.start > selected.start && o.userId !== selected.userId)
      .sort((a, b) => a.start - b.start)[0];
    const nextNames = nextOcc && !names.has(nextOcc.userId) ? await loadNames([nextOcc.userId]) : names;
    const last = data.lastAction.get(selected.userId);
    let lastAction: { title: string; at: string } | null = null;
    if (last && last.at >= selected.start) {
      const [row] = await db.select({ title: articles.title }).from(articles).where(eq(articles.id, last.articleId)).limit(1);
      if (row) lastAction = { title: row.title, at: riyadhClock(last.at) };
    }
    const name = names.get(selected.userId) ?? "بلا اسم";
    return {
      access: viewer.access,
      generatedAt: new Date(now).toISOString(),
      options,
      thresholds,
      shift: {
        key: `${selected.key}:${selected.userId}`,
        person: { userId: viewer.access === "lead" ? selected.userId : null, name, initial: initialOf(name) },
        coveredName: selected.coveredUserId ? names.get(selected.coveredUserId) ?? null : null,
        live,
        status: live ? liveStatus(data.minutes.get(selected.userId) ?? new Map(), now) : null,
        dutyDate: selected.dutyDate,
        start: riyadhClock(selected.start),
        end: riyadhClock(selected.end),
        startMs: selected.start,
        endMs: selected.end,
        nowMs: now,
        remainingMin: remainingMin(selected, now),
        elapsedPct: elapsedPct(selected, now),
        report,
        averages,
        lastAction,
        next: nextOcc ? {
          name: nextNames.get(nextOcc.userId) ?? "بلا اسم",
          start: riyadhClock(nextOcc.start),
          pendingToHandOver: live ? waiting.length : waitingAt(data.items, selected.end).length,
        } : null,
        waiting,
      },
    };
  });
}

// ---------- الفريق: آخر 7 أيام ----------

export async function getDutyTeam(viewer: DutyViewer): Promise<ContentDutyTeamResponse> {
  return withCache(`content-duty:team:${viewer.access === "lead" ? "lead" : viewer.userId}`, 2 * 60_000, async () => {
    const now = Date.now();
    const todayKey = riyadhDateKey(now);
    const firstKey = addDays(todayKey, -6);
    const weekFrom = riyadhMidnight(firstKey);
    // نصف ساعة قبل أول وردية: عمل من بدأ مبكرًا يُحسب لورديته.
    const from = weekFrom - DUTY_EARLY_WORK_MIN * MINUTE;
    const thresholds = await getThresholds();
    const [{ occurrences }, since] = await Promise.all([loadRoster(from, now), trackingSince()]);
    const mine = occurrences.filter((o) => o.start >= weekFrom && o.start < now && (viewer.access === "lead" || o.userId === viewer.userId));
    const userIds = Array.from(new Set(mine.map((o) => o.userId)));
    const [names, data] = await Promise.all([
      loadNames(userIds),
      loadDutyData(from, now + MINUTE, userIds, now),
    ]);
    const rows = userIds.map((userId) => {
      const occs = mine.filter((o) => o.userId === userId);
      const tracked = occs.filter((o) => o.start >= since);
      const reports = tracked.map((o) => ({ occ: o, report: reportFor(o, data, now, thresholds, occurrences) }));
      let present = 0;
      let past = 0;
      for (const { report } of reports) {
        for (const c of report.cells) {
          if (c === "future") continue;
          past++;
          if (c !== "absent") present++;
        }
      }
      const responses = data.items
        .filter((i) => {
          const at = respondedAtOf(i);
          return i.decidedBy === userId && at !== null && tracked.some((o) => at >= workCountFrom(o, occurrences) && at < o.end);
        })
        .map((i) => Math.max(0, Math.round(((respondedAtOf(i) as number) - i.waitingSince) / MINUTE)))
        .sort((a, b) => a - b);
      const mid = Math.floor(responses.length / 2);
      const days = Array.from({ length: 7 }, (_, d) => {
        const key = addDays(firstKey, d);
        const dayReports = reports.filter((r) => r.occ.dutyDate === key && r.report.presence.presentPct !== null);
        if (dayReports.length === 0) return null;
        return Math.round(dayReports.reduce((a, r) => a + (r.report.presence.presentPct as number), 0) / dayReports.length);
      });
      const name = names.get(userId) ?? "بلا اسم";
      return {
        userId: viewer.access === "lead" ? userId : null,
        name,
        initial: initialOf(name),
        live: occs.some((o) => o.start <= now && now < o.end),
        shiftsAttended: reports.filter((r) => r.report.presence.firstActivityAt !== null).length,
        shiftsScheduled: reports.length,
        presentPct: past ? Math.round((present / past) * 100) : null,
        published: reports.reduce((a, r) => a + r.report.published, 0),
        responseMedianMin: responses.length ? (responses.length % 2 ? responses[mid] : Math.round((responses[mid - 1] + responses[mid]) / 2)) : null,
        leftAtHandoff: reports.reduce((a, r) => a + (r.report.leftAtHandoff ?? 0), 0),
        days,
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    return { access: viewer.access, from: firstKey, to: todayKey, rows };
  });
}

// ---------- الجدول ----------

export async function getDutyRoster(viewer: DutyViewer, requestedWeek: string | null): Promise<ContentDutyRosterResponse> {
  const now = Date.now();
  const today = riyadhDateKey(now);
  const weekStart = requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) ? weekStartKey(requestedWeek) : weekStartKey(today);
  const from = riyadhMidnight(weekStart);
  const to = from + 7 * DAY;
  const shifts = await listActiveShifts();
  const exceptions = await listExceptions(addDays(weekStart, -1), addDays(weekStart, 7));
  const occurrences = expandOccurrences(shifts, exceptions, from, to);
  const people = Array.from(new Set([...shifts.map((s) => s.userId), ...exceptions.flatMap((e) => [e.userId, ...(e.coverUserId ? [e.coverUserId] : [])])]));
  const [names, thresholds, candidates, alertSettings] = await Promise.all([
    loadNames(people),
    getThresholds(),
    viewer.access === "lead" ? listDutyCandidates() : Promise.resolve([]),
    viewer.access === "lead" ? getAlertSettings() : Promise.resolve(null),
  ]);
  const gaps = coverageGaps(occurrences, weekStart);
  const order = shifts.map((s) => s.userId).filter((id, i, a) => a.indexOf(id) === i);
  people.forEach((id) => !order.includes(id) && order.push(id));
  const showId = viewer.access === "lead";
  const opaque = (id: string) => (showId ? id : `p${order.indexOf(id)}`);
  return {
    access: viewer.access,
    weekStart,
    today,
    nowMinute: Math.floor((now - riyadhMidnight(today)) / MINUTE),
    people: order.map((id, i) => ({ userId: opaque(id), name: names.get(id) ?? "بلا اسم", colorIndex: i })),
    shifts: shifts.map((s) => ({ id: showId ? s.id : `s${shifts.indexOf(s)}`, userId: opaque(s.userId), name: names.get(s.userId) ?? "بلا اسم", days: s.days, startMinute: s.startMinute, endMinute: s.endMinute })),
    exceptions: exceptions.filter((e) => e.dutyDate >= weekStart && e.dutyDate < addDays(weekStart, 7)).map((e) => ({
      id: showId ? e.id : "",
      dutyDate: e.dutyDate,
      userId: opaque(e.userId),
      name: names.get(e.userId) ?? "بلا اسم",
      coverUserId: e.coverUserId ? opaque(e.coverUserId) : null,
      coverName: e.coverUserId ? names.get(e.coverUserId) ?? "بلا اسم" : null,
      note: showId ? e.note : null,
      startMinute: e.startMinute ?? null,
      endMinute: e.endMinute ?? null,
    })),
    blocks: rosterBlocks(occurrences, weekStart).map((b) => ({ ...b, userId: opaque(b.userId) })),
    gaps,
    gapMinutes: gaps.reduce((a, g) => a + (g.endMinute - g.startMinute), 0),
    candidates,
    thresholds,
    alerts: alertSettings
      ? { settings: alertSettings, webhookConfigured: Boolean((process.env.DUTY_ALERT_WEBHOOK_URL ?? "").trim()) }
      : null,
  };
}

/** حذف دقائق النشاط الأقدم من 90 يومًا (من مهمة القائد). */
export async function pruneStaffActivity(days = 90): Promise<void> {
  await db.delete(staffActivityMinutes).where(lt(staffActivityMinutes.minute, new Date(Date.now() - days * DAY)));
}
