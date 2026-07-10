import { isLeader } from "../leaderElection";
import { runLiveActivityStartCycle } from "../services/liveActivityStartService";

const INTERVAL_MS = 30_000;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (isLeader() && !running) {
    running = true;
    try {
      const result = await runLiveActivityStartCycle();
      if (result.attempted > 0) {
        console.log(`[LiveActivity Start] fixtures=${result.fixtures} attempted=${result.attempted} delivered=${result.delivered} failed=${result.failed}`);
      }
    } catch (error) {
      console.error("[LiveActivity Start] cycle failed:", error);
    } finally {
      running = false;
    }
  }
  timer = setTimeout(() => void tick(), INTERVAL_MS);
}

export function startLiveActivityStartWorker(): void {
  if (process.env.LIVE_ACTIVITY_PUSH_ENABLED === "false" || timer) return;
  timer = setTimeout(() => void tick(), 5_000);
  console.log("[LiveActivity Start] started — every 30s (leader only)");
}
