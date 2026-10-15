// ----------------------------------------------------------------------------
// بوت النشر على X — Bot Social API
//
// POST /api/internal/bot-social/suggest     توليد نص (لا ينشر)
// POST /api/internal/bot-social/preview     نص نهائي + رابط + صورة + طول
// POST /api/internal/bot-social/publish     نشر فوري (idempotent عبر clientReference)
// POST /api/internal/bot-social/schedule    جدولة
// POST /api/internal/bot-social/cancel      إلغاء المجدول
// GET  /api/internal/bot-social/resolve     حل رابط خبر عربي إلى articles.id
// GET  /api/internal/bot-social/posts       أحدث منشورات هذا البوت
// GET  /api/internal/bot-social/posts/:id   حالة منشور
//
// المصادقة: Bearer من SABQ_BOT_SOCIAL_TOKEN أو BOT_SOCIAL_API_TOKENS.
// توكن مسودات البوت (BOT_DRAFTS_API_TOKENS) لا ينشر تغريدات.
// المسار تحت /api/internal/* معفى من CSRF ومن محدد الكتابة العام.
// التوثيق: docs/systems/social-publishing/BOT_SOCIAL_API.md
// ----------------------------------------------------------------------------

import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import {
  BOT_SOCIAL_BASE_PATH,
  BOT_SOCIAL_IMAGE_FIELD,
  BOT_SOCIAL_IMAGE_MAX_BYTES,
  BOT_SOCIAL_IMAGE_MIME_TYPES,
  BOT_SOCIAL_IMAGE_PURPOSE,
  BOT_SOCIAL_IMAGES_PATH,
  botSocialCancelSchema,
  botSocialListQuerySchema,
  botSocialPreviewSchema,
  botSocialPublishSchema,
  botSocialResolveQuerySchema,
  botSocialScheduleSchema,
  botSocialSuggestSchema,
  type BotSocialErrorBody,
} from "@shared/botSocial";
import {
  BotSocialError,
  authenticateBotSocialToken,
  isBotSocialConfigured,
  type BotSocialIdentity,
} from "../services/socialPublishing/botSocialLogic";
import {
  cancelBotSocialPost,
  getBotSocialPost,
  listBotSocialPosts,
  previewBotSocialPost,
  publishBotSocialPost,
  resolveBotSocialArticleUrl,
  scheduleBotSocialPost,
  suggestBotSocialPost,
} from "../services/socialPublishing/botSocialService";
import { isNewsImageR2DeliveryUrl, newsImageStorageService } from "../services/newsImageStorageService";
import { verifyImageMagicBytes } from "../utils/imageVerify";

const router = Router();

type BotRequest = Request & { bot?: BotSocialIdentity };

function errorBody(error: BotSocialError): BotSocialErrorBody {
  const details = error.details;
  if (details && typeof details === "object" && details !== null && "post" in details && Object.keys(details).length === 1) {
    return { code: error.code, message: error.message, post: (details as { post: unknown }).post };
  }
  return { code: error.code, message: error.message, ...(details !== undefined ? { details } : {}) };
}

function sendError(res: Response, status: number, body: BotSocialErrorBody): void {
  res.status(status).json(body);
}

function requireBotToken(req: BotRequest, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!isBotSocialConfigured()) {
    return sendError(res, 503, { code: "not_configured", message: "واجهة نشر البوت على X غير مفعّلة على هذا الخادم" });
  }
  const bot = authenticateBotSocialToken(req.headers.authorization);
  if (!bot) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="sabq-bot-social"');
    return sendError(res, 401, { code: "unauthorized", message: "توكن غير صالح أو مفقود" });
  }
  req.bot = bot;
  next();
}

const botWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: () => Number(process.env.BOT_SOCIAL_WRITE_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => `bot-social:${(req as BotRequest).bot?.name ?? "anonymous"}`,
  skip: (req) => req.method === "GET" || req.method === "HEAD",
  handler: (_req, res) =>
    sendError(res, 429, { code: "rate_limited", message: "تجاوزت حد الكتابة للدقيقة — أعد المحاولة بعد قليل" }),
});

const botPublishLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: () => Number(process.env.BOT_SOCIAL_PUBLISH_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => `bot-social-publish:${(req as BotRequest).bot?.name ?? "anonymous"}`,
  handler: (_req, res) =>
    sendError(res, 429, { code: "rate_limited", message: "محاولات نشر كثيرة خلال فترة قصيرة؛ انتظر قليلاً" }),
});

const botSuggestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: () => Number(process.env.BOT_SOCIAL_SUGGEST_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => `bot-social-suggest:${(req as BotRequest).bot?.name ?? "anonymous"}`,
  handler: (_req, res) =>
    sendError(res, 429, { code: "rate_limited", message: "وصلت حد توليد الاقتراحات مؤقتاً؛ حاول بعد دقائق" }),
});

function handleError(res: Response, error: unknown, action: string): void {
  if (error instanceof BotSocialError) {
    return sendError(res, error.httpStatus, errorBody(error));
  }
  console.error(`[BotSocial] ${action} failed:`, error);
  sendError(res, 500, { code: "server_error", message: "خطأ داخلي" });
}

function requestContext(req: Request) {
  return { ip: req.ip, userAgent: req.get("user-agent") };
}

const botSocialImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BOT_SOCIAL_IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((BOT_SOCIAL_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype.toLowerCase())) {
      cb(null, true);
      return;
    }
    cb(new Error("نوع الملف غير مسموح. الأنواع المسموحة: JPEG, PNG, WEBP, GIF"));
  },
});

function parseBotSocialImageUpload(req: Request, res: Response, next: NextFunction) {
  botSocialImageUpload.single(BOT_SOCIAL_IMAGE_FIELD)(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return sendError(res, 400, { code: "file_too_large", message: "الملف كبير جداً. الحد الأقصى 10MB" });
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_UNEXPECTED_FILE") {
      return sendError(res, 400, {
        code: "validation_error",
        message: `اسم الحقل يجب أن يكون ${BOT_SOCIAL_IMAGE_FIELD}`,
      });
    }
    const message = error instanceof Error ? error.message : "تعذّر قراءة الملف المرفوع";
    return sendError(res, 400, { code: "invalid_image", message });
  });
}

async function isAllowedBotSocialImage(buffer: Buffer, claimedMime: string): Promise<boolean> {
  const mime = claimedMime.toLowerCase();
  if (mime === "image/gif") {
    const header = buffer.subarray(0, 6).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  }
  const verify = await verifyImageMagicBytes(buffer, mime);
  return verify.ok;
}

router.post(
  BOT_SOCIAL_IMAGES_PATH,
  requireBotToken,
  botWriteLimiter,
  parseBotSocialImageUpload,
  async (req: BotRequest, res: Response) => {
    const file = req.file;
    if (!file) {
      return sendError(res, 400, {
        code: "validation_error",
        message: `لم يتم اختيار ملف. الحقل المطلوب: ${BOT_SOCIAL_IMAGE_FIELD}`,
      });
    }
    const allowed = await isAllowedBotSocialImage(file.buffer, file.mimetype);
    if (!allowed) {
      return sendError(res, 400, {
        code: "invalid_image",
        message: "الملف ليس صورة صالحة (JPEG/PNG/WEBP/GIF)",
      });
    }
    if (!newsImageStorageService.isR2Configured()) {
      return sendError(res, 503, {
        code: "storage_unavailable",
        message: "تخزين R2 لصور الأخبار غير متاح حالياً",
      });
    }
    const filename = (file.originalname || "image").replace(/[/\\]/g, "").slice(0, 180) || "image";
    try {
      const result = await newsImageStorageService.upload({
        buffer: file.buffer,
        filename,
        mimeType: file.mimetype,
        purpose: BOT_SOCIAL_IMAGE_PURPOSE,
        metadata: { source: "bot-social", bot: req.bot!.name },
        rolloutKey: `bot-social:${req.bot!.name}:${filename}:${file.size}`,
        forceR2: true,
      });
      if (!result.success || result.provider !== "r2" || !isNewsImageR2DeliveryUrl(result.deliveryUrl)) {
        return sendError(res, 502, { code: "upload_failed", message: "تعذّر رفع الصورة إلى R2" });
      }
      res.status(201).json({
        deliveryUrl: result.deliveryUrl,
        imageId: result.imageId ?? null,
        filename: result.filename ?? filename,
        provider: result.provider ?? null,
        purpose: BOT_SOCIAL_IMAGE_PURPOSE,
      });
    } catch (error) {
      handleError(res, error, "upload-image");
    }
  },
);

router.post(
  `${BOT_SOCIAL_BASE_PATH}/suggest`,
  requireBotToken,
  botWriteLimiter,
  botSuggestLimiter,
  async (req: BotRequest, res: Response) => {
    const parsed = botSocialSuggestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, { code: "validation_error", message: "بيانات التوليد غير صالحة", details: parsed.error.flatten() });
    }
    try {
      const suggestion = await suggestBotSocialPost(req.bot!, parsed.data, requestContext(req));
      res.json(suggestion);
    } catch (error) {
      handleError(res, error, "suggest");
    }
  },
);

router.post(
  `${BOT_SOCIAL_BASE_PATH}/preview`,
  requireBotToken,
  botWriteLimiter,
  async (req: BotRequest, res: Response) => {
    const parsed = botSocialPreviewSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, { code: "validation_error", message: "بيانات المعاينة غير صالحة", details: parsed.error.flatten() });
    }
    try {
      res.json(await previewBotSocialPost(parsed.data));
    } catch (error) {
      handleError(res, error, "preview");
    }
  },
);

router.post(
  `${BOT_SOCIAL_BASE_PATH}/publish`,
  requireBotToken,
  botWriteLimiter,
  botPublishLimiter,
  async (req: BotRequest, res: Response) => {
    const parsed = botSocialPublishSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, { code: "validation_error", message: "بيانات النشر غير صالحة", details: parsed.error.flatten() });
    }
    try {
      const result = await publishBotSocialPost(req.bot!, parsed.data, requestContext(req));
      res.json(result);
    } catch (error) {
      handleError(res, error, "publish");
    }
  },
);

router.post(
  `${BOT_SOCIAL_BASE_PATH}/schedule`,
  requireBotToken,
  botWriteLimiter,
  async (req: BotRequest, res: Response) => {
    const parsed = botSocialScheduleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, { code: "validation_error", message: "بيانات الجدولة غير صالحة", details: parsed.error.flatten() });
    }
    try {
      res.json(await scheduleBotSocialPost(req.bot!, parsed.data, requestContext(req)));
    } catch (error) {
      handleError(res, error, "schedule");
    }
  },
);

router.get(
  `${BOT_SOCIAL_BASE_PATH}/resolve`,
  requireBotToken,
  async (req: BotRequest, res: Response) => {
    const parsed = botSocialResolveQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 400, { code: "validation_error", message: "رابط الخبر مفقود أو غير صالح", details: parsed.error.flatten() });
    }
    try {
      res.json(await resolveBotSocialArticleUrl(parsed.data.url));
    } catch (error) {
      handleError(res, error, "resolve");
    }
  },
);

router.post(
  `${BOT_SOCIAL_BASE_PATH}/cancel`,
  requireBotToken,
  botWriteLimiter,
  async (req: BotRequest, res: Response) => {
    const parsed = botSocialCancelSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, { code: "validation_error", message: "بيانات الإلغاء غير صالحة", details: parsed.error.flatten() });
    }
    try {
      res.json(await cancelBotSocialPost(req.bot!, parsed.data, requestContext(req)));
    } catch (error) {
      handleError(res, error, "cancel");
    }
  },
);

router.get(
  `${BOT_SOCIAL_BASE_PATH}/posts`,
  requireBotToken,
  async (req: BotRequest, res: Response) => {
    const parsed = botSocialListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 400, { code: "validation_error", message: "استعلام القائمة غير صالح", details: parsed.error.flatten() });
    }
    try {
      res.json(await listBotSocialPosts(req.bot!, parsed.data));
    } catch (error) {
      handleError(res, error, "list");
    }
  },
);

router.get(
  `${BOT_SOCIAL_BASE_PATH}/posts/:id`,
  requireBotToken,
  async (req: BotRequest, res: Response) => {
    try {
      res.json(await getBotSocialPost(req.bot!, req.params.id));
    } catch (error) {
      handleError(res, error, "get");
    }
  },
);

export default router;
