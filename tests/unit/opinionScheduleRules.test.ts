import { describe, expect, it } from "vitest";
import {
  OPINION_SLOT_GAP_MS,
  collectOccupiedScheduleInstants,
  opinionResubmitReviewPatch,
  resolveWriterScheduleBannerState,
  scheduleConflictsWith,
} from "../../server/services/opinionScheduleRules";

const DAY = 24 * 60 * 60 * 1000;

describe("opinion schedule conflict", () => {
  it("treats published, scheduled, and in-review instants as occupied", () => {
    const occupied = collectOccupiedScheduleInstants([
      { status: "published", publishedAt: "2026-10-01T03:00:00.000Z" },
      { status: "scheduled", scheduledAt: "2026-10-08T03:00:00.000Z" },
      {
        status: "draft",
        reviewStatus: "pending_review",
        updatedAt: "2026-10-15T03:00:00.000Z",
      },
      { status: "draft", reviewStatus: null, updatedAt: "2026-10-20T03:00:00.000Z" },
    ]);
    expect(occupied).toHaveLength(3);
    expect(scheduleConflictsWith(new Date("2026-10-16T03:00:00.000Z"), occupied)).toBe(true);
    expect(scheduleConflictsWith(new Date("2026-11-01T03:00:00.000Z"), occupied)).toBe(false);
    expect(OPINION_SLOT_GAP_MS).toBe(6 * DAY + 12 * 60 * 60 * 1000);
  });
});

describe("writer schedule banner state", () => {
  const base = {
    hasUpcoming: false,
    hasInReview: false,
    scheduleIsFresh: false,
    nowMs: Date.parse("2026-10-20T12:00:00.000Z"),
    submitDeadlineMs: Date.parse("2026-10-18T03:00:00.000Z"),
    lastPublishedAtMs: Date.parse("2026-10-01T03:00:00.000Z"),
    reminderWindowMs: 2 * DAY,
    lateAfterPublishMs: 8 * DAY,
  };

  it("does not mark the writer late while an article is in review", () => {
    expect(resolveWriterScheduleBannerState({ ...base, hasInReview: true })).toBe("ok");
    expect(resolveWriterScheduleBannerState({ ...base, hasUpcoming: true, hasInReview: false })).toBe("ok");
  });

  it("is late only after the deadline when nothing is in review", () => {
    expect(resolveWriterScheduleBannerState(base)).toBe("late");
    expect(resolveWriterScheduleBannerState({
      ...base,
      nowMs: Date.parse("2026-10-17T03:00:00.000Z"),
      lastPublishedAtMs: Date.parse("2026-10-16T03:00:00.000Z"),
    })).toBe("reminder");
  });
});

describe("opinion resubmit review patch", () => {
  it("clears stale notes and does not touch reviewedAt", () => {
    expect(opinionResubmitReviewPatch()).toEqual({
      reviewStatus: "pending_review",
      reviewNotes: null,
    });
    expect(opinionResubmitReviewPatch()).not.toHaveProperty("reviewedAt");
  });
});
