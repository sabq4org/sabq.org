// ----------------------------------------------------------------------------
// «مسودات البوتات» — Bot Drafts API (HTTP فقط؛ البيانات في botDraftsService)
//
// POST  /api/internal/bot-drafts        إنشاء مسودة عربية (status=draft دائماً)
// POST  /api/internal/bot-drafts/images رفع صورة غلاف إلى R2 / media.sabq.org (forceR2)
// GET   /api/internal/bot-drafts/:id    حالة المسودة + معرّفها + رابط التحرير
// PATCH /api/internal/bot-drafts/:id    تحديث مسودة أنشأها بوت وما زالت draft
// PATCH /api/internal/bot-drafts/:id/ready     draft → ready_to_publish (لا نشر)
// POST  /api/internal/bot-drafts/:id/publish  نشر فوري لجسم فارغ
// POST  /api/internal/bot-drafts/:id/schedule جدولة بجسم { publishAt }
// PATCH /api/internal/bot-drafts/:id/schedule تغيير موعد مادة مجدولة
// DELETE /api/internal/bot-drafts/:id/schedule إلغاء الجدولة والعودة إلى draft
// POST  /api/internal/bot-drafts/:id/archive  أرشفة ناعمة لمادة منشورة (لا حذف نهائي)
// PATCH /api/internal/bot-drafts/:id/visibility مميز / عاجل / إخفاء الرئيسية
//
// المصادقة: Authorization: Bearer <token> من BOT_DRAFTS_API_TOKENS (لكل بوت اسم
// وتوكن). المسار تحت /api/internal/* فهو معفى من CSRF ومن محدد الكتابة العام
// (server/csrf.ts + server/index.ts) — لذلك له محدد خاص هنا بمفتاح اسم البوت.
// جسم الإنشاء والتحديث لا يكتب الحالة: الحقول الممنوعة تُرفض بـ 422.
// التوثيق: docs/systems/editorial/BOT_DRAFTS_API.md
// ----------------------------------------------------------------------------

import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import {
  BOT_DRAFTS_BASE_PATH,
  BOT_DRAFTS_IMAGES_PATH,
  BOT_DRAFTS_IMAGE_FIELD,
  BOT_DRAFTS_IMAGE_MAX_BYTES,
  BOT_DRAFTS_IMAGE_MIME_TYPES,
  BOT_DRAFTS_IMAGE_PURPOSE,
  BOT_DRAFT_VISIBILITY_FIELDS,
  botDraftArchiveSchema,
  botDraftCreateSchema,
  botDraftPublishSchema,
  botDraftReadySchema,
  botDraftScheduleSchema,
  botDraftUnscheduleSchema,
  botDraftUpdateSchema,
  botDraftVisibilitySchema,
  findForbiddenBotDraftFields,
  parseBotDraftPublishAt,
  type BotDraftErrorBody,
  type BotDraftImageUploadResponse,
} from "@shared/botDrafts";
import { isNewsImageR2DeliveryUrl, newsImageStorageService } from "../services/newsImageStorageService";
import { verifyImageMagicBytes } from "../utils/imageVerify";
import {
  BotDraftError,
  authenticateBotToken,
  createBotDraft,
  archiveBotDraft,
  getBotDraft,
  isBotDraftsConfigured,
  markBotDraftReady,
  publishBotDraft,
  rescheduleBotDraft,
  scheduleBotDraft,
  unscheduleBotDraft,
  updateBotDraft,
  updateBotDraftVisibility,
  type BotIdentity,
} from "../services/botDraftsService";

const router = Router();

type BotRequest = Request & { bot?: BotIdentity };

function sendError(res: Response, status: number, body: BotDraftErrorBody): void {
  res.status(status).json(body);
}

function requireBotToken(req: BotRequest, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!isBotDraftsConfigured()) {
    return sendError(res, 503, { code: "not_configured", message: "واجهة مسودات البوتات غير مفعّلة على هذا الخادم" });
  }
  const bot = authenticateBotToken(req.headers.authorization);
  if (!bot) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="sabq-bot-drafts"');
    return sendError(res, 401, { code: "unauthorized", message: "توكن غير صالح أو مفقود" });
  }
  req.bot = bot;
  next();
}

// محدد خاص بالبوتات: المسار معفى من محدد الكتابة العام (Railway egress واحد).
const botWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  // يُقرأ عند كل طلب حتى يمكن ضبطه في الاختبارات والبيئات دون إعادة تحميل الوحدة.
  limit: () => Number(process.env.BOT_DRAFTS_WRITE_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => `bot-drafts:${(req as BotRequest).bot?.name ?? "anonymous"}`,
  skip: (req) => req.method === "GET" || req.method === "HEAD",
  handler: (_req, res) =>
    sendError(res, 429, { code: "rate_limited", message: "تجاوزت حد الكتابة للدقيقة — أعد المحاولة بعد قليل" }),
});

function rejectForbiddenFields(req: Request, res: Response, next: NextFunction) {
  rejectListedFields(findForbiddenBotDraftFields(req.body), res, next);
}

/** مسار الظهور يسمح بحقول اللوحة الثلاثة ويرفض بقية قائمة المنع (status، الإسناد، …). */
function rejectNonVisibilityForbiddenFields(req: Request, res: Response, next: NextFunction) {
  const allowed = new Set<string>(BOT_DRAFT_VISIBILITY_FIELDS);
  const forbidden = findForbiddenBotDraftFields(req.body).filter((field) => !allowed.has(field));
  rejectListedFields(forbidden, res, next);
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
  console.error(`[BotDrafts] ${action} failed:`, error);
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
      return sendError(res, 400, {
        code: "file_too_large",
        message: "الملف كبير جداً. الحد الأقصى 10MB",
      });
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_UNEXPECTED_FILE") {
      return sendError(res, 400, {
        code: "validation_error",
        message: `اسم الحقل يجب أن يكون ${BOT_DRAFTS_IMAGE_FIELD}`,
      });
    }
    const message = error instanceof Error ? error.message : "تعذّر قراءة الملف المرفوع";
    return sendError(res, 400, { code: "invalid_image", message });
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
  const verify = await verifyImageMagicBytes(buffer, mime);
  return verify.ok;
}

router.post(
  BOT_DRAFTS_BASE_PATH,
  requireBotToken,
  botWriteLimiter,
  rejectForbiddenFields,
  async (req: BotRequest, res: Response) => {
    const parsed = botDraftCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, { code: "validation_error", message: "بيانات المسودة غير صالحة", details: parsed.error.flatten() });
    }
    try {
      const draft = await createBotDraft(req.bot!, parsed.data, requestContext(req));
      res.status(201).json(draft);
    } catch (error) {
      handleError(res, error, "create");
    }
  },
);

router.post(
  BOT_DRAFTS_IMAGES_PATH,
  requireBotToken,
  botWriteLimiter,
  parseBotImageUpload,
  async (req: BotRequest, res: Response) => {
    const file = req.file;
    if (!file) {
      return sendError(res, 400, {
        code: "validation_error",
        message: `لم يتم اختيار ملف. الحقل المطلوب: ${BOT_DRAFTS_IMAGE_FIELD}`,
      });
    }

    const allowed = await isAllowedBotDraftImage(file.buffer, file.mimetype);
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

    const filename = recoverUploadFilename(file.originalname);
    try {
      const result = await newsImageStorageService.upload({
        buffer: file.buffer,
        filename,
        mimeType: file.mimetype,
        purpose: BOT_DRAFTS_IMAGE_PURPOSE,
        metadata: { source: "bot-drafts", bot: req.bot!.name },
        rolloutKey: `bot-drafts:${req.bot!.name}:${filename}:${file.size}`,
        forceR2: true,
      });
      if (
        !result.success ||
        result.provider !== "r2" ||
        !isNewsImageR2DeliveryUrl(result.deliveryUrl)
      ) {
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

router.get(`${BOT_DRAFTS_BASE_PATH}/:id`, requireBotToken, async (req: BotRequest, res: Response) => {
  try {
    const draft = await getBotDraft(req.params.id);
    if (!draft) {
      return sendError(res, 404, { code: "not_found", message: "المسودة غير موجودة" });
    }
    res.json(draft);
  } catch (error) {
    handleError(res, error, "get");
  }
});

router.patch(
  `${BOT_DRAFTS_BASE_PATH}/:id`,
  requireBotToken,
  botWriteLimiter,
  rejectForbiddenFields,
  async (req: BotRequest, res: Response) => {
    const parsed = botDraftUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, { code: "validation_error", message: "بيانات التحديث غير صالحة", details: parsed.error.flatten() });
    }
    try {
      const draft = await updateBotDraft(req.bot!, req.params.id, parsed.data, requestContext(req));
      res.json(draft);
    } catch (error) {
      handleError(res, error, "update");
    }
  },
);

router.patch(
  `${BOT_DRAFTS_BASE_PATH}/:id/ready`,
  requireBotToken,
  botWriteLimiter,
  rejectForbiddenFields,
  async (req: BotRequest, res: Response) => {
    const parsed = botDraftReadySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "تعليم الجاهزية لا يقبل حقولاً — أرسل جسماً فارغاً",
        details: parsed.error.flatten(),
      });
    }
    try {
      const draft = await markBotDraftReady(req.bot!, req.params.id, requestContext(req));
      res.json(draft);
    } catch (error) {
      handleError(res, error, "ready");
    }
  },
);

router.post(
  `${BOT_DRAFTS_BASE_PATH}/:id/publish`,
  requireBotToken,
  botWriteLimiter,
  rejectForbiddenFields,
  async (req: BotRequest, res: Response) => {
    const parsed = botDraftPublishSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "النشر الفوري لا يقبل حقولاً — أرسل جسماً فارغاً",
        details: parsed.error.flatten(),
      });
    }
    try {
      const draft = await publishBotDraft(req.bot!, req.params.id, requestContext(req));
      res.json(draft);
    } catch (error) {
      handleError(res, error, "publish");
    }
  },
);

router.post(
  `${BOT_DRAFTS_BASE_PATH}/:id/schedule`,
  requireBotToken,
  botWriteLimiter,
  rejectForbiddenFields,
  async (req: BotRequest, res: Response) => {
    const parsed = botDraftScheduleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "الجدولة تتطلب publishAt بصيغة ISO-8601 مع منطقة زمنية",
        details: parsed.error.flatten(),
      });
    }
    const when = parseBotDraftPublishAt(parsed.data.publishAt);
    if (!when.ok) {
      return sendError(res, 400, { code: "validation_error", message: when.message, details: when.details });
    }
    try {
      const draft = await scheduleBotDraft(req.bot!, req.params.id, when.publishAt, requestContext(req));
      res.json(draft);
    } catch (error) {
      handleError(res, error, "schedule");
    }
  },
);

router.patch(
  `${BOT_DRAFTS_BASE_PATH}/:id/schedule`,
  requireBotToken,
  botWriteLimiter,
  rejectForbiddenFields,
  async (req: BotRequest, res: Response) => {
    const parsed = botDraftScheduleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "تغيير الموعد يتطلب publishAt بصيغة ISO-8601 مع منطقة زمنية",
        details: parsed.error.flatten(),
      });
    }
    const when = parseBotDraftPublishAt(parsed.data.publishAt);
    if (!when.ok) {
      return sendError(res, 400, { code: "validation_error", message: when.message, details: when.details });
    }
    try {
      const draft = await rescheduleBotDraft(req.bot!, req.params.id, when.publishAt, requestContext(req));
      res.json(draft);
    } catch (error) {
      handleError(res, error, "reschedule");
    }
  },
);

router.delete(
  `${BOT_DRAFTS_BASE_PATH}/:id/schedule`,
  requireBotToken,
  botWriteLimiter,
  rejectForbiddenFields,
  async (req: BotRequest, res: Response) => {
    const parsed = botDraftUnscheduleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "إلغاء الجدولة لا يقبل حقولاً — أرسل جسماً فارغاً",
        details: parsed.error.flatten(),
      });
    }
    try {
      const draft = await unscheduleBotDraft(req.bot!, req.params.id, requestContext(req));
      res.json(draft);
    } catch (error) {
      handleError(res, error, "unschedule");
    }
  },
);

router.post(
  `${BOT_DRAFTS_BASE_PATH}/:id/archive`,
  requireBotToken,
  botWriteLimiter,
  rejectForbiddenFields,
  async (req: BotRequest, res: Response) => {
    const parsed = botDraftArchiveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "الأرشفة تقبل reason اختيارياً فقط",
        details: parsed.error.flatten(),
      });
    }
    try {
      const draft = await archiveBotDraft(req.bot!, req.params.id, parsed.data, requestContext(req));
      res.json(draft);
    } catch (error) {
      handleError(res, error, "archive");
    }
  },
);

router.patch(
  `${BOT_DRAFTS_BASE_PATH}/:id/visibility`,
  requireBotToken,
  botWriteLimiter,
  rejectNonVisibilityForbiddenFields,
  async (req: BotRequest, res: Response) => {
    const parsed = botDraftVisibilitySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "أرسل isFeatured أو newsType أو hideFromHomepage",
        details: parsed.error.flatten(),
      });
    }
    try {
      const draft = await updateBotDraftVisibility(req.bot!, req.params.id, parsed.data, requestContext(req));
      res.json(draft);
    } catch (error) {
      handleError(res, error, "visibility");
    }
  },
);

// أفعال غير معروفة. المسارات الحقيقية مُسجَّلة أعلاه. DELETE على /:id يبقى 405.
router.all(`${BOT_DRAFTS_BASE_PATH}/:id/:action`, requireBotToken, (_req: Request, res: Response) => {
  sendError(res, 403, {
    code: "forbidden_action",
    message:
      "هذا الفعل غير متاح. النشر POST /publish، الجدولة POST /schedule، تغيير الموعد PATCH /schedule، إلغاء الجدولة DELETE /schedule، الأرشفة POST /archive، الظهور PATCH /visibility، الجاهزية PATCH /ready",
  });
});
router.all(`${BOT_DRAFTS_BASE_PATH}/:id`, requireBotToken, (_req: Request, res: Response) => {
  res.setHeader("Allow", "GET, PATCH");
  sendError(res, 405, {
    code: "forbidden_action",
    message: "المسموح: GET و PATCH. أرشفة المادة المنشورة عبر POST /archive ولا يوجد حذف نهائي",
  });
});

export default router;
