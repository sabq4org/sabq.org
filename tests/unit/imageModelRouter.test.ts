import { describe, it, expect, vi } from "vitest";
import {
  detectImageIntent,
  buildIntentOptimizedPrompt,
  suggestOptimalModel,
  DEFAULT_IMAGE_MODEL,
} from "@shared/imageStyles";
import {
  detectImageIntent as serverDetectIntent,
  buildIntentOptimizedPrompt as serverBuildPrompt,
} from "../../server/services/imageModelRouter";

describe("Image Model Router & Intent Engine", () => {
  describe("detectImageIntent", () => {
    it("detects infographic intent from keywords and category", () => {
      expect(serverDetectIntent("انفوجرافيك إحصائي حول الطاقة المتجددة")).toBe("infographic");
      expect(serverDetectIntent("تقرير بالأرقام والإحصائيات", "اقتصاد")).toBe("infographic");
      expect(serverDetectIntent("مخطط بياني للصادرات", "مال")).toBe("infographic");
    });

    it("detects opinion art intent from type or column keywords", () => {
      expect(serverDetectIntent("تأملات في مستقبل التقنية", "رأي", "opinion")).toBe("opinion_art");
      expect(serverDetectIntent("رسم توضيحي رمزي", "ثقافة", "column")).toBe("opinion_art");
    });

    it("detects breaking banner intent", () => {
      expect(serverDetectIntent("عاجل: إعلان هام", "أخبار عاجلة")).toBe("breaking_banner");
      expect(serverDetectIntent("خبر مميز لخلفية التغطية")).toBe("breaking_banner");
    });

    it("defaults to photojournalism for regular news", () => {
      expect(serverDetectIntent("وزير الطاقة يفتتح محطة جديدة في الرياض", "محليات")).toBe("photo");
    });
  });

  describe("suggestOptimalModel", () => {
    it("suggests Recraft v3 for infographics and economics", () => {
      const result = suggestOptimalModel("infographic", "infographic", "اقتصاد");
      expect(result.model).toBe("recraft-v3");
      expect(result.provider).toBe("recraft");
      expect(result.reasonAr).toContain("إنفوجرافيك");
    });

    it("suggests Recraft v3 for opinion pieces and illustrations", () => {
      const result = suggestOptimalModel("opinion_art", "illustration", "مقالات");
      expect(result.model).toBe("recraft-v3");
      expect(result.provider).toBe("recraft");
    });

    it("suggests Gemini 3.1 Flash for breaking banners", () => {
      const result = suggestOptimalModel("breaking_banner");
      expect(result.model).toBe("gemini-3.1-flash-image-preview");
      expect(result.provider).toBe("google");
    });

    it("suggests Gemini 3 Pro for realistic field photography", () => {
      const result = suggestOptimalModel("photo", "realistic", "أخبار");
      expect(result.model).toBe("gemini-3-pro-image-preview");
      expect(result.provider).toBe("google");
    });
  });

  describe("buildIntentOptimizedPrompt", () => {
    it("builds clean infographic prompt with metrics and guards", () => {
      const metrics = ["٧٥٪ نمو الصادرات", "١٢ مليار ريال"];
      const built = serverBuildPrompt("infographic", "أداء الصادرات السعودية", "اقتصاد", metrics);
      
      expect(built.prompt).toContain("Professional journalistic data infographic");
      expect(built.prompt).toContain("Metric 1: ٧٥٪ نمو الصادرات");
      expect(built.prompt).toContain("Metric 2: ١٢ مليار ريال");
      expect(built.prompt).toContain("CRITICAL: absolutely no text");
      expect(built.negativePrompt).toContain("photorealistic");
    });

    it("builds editorial conceptual prompt for opinion articles", () => {
      const built = serverBuildPrompt("opinion_art", "الذكاء الاصطناعي ومستقبل التعليم");
      expect(built.prompt).toContain("Conceptual editorial illustration");
      expect(built.negativePrompt).toContain("photorealistic");
    });

    it("builds realistic photo prompt for documentary news", () => {
      const built = serverBuildPrompt("photo", "مؤتمر صحفي في الرياض");
      expect(built.prompt).toContain("Photojournalism editorial documentary photography");
      expect(built.negativePrompt).toContain("CGI");
    });
  });
});
