import { describe, expect, it } from "vitest";
import { toBinaryPlayerName } from "../../shared/sportsNames";

describe("toBinaryPlayerName — تحويل أسماء اللاعبين للصيغة الثنائية", () => {
  it("يبقي الأسماء المفردة كما هي", () => {
    expect(toBinaryPlayerName("كارلوس")).toBe("كارلوس");
    expect(toBinaryPlayerName("فابينيو")).toBe("فابينيو");
    expect(toBinaryPlayerName("بينتو")).toBe("بينتو");
  });

  it("يبقي الأسماء الثنائية كما هي", () => {
    expect(toBinaryPlayerName("سعد القحطاني")).toBe("سعد القحطاني");
    expect(toBinaryPlayerName("يانيك كاراسكو")).toBe("يانيك كاراسكو");
    expect(toBinaryPlayerName("حسين السبياني")).toBe("حسين السبياني");
    expect(toBinaryPlayerName("همام الهمامي")).toBe("همام الهمامي");
    expect(toBinaryPlayerName("ياسر الموسى")).toBe("ياسر الموسى");
    expect(toBinaryPlayerName("رافع المقعدي")).toBe("رافع المقعدي");
    expect(toBinaryPlayerName("محمد الشويرخ")).toBe("محمد الشويرخ");
    expect(toBinaryPlayerName("سالم الدوسري")).toBe("سالم الدوسري");
    expect(toBinaryPlayerName("كريستيانو رونالدو")).toBe("كريستيانو رونالدو");
  });

  it("يختصر سلاسل الأنساب والأسماء الرباعية والخماسية إلى ثنائية", () => {
    expect(toBinaryPlayerName("فهد بن عبدالعزيز بن تركي معاذ الطالب")).toBe("فهد الطالب");
    expect(toBinaryPlayerName("سيف محمد بن فرحان العامري")).toBe("سيف العامري");
    expect(toBinaryPlayerName("عوض حيدر عامر النشري")).toBe("عوض النشري");
    expect(toBinaryPlayerName("عادل محمد عبدالله الخضري")).toBe("عادل الخضري");
    expect(toBinaryPlayerName("عصام بن سعيد بن مبارك الشهراني")).toBe("عصام الشهراني");
  });

  it("يتعامل مع الاسم الأول المركب «عبد الله / عبد العزيز / عبد الرحمن»", () => {
    expect(toBinaryPlayerName("عبد الله مطوق أحمد سعيد")).toBe("عبد الله سعيد");
    expect(toBinaryPlayerName("عبدالله مطوق أحمد سعيد")).toBe("عبدالله سعيد");
    expect(toBinaryPlayerName("عبد العزيز بن تركي")).toBe("عبد العزيز بن تركي");
    expect(toBinaryPlayerName("عبد الرحمن بن مساعد آل سعود")).toBe("عبد الرحمن آل سعود");
  });

  it("يتعامل مع الأسماء الثلاثية العادية", () => {
    expect(toBinaryPlayerName("مراد محمد خضري")).toBe("مراد خضري");
    expect(toBinaryPlayerName("داني سيباز المروي")).toBe("داني المروي");
  });

  it("يتعامل مع الأسماء المركبة بـ الدين و أبو و آل و بن", () => {
    expect(toBinaryPlayerName("سيف الدين مصطفى الجزيري")).toBe("سيف الدين الجزيري");
    expect(toBinaryPlayerName("أبو بكر كامارا")).toBe("أبو بكر كامارا");
    expect(toBinaryPlayerName("محمد بن سلمان")).toBe("محمد بن سلمان");
    expect(toBinaryPlayerName("سلطان بن عبدالعزيز آل الشيخ")).toBe("سلطان آل الشيخ");
    expect(toBinaryPlayerName("كيفين دي بروين")).toBe("كيفين دي بروين");
  });

  it("يتعامل مع الأسماء المضمنة بين قوسين (التبديلات المجمعة)", () => {
    expect(
      toBinaryPlayerName("عبدالله مطوق أحمد سعيد (عوض حيدر عامر النشري)"),
    ).toBe("عبدالله سعيد (عوض النشري)");
    expect(
      toBinaryPlayerName("رافع المقعدي (فهد بن عبدالعزيز بن تركي معاذ الطالب)"),
    ).toBe("رافع المقعدي (فهد الطالب)");
  });

  it("يصلح التفكك الشائع في بعض الأسماء المعربة", () => {
    expect(toBinaryPlayerName("محمد الشويرخ (يار ستوجانو فيتش)")).toBe(
      "محمد الشويرخ (يار ستوجانوفيتش)",
    );
  });
});
