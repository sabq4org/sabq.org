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
  // iPhone photos: browser may send image/heic or image/heif. We accept
  // the bytes here then transcode to WebP before storage (Cloudflare
  // Images / R2 don't take HEIC as a first-class input on our plan).
  heif: ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"],
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
  // Plain HEIF/HEIC (iPhone) keeps format "heif" and is handled separately.
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

const WEBP_TRANSCODE_OPTS = {
  failOn: "error" as const,
  limitInputPixels: 100_000_000,
};

/**
 * Cloudflare Images accepts AVIF input only on Enterprise plans. Normalize
 * user-provided AVIF files to WebP so the shared upload endpoint behaves the
 * same regardless of the active Cloudflare plan or fallback storage provider.
 */
export async function transcodeAvifToWebp(buffer: Buffer): Promise<Buffer> {
  return sharpModule(buffer, WEBP_TRANSCODE_OPTS)
    .rotate()
    .webp({ quality: 90, effort: 4, smartSubsample: true })
    .toBuffer();
}

/**
 * iPhone Camera rolls default to HEIC/HEIF. Convert to WebP before storage —
 * same rationale as AVIF (downstream providers don't accept HEIC on our plan).
 */
export async function transcodeHeicToWebp(buffer: Buffer): Promise<Buffer> {
  return sharpModule(buffer, WEBP_TRANSCODE_OPTS)
    .rotate()
    .webp({ quality: 90, effort: 4, smartSubsample: true })
    .toBuffer();
}

/** MIME types that must be normalized to WebP before Cloudflare Images / R2. */
export function needsWebpTranscode(mimeType: string): "avif" | "heic" | null {
  const mime = mimeType.toLowerCase();
  if (mime === "image/avif") return "avif";
  if (
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence"
  ) {
    return "heic";
  }
  return null;
}
