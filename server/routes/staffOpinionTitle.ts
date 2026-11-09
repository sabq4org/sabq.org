// «مكتب سبق» — PATCH /api/v1/staff/opinion/:id/title (2026-11-09).
// تعديل عنوان مقال الرأي قبل الجدولة، لمن يملك صلاحية الجدولة.
// HTTP فقط؛ الكتابة في services/staffOpinionTitleService.ts (ADR-001).
// التوثيق: docs/systems/editorial/STAFF_APP_API.md § الرأي.

import type { Request, RequestHandler, Response, Router } from "express";
import type { StaffAppErrorBody } from "@shared/staffApp";
import { staffOpinionTitleSchema } from "@shared/staffOpinionTitle";
import { editOpinionTitleFromDesk } from "../services/staffOpinionTitleService";
import type { StaffAuthContext } from "../services/staffAppService";

type StaffRequest = Request & { staffAuth?: StaffAuthContext };

export interface StaffOpinionTitleRouteDeps {
  requireStaffAuth: RequestHandler;
  /** صلاحية الجدولة على مقالات الرأي. */
  requireSchedule: RequestHandler;
  limiter: RequestHandler;
  sendError: (res: Response, status: number, body: StaffAppErrorBody) => unknown;
  handleError: (res: Response, error: unknown, fallback: string) => void;
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

export function registerStaffOpinionTitleRoutes(router: Router, deps: StaffOpinionTitleRouteDeps): void {
  router.patch(
    "/opinion/:id/title",
    deps.requireStaffAuth,
    deps.requireSchedule,
    deps.limiter,
    async (req: Request, res: Response) => {
      const ctx = (req as StaffRequest).staffAuth;
      if (!ctx) {
        return deps.sendError(res, 401, { code: "unauthorized", message: "يجب تسجيل الدخول" });
      }
      const parsed = staffOpinionTitleSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return deps.sendError(res, 400, {
          code: "validation_error",
          message: parsed.error.issues[0]?.message ?? "اكتب العنوان",
        });
      }
      try {
        const result = await editOpinionTitleFromDesk({
          articleId: req.params.id,
          actorId: ctx.user.id,
          title: parsed.data.title,
          expectedTitle: parsed.data.expectedTitle,
        });
        if (result.changed) {
          await deps.audit(req as StaffRequest, {
            action: "staff_opinion_edit_title",
            entityType: "article",
            entityId: result.article.id,
            oldValue: { title: result.previous.title },
            newValue: { title: result.article.title },
          });
        }
        return res.json({ article: result.article });
      } catch (error) {
        return deps.handleError(res, error, "تعذر حفظ العنوان");
      }
    },
  );
}
