/**
 * قواعد مواعيد كتّاب الرأي وملاحظات المراجعة — بلا قاعدة بيانات.
 * الفجوة نفس computeNextSlot: أسبوع مع تسامح نصف يوم.
 */
export const OPINION_SLOT_GAP_MS = 6 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000;

export type ScheduleInstantRow = {
  status: string;
  reviewStatus?: string | null;
  publishedAt?: Date | string | null;
  scheduledAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** لحظات مشغولة لكاتب آخر المقال نفسه: منشور، مجدول، أو قيد المراجعة/الاعتماد. */
export function collectOccupiedScheduleInstants(rows: ScheduleInstantRow[]): Date[] {
  const occupied: Date[] = [];
  for (const row of rows) {
    const instant =
      row.status === "published"
        ? row.publishedAt
        : row.status === "scheduled"
          ? row.scheduledAt
          : row.reviewStatus === "pending_review" || row.reviewStatus === "approved"
            ? row.scheduledAt ?? row.updatedAt
            : null;
    const date = asDate(instant);
    if (date) occupied.push(date);
  }
  return occupied;
}

export function scheduleConflictsWith(
  candidate: Date,
  occupied: Date[],
  gapMs = OPINION_SLOT_GAP_MS,
): boolean {
  const at = candidate.getTime();
  if (!Number.isFinite(at)) return true;
  return occupied.some((instant) => Math.abs(at - instant.getTime()) < gapMs);
}

export type WriterBannerState = "ok" | "reminder" | "late";

/**
 * «متأخر» لا يُعرض والمقال قيد المراجعة أو في الطريق للنشر.
 * hasInReview يكفي وحده حتى لو لم يُحسب ضمن hasUpcoming.
 */
export function resolveWriterScheduleBannerState(input: {
  hasUpcoming: boolean;
  hasInReview: boolean;
  scheduleIsFresh: boolean;
  nowMs: number;
  submitDeadlineMs: number;
  lastPublishedAtMs: number | null;
  reminderWindowMs: number;
  lateAfterPublishMs: number;
}): WriterBannerState {
  if (input.hasInReview || input.hasUpcoming) return "ok";
  const pastDeadline = input.nowMs >= input.submitDeadlineMs;
  const stalePublication =
    input.lastPublishedAtMs != null && input.nowMs - input.lastPublishedAtMs > input.lateAfterPublishMs;
  if (!input.scheduleIsFresh && (pastDeadline || stalePublication)) return "late";
  const untilDeadline = input.submitDeadlineMs - input.nowMs;
  if (untilDeadline > 0 && untilDeadline <= input.reminderWindowMs) return "reminder";
  return "ok";
}

/** إعادة الإرسال تمسح ملاحظة المراجعة القديمة وتُبقي reviewedAt لشارة «أُعيد بعد التعديل». */
export function opinionResubmitReviewPatch(): {
  reviewStatus: "pending_review";
  reviewNotes: null;
} {
  return { reviewStatus: "pending_review", reviewNotes: null };
}
