import { describe, expect, it } from "vitest";
import {
  bannedWordMessage,
  cleanBannedWordInput,
  findBannedWords,
  locateBannedWord,
  newlyIntroducedBannedWords,
  normalizeBannedText,
} from "../../shared/publishBannedWords";

const WORDS = [{ id: "w1", word: "نحو الرؤية" }];

describe("الكلمات المحظورة من النشر", () => {
  it("تلتقط العبارة في العنوان والنص وتعدّ مرات ورودها", () => {
    const matches = findBannedWords(WORDS, {
      title: "«نحو الرؤية» تطلق برنامجًا تدريبيًا",
      content: "<p>أعلنت شركة <strong>نحو الرؤية</strong> اليوم.</p><p>وأوضحت نحو&nbsp;الرؤية أن التسجيل متاح.</p>",
    });
    expect(matches).toEqual([
      { id: "w1", word: "نحو الرؤية", fields: [{ field: "title", count: 1 }, { field: "content", count: 2 }] },
    ]);
  });

  it("لا يتجاوزها التشكيل ولا التطويل ولا اختلاف الهمزة والتاء المربوطة", () => {
    for (const variant of ["نَحْوَ الرُّؤْيَة", "نحــو الرؤيــة", "نحو الروية", "نحو الرؤيه", "نحو   الرؤية"]) {
      expect(findBannedWords(WORDS, { title: `شركة ${variant} توقّع اتفاقية` })).toHaveLength(1);
    }
  });

  it("المطابقة للعبارة كاملة لا لجزء من كلمة", () => {
    expect(findBannedWords(WORDS, { title: "المملكة تمضي نحو رؤية 2030" })).toEqual([]);
    expect(findBannedWords(WORDS, { title: "خطوات نحو الرؤيتين" })).toEqual([]);
    expect(findBannedWords([{ id: "x", word: "خصم" }], { title: "خصومات الموسم" })).toEqual([]);
  });

  it("تفحص الوسوم في keywords وفي seo.keywords", () => {
    expect(findBannedWords(WORDS, { title: "خبر", keywords: ["اقتصاد", "نحو الرؤية"] })[0].fields).toEqual([
      { field: "keywords", count: 1 },
    ]);
    expect(findBannedWords(WORDS, { title: "خبر", seo: { keywords: ["نحو الرؤية"] } })).toHaveLength(1);
  });

  it("وسم HTML لا يخفي العبارة ولا يلصق كلمتين متجاورتين", () => {
    expect(findBannedWords(WORDS, { content: "<p>نحو</p><p>الرؤية</p>" })).toHaveLength(1);
    expect(findBannedWords(WORDS, { content: "ن<b>حو الرؤ</b>ية" })).toHaveLength(1);
  });

  it("تعديل مادة منشورة: يُمنع ما أُدخل الآن فقط", () => {
    const before = { title: "شركة نحو الرؤية تعلن", content: "نص قديم" };
    expect(newlyIntroducedBannedWords(WORDS, before, { ...before, content: "نص مصحح" })).toEqual([]);
    expect(
      newlyIntroducedBannedWords(WORDS, { title: "خبر", content: "نص" }, { title: "خبر", content: "عن نحو الرؤية" }),
    ).toHaveLength(1);
  });

  it("رسالة المنع تذكر الكلمة ومواضعها", () => {
    const message = bannedWordMessage(
      findBannedWords(WORDS, { title: "نحو الرؤية", content: "نحو الرؤية ثم نحو الرؤية" }),
    );
    expect(message).toContain("«نحو الرؤية»");
    expect(message).toContain("العنوان");
    expect(message).toContain("النص (مرتان)");
  });

  it("ينظّف مدخل المدير ويرفض القصير والفارغ", () => {
    expect(cleanBannedWordInput("  «نحو   الرؤية»  ")).toBe("نحو الرؤية");
    expect(cleanBannedWordInput("ا")).toBeNull();
    expect(cleanBannedWordInput("!!!")).toBeNull();
    expect(cleanBannedWordInput(12)).toBeNull();
    expect(normalizeBannedText("أَحْمَد")).toBe("احمد");
  });

  it("يحدد موضع العبارة في النص الخام مع التطويل والتشكيل", () => {
    const text = "وأوضحت نحو الرؤيـة أن التسجيل متاح، ثم نَحْوَ الرؤية.";
    const ranges = locateBannedWord(text, "نحو الرؤية");
    expect(ranges.map(([from, to]) => text.slice(from, to))).toEqual(["نحو الرؤيـة", "نَحْوَ الرؤية"]);
    expect(locateBannedWord("نحو رؤية 2030", "نحو الرؤية")).toEqual([]);
  });
});
