import { describe, expect, it } from "vitest";
import { computeWriterNextStep, type NextStepInput } from "../../shared/writerNextStep";

const now = new Date("2026-11-27T12:00:00Z");
const base: NextStepInput = { articles: [], banner: null, slotChange: null, announcements: [], now };
const art = (over: Partial<NextStepInput["articles"][number]>) => ({
  id: "a1", title: "مقال", status: "draft", reviewStatus: null, reviewNotes: null,
  scheduledAt: null, updatedAt: "2026-11-26T10:00:00Z", ...over,
});

describe("computeWriterNextStep", () => {
  it("puts editor notes before everything", () => {
    const s = computeWriterNextStep({
      ...base,
      articles: [art({ id: "d", reviewStatus: null }), art({ id: "n", reviewStatus: "needs_changes", reviewNotes: " قوِّ الفقرة " })],
      slotChange: { canChange: true, closesAt: null },
    });
    expect(s.kind).toBe("needs_changes");
    expect(s.articleId).toBe("n");
    expect(s.body).toBe("قوِّ الفقرة");
    expect(s.action).toBe("fix_article");
  });

  it("flags an unsent draft only after 30 minutes idle", () => {
    const fresh = computeWriterNextStep({ ...base, articles: [art({ updatedAt: "2026-11-27T11:50:00Z" })] });
    expect(fresh.kind).toBe("write_next");
    const old = computeWriterNextStep({ ...base, articles: [art({})] });
    expect(old.kind).toBe("unsent_draft");
    expect(old.action).toBe("submit_draft");
  });

  it("late deadline beats unsent draft, but not when an article is already on its way", () => {
    const banner = { state: "late" as const, submitDeadline: "2026-11-27T09:00:00Z", nextPublishAt: "2026-11-29T16:00:00Z", hasUpcoming: false };
    expect(computeWriterNextStep({ ...base, banner, articles: [art({})] }).kind).toBe("late");
    expect(computeWriterNextStep({ ...base, banner: { ...banner, hasUpcoming: true }, articles: [art({})] }).kind).toBe("unsent_draft");
  });

  it("offers slot change, then pending poll, then shows article in pipeline", () => {
    const ann = [{ id: "p", kind: "poll", title: "استطلاع", acted: false, myVote: null }];
    const pipeline = [art({ status: "scheduled", reviewStatus: "approved", scheduledAt: "2026-11-29T16:00:00Z" })];
    expect(computeWriterNextStep({ ...base, slotChange: { canChange: true, closesAt: "2026-12-04T20:00:00Z" }, announcements: ann, articles: pipeline }).kind).toBe("slot_change");
    const poll = computeWriterNextStep({ ...base, announcements: ann, articles: pipeline });
    expect(poll.kind).toBe("announcement");
    expect(poll.announcementId).toBe("p");
    const voted = computeWriterNextStep({ ...base, announcements: [{ ...ann[0], myVote: 1 }], articles: pipeline });
    expect(voted.kind).toBe("scheduled");
    expect(voted.tone).toBe("success");
  });

  it("uses Latin digits in dates", () => {
    const s = computeWriterNextStep({ ...base, banner: { state: "ok", submitDeadline: "", nextPublishAt: "2026-11-29T16:00:00Z", hasUpcoming: false } });
    expect(s.kind).toBe("write_next");
    expect(s.body).toMatch(/[0-9]/);
    expect(s.body).not.toMatch(/[٠-٩]/);
  });
});
