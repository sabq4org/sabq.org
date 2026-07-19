/**
 * تقرير كأس العالم 2026 بالأرقام — لوحة داخلية للمراجعة قبل النشر العام.
 * ADR-001: لا استيراد db.
 *
 * الكاش: افتراضياً SWR في الذاكرة (15د). أضف ?fresh=1 لإعادة الحساب من DB.
 */

import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { getWcNumbersReport } from "../services/wcNumbersReportService";

const router = Router();

router.get(
  "/api/admin/wc-2026-numbers-report",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (req, res) => {
    try {
      const forceFresh =
        req.query.fresh === "1" ||
        req.query.fresh === "true" ||
        req.query.refresh === "1";
      const report = await getWcNumbersReport({ forceFresh });
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Sabq-Report-Cache", report.cache.source);
      res.json(report);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error("[WcNumbersReport] failed:", err);
      res.status(500).json({
        message: "تعذر بناء تقرير أرقام كأس العالم",
        detail: detail.slice(0, 300),
      });
    }
  },
);

export const wcNumbersReportRouter = router;
export default router;
