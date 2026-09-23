import { describe, expect, it } from "vitest";
import {
  creditedGoalCounts,
  isCreditedGoalEvent,
  reconcileMatchGoalEvents,
  type GoalEventLike,
} from "../../server/services/matchGoalEvents";

const homeId = 293;

function ev(over: Partial<GoalEventLike> & { type: string; label: string }): GoalEventLike {
  return { teamId: homeId, minute: 1, extra: null, ...over };
}

describe("isCreditedGoalEvent", () => {
  it("يقبل الهدف العادي ويرفض نص الإلغاء", () => {
    expect(isCreditedGoalEvent(ev({ type: "goal", label: "هدف" }))).toBe(true);
    expect(
      isCreditedGoalEvent(ev({ type: "goal", label: "إلغاء هدف بعد مراجعة الفار" })),
    ).toBe(false);
  });
});

describe("reconcileMatchGoalEvents", () => {
  it("يحذف هدف الدقيقة 1 بعد إلغاء الفار والنتيجة 0-0 (الفتح × الاتفاق)", () => {
    const events = [
      ev({ type: "goal", label: "هدف", minute: 1, teamId: homeId }),
      ev({
        type: "var",
        label: "إلغاء الهدف بعد مراجعة الفار",
        minute: 3,
        teamId: homeId,
      }),
    ];
    const out = reconcileMatchGoalEvents(events, { home: 0, away: 0 }, homeId);
    expect(out.some((e) => e.type === "goal")).toBe(false);
    expect(out.some((e) => e.type === "var")).toBe(true);
  });

  it("يحذف الهدف الزائد إن صُحّحت النتيجة بلا صف فار", () => {
    const events = [ev({ type: "goal", label: "هدف", minute: 1, teamId: homeId })];
    const out = reconcileMatchGoalEvents(events, { home: 0, away: 0 }, homeId);
    expect(out).toEqual([]);
  });

  it("يبقي الأهداف المطابقة للنتيجة", () => {
    const events = [
      ev({ type: "goal", label: "هدف", minute: 12, teamId: homeId }),
      ev({ type: "goal", label: "هدف", minute: 40, teamId: 999 }),
    ];
    const out = reconcileMatchGoalEvents(events, { home: 1, away: 1 }, homeId);
    expect(creditedGoalCounts(out, homeId)).toEqual({ home: 1, away: 1 });
    expect(out).toHaveLength(2);
  });

  it("يحذف الأحدث عند زيادة أهداف نفس الفريق عن النتيجة", () => {
    const events = [
      ev({ type: "goal", label: "هدف", minute: 10, teamId: homeId }),
      ev({ type: "goal", label: "هدف", minute: 70, teamId: homeId }),
    ];
    const out = reconcileMatchGoalEvents(events, { home: 1, away: 0 }, homeId);
    expect(out).toHaveLength(1);
    expect(out[0].minute).toBe(10);
  });

  // حادثة الخلود × التعاون (2026-08-22): المزود حذف الهدف الملغى بنفسه وأبقى
  // صف الفار كسياق — فأكل التوفيق القديم هدف الدقيقة 30 الصحيح.
  it("لا يحذف هدفًا صحيحًا عندما تطابق الأهدافُ النتيجة رغم وجود صف إلغاء", () => {
    const events = [
      ev({ type: "goal", label: "هدف", minute: 21, teamId: homeId }),
      ev({ type: "goal", label: "هدف", minute: 30, teamId: homeId }),
      ev({ type: "var", label: "احتساب ركلة جزاء بعد مراجعة الفار", minute: 38, teamId: homeId }),
      ev({ type: "missed-penalty", label: "ركلة جزاء ضائعة", minute: 40, teamId: homeId }),
      ev({ type: "var", label: "إلغاء الهدف بعد مراجعة الفار", minute: 40, teamId: homeId }),
    ];
    const out = reconcileMatchGoalEvents(events, { home: 2, away: 0 }, homeId);
    expect(out).toHaveLength(5);
    expect(creditedGoalCounts(out, homeId)).toEqual({ home: 2, away: 0 });
  });

  it("لا يحذف شيئًا بعد هدف ثالث حقيقي يعيد النتيجة فوق الإلغاء", () => {
    const events = [
      ev({ type: "goal", label: "هدف", minute: 21, teamId: homeId }),
      ev({ type: "goal", label: "هدف", minute: 30, teamId: homeId }),
      ev({ type: "var", label: "إلغاء الهدف بعد مراجعة الفار", minute: 40, teamId: homeId }),
      ev({ type: "goal", label: "هدف", minute: 45, extra: 3, teamId: homeId }),
    ];
    const out = reconcileMatchGoalEvents(events, { home: 3, away: 0 }, homeId);
    expect(creditedGoalCounts(out, homeId)).toEqual({ home: 3, away: 0 });
  });

  it("عند فائض فعلي يُحذف الهدف المقترن بالإلغاء لا الأقدم", () => {
    const events = [
      ev({ type: "goal", label: "هدف", minute: 21, teamId: homeId }),
      ev({ type: "goal", label: "هدف", minute: 30, teamId: homeId }),
      ev({ type: "goal", label: "هدف", minute: 40, teamId: homeId }),
      ev({ type: "var", label: "إلغاء الهدف بعد مراجعة الفار", minute: 40, teamId: homeId }),
    ];
    const out = reconcileMatchGoalEvents(events, { home: 2, away: 0 }, homeId);
    const goals = out.filter((e) => e.type === "goal").map((e) => e.minute);
    expect(goals).toEqual([21, 30]);
  });

  it("إلغاء لفريق لا يمسّ أهداف الفريق الآخر", () => {
    const events = [
      ev({ type: "goal", label: "هدف", minute: 10, teamId: 999 }),
      ev({ type: "var", label: "إلغاء الهدف بعد مراجعة الفار", minute: 40, teamId: homeId }),
    ];
    const out = reconcileMatchGoalEvents(events, { home: 0, away: 1 }, homeId);
    expect(creditedGoalCounts(out, homeId)).toEqual({ home: 0, away: 1 });
  });

  it("يحسب الهدف العكسي للفريق الآخر", () => {
    const events = [ev({ type: "goal", label: "هدف عكسي", minute: 20, teamId: homeId })];
    expect(creditedGoalCounts(events, homeId)).toEqual({ home: 0, away: 1 });
    const out = reconcileMatchGoalEvents(events, { home: 0, away: 0 }, homeId);
    expect(out).toEqual([]);
  });
});
