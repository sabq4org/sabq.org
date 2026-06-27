/**
 * خدمة النشاط المباشر للمباريات (iOS Live Activity — push-to-update).
 *
 * تُدير توكنات الأنشطة المباشرة (live_activity_tokens) وتدفع تحديثات شاشة
 * القفل عبر APNs (apns-push-type: liveactivity) دون فتح التطبيق:
 *   1) registerLiveActivityToken — يسجّله التطبيق فور إصدار ActivityKit للتوكن.
 *   2) endLiveActivityToken      — يلغي التفعيل عند إيقاف المستخدم للمتابعة.
 *   3) runLiveActivityCycle      — دورة العامل: لكل مباراة نشطة، يبني الحالة من
 *      worldCupService ويدفع التغييرات لكل توكناتها، ويُنهي النشاط عند الانتهاء.
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
import { getMatchDetail, type WcMatchDetail, type WcMatchEvent } from "./worldCupService";
import { getLiveScore, type WcLiveScore } from "./sportmonksService";
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

function minuteText(status: WcMatchDetail["fixture"]["status"]): string {
  const elapsed = status.elapsed;
  if (!elapsed || elapsed <= 0) return "";
  if (status.extra && status.extra > 0) return `${elapsed}+${status.extra}'`;
  return `${elapsed}'`;
}

function lastEventText(detail: WcMatchDetail): string | null {
  const ranked = [...detail.events].sort(
    (a, b) => b.minute - a.minute || (b.extraMinute ?? 0) - (a.extraMinute ?? 0),
  );
  const ev = ranked.find((e: WcMatchEvent) =>
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
  const minute = `${ev.minute}${ev.extraMinute ? `+${ev.extraMinute}` : ""}'`;
  const who = ev.player && ev.player.length > 0 ? ev.player : ev.label;
  return `${icon} ${minute} ${who}`;
}

function buildContentState(
  detail: WcMatchDetail,
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
  };
  // تجاوز لحظي من SportMonks للنتيجة/الدقيقة/الحالة (يكسر تأخّر كاش API-Football).
  // lastEvent يبقى من API-Football (عربي مُعرَّب) — ثانوي ومقبول تأخّره قليلًا.
  const state: LiveActivityContentState =
    live && (live.live || live.finished)
      ? {
          ...base,
          homeScore: live.home,
          awayScore: live.away,
          minute: live.minute > 0 ? `${live.minute}'` : base.minute,
          statusLabel: LIVE_STATE_AR[live.stateDevName] ?? base.statusLabel,
          isLive: live.live,
          isFinished: live.finished || base.isFinished,
        }
      : base;

  return state;
}

function staleDateFor(detail: WcMatchDetail): number {
  const f = detail.fixture;
  if (!f.status.live && !f.status.finished) {
    // قبل الانطلاق: نُبقيه طازجًا حتى موعد البدء (+دقيقتين) كي لا يُعتمّ العدّاد.
    const kickoffSec = f.timestamp + 120;
    if (kickoffSec > Date.now() / 1000) return kickoffSec;
  }
  return Math.floor(Date.now() / 1000) + STALE_LIVE_SEC;
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
    let detail: WcMatchDetail | null = null;
    try {
      detail = await getMatchDetail(fixtureId);
    } catch (err) {
      console.warn(`[LiveActivity] match detail failed for ${fixtureId}:`, err);
    }
    if (!detail) continue;

    // نتيجة لحظية من SportMonks (الوقت الحقيقي) — أفضل جهد، تتجاوز كاش API-Football
    let live: WcLiveScore | null = null;
    try {
      live = await getLiveScore(fixtureId);
    } catch {
      live = null;
    }

    const state = buildContentState(detail, live);
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
    lastScoreByFixture.set(fixtureId, scoreKey);
    if (finished) lastScoreByFixture.delete(fixtureId);

    // قياس زمن الإرسال: نطبع لحظة رصد تغيّر النتيجة لمقارنتها بظهورها على الجهاز،
    // فنفصل تأخّر «الإرسال» (الخادم) عن تأخّر «التسليم» (APNs/iOS).
    if (scoreChanged) {
      console.log(
        `[LiveActivity ⚽] fixture=${fixtureId} score=${scoreKey} detected@${new Date().toISOString()} minute=${state.minute} tokens=${tokens.length}`,
      );
    }

    for (const t of tokens) {
      const changed = t.lastContentHash !== pushKey;
      // لا تغيير ولم تنتهِ → لا داعي للدفع.
      if (!changed && !finished) continue;

      // أولوية: تغيّر النتيجة (هدف) أو النهاية → 10 فورية؛ تغيّر روتيني (دقيقة/حالة)
      // → 5 موفّرة للميزانية كي يصل الهدف فوريًا دائمًا.
      const priority: "5" | "10" = scoreChanged || finished ? "10" : "5";

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
