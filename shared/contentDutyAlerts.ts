// «عين المناوبة»: تنبيهات ورديات مديري المحتوى لعلي وحده. منطق خالص بلا قاعدة بيانات.
// المحرك (server/services/contentDuty/dutyAlertsEngine.ts) يستدعيه كل دقيقة لكل وردية
// جارية أو انتهت قبل قليل، ويحفظ الناتج بـ ON CONFLICT (dedupe_key) DO NOTHING، فلا يتكرر
// التنبيه ولو عملت نسختان. الاختبارات: tests/unit/contentDutyAlerts*.test.ts.
// كل الأوقات بالمللي ثانية UTC، والساعات بتوقيت الرياض (UTC+3 بلا توقيت صيفي).
import { RIYADH_OFFSET_MS, isOverdue, type ActivityKind, type DeskItem, type DutyOccurrence, type DutyThresholds, type ShiftReport } from "./contentDuty";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const DUTY_ALERT_KINDS = ["started", "late", "absent", "returned", "idle", "breaking_overdue", "summary"] as const;
export type DutyAlertKind = (typeof DUTY_ALERT_KINDS)[number];

export const DUTY_ALERT_LABELS: Record<DutyAlertKind, string> = {
  started: "بدأ العمل",
  late: "لم يبدأ بعد",
  absent: "غاب عن اللوحة",
  returned: "عاد إلى اللوحة",
  idle: "مفتوحة بلا عمل",
  breaking_overdue: "عاجل متأخر",
  summary: "ملخص نهاية الوردية",
};

export interface DutyQuietHours {
  enabled: boolean;
  /** دقائق من منتصف ليل الرياض (تشمل البداية) */
  startMinute: number;
  /** دقائق من منتصف ليل الرياض (لا تشمل النهاية)؛ أصغر من البداية = تعبر منتصف الليل */
  endMinute: number;
}

export interface DutyAlertSettings {
  enabled: Record<DutyAlertKind, boolean>;
  /** دقائق من بداية الوردية بلا أي نشاط قبل «لم يبدأ بعد» */
  lateMin: number;
  /** دقائق متصلة بلا أي طلب على اللوحة قبل «غاب» */
  absentMin: number;
  /** دقائق بلا حفظ ولا نشر واللوحة مفتوحة قبل «بلا عمل» */
  idleMin: number;
  /** ما يتولد فيها يُحفظ مؤجلًا ويُرسل في ملخص واحد عند نهايتها */
  quietHours: DutyQuietHours;
}

export const DEFAULT_DUTY_ALERT_SETTINGS: DutyAlertSettings = {
  enabled: { started: true, late: true, absent: true, returned: true, idle: true, breaking_overdue: true, summary: true },
  lateMin: 15,
  absentMin: 60,
  idleMin: 90,
  quietHours: { enabled: true, startMinute: 2 * 60, endMinute: 6 * 60 },
};

/** لا «لم يبدأ» ولا «غاب» ولا «بلا عمل» في آخر هذه الدقائق من الوردية. */
export const DUTY_ALERT_QUIET_TAIL_MIN = 15;
/** الملخص يُرسل خلال هذه المدة بعد النهاية (لا ملخص لوردية قديمة بعد إعادة تشغيل). */
export const DUTY_SUMMARY_WINDOW_MIN = 20;
/** النشاط قبل بداية الوردية بهذه المدة يُعدّ بداية مبكرة. */
export const DUTY_EARLY_START_MIN = 30;
/** أقصى عدد لتنبيهات الغياب (وكذلك «بلا عمل») في الوردية الواحدة. */
export const DUTY_MAX_ROUNDS = 5;

export function normalizeAlertSettings(raw: unknown): DutyAlertSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const enabledRaw = (value.enabled && typeof value.enabled === "object" ? value.enabled : {}) as Record<string, unknown>;
  const enabled = { ...DEFAULT_DUTY_ALERT_SETTINGS.enabled };
  for (const kind of DUTY_ALERT_KINDS) {
    if (typeof enabledRaw[kind] === "boolean") enabled[kind] = enabledRaw[kind] as boolean;
  }
  const pick = (key: "lateMin" | "absentMin" | "idleMin", min: number) => {
    const n = Number(value[key]);
    return Number.isInteger(n) && n >= min && n <= 240 ? n : DEFAULT_DUTY_ALERT_SETTINGS[key];
  };
  const qRaw = (value.quietHours && typeof value.quietHours === "object" ? value.quietHours : {}) as Record<string, unknown>;
  const def = DEFAULT_DUTY_ALERT_SETTINGS.quietHours;
  const minuteOf = (v: unknown, fallback: number) => {
    const n = Number(v);
    return v !== null && v !== undefined && v !== "" && Number.isInteger(n) && n >= 0 && n <= 1439 ? n : fallback;
  };
  let startMinute = minuteOf(qRaw.startMinute, def.startMinute);
  let endMinute = minuteOf(qRaw.endMinute, def.endMinute);
  if (startMinute === endMinute) {
    startMinute = def.startMinute;
    endMinute = def.endMinute;
  }
  return {
    enabled,
    lateMin: pick("lateMin", 5),
    absentMin: pick("absentMin", 15),
    idleMin: pick("idleMin", 30),
    quietHours: {
      enabled: typeof qRaw.enabled === "boolean" ? qRaw.enabled : def.enabled,
      startMinute,
      endMinute,
    },
  };
}

// ---------- ساعات الهدوء ----------

/** دقيقة اليوم بتوقيت الرياض. */
export function riyadhMinuteOfDay(ms: number): number {
  return Math.floor((((ms + RIYADH_OFFSET_MS) % DAY) + DAY) % DAY / MINUTE);
}

export function inQuietHours(ms: number, q: DutyQuietHours): boolean {
  if (!q.enabled || q.startMinute === q.endMinute) return false;
  const m = riyadhMinuteOfDay(ms);
  return q.startMinute < q.endMinute ? m >= q.startMinute && m < q.endMinute : m >= q.startMinute || m < q.endMinute;
}

/** إن تولد التنبيه في ساعات الهدوء: نهايتها التالية (موعد ملخص الصباح)، وإلا null. */
export function deferredUntilFor(ms: number, q: DutyQuietHours): number | null {
  if (!inQuietHours(ms, q)) return null;
  const m = riyadhMinuteOfDay(ms);
  const minuteStart = Math.floor(ms / MINUTE) * MINUTE;
  const ahead = ((q.endMinute - m) + 1440) % 1440 || 1440;
  return minuteStart + ahead * MINUTE;
}

// ---------- التقييم ----------

export interface SentAlert {
  at: number;
  data: Record<string, unknown>;
}

export interface DutyAlertCandidate {
  kind: DutyAlertKind;
  dedupeKey: string;
  userId: string | null;
  occurrenceKey: string | null;
  data: Record<string, unknown>;
}

export interface OccurrenceAlertInput {
  occ: Pick<DutyOccurrence, "key" | "userId" | "start" | "end">;
  now: number;
  /** دقائق نشاط هذا الموظف (مفتاحها بداية الدقيقة)، من قبل البداية بنصف ساعة على الأقل */
  minutes: ReadonlyMap<number, ActivityKind>;
  /** آخر حفظ أو نشر سجّله في المواد (من سجل النسخ والنشر) */
  lastWorkAt: number | null;
  /** التنبيهات المحفوظة لهذه الوردية، بمفتاح dedupe_key */
  sent: ReadonlyMap<string, SentAlert>;
  settings: DutyAlertSettings;
  /** بداية تسجيل الحضور: لا يُحكم بتأخر أو غياب قبلها */
  trackedFrom?: number;
}

/**
 * مفتاح الوردية في التنبيهات = مفتاح التكرار + من يعمل فعلًا (كما في مفتاح «الغرفة»)،
 * حتى لا يرث البديل تنبيهات صاحب الوردية إن أُضيف الاستثناء أثناءها.
 */
export const occurrenceAlertKey = (occ: Pick<DutyOccurrence, "key" | "userId">) => `${occ.key}:${occ.userId}`;

export const alertKey = (occKey: string, kind: DutyAlertKind, round?: number) =>
  round ? `${occKey}:${kind}:${round}` : `${occKey}:${kind}`;

/**
 * تنبيهات وردية واحدة. «الحضور» = أي طلب للوحة في تلك الدقيقة (اللوحة المفتوحة تحدّث
 * نفسها كل دقيقة فتُحسب حاضرة). «العمل» = حفظ أو نشر أو مراجعة.
 */
export function evaluateOccurrenceAlerts(input: OccurrenceAlertInput): DutyAlertCandidate[] {
  const { occ, now, minutes, sent, settings } = input;
  const occKey = occurrenceAlertKey(occ);
  const out: DutyAlertCandidate[] = [];
  const push = (kind: DutyAlertKind, data: Record<string, unknown>, round?: number) => {
    const dedupeKey = alertKey(occKey, kind, round);
    if (!settings.enabled[kind] || sent.has(dedupeKey)) return;
    out.push({ kind, dedupeKey, userId: occ.userId, occurrenceKey: occKey, data });
  };

  const trackedFrom = input.trackedFrom ?? Number.NEGATIVE_INFINITY;
  const live = now >= occ.start && now < occ.end;
  const quietTail = occ.end - now <= DUTY_ALERT_QUIET_TAIL_MIN * MINUTE;
  const windowStart = occ.start - DUTY_EARLY_START_MIN * MINUTE;
  const until = Math.min(now, occ.end);
  const seen = Array.from(minutes.entries())
    .filter(([t]) => t >= windowStart && t < until)
    .sort((a, b) => a[0] - b[0]);
  const first = seen[0]?.[0] ?? null;
  const last = seen.length ? seen[seen.length - 1][0] : null;
  const lastAction = seen.filter(([, k]) => k === "action").pop()?.[0] ?? null;
  // لا حكم على ما قبل بداية التسجيل: التأخر والغياب يُقاسان من الأحدث بين البداية والتسجيل.
  const measuredFrom = Math.max(occ.start, trackedFrom);
  const untrackedStart = trackedFrom > occ.start;

  if (live && first !== null) {
    push("started", {
      firstAt: first,
      startAt: occ.start,
      lateMin: untrackedStart ? null : Math.max(0, Math.round((first - occ.start) / MINUTE)),
    });
  }
  if (live && !quietTail && first === null && now >= measuredFrom && now - measuredFrom >= settings.lateMin * MINUTE) {
    push("late", { startAt: occ.start, waitedMin: Math.floor((now - occ.start) / MINUTE) });
  }

  // الغياب يتكرر حتى DUTY_MAX_ROUNDS مرات. الجولة تُغلق بأول نشاط بعد بدايتها (حتى لو كان
  // تنبيه «عاد» معطّلًا)، ولا تبدأ جولة جديدة إلا بعد نشاط تالٍ.
  let round = 0;
  while (round < DUTY_MAX_ROUNDS && sent.has(alertKey(occKey, "absent", round + 1))) round++;
  const open = round > 0 ? sent.get(alertKey(occKey, "absent", round)) : undefined;
  const openSince = open ? Number(open.data.since) : Number.NaN;
  const backAt = open && Number.isFinite(openSince) ? seen.find(([t]) => t >= openSince)?.[0] ?? null : null;
  if (open && backAt !== null) {
    push("returned", { since: openSince, backAt, gapMin: Math.round((backAt - openSince) / MINUTE) }, round);
  }
  const absenceClosed = !open || backAt !== null || !Number.isFinite(openSince);
  if (live && !quietTail && absenceClosed && first !== null && last !== null && round < DUTY_MAX_ROUNDS) {
    const since = Math.max(last + MINUTE, measuredFrom);
    const afterReturn = backAt ?? Number.NEGATIVE_INFINITY;
    if (since > afterReturn && now - since >= settings.absentMin * MINUTE) {
      push("absent", { since, minutes: Math.floor((now - since) / MINUTE) }, round + 1);
    }
  }

  // «بلا عمل»: حاضر الآن (طلب خلال 5 دقائق) ولم يحفظ أو ينشر منذ idleMin. جولة جديدة فقط
  // بعد عمل جديد، والمرجع لا يسبق بداية الوردية (الحضور المبكر لا يُعدّ خمولًا).
  if (live && !quietTail && first !== null && last !== null && now - last <= 5 * MINUTE) {
    // دقيقة العمل الأخيرة تنتهي بعد بدايتها بدقيقة (كما يُحسب بدء الغياب من last + دقيقة).
    const workAt = Math.max(lastAction === null ? 0 : lastAction + MINUTE, input.lastWorkAt ?? 0);
    const anchor = Math.max(workAt, first, measuredFrom);
    let idleRound = 0;
    while (idleRound < DUTY_MAX_ROUNDS && sent.has(alertKey(occKey, "idle", idleRound + 1))) idleRound++;
    const prev = idleRound > 0 ? sent.get(alertKey(occKey, "idle", idleRound)) : undefined;
    const prevAnchor = prev ? Number(prev.data.anchor) : Number.NEGATIVE_INFINITY;
    if (idleRound < DUTY_MAX_ROUNDS && anchor > prevAnchor && now - anchor >= settings.idleMin * MINUTE) {
      push("idle", { anchor, lastWorkAt: workAt || null, minutes: Math.floor((now - anchor) / MINUTE) }, idleRound + 1);
    }
  }

  if (now >= occ.end && now - occ.end < DUTY_SUMMARY_WINDOW_MIN * MINUTE) {
    push("summary", { startAt: occ.start, endAt: occ.end });
  }
  return out;
}

export interface BreakingAlertInput {
  items: readonly Pick<DeskItem, "articleId" | "title" | "breaking" | "waitingSince" | "decidedAt">[];
  now: number;
  thresholds: Pick<DutyThresholds, "breakingWaitMin" | "normalWaitMin">;
  /** مواد عليها قفل تحرير ساري (أحد فاتحها) */
  lockedIds: ReadonlySet<string>;
  /** الورديات الجارية الآن؛ بلا وردية جارية لا تنبيه */
  live: ReadonlyArray<Pick<DutyOccurrence, "key" | "userId" | "start" | "end">>;
  sent: ReadonlySet<string>;
  settings: DutyAlertSettings;
}

/** عاجل تجاوز حد الانتظار ولا أحد فاتحه: مرة لكل مادة لكل فترة انتظار، ويُنسب للمناوب الجاري. */
export function evaluateBreakingAlerts(input: BreakingAlertInput): DutyAlertCandidate[] {
  const { now, settings } = input;
  if (!settings.enabled.breaking_overdue) return [];
  const live = input.live.filter((o) => o.start <= now && now < o.end).sort((a, b) => a.start - b.start);
  if (live.length === 0) return [];
  const owner = live[0];
  const out: DutyAlertCandidate[] = [];
  for (const item of input.items) {
    if (!item.breaking) continue;
    if (item.waitingSince > now || (item.decidedAt !== null && item.decidedAt <= now)) continue;
    if (!isOverdue(item, now, input.thresholds as DutyThresholds)) continue;
    if (input.lockedIds.has(item.articleId)) continue;
    const dedupeKey = `breaking:${item.articleId}:${Math.floor(item.waitingSince / MINUTE)}`;
    if (input.sent.has(dedupeKey)) continue;
    out.push({
      kind: "breaking_overdue",
      dedupeKey,
      userId: owner.userId,
      occurrenceKey: occurrenceAlertKey(owner),
      data: {
        articleId: item.articleId,
        title: item.title,
        waitingSince: item.waitingSince,
        waitMin: Math.round((now - item.waitingSince) / MINUTE),
        onDutyUserIds: live.map((o) => o.userId),
      },
    });
  }
  return out;
}

/** أرقام الملخص من تقرير الوردية (computeShiftReport) — حقول موجودة فقط. */
export function summaryDataFromReport(report: ShiftReport, occ: Pick<DutyOccurrence, "start" | "end">): Record<string, unknown> {
  return {
    startAt: occ.start,
    endAt: occ.end,
    published: report.published,
    edits: report.edits,
    reviews: report.reviews,
    presentPct: report.presence.presentPct,
    firstActivityAt: report.presence.firstActivityAt,
    lateStartMin: report.presence.lateStartMin,
    longestGapMin: report.presence.longestGap?.minutes ?? 0,
    earlyLeaveMin: report.presence.earlyLeaveMin,
    responseMedianMin: report.responseMedianMin,
    breakingFast: report.breakingFast,
    peakBacklog: report.peakBacklog,
    leftAtHandoff: report.leftAtHandoff ?? 0,
  };
}

// ---------- النص ----------

export const riyadhTime = (ms: number) => {
  const m = riyadhMinuteOfDay(ms);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** نص عربي جاهز يرسله البوت كما هو إن شاء (والأرقام في data لمن يصوغ رسالته بنفسه). */
export function dutyAlertText(kind: DutyAlertKind, name: string, data: Record<string, unknown>): string {
  const n = (k: string) => Number(data[k]);
  const has = (k: string) => data[k] !== null && data[k] !== undefined && Number.isFinite(Number(data[k]));
  switch (kind) {
    case "started": {
      const late = has("lateMin") && n("lateMin") > 0 ? ` (متأخرًا ${n("lateMin")} دقيقة)` : "";
      return `${name} بدأ العمل على لوحة التحكم ${riyadhTime(n("firstAt"))}، وورديته تبدأ ${riyadhTime(n("startAt"))}${late}.`;
    }
    case "late":
      return `مضت ${n("waitedMin")} دقيقة على بداية وردية ${name} (${riyadhTime(n("startAt"))}) ولم يدخل لوحة التحكم.`;
    case "absent":
      return `لا نشاط لـ${name} على لوحة التحكم منذ ${riyadhTime(n("since"))} (${n("minutes")} دقيقة).`;
    case "returned":
      return `${name} عاد إلى لوحة التحكم ${riyadhTime(n("backAt"))} بعد غياب ${n("gapMin")} دقيقة.`;
    case "idle":
      return `لوحة ${name} مفتوحة، لكنه لم يحفظ أو ينشر شيئًا منذ ${n("minutes")} دقيقة.`;
    case "breaking_overdue":
      return `عاجل ينتظر ${n("waitMin")} دقيقة ولم يفتحه أحد: «${String(data.title ?? "")}» (المناوب: ${name}).`;
    case "summary": {
      const pct = has("presentPct") ? `${n("presentPct")}%` : "—";
      const resp = has("responseMedianMin") ? `، ووسيط الاستجابة ${n("responseMedianMin")} دقيقة` : "";
      const left = has("leftAtHandoff") ? n("leftAtHandoff") : 0;
      return `انتهت وردية ${name} (${riyadhTime(n("startAt"))}–${riyadhTime(n("endAt"))}): نشر ${has("published") ? n("published") : 0}، والحضور ${pct}${resp}، وأطول انقطاع ${has("longestGapMin") ? n("longestGapMin") : 0} دقيقة، وترك ${left} مادة متأخرة للوردية التالية.`;
    }
  }
}

/** نص ملخص الصباح لما تأجل في ساعات الهدوء. */
export function dutyDigestText(items: ReadonlyArray<{ text: string; createdAt: number }>, q: DutyQuietHours): string {
  const head = `ملخص ساعات الهدوء (${riyadhTime(q.startMinute * MINUTE - RIYADH_OFFSET_MS)}–${riyadhTime(q.endMinute * MINUTE - RIYADH_OFFSET_MS)} بتوقيت الرياض): ${items.length} تنبيه.`;
  const lines = items
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((i) => `• ${riyadhTime(i.createdAt)} ${i.text}`);
  return [head, ...lines].join("\n");
}
