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
