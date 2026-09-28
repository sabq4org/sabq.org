import { describe, expect, it } from "vitest";
import { planStoryMerges, sameEventTitles } from "../../server/services/radar/storyMerge";

describe("توحيد القصص المتفرقة", () => {
  it("عنوانان عربيان لنفس الحدث يُعدّان قصة واحدة", () => {
    expect(
      sameEventTitles(
        "السعودية تستأنف تصدير النفط عبر خط أنابيب الشرق والغرب",
        "السعودية تستأنف تصدير النفط عبر خط أنابيب الشرق الغرب بعد توقف"
      )
    ).toBe(true);
  });

  it("عناوين قصيرة أو اشتراك قليل لا تُدمج (الدمج الخاطئ أسوأ من التكرار)", () => {
    expect(sameEventTitles("أمطار الرياض", "أمطار الرياض")).toBe(false);
    expect(
      sameEventTitles(
        "السعودية تستأنف تصدير النفط عبر خط أنابيب الشرق والغرب",
        "السعودية تستأنف نقل النفط عبر طريق بديل لمضيق هرمز"
      )
    ).toBe(false);
    expect(
      sameEventTitles("ولي العهد يستقبل رئيس وزراء اليابان في جدة", "ولي العهد يستقبل رئيس فرنسا في الرياض")
    ).toBe(false);
  });

  it("السلاسل تتوحد والقصة الأكبر هي الباقية", () => {
    const plan = planStoryMerges([
      { id: "a", title: "الرياض تعلن التعليم عن بعد في المدارس غدا بسبب الأمطار", size: 2 },
      { id: "b", title: "تعليم الرياض يعلن التعليم عن بعد في المدارس غدا بسبب الأمطار", size: 5 },
      { id: "c", title: "تعليم الرياض يعلن التعليم عن بعد في المدارس غدا", size: 1 },
      { id: "d", title: "أرامكو تعلن نتائج الربع الثالث وارتفاع الأرباح", size: 3 },
    ]);
    expect(plan.get("a")).toBe("b");
    expect(plan.get("c")).toBe("b");
    expect(plan.has("b")).toBe(false);
    expect(plan.has("d")).toBe(false);
  });
});
