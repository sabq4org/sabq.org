import { describe, expect, it } from "vitest";
import {
  applyTextFixesToHtml,
  buildOpinionImagePrompt,
  parseOpinionEnrichment,
} from "../../server/services/opinionPrepareText";

describe("applyTextFixesToHtml", () => {
  it("fixes visible text everywhere it appears as a whole word", () => {
    const out = applyTextFixesToHtml("<p>ذهب الى السوق</p><p>الى البيت</p>", [{ original: "الى", suggestion: "إلى" }]);
    expect(out.html).toBe("<p>ذهب إلى السوق</p><p>إلى البيت</p>");
    expect(out.applied).toBe(1);
  });

  it("never touches tags, attributes, links or scripts", () => {
    const html = '<p><a href="/tag/الى" title="الى">رابط</a> الى</p><script>var x="الى"</script><style>.الى{}</style>';
    const out = applyTextFixesToHtml(html, [{ original: "الى", suggestion: "إلى" }]);
    expect(out.html).toBe('<p><a href="/tag/الى" title="الى">رابط</a> إلى</p><script>var x="الى"</script><style>.الى{}</style>');
  });

  it("respects word boundaries, including across inline tags", () => {
    const out = applyTextFixesToHtml("<p>والى <b>ال</b>الى الى<i>ها</i></p>", [{ original: "الى", suggestion: "إلى" }]);
    expect(out.html).toBe("<p>والى <b>ال</b>الى الى<i>ها</i></p>");
    expect(out.applied).toBe(0);
  });

  it("treats block tags as boundaries", () => {
    const out = applyTextFixesToHtml("<p>نص</p><p>اعلنت الوزارة</p>", [{ original: "اعلنت", suggestion: "أعلنت" }]);
    expect(out.html).toBe("<p>نص</p><p>أعلنت الوزارة</p>");
  });

  it("splits glued words and matches across line breaks in the source", () => {
    const out = applyTextFixesToHtml("<p>مشروعتقني جديد\nفي المخاطر والالتزامات</p>", [
      { original: "مشروعتقني", suggestion: "مشروع تقني" },
      { original: "جديد في", suggestion: "جديد، في" },
    ]);
    expect(out.html).toBe("<p>مشروع تقني جديد، في المخاطر والالتزامات</p>");
    expect(out.applied).toBe(2);
  });

  it("escapes HTML in suggestions and skips no-op fixes", () => {
    const out = applyTextFixesToHtml("<p>a b</p>", [
      { original: "a", suggestion: "<x>&" },
      { original: "b", suggestion: "b" },
      { original: " ", suggestion: "c" },
    ]);
    expect(out.html).toBe("<p>&lt;x&gt;&amp; b</p>");
    expect(out.applied).toBe(1);
  });
});

describe("parseOpinionEnrichment", () => {
  it("parses fenced JSON, trims lists and caps lengths", () => {
    const raw = "```json\n" + JSON.stringify({
      summary: "  موجز   المقال ",
      bullets: ["أ", "ب", "ب", "ج", "د"],
      keywords: ["k1", "k2", "", 5],
      metaDescription: "و".repeat(300),
      imageBrief: "مشهد",
      categorySlug: " economy ",
    }) + "\n```";
    const out = parseOpinionEnrichment(raw);
    expect(out.summary).toBe("موجز المقال");
    expect(out.bullets).toEqual(["أ", "ب", "ج"]);
    expect(out.keywords).toEqual(["k1", "k2"]);
    expect(out.metaDescription?.length).toBe(170);
    expect(out.socialTitle).toBeNull();
    expect(out.imageBrief).toBe("مشهد");
    expect(out.categorySlug).toBe("economy");
  });

  it("finds the object inside prose and rejects a missing summary", () => {
    expect(parseOpinionEnrichment('إليك: {"summary":"س"} شكراً').summary).toBe("س");
    expect(() => parseOpinionEnrichment('{"bullets":[]}')).toThrow("enrichment_missing_summary");
    expect(() => parseOpinionEnrichment("لا شيء")).toThrow();
  });
});

describe("buildOpinionImagePrompt", () => {
  it("prefers the symbolic brief and always forbids text and real faces", () => {
    const withBrief = buildOpinionImagePrompt({ title: "ع", summary: "م", imageBrief: "ميزان" });
    expect(withBrief).toContain("ميزان");
    expect(withBrief).toContain("بلا أي نص مكتوب");
    const fallback = buildOpinionImagePrompt({ title: "عنوان", summary: "موجز", imageBrief: null });
    expect(fallback).toContain("صورة توضيحية لمقال رأي: عنوان\nموجز");
  });
});
