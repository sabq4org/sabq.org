import { describe, expect, it } from "vitest";
import { normalizeArabicForCompare, stripOpinionHeaderLines } from "../../server/services/opinionPrepareText";

const BODY =
  "<p>في كل نقاش عام يبرز سؤال أول يحدد ما بعده، ومن يملك الإجابة عنه يملك توجيه الحوار كله، وهذا ما نحاول تفكيكه هنا بهدوء.</p><p>فقرة ثانية.</p>";

describe("stripOpinionHeaderLines", () => {
  it("removes «جاهز للنشر:» + title + subtitle + writer (الحارثي)", () => {
    const html =
      "<p>جاهز للنشر:</p><p><strong>من يكفل السؤال الأول؟</strong></p><p>قراءة في مسؤولية البدايات</p><p>عبدالمحسن الحارثي</p><p>&nbsp;</p>" + BODY;
    const r = stripOpinionHeaderLines(html, { title: "من يكفل السؤال الأوّل؟", writerName: "عبدالمحسن الحارثي" });
    expect(r.headerLinesRemoved).toBe(4);
    expect(r.html).toBe(BODY);
  });

  it("removes a repeated title at the top (تركي المالكي)", () => {
    const html = "<p>تركي المالكي.. مسؤولية الكلمة وهيبة الموقف</p><p><br></p>" + BODY;
    const r = stripOpinionHeaderLines(html, { title: " تركي المالكي.. مسؤولية الكلمة وهيبة الموقف", writerName: "ماجد البريكان" });
    expect(r.headerLinesRemoved).toBe(1);
    expect(r.html).toBe(BODY);
  });

  it("removes the bold title/subtitle line with hamza variant (هلال الهلالي)", () => {
    const html = "<p><strong>معالي وزير الموارد.. كلمة راس </strong></p><p>في مشهد ساخر متخيّل من اجتماع إداري لبحث «التوطين»، يدور هذا الحديث:</p>" + BODY;
    const r = stripOpinionHeaderLines(html, { title: "معالي وزير الموارد.. كلمة رأس ..", writerName: "هلال الهلالي" });
    expect(r.headerLinesRemoved).toBe(1);
    expect(r.html.startsWith("<p>في مشهد ساخر")).toBe(true);
  });

  it("handles «جاهز للنشر: <title>» on one line and &nbsp; entities", () => {
    const html = "<p>جاهز للنشر:&nbsp;من يكفل السؤال الأول</p>" + BODY;
    const r = stripOpinionHeaderLines(html, { title: "من يكفل السؤال الأوّل؟" });
    expect(r.headerLinesRemoved).toBe(1);
    expect(r.html).toBe(BODY);
  });

  it("never removes a long real first paragraph", () => {
    const r = stripOpinionHeaderLines(BODY, { title: "عنوان آخر", writerName: "فلان" });
    expect(r).toEqual({ html: BODY, headerLinesRemoved: 0 });
  });

  it("does not remove a short opening sentence that ends with punctuation", () => {
    const html = "<p>لم يكن الأمر سهلاً.</p>" + BODY;
    expect(stripOpinionHeaderLines(html, { title: "عنوان" }).headerLinesRemoved).toBe(0);
  });

  it("keeps everything if nothing real would remain", () => {
    const html = "<p>جاهز للنشر:</p><p>نص قصير</p>";
    expect(stripOpinionHeaderLines(html, { title: "س" }).headerLinesRemoved).toBe(0);
  });

  it("normalizes hamza, taa marbuta, alef maqsura", () => {
    expect(normalizeArabicForCompare("الأوّلى مسؤولية")).toBe(normalizeArabicForCompare("الاولي مسوولية"));
    expect(normalizeArabicForCompare("كلمة رأس..")).toBe(normalizeArabicForCompare("كلمه راس"));
  });
});
