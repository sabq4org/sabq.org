import { describe, expect, it } from "vitest";
import {
  SLOT_CHANGE_TERMS,
  SLOT_CHANGE_TIMES,
  formatSlotTimeAr,
  isRoundOpen,
  slotChangeTargetError,
} from "@shared/opinionSlotChange";
import { OPINION_WRITERS_PER_DAY_CAP } from "@shared/opinionWriterConstants";

const now = Date.UTC(2026, 10, 24, 9, 0);
const loads = [5, 20, 3, 0, 20, 1, 0];

describe("فرصة تغيير الموعد الأسبوعي", () => {
  it("الحد اليومي 20 مقالة", () => {
    expect(OPINION_WRITERS_PER_DAY_CAP).toBe(20);
  });

  it("الإيضاحات تذكر المرة الواحدة وعدم التراجع وحق الإدارة والحد اليومي", () => {
    const all = SLOT_CHANGE_TERMS.join(" ");
    expect(all).toMatch(/مرة واحدة/);
    expect(all).toMatch(/التراجع/);
    expect(all).toMatch(/إدارة التحرير تعديل/);
    expect(all).toMatch(/20/);
  });

  it("الجولة: مفتوحة حتى تُغلق أو تنتهي مدتها", () => {
    expect(isRoundOpen(null, now)).toBe(false);
    expect(isRoundOpen({ closesAt: null, closedAt: null }, now)).toBe(true);
    expect(isRoundOpen({ closesAt: new Date(now + 1000), closedAt: null }, now)).toBe(true);
    expect(isRoundOpen({ closesAt: new Date(now - 1000), closedAt: null }, now)).toBe(false);
    expect(isRoundOpen({ closesAt: null, closedAt: new Date(now - 1) }, now)).toBe(false);
  });

  it("يرفض اليوم المكتمل، ويقبل تغيير الوقت داخل اليوم المكتمل نفسه", () => {
    const base = { fromWeekday: 0, fromTime: "06:00", dayLoads: loads };
    expect(slotChangeTargetError({ ...base, toWeekday: 4, toTime: "08:00" })).toMatch(/الخميس مكتمل/);
    expect(slotChangeTargetError({ ...base, toWeekday: 3, toTime: "08:00" })).toBeNull();
    expect(slotChangeTargetError({ ...base, fromWeekday: 1, toWeekday: 1, toTime: "20:30" })).toBeNull();
  });

  it("يرفض الموعد نفسه والوقت خارج القائمة", () => {
    const base = { fromWeekday: 2, fromTime: "06:00", dayLoads: loads };
    expect(slotChangeTargetError({ ...base, toWeekday: 2, toTime: "06:00" })).toMatch(/الحالي/);
    expect(slotChangeTargetError({ ...base, toWeekday: 3, toTime: "06:15" })).toMatch(/القائمة/);
    expect(slotChangeTargetError({ ...base, toWeekday: 9, toTime: "06:00" })).toMatch(/يومًا/);
  });

  it("الأوقات كل نصف ساعة وتظهر بصيغة 12 ساعة", () => {
    expect(SLOT_CHANGE_TIMES[0]).toBe("05:00");
    expect(SLOT_CHANGE_TIMES.at(-1)).toBe("23:30");
    expect(formatSlotTimeAr("06:30")).toBe("6:30 ص");
    expect(formatSlotTimeAr("20:00")).toBe("8:00 م");
    expect(formatSlotTimeAr("12:00")).toBe("12:00 م");
  });
});
