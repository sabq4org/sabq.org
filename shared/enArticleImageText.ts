/**
 * Hero-image caption and alt text for English articles.
 *
 * `article_media_assets` references the Arabic `articles` table, so an English
 * row cannot own a media asset. The English editor stores both strings inside
 * `en_articles.seo` (jsonb, no DDL): `imageCaption` and `imageAltText`.
 * One reader for the dashboard, the public page and the crawler payload, so the
 * three never disagree on the fallback.
 */

export const EN_IMAGE_CAPTION_MAX = 300;
export const EN_IMAGE_ALT_MAX = 125;

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function getEnHeroImageText(
  seo: unknown,
  title: string | null | undefined,
): { caption: string | null; alt: string } {
  const data = seo && typeof seo === "object" ? (seo as Record<string, unknown>) : {};
  const caption = clean(data.imageCaption, EN_IMAGE_CAPTION_MAX);
  // Alt falls back to the caption (it describes the photo) before the headline.
  const alt = clean(data.imageAltText, EN_IMAGE_ALT_MAX) || caption.slice(0, EN_IMAGE_ALT_MAX) || (title || "").trim();
  return { caption: caption || null, alt };
}

/** Values the editor writes into `seo`; empty strings are dropped, not stored. */
export function buildEnHeroImageSeoFields(input: {
  imageCaption?: string | null;
  imageAltText?: string | null;
}): { imageCaption?: string; imageAltText?: string } {
  const caption = clean(input.imageCaption, EN_IMAGE_CAPTION_MAX);
  const alt = clean(input.imageAltText, EN_IMAGE_ALT_MAX);
  return {
    ...(caption ? { imageCaption: caption } : {}),
    ...(alt ? { imageAltText: alt } : {}),
  };
}

/**
 * For writers that replace the whole `seo` object (AI SEO generation): carry the
 * editor-written caption and alt text over from the stored value.
 */
export function mergeEnHeroImageText<T extends object>(nextSeo: T, currentSeo: unknown): T {
  const current = currentSeo && typeof currentSeo === "object" ? (currentSeo as Record<string, unknown>) : {};
  const kept = buildEnHeroImageSeoFields({
    imageCaption: typeof current.imageCaption === "string" ? current.imageCaption : null,
    imageAltText: typeof current.imageAltText === "string" ? current.imageAltText : null,
  });
  // The editor's alt text wins over a generated one; without one the generated alt stays.
  return { ...nextSeo, ...kept };
}
