// مسودات بوت النسخة الإنجليزية. يُركَّب قبل راوتر المقالات العربية لأن
// POST /api/internal/bot-drafts/en كان سيُلتقط كمعرّف «en» أو كفعل ممنوع.

import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import {
  BOT_DRAFTS_EN_BASE_PATH,
  BOT_DRAFTS_EN_IMAGES_PATH,
  BOT_DRAFTS_IMAGE_FIELD,
  BOT_DRAFTS_IMAGE_MAX_BYTES,
  BOT_DRAFTS_IMAGE_MIME_TYPES,
  BOT_DRAFTS_IMAGE_PURPOSE,
  BOT_DRAFT_VISIBILITY_FIELDS,
  botDraftArchiveSchema,
  botDraftPublishSchema,
  botDraftRegenerateExtrasSchema,
  botDraftReadySchema,
  botDraftRestoreSchema,
  botDraftScheduleSchema,
  botDraftUnscheduleSchema,
  botDraftVisibilitySchema,
  enBotDraftCreateSchema,
  enBotDraftUpdateSchema,
  findForbiddenBotDraftFields,
  parseBotDraftPublishAt,
  type BotDraftErrorBody,
  type BotDraftImageUploadResponse,
} from "@shared/botDrafts";
import { isNewsImageR2DeliveryUrl, newsImageStorageService } from "../services/newsImageStorageService";
import { verifyImageMagicBytes } from "../utils/imageVerify";
import { authenticatePublisherToken } from "../services/botPublisherTokenService";
import {
  BotDraftError,
  assertPersonalCapability,
  authenticateBotToken,
  isBotDraftsConfigured,
  type BotIdentity,
} from "../services/botDraftsService";
import {
  archiveEnBotDraft,
  createEnBotDraft,
  findPublishedEnArticleByPublicId,
  getEnBotDraft,
  getEnBotDraftPublishOperation,
  markEnBotDraftReady,
  normalizeBotDraftPublicId,
  publishEnBotDraft,
  regenerateEnBotDraftExtras,
  rescheduleEnBotDraft,
  restoreEnBotDraft,
  scheduleEnBotDraft,
  unscheduleEnBotDraft,
  updateEnBotDraft,
  updateEnBotDraftVisibility,
} from "../services/enBotDraftsService";

const router = Router();
const BASE = BOT_DRAFTS_EN_BASE_PATH;

router.use(BASE, rateLimit({
  windowMs: 60_000,
  limit: () => Number(process.env.BOT_DRAFTS_FAILED_RATE_LIMIT) || 120,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
}));

type BotRequest = Request & { bot?: BotIdentity };

function sendError(res: Response, status: number, body: BotDraftErrorBody): void {
  res.status(status).json(body);
}

async function requireBotToken(req: BotRequest, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const raw = /^Bearer\s+(.+)$/i.exec(req.headers.authorization?.trim() ?? "")?.[1]?.trim();
    if (raw?.startsWith("botpub_")) {
      const personal = await authenticatePublisherToken(raw);
      if (personal) {
        req.bot = { name: `publisher-${personal.userId}`, personal };
        return next();
      }
    } else {
      if (!isBotDraftsConfigured()) {
        return sendError(res, 503, { code: "not_configured", message: "واجهة مسودات البوتات غير مفعّلة على هذا الخادم" });
      }
      const legacy = authenticateBotToken(req.headers.authorization);
      if (legacy) {
        req.bot = legacy;
        return next();
      }
    }
    res.setHeader("WWW-Authenticate", 'Bearer realm="sabq-bot-drafts"');
    return sendError(res, 401, { code: "unauthorized", message: "توكن غير صالح أو منتهي أو ملغى" });
  } catch (error) {
    console.error("[EnBotDrafts] personal authentication unavailable");
    sendError(res, 503, { code: "server_error", message: "خدمة التحقق من الربط غير متاحة مؤقتًا" });
  }
}

function requireUploadCapability(req: BotRequest, res: Response, next: NextFunction) {
  try {
    assertPersonalCapability(req.bot!, "upload");
    next();
  } catch (error) {
    handleError(res, error, "upload-authorize");
  }
}

const botWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: () => Number(process.env.BOT_DRAFTS_WRITE_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => `bot-drafts-en:${(req as BotRequest).bot?.name ?? "anonymous"}`,
  skip: (req) => req.method === "GET" || req.method === "HEAD",
  handler: (_req, res) => sendError(res, 429, { code: "rate_limited", message: "تجاوزت حد الكتابة للدقيقة — أعد المحاولة بعد قليل" }),
});

const botExtrasLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: () => Number(process.env.BOT_DRAFTS_EXTRAS_RATE_LIMIT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => `bot-drafts-en-extras:${(req as BotRequest).bot?.name ?? "anonymous"}`,
  handler: (_req, res) => sendError(res, 429, { code: "rate_limited", message: "تجاوزت حد توليد الملحقات للدقيقة — أعد المحاولة بعد قليل" }),
});

function rejectForbiddenFields(req: Request, res: Response, next: NextFunction) {
  rejectListedFields(findForbiddenBotDraftFields(req.body), res, next);
}

function rejectNonVisibilityForbiddenFields(req: Request, res: Response, next: NextFunction) {
  const allowed = new Set<string>(BOT_DRAFT_VISIBILITY_FIELDS);
  rejectListedFields(findForbiddenBotDraftFields(req.body).filter((field) => !allowed.has(field)), res, next);
}

function rejectListedFields(forbidden: string[], res: Response, next: NextFunction) {
  if (forbidden.length > 0) {
    return sendError(res, 422, {
      code: "forbidden_fields",
      message: "هذه الحقول ليست من صلاحيات البوت — الحالة والنشر والإسناد من اللوحة فقط",
      details: { fields: forbidden },
    });
  }
  next();
}

function handleError(res: Response, error: unknown, action: string): void {
  if (error instanceof BotDraftError) {
    return sendError(res, error.httpStatus, { code: error.code, message: error.message, details: error.details });
  }
  console.error(`[EnBotDrafts] ${action} failed:`, error);
  sendError(res, 500, { code: "server_error", message: "خطأ داخلي" });
}

function requestContext(req: Request) {
  return { ip: req.ip, userAgent: req.get("user-agent") };
}

const botImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BOT_DRAFTS_IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if ((BOT_DRAFTS_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype.toLowerCase())) {
      cb(null, true);
      return;
    }
    cb(new Error("نوع الملف غير مسموح. الأنواع المسموحة: JPEG, PNG, WEBP, GIF"));
  },
});

function parseBotImageUpload(req: Request, res: Response, next: NextFunction) {
  botImageUpload.single(BOT_DRAFTS_IMAGE_FIELD)(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return sendError(res, 400, { code: "file_too_large", message: "الملف كبير جداً. الحد الأقصى 10MB" });
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_UNEXPECTED_FILE") {
      return sendError(res, 400, { code: "validation_error", message: `اسم الحقل يجب أن يكون ${BOT_DRAFTS_IMAGE_FIELD}` });
    }
    return sendError(res, 400, { code: "invalid_image", message: error instanceof Error ? error.message : "تعذّر قراءة الملف المرفوع" });
  });
}

function recoverUploadFilename(originalName: string | undefined): string {
  const raw = originalName?.trim() || "image";
  const recovered = /[À-ÿ]/.test(raw) ? Buffer.from(raw, "latin1").toString("utf8") : raw;
  return recovered.replace(/[/\\]/g, "").slice(0, 180) || "image";
}

async function isAllowedBotDraftImage(buffer: Buffer, claimedMime: string): Promise<boolean> {
  const mime = claimedMime.toLowerCase();
  if (mime === "image/gif") {
    const header = buffer.subarray(0, 6).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  }
  return (await verifyImageMagicBytes(buffer, mime)).ok;
}

router.post(BASE, requireBotToken, botWriteLimiter, rejectForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = enBotDraftCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "بيانات المسودة غير صالحة", details: parsed.error.flatten() });
  }
  try {
    res.status(201).json(await createEnBotDraft(req.bot!, parsed.data, requestContext(req)));
  } catch (error) {
    handleError(res, error, "create");
  }
});

router.post(
  BOT_DRAFTS_EN_IMAGES_PATH,
  requireBotToken,
  botWriteLimiter,
  requireUploadCapability,
  parseBotImageUpload,
  async (req: BotRequest, res: Response) => {
    const file = req.file;
    if (!file) {
      return sendError(res, 400, { code: "validation_error", message: `لم يتم اختيار ملف. الحقل المطلوب: ${BOT_DRAFTS_IMAGE_FIELD}` });
    }
    if (!(await isAllowedBotDraftImage(file.buffer, file.mimetype))) {
      return sendError(res, 400, { code: "invalid_image", message: "الملف ليس صورة صالحة (JPEG/PNG/WEBP/GIF)" });
    }
    if (!newsImageStorageService.isR2Configured()) {
      return sendError(res, 503, { code: "storage_unavailable", message: "تخزين R2 لصور الأخبار غير متاح حالياً" });
    }
    const filename = recoverUploadFilename(file.originalname);
    try {
      const result = await newsImageStorageService.upload({
        buffer: file.buffer,
        filename,
        mimeType: file.mimetype,
        purpose: BOT_DRAFTS_IMAGE_PURPOSE,
        metadata: { source: "bot-drafts-en", bot: req.bot!.name },
        rolloutKey: `bot-drafts-en:${req.bot!.name}:${filename}:${file.size}`,
        forceR2: true,
      });
      if (!result.success || result.provider !== "r2" || !isNewsImageR2DeliveryUrl(result.deliveryUrl)) {
        return sendError(res, 502, { code: "upload_failed", message: "تعذّر رفع الصورة إلى R2" });
      }
      const body: BotDraftImageUploadResponse = {
        deliveryUrl: result.deliveryUrl,
        imageId: result.imageId ?? null,
        filename: result.filename ?? filename,
        provider: result.provider ?? null,
        thumbnailUrl: result.thumbnailUrl ?? null,
        width: result.width ?? null,
        height: result.height ?? null,
        purpose: BOT_DRAFTS_IMAGE_PURPOSE,
      };
      res.status(201).json(body);
    } catch (error) {
      handleError(res, error, "upload-image");
    }
  },
);

router.get(`${BASE}/by-public-id/:publicId`, requireBotToken, async (req: BotRequest, res: Response) => {
  const publicId = normalizeBotDraftPublicId(req.params.publicId);
  if (!publicId) return sendError(res, 400, { code: "validation_error", message: "publicId مطلوب وطوله حتى 300 حرف" });
  try {
    const article = await findPublishedEnArticleByPublicId(publicId, req.bot!);
    if (!article) return sendError(res, 404, { code: "not_found", message: "لا يوجد خبر إنجليزي منشور بهذا الرابط" });
    res.json(article);
  } catch (error) {
    handleError(res, error, "by-public-id");
  }
});

router.get(`${BASE}/:id`, requireBotToken, async (req: BotRequest, res: Response) => {
  if (req.query.includeContent !== undefined && (typeof req.query.includeContent !== "string" || req.query.includeContent !== "1")) {
    return sendError(res, 400, { code: "validation_error", message: "includeContent يجب أن يكون 1" });
  }
  try {
    const draft = await getEnBotDraft(req.params.id, req.bot!, { includeContent: req.query.includeContent === "1" });
    if (!draft) return sendError(res, 404, { code: "not_found", message: "المسودة غير موجودة" });
    res.json(draft);
  } catch (error) {
    handleError(res, error, "get");
  }
});

router.patch(`${BASE}/:id`, requireBotToken, botWriteLimiter, rejectForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = enBotDraftUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "بيانات التحديث غير صالحة", details: parsed.error.flatten() });
  }
  try {
    res.json(await updateEnBotDraft(req.bot!, req.params.id, parsed.data, requestContext(req)));
  } catch (error) {
    handleError(res, error, "update");
  }
});

router.post(`${BASE}/:id/regenerate-extras`, requireBotToken, botWriteLimiter, botExtrasLimiter, rejectForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = botDraftRegenerateExtrasSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "أرسل جسماً فارغاً أو fields من: summary، keywords، seo", details: parsed.error.flatten() });
  }
  try {
    res.json(await regenerateEnBotDraftExtras(req.bot!, req.params.id, parsed.data, requestContext(req)));
  } catch (error) {
    handleError(res, error, "regenerate-extras");
  }
});

router.patch(`${BASE}/:id/ready`, requireBotToken, botWriteLimiter, rejectForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = botDraftReadySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "تعليم الجاهزية لا يقبل حقولاً — أرسل جسماً فارغاً", details: parsed.error.flatten() });
  }
  try {
    res.json(await markEnBotDraftReady(req.bot!, req.params.id, requestContext(req)));
  } catch (error) {
    handleError(res, error, "ready");
  }
});

router.post(`${BASE}/:id/publish`, requireBotToken, botWriteLimiter, rejectForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = botDraftPublishSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "النشر الفوري لا يقبل حقولاً — أرسل جسماً فارغاً", details: parsed.error.flatten() });
  }
  try {
    const draft = await publishEnBotDraft(req.bot!, req.params.id, requestContext(req), parsed.data);
    if (parsed.data.operationId && "status" in draft && draft.status === "processing") return res.status(202).json(draft);
    if (parsed.data.operationId && "status" in draft && draft.status === "failed") return res.status(422).json(draft);
    res.json(draft);
  } catch (error) {
    handleError(res, error, "publish");
  }
});

router.get(`${BASE}/:id/operations/:operationId`, requireBotToken, async (req: BotRequest, res: Response) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.operationId)) {
    return sendError(res, 400, { code: "validation_error", message: "operationId يجب أن يكون UUID صالحاً" });
  }
  try {
    res.json(await getEnBotDraftPublishOperation(req.bot!, req.params.id, req.params.operationId));
  } catch (error) {
    handleError(res, error, "publish-operation");
  }
});

router.post(`${BASE}/:id/schedule`, requireBotToken, botWriteLimiter, rejectForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = botDraftScheduleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "الجدولة تتطلب publishAt بصيغة ISO-8601 مع منطقة زمنية", details: parsed.error.flatten() });
  }
  const when = parseBotDraftPublishAt(parsed.data.publishAt);
  if (!when.ok) return sendError(res, 400, { code: "validation_error", message: when.message, details: when.details });
  try {
    res.json(await scheduleEnBotDraft(req.bot!, req.params.id, when.publishAt, requestContext(req)));
  } catch (error) {
    handleError(res, error, "schedule");
  }
});

router.patch(`${BASE}/:id/schedule`, requireBotToken, botWriteLimiter, rejectForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = botDraftScheduleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "تغيير الموعد يتطلب publishAt بصيغة ISO-8601 مع منطقة زمنية", details: parsed.error.flatten() });
  }
  const when = parseBotDraftPublishAt(parsed.data.publishAt);
  if (!when.ok) return sendError(res, 400, { code: "validation_error", message: when.message, details: when.details });
  try {
    res.json(await rescheduleEnBotDraft(req.bot!, req.params.id, when.publishAt, requestContext(req)));
  } catch (error) {
    handleError(res, error, "reschedule");
  }
});

router.delete(`${BASE}/:id/schedule`, requireBotToken, botWriteLimiter, rejectForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = botDraftUnscheduleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "إلغاء الجدولة لا يقبل حقولاً — أرسل جسماً فارغاً", details: parsed.error.flatten() });
  }
  try {
    res.json(await unscheduleEnBotDraft(req.bot!, req.params.id, requestContext(req)));
  } catch (error) {
    handleError(res, error, "unschedule");
  }
});

router.post(`${BASE}/:id/archive`, requireBotToken, botWriteLimiter, rejectForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = botDraftArchiveSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "الأرشفة تقبل reason اختيارياً فقط", details: parsed.error.flatten() });
  }
  try {
    res.json(await archiveEnBotDraft(req.bot!, req.params.id, parsed.data, requestContext(req)));
  } catch (error) {
    handleError(res, error, "archive");
  }
});

router.post(`${BASE}/:id/restore`, requireBotToken, botWriteLimiter, rejectForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = botDraftRestoreSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "الاستعادة لا تقبل حقولاً — أرسل جسماً فارغاً", details: parsed.error.flatten() });
  }
  try {
    res.json(await restoreEnBotDraft(req.bot!, req.params.id, requestContext(req)));
  } catch (error) {
    handleError(res, error, "restore");
  }
});

router.patch(`${BASE}/:id/visibility`, requireBotToken, botWriteLimiter, rejectNonVisibilityForbiddenFields, async (req: BotRequest, res: Response) => {
  const parsed = botDraftVisibilitySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "أرسل isFeatured أو newsType أو hideFromHomepage", details: parsed.error.flatten() });
  }
  try {
    res.json(await updateEnBotDraftVisibility(req.bot!, req.params.id, parsed.data, requestContext(req)));
  } catch (error) {
    handleError(res, error, "visibility");
  }
});

export default router;
