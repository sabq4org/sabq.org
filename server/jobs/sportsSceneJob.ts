/**
 * وظيفة «قارئ المشهد الرياضي» — كل دقيقتين يجدّد لقطات «المشهد الآن» (اليوم +
 * البثّ الحيّ)، وينظّف اللقطات المنتهية، ويجدّد «قصص الموسم» لبطولات بارزة على
 * فترات أطول (كلفة أقل). القراءة من الواجهة تظلّ من المخزَّن (لا انتظار LLM).
 *
 * محميّ ثلاثياً: isLeader() (نسخة واحدة عبر كل الـpods)، قفل isRunning، وعلَم
 * SPORTS_INTEL_ENABLED (مُطفأ افتراضياً — لا يعمل على أي بيئة لم تطلبه). يتطلّب
 * أيضاً توفّر مفتاح API-Football (isSaudiLeagueConfigured).
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { isSaudiLeagueConfigured } from "../services/saudiLeagueService";
import {
  isSportsIntelEnabled,
  pruneExpiredInsights,
  refreshScene,
  refreshCompetitionTrends,
} from "../services/sportsIntelligence";
import { runWithSportsPriority } from "../services/sportsRequestContext";

let isRunning = false;
let lastTrendsAt = 0;

// بطولات نجدّد قصصها دورياً (الأبرز جماهيرياً). نُدير واحدةً كل دورة تجديد.
const TREND_COMPETITIONS = ["pro-league", "premier-league", "la-liga", "champions-league"];
const TRENDS_INTERVAL_MS = 30 * 60 * 1000; // قصص الموسم تتغيّر ببطء
let trendCursor = 0;

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) {
    console.log("[Sports Intel Job] previous cycle still running — skipping");
    return;
  }
  isRunning = true;
  try {
    const cards = await refreshScene().catch((e) => {
      console.error("[Sports Intel Job] refreshScene failed:", e);
      return 0;
    });
    await pruneExpiredInsights().catch(() => 0);

    let trends = 0;
    if (Date.now() - lastTrendsAt >= TRENDS_INTERVAL_MS) {
      const slug = TREND_COMPETITIONS[trendCursor % TREND_COMPETITIONS.length];
      trendCursor++;
      trends = await refreshCompetitionTrends(slug).catch((e) => {
        console.error(`[Sports Intel Job] refreshTrends(${slug}) failed:`, e);
        return 0;
      });
      lastTrendsAt = Date.now();
      if (trends > 0) console.log(`[Sports Intel Job] (${trigger}) trends[${slug}]=${trends}`);
    }

    if (cards > 0) console.log(`[Sports Intel Job] (${trigger}) scene cards=${cards}`);
  } catch (error) {
    console.error("[Sports Intel Job] cycle failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startSportsSceneJob(): void {
  if (!isSportsIntelEnabled()) {
    console.log("[Sports Intel Job] disabled (SPORTS_INTEL_ENABLED != true)");
    return;
  }
  if (!isSaudiLeagueConfigured()) {
    console.log("[Sports Intel Job] disabled (APIFOOTBALL_KEY missing)");
    return;
  }

  cron.schedule("*/2 * * * *", () => void runWithSportsPriority("background", () => tick("cron")), { timezone: "Asia/Riyadh" });
  console.log("[Sports Intel Job] 🧠 scheduled — every 2 minutes (scene + trends)");

  setTimeout(() => void runWithSportsPriority("background", () => tick("startup")), 30 * 1000);
}
