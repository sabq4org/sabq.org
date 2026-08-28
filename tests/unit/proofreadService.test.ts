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
} from "../../server/services/proofreadService";

beforeEach(() => completeMock.mockReset());

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

  it("يعيد قائمة فارغة للنص القصير دون استدعاء النموذج", async () => {
    expect(await proofreadContent("<b>قصير</b>")).toEqual({ issues: [] });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("يتسامح مع JSON داخل أسوار كود أو مكسور", async () => {
    completeMock.mockResolvedValueOnce({ content: '```json\n{"issues":[]}\n```' });
    expect(await proofreadContent("نص طويل بما يكفي للتدقيق هنا")).toEqual({ issues: [] });
    completeMock.mockResolvedValueOnce({ content: "not json" });
    expect(await proofreadContent("نص طويل بما يكفي للتدقيق هنا")).toEqual({ issues: [] });
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
