/**
 * Request contract for POST /api/seo/generate.
 *
 * The endpoint takes `mode: "saved"` (an article already in the DB) or
 * `mode: "draft"` (title + content only, nothing saved). The Arabic editor
 * sends `mode`; the English and Urdu editors were written before `mode`
 * existed and send only `{ articleId, language }`, which the discriminated
 * union rejected with "Invalid discriminator value. Expected 'saved' | 'draft'".
 *
 * A body with an `articleId` and no `mode` is therefore read as `saved`, so
 * older editors and installed clients keep working without a client update.
 */
import { z } from "zod";

const language = z.enum(["ar", "en", "ur"]).default("ar");

const seoGenerateUnion = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("saved"),
    articleId: z.string().min(1),
    language,
  }),
  z.object({
    mode: z.literal("draft"),
    draftData: z.object({
      title: z.string().min(10, "العنوان يجب أن يكون 10 أحرف على الأقل").max(200, "العنوان يجب أن يكون أقل من 200 حرف"),
      content: z.string().min(100, "المحتوى يجب أن يكون 100 حرف على الأقل"),
      excerpt: z.string().optional(),
    }),
    language,
  }),
]);

export function normalizeSeoGenerateBody(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as Record<string, unknown>;
  if (b.mode !== undefined) return body;
  if (typeof b.articleId === "string" && b.articleId) return { ...b, mode: "saved" };
  if (b.draftData && typeof b.draftData === "object") return { ...b, mode: "draft" };
  return body;
}

export const seoGenerateSchema = z.preprocess(normalizeSeoGenerateBody, seoGenerateUnion);
export type SeoGenerateRequest = z.infer<typeof seoGenerateUnion>;

/**
 * Pure: new SEO bookkeeping wins, every other existing key is kept.
 * en_articles.seoMetadata also holds `sourceArticleId` (link to the Arabic
 * original); replacing the object on SEO generation cut that link.
 */
export function mergeSeoMetadata<T extends Record<string, unknown>>(
  existing: unknown,
  next: T,
): Record<string, unknown> & T {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...next };
}
