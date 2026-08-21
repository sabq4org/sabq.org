/**
 * حارس حالة المباراة: يمنع إعلان «انتهت» قبل أن يكون الوقت الأصلي قد اكتمل فعلًا.
 *
 * المزودون (TheSports / API-Football) يرسلون أحيانًا FT عند صافرة الشوط الأول
 * أو عند الخروج من الاستراحة (~د45–47). تركيب `ts.finished || af.finished`
 * كان يثبّت الشارة ويُطلق إشعار النهاية بينما الشوط الثاني بدأ.
 */
import { isEnglishSports } from "./sportsLang";
import {
  WC_FINISHED_STATUSES,
  WC_LIVE_STATUSES,
  WC_STATUS_AR,
  WC_STATUS_EN,
} from "./worldCupNames";

/** أقل زمن لعب يُقبل معه صافرة نهاية حقيقية (يستبعد الشوط الأول والاستراحة وبداية الشوط الثاني). */
export const MIN_FULLTIME_PLAYED_MINUTES = 80;

/**
 * أقل زمن حائط منذ الانطلاق قبل قبول FT.
 * ش1 (~45+بدل) + استراحة (~15) + ش2 لا يكتمل قبل ~100 دقيقة تقويمية.
 * بدونه يثبّت المزود elapsed=90 مع FT عند الاستراحة فتمرّ حادثة د47–د80.
 */
export const MIN_MINUTES_AFTER_KICKOFF_FOR_FT = 100;

/** نافذة التركيب الحيّ: 3 ساعات بعد الانطلاق حتى 10 دقائق قبله — بلا شرط !finished. */
export function isWithinLiveOverlayWindow(
  kickoffTs: number,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  return kickoffTs <= nowSec + 600 && kickoffTs >= nowSec - 3 * 3600;
}

const ADMIN_FINISHED_CODES = new Set(["AWD", "WO"]);

/** رموز TheSports في detail_live / MQTT — 8 = نهاية المباراة فقط وفق توثيق الطبقة. */
const TS_STATUS_ID_TO_CODE: Record<number, string> = {
  2: "1H",
  3: "HT",
  4: "2H",
  5: "ET",
  6: "ET",
  7: "P",
  8: "FT",
};

export type MatchProgress = {
  code: string;
  label: string;
  elapsed: number | null;
  extra: number | null;
  live: boolean;
  finished: boolean;
};

export type LiveStatusOverlay = {
  live?: boolean;
  finished?: boolean;
  elapsed?: number | null;
  extra?: number | null;
  /** رمز TheSports الرقمي إن وُجد. */
  statusId?: number;
  statusCode?: string;
  /** أحدث دقيقة حدث مرصودة (هدف/بطاقة/…) — تكشف شوطًا ثانيًا حتى لو الساعة ضاعت. */
  latestEventMinute?: number | null;
  /** Unix ثوانٍ لانطلاقة المباراة — لرفض FT قبل اكتمال الوقت التقويمي. */
  kickoffTs?: number | null;
  nowSec?: number;
};

function playedMinutes(
  elapsed?: number | null,
  extra?: number | null,
  latestEventMinute?: number | null,
): number {
  const clock = Math.max(elapsed ?? 0, 0) + Math.max(extra ?? 0, 0);
  return Math.max(clock, latestEventMinute ?? 0);
}

export function isPlausibleFootballFullTime(input: {
  elapsed?: number | null;
  extra?: number | null;
  statusCode?: string | null;
  latestEventMinute?: number | null;
  kickoffTs?: number | null;
  nowSec?: number;
}): boolean {
  const code = (input.statusCode || "").toUpperCase();
  if (ADMIN_FINISHED_CODES.has(code)) return true;

  if (input.kickoffTs) {
    const now = input.nowSec ?? Math.floor(Date.now() / 1000);
    const sinceKickoffMin = (now - input.kickoffTs) / 60;
    if (sinceKickoffMin >= 0 && sinceKickoffMin < MIN_MINUTES_AFTER_KICKOFF_FOR_FT) {
      return false;
    }
  }

  const played = playedMinutes(input.elapsed, input.extra, input.latestEventMinute);
  if (played > 0) return played >= MIN_FULLTIME_PLAYED_MINUTES;

  // بلا ساعة ولا أحداث: نثق برمز النهاية للأرشيف (مباريات قديمة بلا elapsed).
  return WC_FINISHED_STATUSES.has(code);
}

export function inferInPlayCode(
  elapsed: number | null | undefined,
  extra: number | null | undefined,
  fallback = "2H",
): string {
  if (elapsed == null || elapsed <= 0) return fallback;
  if (elapsed < 45) return "1H";
  if (elapsed === 45) return extra && extra > 0 ? "1H" : "HT";
  if (elapsed <= 90) return "2H";
  if (elapsed <= 120) return "ET";
  return "P";
}

function overlayCode(overlay?: LiveStatusOverlay | null): string | undefined {
  if (!overlay) return undefined;
  if (overlay.statusCode) return overlay.statusCode;
  if (overlay.statusId != null) return TS_STATUS_ID_TO_CODE[overlay.statusId];
  return undefined;
}

function labelFor(code: string, fallback: string): string {
  const dict = isEnglishSports() ? WC_STATUS_EN : WC_STATUS_AR;
  return dict[code] ?? fallback;
}

function inPlayCode(code: string): boolean {
  return WC_LIVE_STATUSES.has(code);
}

/**
 * يدمج حالة الأساس (عادة API-Football) مع طبقة لحظية (TheSports/SportMonks)
 * دون أن تسرق ومضة FT كاذبة شارة «انتهت» أو إشعار النهاية.
 *
 * قواعد الغلبة:
 *   1) المصدر الحيّ يُلغي أي نهاية.
 *   2) النهاية لا تُقبل قبل ~80 دقيقة لعب (إلا الحسم الإداري AWD/WO).
 *   3) إن رُفضت النهاية تُستنتج مرحلة اللعب من الدقيقة/رمز الأساس.
 */
export function mergeLiveMatchProgress(
  base: MatchProgress,
  overlay?: LiveStatusOverlay | null,
): MatchProgress {
  const eventMinute = overlay?.latestEventMinute ?? null;
  const kickoffTs = overlay?.kickoffTs ?? null;
  let elapsed = overlay?.elapsed ?? base.elapsed;
  let extra = overlay?.extra ?? base.extra;
  const fromOverlay = overlayCode(overlay);

  const apply = (code: string, live: boolean, finished: boolean): MatchProgress => ({
    code,
    label: labelFor(code, base.label),
    elapsed,
    extra,
    live,
    finished,
  });

  const plausibility = {
    elapsed,
    extra,
    latestEventMinute: eventMinute,
    kickoffTs,
    nowSec: overlay?.nowSec,
  };

  /** إن قفزت ساعة المزود لـ90 بينما الأحداث ما زالت في الشوط الثاني، نعرض دقيقة الحدث. */
  const preferEventClock = () => {
    if (eventMinute != null && eventMinute > 0 && eventMinute < MIN_FULLTIME_PLAYED_MINUTES && (elapsed ?? 0) >= MIN_FULLTIME_PLAYED_MINUTES) {
      elapsed = eventMinute;
      extra = null;
    } else if (eventMinute != null && eventMinute > (elapsed ?? 0)) {
      elapsed = eventMinute;
    }
  };

  if (overlay?.live) {
    const code =
      fromOverlay && fromOverlay !== "FT"
        ? fromOverlay
        : inPlayCode(base.code)
          ? base.code
          : inferInPlayCode(elapsed, extra, "2H");
    return apply(code, true, false);
  }

  if (overlay?.finished) {
    const candidateCode = fromOverlay && WC_FINISHED_STATUSES.has(fromOverlay) ? fromOverlay : "FT";
    if (
      isPlausibleFootballFullTime({
        ...plausibility,
        statusCode: candidateCode,
      })
    ) {
      return apply(candidateCode, false, true);
    }
    preferEventClock();
    const code = inPlayCode(base.code)
      ? base.code
      : inferInPlayCode(elapsed, extra, "2H");
    return apply(code, true, false);
  }

  if (
    base.finished &&
    !isPlausibleFootballFullTime({
      ...plausibility,
      statusCode: base.code,
    })
  ) {
    preferEventClock();
    const code = inferInPlayCode(elapsed, extra, inPlayCode(base.code) ? base.code : "2H");
    return apply(code, true, false);
  }

  return apply(base.code, base.live, base.finished);
}

/** أحدث دقيقة حدث موجبة — تُستخدم لكشف شوط ثانٍ حين يدّعي المزود FT. */
export function latestPositiveEventMinute(
  events: Array<{ minute?: number | null }> | null | undefined,
): number | null {
  if (!events?.length) return null;
  let max = 0;
  for (const e of events) {
    const m = e.minute;
    if (typeof m === "number" && m > max) max = m;
  }
  return max > 0 ? max : null;
}
