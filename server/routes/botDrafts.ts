// ----------------------------------------------------------------------------
// «مسودات البوتات» — Bot Drafts API (HTTP فقط؛ البيانات في botDraftsService)
//
// POST  /api/internal/bot-drafts        إنشاء مسودة عربية (status=draft دائماً)
// GET   /api/internal/bot-drafts/:id    حالة المسودة + معرّفها + رابط التحرير
// PATCH /api/internal/bot-drafts/:id    تحديث مسودة أنشأها بوت وما زالت draft
//
// المصادقة: Authorization: Bearer <token> من BOT_DRAFTS_API_TOKENS (لكل بوت اسم
// وتوكن). المسار تحت /api/internal/* فهو معفى من CSRF ومن محدد الكتابة العام
// (server/csrf.ts + server/index.ts) — لذلك له محدد خاص هنا بمفتاح اسم البوت.
// لا نشر/جدولة/تغيير حالة من هذا المسار: الحقول الممنوعة تُرفض بـ 422.
// التوثيق: docs/systems/editorial/BOT_DRAFTS_API.md
// ----------------------------------------------------------------------------

import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import {
  BOT_DRAFTS_BASE_PATH,
  botDraftCreateSchema,
  botDraftUpdateSchema,
  findForbiddenBotDraftFields,
  type BotDraftErrorBody,
} from "@shared/botDrafts";
import {
  BotDraftError,
  authenticateBotToken,
  createBotDraft,
  getBotDraft,
  isBotDraftsConfigured,
  updateBotDraft,
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
  const forbidden = findForbiddenBotDraftFields(req.body);
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

// أي فعل آخر على المسار (PUT/DELETE/publish/schedule…) مرفوض عمداً وبوضوح.
router.all(`${BOT_DRAFTS_BASE_PATH}/:id/:action`, requireBotToken, (_req: Request, res: Response) => {
  sendError(res, 403, { code: "forbidden_action", message: "هذا المسار للمسودات فقط — لا نشر ولا جدولة عبر البوت" });
});
router.all(`${BOT_DRAFTS_BASE_PATH}/:id`, requireBotToken, (_req: Request, res: Response) => {
  res.setHeader("Allow", "GET, PATCH");
  sendError(res, 405, { code: "forbidden_action", message: "المسموح: GET و PATCH فقط" });
});

export default router;
