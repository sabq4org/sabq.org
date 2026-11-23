// «عين المناوبة»: المحرك. مهمة على القائد كل دقيقة (server/jobs/dutyAlertsJob.ts):
// 1) يقرأ الورديات الجارية والمنتهية قبل أقل من 20 دقيقة، ودقائق الحضور وآخر عمل والمواد المنتظرة
//    (loadDutyData وexpandOccurrences الموجودة)، ويحسب المستحق بالمنطق الخالص في shared/contentDutyAlerts.ts.
// 2) يكتب كل تنبيه بـ INSERT … ON CONFLICT (dedupe_key) DO NOTHING (آمن مع نسختين).
//    ما تولّد في ساعات الهدوء يُحفظ مع deferred_until (نهايتها) ليُرسل في ملخص الصباح.
// 3) يدفع المستحق إلى DUTY_ALERT_WEBHOOK_URL (dutyAlertDelivery.ts).
// قبل تنفيذ migrations/20261123_content_duty_alerts.sql: سطر واحد في السجل ثم تخطٍّ هادئ، ولا يرمي أبدًا.
import { and, gt, inArray, lt } from "drizzle-orm";
import { db } from "../../db";
import { articleEditLocks, contentDutyAlerts } from "@shared/schema";
import { computeShiftReport, isOverdue, waitingAt, type DutyOccurrence } from "@shared/contentDuty";
import {
  DUTY_ALERT_LABELS,
  DUTY_EARLY_START_MIN,
  DUTY_SUMMARY_WINDOW_MIN,
  deferredUntilFor,
  dutyAlertText,
  evaluateBreakingAlerts,
  evaluateOccurrenceAlerts,
  occurrenceAlertKey,
  summaryDataFromReport,
  type DutyAlertCandidate,
  type SentAlert,
} from "@shared/contentDutyAlerts";
import { loadDutyData, loadRoster, trackingSince } from "./dutyMetricsService";
import { ContentDutyNotReadyError, getAlertSettings, getThresholds, loadNames } from "./dutyRosterStore";
import { deliverPendingDutyAlerts, type DutyAlertStoredPayload } from "./dutyAlertDelivery";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const LOG = "[DutyAlerts]";
/** بعد اكتشاف غياب الجدول لا نعيد المحاولة قبل هذه المدة (تخفيف الضجيج على القاعدة). */
const MISSING_RETRY_MS = 10 * MINUTE;

let missingLogged = false;
let missingUntil = 0;

function pgCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } } | undefined;
  return e?.code ?? e?.cause?.code;
}

/** الجدول غير موجود أو بلا صلاحية (قبل تنفيذ الترحيل). */
export function isDutyAlertsNotReady(error: unknown): boolean {
  if (error instanceof ContentDutyNotReadyError) return true;
  const code = pgCode(error);
  return code === "42P01" || code === "42501";
}

export interface DutyTickResult {
  skipped?: "not_ready";
  candidates: number;
  inserted: number;
  deferred: number;
  sent: number;
  failed: number;
  digest: number;
}

/** دورة واحدة. لا ترمي: كل خطأ يُسجل ويُعاد كنتيجة فارغة. */
export async function runDutyAlertsTick(now = Date.now()): Promise<DutyTickResult> {
  const empty: DutyTickResult = { candidates: 0, inserted: 0, deferred: 0, sent: 0, failed: 0, digest: 0 };
  if (now < missingUntil) return { ...empty, skipped: "not_ready" };
  try {
    const result = await detectAndStore(now);
    const settings = await getAlertSettings();
    const delivery = await deliverPendingDutyAlerts(settings.quietHours);
    missingLogged = false;
    return { ...result, ...delivery };
  } catch (error) {
    if (isDutyAlertsNotReady(error)) {
      missingUntil = now + MISSING_RETRY_MS;
      if (!missingLogged) {
        console.warn(`${LOG} content_duty_alerts is not installed yet (run migrations/20261123_content_duty_alerts.sql); skipping`);
        missingLogged = true;
      }
      return { ...empty, skipped: "not_ready" };
    }
    console.error(`${LOG} tick failed: ${error instanceof Error ? error.message : String(error)}`);
    return empty;
  }
}

async function detectAndStore(now: number): Promise<Pick<DutyTickResult, "candidates" | "inserted" | "deferred">> {
  const [settings, thresholds, since] = await Promise.all([getAlertSettings(), getThresholds(), trackingSince()]);
  const { occurrences } = await loadRoster(now - DAY, now + HOUR);
  const relevant = occurrences.filter((o) =>
    o.start - DUTY_EARLY_START_MIN * MINUTE <= now && now < o.end + DUTY_SUMMARY_WINDOW_MIN * MINUTE);
  if (relevant.length === 0) return { candidates: 0, inserted: 0, deferred: 0 };

  const userIds = Array.from(new Set(relevant.map((o) => o.userId)));
  const from = Math.min(...relevant.map((o) => o.start)) - DUTY_EARLY_START_MIN * MINUTE;
  const [data, names, sentRows] = await Promise.all([
    loadDutyData(from, now + MINUTE, userIds, now),
    loadNames(userIds),
    db.select({ dedupeKey: contentDutyAlerts.dedupeKey, createdAt: contentDutyAlerts.createdAt, payload: contentDutyAlerts.payload })
      .from(contentDutyAlerts)
      .where(inArray(contentDutyAlerts.occurrenceKey, relevant.map(occurrenceAlertKey))),
  ]);
  const sent = new Map<string, SentAlert>();
  for (const r of sentRows) {
    const p = (r.payload ?? {}) as Partial<DutyAlertStoredPayload>;
    sent.set(r.dedupeKey, { at: new Date(r.createdAt).getTime(), data: (p.data ?? {}) as Record<string, unknown> });
  }

  const candidates: Array<DutyAlertCandidate & { occ: DutyOccurrence | null }> = [];
  for (const occ of relevant) {
    const minutes = data.minutes.get(occ.userId) ?? new Map();
    const found = evaluateOccurrenceAlerts({
      occ,
      now,
      minutes,
      lastWorkAt: data.lastAction.get(occ.userId)?.at ?? null,
      sent,
      settings,
      trackedFrom: since,
    });
    for (const c of found) {
      if (c.kind === "summary") {
        const report = computeShiftReport({
          occ,
          now,
          minutes,
          ownVersions: data.ownVersions.get(occ.userId) ?? [],
          ownReviews: data.ownReviews.get(occ.userId) ?? [],
          items: data.items,
          breakingIds: data.breakingIds,
          thresholds,
          trackedFrom: since,
        });
        c.data = summaryDataFromReport(report, occ);
      }
      candidates.push({ ...c, occ });
    }
  }

  // العاجل المتأخر: من المنتظر الآن، بلا قفل تحرير ساري.
  const live = relevant.filter((o) => o.start <= now && now < o.end);
  if (live.length > 0 && settings.enabled.breaking_overdue) {
    const overdueBreaking = waitingAt(data.items, now).filter((i) => i.breaking && isOverdue(i, now, thresholds));
    if (overdueBreaking.length > 0) {
      const ids = overdueBreaking.map((i) => i.articleId);
      const [locks, already] = await Promise.all([
        db.select({ articleId: articleEditLocks.articleId }).from(articleEditLocks)
          .where(and(inArray(articleEditLocks.articleId, ids), gt(articleEditLocks.expiresAt, new Date(now)))),
        db.select({ dedupeKey: contentDutyAlerts.dedupeKey }).from(contentDutyAlerts)
          .where(inArray(contentDutyAlerts.dedupeKey, overdueBreaking.map((i) => `breaking:${i.articleId}:${Math.floor(i.waitingSince / MINUTE)}`))),
      ]);
      for (const c of evaluateBreakingAlerts({
        items: overdueBreaking,
        now,
        thresholds,
        lockedIds: new Set(locks.map((l) => l.articleId)),
        live,
        sent: new Set(already.map((a) => a.dedupeKey)),
        settings,
      })) candidates.push({ ...c, occ: null });
    }
  }
  if (candidates.length === 0) return { candidates: 0, inserted: 0, deferred: 0 };

  const deferredUntil = deferredUntilFor(now, settings.quietHours);
  let inserted = 0;
  for (const c of candidates) {
    const userName = c.userId ? names.get(c.userId) ?? "بلا اسم" : null;
    const payload: DutyAlertStoredPayload = {
      label: DUTY_ALERT_LABELS[c.kind],
      text: dutyAlertText(c.kind, userName ?? "المناوب", c.data),
      userName,
      data: c.data,
      deferred: deferredUntil !== null,
    };
    const rows = await db.insert(contentDutyAlerts)
      .values({
        dedupeKey: c.dedupeKey,
        kind: c.kind,
        userId: c.userId,
        occurrenceKey: c.occurrenceKey,
        payload,
        deferredUntil: deferredUntil === null ? null : new Date(deferredUntil),
      })
      .onConflictDoNothing({ target: contentDutyAlerts.dedupeKey })
      .returning({ id: contentDutyAlerts.id });
    inserted += rows.length;
  }
  return { candidates: candidates.length, inserted, deferred: deferredUntil === null ? 0 : inserted };
}

/** حذف التنبيهات الأقدم من 90 يومًا (من مهمة التنظيف الليلية). */
export async function pruneDutyAlerts(days = 90): Promise<void> {
  await db.delete(contentDutyAlerts).where(lt(contentDutyAlerts.createdAt, new Date(Date.now() - days * DAY)));
}
