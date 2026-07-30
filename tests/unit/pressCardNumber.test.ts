// النظام المركزي لأرقام البطاقات الصحفية — ثبات الرقم وصيغته.
//
// الوعد المُختبر: الرقم يُصدر مرة واحدة ويبقى ثابتاً للصحفي كرقم الهوية،
// فلا يُستبدل بقيمة أخرى ولا يُفرَّغ عند إطفاء تفعيل البطاقة.

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

describe("pressCardNumberService", () => {
  beforeEach(() => {
    vi.resetModules();
    // الخدمة تستورد ../db عند التحميل — لا حاجة لقاعدة فعلية للدوال النقية
    vi.doMock("../../server/db", () => ({ db: {}, pool: {} }));
  });

  afterEach(() => {
    vi.doUnmock("../../server/db");
  });

  it("formats the sequence as SBQ-PR-#### and widens past 9999", async () => {
    const { formatPressIdNumber } = await import("../../server/services/pressCardNumberService");
    expect(formatPressIdNumber(1)).toBe("SBQ-PR-0001");
    expect(formatPressIdNumber(42)).toBe("SBQ-PR-0042");
    expect(formatPressIdNumber(12345)).toBe("SBQ-PR-12345");
  });

  it("accepts a first-time number when the journalist has none", async () => {
    const { evaluatePressIdNumberChange } = await import("../../server/services/pressCardNumberService");
    expect(evaluatePressIdNumberChange(null, "SBQ-PR-0007")).toEqual({ ok: true, value: "SBQ-PR-0007" });
    expect(evaluatePressIdNumberChange("", "  SBQ-2026-0001  ")).toEqual({ ok: true, value: "SBQ-2026-0001" });
  });

  it("rejects replacing an issued number", async () => {
    const { evaluatePressIdNumberChange } = await import("../../server/services/pressCardNumberService");
    const result = evaluatePressIdNumberChange("SBQ-PR-0042", "SBQ-PR-0043");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("SBQ-PR-0042");
  });

  it("ignores an identical resubmission — the save form always echoes the field", async () => {
    const { evaluatePressIdNumberChange } = await import("../../server/services/pressCardNumberService");
    expect(evaluatePressIdNumberChange("SBQ-PR-0042", "SBQ-PR-0042")).toEqual({ ok: true, value: undefined });
    expect(evaluatePressIdNumberChange("SBQ-PR-0042", " SBQ-PR-0042 ")).toEqual({ ok: true, value: undefined });
  });

  it("never clears an issued number — disabling the card must not wipe it", async () => {
    const { evaluatePressIdNumberChange } = await import("../../server/services/pressCardNumberService");
    expect(evaluatePressIdNumberChange("SBQ-PR-0042", "")).toEqual({ ok: true, value: undefined });
    expect(evaluatePressIdNumberChange("SBQ-PR-0042", null)).toEqual({ ok: true, value: undefined });
  });

  it("writes nothing when the field is absent from the payload", async () => {
    const { evaluatePressIdNumberChange } = await import("../../server/services/pressCardNumberService");
    expect(evaluatePressIdNumberChange("SBQ-PR-0042", undefined)).toEqual({ ok: true, value: undefined });
    expect(evaluatePressIdNumberChange(null, undefined)).toEqual({ ok: true, value: undefined });
  });
});
