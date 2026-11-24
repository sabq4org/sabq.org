// @vitest-environment jsdom
// جداول المحرر: عروض الأعمدة (سحب أو لصق من Word/Docs) تُحفظ نِسَبًا مئوية
// لا بكسلات، فيملأ الجدول عمود الخبر عند القارئ ولا يفيض على الجوال، ويستعيد
// المحرر العروض نفسها عند إعادة فتح الخبر.
import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { tableExtensions } from "@/components/editor-extensions/SabqTable";

const extensions = [Document, Paragraph, Text, ...tableExtensions];
let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

// شكل الجدول الملصوق كما وُجد في خبر حقيقي (عرض ثابت 482px)
const PASTED =
  '<table class="sabq-table" style="width: 482px"><colgroup><col style="width: 126px"><col style="width: 180px"><col style="width: 176px"></colgroup><tbody>' +
  '<tr><th colwidth="126"><p>نوع المصروف</p></th><th colwidth="180"><p>طريقة التخطيط</p></th><th colwidth="176"><p>الهدف</p></th></tr>' +
  '<tr><td colwidth="126"><p>أ</p></td><td colwidth="180"><p>ب</p></td><td colwidth="176"><p>ج</p></td></tr>' +
  "</tbody></table>";

describe("SabqTable serialization", () => {
  it("يحوّل عروض البكسل إلى نسب ويحذف عرض الجدول الثابت", () => {
    editor = new Editor({ extensions, content: PASTED });
    const html = editor.getHTML();
    expect(html).toContain('class="sabq-table"');
    expect(html).not.toMatch(/<table[^>]*style="[^"]*width: \d+px/);
    expect(html).toContain('<col style="width: 26.14%;">');
    expect(html).toContain('<col style="width: 37.34%;">');
    expect(html).toContain('<col style="width: 36.51%;">');
    // البكسلات تبقى على الخلايا ليقرأها المحرر عند إعادة الفتح
    expect(html).toContain('colwidth="126"');
  });

  it("جولة كاملة: إعادة فتح HTML المحفوظ تستعيد عروض الأعمدة نفسها", () => {
    editor = new Editor({ extensions, content: PASTED });
    const saved = editor.getHTML();
    editor.destroy();
    editor = new Editor({ extensions, content: saved });
    expect(editor.getHTML()).toBe(saved);
  });

  it("جدول بلا عروض يبقى بأعمدة تلقائية (min-width فقط)", () => {
    editor = new Editor({ extensions, content: "<p>x</p>" });
    editor.commands.insertTable({ rows: 2, cols: 3, withHeaderRow: true });
    const html = editor.getHTML();
    expect(html).not.toMatch(/<col style="width/);
    expect(html).toContain('class="sabq-table"');
  });

  it("«توزيع الأعمدة تلقائيًا» يمسح العروض المحفوظة", () => {
    editor = new Editor({ extensions, content: PASTED });
    editor.commands.setTextSelection(editor.state.doc.content.size - 4);
    expect(editor.can().resetTableColumnWidths()).toBe(true);
    expect(editor.commands.resetTableColumnWidths()).toBe(true);
    const html = editor.getHTML();
    expect(html).not.toContain("colwidth=");
    expect(html).not.toMatch(/<col style="width/);
    expect(editor.can().resetTableColumnWidths()).toBe(false);
  });
});
