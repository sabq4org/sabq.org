import { describe, expect, it } from "vitest";
import {
  attachWriterWeeklySlots,
  collectOpinionDraftWriterIds,
  isOpinionWriterDraft,
  type WriterWeeklySlot,
} from "../../server/services/writerWeeklySlot";

const SLOT: WriterWeeklySlot = {
  weekday: 2,
  publishTime: "06:00",
  nextSlot: "2026-08-25T03:00:00.000Z",
};

describe("isOpinionWriterDraft", () => {
  it("يقبل مسودة رأي لها كاتب", () => {
    expect(
      isOpinionWriterDraft({ status: "draft", articleType: "opinion", authorId: "w1" }),
    ).toBe(true);
  });

  it("يرفض الخبر والمجدول والمسودة بلا كاتب", () => {
    expect(
      isOpinionWriterDraft({ status: "draft", articleType: "news", authorId: "w1" }),
    ).toBe(false);
    expect(
      isOpinionWriterDraft({ status: "scheduled", articleType: "opinion", authorId: "w1" }),
    ).toBe(false);
    expect(
      isOpinionWriterDraft({ status: "draft", articleType: "opinion", authorId: null }),
    ).toBe(false);
  });
});

describe("collectOpinionDraftWriterIds", () => {
  it("يجمع كتّاب مسودات الرأي بلا تكرار", () => {
    expect(
      collectOpinionDraftWriterIds([
        { status: "draft", articleType: "opinion", authorId: "w1" },
        { status: "draft", articleType: "opinion", authorId: "w1" },
        { status: "draft", articleType: "news", authorId: "w2" },
        { status: "published", articleType: "opinion", authorId: "w3" },
        { status: "draft", articleType: "opinion", authorId: "w4" },
      ]),
    ).toEqual(["w1", "w4"]);
  });
});

describe("attachWriterWeeklySlots", () => {
  it("يلحق الموعد بمسودة الرأي فقط", () => {
    const result = attachWriterWeeklySlots(
      [
        { id: "a1", status: "draft", articleType: "opinion", authorId: "w1", title: "عمود" },
        { id: "a2", status: "draft", articleType: "news", authorId: "w1", title: "خبر" },
        { id: "a3", status: "published", articleType: "opinion", authorId: "w1", title: "منشور" },
        { id: "a4", status: "draft", articleType: "opinion", authorId: "w2", title: "بلا جدول" },
      ],
      { w1: SLOT },
    );

    expect(result[0].writerWeeklySlot).toEqual(SLOT);
    expect(result[1].writerWeeklySlot).toBeUndefined();
    expect(result[2].writerWeeklySlot).toBeUndefined();
    expect(result[3].writerWeeklySlot).toBeUndefined();
    expect(result[0].title).toBe("عمود");
  });
});
