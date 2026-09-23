import { getNextSlotsForWriters } from "./opinionWritersService";
import type { WriterWeeklySlot } from "./writerWeeklySlot";

/** Use the web's batch calculation, including its published/scheduled floor. */
export async function enrichMobileAdminSchedules<T extends {
  status: string;
  articleType?: string | null;
  authorId?: string | null;
}>(rows: T[]) {
  const needsWriterSlot = (row: T) => row.articleType === "opinion"
    && (row.status === "draft" || row.status === "scheduled") && Boolean(row.authorId);
  const writerIds = [...new Set(rows.filter(needsWriterSlot).map(row => row.authorId!))];
  const slots = writerIds.length ? await getNextSlotsForWriters(writerIds) : {};
  // Scheduled opinion articles also need their next slot when rescheduling
  // an overdue saved date. Keep the saved date untouched for the warning.
  return rows.map((row): T & { writerWeeklySlot?: WriterWeeklySlot } => {
    const slot = needsWriterSlot(row) ? slots[row.authorId!] : undefined;
    return slot ? { ...row, writerWeeklySlot: slot } : row;
  });
}

/** A scheduled write must have a real future instant; drafts may retain an overdue date. */
export function mobileScheduleError(
  status: string,
  scheduledAt: unknown,
  now = new Date(),
): string | null {
  const date = scheduledAt instanceof Date
    ? scheduledAt
    : typeof scheduledAt === "string" && scheduledAt.trim()
      ? new Date(scheduledAt)
      : null;
  if (status !== "scheduled") return null;
  if (!date || !Number.isFinite(date.getTime())) return "حدّد تاريخ ووقت النشر قبل حفظ الجدولة";
  if (date.getTime() <= now.getTime()) return "فات موعد النشر المحدد؛ اختر موعداً مستقبلياً أو انشر الآن";
  return null;
}
