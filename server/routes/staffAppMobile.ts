// ----------------------------------------------------------------------------
// واجهة تطبيق الديسك للمنسوبين — Sabq Desk Staff Mobile API (/api/v1/staff/*)
//
// طبقة API مخصصة لتطبيق الديسك المستقل على iOS (com.sabq.desk)، تعتمد على
// جلسات العضو الشخصية (verifyMemberBearer)، وترفض توكنات البوت (botpub_*)،
// والمصادقة الثنائية (2FA) اختيارية منذ 2026-10-31، وتطبق صلاحيات RBAC الحية لكل طلب،
// وتسجل كل عملية كتابة في activity_logs بالقناة 'staff-app' ومعرّف الجهاز.
//
// التوثيق: docs/systems/editorial/STAFF_APP_API.md
// ----------------------------------------------------------------------------

import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import { isBotPublisherToken } from "@shared/botPublisherTokens";
import {
  STAFF_APP_AUDIT_CHANNEL,
  STAFF_APP_BASE_PATH,
  DEFAULT_STAFF_ALERT_PREFS,
  type StaffAlertPrefs,
  staffAlertPrefsUpdateSchema,
  staffAiBalanceProviderSchema,
  staffAiBalanceThresholdSchema,
  staffAiBalanceTopupSchema,
  staffInboxQuerySchema,
  staffOpinionBoardQuerySchema,
  staffOpinionPrepareSchema,
  staffOpinionReturnSchema,
  staffOpinionScheduleSchema,
  staffOpinionSlotCheckQuerySchema,
  staffSocialPublishSchema,
  staffSocialRejectSchema,
  staffSocialScheduleSchema,
  staffTicketReplySchema,
  staffTicketStatusSchema,
  type StaffAppErrorBody,
  type StaffCapabilities,
  type StaffOpinionRenotifyResponse,
} from "@shared/staffApp";
import { logActivity } from "../rbac";
import { verifyMemberBearer } from "../services/memberSessionService";
import {
  OpinionTicketServiceError,
  appendOpinionTicketMessage,
  getOpinionTicketWithMessages,
  updateOpinionTicketStatus,
} from "../services/opinionTicketsService";
import {
  SocialPublishValidationError,
  assertValidScheduleTime,
  cancelPost,
  claimPostForImmediatePublish,
  getPost,
  publishClaimedPost,
  resolveCancelReason,
  returnPostToDraft,
  schedulePost,
} from "../services/socialPublishing/socialPublishingService";
import { SocialProviderError } from "../services/socialPublishing/types";
import { getStaffAdminAlerts } from "../services/staffAdminAlertsService";
import { getStaffAlertPrefs, updateStaffAlertPrefs } from "../services/staffAlertPrefsService";
import { getStaffSystemHealth } from "../services/staffSystemHealthService";
import {
  StaffOpinionDeskError,
  checkOpinionSlotClashes,
  getStaffOpinionBoard,
  getStaffOpinionItem,
  getStaffOpinionPreview,
  getWriterOpinionContext,
  publishOpinionFromDesk,
  renotifyOpinionDraftFromDesk,
  returnOpinionToWriterFromDesk,
  scheduleOpinionFromDesk,
} from "../services/staffOpinionDeskService";
import { getOpinionPrepJob, startOpinionPrep } from "../services/staffOpinionPrepareService";
import {
  StaffDeskEventsCursorError,
  getStaffDeskUnread,
  listStaffDeskNotifications,
  markStaffDeskNotificationRead,
  markStaffDeskNotificationsSeen,
} from "../services/staffDeskEventsService";
import { staffDeskNotificationsQuerySchema } from "@shared/staffNotifications";
import { registerStaffNewsRoutes } from "./staffNewsDesk";
import {
  AiBalanceInputError,
  auditSnapshot as auditBalanceSnapshot,
  getAllBalances,
  getProviderBalance,
  saveBalanceThreshold,
  saveBalanceTopup,
} from "../services/aiBalanceService";
import {
  StaffInboxCursorError,
  buildStaffTicketDetailSender,
  getStaffSocialPostDetail,
  getStaffUnreadCounts,
  getStaffUserAccount,
  listStaffUnifiedInbox,
  resolveStaffCapabilitiesAndRoles,
  type StaffAuthContext,
} from "../services/staffAppService";

type StaffRequest = Request & { staffAuth?: StaffAuthContext };

const subRouter = Router();
const router = Router();

function sendError(res: Response, status: number, body: StaffAppErrorBody): void {
  res.status(status).json(body);
}

function extractInstallationId(req: Request): string | null {
  const raw = req.headers["x-installation-id"];
  const val = Array.isArray(raw) ? raw[0] : raw;
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

subRouter.use(
  rateLimit({
    windowMs: 60_000,
    limit: () => Number(process.env.STAFF_APP_READ_RATE_LIMIT) || 120,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
  }),
);

async function requireStaffAuth(req: StaffRequest, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const authHeader = req.headers.authorization?.trim() ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    const rawToken = match?.[1]?.trim();

    if (!rawToken || isBotPublisherToken(rawToken)) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="sabq-staff-app"');
      return sendError(res, 401, {
        code: "unauthorized",
        message: "جلسة غير صالحة أو منتهية",
      });
    }

    const session = await verifyMemberBearer(req);
    if (!session?.userId) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="sabq-staff-app"');
      return sendError(res, 401, {
        code: "unauthorized",
        message: "جلسة غير صالحة أو منتهية",
      });
    }

    const user = await getStaffUserAccount(session.userId);
    if (!user) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="sabq-staff-app"');
      return sendError(res, 401, {
        code: "unauthorized",
        message: "الحساب غير متاح",
      });
    }

    // المصادقة الثنائية اختيارية منذ 2026-10-31 (قرار المالك)، مثل لوحة الويب
    // وتطبيق «سبق». التطبيق ما زال يفهم 403 two_factor_required من النسخ القديمة.

    const { roles, capabilities } = await resolveStaffCapabilitiesAndRoles(
      user.id,
      user.role,
    );

    req.staffAuth = {
      user,
      roles,
      capabilities,
    };

    return next();
  } catch (error) {
    console.error("[StaffApp] authentication failed:", error);
    return sendError(res, 500, {
      code: "server_error",
      message: "خدمة التحقق من الجلسة غير متاحة مؤقتاً",
    });
  }
}

function requireTicketAccess(req: StaffRequest, res: Response, next: NextFunction) {
  const ctx = req.staffAuth;
  if (!ctx) {
    return sendError(res, 401, { code: "unauthorized", message: "Unauthorized" });
  }
  if (!ctx.capabilities.canTickets) {
    return sendError(res, 403, {
      code: "forbidden",
      message: "لا تملك صلاحية الوصول إلى استفسارات المساهمين",
    });
  }
  return next();
}

function requireSocialCapability(key: keyof StaffCapabilities["canSocial"]) {
  return (req: StaffRequest, res: Response, next: NextFunction) => {
    const ctx = req.staffAuth;
    if (!ctx) {
      return sendError(res, 401, { code: "unauthorized", message: "Unauthorized" });
    }
    if (!ctx.capabilities.canSocial[key]) {
      return sendError(res, 403, {
        code: "forbidden",
        message: "لا توجد لديك صلاحيات للوصول إلى هذه الخدمة",
      });
    }
    return next();
  };
}

const staffSocialActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: () => Number(process.env.STAFF_APP_SOCIAL_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) =>
    `staff-app-social:${(req as StaffRequest).staffAuth?.user.id ?? "anonymous"}`,
  handler: (_req, res) =>
    sendError(res, 429, {
      code: "rate_limited",
      message: "محاولات كثيرة خلال فترة قصيرة؛ انتظر قليلاً",
    }),
});

async function auditStaffAppWrite(
  req: StaffRequest,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    extraMetadata?: Record<string, unknown>;
  },
): Promise<void> {
  const ctx = req.staffAuth;
  if (!ctx) return;
  try {
    const installationId = extractInstallationId(req);
    await logActivity({
      userId: ctx.user.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      metadata: {
        channel: STAFF_APP_AUDIT_CHANNEL,
        userId: ctx.user.id,
        installationId,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        ...(entry.extraMetadata ?? {}),
      },
    });
  } catch (err) {
    console.error("[StaffApp] audit log failed:", err);
  }
}

function handleTicketError(res: Response, error: unknown, action: string): void {
  if (error instanceof OpinionTicketServiceError) {
    return sendError(res, error.status, {
      code: error.code,
      message: error.message,
    });
  }
  console.error(`[StaffApp tickets] ${action} failed:`, error);
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
  console.error("[StaffApp social]", error);
  sendError(res, 500, { code: "server_error", message: fallback });
}

// ── 1) الهوية والقدرات (/me) ─────────────────────────────────────────

function requireAdminCapability(key: "canSystemHealth" | "canAdminAlerts" | "canManageBalances") {
  return (req: StaffRequest, res: Response, next: NextFunction) => {
    const ctx = req.staffAuth;
    if (!ctx) {
      return sendError(res, 401, { code: "unauthorized", message: "Unauthorized" });
    }
    if (!ctx.capabilities[key]) {
      return sendError(res, 403, {
        code: "forbidden",
        message:
          key === "canManageBalances"
            ? "تحديث الأرصدة وحدود التنبيه يتطلب صلاحية إدارة مركز الذكاء الاصطناعي"
            : "هذه الخدمة متاحة للمشرفين فقط",
      });
    }
    return next();
  };
}

subRouter.get("/me", requireStaffAuth, async (req: StaffRequest, res: Response) => {
  const ctx = req.staffAuth!;
  // تفضيلات التنبيهات لكل عضو (رسائل الكتّاب، مقترحات X، الساعات الهادئة،
  // ومفاتيح المشرفين). إن تعذّرت قراءتها تُعاد الافتراضية بدل إفشال /me.
  let alertPrefs: StaffAlertPrefs;
  try {
    alertPrefs = await getStaffAlertPrefs(ctx.user.id);
  } catch (error) {
    console.error("[StaffApp me] alert prefs failed:", error);
    alertPrefs = { ...DEFAULT_STAFF_ALERT_PREFS };
  }
  res.json({
    id: ctx.user.id,
    email: ctx.user.email,
    name: ctx.user.name,
    firstName: ctx.user.firstName,
    lastName: ctx.user.lastName,
    profileImageUrl: ctx.user.profileImageUrl,
    role: ctx.user.role,
    twoFactorEnabled: ctx.user.twoFactorEnabled,
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      firstName: ctx.user.firstName,
      lastName: ctx.user.lastName,
      profileImageUrl: ctx.user.profileImageUrl,
      role: ctx.user.role,
      twoFactorEnabled: ctx.user.twoFactorEnabled,
    },
    roles: ctx.roles,
    capabilities: ctx.capabilities,
    alertPrefs,
  });
});

// ── 1-ب) تفضيلات التنبيهات لكل عضو (/me/alert-prefs) ────────────────
// مفتاحا aiAlerts/adminAlerts لا أثر لهما إلا لمن يملك ai_hub.view (الإرسال
// نفسه محصور فيهم)، فلا حاجة لحجب المسار عن بقية الأعضاء.

subRouter.get(
  "/me/alert-prefs",
  requireStaffAuth,
  async (req: StaffRequest, res: Response) => {
    try {
      res.json(await getStaffAlertPrefs(req.staffAuth!.user.id));
    } catch (error) {
      console.error("[StaffApp alert-prefs] read failed:", error);
      sendError(res, 500, { code: "server_error", message: "تعذر جلب تفضيلات التنبيهات" });
    }
  },
);

subRouter.put(
  "/me/alert-prefs",
  requireStaffAuth,
  async (req: StaffRequest, res: Response) => {
    const parsed = staffAlertPrefsUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "تفضيلات التنبيهات غير صالحة",
        details: parsed.error.flatten(),
      });
    }
    try {
      const ctx = req.staffAuth!;
      const prefs = await updateStaffAlertPrefs(ctx.user.id, parsed.data);
      await auditStaffAppWrite(req, {
        action: "staff_alert_prefs_update",
        entityType: "staff_alert_prefs",
        entityId: ctx.user.id,
        newValue: { ...prefs },
      });
      res.json(prefs);
    } catch (error) {
      console.error("[StaffApp alert-prefs] update failed:", error);
      sendError(res, 500, { code: "server_error", message: "تعذر حفظ تفضيلات التنبيهات" });
    }
  },
);

// ── 1-ج) صحة النظام وتنبيهات الإدارة (/system/health, /alerts) ───────

subRouter.get(
  "/system/health",
  requireStaffAuth,
  requireAdminCapability("canSystemHealth"),
  async (req: StaffRequest, res: Response) => {
    try {
      const prefs = await getStaffAlertPrefs(req.staffAuth!.user.id).catch(() => null);
      res.json(await getStaffSystemHealth({ aiAlertsEnabled: prefs?.aiAlerts ?? true }));
    } catch (error) {
      console.error("[StaffApp system/health] error:", error);
      sendError(res, 500, { code: "server_error", message: "تعذر جلب صحة النظام" });
    }
  },
);

subRouter.get(
  "/alerts",
  requireStaffAuth,
  requireAdminCapability("canAdminAlerts"),
  async (req: StaffRequest, res: Response) => {
    try {
      res.json(
        await getStaffAdminAlerts({
          canRetrySocial: req.staffAuth!.capabilities.canSocial.publish,
        }),
      );
    } catch (error) {
      console.error("[StaffApp alerts] error:", error);
      sendError(res, 500, { code: "server_error", message: "تعذر جلب التنبيهات" });
    }
  },
);

// ── 1-د) أرصدة النماذج (/system/balances) — بنفس حراسة صحة النظام ──────

function parseBalanceProvider(req: StaffRequest, res: Response) {
  const parsed = staffAiBalanceProviderSchema.safeParse(req.params.provider);
  if (!parsed.success) {
    sendError(res, 404, { code: "not_found", message: "مزوّد غير معروف" });
    return null;
  }
  return parsed.data;
}

function balanceInputError(res: Response, error: unknown): boolean {
  if (error instanceof AiBalanceInputError) {
    sendError(res, 400, { code: "validation_error", message: error.message, details: { reason: error.code } });
    return true;
  }
  return false;
}

subRouter.get(
  "/system/balances",
  requireStaffAuth,
  requireAdminCapability("canSystemHealth"),
  async (req: StaffRequest, res: Response) => {
    try {
      // نسخة سطحية: القائمة قد تأتي من الذاكرة المؤقتة المشتركة بين المستخدمين.
      res.json({ ...(await getAllBalances()), canManage: req.staffAuth!.capabilities.canManageBalances });
    } catch (error) {
      console.error("[StaffApp system/balances] error:", error);
      sendError(res, 500, { code: "server_error", message: "تعذر جلب أرصدة النماذج" });
    }
  },
);

subRouter.get(
  "/system/balances/:provider",
  requireStaffAuth,
  requireAdminCapability("canSystemHealth"),
  async (req: StaffRequest, res: Response) => {
    const provider = parseBalanceProvider(req, res);
    if (!provider) return;
    try {
      res.json({ ...(await getProviderBalance(provider)), canManage: req.staffAuth!.capabilities.canManageBalances });
    } catch (error) {
      console.error("[StaffApp system/balances/:provider] error:", error);
      sendError(res, 500, { code: "server_error", message: "تعذر جلب رصيد المزوّد" });
    }
  },
);

subRouter.post(
  "/system/balances/:provider/topup",
  requireStaffAuth,
  requireAdminCapability("canSystemHealth"),
  requireAdminCapability("canManageBalances"),
  async (req: StaffRequest, res: Response) => {
    const provider = parseBalanceProvider(req, res);
    if (!provider) return;
    const parsed = staffAiBalanceTopupSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, { code: "validation_error", message: "بيانات غير صالحة", details: parsed.error.flatten() });
      return;
    }
    const ctx = req.staffAuth!;
    try {
      const result = await saveBalanceTopup(provider, parsed.data, { id: ctx.user.id, name: ctx.user.name });
      await auditStaffAppWrite(req, {
        action: "ai_balance_topup",
        entityType: "ai_balance",
        entityId: provider,
        oldValue: auditBalanceSnapshot(result.before),
        newValue: auditBalanceSnapshot(result.after),
        extraMetadata: { mode: parsed.data.mode, amountUsd: parsed.data.amountUsd, byName: ctx.user.name },
      });
      res.json({ ...result.balance, canManage: true });
    } catch (error) {
      if (balanceInputError(res, error)) return;
      console.error("[StaffApp system/balances topup] error:", error);
      sendError(res, 500, { code: "server_error", message: "تعذر حفظ الرصيد" });
    }
  },
);

subRouter.put(
  "/system/balances/:provider/threshold",
  requireStaffAuth,
  requireAdminCapability("canSystemHealth"),
  requireAdminCapability("canManageBalances"),
  async (req: StaffRequest, res: Response) => {
    const provider = parseBalanceProvider(req, res);
    if (!provider) return;
    const parsed = staffAiBalanceThresholdSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      sendError(res, 400, { code: "validation_error", message: "بيانات غير صالحة", details: parsed.error.flatten() });
      return;
    }
    const ctx = req.staffAuth!;
    try {
      const result = await saveBalanceThreshold(provider, parsed.data.threshold, { id: ctx.user.id, name: ctx.user.name });
      await auditStaffAppWrite(req, {
        action: "ai_balance_threshold",
        entityType: "ai_balance",
        entityId: provider,
        oldValue: auditBalanceSnapshot(result.before),
        newValue: auditBalanceSnapshot(result.after),
        extraMetadata: { byName: ctx.user.name },
      });
      res.json({ ...result.balance, canManage: true });
    } catch (error) {
      if (balanceInputError(res, error)) return;
      console.error("[StaffApp system/balances threshold] error:", error);
      sendError(res, 500, { code: "server_error", message: "تعذر حفظ حد التنبيه" });
    }
  },
);

// ── 2) الصندوق الموحد والعدادات (/inbox, /unread-counts) ─────────────

subRouter.get("/inbox", requireStaffAuth, async (req: StaffRequest, res: Response) => {
  const parsed = staffInboxQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, {
      code: "validation_error",
      message: "معاملات الاستعلام غير صالحة",
      details: parsed.error.flatten(),
    });
  }

  const ctx = req.staffAuth!;
  const { type, status, unread, q, cursor, limit } = parsed.data;

  if (type === "ticket" && !ctx.capabilities.canTickets) {
    return sendError(res, 403, {
      code: "forbidden",
      message: "لا تملك صلاحية الوصول إلى استفسارات المساهمين",
    });
  }
  if (type === "social" && !ctx.capabilities.canSocial.view) {
    return sendError(res, 403, {
      code: "forbidden",
      message: "لا توجد لديك صلاحيات للوصول إلى مقترحات النشر الاجتماعي",
    });
  }
  if (type === "all" && !ctx.capabilities.canTickets && !ctx.capabilities.canSocial.view) {
    return sendError(res, 403, {
      code: "forbidden",
      message: "لا تملك صلاحية الوصول إلى صندوق الديسك",
    });
  }

  try {
    const result = await listStaffUnifiedInbox({
      userId: ctx.user.id,
      canTickets: ctx.capabilities.canTickets,
      canSocialView: ctx.capabilities.canSocial.view,
      type,
      status,
      unread,
      q,
      cursor,
      limit,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof StaffInboxCursorError) {
      return sendError(res, 400, {
        code: "validation_error",
        message: error.message,
      });
    }
    console.error("[StaffApp inbox] error:", error);
    sendError(res, 500, { code: "server_error", message: "تعذر جلب عناصر الصندوق" });
  }
});

subRouter.get("/unread-counts", requireStaffAuth, async (req: StaffRequest, res: Response) => {
  const ctx = req.staffAuth!;
  if (!ctx.capabilities.canTickets && !ctx.capabilities.canSocial.view) {
    return sendError(res, 403, {
      code: "forbidden",
      message: "لا تملك صلاحية الوصول إلى صندوق الديسك",
    });
  }

  try {
    const counts = await getStaffUnreadCounts({
      userId: ctx.user.id,
      canTickets: ctx.capabilities.canTickets,
      canSocialView: ctx.capabilities.canSocial.view,
    });
    res.json(counts);
  } catch (error) {
    console.error("[StaffApp unread-counts] error:", error);
    sendError(res, 500, { code: "server_error", message: "تعذر جلب عدد غير المقروء" });
  }
});

// ── 3) استفسارات المساهمين (/tickets/:id, /reply, /status) ────────────

subRouter.get(
  "/tickets/:id",
  requireStaffAuth,
  requireTicketAccess,
  async (req: StaffRequest, res: Response) => {
    try {
      const detail = await getOpinionTicketWithMessages({
        ticketId: req.params.id,
        viewerId: req.staffAuth!.user.id,
        isAdmin: true,
      });
      // سطر سياق الكاتب أعلى المحادثة؛ تعذره لا يُفشل فتح الرسالة.
      const writerContext = detail.ticket.authorKind === "opinion_author" || detail.ticket.authorKind === "angle_writer"
        ? await getWriterOpinionContext(detail.ticket.writerId).catch((err) => {
          console.warn("[staff] writer context failed", { ticketId: detail.ticket.id, err: err instanceof Error ? err.message : String(err) });
          return null;
        })
        : null;
      res.json({
        ticket: {
          ...detail.ticket,
          sender: buildStaffTicketDetailSender(detail.ticket),
          deeplink: `sabqdesk://ticket/${detail.ticket.id}`,
        },
        messages: detail.messages,
        writerContext,
      });
    } catch (error) {
      handleTicketError(res, error, "detail");
    }
  },
);

subRouter.post(
  "/tickets/:id/reply",
  requireStaffAuth,
  requireTicketAccess,
  async (req: StaffRequest, res: Response) => {
    const parsed = staffTicketReplySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "بيانات الرد غير صالحة",
        details: parsed.error.flatten(),
      });
    }

    try {
      const ctx = req.staffAuth!;
      const result = await appendOpinionTicketMessage({
        ticketId: req.params.id,
        senderId: ctx.user.id,
        senderFirstName: ctx.user.firstName,
        senderLastName: ctx.user.lastName,
        isAdmin: true,
        message: parsed.data.message,
        parentMessageId: parsed.data.parentMessageId ?? null,
        forceAdminRole: true,
      });

      await auditStaffAppWrite(req, {
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
          senderName: ctx.user.name,
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

subRouter.patch(
  "/tickets/:id/status",
  requireStaffAuth,
  requireTicketAccess,
  async (req: StaffRequest, res: Response) => {
    const parsed = staffTicketStatusSchema.safeParse(req.body ?? {});
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

      await auditStaffAppWrite(req, {
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

// ── 4) مقترحات النشر الاجتماعي (/social/:id, /publish, /schedule, /reject) ─

async function handleGetSocialPost(req: StaffRequest, res: Response) {
  try {
    const detail = await getStaffSocialPostDetail(req.params.id);
    if (!detail) {
      return sendError(res, 404, { code: "not_found", message: "المنشور غير موجود" });
    }
    res.json({
      ...detail,
      deeplink: `sabqdesk://social/${detail.post.id}`,
    });
  } catch (error) {
    handleSocialError(res, error, "تعذر جلب المنشور");
  }
}

async function handlePublishSocialPost(req: StaffRequest, res: Response) {
  const parsed = staffSocialPublishSchema.safeParse(req.body ?? {});
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

    const result = await publishClaimedPost(claimed, req.staffAuth!.user.id);
    await auditStaffAppWrite(req, {
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
}

async function handleScheduleSocialPost(req: StaffRequest, res: Response) {
  const parsed = staffSocialScheduleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, {
      code: "validation_error",
      message: "صيغة وقت الجدولة غير صالحة (ISO مع المنطقة الزمنية)",
      details: parsed.error.flatten(),
    });
  }

  const scheduledDate = new Date(parsed.data.scheduledAt);
  try {
    assertValidScheduleTime(scheduledDate);
  } catch (validationErr) {
    return handleSocialError(res, validationErr, "وقت الجدولة غير صالح");
  }

  try {
    const existing = await getPost(req.params.id);
    if (!existing) {
      return sendError(res, 404, { code: "not_found", message: "المنشور غير موجود" });
    }
    const post = await schedulePost(req.params.id, scheduledDate, {
      resetAttempts: true,
      actorUserId: req.staffAuth!.user.id,
    });
    await auditStaffAppWrite(req, {
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
}

async function handleRejectSocialPost(req: StaffRequest, res: Response) {
  const parsed = staffSocialRejectSchema.safeParse(req.body ?? {});
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
    // نفس قاعدة الويب: سبب الرفض إلزامي إلا إذا سحب صاحب المنشور منشوره.
    // resolveCancelReason يرمي SocialPublishValidationError(400) فيحوّله
    // handleSocialError إلى validation_error بالرسالة العربية.
    const reason = resolveCancelReason(existing, req.staffAuth!.user.id, parsed.data.reason);
    const post = await cancelPost(req.params.id, req.staffAuth!.user.id, reason);
    await auditStaffAppWrite(req, {
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
}

/**
 * يعيد المقترح إلى «بانتظار القرار»: من المجدول (إلغاء الجدولة، يحتاج
 * صلاحية الجدولة) أو من المرفوض (التراجع عن الرفض، يحتاج صلاحية الرفض).
 */
async function handleReturnSocialPostToDraft(req: StaffRequest, res: Response) {
  const parsed = staffSocialPublishSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendError(res, 400, {
      code: "validation_error",
      message: "الإعادة لا تقبل حقولاً في الجسم",
      details: parsed.error.flatten(),
    });
  }
  try {
    const existing = await getPost(req.params.id);
    if (!existing) {
      return sendError(res, 404, { code: "not_found", message: "المنشور غير موجود" });
    }
    if (existing.status !== "scheduled" && existing.status !== "canceled") {
      return sendError(res, 409, {
        code: "conflict",
        message: "لا يمكن إعادة هذا المنشور إلى الانتظار في حالته الحالية",
        post: existing,
      });
    }
    const social = req.staffAuth!.capabilities.canSocial;
    const allowed = existing.status === "scheduled" ? social.schedule : social.reject;
    if (!allowed) {
      return sendError(res, 403, {
        code: "forbidden",
        message: "لا توجد لديك صلاحيات للوصول إلى هذه الخدمة",
      });
    }
    const post = await returnPostToDraft(req.params.id);
    await auditStaffAppWrite(req, {
      action: "social_post_return_to_draft",
      entityType: "social_post",
      entityId: post.id,
      oldValue: { status: existing.status, scheduledAt: existing.scheduledAt },
      newValue: { status: post.status },
    });
    res.json({ post });
  } catch (error) {
    handleSocialError(res, error, "تعذرت إعادة المنشور إلى الانتظار");
  }
}

for (const prefix of ["/social", "/social/posts"] as const) {
  subRouter.get(
    `${prefix}/:id`,
    requireStaffAuth,
    requireSocialCapability("view"),
    handleGetSocialPost,
  );
  subRouter.post(
    `${prefix}/:id/publish`,
    requireStaffAuth,
    requireSocialCapability("publish"),
    staffSocialActionLimiter,
    handlePublishSocialPost,
  );
  subRouter.post(
    `${prefix}/:id/schedule`,
    requireStaffAuth,
    requireSocialCapability("schedule"),
    staffSocialActionLimiter,
    handleScheduleSocialPost,
  );
  subRouter.post(
    `${prefix}/:id/reject`,
    requireStaffAuth,
    requireSocialCapability("reject"),
    staffSocialActionLimiter,
    handleRejectSocialPost,
  );
  subRouter.post(
    `${prefix}/:id/return-to-draft`,
    requireStaffAuth,
    staffSocialActionLimiter,
    handleReturnSocialPostToDraft,
  );
}

// ── 5) تبويب الرأي (/opinion/*) ──────────────────────────────────────
// الصلاحيات في computeStaffOpinionCapabilities (shared/staffApp.ts).

function requireOpinionCapability(key: keyof StaffCapabilities["canOpinion"]) {
  return (req: StaffRequest, res: Response, next: NextFunction) => {
    const ctx = req.staffAuth;
    if (!ctx) {
      return sendError(res, 401, { code: "unauthorized", message: "Unauthorized" });
    }
    const caps = ctx.capabilities.canOpinion;
    if (!caps?.view || !caps[key]) {
      return sendError(res, 403, {
        code: "forbidden",
        message: "لا تملك صلاحية هذا الإجراء على مقالات الرأي",
      });
    }
    return next();
  };
}

const staffOpinionActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: () => Number(process.env.STAFF_APP_OPINION_RATE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) =>
    `staff-app-opinion:${(req as StaffRequest).staffAuth?.user.id ?? "anonymous"}`,
  handler: (_req, res) =>
    sendError(res, 429, {
      code: "rate_limited",
      message: "محاولات كثيرة خلال فترة قصيرة؛ انتظر قليلاً",
    }),
});

/** إعادة التنبيه: مرة لكل مقال لكل مستخدم كل 5 دقائق (الطلبات الفاشلة 4xx/5xx لا تُحتسب). */
const staffOpinionRenotifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: () => Number(process.env.STAFF_APP_OPINION_RENOTIFY_RATE_LIMIT) || 1,
  skipFailedRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) =>
    `staff-app-opinion-renotify:${(req as StaffRequest).staffAuth?.user.id ?? "anonymous"}:${req.params?.id ?? ""}`,
  handler: (_req, res) =>
    sendError(res, 429, {
      code: "rate_limited",
      message: "أُرسل تنبيه هذا المقال قبل قليل؛ أعد المحاولة بعد 5 دقائق",
    }),
});

function handleOpinionError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof StaffOpinionDeskError) {
    return sendError(res, error.status, { code: error.code, message: error.message });
  }
  console.error("[StaffApp opinion]", error);
  sendError(res, 500, { code: "server_error", message: fallback });
}

subRouter.get(
  "/opinion/board",
  requireStaffAuth,
  requireOpinionCapability("view"),
  async (req: StaffRequest, res: Response) => {
    const parsed = staffOpinionBoardQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "تاريخ بداية الأسبوع غير صالح",
      });
    }
    try {
      res.json(await getStaffOpinionBoard({ weekStart: parsed.data.weekStart }));
    } catch (error) {
      handleOpinionError(res, error, "تعذر جلب مقالات الرأي");
    }
  },
);

subRouter.get(
  "/opinion/:id/slot-check",
  requireStaffAuth,
  requireOpinionCapability("schedule"),
  async (req: StaffRequest, res: Response) => {
    const parsed = staffOpinionSlotCheckQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "صيغة وقت الجدولة غير صالحة",
      });
    }
    try {
      const scheduledAt = new Date(parsed.data.scheduledAt);
      const warnings = await checkOpinionSlotClashes(req.params.id, scheduledAt);
      res.json({ scheduledAt: scheduledAt.toISOString(), warnings });
    } catch (error) {
      handleOpinionError(res, error, "تعذر فحص الموعد");
    }
  },
);

subRouter.get(
  "/opinion/:id",
  requireStaffAuth,
  requireOpinionCapability("view"),
  async (req: StaffRequest, res: Response) => {
    try {
      res.json(await getStaffOpinionItem(req.params.id));
    } catch (error) {
      handleOpinionError(res, error, "تعذر جلب المقال");
    }
  },
);

// «استعراض المقال»: قبل النشر يقرأ المحرر النص داخل التطبيق، وبعده يفتح الصفحة المنشورة.
subRouter.get(
  "/opinion/:id/content",
  requireStaffAuth,
  requireOpinionCapability("view"),
  async (req: StaffRequest, res: Response) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      res.json(await getStaffOpinionPreview(req.params.id));
    } catch (error) {
      handleOpinionError(res, error, "تعذر جلب نص المقال");
    }
  },
);

subRouter.post(
  "/opinion/:id/schedule",
  requireStaffAuth,
  requireOpinionCapability("schedule"),
  staffOpinionActionLimiter,
  async (req: StaffRequest, res: Response) => {
    const parsed = staffOpinionScheduleSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "أرسل mode=fixed_slot أو scheduledAt (ISO مع المنطقة الزمنية)",
        details: parsed.error.flatten(),
      });
    }
    try {
      const result = await scheduleOpinionFromDesk({
        articleId: req.params.id,
        actorId: req.staffAuth!.user.id,
        request: parsed.data,
      });
      await auditStaffAppWrite(req, {
        action: "staff_opinion_schedule",
        entityType: "article",
        entityId: result.article.id,
        oldValue: result.previous,
        newValue: { status: result.article.status, scheduledAt: result.scheduledAt },
        extraMetadata: {
          mode: "mode" in parsed.data ? parsed.data.mode : "custom",
          warnings: result.warnings.map((w) => w.otherArticleId),
        },
      });
      res.json({
        article: result.article,
        scheduledAt: result.scheduledAt,
        warnings: result.warnings,
      });
    } catch (error) {
      handleOpinionError(res, error, "تعذرت جدولة المقال");
    }
  },
);

subRouter.post(
  "/opinion/:id/publish",
  requireStaffAuth,
  requireOpinionCapability("publish"),
  staffOpinionActionLimiter,
  async (req: StaffRequest, res: Response) => {
    const parsed = staffSocialPublishSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: "النشر الفوري لا يقبل حقولاً في الجسم",
      });
    }
    try {
      const result = await publishOpinionFromDesk({
        articleId: req.params.id,
        actorId: req.staffAuth!.user.id,
      });
      await auditStaffAppWrite(req, {
        action: "staff_opinion_publish",
        entityType: "article",
        entityId: result.article.id,
        oldValue: result.previous,
        newValue: { status: result.article.status, publishedAt: result.article.publishedAt },
      });
      res.json({ article: result.article });
    } catch (error) {
      handleOpinionError(res, error, "تعذر نشر المقال");
    }
  },
);

subRouter.post(
  "/opinion/:id/return-to-writer",
  requireStaffAuth,
  requireOpinionCapability("returnToWriter"),
  staffOpinionActionLimiter,
  async (req: StaffRequest, res: Response) => {
    const parsed = staffOpinionReturnSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "اكتب ملاحظتك للكاتب",
      });
    }
    try {
      const result = await returnOpinionToWriterFromDesk({
        articleId: req.params.id,
        actorId: req.staffAuth!.user.id,
        note: parsed.data.note,
      });
      await auditStaffAppWrite(req, {
        action: "staff_opinion_return_to_writer",
        entityType: "article",
        entityId: result.article.id,
        oldValue: result.previous,
        newValue: { status: result.article.status, reviewStatus: result.article.reviewStatus },
        extraMetadata: { noteLength: parsed.data.note.length },
      });
      res.json({ article: result.article });
    } catch (error) {
      handleOpinionError(res, error, "تعذرت إعادة المقال إلى الكاتب");
    }
  },
);

/**
 * «أعد التنبيه»: يعيد push تطبيق الديسك وبريد بوت «مكتب سبق» (type=opinion_draft)
 * لمسودة رأي بانتظار المراجعة. لا يغيّر المقال ولا يُشعر الكاتب.
 */
subRouter.post(
  "/opinion/:id/renotify",
  requireStaffAuth,
  requireOpinionCapability("view"),
  staffOpinionRenotifyLimiter,
  async (req: StaffRequest, res: Response) => {
    try {
      const result = await renotifyOpinionDraftFromDesk({ articleId: req.params.id });
      await auditStaffAppWrite(req, {
        action: "staff_opinion_renotify",
        entityType: "article",
        entityId: result.articleId,
        extraMetadata: {
          pushSent: result.pushSent,
          emailRecipients: result.emailRecipients,
          emailSent: result.emailSent,
        },
      });
      const body: StaffOpinionRenotifyResponse = {
        ok: true,
        pushSent: result.pushSent,
        emailSent: result.emailSent,
        emailRecipients: result.emailRecipients,
      };
      res.json(body);
    } catch (error) {
      handleOpinionError(res, error, "تعذرت إعادة إرسال التنبيه");
    }
  },
);

/**
 * «جهّز وجدول»: تدقيق ← ملحقات ← صورة GPT Sunburst ← جدولة في موعد الكاتب
 * (أو scheduledAt). يعمل في الخلفية: 202 + الحالة، ثم GET للمتابعة.
 */
subRouter.post(
  "/opinion/:id/prepare",
  requireStaffAuth,
  requireOpinionCapability("schedule"),
  staffOpinionActionLimiter,
  async (req: StaffRequest, res: Response) => {
    const parsed = staffOpinionPrepareSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return sendError(res, 400, {
        code: "validation_error",
        message: parsed.error.issues[0]?.message ?? "أرسل جسماً فارغاً أو scheduledAt",
      });
    }
    try {
      const { job, created } = await startOpinionPrep({
        articleId: req.params.id,
        actorId: req.staffAuth!.user.id,
        scheduledAt: parsed.data.scheduledAt,
      });
      if (created) {
        await auditStaffAppWrite(req, {
          action: "staff_opinion_prepare_start",
          entityType: "article",
          entityId: job.articleId,
          extraMetadata: { scheduledAt: parsed.data.scheduledAt ?? "fixed_slot" },
        });
      }
      res.status(202).json({ job });
    } catch (error) {
      handleOpinionError(res, error, "تعذر بدء التجهيز");
    }
  },
);

subRouter.get(
  "/opinion/:id/prepare",
  requireStaffAuth,
  requireOpinionCapability("view"),
  async (req: StaffRequest, res: Response) => {
    try {
      const job = await getOpinionPrepJob(req.params.id);
      if (!job) return sendError(res, 404, { code: "not_found", message: "لا يوجد تجهيز لهذا المقال" });
      res.json({ job });
    } catch (error) {
      handleOpinionError(res, error, "تعذر جلب حالة التجهيز");
    }
  },
);

// ── 5ب) تبويب «الأخبار» (/news) — 2026-10-31 ─────────────────────────
// مسودات المراسلين والبريد وطلبات التعديل؛ المسارات في routes/staffNewsDesk.ts.
registerStaffNewsRoutes(subRouter, {
  requireStaffAuth: requireStaffAuth as unknown as RequestHandler,
  sendError,
  audit: auditStaffAppWrite,
});

// ── 6) مركز التنبيهات (/notifications) — 2026-10-29 ──────────────────
// خط زمني لأحداث التغريدات ومقالات الرأي وأخبار «نشر سبق». كل عضو يرى
// الفئات التي تفتحها صلاحياته فقط (visibleStaffDeskCategories).

subRouter.get("/notifications", requireStaffAuth, async (req: StaffRequest, res: Response) => {
  const parsed = staffDeskNotificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, {
      code: "validation_error",
      message: "معاملات الاستعلام غير صالحة",
      details: parsed.error.flatten(),
    });
  }
  try {
    const ctx = req.staffAuth!;
    res.json(await listStaffDeskNotifications(ctx.capabilities, ctx.user.id, parsed.data));
  } catch (error) {
    if (error instanceof StaffDeskEventsCursorError) {
      return sendError(res, 400, { code: "validation_error", message: error.message });
    }
    console.error("[StaffApp notifications] error:", error);
    sendError(res, 500, { code: "server_error", message: "تعذر جلب التنبيهات" });
  }
});

subRouter.get("/notifications/unread", requireStaffAuth, async (req: StaffRequest, res: Response) => {
  try {
    const ctx = req.staffAuth!;
    res.json(await getStaffDeskUnread(ctx.capabilities, ctx.user.id));
  } catch (error) {
    console.error("[StaffApp notifications/unread] error:", error);
    sendError(res, 500, { code: "server_error", message: "تعذر جلب عدد التنبيهات" });
  }
});

subRouter.post("/notifications/seen", requireStaffAuth, async (req: StaffRequest, res: Response) => {
  try {
    const seenAt = await markStaffDeskNotificationsSeen(req.staffAuth!.user.id);
    res.json({ unreadCount: 0, seenAt });
  } catch (error) {
    console.error("[StaffApp notifications/seen] error:", error);
    sendError(res, 500, { code: "server_error", message: "تعذر تعليم التنبيهات كمقروءة" });
  }
});

subRouter.post("/notifications/:id/read", requireStaffAuth, async (req: StaffRequest, res: Response) => {
  const id = String(req.params.id || "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return sendError(res, 400, { code: "validation_error", message: "معرّف التنبيه غير صالح" });
  }
  try {
    await markStaffDeskNotificationRead(req.staffAuth!.user.id, id);
    res.json({ ok: true });
  } catch (error) {
    console.error("[StaffApp notifications/read] error:", error);
    sendError(res, 500, { code: "server_error", message: "تعذر تعليم التنبيه كمقروء" });
  }
});

// يقبل التركيب المباشر app.use(staffAppMobileRouter) أو app.use("/api/v1/staff", staffAppMobileRouter)
router.use(STAFF_APP_BASE_PATH, subRouter);
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.baseUrl.endsWith(STAFF_APP_BASE_PATH) || req.baseUrl.endsWith("/staff")) {
    return subRouter(req, res, next);
  }
  return next();
});

export default router;
export { router as staffAppMobileRouter };
