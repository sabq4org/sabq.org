// تبويب «الأخبار» في تطبيق «مكتب سبق» — /api/v1/staff/news/* (المرحلة 1، 2026-10-31).
// مسودات المراسلين (من التطبيق والويب) وأخبار البريد وطلبات التعديل، مع النشر
// والجدولة والإعادة والاعتماد والرفض. لمن يملك articles.publish (capabilities.canNews).
// HTTP فقط؛ الاستعلامات في services/staffNewsDeskService.ts (ADR-001).
// التوثيق: docs/systems/editorial/STAFF_APP_API.md § الأخبار.

import type { NextFunction, Request, RequestHandler, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import type { StaffAppErrorBody } from "@shared/staffApp";
import {
  staffEditRequestApproveSchema,
  staffEditRequestRejectSchema,
  staffNewsBoardQuerySchema,
  staffNewsPublishSchema,
  staffNewsReturnSchema,
  staffNewsScheduleSchema,
} from "@shared/staffNews";
import type { StaffAuthContext } from "../services/staffAppService";
import {
  StaffNewsDeskError,
  getStaffNewsBoard,
  getStaffNewsPreview,
  listStaffNewsCategories,
  publishNewsFromDesk,
  returnNewsToReporterFromDesk,
  scheduleNewsFromDesk,
} from "../services/staffNewsDeskService";

// استيراد متأخر: خدمة طلبات التعديل تحمّل عميل OpenAI (إعادة توليد الموجز)،
// فلا تُحمَّل مع بقية مسارات المكتب عند الإقلاع أو في الاختبارات.
const editRequests = () => import("../services/articleEditRequestsService");
const editRequestApproval = () => import("../services/articleEditRequestApproval");

type StaffRequest = Request & { staffAuth?: StaffAuthContext };

export interface StaffNewsRouteDeps {
  requireStaffAuth: RequestHandler;
  sendError: (res: Response, status: number, body: StaffAppErrorBody) => void;
  audit: (
    req: StaffRequest,
    entry: {
      action: string;
      entityType: string;
      entityId: string;
      oldValue?: Record<string, unknown>;
      newValue?: Record<string, unknown>;
      extraMetadata?: Record<string, unknown>;
    },
  ) => Promise<void>;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function editRequestErrorCode(status: number) {
  return status === 404 ? "not_found" : status === 403 ? "forbidden" : status === 400 ? "validation_error" : "conflict";
}

export function registerStaffNewsRoutes(router: Router, deps: StaffNewsRouteDeps): void {
  const { requireStaffAuth, sendError, audit } = deps;

  const requireNews = (req: StaffRequest, res: Response, next: NextFunction) => {
    if (!req.staffAuth?.capabilities.canNews) {
      return sendError(res, 403, { code: "forbidden", message: "تبويب الأخبار لمن يملك صلاحية النشر" });
    }
    return next();
  };

  const requireId = (param: string) => (req: Request, res: Response, next: NextFunction) => {
    if (!ID_PATTERN.test(String(req.params[param] || ""))) {
      return sendError(res, 400, { code: "validation_error", message: "معرّف غير صالح" });
    }
    return next();
  };

  const actionLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: () => Number(process.env.STAFF_APP_NEWS_RATE_LIMIT) || 60,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
    keyGenerator: (req) => `staff-app-news:${(req as StaffRequest).staffAuth?.user.id ?? "anonymous"}`,
    handler: (_req, res) =>
      sendError(res, 429, { code: "rate_limited", message: "محاولات كثيرة خلال فترة قصيرة؛ انتظر قليلاً" }),
  });

  const handle = (res: Response, error: unknown, fallback: string) => {
    if (error instanceof StaffNewsDeskError) {
      return sendError(res, error.status, { code: error.code, message: error.message });
    }
    console.error("[StaffApp news]", fallback, error);
    sendError(res, 500, { code: "server_error", message: fallback });
  };

  const parseBody = <T>(
    res: Response,
    schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: any } },
    body: unknown,
  ): T | null => {
    const parsed = schema.safeParse(body ?? {});
    if (!parsed.success) {
      sendError(res, 400, {
        code: "validation_error",
        message: parsed.error.issues?.[0]?.message ?? "مدخلات غير صالحة",
        details: parsed.error.flatten(),
      });
      return null;
    }
    return parsed.data;
  };

  // ── القائمة والاستعراض ─────────────────────────────────────────────

  router.get("/news", requireStaffAuth, requireNews, async (req: StaffRequest, res: Response) => {
    const parsed = staffNewsBoardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, 400, { code: "validation_error", message: "معاملات الاستعلام غير صالحة" });
    }
    try {
      res.json(await getStaffNewsBoard({ userId: req.staffAuth!.user.id, filter: parsed.data.filter }));
    } catch (error) {
      handle(res, error, "تعذر جلب الأخبار");
    }
  });

  router.get("/news/categories", requireStaffAuth, requireNews, async (_req: StaffRequest, res: Response) => {
    try {
      res.json({ categories: await listStaffNewsCategories() });
    } catch (error) {
      handle(res, error, "تعذر جلب الأقسام");
    }
  });

  // ── طلبات التعديل (قبل /news/:id حتى لا يُفسَّر "edit-requests" معرّفًا) ──

  router.get(
    "/news/edit-requests/:id",
    requireStaffAuth,
    requireNews,
    requireId("id"),
    async (req: StaffRequest, res: Response) => {
      try {
        const { getEditRequestDetail } = await editRequests();
        const result = await getEditRequestDetail(req.params.id, { userId: req.staffAuth!.user.id, reviewer: true });
        if (!result.ok) {
          return sendError(res, result.status, { code: editRequestErrorCode(result.status), message: result.message });
        }
        const { request, article, fields, contentEdits } = result;
        res.json({
          request: {
            id: request.id,
            articleId: request.articleId,
            status: request.status,
            urgent: request.urgent === true,
            note: request.note ?? null,
            requesterName: request.requesterName,
            decidedByName: request.decidedByName,
            decisionNote: request.decisionNote ?? null,
            proposed: request.proposed,
            createdAt: request.createdAt,
            decidedAt: request.decidedAt ?? null,
          },
          article,
          fields,
          contentEdits,
        });
      } catch (error) {
        handle(res, error, "تعذر جلب طلب التعديل");
      }
    },
  );

  router.post(
    "/news/edit-requests/:id/approve",
    requireStaffAuth,
    requireNews,
    requireId("id"),
    actionLimiter,
    async (req: StaffRequest, res: Response) => {
      const body = parseBody(res, staffEditRequestApproveSchema, req.body);
      if (!body) return;
      const ctx = req.staffAuth!;
      try {
        const { approveEditRequestWithEffects } = await editRequestApproval();
        const result = await approveEditRequestWithEffects({
          id: req.params.id,
          actorId: ctx.user.id,
          requestedFields: body.fields,
          updateLine: body.updateLine?.trim() || null,
          manual: false,
          regenerate: body.regenerate === true,
          reason: "staff-desk-edit-request-approve",
        });
        if (!result.ok) {
          return sendError(res, result.status, {
            code: editRequestErrorCode(result.status),
            message: result.message,
            details: { reason: result.code ?? null, missing: result.missing ?? [] },
          });
        }
        await audit(req, {
          action: "staff_app.edit_request.approve",
          entityType: "article_edit_request",
          entityId: req.params.id,
          newValue: { status: "approved", appliedFields: result.appliedFields },
          extraMetadata: { articleId: result.articleId, regenerating: result.regenerating },
        });
        res.json({
          ok: true,
          appliedFields: result.appliedFields,
          missingParagraphs: result.missingParagraphs,
          regenerating: result.regenerating,
        });
      } catch (error) {
        handle(res, error, "تعذر اعتماد الطلب");
      }
    },
  );

  router.post(
    "/news/edit-requests/:id/reject",
    requireStaffAuth,
    requireNews,
    requireId("id"),
    actionLimiter,
    async (req: StaffRequest, res: Response) => {
      const body = parseBody(res, staffEditRequestRejectSchema, req.body);
      if (!body) return;
      try {
        const { rejectEditRequest } = await editRequests();
        const result = await rejectEditRequest({ id: req.params.id, actorId: req.staffAuth!.user.id, reason: body.reason });
        if (!result.ok) {
          return sendError(res, result.status, {
            code: editRequestErrorCode(result.status),
            message: result.message,
            details: { reason: result.code ?? null },
          });
        }
        await audit(req, {
          action: "staff_app.edit_request.reject",
          entityType: "article_edit_request",
          entityId: req.params.id,
          newValue: { status: "rejected", reason: body.reason },
          extraMetadata: { articleId: result.request.articleId },
        });
        res.json({ ok: true });
      } catch (error) {
        handle(res, error, "تعذر رفض الطلب");
      }
    },
  );

  // ── الخبر الواحد ───────────────────────────────────────────────────

  router.get("/news/:id", requireStaffAuth, requireNews, requireId("id"), async (req: StaffRequest, res: Response) => {
    try {
      res.json({ article: await getStaffNewsPreview(req.params.id, req.staffAuth!.user.id) });
    } catch (error) {
      handle(res, error, "تعذر جلب الخبر");
    }
  });

  router.post(
    "/news/:id/publish",
    requireStaffAuth,
    requireNews,
    requireId("id"),
    actionLimiter,
    async (req: StaffRequest, res: Response) => {
      const body = parseBody(res, staffNewsPublishSchema, req.body);
      if (!body) return;
      const ctx = req.staffAuth!;
      try {
        const result = await publishNewsFromDesk({
          articleId: req.params.id,
          actorId: ctx.user.id,
          actorName: ctx.user.name,
          expectedUpdatedAt: body.expectedUpdatedAt,
          categoryId: body.categoryId,
        });
        await audit(req, {
          action: "staff_app.news.publish",
          entityType: "article",
          entityId: req.params.id,
          oldValue: result.previous,
          newValue: { status: result.article.status, publishedAt: result.article.publishedAt, categoryId: body.categoryId ?? null },
        });
        res.json({ article: result.article });
      } catch (error) {
        handle(res, error, "تعذر نشر الخبر");
      }
    },
  );

  router.post(
    "/news/:id/schedule",
    requireStaffAuth,
    requireNews,
    requireId("id"),
    actionLimiter,
    async (req: StaffRequest, res: Response) => {
      const body = parseBody(res, staffNewsScheduleSchema, req.body);
      if (!body) return;
      const ctx = req.staffAuth!;
      try {
        const result = await scheduleNewsFromDesk({
          articleId: req.params.id,
          actorId: ctx.user.id,
          actorName: ctx.user.name,
          scheduledAt: body.scheduledAt,
          expectedUpdatedAt: body.expectedUpdatedAt,
          categoryId: body.categoryId,
        });
        await audit(req, {
          action: "staff_app.news.schedule",
          entityType: "article",
          entityId: req.params.id,
          oldValue: result.previous,
          newValue: { status: result.article.status, scheduledAt: result.article.scheduledAt, categoryId: body.categoryId ?? null },
        });
        res.json({ article: result.article });
      } catch (error) {
        handle(res, error, "تعذر جدولة الخبر");
      }
    },
  );

  router.post(
    "/news/:id/return",
    requireStaffAuth,
    requireNews,
    requireId("id"),
    actionLimiter,
    async (req: StaffRequest, res: Response) => {
      const body = parseBody(res, staffNewsReturnSchema, req.body);
      if (!body) return;
      try {
        const result = await returnNewsToReporterFromDesk({
          articleId: req.params.id,
          actorId: req.staffAuth!.user.id,
          note: body.note,
        });
        await audit(req, {
          action: "staff_app.news.return",
          entityType: "article",
          entityId: req.params.id,
          oldValue: result.previous,
          newValue: { status: result.article.status, reviewStatus: result.article.reviewStatus, note: body.note },
        });
        res.json({ article: result.article });
      } catch (error) {
        handle(res, error, "تعذر إعادة الخبر للمراسل");
      }
    },
  );
}
