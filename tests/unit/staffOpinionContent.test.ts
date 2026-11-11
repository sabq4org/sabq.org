// تعديل نص/عنوان مقال الرأي من bot-desk: الحالات المسموحة وتطبيع النص.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import { botDeskOpinionEditSchema } from "@shared/botDesk";
import { assertOpinionEditable } from "../../server/services/staffOpinionContentService";
import { normalizeDraftContent } from "../../server/services/botDraftsService";
import { StaffOpinionDeskError } from "../../server/services/staffOpinionDeskService";

function conflict(row: { status: string; reviewStatus: string | null; source?: string | null }) {
  try {
    assertOpinionEditable(row);
    return null;
  } catch (err) {
    expect(err).toBeInstanceOf(StaffOpinionDeskError);
    expect((err as StaffOpinionDeskError).status).toBe(409);
    return (err as StaffOpinionDeskError).message;
  }
}

describe("assertOpinionEditable", () => {
  it("allows scheduled, pending-review drafts, approved (in prep) drafts and app drafts", () => {
    expect(conflict({ status: "scheduled", reviewStatus: "approved", source: "ios-app" })).toBeNull();
    expect(conflict({ status: "draft", reviewStatus: "pending_review" })).toBeNull();
    expect(conflict({ status: "draft", reviewStatus: "approved" })).toBeNull();
    expect(conflict({ status: "draft", reviewStatus: null, source: "android-app" })).toBeNull();
  });

  it("rejects published with a dashboard hint, and anything not awaiting the desk", () => {
    expect(conflict({ status: "published", reviewStatus: "approved" })).toContain("منشور");
    for (const row of [
      { status: "draft", reviewStatus: "needs_changes" },
      { status: "draft", reviewStatus: "rejected" },
      { status: "draft", reviewStatus: null, source: "manual" },
      { status: "archived", reviewStatus: "approved" },
      { status: "ready_to_publish", reviewStatus: null },
    ]) {
      expect(conflict(row), JSON.stringify(row)).toContain("مسودة رأي بانتظار المكتب أو لمقال مجدول");
    }
  });
});

describe("botDeskOpinionEditSchema + content normalization", () => {
  it("normalizes the title like the app's title edit", () => {
    const parsed = botDeskOpinionEditSchema.safeParse({ title: "  عنوان\n جديد   للمقال " });
    expect(parsed.success && parsed.data.title).toBe("عنوان جديد للمقال");
  });

  it("plain text becomes <p> paragraphs (same helper as Bot Drafts), HTML is sanitized", () => {
    expect(normalizeDraftContent("الفقرة الأولى\n\nالفقرة <الثانية>", "text")).toBe(
      "<p>الفقرة الأولى</p>\n<p>الفقرة &lt;الثانية&gt;</p>",
    );
    expect(normalizeDraftContent('<p><span style="color: rgb(0, 0, 0)">نص</span></p>')).toBe("<p>نص</p>");
  });
});
