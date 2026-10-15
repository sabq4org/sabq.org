import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  IPTC_TRAINED_ALGORITHMIC_MEDIA,
  isAiGeneratedImagePurpose,
  withAiProvenance,
} from "../../server/utils/aiImageProvenance";
import { prepareR2Objects } from "../../server/services/newsImageStorageService";

async function samplePng(width = 1200, height = 675): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 160 } },
  })
    .png()
    .toBuffer();
}

async function xmpOf(buffer: Buffer): Promise<string> {
  const { xmp } = await sharp(buffer).metadata();
  return xmp ? xmp.toString("utf8") : "";
}

describe("isAiGeneratedImagePurpose", () => {
  it("يتعرف على أغراض الصور المولدة فقط", () => {
    expect(isAiGeneratedImagePurpose("article-ai-generated")).toBe(true);
    expect(isAiGeneratedImagePurpose("article-openai-generated")).toBe(true);
    expect(isAiGeneratedImagePurpose("article-image")).toBe(false);
    expect(isAiGeneratedImagePurpose("article-thumbnail")).toBe(false);
    expect(isAiGeneratedImagePurpose(undefined)).toBe(false);
  });
});

describe("withAiProvenance", () => {
  it("يكتب وسم IPTC trainedAlgorithmicMedia في ملف WebP", async () => {
    const tagged = await withAiProvenance(sharp(await samplePng())).webp().toBuffer();
    const xmp = await xmpOf(tagged);
    expect(xmp).toContain("Iptc4xmpExt:DigitalSourceType");
    expect(xmp).toContain(IPTC_TRAINED_ALGORITHMIC_MEDIA);
  });

  it("التحويل العادي بلا الوسم لا يحمل أي XMP (سبب الإصلاح)", async () => {
    const plain = await sharp(await samplePng()).webp().toBuffer();
    expect(await xmpOf(plain)).toBe("");
  });
});

describe("prepareR2Objects — نسخ R2", () => {
  it("كل نسخ WebP لصورة مولدة تحمل الوسم", async () => {
    const prepared = await prepareR2Objects(
      { buffer: await samplePng(), filename: "a.png", mimeType: "image/png", purpose: "article-ai-generated" },
      "news/2026/10/test",
    );
    const variants = prepared.objects.filter((o) => o.contentType === "image/webp");
    expect(variants.length).toBeGreaterThan(0);
    for (const variant of variants) {
      expect(await xmpOf(variant.body)).toContain(IPTC_TRAINED_ALGORITHMIC_MEDIA);
    }
  });

  it("صور الأخبار الحقيقية لا تُوسم بأنها مولدة", async () => {
    const prepared = await prepareR2Objects(
      { buffer: await samplePng(), filename: "a.png", mimeType: "image/png", purpose: "article-image" },
      "news/2026/10/test",
    );
    for (const variant of prepared.objects.filter((o) => o.contentType === "image/webp")) {
      expect(await xmpOf(variant.body)).not.toContain(IPTC_TRAINED_ALGORITHMIC_MEDIA);
    }
  });
});
