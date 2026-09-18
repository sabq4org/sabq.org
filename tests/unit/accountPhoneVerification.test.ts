import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));

import { normalizePhone, phoneConflictKindFor } from "../../server/services/phoneAuth";

describe("phoneConflictKindFor — تصنيف صاحب الرقم المتعارض", () => {
  it("يعتبر إشارة RBAC منسوباً حتى لو كان users.role قارئاً", () => {
    expect(phoneConflictKindFor("reader", true)).toBe("staff");
  });

  it("يصنّف أدوار المنسوبين المعروفة", () => {
    expect(phoneConflictKindFor("reporter", false)).toBe("staff");
    expect(phoneConflictKindFor("opinion_author", false)).toBe("staff");
    expect(phoneConflictKindFor("editor", false)).toBe("staff");
  });

  it("يصنّف الأدوار القارئة (لن تُسحب تلقائياً)", () => {
    expect(phoneConflictKindFor("reader", false)).toBe("reader");
    expect(phoneConflictKindFor("user", false)).toBe("reader");
    expect(phoneConflictKindFor("subscriber", false)).toBe("reader");
    expect(phoneConflictKindFor(null, false)).toBe("reader");
  });

  it("يصنّف أي دور غير معروف unknown — بلا معالجة تلقائية", () => {
    expect(phoneConflictKindFor("some_future_role", false)).toBe("unknown");
  });
});

describe("توثيق الجوال — تطبيع كل الصيغ إلى E.164", () => {
  it("يقبل 05 و966 و+966 و00966", () => {
    for (const input of [
      "0501234567",
      "501234567",
      "966501234567",
      "+966 50 123 4567",
      "00966501234567",
    ]) {
      expect(normalizePhone(input)).toBe("+966501234567");
    }
  });

  it("يرفض غير الصالح", () => {
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

import { decideVerifiedPhoneClaim } from "../../server/services/phoneAuth";

describe("decideVerifiedPhoneClaim — سياسة المطالبة الموثّقة بالرقم (بعد OTP)", () => {
  it("لا حساب آخر → ربط مباشر", () => {
    expect(decideVerifiedPhoneClaim({ claimantIsStaff: true, other: null })).toEqual({ action: "link" });
    expect(decideVerifiedPhoneClaim({ claimantIsStaff: false, other: null })).toEqual({ action: "link" });
  });

  it("الرقم على منسوب آخر → رفض للإدارة، أيًّا كان المُطالِب", () => {
    for (const claimantIsStaff of [true, false]) {
      expect(
        decideVerifiedPhoneClaim({ claimantIsStaff, other: { kind: "staff", email: "x@sabq.org" } }),
      ).toEqual({ action: "reject", code: "phone_taken_staff" });
    }
  });

  it("منسوب يطالب برقم على قارئ بلا بريد حقيقي (قشرة دخول بالجوال) → نقل وتقاعد القشرة", () => {
    expect(
      decideVerifiedPhoneClaim({ claimantIsStaff: true, other: { kind: "reader", email: null } }),
    ).toEqual({ action: "transfer", retireOther: true });
    expect(
      decideVerifiedPhoneClaim({
        claimantIsStaff: true,
        other: { kind: "reader", email: "p966501234567@phone.sabq.org" },
      }),
    ).toEqual({ action: "transfer", retireOther: true });
  });

  it("منسوب يطالب برقم على قارئ له بريد حقيقي → نقل الرقم فقط والعضوية تبقى", () => {
    expect(
      decideVerifiedPhoneClaim({ claimantIsStaff: true, other: { kind: "reader", email: "reader@gmail.com" } }),
    ).toEqual({ action: "transfer", retireOther: false });
  });

  it("قارئ يطالب برقم على قارئ آخر → رفض إلى الدعم (لا سحب بين القرّاء)", () => {
    expect(
      decideVerifiedPhoneClaim({ claimantIsStaff: false, other: { kind: "reader", email: null } }),
    ).toEqual({ action: "reject", code: "phone_taken_reader" });
  });

  it("دور غير معروف → رفض بلا معالجة تلقائية", () => {
    expect(
      decideVerifiedPhoneClaim({ claimantIsStaff: true, other: { kind: "unknown", email: null } }),
    ).toEqual({ action: "reject", code: "phone_taken_unknown" });
  });
});
