// خدمة التدقيق اللغوي — تمر عبر بوابة الذكاء بمهلة قصيرة، وترشّح اقتراحات النموذج.

import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.fn();
vi.mock("../../server/ai/gateway", () => ({
  aiGateway: { complete: (...args: unknown[]) => completeMock(...args) },
}));

import {
  filterProofreadIssues,
  normalizeArabic,
  proofreadContent,
  proofreadErrorResponse,
  proofreadTitle,
  stripHtmlToText,
} from "../../server/services/proofreadService";

beforeEach(() => { completeMock.mockReset(); });

describe("filterProofreadIssues", () => {
  const text = "قال الوزير أن المشروع سينتهي قريبا وأن اللذي يتابعه هو الفريق";

  it("يُبقي الأخطاء الحقيقية ويُسقط الفروق التافهة والمكررات وما ليس في النص", () => {
    const issues = filterProofreadIssues(
      [
        { original: "اللذي", suggestion: "الذي" },
        { original: "اللذي", suggestion: "الذي" }, // مكرر
        { original: "قريبا", suggestion: "قريباً" }, // تشكيل فقط
        { original: "الوزير", suggestion: "الوزير." }, // ترقيم فقط
        { original: "غائب", suggestion: "غايب" }, // ليس في النص
        { original: "أ", suggestion: "إ" }, // حرف واحد
        { original: 5, suggestion: "x" }, // شكل خاطئ
      ],
      text,
    );
    expect(issues).toEqual([{ original: "اللذي", suggestion: "الذي" }]);
  });

  it("يتحمل مدخلًا ليس مصفوفة", () => {
    expect(filterProofreadIssues(undefined, text)).toEqual([]);
    expect(filterProofreadIssues({ issues: [] }, text)).toEqual([]);
  });
});

describe("proofreadContent", () => {
  it("يستدعي البوابة بميزة proofread ومهلة قصيرة وjsonMode", async () => {
    completeMock.mockResolvedValue({ content: '{"issues":[{"original":"اللذي","suggestion":"الذي"}]}' });
    const res = await proofreadContent("<p>النص اللذي كُتب</p>", "u1");
    expect(res.issues).toEqual([{ original: "اللذي", suggestion: "الذي" }]);
    const req = completeMock.mock.calls[0][0];
    expect(req.feature).toBe("proofread");
    expect(req.userId).toBe("u1");
    expect(req.timeoutMs).toBeLessThanOrEqual(30_000);
    expect(req.options.jsonMode).toBe(true);
    expect(req.messages[1].content).toContain("النص اللذي كُتب");
    expect(req.messages[1].content).not.toContain("<p>");
  });

  it("لا يستدعي النموذج للنص الفارغ", async () => {
    expect(await proofreadContent("<p><br></p>")).toEqual({ issues: [] });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("يقرأ أسوار الكود ويرفض JSON المكسور بدل إعلان سلامة النص", async () => {
    completeMock.mockResolvedValueOnce({ content: '```json\n{"issues":[]}\n```' });
    expect(await proofreadContent("نص طويل بما يكفي للتدقيق هنا")).toEqual({ issues: [] });
    completeMock.mockResolvedValueOnce({ content: "not json" });
    await expect(proofreadContent("نص طويل بما يكفي للتدقيق هنا")).rejects.toMatchObject({ code: "INVALID_PROOFREAD_RESULT" });
  });
});

describe("proofreadTitle", () => {
  it("يُرجع hasIssues=false عندما يكون الفرق تشكيلًا فقط", async () => {
    completeMock.mockResolvedValue({
      content: '{"suggestion":"الهلالُ يفوزُ","hasIssues":true,"notes":[{"type":"إملائي","explanation":"x"}]}',
    });
    const res = await proofreadTitle("الهلال يفوز");
    expect(res).toEqual({ original: "الهلال يفوز", suggestion: "الهلال يفوز", hasIssues: false, notes: [] });
  });

  it("يُرجع الاقتراح والملاحظات عند وجود تصحيح فعلي", async () => {
    completeMock.mockResolvedValue({
      content: '{"suggestion":"الهلال يفوز على النصر","hasIssues":true,"notes":[{"type":"نحوي","explanation":"حرف الجر"}]}',
    });
    const res = await proofreadTitle("الهلال يفوز عل النصر", "u2");
    expect(res.hasIssues).toBe(true);
    expect(res.suggestion).toBe("الهلال يفوز على النصر");
    expect(res.notes).toHaveLength(1);
    expect(completeMock.mock.calls[0][0].feature).toBe("proofread");
  });

  it("لا يستدعي النموذج لعنوان أقصر من 3 أحرف", async () => {
    const res = await proofreadTitle("  ا ");
    expect(res.hasIssues).toBe(false);
    expect(completeMock).not.toHaveBeenCalled();
  });
});

describe("proofreadErrorResponse", () => {
  it("يترجم أكواد البوابة إلى حالات HTTP مناسبة", () => {
    expect(proofreadErrorResponse({ code: "RATE_LIMITED" }).status).toBe(429);
    expect(proofreadErrorResponse({ code: "QUOTA_EXCEEDED" }).status).toBe(429);
    expect(proofreadErrorResponse({ status: 429 }).status).toBe(429);
    expect(proofreadErrorResponse({ code: "TIMEOUT" }).status).toBe(504);
    expect(proofreadErrorResponse({ code: "NO_MODEL_AVAILABLE" }).status).toBe(504);
    expect(proofreadErrorResponse(new Error("boom")).status).toBe(500);
  });
});

describe("normalizeArabic", () => {
  it("يزيل التشكيل والتطويل والعلامات الخفية", () => {
    expect(normalizeArabic("سَبْـق‏  الإخبارية")).toBe("سبق الإخبارية");
  });
});

describe("Arabic proofreading regressions", () => {
  it("retains joined-word and omitted-hamza fixes, including existing diacritics", () => {
    const pairs = [
      ["بالشركةمن", "بالشركة من"], ["مشروعتقني", "مشروع تقني"],
      ["المخاطروالالتزامات", "المخاطر والالتزامات"], ["الى", "إلى"],
      ["الادارة", "الإدارة"], ["اِلى", "إِلى"],
    ];
    const issues = pairs.map(([original, suggestion]) => ({ original, suggestion }));
    expect(filterProofreadIssues(issues, pairs.map(p => p[0]).join(" "))).toEqual(issues);
  });
  it("drops duplicate whitespace, tashkeel, punctuation and empty suggestions", () => {
    expect(filterProofreadIssues([
      { original: "عمل جيد", suggestion: "عمل  جيد" },
      { original: "عمل جيد", suggestion: "عمل جيد!" },
      { original: "جيد", suggestion: "جيّد" },
      { original: "عمل", suggestion: "" },
    ], "عمل جيد")).toEqual([]);
  });
  it("does not erase decomposed hamzas during comparison", () => {
    expect(normalizeArabic("ا\u0655لى")).toBe("إلى");
    expect(filterProofreadIssues([{ original: "الى", suggestion: "ا\u0655لى" }], "الى")).toHaveLength(1);
  });
  it("extracts visible words without manufacturing spaces at inline formatting", () => {
    expect(stripHtmlToText('<p>المخاطر<strong>والالتزامات</strong>&nbsp;الى</p><p>&#1573;دارة &amp; تقنية</p><script>خفية</script>')).toBe("المخاطروالالتزامات الى إدارة & تقنية");
  });
  it("checks a short word that can contain an omitted hamza", async () => {
    completeMock.mockResolvedValue({ content: '{"issues":[{"original":"الى","suggestion":"إلى"}]}' });
    expect((await proofreadContent("الى")).issues).toHaveLength(1);
  });
  it.each(["{}", "null", '[]', '{"issues":null}', '{"issues":[null]}', '{"issues":[{"original":4}]}'])("rejects malformed result %s", async content => {
    completeMock.mockResolvedValue({ content });
    await expect(proofreadContent("نص مطلوب تدقيقه")).rejects.toMatchObject({ code: "INVALID_PROOFREAD_RESULT" });
  });
  it("rejects truncated responses even when their JSON is valid", async () => {
    completeMock.mockResolvedValue({ content: '{"issues":[]}', truncated: true });
    await expect(proofreadContent("النص المطلوب تدقيقه")).rejects.toMatchObject({ code: "INVALID_PROOFREAD_RESULT" });
  });
  it("checks the tail after 8000 characters instead of silently truncating it", async () => {
    completeMock.mockImplementation(async req => ({ content: JSON.stringify({ issues: req.messages[1].content.includes("الادارة") ? [{ original: "الادارة", suggestion: "الإدارة" }] : [] }) }));
    const result = await proofreadContent("نص صحيح. ".repeat(1000) + "الادارة");
    expect(completeMock).toHaveBeenCalledTimes(2);
    expect(result.issues).toEqual([{ original: "الادارة", suggestion: "الإدارة" }]);
  });
  it("fails the entire check when any chunk fails", async () => {
    completeMock.mockResolvedValueOnce({ content: '{"issues":[]}' }).mockResolvedValueOnce({ content: "broken" });
    await expect(proofreadContent("نص صحيح. ".repeat(1000))).rejects.toMatchObject({ code: "INVALID_PROOFREAD_RESULT" });
  });
  it("rejects excessive input before calling the provider", async () => {
    await expect(proofreadContent("نص ".repeat(11000))).rejects.toMatchObject({ code: "PROOFREAD_INPUT_TOO_LONG" });
    expect(completeMock).not.toHaveBeenCalled();
  });
  it("maps incomplete proofreads to a retryable error response", () => {
    expect(proofreadErrorResponse({ code: "INVALID_PROOFREAD_RESULT" }).status).toBe(502);
  });
});

it("caps the merged result at 50 unique suggestions across chunks", async () => {
  completeMock.mockImplementation(async req => {
    const words = req.messages[1].content.match(/خطا\d+/g) ?? [];
    return { content: JSON.stringify({ issues: words.map((original: string) => ({ original, suggestion: original.replace("خطا", "خطأ") })) }) };
  });
  const first = Array.from({ length: 40 }, (_, i) => `خطا${i}`).join(" ");
  const second = Array.from({ length: 40 }, (_, i) => `خطا${i + 40}`).join(" ");
  expect((await proofreadContent(first + " صحيح".repeat(1700) + " " + second)).issues).toHaveLength(50);
});

it("rejects a malformed title result instead of marking the title clean", async () => {
  completeMock.mockResolvedValue({ content: '{}' });
  await expect(proofreadTitle("عنوان يستحق التدقيق")).rejects.toMatchObject({ code: "INVALID_PROOFREAD_RESULT" });
});
