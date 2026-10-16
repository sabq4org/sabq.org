// حارس الهبوط scheduled/published→draft — قواعد حادثة 2026-08-08.
//
// زر «حفظ كمسودة» كان يرسل status:"draft" حرفيًا على مادة مجدولة فتموت جدولتها
// بصمت (كرون النشر يستعلم عن status='scheduled' فقط). القاعدة: الحفظ الاعتيادي
// يُبقي الحالة، والإنزال الصريح يتطلب confirmStatusDowngrade + صلاحية نشر.
// نفس الملف يغطي حالة «إرسال للمراجعة» وأعلام التحرير من الصلاحيات الفعلية.

import { describe, expect, it } from "vitest";
import {
  decideStatusDemotion,
  keepScheduledDate,
  resolveArticleEditFlags,
  statusAfterSubmitForReview,
  submitForReviewScheduleFields,
} from "../../server/services/publishGateRules";

function demote(over: Partial<Parameters<typeof decideStatusDemotion>[0]> = {}) {
  return decideStatusDemotion({
    requestedStatus: "draft",
    currentStatus: "scheduled",
    confirmed: false,
    permissions: [],
    articleType: "news",
    ...over,
  });
}

describe("decideStatusDemotion", () => {
  it("يتجاهل الهبوط الضمني لمادة مجدولة (سيناريو الحادثة)", () => {
    expect(demote()).toEqual({ action: "ignore" });
  });

  it("يتجاهل الهبوط الضمني لمادة منشورة", () => {
    expect(demote({ currentStatus: "published" })).toEqual({ action: "ignore" });
  });

  it("يمرّر حفظ مسودة على مسودة (لا هبوط أصلًا)", () => {
    expect(demote({ currentStatus: "draft" })).toEqual({ action: "pass" });
  });

  it("يمرّر عندما لا تكون الحالة المطلوبة draft", () => {
    expect(demote({ requestedStatus: "scheduled" })).toEqual({ action: "pass" });
    expect(demote({ requestedStatus: undefined })).toEqual({ action: "pass" });
  });

  it("المؤرشف ليس حالة حية — الهبوط منه يمرّ", () => {
    expect(demote({ currentStatus: "archived" })).toEqual({ action: "pass" });
  });

  it("الإنزال الصريح بلا صلاحية نشر يُرفض برمز واضح", () => {
    const d = demote({ confirmed: true, permissions: ["articles.edit_own"] });
    expect(d.action).toBe("forbid");
    if (d.action === "forbid") {
      expect(d.httpStatus).toBe(403);
      expect(d.code).toBe("STATUS_DOWNGRADE_FORBIDDEN");
    }
  });

  it.each([
    ["articles.publish"],
    ["articles.unpublish"],
    ["system.admin"],
    ["*"],
  ])("الإنزال الصريح يمرّ بصلاحية %s", (perm) => {
    expect(demote({ confirmed: true, permissions: [perm] })).toEqual({ action: "pass" });
  });

  it("opinion.edit_any تخوّل الإنزال الصريح لمواد الرأي فقط", () => {
    const perms = ["opinion.edit_any"];
    expect(
      demote({ confirmed: true, permissions: perms, articleType: "opinion" }),
    ).toEqual({ action: "pass" });
    expect(
      demote({ confirmed: true, permissions: perms, articleType: "news" }).action,
    ).toBe("forbid");
  });
});

describe("statusAfterSubmitForReview", () => {
  it("المادة الحية تبقى على حالتها — الإرسال للمراجعة لا يقتل الجدولة", () => {
    expect(statusAfterSubmitForReview("scheduled")).toBe("scheduled");
    expect(statusAfterSubmitForReview("published")).toBe("published");
  });

  it("غير الحية تعود مسودة كما كان", () => {
    expect(statusAfterSubmitForReview("draft")).toBe("draft");
    expect(statusAfterSubmitForReview("archived")).toBe("draft");
  });
});

describe("submitForReviewScheduleFields", () => {
  it("المجدولة تبقى مجدولة بموعدها — لا حالة scheduled بلا موعد", () => {
    expect(submitForReviewScheduleFields("scheduled")).toEqual({ status: "scheduled" });
  });
  it("غيرها يعود فوريّاً بلا موعد كما كان", () => {
    expect(submitForReviewScheduleFields("draft")).toEqual({ status: "draft", publishType: "instant", scheduledAt: null });
    expect(submitForReviewScheduleFields("published")).toEqual({ status: "published", publishType: "instant", scheduledAt: null });
  });
});

describe("keepScheduledDate", () => {
  const scheduled = { status: "scheduled", scheduledAt: new Date("2026-10-16T11:30:00Z") };
  it("حفظ يرسل scheduledAt: null لمادة مجدولة يُبقي موعدها", () => {
    const update: Record<string, unknown> = { title: "x", status: "scheduled", publishType: "instant", scheduledAt: null };
    expect(keepScheduledDate(update, scheduled)).toEqual({ ok: true });
    expect(update).toEqual({ title: "x", status: "scheduled" });
  });
  it("الحفظ بلا حالة (كاتب الرأي يرسل null دائماً) يُبقي الموعد أيضاً", () => {
    const update: Record<string, unknown> = { scheduledAt: null };
    expect(keepScheduledDate(update, scheduled)).toEqual({ ok: true });
    expect("scheduledAt" in update).toBe(false);
  });
  it("موعد جديد يمر، والهبوط إلى مسودة يمسح الموعد", () => {
    const moved: Record<string, unknown> = { scheduledAt: new Date("2026-10-23T11:30:00Z") };
    expect(keepScheduledDate(moved, scheduled)).toEqual({ ok: true });
    expect(moved.scheduledAt).toBeInstanceOf(Date);
    const demoted: Record<string, unknown> = { status: "draft", scheduledAt: null };
    expect(keepScheduledDate(demoted, scheduled)).toEqual({ ok: true });
    expect(demoted.scheduledAt).toBeNull();
  });
  it("جدولة بلا أي موعد تُرفض", () => {
    expect(keepScheduledDate({ status: "scheduled", scheduledAt: null }, { status: "draft", scheduledAt: null }).ok).toBe(false);
  });
});

describe("resolveArticleEditFlags", () => {
  it("المراسل (edit_own من خريطة الأدوار): يحرر مواده فقط", () => {
    const f = resolveArticleEditFlags(["articles.view", "articles.edit_own"], "news");
    expect(f).toEqual({ hasAllPerms: false, canEditOwn: true, canEditAny: false });
  });

  it("المحرر (edit_any): يحرر أي مادة", () => {
    const f = resolveArticleEditFlags(["articles.edit_any"], "news");
    expect(f.canEditAny).toBe(true);
  });

  it('الحساب الإداري ("*") يملك كل الأعلام', () => {
    const f = resolveArticleEditFlags(["*"], "news");
    expect(f.hasAllPerms).toBe(true);
    expect(f.canEditAny).toBe(true);
  });

  it("أكواد opinion.* تكافئ نظيراتها على مواد الرأي فقط", () => {
    expect(resolveArticleEditFlags(["opinion.edit_own"], "opinion").canEditOwn).toBe(true);
    expect(resolveArticleEditFlags(["opinion.edit_own"], "news").canEditOwn).toBe(false);
    expect(resolveArticleEditFlags(["opinion.edit_any"], "opinion").canEditAny).toBe(true);
    expect(resolveArticleEditFlags(["opinion.edit_any"], "news").canEditAny).toBe(false);
  });
});
