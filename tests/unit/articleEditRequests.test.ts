import { describe, expect, it } from "vitest";
import {
  applyContentEdits,
  buildEditRequestPatch,
  editRequestShortLabel,
  editableParagraphs,
  isEditRequestOwner,
  parseEditRequestInput,
  proposalFields,
  resolveApplyFields,
  articleAcceptsEditRequests,
} from "@shared/articleEditRequests";

const HTML = [
  '<p>كرّمت جامعة الملك عبدالعزيز <strong>الفائزين</strong> بجائزة التميز، وشملت الجائزة 12 مبادرة.</p>',
  '<figure><img src="https://media.sabq.org/news/a.webp" alt=""></figure>',
  '<p>وأوضح وكيل الجامعة أن الجائزة تهدف إلى تحفيز المبادرات التطوعية.</p>',
].join("\n");

describe("parseEditRequestInput", () => {
  it("rejects an empty request", () => {
    const result = parseEditRequestInput({ articleId: "a1", note: "  ", proposed: {} });
    expect(result.ok).toBe(false);
  });

  it("accepts a note alone", () => {
    const result = parseEditRequestInput({ articleId: "a1", note: "الرقم خطأ" });
    expect(result.ok && result.value.note).toBe("الرقم خطأ");
  });

  it("drops unchanged paragraphs and keeps real edits", () => {
    const result = parseEditRequestInput({
      articleId: "a1",
      proposed: { contentEdits: [{ before: "نص  ثابت", after: "نص ثابت" }, { before: "12 مبادرة", after: "14 مبادرة" }] },
    });
    expect(result.ok && result.value.proposed.contentEdits).toEqual([{ before: "12 مبادرة", after: "14 مبادرة" }]);
  });

  it("refuses non-https image urls", () => {
    const result = parseEditRequestInput({ articleId: "a1", proposed: { imageUrl: "javascript:alert(1)" } });
    expect(result.ok).toBe(false);
    const album = parseEditRequestInput({ articleId: "a1", proposed: { albumAdd: ["http://x.test/a.jpg"] } });
    expect(album.ok).toBe(false);
  });

  it("only treats urgent=true as urgent", () => {
    const result = parseEditRequestInput({ articleId: "a1", note: "x", urgent: "yes" });
    expect(result.ok && result.value.urgent).toBe(false);
  });
});

describe("editableParagraphs + applyContentEdits", () => {
  it("lists text paragraphs without media", () => {
    expect(editableParagraphs(HTML)).toEqual([
      "كرّمت جامعة الملك عبدالعزيز الفائزين بجائزة التميز، وشملت الجائزة 12 مبادرة.",
      "وأوضح وكيل الجامعة أن الجائزة تهدف إلى تحفيز المبادرات التطوعية.",
    ]);
  });

  it("replaces only the matched paragraph and keeps media intact", () => {
    const [first] = editableParagraphs(HTML);
    const result = applyContentEdits(HTML, [{ before: first, after: first.replace("12", "14") }]);
    expect(result.applied).toBe(1);
    expect(result.missing).toEqual([]);
    expect(result.html).toContain("14 مبادرة");
    expect(result.html).not.toContain("12 مبادرة");
    expect(result.html).toContain('<img src="https://media.sabq.org/news/a.webp"');
    expect(result.html).toContain("وأوضح وكيل الجامعة");
  });

  it("escapes reporter text", () => {
    const [first] = editableParagraphs(HTML);
    const result = applyContentEdits(HTML, [{ before: first, after: '<script>x</script> نص' }]);
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>");
  });

  it("reports paragraphs changed since the request", () => {
    const result = applyContentEdits(HTML, [{ before: "فقرة لم تعد موجودة", after: "جديد" }]);
    expect(result.applied).toBe(0);
    expect(result.missing).toEqual(["فقرة لم تعد موجودة"]);
    expect(result.html).toBe(HTML);
  });

  it("deletes a paragraph when after is empty and appends a new one", () => {
    const [, second] = editableParagraphs(HTML);
    const result = applyContentEdits(HTML, [{ before: second, after: "" }], "فقرة ختامية");
    expect(result.html).not.toContain("وأوضح وكيل الجامعة");
    expect(result.html.endsWith("<p>فقرة ختامية</p>")).toBe(true);
  });

  it("handles legacy content without <p>", () => {
    const legacy = "السطر الأول<br>السطر الثاني";
    const result = applyContentEdits(legacy, [{ before: "السطر الثاني", after: "السطر المعدّل" }]);
    expect(result.html).toBe("السطر الأول<br>السطر المعدّل");
  });
});

describe("buildEditRequestPatch", () => {
  const proposed = {
    title: "عنوان جديد",
    imageUrl: "https://media.sabq.org/news/new.webp",
    imageAlt: "تكريم الفائزين",
    albumAdd: ["https://media.sabq.org/news/b.webp", "https://media.sabq.org/news/a2.webp"],
  };

  it("applies only the chosen fields", () => {
    const { patch, appliedFields } = buildEditRequestPatch({
      article: { content: HTML, albumImages: ["https://media.sabq.org/news/a2.webp"], seo: { keywords: ["x"] } },
      proposed,
      fields: ["imageUrl", "albumImages"],
    });
    expect(appliedFields).toEqual(["imageUrl", "albumImages"]);
    expect(patch.title).toBeUndefined();
    expect(patch.imageUrl).toBe(proposed.imageUrl);
    expect(patch.isAiGeneratedImage).toBe(false);
    expect(patch.seo).toEqual({ keywords: ["x"], imageAltText: "تكريم الفائزين" });
    expect(patch.albumImages).toEqual(["https://media.sabq.org/news/a2.webp", "https://media.sabq.org/news/b.webp"]);
  });

  it("skips content when every paragraph changed", () => {
    const result = buildEditRequestPatch({
      article: { content: HTML },
      proposed: { contentEdits: [{ before: "غير موجودة", after: "x" }] },
      fields: ["content"],
    });
    expect(result.appliedFields).toEqual([]);
    expect(result.missingParagraphs).toEqual(["غير موجودة"]);
  });
});

describe("helpers", () => {
  it("resolveApplyFields keeps only fields the request carries", () => {
    const proposed = { title: "x", albumAdd: ["https://a.test/1.jpg"] };
    expect(resolveApplyFields(undefined, proposed)).toEqual(["title", "albumImages"]);
    expect(resolveApplyFields(["albumImages", "content"], proposed)).toEqual(["albumImages"]);
    expect(resolveApplyFields(["status"], proposed)).toBeNull();
    expect(resolveApplyFields("title", proposed)).toBeNull();
  });

  it("labels", () => {
    expect(editRequestShortLabel({})).toBe("ملاحظة");
    expect(editRequestShortLabel({ albumAdd: ["a", "b", "c"] })).toBe("+3 صور");
    expect(editRequestShortLabel({ title: "x", contentEdits: [{ before: "a", after: "b" }] })).toBe("العنوان والنص");
    expect(proposalFields({ appendParagraph: "x" })).toEqual(["content"]);
  });

  it("owner and status rules", () => {
    expect(isEditRequestOwner({ authorId: "u1" }, "u1")).toBe(true);
    expect(isEditRequestOwner({ reporterId: "u2", authorId: "u1" }, "u2")).toBe(true);
    expect(isEditRequestOwner({ authorId: null, reporterId: null }, "u3")).toBe(false);
    expect(articleAcceptsEditRequests("published")).toBe(true);
    expect(articleAcceptsEditRequests("draft")).toBe(true);
    expect(articleAcceptsEditRequests("archived")).toBe(false);
  });
});
