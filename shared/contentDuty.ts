// «غرفة المناوبة»: منطق مناوبات إدارة المحتوى ومؤشراتها، بلا قاعدة بيانات.
// الخادم يحمّل البيانات ثم يحسب هنا؛ الاختبارات في tests/unit/contentDuty*.test.ts.
// كل الأوقات بالمللي ثانية UTC، والأيام والساعات بتوقيت الرياض (UTC+3 بلا توقيت صيفي).

export const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
export const DUTY_CELL_MINUTES = 5;

export const DUTY_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export interface DutyShiftRule {
  id: string;
  userId: string;
  /** الأحد = 0 */
  days: number[];
  /** دقائق من منتصف ليل الرياض */
  startMinute: number;
  /** end <= start: تمتد إلى اليوم التالي */
  endMinute: number;
}

export interface DutyExceptionRule {
  id: string;
  /** YYYY-MM-DD بتوقيت الرياض: يوم بداية الوردية */
  dutyDate: string;
  userId: string;
  /** فارغ = إجازة بلا بديل */
  coverUserId: string | null;
}

export interface DutyOccurrence {
  key: string;
  shiftId: string;
  /** من يعمل فعلًا */
  userId: string;
  /** صاحب الوردية الأصلي إن غطّاها غيره */
  coveredUserId: string | null;
  dutyDate: string;
  start: number;
  end: number;
}

export interface DutyThresholds {
  breakingWaitMin: number;
  normalWaitMin: number;
  gapMin: number;
  lateStartMin: number;
}

export const DEFAULT_DUTY_THRESHOLDS: DutyThresholds = {
  breakingWaitMin: 15,
  normalWaitMin: 30,
  gapMin: 15,
  lateStartMin: 10,
};

export function normalizeThresholds(raw: unknown): DutyThresholds {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof DutyThresholds) => {
    const n = Number(value[key]);
    return Number.isInteger(n) && n >= 1 && n <= 240 ? n : DEFAULT_DUTY_THRESHOLDS[key];
  };
  return {
    breakingWaitMin: pick("breakingWaitMin"),
    normalWaitMin: pick("normalWaitMin"),
    gapMin: pick("gapMin"),
    lateStartMin: pick("lateStartMin"),
  };
}

// ---------- التقويم ----------

export function riyadhDateKey(ms: number): string {
  return new Date(ms + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

export function riyadhMidnight(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00Z`) - RIYADH_OFFSET_MS;
}

export function riyadhWeekday(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

export function addDays(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** الأحد الذي يبدأ به أسبوع التاريخ المعطى. */
export function weekStartKey(dateKey: string): string {
  return addDays(dateKey, -riyadhWeekday(dateKey));
}

export function riyadhClock(ms: number): string {
  const d = new Date(ms + RIYADH_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function minuteLabel(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  const h = minute === 1440 ? 24 : Math.floor(m / 60);
  return `${String(h).padStart(2, "0")}:${String(minute === 1440 ? 0 : m % 60).padStart(2, "0")}`;
}

export function shiftDurationMinutes(rule: Pick<DutyShiftRule, "startMinute" | "endMinute">): number {
  const end = rule.endMinute <= rule.startMinute ? rule.endMinute + 1440 : rule.endMinute;
  return end - rule.startMinute;
}

export function validateShiftInput(input: { days: unknown; startMinute: unknown; endMinute: unknown }): string | null {
  const days = input.days;
  if (!Array.isArray(days) || days.length === 0 || days.length > 7) return "اختر يومًا واحدًا على الأقل";
  if (!days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return "أيام غير صالحة";
  if (new Set(days).size !== days.length) return "يوم مكرر";
  const start = Number(input.startMinute);
  const end = Number(input.endMinute);
  if (!Number.isInteger(start) || start < 0 || start > 1439) return "وقت البداية غير صالح";
  if (!Number.isInteger(end) || end < 0 || end > 1440) return "وقت النهاية غير صالح";
  if (start === end % 1440) return "البداية والنهاية متطابقتان";
  return null;
}

/** كل الورديات التي تتقاطع مع [from, to)، بعد تطبيق الإجازات والتغطيات. */
export function expandOccurrences(
  shifts: readonly DutyShiftRule[],
  exceptions: readonly DutyExceptionRule[],
  from: number,
  to: number,
): DutyOccurrence[] {
  const out: DutyOccurrence[] = [];
  const firstKey = addDays(riyadhDateKey(from), -1);
  const lastKey = riyadhDateKey(to);
  for (let key = firstKey; key <= lastKey; key = addDays(key, 1)) {
    const weekday = riyadhWeekday(key);
    const midnight = riyadhMidnight(key);
    for (const shift of shifts) {
      if (!shift.days.includes(weekday)) continue;
      const start = midnight + shift.startMinute * MINUTE;
      const end = start + shiftDurationMinutes(shift) * MINUTE;
      if (end <= from || start >= to) continue;
      const exception = exceptions.find((e) => e.dutyDate === key && e.userId === shift.userId);
      if (exception && !exception.coverUserId) continue;
      const userId = exception?.coverUserId ?? shift.userId;
      out.push({
        key: `${shift.id}:${key}`,
        shiftId: shift.id,
        userId,
        coveredUserId: exception ? shift.userId : null,
        dutyDate: key,
        start,
        end,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start || a.userId.localeCompare(b.userId));
}

/** ساعات الأسبوع التي لا يغطيها أحد، مقطعة على أيام الرياض. */
export function coverageGaps(occurrences: readonly DutyOccurrence[], weekStart: string): Array<{ dutyDate: string; startMinute: number; endMinute: number }> {
  const gaps: Array<{ dutyDate: string; startMinute: number; endMinute: number }> = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(weekStart, i);
    const dayStart = riyadhMidnight(key);
    const covered = new Uint8Array(1440);
    for (const occ of occurrences) {
      const a = Math.max(0, Math.floor((occ.start - dayStart) / MINUTE));
      const b = Math.min(1440, Math.ceil((occ.end - dayStart) / MINUTE));
      for (let m = a; m < b; m++) covered[m] = 1;
    }
    let runStart = -1;
    for (let m = 0; m <= 1440; m++) {
      const free = m < 1440 && covered[m] === 0;
      if (free && runStart < 0) runStart = m;
      if (!free && runStart >= 0) {
        gaps.push({ dutyDate: key, startMinute: runStart, endMinute: m });
        runStart = -1;
      }
    }
  }
  return gaps;
}

// ---------- الحضور ----------

export type ActivityKind = "view" | "action";
export type DutyCellState = "action" | "view" | "absent" | "future" | "untracked";

/**
 * خانة لكل 5 دقائق: action إن كتب فيها، view إن كان متصلًا فقط، absent إن غاب.
 * untracked: قبل بدء تسجيل الحضور (trackedFrom)، فلا يُحكم فيها بغياب.
 */
export function buildPresenceCells(
  occ: Pick<DutyOccurrence, "start" | "end">,
  minutes: ReadonlyMap<number, ActivityKind>,
  now: number,
  cellMinutes = DUTY_CELL_MINUTES,
  trackedFrom = Number.NEGATIVE_INFINITY,
): DutyCellState[] {
  const cells: DutyCellState[] = [];
  const cellMs = cellMinutes * MINUTE;
  for (let t = occ.start; t < occ.end; t += cellMs) {
    if (t >= now) {
      cells.push("future");
      continue;
    }
    if (t + cellMs <= trackedFrom) {
      cells.push("untracked");
      continue;
    }
    let state: DutyCellState = "absent";
    for (let m = t; m < t + cellMs && m < now; m += MINUTE) {
      const kind = minutes.get(m);
      if (kind === "action") {
        state = "action";
        break;
      }
      if (kind === "view") state = "view";
    }
    cells.push(state);
  }
  return cells;
}

export interface PresenceSummary {
  /** null: لم يبدأ وقت الوردية بعد */
  presentPct: number | null;
  firstActivityAt: number | null;
  lastActivityAt: number | null;
  lateStartMin: number;
  longestGap: { start: number; end: number; minutes: number } | null;
  earlyLeaveMin: number | null;
}

export function summarizePresence(
  occ: Pick<DutyOccurrence, "start" | "end">,
  cells: readonly DutyCellState[],
  minutes: ReadonlyMap<number, ActivityKind>,
  now: number,
  cellMinutes = DUTY_CELL_MINUTES,
): PresenceSummary {
  const past = cells.filter((c) => c !== "future" && c !== "untracked");
  const untrackedCells = cells.findIndex((c) => c !== "untracked");
  // لا خانة متتبعة إطلاقًا (الوردية كلها قبل بدء التسجيل): لا تأخر ولا انقطاع.
  const trackedStart = untrackedCells < 0 ? occ.end : occ.start + untrackedCells * cellMinutes * MINUTE;
  const present = past.filter((c) => c === "action" || c === "view").length;
  let first: number | null = null;
  let last: number | null = null;
  const until = Math.min(occ.end, now);
  for (let m = occ.start; m < until; m += MINUTE) {
    if (minutes.has(m)) {
      if (first === null) first = m;
      last = m;
    }
  }
  const elapsedMin = Math.max(0, Math.floor((until - occ.start) / MINUTE));
  // قبل بدء التسجيل لا نعرف متى بدأ، فلا يُحسب تأخر.
  const lateStartMin = trackedStart > occ.start ? 0
    : first === null ? elapsedMin : Math.round((first - occ.start) / MINUTE);

  let longestGap: PresenceSummary["longestGap"] = null;
  let run = 0;
  for (let i = 0; i <= past.length; i++) {
    if (i < past.length && past[i] === "absent") {
      run++;
      continue;
    }
    if (run > 0) {
      const minutesGap = run * cellMinutes;
      if (!longestGap || minutesGap > longestGap.minutes) {
        const start = trackedStart + (i - run) * cellMinutes * MINUTE;
        longestGap = { start, end: Math.min(start + minutesGap * MINUTE, until), minutes: minutesGap };
      }
      run = 0;
    }
  }
  const ended = now >= occ.end;
  const earlyLeaveMin = ended ? (last === null ? null : Math.max(0, Math.round((occ.end - (last + MINUTE)) / MINUTE))) : null;
  return {
    presentPct: past.length === 0 ? null : Math.round((present / past.length) * 100),
    firstActivityAt: first,
    lastActivityAt: last,
    lateStartMin: Math.max(0, lateStartMin),
    longestGap,
    earlyLeaveMin,
  };
}

export type LiveStatus = "active" | "idle" | "away";

/** نشِط = كتب خلال 10 دقائق؛ متصل = طلب قراءة خلال 10 دقائق؛ غير ذلك غائب. */
export function liveStatus(minutes: ReadonlyMap<number, ActivityKind>, now: number): LiveStatus {
  let seen = false;
  const base = Math.floor(now / MINUTE) * MINUTE;
  for (let m = base; m > base - 10 * MINUTE; m -= MINUTE) {
    const kind = minutes.get(m);
    if (kind === "action") return "active";
    if (kind === "view") seen = true;
  }
  return seen ? "idle" : "away";
}

// ---------- المواد التي تنتظر قرار المناوب ----------

export interface DeskArticle {
  id: string;
  title: string;
  breaking: boolean;
  /** صاحب المادة: submitter_id ثم author_id */
  ownerId: string | null;
  createdAt: number;
  status: string;
  reviewStatus: string | null;
  reviewedAt: number | null;
  reviewedBy: string | null;
}

export interface VersionEvent {
  articleId: string;
  actorId: string | null;
  action: string;
  at: number;
}

export interface DeskItem {
  articleId: string;
  title: string;
  breaking: boolean;
  waitingSince: number;
  decidedAt: number | null;
  decidedBy: string | null;
}

/**
 * مادة تنتظر قرارًا = مسودة مرسلة للمراجعة، أو مادة نشرها أو راجعها غير صاحبها.
 * يبدأ الانتظار من آخر حفظ لصاحبها قبل القرار (وإلا من إنشائها)، وينتهي بأول نشر
 * أو مراجعة من غيره.
 */
export function buildDeskItems(articles: readonly DeskArticle[], versions: readonly VersionEvent[]): DeskItem[] {
  const byArticle = new Map<string, VersionEvent[]>();
  for (const v of versions) {
    const list = byArticle.get(v.articleId) ?? [];
    list.push(v);
    byArticle.set(v.articleId, list);
  }
  const items: DeskItem[] = [];
  for (const article of articles) {
    const events = (byArticle.get(article.id) ?? []).slice().sort((a, b) => a.at - b.at);
    const pendingNow = article.status === "draft" && article.reviewStatus === "pending_review";
    let decidedAt: number | null = null;
    let decidedBy: string | null = null;
    if (!pendingNow) {
      const publish = events.find((e) => e.action === "published" && e.actorId && e.actorId !== article.ownerId);
      if (publish) {
        decidedAt = publish.at;
        decidedBy = publish.actorId;
      }
      if (article.reviewedAt && article.reviewedBy && article.reviewedBy !== article.ownerId && (decidedAt === null || article.reviewedAt < decidedAt)) {
        decidedAt = article.reviewedAt;
        decidedBy = article.reviewedBy;
      }
      if (decidedAt === null) continue;
    }
    const limit = decidedAt ?? Number.POSITIVE_INFINITY;
    let waitingSince = article.createdAt;
    for (const e of events) {
      if (e.at > limit) break;
      if (article.ownerId && e.actorId === article.ownerId && e.action !== "published") waitingSince = e.at;
    }
    if (decidedAt !== null && waitingSince > decidedAt) waitingSince = decidedAt;
    items.push({ articleId: article.id, title: article.title, breaking: article.breaking, waitingSince, decidedAt, decidedBy });
  }
  return items;
}

/**
 * نشر لم يُسجَّل ناشره (النشر المجدول، البوت المشترك، أو مسار لا يسجّل الحدث) يُنسب
 * لآخر من حفظ المادة قبل نشرها: هو من حرّرها أو جدولها واتخذ قرار نشرها.
 */
export function attributeUnclaimedPublishes(
  published: ReadonlyArray<{ id: string; ownerId: string | null; publishedAt: number | null }>,
  versions: readonly VersionEvent[],
): VersionEvent[] {
  const byArticle = new Map<string, VersionEvent[]>();
  for (const v of versions) {
    const list = byArticle.get(v.articleId) ?? [];
    list.push(v);
    byArticle.set(v.articleId, list);
  }
  const out: VersionEvent[] = [];
  for (const a of published) {
    if (a.publishedAt === null) continue;
    const at = a.publishedAt;
    const events = byArticle.get(a.id) ?? [];
    const claimed = events.some((e) => e.action === "published" && e.actorId && Math.abs(e.at - at) <= 10 * MINUTE);
    if (claimed) continue;
    const handler = events
      .filter((e) => e.actorId && e.at <= at + MINUTE && e.action !== "published")
      .sort((x, y) => y.at - x.at)[0];
    if (handler) out.push({ articleId: a.id, actorId: handler.actorId, action: "published", at });
  }
  return out;
}

export function waitingAt(items: readonly DeskItem[], t: number): DeskItem[] {
  return items.filter((i) => i.waitingSince <= t && (i.decidedAt === null || i.decidedAt > t));
}

export function isOverdue(item: Pick<DeskItem, "breaking" | "waitingSince">, t: number, th: DutyThresholds): boolean {
  const limit = (item.breaking ? th.breakingWaitMin : th.normalWaitMin) * MINUTE;
  return t - item.waitingSince > limit;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// ---------- تقرير الوردية ----------

export interface ShiftReport {
  cells: DutyCellState[];
  presence: PresenceSummary;
  published: number;
  edits: number;
  reviews: number;
  /** وسيط الدقائق من الإرسال إلى قرار هذا المدير */
  responseMedianMin: number | null;
  /** النقاط فوق الشريط: دقائق من بداية الوردية */
  ticks: Array<{ offsetMin: number; breaking: boolean }>;
  /** نشر + تعديل + مراجعة في كل ساعة؛ null للساعات القادمة */
  hourly: Array<number | null>;
  /** عدد المنتظر كل 10 دقائق من بداية الوردية حتى الآن أو نهايتها */
  backlog: number[];
  peakBacklog: number;
  /** ما تجاوز الحد عند نهاية الوردية (للوردية المنتهية فقط) */
  leftAtHandoff: number | null;
  breakingFast: number;
}

export interface ShiftReportInput {
  occ: Pick<DutyOccurrence, "start" | "end" | "userId">;
  now: number;
  minutes: ReadonlyMap<number, ActivityKind>;
  /** نسخ المواد التي حفظها هذا المدير (بلا الحفظ التلقائي) */
  ownVersions: readonly VersionEvent[];
  /** مراجعات مقالات الرأي التي سجّلها (reviewed_at) */
  ownReviews: readonly number[];
  items: readonly DeskItem[];
  breakingIds: ReadonlySet<string>;
  thresholds: DutyThresholds;
  /** بداية تسجيل الحضور؛ ما قبلها لا يُعدّ غيابًا */
  trackedFrom?: number;
}

export function computeShiftReport(input: ShiftReportInput): ShiftReport {
  const { occ, now, minutes, thresholds } = input;
  const until = Math.min(occ.end, now);
  const cells = buildPresenceCells(occ, minutes, now, DUTY_CELL_MINUTES, input.trackedFrom);
  const presence = summarizePresence(occ, cells, minutes, now);
  const inWindow = (t: number) => t >= occ.start && t < until;

  const own = input.ownVersions.filter((v) => inWindow(v.at));
  // المادة الواحدة تُعدّ مرة في الوردية حتى لو سُجّل نشرها في أكثر من سجل أو أعيد نشرها.
  const seenPublish = new Set<string>();
  const publishes = own
    .filter((v) => v.action === "published")
    .sort((a, b) => a.at - b.at)
    .filter((v) => (seenPublish.has(v.articleId) ? false : (seenPublish.add(v.articleId), true)));
  const edits = own.filter((v) => v.action !== "published");
  const reviews = input.ownReviews.filter(inWindow);

  const hours = Math.ceil((occ.end - occ.start) / (60 * MINUTE));
  const hourly: Array<number | null> = Array.from({ length: hours }, (_, h) => (occ.start + h * 60 * MINUTE >= now ? null : 0));
  const bump = (t: number) => {
    const h = Math.floor((t - occ.start) / (60 * MINUTE));
    if (h >= 0 && h < hours && hourly[h] !== null) hourly[h] = (hourly[h] as number) + 1;
  };
  publishes.forEach((v) => bump(v.at));
  edits.forEach((v) => bump(v.at));
  reviews.forEach(bump);

  const decided = input.items.filter((i) => i.decidedBy === occ.userId && i.decidedAt !== null && inWindow(i.decidedAt));
  const responseMedianMin = median(decided.map((i) => Math.max(0, Math.round(((i.decidedAt as number) - i.waitingSince) / MINUTE))));
  const breakingFast = decided.filter((i) => i.breaking && (i.decidedAt as number) - i.waitingSince <= thresholds.breakingWaitMin * MINUTE).length;

  const backlog: number[] = [];
  for (let t = occ.start; t <= until; t += 10 * MINUTE) backlog.push(waitingAt(input.items, t).length);
  if (until > occ.start && (until - occ.start) % (10 * MINUTE) !== 0) backlog.push(waitingAt(input.items, until).length);

  const leftAtHandoff = now >= occ.end
    ? waitingAt(input.items, occ.end).filter((i) => isOverdue(i, occ.end, thresholds)).length
    : null;

  return {
    cells,
    presence,
    published: publishes.length,
    edits: edits.length,
    reviews: reviews.length,
    responseMedianMin,
    ticks: publishes.map((v) => ({ offsetMin: Math.round((v.at - occ.start) / MINUTE), breaking: input.breakingIds.has(v.articleId) })),
    hourly,
    backlog,
    peakBacklog: backlog.reduce((a, b) => Math.max(a, b), 0),
    leftAtHandoff,
    breakingFast,
  };
}

export interface ShiftAverages {
  shifts: number;
  presentPct: number | null;
  published: number | null;
  responseMedianMin: number | null;
  longestGapMin: number | null;
  lateStartMin: number | null;
}

export function averageReports(reports: readonly ShiftReport[]): ShiftAverages {
  const avg = (values: Array<number | null>) => {
    const v = values.filter((x): x is number => typeof x === "number");
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  return {
    shifts: reports.length,
    presentPct: avg(reports.map((r) => r.presence.presentPct)),
    published: avg(reports.map((r) => r.published)),
    responseMedianMin: avg(reports.map((r) => r.responseMedianMin)),
    longestGapMin: avg(reports.map((r) => r.presence.longestGap?.minutes ?? 0)),
    lateStartMin: avg(reports.map((r) => r.presence.lateStartMin)),
  };
}

// ---------- عقود الواجهة ----------

export type DutyAccess = "lead" | "manager" | "staff";

export interface DutyPerson {
  userId: string | null;
  name: string;
  initial: string;
}

export interface ContentDutyCardEntry extends DutyPerson {
  status: LiveStatus;
  /** بتوقيت الرياض؛ الواجهة تعرض startMs/endMs بتوقيت جهاز المشاهد */
  start: string;
  end: string;
  startMs?: number;
  endMs?: number;
  remainingMin: number;
  elapsedPct: number;
  coveredName: string | null;
  published: number | null;
  cells: DutyCellState[] | null;
}

export interface ContentDutyCardResponse {
  access: DutyAccess;
  generatedAt: string;
  onDuty: ContentDutyCardEntry[];
  next: { name: string; start: string; startMs?: number; startsInMin: number } | null;
  waiting: { count: number; overdue: number } | null;
  alert: { articleId: string; title: string; waitMin: number; breaking: boolean; opened: boolean } | null;
}

export interface WaitingDraft {
  articleId: string;
  title: string;
  breaking: boolean;
  waitMin: number;
  overdue: boolean;
  submitter: string | null;
  category: string | null;
  openedBy: string | null;
}

export interface ShiftOption {
  key: string;
  /** بتوقيت الرياض؛ الواجهة تبني نصها من name/startMs/endMs بتوقيت جهاز المشاهد */
  label: string;
  live: boolean;
  name?: string;
  startMs?: number;
  endMs?: number;
}

export interface ContentDutyRoomResponse {
  access: DutyAccess;
  generatedAt: string;
  options: ShiftOption[];
  shift: null | {
    key: string;
    person: DutyPerson;
    coveredName: string | null;
    live: boolean;
    status: LiveStatus | null;
    dutyDate: string;
    start: string;
    end: string;
    startMs: number;
    endMs: number;
    nowMs: number;
    remainingMin: number;
    elapsedPct: number;
    report: ShiftReport;
    averages: ShiftAverages;
    lastAction: { title: string; at: string; atMs?: number } | null;
    next: { name: string; start: string; startMs?: number; pendingToHandOver: number } | null;
    waiting: WaitingDraft[];
  };
  thresholds: DutyThresholds;
}

export interface ContentDutyTeamRow extends DutyPerson {
  live: boolean;
  shiftsAttended: number;
  shiftsScheduled: number;
  presentPct: number | null;
  published: number;
  responseMedianMin: number | null;
  leftAtHandoff: number;
  /** حضور كل يوم من آخر 7 أيام (null = بلا وردية) */
  days: Array<number | null>;
}

export interface ContentDutyTeamResponse {
  access: DutyAccess;
  from: string;
  to: string;
  rows: ContentDutyTeamRow[];
}

export interface RosterShiftView {
  id: string;
  userId: string;
  name: string;
  days: number[];
  startMinute: number;
  endMinute: number;
}

export interface RosterExceptionView {
  id: string;
  dutyDate: string;
  userId: string;
  name: string;
  coverUserId: string | null;
  coverName: string | null;
  note: string | null;
}

export interface ContentDutyRosterResponse {
  access: DutyAccess;
  weekStart: string;
  today: string;
  nowMinute: number;
  people: Array<{ userId: string; name: string; colorIndex: number }>;
  shifts: RosterShiftView[];
  exceptions: RosterExceptionView[];
  blocks: Array<{ dutyDate: string; userId: string; startMinute: number; endMinute: number; covering: boolean; carry: boolean }>;
  gaps: Array<{ dutyDate: string; startMinute: number; endMinute: number }>;
  gapMinutes: number;
  candidates: Array<{ userId: string; name: string }>;
  thresholds: DutyThresholds;
}

/** يقطع ورديات الأسبوع على أيام الرياض للرسم (الليلية تظهر في يومين). */
export function rosterBlocks(occurrences: readonly DutyOccurrence[], weekStart: string): ContentDutyRosterResponse["blocks"] {
  const blocks: ContentDutyRosterResponse["blocks"] = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(weekStart, i);
    const dayStart = riyadhMidnight(key);
    const dayEnd = dayStart + DAY;
    for (const occ of occurrences) {
      if (occ.end <= dayStart || occ.start >= dayEnd) continue;
      blocks.push({
        dutyDate: key,
        userId: occ.userId,
        startMinute: Math.max(0, Math.round((occ.start - dayStart) / MINUTE)),
        endMinute: Math.min(1440, Math.round((occ.end - dayStart) / MINUTE)),
        covering: occ.coveredUserId !== null,
        carry: occ.start < dayStart,
      });
    }
  }
  return blocks;
}

export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? "؟";
}
