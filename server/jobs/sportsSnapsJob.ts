/**
 * جوب لقطات VARA الذكية — المرحلة 1: توليد لقطات الفرق النشطة كل ساعة.
 *
 * محمي ثلاثيًا: العلم SPORTS_SNAPS_ENABLED، تهيئة API-Football، وفحص القيادة داخل
 * كل دورة. التوليد كل ساعة، والدفع كل 15 دقيقة ضمن النوافذ الآمنة.
 */
import cron from "node-cron";
import { isLeader } from "../leaderElection";
import { isSaudiLeagueConfigured } from "../services/saudiLeagueService";
import { getActiveSnapTeamIds, pruneExpiredTeamSnaps, refreshTeamSnaps } from "../services/sportsSnaps/feed";
import { isSportsSnapsEnabled } from "../services/sportsSnaps/config";
import { runSnapsPushCycle } from "../services/sportsSnaps/pushCycle";

let isGenerateRunning = false;
let isPushRunning = false;

async function generateTick(trigger: string): Promise<void> {
  if (!isSportsSnapsEnabled()) return;
  if (!isSaudiLeagueConfigured()) return;
  if (!isLeader()) return;
  if (isGenerateRunning) {
    console.log("[SportsSnaps Job] previous generate cycle still running — skipping");
    return;
  }

  isGenerateRunning = true;
  try {
    const teamIds = await getActiveSnapTeamIds();
    let snaps = 0;
    for (const teamId of teamIds) {
      snaps += await refreshTeamSnaps(teamId).catch((error) => {
        console.error(`[SportsSnaps Job] refreshTeamSnaps(${teamId}) failed:`, error);
        return 0;
      });
    }
    await pruneExpiredTeamSnaps().catch(() => 0);
    if (snaps > 0 || teamIds.length > 0) {
      console.log(`[SportsSnaps Job] (${trigger}) teams=${teamIds.length} snaps=${snaps}`);
    }
  } catch (error) {
    console.error("[SportsSnaps Job] generate cycle failed:", error);
  } finally {
    isGenerateRunning = false;
  }
}

async function pushTick(trigger: string): Promise<void> {
  if (!isSportsSnapsEnabled()) return;
  if (!isSaudiLeagueConfigured()) return;
  if (!isLeader()) return;
  if (isPushRunning) {
    console.log("[SportsSnaps Push] previous push cycle still running — skipping");
    return;
  }

  isPushRunning = true;
  try {
    const summary = await runSnapsPushCycle();
    if (summary.skippedQuietHours) return;
    if (summary.candidates > 0 || summary.recipients > 0) {
      console.log(
        `[SportsSnaps Push] (${trigger}) candidates=${summary.candidates} recipients=${summary.recipients}`,
      );
    }
  } catch (error) {
    console.error("[SportsSnaps Push] cycle failed:", error);
  } finally {
    isPushRunning = false;
  }
}

export function startSportsSnapsJob(): void {
  if (!isSportsSnapsEnabled()) {
    console.log("[SportsSnaps Job] disabled (SPORTS_SNAPS_ENABLED != true)");
    return;
  }
  if (!isSaudiLeagueConfigured()) {
    console.log("[SportsSnaps Job] disabled (APIFOOTBALL_KEY missing)");
    return;
  }

  cron.schedule("0 * * * *", () => void generateTick("cron"), { timezone: "Asia/Riyadh" });
  cron.schedule("*/15 * * * *", () => void pushTick("cron"), { timezone: "Asia/Riyadh" });
  console.log("[SportsSnaps Job] scheduled — hourly generation + 15m push cycle");

  setTimeout(() => void generateTick("startup"), 30 * 1000);
  setTimeout(() => void pushTick("startup"), 60 * 1000);
}
