// تسخين تفاصيل المباريات الساخنة — يقتل «الجلب البارد» (7+ ثوانٍ مقيسة على
// نهائي المونديال) لأهم شاشة في التطبيقات: مركز المباراة.
//
// كل دقيقة (بقيادة isLeader): يمرّ على لوحة اليوم المكاشة ويُبقي دافئةً تفاصيلَ
// المباريات التي يفتحها الناس فعلًا — المباشرة، والمنطلقة خلال ساعتين ونصف
// (قبل أن تلتقطها طبقة ما قبل المباراة الطويلة)، والمنتهية خلال آخر 3 ساعات
// (قبل أن تلتقطها طبقة الأرشيف). خارج هذه النوافذ الطبقات الطويلة تكفي.
//
// ميزانية الحصة: سقف 8 مباريات لكل دورة بتوازٍ 2 — أسوأ حالة ~32 نداء مزوّد
// بالدقيقة من أصل ~250، والنداء يمرّ عبر SWR فلا يضرب المزوّد إن كان طازجًا.

import cron from "node-cron";
import pLimit from "p-limit";
import { isLeader } from "../leaderElection";
import {
  getGlobalTodayFixtures,
  getMatchDetail,
  getSportsFixtureIdentity,
  isSaudiLeagueConfigured,
  type SplLiveBoardItem,
} from "../services/saudiLeagueService";
import {
  getCommentary,
  getMatchFacts,
  getMatchReferee,
  getMomentum,
  getPressure,
  getXg,
  isSportmonksConfigured,
  resolveSmIdByNames,
} from "../services/sportmonksService";
import { runWithSportsPriority } from "../services/sportsRequestContext";

let isRunning = false;

const MAX_PER_TICK = 8;
const IMMINENT_MS = 2.5 * 3600 * 1000;
const RECENT_FINISH_MS = 3 * 3600 * 1000;

function isWarmable(fx: SplLiveBoardItem, now: number): boolean {
  if (fx.id <= 0) return false; // المباريات العالمية السالبة تُخدم من لوحة TheSports
  if (fx.status.live) return true;
  const kickoff = fx.timestamp * 1000;
  if (!fx.status.finished) return kickoff - now <= IMMINENT_MS && kickoff > now - 30 * 60 * 1000;
  return now - kickoff <= RECENT_FINISH_MS;
}

async function tick(trigger: string): Promise<void> {
  if (!isLeader()) return;
  if (isRunning) return;
  isRunning = true;
  try {
    const now = Date.now();
    const board = await getGlobalTodayFixtures().catch(() => [] as SplLiveBoardItem[]);
    const targets = board
      .filter((fx) => isWarmable(fx, now))
      // المباشرة أولًا ثم الأقرب انطلاقًا
      .sort((a, b) => Number(b.status.live) - Number(a.status.live) || a.timestamp - b.timestamp)
      .slice(0, MAX_PER_TICK);
    if (targets.length === 0) return;

    const limit = pLimit(2);
    const results = await Promise.allSettled(
      targets.map((fx) =>
        limit(async () => {
          await getMatchDetail(fx.id);
          // تسخين إثراء SportMonks (حقائق/xG/زخم…) حتى لا يتجمّد مركز المباراة على أول فتح
          if (!isSportmonksConfigured()) return;
          const identity = await getSportsFixtureIdentity(fx.id).catch(() => null);
          if (!identity) return;
          const smId = await resolveSmIdByNames({
            key: `spl:${fx.id}`,
            kickoffIso: identity.kickoffIso,
            homeNameEn: identity.homeNameEn,
            awayNameEn: identity.awayNameEn,
          }).catch(() => null);
          if (!smId) return;
          const opts = { directSmId: smId };
          await Promise.allSettled([
            getMatchFacts(fx.id, opts),
            getXg(fx.id, opts),
            getMomentum(fx.id, opts),
            getPressure(fx.id, opts),
            getCommentary(fx.id, opts),
            getMatchReferee(fx.id, opts),
          ]);
        }),
      ),
    );
    const warmed = results.filter((r) => r.status === "fulfilled").length;
    if (trigger === "startup" || warmed < targets.length) {
      console.log(`[Match Warmup] (${trigger}) warmed ${warmed}/${targets.length} hot matches`);
    }
  } catch (error) {
    console.error("[Match Warmup] tick failed:", error);
  } finally {
    isRunning = false;
  }
}

export function startSportsMatchWarmupJob(): void {
  if (!isSaudiLeagueConfigured()) {
    console.log("[Match Warmup] disabled (saudi league not configured)");
    return;
  }
  cron.schedule("* * * * *", () => void runWithSportsPriority("background", () => tick("cron")), { timezone: "Asia/Riyadh" });
  setTimeout(() => void runWithSportsPriority("background", () => tick("startup")), 90 * 1000);
  console.log("[Match Warmup] scheduled (every minute)");
}
