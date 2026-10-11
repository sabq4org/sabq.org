import { describe, expect, it } from "vitest";
import { parseGuideContent } from "../../client/src/lib/publisherGuideContent";

describe("parseGuideContent", () => {
  it("turns the images section into lead, do/don't lists and a tip", () => {
    const content = [
      "الصورة ليست زينة — هي جزء من المسؤولية التحريرية والقانونية.",
      "",
      "قبل رفع أي صورة أو فيديو تأكد من:",
      "• امتلاك حق الاستخدام أو ترخيص واضح.",
      "• كتابة وصف للصورة.",
      "",
      "لا تستخدم:",
      "• صوراً من محركات البحث.",
      "• شعارات وعلامات تجارية.",
      "",
      "عند الشك: اختر صورة بديلة مرخّصة.",
    ].join("\n");
    const blocks = parseGuideContent(content);
    expect(blocks.map((b) => b.kind)).toEqual(["lead", "list", "list", "tip"]);
    expect(blocks[1]).toMatchObject({ tone: "do", heading: "قبل رفع أي صورة أو فيديو تأكد من:", items: ["امتلاك حق الاستخدام أو ترخيص واضح.", "كتابة وصف للصورة."] });
    expect(blocks[2]).toMatchObject({ tone: "dont", items: ["صوراً من محركات البحث.", "شعارات وعلامات تجارية."] });
  });

  it("keeps plain paragraphs and headingless lists as they are", () => {
    const blocks = parseGuideContent("أهلًا بكم.\n\nفقرة ثانية.\n\n• نقطة\n• أخرى");
    expect(blocks).toEqual([
      { kind: "lead", text: "أهلًا بكم." },
      { kind: "para", text: "فقرة ثانية." },
      { kind: "list", heading: null, items: ["نقطة", "أخرى"], tone: "plain" },
    ]);
  });

  it("returns nothing for empty content", () => {
    expect(parseGuideContent("  \n\n ")).toEqual([]);
  });
});
