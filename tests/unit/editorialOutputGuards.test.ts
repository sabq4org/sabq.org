// حارس بتر Structured Outputs الصامت (حادثة «تحرير وتوليد شامل» 2026-08-03):
// علامة " غير مهرَّبة تُغلق سلسلة JSON مبكرًا فيصل المحتوى مبتورًا داخل JSON صالح.

import { describe, expect, it } from "vitest";
import {
  assertEditedContentComplete,
  htmlToPlainText,
} from "../../server/ai/editorialOutputGuards";

const P = (s: string) => `<p>${s}</p>`;
// مدخل واقعي فوق عتبة فحص النسبة (400 حرف صافٍ)
const INPUT = Array.from({ length: 6 }, (_, i) =>
  P(`فقرة إخبارية رقم ${i + 1} تحتوي تفاصيل ومعلومات موسعة عن الحدث الرئيسي وتصريحات المسؤولين والأرقام الدقيقة للمشاركين في الفعالية الدولية المقامة في جدة.`)
).join("");

describe("htmlToPlainText", () => {
  it("strips tags and collapses whitespace", () => {
    expect(htmlToPlainText("<p>أهلاً  <strong>بكم</strong></p>\n<p>في سبق</p>")).toBe(
      "أهلاً بكم في سبق"
    );
  });
});

describe("assertEditedContentComplete", () => {
  it("passes complete HTML content of comparable length", () => {
    expect(() => assertEditedContentComplete(INPUT, INPUT)).not.toThrow();
  });

  it("throws on the incident fingerprint: HTML cut mid-paragraph before a quote", () => {
    // نسخة طبق الأصل من الحادثة: المحتوى ينتهي بمسافة داخل فقرة بلا وسم إغلاق
    const truncated =
      P("افتتح محافظ جدة منافسات النسخة الثالثة من الأولمبياد.") +
      "<p>حضر الحفل الأمين العام لمؤسسة الملك عبدالعزيز ورجاله للموهبة والإبداع ";
    expect(() => assertEditedContentComplete(truncated, INPUT)).toThrow(/closing tag/);
  });

  it("throws when whole paragraphs were dropped (ratio guard)", () => {
    // ينتهي بوسم إغلاق سليم لكنه أقل من نصف المدخل
    const shrunk = P("فقرة وحيدة قصيرة بقيت من المادة.");
    expect(() => assertEditedContentComplete(shrunk, INPUT)).toThrow(/50%/);
  });

  it("allows empty content (spam / no-news materials)", () => {
    expect(() => assertEditedContentComplete("", INPUT)).not.toThrow();
  });

  it("skips ratio guard for tiny inputs (WhatsApp-style) where expansion is expected", () => {
    const tiny = P("خصم 50% منح جديدة للطالبات");
    expect(() => assertEditedContentComplete(P("خبر محرر موسع."), tiny)).not.toThrow();
  });

  it("skips ratio guard for huge inputs (email chains) where legitimate cleaning shrinks a lot", () => {
    const hugeInput = P("خبر قصير. ") + "سلسلة بريد معاد توجيهها ".repeat(600);
    const cleaned = P("الخبر بعد التنظيف والتحرير الكامل بأسلوب سبق المعتمد.");
    expect(() => assertEditedContentComplete(cleaned, hugeInput)).not.toThrow();
  });

  it("still catches unclosed HTML even for huge inputs", () => {
    const hugeInput = "سلسلة بريد ".repeat(1500);
    expect(() => assertEditedContentComplete("<p>بداية فقرة بلا إغلاق ", hugeInput)).toThrow(
      /closing tag/
    );
  });

  it("does not flag plain-text output that uses no HTML blocks", () => {
    const plain = "نص محرر بلا وسوم HTML يغطي كامل تفاصيل المادة الأصلية ويحافظ على كل المعلومات الواردة فيها. ".repeat(12);
    expect(() => assertEditedContentComplete(plain, INPUT)).not.toThrow();
  });
});
