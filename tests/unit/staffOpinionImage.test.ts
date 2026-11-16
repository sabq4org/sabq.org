// توليد صورة مقال الرأي من bot-desk: الحالات المسموحة، الوصف، وانتظار صورة أخرى للحساب.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createEditorialImageJob: vi.fn(),
  runEditorialImageJob: vi.fn(),
  getEditorialImageJob: vi.fn(),
}));

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/editorialImagesService", () => ({
  createEditorialImageJob: (...a: unknown[]) => mocks.createEditorialImageJob(...a),
  runEditorialImageJob: (...a: unknown[]) => mocks.runEditorialImageJob(...a),
  getEditorialImageJob: (...a: unknown[]) => mocks.getEditorialImageJob(...a),
}));

import { assertOpinionImageAllowed, opinionImagePromptFor } from "../../server/services/staffOpinionImageService";
import { generateOpinionImage } from "../../server/services/staffOpinionPrepareService";
import { EditorialImageError } from "../../server/services/openaiImagesProvider";
import { StaffOpinionDeskError } from "../../server/services/staffOpinionDeskService";
import { botDeskOpinionImageSchema } from "@shared/botDesk";

function conflict(row: { status: string; reviewStatus: string | null; source?: string | null }) {
  try {
    assertOpinionImageAllowed(row);
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(StaffOpinionDeskError);
    expect((err as StaffOpinionDeskError).status).toBe(409);
    return (err as StaffOpinionDeskError).message;
  }
}

describe("assertOpinionImageAllowed", () => {
  it("allows scheduled articles and drafts awaiting the desk", () => {
    expect(conflict({ status: "scheduled", reviewStatus: "approved", source: "manual" })).toBeNull();
    expect(conflict({ status: "draft", reviewStatus: "pending_review" })).toBeNull();
    expect(conflict({ status: "draft", reviewStatus: "approved" })).toBeNull();
    expect(conflict({ status: "draft", reviewStatus: null, source: "ios-app" })).toBeNull();
  });

  it("rejects published (dashboard hint), archived and drafts not awaiting the desk", () => {
    expect(conflict({ status: "published", reviewStatus: "approved" })).toContain("منشور");
    for (const row of [
      { status: "archived", reviewStatus: "approved" },
      { status: "draft", reviewStatus: "needs_changes" },
      { status: "draft", reviewStatus: null, source: "manual" },
    ]) {
      expect(conflict(row), JSON.stringify(row)).toContain("مسودة رأي بانتظار المكتب أو لمقال مجدول");
    }
  });
});

describe("botDeskOpinionImageSchema", () => {
  it("accepts {} and {force:boolean}; rejects anything else", () => {
    expect(botDeskOpinionImageSchema.safeParse({}).success).toBe(true);
    expect(botDeskOpinionImageSchema.safeParse({ force: true }).success).toBe(true);
    expect(botDeskOpinionImageSchema.safeParse({ force: "true" }).success).toBe(false);
    expect(botDeskOpinionImageSchema.safeParse({ scheduledAt: "x" }).success).toBe(false);
  });
});

describe("opinionImagePromptFor", () => {
  it("uses the same prompt builder as prepare: title + AI summary, falling back to excerpt/text", () => {
    const a = opinionImagePromptFor({ title: "العنوان", aiSummary: "الملخص الذكي", excerpt: "مقتطف", content: "<p>نص</p>" });
    expect(a).toContain("العنوان");
    expect(a).toContain("الملخص الذكي");
    expect(a).not.toContain("مقتطف");
    const b = opinionImagePromptFor({ title: "العنوان", aiSummary: null, excerpt: null, content: "<p>بداية النص</p>" });
    expect(b).toContain("بداية النص");
  });
});

describe("generateOpinionImage — busy wait", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
    mocks.runEditorialImageJob.mockResolvedValue(undefined);
    mocks.getEditorialImageJob.mockResolvedValue({ status: "completed", imageUrl: "https://cdn.example/new.webp" });
  });

  it("default (prepare): fails immediately when another image is processing — unchanged behaviour", async () => {
    mocks.createEditorialImageJob.mockRejectedValueOnce(new EditorialImageError(409, "already_processing", "لديك صورة قيد التوليد."));
    await expect(generateOpinionImage("p", "u1")).rejects.toThrow("قيد التوليد");
    expect(mocks.createEditorialImageJob).toHaveBeenCalledTimes(1);
  });

  it("with waitForBusyMs: waits for the other image, then generates once", async () => {
    const busy = new EditorialImageError(409, "already_processing", "لديك صورة قيد التوليد.");
    mocks.createEditorialImageJob.mockRejectedValueOnce(busy).mockRejectedValueOnce(busy).mockResolvedValueOnce({ created: true });
    const onWait = vi.fn(async () => undefined);
    const url = await generateOpinionImage("p", "u1", { waitForBusyMs: 1_000, busyPollMs: 1, onWait });
    expect(url).toBe("https://cdn.example/new.webp");
    expect(mocks.createEditorialImageJob).toHaveBeenCalledTimes(3);
    expect(mocks.runEditorialImageJob).toHaveBeenCalledTimes(1);
    expect(onWait).toHaveBeenCalledTimes(2);
  });

  it("other errors are not retried", async () => {
    mocks.createEditorialImageJob.mockRejectedValueOnce(new EditorialImageError(503, "not_configured", "غير مفعّلة"));
    await expect(generateOpinionImage("p", "u1", { waitForBusyMs: 1_000, busyPollMs: 1 })).rejects.toThrow("غير مفعّلة");
    expect(mocks.createEditorialImageJob).toHaveBeenCalledTimes(1);
  });
});
