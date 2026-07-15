import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { mediaFiles, articleMediaAssets } from "@shared/schema";
import { resolveMediaIdByUrl } from "./mediaUsageService";
import { enqueueAutoTag } from "./mediaAutoTagService";

/**
 * Governance snapshot for one media file — what the editor needs to decide
 * (or be warned) before publishing: rights documentation, alt text, quality,
 * and the sensitive-content flag.
 */
export interface MediaGovernanceInfo {
  id: string;
  altText: string | null;
  licenseType: string | null;
  creditText: string | null;
  copyrightHolder: string | null;
  rightsVerified: boolean;
  aiQualityScore: number | null;
  aiHasSensitiveContent: boolean;
}

export async function getMediaGovernance(mediaId: string): Promise<MediaGovernanceInfo | null> {
  const [row] = await db
    .select({
      id: mediaFiles.id,
      altText: mediaFiles.altText,
      licenseType: mediaFiles.licenseType,
      creditText: mediaFiles.creditText,
      copyrightHolder: mediaFiles.copyrightHolder,
      rightsVerified: mediaFiles.rightsVerified,
      aiQualityScore: mediaFiles.aiQualityScore,
      aiHasSensitiveContent: mediaFiles.aiHasSensitiveContent,
    })
    .from(mediaFiles)
    .where(eq(mediaFiles.id, mediaId))
    .limit(1);
  if (!row) return null;
  return { ...row, rightsVerified: !!row.rightsVerified, aiHasSensitiveContent: !!row.aiHasSensitiveContent };
}

/**
 * Publish-time safety net: make sure the published article's hero image ships
 * with an alt text. If the hero media asset (displayOrder 0, ar) has no alt
 * text — or doesn't exist — fill it from the media library's AI-generated alt
 * text. Never overwrites editor-authored text (only empty/missing is filled),
 * and never throws: a failure here must not affect publishing. If the library
 * row itself has no alt text yet, the file is pushed into the AI pipeline so
 * the next publish/update fills it.
 */
export async function ensureHeroAltText(opts: {
  articleId: string;
  imageUrl: string | null | undefined;
}): Promise<void> {
  const { articleId, imageUrl } = opts;
  if (!articleId || !imageUrl) return;

  try {
    const mediaId = await resolveMediaIdByUrl(imageUrl);
    if (!mediaId) return;

    const [media] = await db
      .select({ id: mediaFiles.id, altText: mediaFiles.altText })
      .from(mediaFiles)
      .where(eq(mediaFiles.id, mediaId))
      .limit(1);
    if (!media) return;

    const [asset] = await db
      .select({ id: articleMediaAssets.id, altText: articleMediaAssets.altText })
      .from(articleMediaAssets)
      .where(and(
        eq(articleMediaAssets.articleId, articleId),
        eq(articleMediaAssets.displayOrder, 0),
        eq(articleMediaAssets.locale, "ar"),
      ))
      .limit(1);

    if (asset?.altText?.trim()) return; // editor already wrote one — never clobber

    if (!media.altText?.trim()) {
      // No AI alt text yet either — analyze now so the next save fills it.
      enqueueAutoTag(mediaId);
      return;
    }

    if (asset) {
      await db
        .update(articleMediaAssets)
        .set({ altText: media.altText, updatedAt: new Date() })
        .where(eq(articleMediaAssets.id, asset.id));
    } else {
      await db.insert(articleMediaAssets).values({
        articleId,
        mediaFileId: mediaId,
        locale: "ar",
        displayOrder: 0,
        altText: media.altText,
      });
    }
    console.log(`[Media Governance] auto-filled hero alt text for article ${articleId}`);
  } catch (error: any) {
    console.warn("[Media Governance] ensureHeroAltText failed:", articleId, error?.message || error);
  }
}
