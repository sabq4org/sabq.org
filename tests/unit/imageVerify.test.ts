import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  needsWebpTranscode,
  normalizeImageForUpload,
  transcodeAvifToWebp,
  verifyImageMagicBytes,
} from "../../server/utils/imageVerify";

async function samplePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 16,
      height: 16,
      channels: 4,
      background: { r: 25, g: 120, b: 70, alpha: 0.7 },
    },
  })
    .png()
    .toBuffer();
}

describe("image upload verification", () => {
  it("recognizes libvips HEIF/AV1 metadata as AVIF", async () => {
    const avif = await sharp(await samplePng()).avif().toBuffer();

    await expect(verifyImageMagicBytes(avif, "image/avif")).resolves.toEqual({
      ok: true,
      detectedFormat: "avif",
    });
  });

  it("rejects a forged MIME type", async () => {
    const png = await samplePng();

    await expect(verifyImageMagicBytes(png, "image/jpeg")).resolves.toMatchObject({
      ok: false,
      detectedFormat: "png",
    });
  });

  it("transcodes AVIF uploads to universally supported WebP", async () => {
    const avif = await sharp(await samplePng()).avif().toBuffer();
    const webp = await transcodeAvifToWebp(avif);

    await expect(verifyImageMagicBytes(webp, "image/webp")).resolves.toEqual({
      ok: true,
      detectedFormat: "webp",
    });
  });

  it("normalizes AVIF to webp or jpeg via soft fallback ladder", async () => {
    const avif = await sharp(await samplePng()).avif({ quality: 40 }).toBuffer();
    const normalized = await normalizeImageForUpload(avif);

    expect(["image/webp", "image/jpeg"]).toContain(normalized.mimeType);
    expect(["webp", "jpg"]).toContain(normalized.extension);
    await expect(
      verifyImageMagicBytes(normalized.buffer, normalized.mimeType),
    ).resolves.toMatchObject({ ok: true });
  });

  it("flags AVIF and HEIC MIME types for WebP transcode", () => {
    expect(needsWebpTranscode("image/avif")).toBe("avif");
    expect(needsWebpTranscode("image/heic")).toBe("heic");
    expect(needsWebpTranscode("image/heif")).toBe("heic");
    expect(needsWebpTranscode("image/jpeg")).toBeNull();
    expect(needsWebpTranscode("image/png")).toBeNull();
  });
});
