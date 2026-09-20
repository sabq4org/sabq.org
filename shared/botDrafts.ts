// ----------------------------------------------------------------------------
// عقد «مسودات البوتات» — Bot Drafts API (shared between server, tests, client)
//
// المسار: /api/internal/bot-drafts — مسودات عربية فقط، لا نشر ولا جدولة.
// المستهلكون: بوت «نشر سبق»، مهندّس (Grok Bot)، وأي وكيل يحمل توكن مسودات.
// التوثيق الكامل: docs/systems/editorial/BOT_DRAFTS_API.md
// ----------------------------------------------------------------------------

import { z } from "zod";

export const BOT_DRAFTS_BASE_PATH = "/api/internal/bot-drafts";

/** القيمة الوحيدة المسموح بها لحالة المادة عبر هذا العقد. */
export const BOT_DRAFT_STATUS = "draft" as const;

/** قيمة `articles.source` لكل مادة أنشأها بوت عبر هذا العقد. */
export const BOT_DRAFT_SOURCE = "bot" as const;

/**
 * حقول يُرفض وجودها في أي طلب من البوت (422 `forbidden_fields`).
 * تغييرها من اختصاص المحررين عبر لوحة التحكم فقط — أي مسار نشر/جدولة/إسناد.
 */
export const BOT_DRAFT_FORBIDDEN_FIELDS = [
  "status",
  "publishType",
  "scheduledAt",
  "publishedAt",
  "reviewStatus",
  "reviewedBy",
  "reviewedAt",
  "reviewNotes",
  "authorId",
  "submitterId",
  "reporterId",
  "opinionAuthorId",
  "publisherId",
  "isPublisherNews",
  "isPublisherContent",
  "newsType",
  "isFeatured",
  "isReading",
  "hideFromHomepage",
  "displayOrder",
  "slug",
  "englishSlug",
  "articleType",
  "source",
  "sourceMetadata",
  "aiGenerated",
  "submitForReview",
  "confirmStatusDowngrade",
] as const;

export type BotDraftForbiddenField = (typeof BOT_DRAFT_FORBIDDEN_FIELDS)[number];

/** يعيد أسماء الحقول الممنوعة الموجودة في الجسم (مصفوفة فارغة = آمن). */
export function findForbiddenBotDraftFields(body: unknown): BotDraftForbiddenField[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const keys = new Set(Object.keys(body as Record<string, unknown>));
  return BOT_DRAFT_FORBIDDEN_FIELDS.filter((field) => keys.has(field));
}

const httpsUrl = z
  .string()
  .trim()
  .max(2000, "الرابط طويل جداً")
  .url("رابط غير صالح")
  .refine((value) => value.startsWith("https://"), { message: "يجب أن يبدأ الرابط بـ https://" });

const webUrl = z
  .string()
  .trim()
  .max(2000, "الرابط طويل جداً")
  .url("رابط غير صالح")
  .refine((value) => /^https?:\/\//.test(value), { message: "يجب أن يبدأ الرابط بـ http(s)://" });

const title = z.string().trim().min(3, "العنوان قصير جداً").max(300, "العنوان يتجاوز 300 حرف");
const subtitle = z.string().trim().max(300, "العنوان الفرعي يتجاوز 300 حرف").nullable();
const content = z.string().trim().min(20, "المتن قصير جداً").max(300_000, "المتن يتجاوز الحد المسموح");
const contentFormat = z.enum(["html", "text"]);
const excerpt = z.string().trim().max(1000, "المقدمة تتجاوز 1000 حرف").nullable();
const categoryId = z.string().trim().min(1).max(64);
const categorySlug = z.string().trim().min(1).max(150);
const imageUrl = httpsUrl.nullable();
const keywords = z.array(z.string().trim().min(1).max(60)).max(20, "الحد الأقصى 20 كلمة مفتاحية");
const sourceUrl = webUrl.nullable();
const clientReference = z.string().trim().min(1).max(120);
const notes = z.string().trim().max(2000, "الملاحظات تتجاوز 2000 حرف").nullable();

/** POST /api/internal/bot-drafts */
export const botDraftCreateSchema = z
  .object({
    title,
    content,
    contentFormat: contentFormat.optional(),
    subtitle: subtitle.optional(),
    excerpt: excerpt.optional(),
    categoryId: categoryId.optional(),
    categorySlug: categorySlug.optional(),
    imageUrl: imageUrl.optional(),
    keywords: keywords.optional(),
    sourceUrl: sourceUrl.optional(),
    clientReference: clientReference.optional(),
    notes: notes.optional(),
  })
  .strict();

/** PATCH /api/internal/bot-drafts/:id — كل الحقول اختيارية، واحد على الأقل. */
export const botDraftUpdateSchema = z
  .object({
    title: title.optional(),
    content: content.optional(),
    contentFormat: contentFormat.optional(),
    subtitle: subtitle.optional(),
    excerpt: excerpt.optional(),
    categoryId: categoryId.optional(),
    categorySlug: categorySlug.optional(),
    imageUrl: imageUrl.optional(),
    keywords: keywords.optional(),
    sourceUrl: sourceUrl.optional(),
    clientReference: clientReference.optional(),
    notes: notes.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "لا توجد حقول للتحديث" });

export type BotDraftCreateInput = z.infer<typeof botDraftCreateSchema>;
export type BotDraftUpdateInput = z.infer<typeof botDraftUpdateSchema>;

/** شكل الاستجابة الموحد لكل مسارات المسودات. */
export interface BotDraftResponse {
  id: string;
  /** حالة المادة الحالية في اللوحة. البوت لا يستطيع تغييرها. */
  status: string;
  /** `true` فقط عندما تكون المادة مسودة ويمكن للبوت تحديثها. */
  updatable: boolean;
  title: string;
  subtitle: string | null;
  slug: string;
  excerpt: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  keywords: string[];
  source: string;
  /** اسم البوت الذي أنشأ المادة (من التوكن). */
  bot: string | null;
  clientReference: string | null;
  notes: string | null;
  /** رابط التحرير الداخلي في لوحة التحكم. */
  editUrl: string;
  /** رابط المعاينة الداخلية (يتطلب جلسة محرر). */
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
}

/** أكواد الأخطاء التي قد يرجعها العقد (تفاصيلها في التوثيق). */
export const BOT_DRAFT_ERROR_CODES = [
  "not_configured",
  "unauthorized",
  "forbidden_fields",
  "validation_error",
  "category_not_found",
  "author_not_configured",
  "not_found",
  "not_a_draft",
  "locked_by_editor",
  "forbidden_action",
  "rate_limited",
  "server_error",
] as const;

export type BotDraftErrorCode = (typeof BOT_DRAFT_ERROR_CODES)[number];

export interface BotDraftErrorBody {
  code: BotDraftErrorCode;
  message: string;
  details?: unknown;
}
