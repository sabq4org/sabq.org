import { randomUUID } from "crypto";
import sharp from "sharp";
import { db } from "../db";
import { mediaFiles } from "@shared/schema";
import { enqueueAutoTag } from "./mediaAutoTagService";
import { isSafeImageUrl } from "../utils/safeImageUrl";

export interface SaveGeneratedImageInput {
  imageUrl: string;
  thumbnailUrl?: string | null;
  prompt: string;
  model?: string | null;
  folderId?: string | null;
  userId: string;
}

/**
 * Persist an AI-generated image (already uploaded to our storage by the
 * nano-banana service) into the media library, so it becomes browseable,
 * insertable, auto-tagged (Phase 2) and semantically indexed (Phase 3). The
 * prompt seeds the title/description; vision auto-tagging then fills the rest.
 */
export async function saveGeneratedImage(
  input: SaveGeneratedImageInput,
): Promise<{ id: string; url: string; proxyUrl: string }> {
  // Best-effort: fetch the bytes once to record real size + dimensions so the
  // card doesn't show "0 Bytes". A failure here must not block the save.
  let width: number | undefined;
  let height: number | undefined;
  let size = 0;
  let mimeType = "image/png";
  try {
    if (!isSafeImageUrl(input.imageUrl)) throw new Error("unsafe image url — skipped (audit #3)");
    const resp = await fetch(input.imageUrl, { redirect: "error" }); // no redirect past the allowlist check
    if (resp.ok) {
      const buf = Buffer.from(await resp.arrayBuffer());
      size = buf.length;
      mimeType = resp.headers.get("content-type")?.split(";")[0] || mimeType;
      const meta = await sharp(buf).metadata();
      width = meta.width;
      height = meta.height;
    }
  } catch {
    /* keep defaults */
  }

  const title = input.prompt.trim().slice(0, 120) || "صورة مولّدة بالذكاء";
  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";

  const [row] = await db
    .insert(mediaFiles)
    .values({
      fileName: `ai-${randomUUID()}.${ext}`,
      originalName: title,
      folderId: input.folderId || null,
      url: input.imageUrl,
      thumbnailUrl: input.thumbnailUrl || null,
      type: "image",
      mimeType,
      size,
      width,
      height,
      title,
      description: input.prompt.trim() || null,
      isAiGenerated: true,
      aiGenerationModel: input.model || "gemini-3-pro-image-preview",
      aiGenerationPrompt: input.prompt,
      category: "مولّدة",
      uploadedBy: input.userId,
      aiAnalysisStatus: "pending",
    })
    .returning({ id: mediaFiles.id, url: mediaFiles.url });

  // Vision auto-tagging (Phase 2) — which also generates the semantic embedding
  // (Phase 3) on completion. Fire-and-forget; never blocks the save response.
  enqueueAutoTag(row.id);

  const displayUrl = row.url.startsWith("https://") ? row.url : `/api/media/proxy/${row.id}`;
  return { id: row.id, url: displayUrl, proxyUrl: `/api/media/proxy/${row.id}` };
}
