// «عين المناوبة»: قراءة التنبيهات لمسارات البوت (/api/internal/bot-desk/duty/*). قراءة فقط.
import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "../../db";
import { contentDutyAlerts } from "@shared/schema";
import { toDutyAlertWire, type DutyAlertWire } from "./dutyAlertDelivery";

export class DutyAlertsNotReadyError extends Error {
  readonly code = "duty_alerts_not_ready";
  constructor() {
    super("content_duty_alerts is not installed");
    this.name = "DutyAlertsNotReadyError";
  }
}

function rethrow(error: unknown): never {
  const e = error as { code?: string; cause?: { code?: string } } | undefined;
  const code = e?.code ?? e?.cause?.code;
  if (code === "42P01" || code === "42501") throw new DutyAlertsNotReadyError();
  throw error;
}

const columns = {
  id: contentDutyAlerts.id,
  kind: contentDutyAlerts.kind,
  userId: contentDutyAlerts.userId,
  occurrenceKey: contentDutyAlerts.occurrenceKey,
  payload: contentDutyAlerts.payload,
  createdAt: contentDutyAlerts.createdAt,
  deferredUntil: contentDutyAlerts.deferredUntil,
  deliveredAt: contentDutyAlerts.deliveredAt,
};

export interface DutyAlertsPage {
  alerts: DutyAlertWire[];
  /** مرّره كـ after في الطلب التالي؛ null إن لم يرجع شيء */
  nextCursor: string | null;
  hasMore: boolean;
}

/** سجل التنبيهات بمؤشر تصاعدي (id > after)، للاستدراك إن فات الدفع. */
export async function listDutyAlerts(after: number, limit: number): Promise<DutyAlertsPage> {
  try {
    const rows = await db.select(columns).from(contentDutyAlerts)
      .where(gt(contentDutyAlerts.id, after))
      .orderBy(asc(contentDutyAlerts.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit).map(toDutyAlertWire);
    return {
      alerts: page,
      nextCursor: page.length ? page[page.length - 1].id : after > 0 ? String(after) : null,
      hasMore: rows.length > limit,
    };
  } catch (error) {
    rethrow(error);
  }
}

export async function getDutyAlert(id: number): Promise<DutyAlertWire | null> {
  try {
    const [row] = await db.select(columns).from(contentDutyAlerts).where(and(eq(contentDutyAlerts.id, id))).limit(1);
    return row ? toDutyAlertWire(row) : null;
  } catch (error) {
    rethrow(error);
  }
}
