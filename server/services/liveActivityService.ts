/**
 * خدمة النشاط المباشر للمباريات (iOS Live Activity — push-to-update).
 *
 * تُدير توكنات الأنشطة المباشرة (live_activity_tokens) وتدفع تحديثات شاشة
 * القفل عبر APNs (apns-push-type: liveactivity) دون فتح التطبيق:
 *   1) registerLiveActivityToken — يسجّله التطبيق فور إصدار ActivityKit للتوكن.
 *   2) endLiveActivityToken      — يلغي التفعيل عند إيقاف المستخدم للمتابعة.
 *   3) runLiveActivityCycle      — دورة العامل: لكل مباراة نشطة، يبني الحالة من
 *      خدمة الرياضة العامة مع طبقة TheSports/SportMonks السريعة، ثم يدفع
 *      التغييرات لكل توكناتها، ويُنهي النشاط عند الانتهاء.
 *
 * مبادئ:
 *   - بيانات المباراة من getMatchDetail المحميّة بـ SWR (لا ضغط زائد على API).
 *   - دفع فقط عند تغيّر الحالة (بصمة JSON) — لتقليل حركة APNs.
 *   - توكنات فاسدة (BadDeviceToken/Unregistered) تُلغى تلقائيًا.
 *   - التحديث صامت (بلا alert)؛ إشعارات «هدف/بدأت» تأتي من sportsAlerts.
 */
import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "../db";
import { liveActivityTokens } from "@shared/schema";
import {
  getMatchDetail,
  SAUDI_COMPETITIONS,
  type SplMatchDetail,
  type SplMatchEvent,
} from "./saudiLeagueService";
import { getLiveScore, type WcLiveScore } from "./sportmonksService";
import {
  getTheSportsMatchLive,
  getTsCompetitionId,
  type TsMatchLive,
} from "./theSportsService";
import {
  sendLiveActivityUpdate,
  isApnsConfigured,
  type LiveActivityContentState,
} from "./apnsService";

// حالات SportMonks اللحظية → نص عربي للبطاقة (أدق وأسرع من API-Football)
const LIVE_STATE_AR: Record<string, string> = {
  INPLAY_1ST_HALF: "الشوط الأول",
  HT: "بين الشوطين",
  BREAK: "استراحة",
  INPLAY_2ND_HALF: "الشوط الثاني",
  INPLAY_ET: "الوقت الإضافي",
  INPLAY_ET_2ND_HALF: "الإضافي الثاني",
  EXTRA_TIME: "الوقت الإضافي",
  PENALTIES: "ركلات الترجيح",
  INPLAY_PENALTIES: "ركلات الترجيح",
  FT: "انتهت",
  AET: "انتهت بعد الإضافي",
  FT_PEN: "انتهت بالترجيح",
};

const TWO_HOURS_SEC = 2 * 3600;
const STALE_LIVE_SEC = 180; // إذا توقّف الدفع، تُعتَّم البطاقة بعد 3 دقائق
const PUSH_CONCURRENCY = 10;

const CLOCK_PAUSED_STATES = new Set([
  "HT",
  "BREAK",
  "PENALTIES",
  "INPLAY_PENALTIES",
  "FT",
  "AET",
  "FT_PEN",
  "AET_PEN",
]);

const TS_STATUS_AR: Record<number, string> = {
  2: "الشوط الأول",
  3: "بين الشوطين",
  4: "الشوط الثاني",
  5: "الوقت الإضافي",
  6: "الإضافي الثاني",
  7: "ركلات الترجيح",
  8: "انتهت",
};

const TS_CLOCK_RUNNING_STATUS = new Set([2, 4, 5, 6]);

// آخر نتيجة معروفة لكل مباراة (في الذاكرة، القائد فقط) — لتحديد أولوية APNs:
// تغيّر النتيجة (هدف) → أولوية 10 فورية؛ تغيّر روتيني (دقيقة/حالة) → أولوية 5
// موفّرة للميزانية. فقدانه عند إعادة التشغيل غير ضار (دفعة واحدة بأولوية 5).
const lastScoreByFixture = new Map<number, string>();

// ============================================================================
// تسجيل/إلغاء التوكنات
// ============================================================================

export async function registerLiveActivityToken(
  fixtureId: number,
  pushToken: string,
  userId?: string | null,
  bundleId?: string | null,
): Promise<void> {
  const existing = await db
    .select({ id: liveActivityTokens.id })
    .from(liveActivityTokens)
    .where(eq(liveActivityTokens.pushToken, pushToken))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(liveActivityTokens)
      .set({
        fixtureId,
        userId: userId ?? null,
        ...(bundleId ? { bundleId } : {}),
        isActive: true,
        // إعادة الضبط تفرض دفعًا فوريًا في الدورة التالية لمزامنة البطاقة.
        lastContentHash: null,
        updatedAt: new Date(),
      })
      .where(eq(liveActivityTokens.id, existing[0].id));
  } else {
    await db.insert(liveActivityTokens).values({
      fixtureId,
      pushToken,
      userId: userId ?? null,
      bundleId: bundleId ?? null,
    });
  }
}

export async function endLiveActivityToken(pushToken: string): Promise<void> {
  await db
    .update(liveActivityTokens)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(liveActivityTokens.pushToken, pushToken));
}

// ============================================================================
// بناء حالة النشاط (يطابق منطق iOS makeState/minuteText/lastEventText)
// ============================================================================

function minuteText(status: SplMatchDetail["fixture"]["status"]): string {
  const elapsed = status.elapsed;
  if (!elapsed || elapsed <= 0) return "";
  if (status.extra && status.extra > 0) return `${elapsed}+${status.extra}'`;
  return `${elapsed}'`;
}

function isApiFootballClockRunning(status: SplMatchDetail["fixture"]["status"]): boolean {
  const code = String(status.code || "").toUpperCase();
  return Boolean(status.live && status.elapsed && status.elapsed > 0) &&
    !["HT", "BT", "P", "PEN", "BREAK", "INT", "SUSP", "HALF_TIME"].includes(code);
}

function apiFootballClockStartEpoch(status: SplMatchDetail["fixture"]["status"]): number | null {
  if (!isApiFootballClockRunning(status)) return null;
  const totalSeconds = ((status.elapsed ?? 0) + (status.extra ?? 0)) * 60;
  return Math.floor(Date.now() / 1000) - totalSeconds;
}

function sportmonksClockStartEpoch(live?: WcLiveScore | null): number | null {
  if (!live || !live.live || live.finished || live.minute <= 0) return null;
  if (CLOCK_PAUSED_STATES.has(live.stateDevName)) return null;
  return Math.floor(Date.now() / 1000) - live.minute * 60;
}

function clockStartEpochFromMinute(minute: number, running: boolean): number | null {
  if (!running || minute <= 0) return null;
  return Math.floor(Date.now() / 1000) - minute * 60;
}

function minuteFromClockStartEpoch(clockStartEpoch: number | null | undefined, running: boolean): number {
  if (!running || !clockStartEpoch) return 0;
  const elapsed = Math.floor((Math.floor(Date.now() / 1000) - clockStartEpoch) / 60);
  return Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
}

function minuteFromText(text?: string | null): number {
  if (!text) return 0;
  const m = text.match(/(\d+)(?:\+(\d+))?/);
  if (!m) return 0;
  return (Number(m[1]) || 0) + (Number(m[2]) || 0);
}

function minuteLabel(minute: number): string {
  return minute > 0 ? `${minute}'` : "";
}

function freshestMinute(baseMinute: string, live?: WcLiveScore | null): number {
  return Math.max(minuteFromText(baseMinute), live?.minute ?? 0);
}

function normalizeLiveMinute(state: LiveActivityContentState): LiveActivityContentState {
  if (!state.isLive || state.isFinished) return state;
  const minute = Math.max(
    minuteFromText(state.minute),
    minuteFromClockStartEpoch(state.clockStartEpoch, true),
  );
  if (minute <= 0 || minute === minuteFromText(state.minute)) return state;
  return { ...state, minute: minuteLabel(minute) };
}

function lastEventText(detail: SplMatchDetail): string | null {
  const ranked = [...detail.events].sort(
    (a, b) => (b.minute ?? 0) - (a.minute ?? 0) || (b.extra ?? 0) - (a.extra ?? 0),
  );
  const ev = ranked.find((e: SplMatchEvent) =>
    ["goal", "yellow-card", "red-card", "missed-penalty"].includes(e.type),
  );
  if (!ev) return null;
  const icon =
    ev.type === "goal"
      ? "⚽"
      : ev.type === "yellow-card"
        ? "🟨"
        : ev.type === "red-card"
          ? "🟥"
          : ev.type === "missed-penalty"
            ? "❌"
            : "•";
  const minute = `${ev.minute ?? 0}${ev.extra ? `+${ev.extra}` : ""}'`;
  const who = ev.player && ev.player.length > 0 ? ev.player : ev.label;
  return `${icon} ${minute} ${who}`;
}

function buildContentState(
  detail: SplMatchDetail,
  ts?: TsMatchLive | null,
  live?: WcLiveScore | null,
): LiveActivityContentState {
  const f = detail.fixture;
  const base: LiveActivityContentState = {
    homeScore: f.goals.home ?? 0,
    awayScore: f.goals.away ?? 0,
    minute: minuteText(f.status),
    statusLabel: f.status.label,
    isLive: f.status.live,
    isFinished: f.status.finished,
    lastEvent: lastEventText(detail),
    clockStartEpoch: apiFootballClockStartEpoch(f.status),
  };

  if (live && (live.live || live.finished)) {
    const minute = freshestMinute(base.minute, live);
    base.homeScore = live.home;
    base.awayScore = live.away;
    base.minute = minuteLabel(minute);
    base.statusLabel = LIVE_STATE_AR[live.stateDevName] ?? base.statusLabel;
    base.isLive = live.live;
    base.isFinished = live.finished || base.isFinished;
    base.clockStartEpoch = sportmonksClockStartEpoch(live) ?? base.clockStartEpoch;
  }

  // TheSports هو أسرع مصدر لدينا للبطولات المربوطة، ثم SportMonks، ثم API-Football.
  // lastEvent يبقى من API-Football/الخدمة العامة (عربي مُعرَّب) — ثانوي ومقبول
  // تأخّره قليلًا، بينما النتيجة والساعة تأتي من المصدر الأسرع.
  if (ts && (ts.live || ts.finished)) {
    const tsLabel = TS_STATUS_AR[ts.statusId] ?? base.statusLabel;
    const baseMin = minuteFromText(base.minute);
    const tsRunning = ts.live && TS_CLOCK_RUNNING_STATUS.has(ts.statusId);
    const displayMinute = Math.max(
      baseMin,
      minuteFromClockStartEpoch(base.clockStartEpoch, tsRunning),
    );
    return {
      ...base,
      homeScore: ts.home,
      awayScore: ts.away,
      minute: minuteLabel(displayMinute),
      statusLabel: tsLabel || base.statusLabel,
      isLive: ts.live,
      isFinished: ts.finished || base.isFinished,
      clockStartEpoch: base.clockStartEpoch ?? clockStartEpochFromMinute(displayMinute, tsRunning),
    };
  }

  return normalizeLiveMinute(base);
}

function staleDateFor(detail: SplMatchDetail): number {
  const f = detail.fixture;
  if (!f.status.live && !f.status.finished) {
    // قبل الانطلاق: نُبقيه طازجًا حتى موعد البدء (+دقيقتين) كي لا يُعتمّ العدّاد.
    const kickoffSec = f.timestamp + 120;
    if (kickoffSec > Date.now() / 1000) return kickoffSec;
  }
  return Math.floor(Date.now() / 1000) + STALE_LIVE_SEC;
}

function leagueSlug(leagueId: number | null): string | null {
  if (leagueId == null) return null;
  return SAUDI_COMPETITIONS.find((c) => c.id === leagueId)?.slug ?? null;
}

function isInvalidToken(reason?: string): boolean {
  return (
    reason === "BadDeviceToken" ||
    reason === "Unregistered" ||
    reason === "DeviceTokenNotForTopic" ||
    reason === "ExpiredToken"
  );
}

// ============================================================================
// دورة العامل
// ============================================================================

export interface LiveActivityCycleSummary {
  fixtures: number;
  pushes: number;
  ended: number;
}

export async function runLiveActivityCycle(): Promise<LiveActivityCycleSummary> {
  if (!isApnsConfigured()) return { fixtures: 0, pushes: 0, ended: 0 };

  // تنظيف وقائي: توكنات قديمة (>12 ساعة) لم تُنهَ — مباريات هُجرت/لم تكتمل دورتها.
  try {
    const cutoff = new Date(Date.now() - 12 * 3600 * 1000);
    await db
      .update(liveActivityTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(liveActivityTokens.isActive, true), lt(liveActivityTokens.createdAt, cutoff)));
  } catch {
    /* تنظيف أفضل-جهد */
  }

  const rows = await db
    .select()
    .from(liveActivityTokens)
    .where(eq(liveActivityTokens.isActive, true));
  if (rows.length === 0) return { fixtures: 0, pushes: 0, ended: 0 };

  const byFixture = new Map<number, typeof rows>();
  for (const r of rows) {
    const list = byFixture.get(r.fixtureId) ?? [];
    list.push(r);
    byFixture.set(r.fixtureId, list);
  }

  let pushes = 0;
  let ended = 0;
  const invalidTokens: string[] = [];
  // تشخيص: تجميع أسباب فشل الدفع (statusCode:reason → عدد) لطباعتها مُوجزة.
  const failReasons = new Map<string, number>();

  for (const [fixtureId, tokens] of byFixture) {
    let detail: SplMatchDetail | null = null;
    try {
      detail = await getMatchDetail(fixtureId);
    } catch (err) {
      console.warn(`[LiveActivity] match detail failed for ${fixtureId}:`, err);
    }
    if (!detail) continue;

    // نتيجة لحظية من TheSports للبطولات المربوطة — نفس المصدر السريع الذي يسرّع
    // الموقع والتطبيق، فيمنع اختلاف شاشة القفل عن الواجهة.
    let ts: TsMatchLive | null = null;
    const tsCompId = getTsCompetitionId(leagueSlug(detail.leagueId));
    if (tsCompId) {
      try {
        ts = await getTheSportsMatchLive(fixtureId, detail.fixture.timestamp, tsCompId);
      } catch {
        ts = null;
      }
    }

    // نتيجة لحظية من SportMonks (الوقت الحقيقي) — نستدعيها حتى مع TheSports
    // لأن TheSports يسبق في النتيجة، لكنه لا يملك حقل دقيقة جارٍ موثوقًا هنا.
    let live: WcLiveScore | null = null;
    try {
      live = await getLiveScore(fixtureId);
    } catch {
      live = null;
    }

    const state = buildContentState(detail, ts, live);
    // بصمة الدفع تشمل `minute`: الويدجت يعرض الدقيقة كنصّ مدفوع، فندفع عند كل
    // تغيّر دقيقة/نتيجة/حالة/آخر حدث ليبقى العرض على الجهاز متزامنًا مع الخادم.
    const pushKey = JSON.stringify({
      h: state.homeScore,
      a: state.awayScore,
      m: state.minute,
      s: state.statusLabel,
      l: state.isLive,
      f: state.isFinished,
      e: state.lastEvent ?? null,
    });
    const finished = state.isFinished;
    const staleDate = staleDateFor(detail);
    const nowSec = Math.floor(Date.now() / 1000);

    // قياس تغيّر النتيجة (للتسجيل فقط) — دفعة النتيجة دائمًا بأولوية 10 فورية.
    const scoreKey = `${state.homeScore}-${state.awayScore}`;
    const scoreChanged =
      lastScoreByFixture.has(fixtureId) && lastScoreByFixture.get(fixtureId) !== scoreKey;
    const eventChanged = tokens.some((t) => {
      if (!t.lastContentHash) return false;
      try {
        const prev = JSON.parse(t.lastContentHash);
        return prev.e !== (state.lastEvent ?? null);
      } catch {
        return false;
      }
    });
    lastScoreByFixture.set(fixtureId, scoreKey);
    if (finished) lastScoreByFixture.delete(fixtureId);

    // قياس زمن الإرسال: نطبع لحظة رصد تغيّر النتيجة لمقارنتها بظهورها على الجهاز،
    // فنفصل تأخّر «الإرسال» (الخادم) عن تأخّر «التسليم» (APNs/iOS).
    if (scoreChanged) {
      console.log(
        `[LiveActivity ⚽] fixture=${fixtureId} score=${scoreKey} detected@${new Date().toISOString()} minute=${state.minute} tokens=${tokens.length}`,
      );
    }

    const pushOne = async (t: (typeof tokens)[number]): Promise<void> => {
      const changed = t.lastContentHash !== pushKey;
      // لا تغيير ولم تنتهِ → لا داعي للدفع.
      if (!changed && !finished) return;

      // شاشة القفل حسّاسة جدًا للتأخير: دفعات الدقيقة بأولوية 5 قد يؤخرها iOS
      // عدة دقائق على الجهاز الحقيقي. طالما المباراة live نرسلها فورية؛ ميزانية
      // الدفع محمية أصلًا بالبصمة وبالـclockStartEpoch المحلي.
      const priority: "5" | "10" = state.isLive || scoreChanged || eventChanged || finished ? "10" : "5";

      const resp = await sendLiveActivityUpdate(t.pushToken, {
        event: finished ? "end" : "update",
        contentState: state,
        bundleId: t.bundleId,
        staleDate,
        priority,
        dismissalDate: finished ? nowSec + TWO_HOURS_SEC : undefined,
      });
      pushes++;

      // قياس: لحظة إتمام الإرسال + نتيجة APNs لدفعة الهدف. الفارق بين detected@
      // وsent@ هو تأخّر الخادم (يُفترض أجزاء من الثانية)؛ ما بعده تأخّر تسليم APNs.
      if (scoreChanged) {
        console.log(
          `[LiveActivity ⚽] fixture=${fixtureId} sent@${new Date().toISOString()} priority=${priority} ok=${resp.success} apnsId=${resp.apnsId ?? "-"} status=${resp.statusCode ?? "-"}`,
        );
      }

      if (resp.success) {
        if (finished) {
          ended++;
          await db
            .update(liveActivityTokens)
            .set({ isActive: false, lastContentHash: pushKey, lastPushedAt: new Date(), updatedAt: new Date() })
            .where(eq(liveActivityTokens.id, t.id));
        } else {
          await db
            .update(liveActivityTokens)
            .set({ lastContentHash: pushKey, lastPushedAt: new Date(), updatedAt: new Date() })
            .where(eq(liveActivityTokens.id, t.id));
        }
      } else {
        const key = `${resp.statusCode ?? "?"}:${resp.reason ?? "?"}`;
        failReasons.set(key, (failReasons.get(key) ?? 0) + 1);
        if (isInvalidToken(resp.reason)) invalidTokens.push(t.pushToken);
      }
    };

    for (let i = 0; i < tokens.length; i += PUSH_CONCURRENCY) {
      await Promise.all(tokens.slice(i, i + PUSH_CONCURRENCY).map(pushOne));
    }
  }

  if (failReasons.size > 0) {
    const summary = [...failReasons.entries()].map(([k, v]) => `${k}×${v}`).join(", ");
    console.warn(`[LiveActivity] push failures: ${summary}`);
  }

  if (invalidTokens.length > 0) {
    try {
      await db
        .update(liveActivityTokens)
        .set({ isActive: false, updatedAt: new Date() })
        .where(inArray(liveActivityTokens.pushToken, invalidTokens));
    } catch {
      /* أفضل-جهد */
    }
  }

  return { fixtures: byFixture.size, pushes, ended };
}
