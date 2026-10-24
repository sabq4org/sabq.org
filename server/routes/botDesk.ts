// ----------------------------------------------------------------------------
// واجهة بوت الديسك — Bot Desk API (/api/internal/bot-desk/*)
//
// تتيح لبوت مساعد موثوق إدارة استفسارات المساهمين (التذاكر) ومقترحات النشر
// الاجتماعي (كتّاب الرأي والوكالات) عبر توكن ناشر شخصي (botpub_*) مع تطبيق
// صلاحيات RBAC الفعلية لمالك التوكن وتسجيل كل عملية كتابة في activity_logs.
//
// المسارات:
//   GET   /api/internal/bot-desk/tickets
//   GET   /api/internal/bot-desk/tickets/:id
//   POST  /api/internal/bot-desk/tickets/:id/reply
//   PATCH /api/internal/bot-desk/tickets/:id/status
//   GET   /api/internal/bot-desk/social/pending
//   GET   /api/internal/bot-desk/social/posts/:id
//   POST  /api/internal/bot-desk/social/posts/:id/reject
//   POST  /api/internal/bot-desk/social/posts/:id/publish
//   POST  /api/internal/bot-desk/social/posts/:id/schedule
//
// التوثيق: docs/systems/editorial/BOT_DESK_API.md
// ----------------------------------------------------------------------------

import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import {
  BOT_DESK_AUDIT_CHANNEL,
  BOT_DESK_BASE_PATH,
  botDeskSocialPendingQuerySchema,
  botDeskSocialPublishSchema,
  botDeskSocialRejectSchema,
  botDeskSocialScheduleSchema,
  botDeskTicketReplySchema,
  botDeskTicketsQuerySchema,
  botDeskTicketStatusSchema,
  type BotDeskErrorBody,
} from "@shared/botDesk";
import {
  isBotPublisherToken,
  type BotPublisherPrincipal,
} from "@shared/botPublisherTokens";
import { logActivity, userHasPermission } from "../rbac";
import { authenticatePublisherToken } from "../services/botPublisherTokenService";
import {
  OpinionTicketServiceError,
  appendOpinionTicketMessage,
  canUserViewOpinionDesk,
  getOpinionTicketWithMessages,
  listOpinionTickets,
  updateOpinionTicketStatus,
} from "../services/opinionTicketsService";
import {
  SocialPublishValidationError,
  cancelPost,
  claimPostForImmediatePublish,
  getPost,
  getPostAttempts,
  listPendingSocialProposalsForDesk,
  publishClaimedPost,
  schedulePost,
} from "../services/socialPublishing/socialPublishingService";
import { SocialProviderError } from "../services/socialPublishing/types";

const router = Router();

type BotDeskRequest = Request & { botPrincipal?: BotPublisherPrincipal };

function sendError(res: Response, status: number, body: BotDeskErrorBody): void {
  res.status(status).json(body);
}

router.use(
  BOT_DESK_BASE_PATH,
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
  }),
);

async function requireBotDeskAuth(req: BotDeskRequest, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const authHeader = req.headers.authorization?.trim() ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    const rawToken = match?.[1]?.trim();

    if (!rawToken || !isBotPublisherToken(rawToken)) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="sabq-bot-desk"');
      return sendError(res, 401, {
        code: "unauthorized",
        message: "توكن غير صالح أو منتهي أو ملغى",
      });
    }

    const principal = await authenticatePublisherToken(rawToken);
    if (!principal) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="sabq-bot-desk"');
      return sendError(res, 401, {
        code: "unauthorized",
        message: "توكن غير صالح أو منتهي أو ملغى",
      });
    }

    req.botPrincipal = {
      ...principal,
      tokenPrefix: principal.tokenPrefix ?? rawToken.slice(0, 16),
      label: principal.label ?? null,
    };
    return next();
  } catch (error) {
    console.error("[BotDesk] authentication failed:", error);
    return sendError(res, 500, {
      code: "server_error",
      message: "خدمة التحقق من التوكن غير متاحة مؤقتاً",
    });
  }
}

async function requireTicketDeskAccess(req: BotDeskRequest, res: Response, next: NextFunction) {
  try {
    const principal = req.botPrincipal;
    if (!principal) {
      return sendError(res, 401, { code: "unauthorized", message: "Unauthorized" });
    }
    const allowed = await canUserViewOpinionDesk(principal.userId);
    if (!allowed) {
      return sendError(res, 403, {
        code: "forbidden",
        message: "لا تملك صلاحية الوصول إلى استفسارات المساهمين",
      });
    }
    return next();
  } catch (error) {
    console.error("[BotDesk] ticket RBAC check failed:", error);
    return sendError(res, 500, { code: "server_error", message: "خطأ داخلي" });
  }
}

function requireSocialPermission(...permissionCodes: string[]) {
  return async (req: BotDeskRequest, res: Response, next: NextFunction) => {
    try {
      const principal = req.botPrincipal;
      if (!principal) {
        return sendError(res, 401, { code: "unauthorized", message: "Unauthorized" });
      }
      const checks = await Promise.all(
        permissionCodes.map((code) => userHasPermission(principal.userId, code)),
      );
      if (!checks.some(Boolean)) {
        return sendError(res, 403, {
          code: "forbidden",
          message: "لا توجد لديك صلاحيات للوصول إلى هذه الخدمة",
          details: {
            required: permissionCodes.length === 1 ? permissionCodes[0] : permissionCodes,
          },
        });
      }
      return next();
    } catch (error) {
      console.error("[BotDesk] social RBAC check failed:", error);
      return sendError(res, 500, { code: "server_error", message: "خطأ داخلي" });
    }
  };
}

const botDeskWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: () => Number(process.env.BOT_DESK_WRITE_RATE_LIMIT) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) =>
    `bot-desk-write:${(req as BotDeskRequest).botPrincipal?.userId ?? "anonymous"}`,
  skip: (req) => req.method === "GET" || req.method === "HEAD",
  handler: (_req, res) =>
    sendError(res, 429, {
      code: "rate_limited",
      message: "تجاوزت حد الكتابة للدقيقة — أعد المحاولة بعد قليل",
    }),
});

const botDeskPublishLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: () => Number(process.env.BOT_DESK_PUBLISH_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) =>
    `bot-desk-publish:${(req as BotDeskRequest).botPrincipal?.userId ?? "anonymous"}`,
  handler: (_req, res) =>
    sendError(res, 429, {
      code: "rate_limited",
      message: "محاولات نشر كثيرة خلال فترة قصيرة؛ انتظر قليلاً",
    }),
});

async function auditBotDeskWrite(
  req: BotDeskRequest,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    extraMetadata?: Record<string, unknown>;
  },
): Promise<void> {
  const principal = req.botPrincipal;
  if (!principal) return;
  try {
    await logActivity({
      userId: principal.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      metadata: {
        channel: BOT_DESK_AUDIT_CHANNEL,
        tokenId: principal.tokenId,
        tokenPrefix: principal.tokenPrefix ?? null,
        tokenLabel: principal.label ?? null,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        ...(entry.extraMetadata ?? {}),
      },
    });
  } catch (err) {
    console.error("[BotDesk] audit log failed:", err);
  }
}

function handleTicketError(res: Response, error: unknown, action: string): void {
  if (error instanceof OpinionTicketServiceError) {
    return sendError(res, error.status, {
      code: error.code,
      message: error.message,
    });
  }
  console.error(`[BotDesk tickets] ${action} failed:`, error);
  sendError(res, 500, { code: "server_error", message: "خطأ داخلي" });
}

function handleSocialError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof SocialPublishValidationError) {
    const code =
      error.status === 404
        ? "not_found"
        : error.status === 409
          ? "conflict"
          : error.status === 403
            ? "forbidden"
            : "validation_error";
    return sendError(res, error.status, { code, message: error.message });
  }
  if (error instanceof SocialProviderError) {
    return sendError(res, 502, {
      code: "publish_failed",
      message: error.message,
      details: { retryable: error.opts.retryable },
    });
  }
  console.error("[BotDesk social]", error);
  sendError(res, 500, { code: "server_error", message: fallback });
}

// ── مسارات استفسارات المساهمين (Tickets) ────────────────────────────

router.get(
  `${BOT_DESK_BASE_PATH}/tickets`,
  requireBotDeskAuth,
  requireTicketDeskAccess,
  async (req: BotDeskRequest, res: Response) => {
    const parsed = botDeskTicketsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "معاملات الاستعلام غير صالحة",
        details: parsed.error.flatten(),
      });
    }
    try {
      const tickets = await listOpinionTickets({
        viewerId: req.botPrincipal!.userId,
        isAdmin: true,
        status: parsed.data.status,
        authorKind: parsed.data.authorKind,
        unread: parsed.data.unread,
        limit: parsed.data.limit,
      });
      res.json({ tickets });
    } catch (error) {
      handleTicketError(res, error, "list");
    }
  },
);

router.get(
  `${BOT_DESK_BASE_PATH}/tickets/:id`,
  requireBotDeskAuth,
  requireTicketDeskAccess,
  async (req: BotDeskRequest, res: Response) => {
    try {
      const detail = await getOpinionTicketWithMessages({
        ticketId: req.params.id,
        viewerId: req.botPrincipal!.userId,
        isAdmin: true,
      });
      res.json(detail);
    } catch (error) {
      handleTicketError(res, error, "detail");
    }
  },
);

router.post(
  `${BOT_DESK_BASE_PATH}/tickets/:id/reply`,
  requireBotDeskAuth,
  requireTicketDeskAccess,
  botDeskWriteLimiter,
  async (req: BotDeskRequest, res: Response) => {
    const parsed = botDeskTicketReplySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "بيانات الرد غير صالحة",
        details: parsed.error.flatten(),
      });
    }
    try {
      const result = await appendOpinionTicketMessage({
        ticketId: req.params.id,
        senderId: req.botPrincipal!.userId,
        isAdmin: true,
        message: parsed.data.message,
        parentMessageId: parsed.data.parentMessageId ?? null,
        forceAdminRole: true,
      });

      await auditBotDeskWrite(req, {
        action: "ticket_reply",
        entityType: "opinion_ticket",
        entityId: req.params.id,
        oldValue: { status: result.previousStatus },
        newValue: {
          status: result.status,
          messageId: result.message.id,
        },
      });

      const createdAtIso =
        result.message.createdAt instanceof Date
          ? result.message.createdAt.toISOString()
          : result.message.createdAt
            ? new Date(result.message.createdAt).toISOString()
            : new Date().toISOString();

      res.status(201).json({
        message: {
          ...result.message,
          role: result.message.senderRole,
          text: result.message.message,
          senderName: req.botPrincipal!.name,
          createdAt: createdAtIso,
          created_at: createdAtIso,
        },
        status: result.status,
        ticketStatus: result.status,
      });
    } catch (error) {
      handleTicketError(res, error, "reply");
    }
  },
);

router.patch(
  `${BOT_DESK_BASE_PATH}/tickets/:id/status`,
  requireBotDeskAuth,
  requireTicketDeskAccess,
  botDeskWriteLimiter,
  async (req: BotDeskRequest, res: Response) => {
    const parsed = botDeskTicketStatusSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "حالة غير صالحة",
        details: parsed.error.flatten(),
      });
    }
    try {
      const updated = await updateOpinionTicketStatus({
        ticketId: req.params.id,
        status: parsed.data.status,
      });
      await auditBotDeskWrite(req, {
        action: "ticket_status_update",
        entityType: "opinion_ticket",
        entityId: req.params.id,
        newValue: { status: updated.status },
      });
      res.json({ ticket: updated });
    } catch (error) {
      handleTicketError(res, error, "status");
    }
  },
);

// ── مسارات مقترحات النشر الاجتماعي (Social) ──────────────────────────

router.get(
  `${BOT_DESK_BASE_PATH}/social/pending`,
  requireBotDeskAuth,
  requireSocialPermission(PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG),
  async (req: BotDeskRequest, res: Response) => {
    const parsed = botDeskSocialPendingQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "معاملات الاستعلام غير صالحة",
        details: parsed.error.flatten(),
      });
    }
    try {
      const posts = await listPendingSocialProposalsForDesk(parsed.data.kind, parsed.data.limit);
      res.json({ posts, proposals: posts });
    } catch (error) {
      handleSocialError(res, error, "تعذر جلب مقترحات النشر المعلقة");
    }
  },
);

router.get(
  `${BOT_DESK_BASE_PATH}/social/posts/:id`,
  requireBotDeskAuth,
  requireSocialPermission(PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG),
  async (req: BotDeskRequest, res: Response) => {
    try {
      const post = await getPost(req.params.id);
      if (!post) {
        return sendError(res, 404, { code: "not_found", message: "المنشور غير موجود" });
      }
      const attempts = await getPostAttempts(post.id);
      res.json({ post, attempts });
    } catch (error) {
      handleSocialError(res, error, "تعذر جلب المنشور");
    }
  },
);

router.post(
  `${BOT_DESK_BASE_PATH}/social/posts/:id/reject`,
  requireBotDeskAuth,
  requireSocialPermission(
    PERMISSION_CODES.SOCIAL_PUBLISH_MANAGE_SCHEDULED,
    PERMISSION_CODES.SOCIAL_PUBLISH_CREATE,
  ),
  botDeskWriteLimiter,
  async (req: BotDeskRequest, res: Response) => {
    const parsed = botDeskSocialRejectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "بيانات الرفض غير صالحة",
        details: parsed.error.flatten(),
      });
    }
    try {
      const existing = await getPost(req.params.id);
      if (!existing) {
        return sendError(res, 404, { code: "not_found", message: "المنشور غير موجود" });
      }
      const reason = parsed.data.reason ?? null;
      const post = await cancelPost(req.params.id, req.botPrincipal!.userId, reason);
      await auditBotDeskWrite(req, {
        action: "social_post_reject",
        entityType: "social_post",
        entityId: post.id,
        oldValue: { status: existing.status },
        newValue: { status: post.status, reason },
      });
      res.json({ post });
    } catch (error) {
      handleSocialError(res, error, "تعذر رفض المنشور");
    }
  },
);

router.post(
  `${BOT_DESK_BASE_PATH}/social/posts/:id/publish`,
  requireBotDeskAuth,
  requireSocialPermission(PERMISSION_CODES.SOCIAL_PUBLISH_NOW),
  botDeskWriteLimiter,
  botDeskPublishLimiter,
  async (req: BotDeskRequest, res: Response) => {
    const parsed = botDeskSocialPublishSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "النشر الفوري لا يقبل حقولاً في الجسم",
        details: parsed.error.flatten(),
      });
    }
    try {
      const claimed = await claimPostForImmediatePublish(req.params.id);
      if (!claimed) {
        const current = await getPost(req.params.id);
        if (!current) {
          return sendError(res, 404, { code: "not_found", message: "المنشور غير موجود" });
        }
        return sendError(res, 409, {
          code: "conflict",
          message:
            current.status === "published"
              ? "هذا المنشور نُشر سابقاً"
              : "المنشور قيد النشر بالفعل أو حالته لا تسمح",
          post: current,
        });
      }

      const result = await publishClaimedPost(claimed, req.botPrincipal!.userId);
      await auditBotDeskWrite(req, {
        action: "social_post_publish",
        entityType: "social_post",
        entityId: result.id,
        newValue: {
          status: result.status,
          externalPostUrl: result.externalPostUrl ?? null,
        },
      });

      if (result.status === "published") {
        return res.json({ post: result });
      }
      return sendError(res, 502, {
        code: "publish_failed",
        message: result.lastError || "فشل النشر",
        post: result,
      });
    } catch (error) {
      handleSocialError(res, error, "تعذر تنفيذ النشر");
    }
  },
);

router.post(
  `${BOT_DESK_BASE_PATH}/social/posts/:id/schedule`,
  requireBotDeskAuth,
  requireSocialPermission(PERMISSION_CODES.SOCIAL_PUBLISH_SCHEDULE),
  botDeskWriteLimiter,
  async (req: BotDeskRequest, res: Response) => {
    const parsed = botDeskSocialScheduleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "صيغة وقت الجدولة غير صالحة (ISO مع المنطقة الزمنية)",
        details: parsed.error.flatten(),
      });
    }
    try {
      const existing = await getPost(req.params.id);
      if (!existing) {
        return sendError(res, 404, { code: "not_found", message: "المنشور غير موجود" });
      }
      const post = await schedulePost(req.params.id, new Date(parsed.data.scheduledAt), {
        resetAttempts: true,
      });
      await auditBotDeskWrite(req, {
        action: "social_post_schedule",
        entityType: "social_post",
        entityId: post.id,
        oldValue: { status: existing.status, scheduledAt: existing.scheduledAt },
        newValue: { status: post.status, scheduledAt: parsed.data.scheduledAt },
      });
      res.json({ post });
    } catch (error) {
      handleSocialError(res, error, "تعذرت الجدولة");
    }
  },
);

export default router;
export { router as botDeskRouter };
