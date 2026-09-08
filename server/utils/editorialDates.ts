/**
 * Editorial dates are kept separately from the persistence timestamp.
 * `updatedAt` is an optimistic/concurrency timestamp and changes for every
 * write, including cache and workflow maintenance. `editorialModifiedAt`
 * records a meaningful change to published copy or its public presentation.
 *
 * The value lives in the existing seo_metadata JSON column to avoid a schema
 * migration. It is deliberately additive and preserves all existing keys.
 */

export type EditorialMetadata = Record<string, unknown> & {
  editorialModifiedAt?: string;
};

export const MEANINGFUL_FIELDS = new Set([
  "title",
  "content",
  "excerpt",
  "subtitle",
  "articleType",
  "categoryId",
  "reporterId",
  "authorId",
  "source",
  "sourceUrl",
  "imageUrl",
  "thumbnailUrl",
  "imageFocalPoint",
  "isAiGeneratedImage",
  "videoUrl",
  "videoThumbnailUrl",
  "isVideoTemplate",
  "seo",
  "newsletterSubtitle",
  "newsletterExcerpt",
]);

function stableValue(value: unknown): string {
  const normalize = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(normalize);
    if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map(key => [key, normalize((v as Record<string, unknown>)[key])]));
    return v;
  };
  return JSON.stringify(normalize(value));
}

export function hasMeaningfulEditorialChange(
  patch: Record<string, unknown>,
  existing?: Record<string, unknown>,
): boolean {
  return Object.keys(patch).some((key) =>
    patch[key] !== undefined && MEANINGFUL_FIELDS.has(key) && (!existing || stableValue(patch[key]) !== stableValue(existing[key])),
  );
}

export function markEditorialModification(
  existing: unknown,
  patch: Record<string, unknown>,
  at: Date = new Date(),
): EditorialMetadata | undefined {
  if (!hasMeaningfulEditorialChange(patch)) return undefined;
  const base: EditorialMetadata =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  base.editorialModifiedAt = at.toISOString();
  return base;
}

export function getEditorialModifiedAt(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).editorialModifiedAt;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** Return a public update date only for a meaningful change after publication. */
export function getPublicEditorialModifiedAt(
  publishedAt: Date | string | null | undefined,
  metadata: unknown,
): string | null {
  const modified = getEditorialModifiedAt(metadata);
  if (!modified || !publishedAt) return null;
  const publishedMs = new Date(publishedAt).getTime();
  return Number.isNaN(publishedMs) || Date.parse(modified) <= publishedMs ? null : modified;
}
