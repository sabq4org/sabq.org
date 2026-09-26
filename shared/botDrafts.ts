// ----------------------------------------------------------------------------
// عقد «مسودات البوتات» — Bot Drafts API (shared between server, tests, client)
//
// المسار: /api/internal/bot-drafts — مسودات عربية، ثم نشر فوري أو جدولة
// بمسارين صريحين. جسم الإنشاء/التحديث لا يكتب الحالة.
// المستهلكون: بوت «نشر سبق»، مهندّس (Grok Bot)، وأي وكيل يحمل توكن مسودات.
// التوثيق الكامل: docs/systems/editorial/BOT_DRAFTS_API.md
// ----------------------------------------------------------------------------

import { z } from "zod";

export const BOT_DRAFTS_BASE_PATH = "/api/internal/bot-drafts";

/** رفع صورة غلاف للمسودة — نفس توكنات Bot Drafts، بلا نشر. */
export const BOT_DRAFTS_IMAGES_PATH = `${BOT_DRAFTS_BASE_PATH}/images`;

/** اسم حقل multipart الذي يقبله مسار الرفع. */
export const BOT_DRAFTS_IMAGE_FIELD = "file";

/** سقف الملف — نفس حد مسار الوسائط التحريري `/api/media/upload`. */
export const BOT_DRAFTS_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** الغرض الممرَّر إلى `newsImageStorageService` مع `forceR2` → sabq-news-images / media.sabq.org. */
export const BOT_DRAFTS_IMAGE_PURPOSE = "bot-article-image";

/** أقصى عدد صور تُلحَق بمتن المسودة في طلب واحد (`imageUrls`). */
export const BOT_DRAFT_BODY_IMAGE_LIMIT = 20;

export const BOT_DRAFTS_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** الحالة الوحيدة التي يُنشئها البوت ويُسمح له بتعديل محتواها. */
export const BOT_DRAFT_STATUS = "draft" as const;

/**
 * حالة تحريرية بعد اعتماد المحرر في المحادثة: المادة في طابور الوردية.
 * البوت يعلّمها عبر `PATCH /:id/ready` فقط، ولا ينشرها ولا يعدّل محتواها بعدها.
 * العمود `articles.status` نصّي (ليس enum في Postgres) فلا يحتاج ترحيل مخطط.
 */
export const BOT_DRAFT_READY_STATUS = "ready_to_publish" as const;

/** جسم `PATCH /:id/ready` فارغ عمداً — المسار يغيّر الحالة ولا يقبل محتوى. */
export const botDraftReadySchema = z.object({}).strict();

/** قيمة `articles.source` لكل مادة أنشأها بوت عبر هذا العقد. */
export const BOT_DRAFT_SOURCE = "bot" as const;

/**
 * الحالات التي يجوز للبوت أن ينشرها أو يجدولها.
 * `draft` قبل الاعتماد، و`ready_to_publish` بعده. ما عدا ذلك `409 not_a_draft`.
 */
export const BOT_DRAFT_PUBLISHABLE_STATUSES = [BOT_DRAFT_STATUS, BOT_DRAFT_READY_STATUS] as const;

export function isBotDraftPublishableStatus(status: string | null | undefined): boolean {
  return status === BOT_DRAFT_STATUS || status === BOT_DRAFT_READY_STATUS;
}

/**
 * حقول يُرفض وجودها في جسم الإنشاء والتحديث والنشر والجدولة والأرشفة وإلغاء الجدولة
 * (422 `forbidden_fields`). الحالة والموعد يضبطهما الخادم، والإسناد ممنوع دائماً.
 * الاستثناء الوحيد: `PATCH /:id/visibility` يسمح بـ `isFeatured` و`newsType` و`hideFromHomepage`.
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
const imageUrls = z
  .array(httpsUrl)
  .max(BOT_DRAFT_BODY_IMAGE_LIMIT, `الحد الأقصى ${BOT_DRAFT_BODY_IMAGE_LIMIT} صورة في المتن`);
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
    imageUrls: imageUrls.optional(),
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
    imageUrls: imageUrls.optional(),
    keywords: keywords.optional(),
    sourceUrl: sourceUrl.optional(),
    clientReference: clientReference.optional(),
    notes: notes.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "لا توجد حقول للتحديث" });

/** POST /api/internal/bot-drafts/:id/publish — جسم فارغ. الحالة يكتبها الخادم. */
export const botDraftPublishSchema = z.object({}).strict();

/**
 * POST /api/internal/bot-drafts/:id/archive — أرشفة ناعمة لمادة منشورة.
 * `reason` اختياري ويُحفظ في `reviewNotes` مثل سبب أرشفة اللوحة. لا حذف من القاعدة.
 */
export const botDraftArchiveSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(1000, "سبب الأرشفة يتجاوز 1000 حرف")
      .optional(),
  })
  .strict();

/** DELETE /api/internal/bot-drafts/:id/schedule — جسم فارغ. يعيد المسودة ولا يحذف الصف. */
export const botDraftUnscheduleSchema = z.object({}).strict();

/**
 * PATCH /api/internal/bot-drafts/:id/visibility.
 * نفس أعمدة محرر اللوحة: `isFeatured` (مميز)، `newsType` (`breaking` عاجل أو `regular`)،
 * `hideFromHomepage` (إخفاء من الرئيسية مع بقاء الرابط). حقل واحد على الأقل.
 */
export const botDraftVisibilitySchema = z
  .object({
    isFeatured: z.boolean().optional(),
    newsType: z.enum(["breaking", "regular"], {
      message: "newsType يجب أن يكون breaking أو regular — التمييز يُضبط عبر isFeatured",
    }).optional(),
    hideFromHomepage: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.isFeatured !== undefined || value.newsType !== undefined || value.hideFromHomepage !== undefined,
    { message: "أرسل حقلاً واحداً على الأقل: isFeatured أو newsType أو hideFromHomepage" },
  );

/** حقول الظهور المسموحة في مسار visibility رغم وجودها في قائمة المنع العامة. */
export const BOT_DRAFT_VISIBILITY_FIELDS = ["isFeatured", "newsType", "hideFromHomepage"] as const;

/**
 * POST /api/internal/bot-drafts/:id/schedule.
 * `publishAt` وقت ISO-8601 بمنطقة زمنية. وقت الرياض يُرسل `+03:00` أو ما يعادله UTC.
 * الماضي والفوري بلا إزاحة يُرفضان في `parseBotDraftPublishAt`.
 */
export const botDraftScheduleSchema = z
  .object({
    publishAt: z.string().trim().min(1, "publishAt مطلوب"),
  })
  .strict();

export type BotDraftCreateInput = z.infer<typeof botDraftCreateSchema>;
export type BotDraftUpdateInput = z.infer<typeof botDraftUpdateSchema>;
export type BotDraftScheduleInput = z.infer<typeof botDraftScheduleSchema>;
export type BotDraftArchiveInput = z.infer<typeof botDraftArchiveSchema>;
export type BotDraftVisibilityInput = z.infer<typeof botDraftVisibilitySchema>;

/** مثال موثّق للبوت: جدار الرياض يُرسل بإزاحة +03:00 لا كوقت عارٍ. */
export const BOT_DRAFT_PUBLISH_AT_HINT =
  "أرسل وقت الرياض بإزاحة +03:00 (مثال 2026-09-24T18:30:00+03:00) أو ما يعادله بتوقيت UTC (…Z). الوقت بلا منطقة زمنية مرفوض حتى لا يُفسَّر كتوقيت الخادم.";

const TIMEZONE_AWARE_ISO =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export type BotDraftPublishAtResult =
  | { ok: true; publishAt: Date }
  | { ok: false; message: string; details?: { publishAt?: string; now: string } };

/**
 * يقبل طابعاً زمنياً مستقبلياً بمنطقة زمنية فقط.
 * `<= now` مرفوض (400 عند الاستدعاء). الوقت بلا `Z` أو `±hh:mm` مرفوض.
 */
export function parseBotDraftPublishAt(value: string, now: Date = new Date()): BotDraftPublishAtResult {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!TIMEZONE_AWARE_ISO.test(trimmed)) {
    return {
      ok: false,
      message: `publishAt يجب أن يكون ISO-8601 مع منطقة زمنية. ${BOT_DRAFT_PUBLISH_AT_HINT}`,
      details: { now: now.toISOString() },
    };
  }
  const publishAt = new Date(trimmed);
  if (Number.isNaN(publishAt.getTime())) {
    return { ok: false, message: "publishAt تاريخ غير صالح", details: { now: now.toISOString() } };
  }
  if (publishAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      message: `موعد النشر في الماضي أو اللحظة الحالية. ${BOT_DRAFT_PUBLISH_AT_HINT}`,
      details: { publishAt: publishAt.toISOString(), now: now.toISOString() },
    };
  }
  return { ok: true, publishAt };
}

/** شكل الاستجابة الموحد لكل مسارات المسودات. */
export interface BotDraftResponse {
  id: string;
  /**
   * حالة المادة في اللوحة: `draft`، `ready_to_publish`، `published`، `scheduled`، `archived`.
   * النشر والجدولة من البوت يكتبان `published` أو `scheduled` عبر مساريهما لا عبر الجسم.
   */
  status: string;
  /**
   * `true` فقط عندما تكون المادة `draft`.
   * بعد الجاهزية أو النشر أو الجدولة أو الأرشفة تصبح `false`.
   * إلغاء الجدولة يعيدها `draft` فتعود `true`.
   */
  updatable: boolean;
  title: string;
  subtitle: string | null;
  slug: string;
  excerpt: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  imageUrl: string | null;
  /**
   * روابط صور المتن بالترتيب (وسوم `img`)، بلا نص المقال.
   * الغلاف `imageUrl` لا يُنسخ إلى هنا إلا إذا وُضع أيضاً داخل المتن.
   */
  bodyImageUrls: string[];
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
  /**
   * الرابط العام للقرّاء: `{أصل الموقع}/article/{englishSlug}`.
   * يُفضَّل `englishSlug` لأن الرابط العربي يُحوَّل 301 إليه.
   * يظهر أيضاً قبل النشر؛ الصفحة العامة لا تعرض المادة إلا عندما تصبح `published`.
   * أثناء `scheduled` نفس الرابط يُفتح عند حلول الموعد عبر ناشر المواد المجدولة.
   */
  publicUrl: string | null;
  /** وقت النشر الفعلي، أو null قبل أن تُنشر المادة. */
  publishedAt: string | null;
  /** موعد الجدولة المخزّن، أو null إن لم تُجدول. */
  scheduledAt: string | null;
  /** مميز في اللوحة والرئيسية. نفس عمود `articles.isFeatured`. */
  isFeatured: boolean;
  /** `breaking` خبر عاجل، وإلا `regular`. نفس عمود `articles.newsType`. */
  newsType: string;
  /** مخفي من الرئيسية ويبقى على رابطه المباشر. نفس عمود `articles.hideFromHomepage`. */
  hideFromHomepage: boolean;
  createdAt: string;
  updatedAt: string;
}

/** رد `POST /api/internal/bot-drafts/images` — `deliveryUrl` يصلح غلافاً (`imageUrl`) أو صورة متن (`imageUrls`). */
export interface BotDraftImageUploadResponse {
  deliveryUrl: string;
  imageId: string | null;
  filename: string;
  provider: string | null;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  purpose: typeof BOT_DRAFTS_IMAGE_PURPOSE;
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
  "not_published",
  "not_scheduled",
  "locked_by_editor",
  "license_required",
  "forbidden_action",
  "rate_limited",
  "invalid_image",
  "file_too_large",
  "storage_unavailable",
  "upload_failed",
  "server_error",
] as const;

export type BotDraftErrorCode = (typeof BOT_DRAFT_ERROR_CODES)[number];

export interface BotDraftErrorBody {
  code: BotDraftErrorCode;
  message: string;
  details?: unknown;
}
