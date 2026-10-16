import { getNextSlotsForWriters } from "./opinionWritersService";
import { attachWriterWeeklySlots, type WriterWeeklySlot } from "./writerWeeklySlot";

/** Use the web's batch calculation, including its published/scheduled floor. */
export async function enrichMobileAdminSchedules<T extends {
  status: string;
  articleType?: string | null;
  authorId?: string | null;
}>(rows: T[]) {
  const needsWriterSlot = (row: T) => row.articleType === "opinion"
    && (row.status === "draft" || row.status === "scheduled") && Boolean(row.authorId);
  const writerIds = [...new Set(rows.filter(needsWriterSlot).map(row => row.authorId!))];
  const slots = writerIds.length ? await getNextSlotsForWriters(writerIds, { includeInFlightDrafts: false }) : {};
  // Drafts of the same writer get sequential weeks. A scheduled row keeps the
  // base suggestion for rescheduling and does not consume a draft slot.
  const withDraftSlots = attachWriterWeeklySlots(rows, slots);
  return withDraftSlots.map((row): T & { writerWeeklySlot?: WriterWeeklySlot } => {
    if (row.writerWeeklySlot || row.status !== "scheduled" || !row.authorId) return row;
    const slot = slots[row.authorId];
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
