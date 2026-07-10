/**
 * عميل TheSports MQTT (WebSocket) — تغذية النتائج اللحظية.
 *
 * وفق دعم TheSports (2026-07-10):
 *   host: mq.thesports.com:443 (WSS)
 *   topic: thesports/football/match/v1
 *   auth: نفس user/secret لـ REST
 *
 * لا يُستدعى من الواجهة مباشرة — يعمل داخل Worker على قائد Railway فقط،
 * ويدفع التحديثات إلى `applyTheSportsMqttPayload` فتقرأها طبقة overlay فورًا.
 */
import dns from "node:dns/promises";
import mqtt, { type MqttClient } from "mqtt";
import {
  applyTheSportsMqttPayload,
  isTheSportsConfigured,
  setTheSportsMqttStatus,
} from "./theSportsService";

export const TS_MQTT_TOPIC = "thesports/football/match/v1";
const DEFAULT_HOST = "mq.thesports.com";
const DEFAULT_PORT = 443;
const DEFAULT_PATH = "/mqtt";

let client: MqttClient | null = null;
let connecting = false;
let messagesReceived = 0;
let wantConnected = false;

function mqttUrl(): string {
  const override = (process.env.THESPORTS_MQTT_URL || "").trim();
  if (override) return override;
  return `wss://${DEFAULT_HOST}:${DEFAULT_PORT}${DEFAULT_PATH}`;
}

function credentials(): { user: string; secret: string } | null {
  const user = (process.env.THESPORTS_USER || "").trim();
  const secret = (process.env.THESPORTS_SECRET || "").trim();
  if (!user || !secret) return null;
  return { user, secret };
}

function report(patch: Parameters<typeof setTheSportsMqttStatus>[0]): void {
  setTheSportsMqttStatus({
    enabled: wantConnected,
    messagesReceived,
    ...patch,
  });
}

async function resolveConnectUrl(): Promise<{ url: string; servername?: string }> {
  const override = (process.env.THESPORTS_MQTT_URL || "").trim();
  if (override) return { url: override };

  // قائمة TheSports البيضاء IPv4 فقط — نفضّل A record صراحةً كـREST.
  try {
    const { address } = await dns.lookup(DEFAULT_HOST, { family: 4 });
    return {
      url: `wss://${address}:${DEFAULT_PORT}${DEFAULT_PATH}`,
      servername: DEFAULT_HOST,
    };
  } catch {
    return { url: mqttUrl() };
  }
}

function handleMessage(payload: Buffer | string): void {
  messagesReceived += 1;
  const touched = applyTheSportsMqttPayload(payload);
  report({
    connected: true,
    lastMessageAt: Date.now(),
    lastError: null,
  });
  if (touched > 0 && messagesReceived <= 3) {
    console.log(`[TheSports MQTT] message #${messagesReceived} updated ${touched} match(es)`);
  } else if (touched > 0 && messagesReceived % 200 === 0) {
    console.log(`[TheSports MQTT] messages=${messagesReceived} lastTouched=${touched}`);
  }
}

export function isTheSportsMqttConnected(): boolean {
  return Boolean(client?.connected);
}

export async function connectTheSportsMqtt(): Promise<void> {
  if (!isTheSportsConfigured()) {
    report({ enabled: false, connected: false, lastError: "not configured" });
    return;
  }
  const creds = credentials();
  if (!creds) return;

  wantConnected = true;
  if (client?.connected || connecting) {
    report({ enabled: true, connected: Boolean(client?.connected) });
    return;
  }

  connecting = true;
  report({ enabled: true, connected: false });

  try {
    const { url, servername } = await resolveConnectUrl();
    const next = mqtt.connect(url, {
      username: creds.user,
      password: creds.secret,
      protocolVersion: 4,
      clean: true,
      reconnectPeriod: 5_000,
      connectTimeout: 15_000,
      keepalive: 30,
      // SNI عند الاتصال عبر عنوان IPv4 مباشر.
      ...(servername
        ? { wsOptions: { servername, host: servername } as any }
        : {}),
    });

    client = next;

    next.on("connect", () => {
      connecting = false;
      next.subscribe(TS_MQTT_TOPIC, { qos: 0 }, (err) => {
        if (err) {
          const msg = err.message || String(err);
          console.warn(`[TheSports MQTT] subscribe failed: ${msg}`);
          report({ connected: false, lastError: msg });
          return;
        }
        console.log(`[TheSports MQTT] connected — subscribed ${TS_MQTT_TOPIC}`);
        report({ connected: true, lastError: null });
      });
    });

    next.on("message", (_topic, payload) => {
      try {
        handleMessage(payload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[TheSports MQTT] message handler error: ${msg}`);
        report({ lastError: msg });
      }
    });

    next.on("error", (err) => {
      connecting = false;
      const msg = err?.message || String(err);
      console.warn(`[TheSports MQTT] error: ${msg}`);
      report({ connected: false, lastError: msg });
    });

    next.on("close", () => {
      connecting = false;
      if (wantConnected) {
        report({ connected: false });
      }
    });

    next.on("offline", () => {
      report({ connected: false, lastError: "offline" });
    });
  } catch (e) {
    connecting = false;
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[TheSports MQTT] connect failed: ${msg}`);
    report({ connected: false, lastError: msg });
  }
}

export function disconnectTheSportsMqtt(): void {
  wantConnected = false;
  connecting = false;
  const c = client;
  client = null;
  if (c) {
    try {
      c.end(true);
    } catch {
      /* ignore */
    }
  }
  report({ enabled: false, connected: false });
}
