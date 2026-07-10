/**
 * عامل TheSports MQTT — يغذّي الطبقة اللحظية عبر WebSocket بدل الاعتماد
 * على استطلاع detail_live وحده.
 *
 * يعمل مع ENABLE_BACKGROUND_WORKERS على القائد فقط (يُفحص دوريًا).
 * للتعطيل: THESPORTS_MQTT_ENABLED=false
 */
import { isLeader } from "../leaderElection";
import {
  connectTheSportsMqtt,
  disconnectTheSportsMqtt,
  isTheSportsMqttConnected,
} from "../services/theSportsMqttClient";
import { isTheSportsConfigured } from "../services/theSportsService";

const LEADER_POLL_MS = 5_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;
let wasLeader = false;

async function tick(): Promise<void> {
  if (stopped) return;

  const leader = isLeader();
  if (leader && isTheSportsConfigured()) {
    if (!wasLeader || !isTheSportsMqttConnected()) {
      await connectTheSportsMqtt();
    }
    wasLeader = true;
  } else if (wasLeader || isTheSportsMqttConnected()) {
    // فقدنا القيادة أو أُوقف المزوّد — أغلِق الاتصال حتى لا تتكرّر الاشتراكات.
    disconnectTheSportsMqtt();
    wasLeader = false;
  }

  if (!stopped) timer = setTimeout(() => void tick(), LEADER_POLL_MS);
}

export function startTheSportsMqttWorker(): void {
  if (process.env.THESPORTS_MQTT_ENABLED === "false") {
    console.log("[TheSports MQTT Worker] disabled (THESPORTS_MQTT_ENABLED=false)");
    return;
  }
  if (!isTheSportsConfigured()) {
    console.log("[TheSports MQTT Worker] skipped — THESPORTS_USER/SECRET not set");
    return;
  }
  if (timer) return;
  stopped = false;
  timer = setTimeout(() => void tick(), 1_000);
  console.log(
    "[TheSports MQTT Worker] ⚡ started — WebSocket live feed (leader only, topic thesports/football/match/v1)",
  );
}

export function stopTheSportsMqttWorker(): void {
  stopped = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  disconnectTheSportsMqtt();
  wasLeader = false;
}
