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
import {
  BOT_SOCIAL_BASE_PATH,
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
