// Image magic-byte verifier (security audit M1, 2026-05-11).
//
// multer's fileFilter only inspects the client-declared `mimetype` header,
// which is trivial to forge. A POSTed .html file with `Content-Type:
// image/jpeg` sails through the existing allowlist. Sharp can read the
// actual file signature from the first few bytes, so we use it as a
// second gate after multer accepts the upload.
//
// Sharp is already a project dependency for image processing; no new
// install required.

import sharpModule from "sharp";

// Map sharp's detected format → the MIME types we'll accept as truthful.
// Keep this tight: anything not in here is rejected even if sharp can
// decode it.
const FORMAT_TO_MIMES: Record<string, string[]> = {
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  webp: ["image/webp"],
  // gif intentionally absent — uploads are blocked at multer fileFilter
  //   for animated-GIF DoS (audit M8) and we don't want callers to
  //   re-introduce them via mismatched MIME.
  // svg intentionally absent — script-bearing SVGs (audit H3).
  avif: ["image/avif"],
  tiff: ["image/tiff"],
};

export interface ImageVerifyResult {
  ok: boolean;
  detectedFormat?: string;
  reason?: string;
}

/**
 * Verify the buffer's actual format matches the claimed MIME type.
 *
 * Returns ok:false if:
 *   - sharp cannot read it (corrupt / not an image)
 *   - the detected format isn't one we accept
 *   - the detected format is one we accept but doesn't match the claim
 */
export async function verifyImageMagicBytes(
  buffer: Buffer,
  claimedMime: string
): Promise<ImageVerifyResult> {
  let meta;
  try {
    meta = await sharpModule(buffer).metadata();
  } catch (e) {
    return { ok: false, reason: "could not decode image" };
  }
  // libvips reports AVIF containers as HEIF with AV1 compression. Normalize
  // that combination before comparing it with the browser's image/avif MIME.
  const fmt = meta.format === "heif" && meta.compression === "av1"
    ? "avif"
    : meta.format;
  if (!fmt) {
    return { ok: false, reason: "no format detected" };
  }
  const acceptable = FORMAT_TO_MIMES[fmt];
  if (!acceptable) {
    return { ok: false, detectedFormat: fmt, reason: `format ${fmt} not allowed` };
  }
  if (!acceptable.includes(claimedMime.toLowerCase())) {
    return {
      ok: false,
      detectedFormat: fmt,
      reason: `claimed ${claimedMime} but bytes are ${fmt}`,
    };
  }
  return { ok: true, detectedFormat: fmt };
}

/**
 * Cloudflare Images accepts AVIF input only on Enterprise plans. Normalize
 * user-provided AVIF files to WebP so the shared upload endpoint behaves the
 * same regardless of the active Cloudflare plan or fallback storage provider.
 */
export async function transcodeAvifToWebp(buffer: Buffer): Promise<Buffer> {
  return sharpModule(buffer, {
    failOn: "error",
    limitInputPixels: 100_000_000,
  })
    .rotate()
    .webp({ quality: 90, effort: 4, smartSubsample: true })
    .toBuffer();
}
