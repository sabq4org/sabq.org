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

  it("يطابق المقارنة الزوجية الكاملة ولا يحجب الخيط عند 3000 قصة", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const vocab = Array.from({ length: 400 }, (_, i) => `كلمة${i}`);
    const stories = Array.from({ length: 3000 }, (_, i) => ({
      id: String(i),
      title: Array.from({ length: 4 + Math.floor(rand() * 8) }, () => vocab[Math.floor(rand() * vocab.length)]).join(" "),
      size: 1 + Math.floor(rand() * 5),
    }));
    // تكرارات مقصودة كي توجد مجموعات فعلية
    for (let i = 0; i < 300; i++) stories[i * 10 + 1].title = `${stories[i * 10].title} اليوم`;

    const started = Date.now();
    const plan = planStoryMerges(stories);
    expect(Date.now() - started).toBeLessThan(3000);

    const sample = stories.slice(0, 400);
    const parent = sample.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < sample.length; i++)
      for (let j = i + 1; j < sample.length; j++)
        if (sameEventTitles(sample[i].title, sample[j].title)) parent[find(j)] = find(i);
    const samplePlan = planStoryMerges(sample);
    for (let i = 0; i < sample.length; i++)
      for (let j = i + 1; j < sample.length; j++) {
        const together = (samplePlan.get(sample[i].id) ?? sample[i].id) === (samplePlan.get(sample[j].id) ?? sample[j].id);
        expect(together).toBe(find(i) === find(j));
      }
    expect(plan.size).toBeGreaterThanOrEqual(300);
  });
});
