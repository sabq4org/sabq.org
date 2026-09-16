// وصف المشهد لصور الأخبار التلقائية — عبر البوابة مع احتياطي حتمي.

import { beforeEach, describe, expect, it, vi } from "vitest";

const completeMock = vi.fn();
vi.mock("../../server/ai/gateway", () => ({
  aiGateway: { complete: (...args: unknown[]) => completeMock(...args) },
}));

import {
  NEWS_IMAGE_AVOID_LIST,
  buildSceneContent,
  fallbackSceneBrief,
  generateSceneBrief,
} from "../../server/services/imageSceneBrief";
import { composeImagePrompt, normalizeImageStyleSettings, resolveImageStyle, DEFAULT_IMAGE_STYLE_SETTINGS } from "../../shared/imageStyles";

const input = {
  title: "أمطار رعدية غزيرة وسيول تضرب 10 مناطق سعودية اليوم",
  summary: "حذّر المركز الوطني للأرصاد من أمطار رعدية وجريان سيول.",
  category: "محليات",
  language: "ar" as const,
};

beforeEach(() => completeMock.mockReset());

describe("generateSceneBrief", () => {
  it("يستخدم وصف النموذج عند صلاحيته ويستدعي ميزة image-scene-brief بمهلة قصيرة", async () => {
    completeMock.mockResolvedValue({
      content: '{"scene":"Dark storm clouds and lightning over a modern Saudi city skyline, rain-soaked highway, water rushing through a wadi."}',
    });
    const r = await generateSceneBrief(input, "u1");
    expect(r.source).toBe("ai");
    expect(r.scene).toContain("Saudi city skyline");
    const req = completeMock.mock.calls[0][0];
    expect(req.feature).toBe("image-scene-brief");
    expect(req.timeoutMs).toBeLessThanOrEqual(20_000);
    expect(req.options.jsonMode).toBe(true);
    expect(req.messages[1].content).toContain(input.title);
  });

  it("يسقط للوصف الاحتياطي عند فشل النموذج أو رد قصير/مكسور", async () => {
    completeMock.mockRejectedValueOnce(new Error("timeout"));
    expect((await generateSceneBrief(input)).source).toBe("fallback");
    completeMock.mockResolvedValueOnce({ content: '{"scene":"x"}' });
    expect((await generateSceneBrief(input)).source).toBe("fallback");
    completeMock.mockResolvedValueOnce({ content: "not json" });
    const r = await generateSceneBrief(input);
    expect(r.source).toBe("fallback");
    expect(r.scene).toContain(input.summary);
  });
});

describe("buildSceneContent + composeImagePrompt", () => {
  it("يُنتج برومبت بنفس بنية المسار اليدوي: مشهد ← نمط ← حرّاس، مع الممنوعات", () => {
    const settings = normalizeImageStyleSettings(DEFAULT_IMAGE_STYLE_SETTINGS);
    const style = resolveImageStyle(settings, "illustration");
    const composed = composeImagePrompt({ style, variant: null, content: buildSceneContent("A storm over Riyadh.") });
    expect(composed.prompt).toMatch(/Scene brief: A storm over Riyadh\./);
    expect(composed.prompt.indexOf("Scene brief")).toBeLessThan(composed.prompt.indexOf("Visual style:"));
    expect(composed.prompt).toContain("editorial illustration");
    expect(composed.prompt).toContain("absolutely no text");
    expect(composed.prompt).toContain("compass roses");
    expect(composed.prompt).not.toMatch(/^Title:/m);
    expect(NEWS_IMAGE_AVOID_LIST).toContain("maps");
  });

  it("الوصف الاحتياطي لا يحتوي على بنية «قائمة بيانات»", () => {
    const fb = fallbackSceneBrief(input);
    expect(fb).toContain("ONE concrete real-world scene");
    expect(fb).not.toContain("Category:");
  });
});
