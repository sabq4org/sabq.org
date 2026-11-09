// عدّادات «مكتب سبق» في طلب واحد — GET /api/v1/staff/counts (2026-11-09).
// يغني التطبيق عند الفتح عن /unread-counts و/alerts و/opinion/board و/news
// و/notifications/unread لمجرد العدّ. كل عدّاد محجوب بصلاحية مساره الأصلي.
// HTTP فقط؛ الاستعلامات في services/staffDeskCountsService.ts (ADR-001).
// التوثيق: docs/systems/editorial/STAFF_APP_API.md § العدّادات.

import type { Request, RequestHandler, Response, Router } from "express";
import type { StaffAppErrorBody } from "@shared/staffApp";
import type { StaffAuthContext } from "../services/staffAppService";
import { getStaffDeskCounts } from "../services/staffDeskCountsService";

type StaffRequest = Request & { staffAuth?: StaffAuthContext };

export interface StaffDeskCountsRouteDeps {
  requireStaffAuth: RequestHandler;
  sendError: (res: Response, status: number, body: StaffAppErrorBody) => unknown;
}

export function registerStaffDeskCountsRoutes(router: Router, deps: StaffDeskCountsRouteDeps): void {
  router.get("/counts", deps.requireStaffAuth, async (req: Request, res: Response) => {
    const ctx = (req as StaffRequest).staffAuth;
    if (!ctx) {
      return deps.sendError(res, 401, { code: "unauthorized", message: "يجب تسجيل الدخول" });
    }
    try {
      const counts = await getStaffDeskCounts({ userId: ctx.user.id, capabilities: ctx.capabilities });
      res.set("Cache-Control", "private, no-store");
      return res.json(counts);
    } catch (error) {
      console.error("[StaffDeskCounts] GET /counts failed:", error instanceof Error ? error.message : error);
      return deps.sendError(res, 500, { code: "server_error", message: "تعذر تحميل العدّادات" });
    }
  });
}
