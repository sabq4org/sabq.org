// @vitest-environment jsdom
// صور البريد الذكي بعد الأولى تُكتب تحت النص بصيغة «ألبوم» المحرر؛ هذا يثبت أن المحرر يقرؤها ألبومًا
// بصوره كلها (لا وسوم img متناثرة ولا مرفقات جانبية).
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { ImageGallery } from "@/components/editor-extensions/ImageGallery";
import { buildEmailImagesHtml } from "../../server/services/emailAgentGuards";

const GalleryNoView = ImageGallery.extend({ addNodeView: () => null as never });

describe("email images in the article editor", () => {
  it("opens as one album with every image", () => {
    const urls = ["https://media.sabq.org/news/a.webp", "https://media.sabq.org/news/b.webp", "https://media.sabq.org/news/c.webp"];
    const content = `<p>نص الخبر</p>\n${buildEmailImagesHtml(urls, "عنوان")}`;
    const editor = new Editor({ extensions: [Document, Paragraph, Text, GalleryNoView], content });
    const json = editor.getJSON();
    const gallery = json.content?.find((n) => n.type === "imageGallery");
    expect(gallery?.attrs?.images.map((i: { src: string }) => i.src)).toEqual(urls);
    expect(json.content?.[0]?.type).toBe("paragraph");
    expect((editor.getHTML().match(/<img /g) || []).length).toBe(3);
    editor.destroy();
  });
});
