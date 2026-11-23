import { describe, expect, it } from "vitest";
import {
  canRemindNow,
  isAnnouncementActive,
  tallyVotes,
  validateCreateAnnouncement,
  validateVote,
} from "@shared/opinionWriterAnnouncements";
import { filterTrackedArticles } from "../../client/src/pages/opinion-author/WriterHomeParts";

const NOW = new Date("2026-11-24T10:00:00Z");

describe("validateCreateAnnouncement", () => {
  it("accepts a file announcement and defaults expiry to 14 days", () => {
    const r = validateCreateAnnouncement({ kind: "file", title: "محضر اللقاء", fileId: "f1" }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.fileId).toBe("f1");
      expect(r.value.expiresAt.getTime() - NOW.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
      expect(r.value.sendEmail).toBe(false);
    }
  });

  it("rejects unknown fields and fields that belong to another kind (A4)", () => {
    expect(validateCreateAnnouncement({ kind: "note", title: "عنوان", body: "نص", pinned: true }, NOW)).toMatchObject({ ok: false, code: "UNKNOWN_FIELD" });
    expect(validateCreateAnnouncement({ kind: "note", title: "عنوان", body: "نص", fileId: "f1" }, NOW)).toMatchObject({ ok: false, code: "FIELD_NOT_FOR_KIND" });
    expect(validateCreateAnnouncement({ kind: "file", title: "عنوان", fileId: "f1", pollOptions: ["أ", "ب"] }, NOW)).toMatchObject({ ok: false, code: "FIELD_NOT_FOR_KIND" });
  });

  it("validates poll options", () => {
    expect(validateCreateAnnouncement({ kind: "poll", title: "أي موعد؟", pollOptions: ["الأحد"] }, NOW)).toMatchObject({ ok: false, code: "POLL_OPTIONS_REQUIRED" });
    expect(validateCreateAnnouncement({ kind: "poll", title: "أي موعد؟", pollOptions: ["الأحد", "الأحد"] }, NOW)).toMatchObject({ ok: false, code: "POLL_OPTION_DUPLICATE" });
    const ok = validateCreateAnnouncement({ kind: "poll", title: "أي موعد؟", pollOptions: [" الأحد ", "", "الثلاثاء"] }, NOW);
    expect(ok.ok && ok.value.pollOptions).toEqual(["الأحد", "الثلاثاء"]);
  });

  it("accepts only https or internal links", () => {
    expect(validateCreateAnnouncement({ kind: "link", title: "رابط", linkUrl: "http://x.com" }, NOW)).toMatchObject({ ok: false, code: "INVALID_LINK" });
    expect(validateCreateAnnouncement({ kind: "link", title: "رابط", linkUrl: "javascript:alert(1)" }, NOW)).toMatchObject({ ok: false, code: "INVALID_LINK" });
    expect(validateCreateAnnouncement({ kind: "link", title: "رابط", linkUrl: "//evil.com" }, NOW)).toMatchObject({ ok: false });
    expect(validateCreateAnnouncement({ kind: "link", title: "رابط", linkUrl: "/dashboard/opinion-author/guide" }, NOW).ok).toBe(true);
    expect(validateCreateAnnouncement({ kind: "link", title: "رابط", linkUrl: "https://sabq.org/x" }, NOW).ok).toBe(true);
  });

  it("treats a bare date as end of day in Riyadh and rejects past or far dates", () => {
    const r = validateCreateAnnouncement({ kind: "note", title: "عنوان", body: "نص", expiresAt: "2026-11-30" }, NOW);
    expect(r.ok && r.value.expiresAt.toISOString()).toBe("2026-11-30T20:59:59.000Z");
    expect(validateCreateAnnouncement({ kind: "note", title: "عنوان", body: "نص", expiresAt: "2026-11-01" }, NOW)).toMatchObject({ code: "INVALID_EXPIRY" });
    expect(validateCreateAnnouncement({ kind: "note", title: "عنوان", body: "نص", expiresAt: "2027-12-01" }, NOW)).toMatchObject({ code: "INVALID_EXPIRY" });
  });

  it("requires body for notes and a boolean sendEmail", () => {
    expect(validateCreateAnnouncement({ kind: "note", title: "عنوان" }, NOW)).toMatchObject({ code: "BODY_REQUIRED" });
    expect(validateCreateAnnouncement({ kind: "note", title: "عنوان", body: "نص", sendEmail: "yes" }, NOW)).toMatchObject({ code: "INVALID_FIELD_TYPE" });
  });
});

describe("votes, reminders, activity", () => {
  it("validates vote bodies", () => {
    expect(validateVote({ optionIndex: 1 }, 3)).toEqual({ ok: true, optionIndex: 1 });
    expect(validateVote({ optionIndex: 3 }, 3)).toMatchObject({ ok: false, code: "INVALID_OPTION" });
    expect(validateVote({ optionIndex: 0, extra: 1 }, 3)).toMatchObject({ ok: false, code: "UNKNOWN_FIELD" });
  });

  it("tallies votes ignoring out-of-range values", () => {
    expect(tallyVotes(3, [0, 0, 2, null, 5, -1])).toEqual([2, 0, 1]);
  });

  it("allows one reminder per 24 hours", () => {
    expect(canRemindNow(null, NOW)).toBe(true);
    expect(canRemindNow(new Date(NOW.getTime() - 23 * 3600_000), NOW)).toBe(false);
    expect(canRemindNow(new Date(NOW.getTime() - 24 * 3600_000), NOW)).toBe(true);
  });

  it("knows when an announcement is active", () => {
    expect(isAnnouncementActive({ expiresAt: "2026-11-25T00:00:00Z" }, NOW)).toBe(true);
    expect(isAnnouncementActive({ expiresAt: "2026-11-25T00:00:00Z", archivedAt: "2026-11-24T09:00:00Z" }, NOW)).toBe(false);
    expect(isAnnouncementActive({ expiresAt: "2026-11-24T09:00:00Z" }, NOW)).toBe(false);
  });
});

describe("filterTrackedArticles", () => {
  const list = [
    { id: "1", status: "draft", reviewStatus: null },
    { id: "2", status: "draft", reviewStatus: "pending_review" },
    { id: "3", status: "draft", reviewStatus: "needs_changes" },
    { id: "4", status: "scheduled", reviewStatus: "approved" },
    { id: "5", status: "published", reviewStatus: "approved" },
    { id: "6", status: "draft", reviewStatus: "rejected" },
  ];
  const ids = (f: Parameters<typeof filterTrackedArticles>[1]) => filterTrackedArticles(list, f).map((a) => a.id);
  it("splits articles by writer-facing status", () => {
    expect(ids("active")).toEqual(["2", "3", "4"]);
    expect(ids("action")).toEqual(["3"]);
    expect(ids("drafts")).toEqual(["1"]);
    expect(ids("scheduled")).toEqual(["4"]);
    expect(ids("published")).toEqual(["5"]);
    expect(ids("declined")).toEqual(["6"]);
    expect(ids("all")).toHaveLength(6);
  });
});
