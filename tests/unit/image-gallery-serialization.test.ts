// @vitest-environment jsdom
// انحدار: كان renderHTML في ImageGallery يقرأ HTMLAttributes.images (غير موجودة —
// تصل مُصيَّرة باسم data-images) فيسلسل كل ألبوم فارغًا data-images="[]" بلا معرف،
// وتضيع الصور عند كل حفظ للخبر رغم ظهورها داخل المحرر.
import { describe, it, expect } from "vitest";
import { Editor, generateHTML } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { ImageGallery } from "@/components/editor-extensions/ImageGallery";

// ReactNodeViewRenderer يحتاج تركيب React كامل؛ إلغاء الـnode view يبقي
// المخطط وrenderHTML كما هما — وهما موضع الاختبار.
const GalleryNoView = ImageGallery.extend({ addNodeView: () => null as never });
const extensions = [Document, Paragraph, Text, GalleryNoView];

const IMAGES = [
  { src: "https://media.sabq.org/news/a.webp", caption: "أولى" },
  { src: "https://media.sabq.org/news/b.webp", caption: "" },
];

describe("ImageGallery serialization", () => {
  it("generateHTML يحمل الصور والمعرف وعناصر img", () => {
    const html = generateHTML(
      {
        type: "doc",
        content: [
          { type: "imageGallery", attrs: { galleryId: "g-123", images: IMAGES } },
        ],
      },
      extensions,
    );
    expect(html).toContain('data-gallery-id="g-123"');
    expect(html).not.toMatch(/data-images="\[\]"/);
    expect(html).toContain("media.sabq.org/news/a.webp");
    expect((html.match(/<img /g) || []).length).toBe(2);
  });

  it("جولة كاملة: تحليل HTML محفوظ ثم getHTML لا يفقد شيئًا", () => {
    const saved =
      `<p>نص</p><div data-image-gallery="" data-gallery-id="g-123" ` +
      `data-images='${JSON.stringify(IMAGES).replace(/'/g, "&#39;")}' class="photo-album"></div>`;
    const editor = new Editor({
      element: document.createElement("div"),
      extensions,
      content: saved,
    });
    const roundTrip = editor.getHTML();
    expect(roundTrip).toContain('data-gallery-id="g-123"');
    expect(roundTrip).toContain("media.sabq.org/news/b.webp");
    expect(roundTrip).not.toMatch(/data-images="\[\]"/);
    editor.destroy();
  });

  it("مسار حفظ حوار الألبوم: updateAttributes ثم getHTML يحمل الصور", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions,
      content: `<p>نص</p><div data-image-gallery="" data-gallery-id="g-1" data-images="[]" class="photo-album"></div>`,
    });
    let pos = -1;
    editor.state.doc.descendants((node, p) => {
      if (node.type.name === "imageGallery") pos = p;
    });
    expect(pos).toBeGreaterThanOrEqual(0);
    // يحاكي NodeView.updateAttributes: setNodeMarkup بدمج الخصائص الجديدة
    editor.commands.command(({ tr }) => {
      const node = editor.state.doc.nodeAt(pos);
      if (!node) return false;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, images: IMAGES, galleryId: "g-1" });
      return true;
    });
    const html = editor.getHTML();
    expect(html).toContain('data-gallery-id="g-1"');
    expect(html).toContain("media.sabq.org/news/a.webp");
    expect((html.match(/<img /g) || []).length).toBe(2);
    editor.destroy();
  });
});
