// «عين المناوبة»: توصيل التنبيهات بالدفع إلى Webhook مخصص (منفصل عن بوت الديسك وأنواعه).
//   DUTY_ALERT_WEBHOOK_URL     الرابط. فارغ = لا شيء يُرسل (التنبيهات تبقى في الجدول للقراءة).
//   DUTY_ALERT_WEBHOOK_SECRET  السر. يُرسل خامًا في Authorization كما في Webhook الديسك (#2161، alertWebhook.ts)،
//                              ومعه توقيع HMAC-SHA256 للجسم في X-Sabq-Duty-Signature.
// آمن مع نسختي Render: كل صف يُحجز ذريًا (FOR UPDATE SKIP LOCKED + مهلة حجز) قبل الإرسال،
// والمحاولات محدودة بتأخير متزايد، وdelivered_at يُضبط عند القبول فقط.
// ما تولّد في ساعات الهدوء (deferred_until) يُرسل مرة واحدة كملخص عند نهايتها.
import { createHmac } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { contentDutyAlerts } from "@shared/schema";
import {
  DUTY_ALERT_KINDS,
  DUTY_ALERT_LABELS,
  dutyDigestText,
  type DutyAlertKind,
  type DutyQuietHours,
} from "@shared/contentDutyAlerts";
import { postAlertWebhook } from "../alertWebhook";

export const DUTY_ALERT_MAX_ATTEMPTS = 5;
/** مهلة الحجز: إن تعطلت النسخة أثناء الإرسال يعود الصف قابلًا للالتقاط بعدها. */
export const DUTY_ALERT_CLAIM_LEASE_MIN = 2;
/** التنبيه الفوري الأقدم من هذا لا يُدفع (يبقى في /duty/alerts)، حتى لا يصل سيل قديم عند ضبط الرابط لاحقًا. */
export const DUTY_ALERT_MAX_AGE_MIN = 60;
/** ملخص الصباح يُرسل حتى 3 ساعات بعد نهاية ساعات الهدوء، ثم يُترك للقراءة. */
export const DUTY_DIGEST_MAX_AGE_MIN = 180;
const BATCH = 20;
const DIGEST_BATCH = 200;
const TIMEOUT_MS = 5_000;
const LOG = "[DutyAlerts]";

export const DUTY_ALERT_SIGNATURE_HEADER = "X-Sabq-Duty-Signature";
export const DUTY_ALERT_TIMESTAMP_HEADER = "X-Sabq-Duty-Timestamp";

/** تأخير المحاولة التالية بعد فشل المحاولة رقم attempt (1، 2، 4، 8 دقائق). */
export function dutyRetryDelayMin(attempt: number): number {
  return Math.min(8, 2 ** Math.max(0, attempt - 1));
}

/** ما يحفظه المحرك في payload. */
export interface DutyAlertStoredPayload {
  label: string;
  text: string;
  userName: string | null;
  data: Record<string, unknown>;
  deferred: boolean;
}

export interface DutyAlertRow {
  id: number | string;
  kind: string;
  userId: string | null;
  occurrenceKey: string | null;
  payload: unknown;
  createdAt: Date | string;
  deferredUntil: Date | string | null;
  deliveredAt?: Date | string | null;
}

/** شكل التنبيه الموحد: في جسم الـWebhook وفي مسارات /duty/alerts. */
export interface DutyAlertWire {
  id: string;
  kind: DutyAlertKind;
  label: string;
  text: string;
  userId: string | null;
  userName: string | null;
  occurrenceKey: string | null;
  createdAt: string;
  deferred: boolean;
  deferredUntil: string | null;
  deliveredAt: string | null;
  data: Record<string, unknown>;
}

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);

export function toDutyAlertWire(row: DutyAlertRow): DutyAlertWire {
  const p = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Partial<DutyAlertStoredPayload>;
  const kind = (DUTY_ALERT_KINDS as readonly string[]).includes(row.kind) ? (row.kind as DutyAlertKind) : "summary";
  return {
    id: String(row.id),
    kind,
    label: typeof p.label === "string" ? p.label : DUTY_ALERT_LABELS[kind],
    text: typeof p.text === "string" ? p.text : "",
    userId: row.userId,
    userName: typeof p.userName === "string" ? p.userName : null,
    occurrenceKey: row.occurrenceKey,
    createdAt: iso(row.createdAt) as string,
    deferred: Boolean(row.deferredUntil),
    deferredUntil: iso(row.deferredUntil),
    deliveredAt: iso(row.deliveredAt ?? null),
    data: p.data && typeof p.data === "object" ? (p.data as Record<string, unknown>) : {},
  };
}

export function dutyDashboardUrl(): string {
  const origin = (process.env.FRONTEND_URL || process.env.PUBLIC_SITE_URL || "https://sabq.org").replace(/\/$/, "");
  return `${origin}/dashboard/content-duty`;
}

export interface DutyWebhookConfig {
  url: string;
  secret: string;
}

export function dutyWebhookConfig(env: NodeJS.ProcessEnv = process.env): DutyWebhookConfig | null {
  const url = (env.DUTY_ALERT_WEBHOOK_URL ?? "").trim();
  if (!url) return null;
  return { url, secret: (env.DUTY_ALERT_WEBHOOK_SECRET ?? "").trim() };
}

/** توقيع HMAC-SHA256 بالسر على `${timestamp}.${body}` بصيغة sha256=<hex>. */
export function signDutyWebhook(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export async function postDutyWebhook(cfg: DutyWebhookConfig, payload: Record<string, unknown>, describe: string) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const extraHeaders: Record<string, string> = cfg.secret
    ? { [DUTY_ALERT_TIMESTAMP_HEADER]: timestamp, [DUTY_ALERT_SIGNATURE_HEADER]: signDutyWebhook(cfg.secret, timestamp, body) }
    : {};
  return postAlertWebhook({
    url: cfg.url,
    secret: cfg.secret,
    body,
    extraHeaders,
    timeoutMs: TIMEOUT_MS,
    logPrefix: LOG,
    describe,
  });
}

export function buildAlertWebhookBody(alert: DutyAlertWire, now = new Date()) {
  return { type: "duty_alert" as const, ...alert, url: dutyDashboardUrl(), sentAt: now.toISOString() };
}

export function buildDigestWebhookBody(alerts: DutyAlertWire[], quiet: DutyQuietHours, now = new Date()) {
  const ids = alerts.map((a) => Number(a.id)).sort((a, b) => a - b);
  return {
    type: "duty_digest" as const,
    id: `digest:${ids[0]}-${ids[ids.length - 1]}`,
    count: alerts.length,
    text: dutyDigestText(alerts.map((a) => ({ text: a.text, createdAt: Date.parse(a.createdAt) })), quiet),
    window: {
      startMinute: quiet.startMinute,
      endMinute: quiet.endMinute,
      timeZone: "Asia/Riyadh",
    },
    alerts,
    url: dutyDashboardUrl(),
    sentAt: now.toISOString(),
  };
}

type RawRow = Record<string, unknown>;
const fromRaw = (r: RawRow): DutyAlertRow => ({
  id: r.id as number | string,
  kind: String(r.kind),
  userId: (r.user_id as string | null) ?? null,
  occurrenceKey: (r.occurrence_key as string | null) ?? null,
  payload: r.payload,
  createdAt: r.created_at as Date | string,
  deferredUntil: (r.deferred_until as Date | string | null) ?? null,
});

async function claim(deferred: boolean): Promise<DutyAlertRow[]> {
  const result = await db.execute(sql`
    WITH c AS (
      SELECT id FROM content_duty_alerts
      WHERE delivered_at IS NULL
        AND delivery_attempts < ${DUTY_ALERT_MAX_ATTEMPTS}
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
        AND ${deferred
          ? sql`deferred_until IS NOT NULL AND deferred_until <= now() AND deferred_until >= now() - make_interval(mins => ${DUTY_DIGEST_MAX_AGE_MIN})`
          : sql`deferred_until IS NULL AND created_at >= now() - make_interval(mins => ${DUTY_ALERT_MAX_AGE_MIN})`}
      ORDER BY id
      LIMIT ${deferred ? DIGEST_BATCH : BATCH}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE content_duty_alerts a
    SET delivery_attempts = a.delivery_attempts + 1,
        next_attempt_at = now() + make_interval(mins => ${DUTY_ALERT_CLAIM_LEASE_MIN})
    FROM c
    WHERE a.id = c.id
    RETURNING a.id, a.kind, a.user_id, a.occurrence_key, a.payload, a.created_at, a.deferred_until, a.delivery_attempts
  `);
  const rows = ((result as { rows?: RawRow[] }).rows ?? []) as RawRow[];
  return rows.map(fromRaw).sort((a, b) => Number(a.id) - Number(b.id));
}

async function markDelivered(ids: Array<number | string>) {
  if (ids.length === 0) return;
  await db.update(contentDutyAlerts)
    .set({ deliveredAt: sql`now()`, nextAttemptAt: null, lastError: null })
    .where(inArray(contentDutyAlerts.id, ids.map(Number)));
}

async function markFailed(ids: Array<number | string>, error: string) {
  if (ids.length === 0) return;
  // delivery_attempts زادت عند الحجز؛ التأخير التالي يُحسب منها.
  await db.execute(sql`
    UPDATE content_duty_alerts
    SET next_attempt_at = now() + make_interval(mins => LEAST(8, power(2, GREATEST(0, delivery_attempts - 1))::int)),
        last_error = ${error.slice(0, 300)}
    WHERE id IN (${sql.join(ids.map((id) => sql`${Number(id)}`), sql`, `)})
  `);
}

export interface DutyDeliveryResult {
  sent: number;
  failed: number;
  digest: number;
}

/**
 * يرسل المستحق: الفوري واحدًا واحدًا، والمؤجل المستحق كملخص واحد. بلا DUTY_ALERT_WEBHOOK_URL
 * لا يحجز شيئًا ولا يستهلك محاولات.
 */
export async function deliverPendingDutyAlerts(quiet: DutyQuietHours, cfg = dutyWebhookConfig()): Promise<DutyDeliveryResult> {
  const result: DutyDeliveryResult = { sent: 0, failed: 0, digest: 0 };
  if (!cfg) return result;

  for (const row of await claim(false)) {
    const wire = toDutyAlertWire(row);
    const res = await postDutyWebhook(cfg, buildAlertWebhookBody(wire), `kind=${wire.kind} id=${wire.id}`);
    if (res.ok) {
      await markDelivered([row.id]);
      result.sent++;
    } else {
      await markFailed([row.id], res.error ?? "failed");
      result.failed++;
    }
  }

  const deferred = await claim(true);
  if (deferred.length > 0) {
    const wires = deferred.map(toDutyAlertWire);
    const res = await postDutyWebhook(cfg, buildDigestWebhookBody(wires, quiet), `digest count=${wires.length}`);
    const ids = deferred.map((r) => r.id);
    if (res.ok) {
      await markDelivered(ids);
      result.digest = wires.length;
    } else {
      await markFailed(ids, res.error ?? "failed");
      result.failed += wires.length;
    }
  }
  return result;
}

