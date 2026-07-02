// Incident notifications for admins — throttled so one outage produces one
// alert, not one per request. Phase 2 wires `setIncidentHandler` to the real
// notification system; until then incidents land in the server log (and in
// ai_provider_health, which the dashboard reads).

export interface AIIncident {
  kind: "failover" | "chain_exhausted" | "circuit_open";
  featureKey: string;
  provider: string;
  modelId: string;
  errorCode?: string;
  message: string;
}

type IncidentHandler = (incident: AIIncident) => void | Promise<void>;

const NOTIFY_COOLDOWN_MS = 15 * 60 * 1000;
const lastNotifiedAt = new Map<string, number>();

let handler: IncidentHandler | null = null;

export function setIncidentHandler(fn: IncidentHandler): void {
  handler = fn;
}

export function notifyIncident(incident: AIIncident, now: () => number = Date.now): void {
  const key = `${incident.kind}:${incident.provider}:${incident.modelId}`;
  const last = lastNotifiedAt.get(key) ?? 0;
  if (now() - last < NOTIFY_COOLDOWN_MS) return;
  lastNotifiedAt.set(key, now());

  console.error(
    `[AI Hub] INCIDENT ${incident.kind} — feature=${incident.featureKey} model=${incident.provider}/${incident.modelId} code=${incident.errorCode ?? "-"}: ${incident.message}`,
  );

  if (handler) {
    Promise.resolve(handler(incident)).catch((err) => {
      console.warn("[AI Hub] incident handler failed:", (err as Error).message);
    });
  }
}
