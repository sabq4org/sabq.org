// أرقام الخبر لنمط «إنفوجرافيك وبيانات» — أرقام موثّقة من النص فقط، واحتياطي عند غيابها.

import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.fn();
vi.mock("../../server/ai/gateway", () => ({
  aiGateway: { complete: (...args: unknown[]) => completeMock(...args) },
}));

import {
  buildInfographicContent,
  extractInfographicFacts,
  valueAppearsInSource,
} from "../../server/services/imageInfographicBrief";
import { composeImagePrompt, DEFAULT_IMAGE_STYLES, GLOBAL_IMAGE_GUARDS } from "../../shared/imageStyles";

const article = {
  title: "تراجع البطالة بين السعوديين إلى 7.1% في الربع الثاني",
  content:
    "<p>أظهرت بيانات الهيئة العامة للإحصاء تراجع معدل البطالة بين السعوديين إلى <strong>7.1%</strong>، " +
    "فيما ارتفعت مشاركة المرأة في سوق العمل إلى ٣٦٪، وبلغ عدد السعوديين في القطاع الخاص 2.4 مليون.</p>",
  language: "ar" as const,
};

beforeEach(() => completeMock.mockReset());

describe("valueAppearsInSource", () => {
  it("يقبل الرقم الموجود في النص ولو بأرقام هندية، ويرفض المخترع", () => {
    const src = "ارتفعت المشاركة إلى ٣٦٪ وبلغ العدد 2.4 مليون";
    expect(valueAppearsInSource("36%", src)).toBe(true);
    expect(valueAppearsInSource("2.4 مليون", src)).toBe(true);
    expect(valueAppearsInSource("2.5 مليون", src)).toBe(false);
    expect(valueAppearsInSource("مليون", src)).toBe(false);
  });

  it("يطابق الرقم كاملًا لا جزءًا منه", () => {
    const src = "ارتفعت النسبة إلى 25% في عام 2026";
    expect(valueAppearsInSource("25%", src)).toBe(true);
    expect(valueAppearsInSource("5%", src)).toBe(false);
    expect(valueAppearsInSource("20", src)).toBe(false);
  });
});

describe("extractInfographicFacts", () => {
  it("يستخرج الأرقام عبر ميزة infographic-ai من نص الخبر الكامل ويُسقط الرقم غير الموجود", async () => {
    completeMock.mockResolvedValue({
      content: JSON.stringify({
        heading: "سوق العمل في الربع الثاني",
        facts: [
          { value: "7.1%", label: "البطالة بين السعوديين" },
          { value: "36%", label: "مشاركة المرأة" },
          { value: "2.4 مليون", label: "سعودي في القطاع الخاص" },
          { value: "9.9%", label: "رقم مخترع" },
        ],
      }),
    });
    const r = await extractInfographicFacts(article, "u1");
    expect(r?.facts.map((f) => f.value)).toEqual(["7.1%", "36%", "2.4 مليون"]);
    const req = completeMock.mock.calls[0][0];
    expect(req.feature).toBe("infographic-ai");
    expect(req.options.jsonMode).toBe(true);
    expect(req.messages[1].content).toContain("2.4 مليون");
    expect(req.messages[1].content).not.toContain("<strong>");
  });

  it("لا يحسب الرقم المكرر مرتين، ويستبدل عنوانًا فيه رقم مخترع بعنوان الخبر", async () => {
    completeMock.mockResolvedValue({
      content: JSON.stringify({
        heading: "ارتفاع 50% في التوظيف",
        facts: [
          { value: "7.1%", label: "البطالة" },
          { value: "7.1%", label: "البطالة مرة أخرى" },
          { value: "36%", label: "مشاركة المرأة" },
        ],
      }),
    });
    const r = await extractInfographicFacts(article);
    expect(r?.facts.map((f) => f.value)).toEqual(["7.1%", "36%"]);
    expect(r?.heading).toBe(article.title);
  });

  it("يعيد null (فيرجع المسار لوصف المشهد) إذا قلّت الأرقام الموثّقة عن اثنين", async () => {
    completeMock.mockResolvedValue({ content: '{"heading":"x","facts":[{"value":"7.1%","label":"البطالة"}]}' });
    expect(await extractInfographicFacts(article)).toBeNull();
  });

  it("لا يستدعي النموذج لخبر بلا أرقام، ويعيد null عند فشل النموذج", async () => {
    expect(await extractInfographicFacts({ title: "افتتاح معرض الكتاب", content: "<p>افتتح المعرض اليوم</p>", language: "ar" })).toBeNull();
    expect(completeMock).not.toHaveBeenCalled();
    completeMock.mockRejectedValueOnce(new Error("timeout"));
    expect(await extractInfographicFacts(article)).toBeNull();
  });
});

describe("buildInfographicContent + composeImagePrompt", () => {
  it("يطلب رسم الأرقام كما هي ولا يضيف حارس منع الأرقام والنصوص", () => {
    const style = DEFAULT_IMAGE_STYLES.find((s) => s.slug === "infographic")!;
    const content = buildInfographicContent(
      { heading: "سوق العمل", facts: [{ value: "7.1%", label: "البطالة" }, { value: "36%", label: "مشاركة المرأة" }] },
      "ar"
    );
    const { prompt } = composeImagePrompt({ style, variant: null, content, includeGuards: false });
    expect(prompt).toContain('"7.1%"');
    expect(prompt).toContain('"مشاركة المرأة"');
    expect(prompt).toContain("right-to-left");
    expect(prompt).not.toContain(GLOBAL_IMAGE_GUARDS);
    expect(prompt).not.toMatch(/no text, letters, words, numbers/);
  });
});
