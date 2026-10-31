// لوحة المراسل والمشرف في تطبيق «سبق» (iOS) — /api/v1/editorial/* (2026-10-31).
//
// تطبيق القارئ هو أداة المنسوبين على الجوال (قرار المالك 2026-10-31): المراسل
// يرى «أخباري» ويطلب تعديلًا، ومن يملك articles.publish يرى ما ينتظر قراره
// وينشر ويجدول ويعيد ويراجع طلبات التعديل. نفس الخدمات التي يستخدمها الويب
// و«مكتب سبق»، فكل قرار يظهر في الثلاثة فورًا.
//
// المصادقة: جلسة العضو (Bearer) في التطبيق، والمصادقة الثنائية اختيارية
// لكل الأدوار (قرار المالك 2026-10-31)، وRBAC حي لكل طلب. HTTP فقط؛ الاستعلامات في services/ (ADR-001).
// التوثيق: docs/systems/editorial/MOBILE_EDITORIAL_API.md

import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import { isBotPublisherToken } from "@shared/botPublisherTokens";
import { parseEditRequestInput } from "@shared/articleEditRequests";
import { myNewsQuerySchema, type MobileEditorialMe } from "@shared/mobileEditorial";
import type { StaffAppErrorBody } from "@shared/staffApp";
import { logActivity } from "../rbac";
import { verifyMemberBearer } from "../services/memberSessionService";
import { getMyNewsBoard } from "../services/mobileEditorialService";
import {
  getStaffUserAccount,
  resolveStaffCapabilitiesAndRoles,
  type StaffAuthContext,
} from "../services/staffAppService";
import { registerStaffNewsRoutes } from "./staffNewsDesk";

// خدمة طلبات التعديل تحمّل عميل OpenAI؛ تُحمَّل عند الطلب فقط.
const editRequests = () => import("../services/articleEditRequestsService");

export const MOBILE_EDITORIAL_AUDIT_CHANNEL = "mobile-editorial";

type EditorialRequest = Request & { staffAuth?: StaffAuthContext };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function sendError(res: Response, status: number, body: StaffAppErrorBody): void {
  res.status(status).json(body);
}

function failCode(status: number): StaffAppErrorBody["code"] {
  return status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 400 ? "validation_error" : status === 503 ? "not_implemented" : "conflict";
}

async function requireEditorialAuth(req: EditorialRequest, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "private, no-store");
  try {
    const raw = /^Bearer\s+(.+)$/i.exec(req.headers.authorization?.trim() ?? "")?.[1]?.trim();
    if (!raw || isBotPublisherToken(raw)) {
      return sendError(res, 401, { code: "unauthorized", message: "سجّل الدخول أولًا" });
    }
    const session = await verifyMemberBearer(req);
    const user = session?.userId ? await getStaffUserAccount(session.userId) : null;
    if (!user) return sendError(res, 401, { code: "unauthorized", message: "جلسة غير صالحة أو منتهية" });
    // المصادقة الثنائية اختيارية في تطبيق «سبق» لكل الأدوار (قرار المالك 2026-10-31)،
    // مثل لوحة الويب و«مكتب سبق».
    const { roles, capabilities } = await resolveStaffCapabilitiesAndRoles(user.id, user.role);
    req.staffAuth = { user, roles, capabilities };
    return next();
  } catch (error) {
    console.error("[MobileEditorial] auth failed:", error);
    return sendError(res, 500, { code: "server_error", message: "خدمة التحقق من الجلسة غير متاحة مؤقتًا" });
  }
}

const requireReporter = (req: EditorialRequest, res: Response, next: NextFunction) => {
  const caps = req.staffAuth?.capabilities;
  if (!caps?.canReport && !caps?.canNews) {
    return sendError(res, 403, { code: "forbidden", message: "لوحة المراسل لأصحاب الأخبار" });
  }
  return next();
};

async function audit(
  req: EditorialRequest,
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
    await logActivity({
      userId: ctx.user.id,
      action: entry.action.replace(/^staff_app\./, "mobile_editorial."),
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      metadata: {
        channel: MOBILE_EDITORIAL_AUDIT_CHANNEL,
        userId: ctx.user.id,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        ...(entry.extraMetadata ?? {}),
      },
    });
  } catch (error) {
    console.error("[MobileEditorial] audit log failed:", error);
  }
}

const writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: () => Number(process.env.MOBILE_EDITORIAL_WRITE_LIMIT) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => `mobile-editorial:${(req as EditorialRequest).staffAuth?.user.id ?? "anon"}`,
  handler: (_req, res) => sendError(res, 429, { code: "rate_limited", message: "طلبات كثيرة خلال فترة قصيرة؛ انتظر قليلًا" }),
});

const requireId = (param: string) => (req: Request, res: Response, next: NextFunction) => {
  if (!ID_PATTERN.test(String(req.params[param] || ""))) {
    return sendError(res, 400, { code: "validation_error", message: "معرّف غير صالح" });
  }
  return next();
};

const router = Router();
const auth = requireEditorialAuth as unknown as RequestHandler;
const reporter = requireReporter as unknown as RequestHandler;

router.get("/me", auth, (req: EditorialRequest, res) => {
  const ctx = req.staffAuth!;
  const me: MobileEditorialMe = {
    userId: ctx.user.id,
    name: ctx.user.name,
    canReport: ctx.capabilities.canReport || ctx.capabilities.canNews,
    canNews: ctx.capabilities.canNews,
    twoFactorEnabled: Boolean(ctx.user.twoFactorEnabled),
  };
  res.json(me);
});

// ── المراسل ────────────────────────────────────────────────────────────

router.get("/my-news", auth, reporter, async (req: EditorialRequest, res) => {
  const parsed = myNewsQuerySchema.safeParse(req.query);
  if (!parsed.success) return sendError(res, 400, { code: "validation_error", message: "فلتر غير معروف" });
  try {
    res.json(await getMyNewsBoard({ userId: req.staffAuth!.user.id, filter: parsed.data.filter }));
  } catch (error) {
    console.error("[MobileEditorial] my-news failed:", error);
    sendError(res, 500, { code: "server_error", message: "تعذر تحميل أخبارك" });
  }
});

router.get("/edit-requests/context/:articleId", auth, reporter, requireId("articleId"), async (req: EditorialRequest, res) => {
  try {
    const result = await (await editRequests()).getEditRequestContext(req.params.articleId, req.staffAuth!.user.id);
    if (!result.ok) return sendError(res, result.status, { code: failCode(result.status), message: result.message });
    res.json(result);
  } catch (error) {
    console.error("[MobileEditorial] edit-request context failed:", error);
    sendError(res, 500, { code: "server_error", message: "تعذر تحميل الخبر" });
  }
});

router.post("/edit-requests", auth, reporter, writeLimiter, async (req: EditorialRequest, res) => {
  const parsed = parseEditRequestInput(req.body);
  if (!parsed.ok) return sendError(res, 400, { code: "validation_error", message: parsed.message });
  try {
    const result = await (await editRequests()).createEditRequest(parsed.value, req.staffAuth!.user.id);
    if (!result.ok) return sendError(res, result.status, { code: failCode(result.status), message: result.message });
    await audit(req, {
      action: "mobile_editorial.edit_request.create",
      entityType: "article_edit_request",
      entityId: String((result as { request?: { id?: string } }).request?.id ?? ""),
      newValue: { articleId: parsed.value.articleId, urgent: parsed.value.urgent },
    });
    res.status(201).json({ ok: true, request: (result as { request?: unknown }).request ?? null });
  } catch (error) {
    console.error("[MobileEditorial] edit-request create failed:", error);
    sendError(res, 500, { code: "server_error", message: "تعذر إرسال الطلب" });
  }
});

router.post("/edit-requests/:id/cancel", auth, reporter, requireId("id"), writeLimiter, async (req: EditorialRequest, res) => {
  try {
    const result = await (await editRequests()).cancelEditRequest(req.params.id, req.staffAuth!.user.id);
    if (!result.ok) return sendError(res, result.status, { code: failCode(result.status), message: result.message });
    await audit(req, { action: "mobile_editorial.edit_request.cancel", entityType: "article_edit_request", entityId: req.params.id });
    res.json({ ok: true });
  } catch (error) {
    console.error("[MobileEditorial] edit-request cancel failed:", error);
    sendError(res, 500, { code: "server_error", message: "تعذر إلغاء الطلب" });
  }
});

// ── المشرف: نفس مسارات «الأخبار» في «مكتب سبق» (/news/*، articles.publish) ──

registerStaffNewsRoutes(router, { requireStaffAuth: auth, sendError, audit });

export default router;
