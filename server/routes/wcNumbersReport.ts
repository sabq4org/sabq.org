/**
 * مسودة تقرير كأس العالم 2026 بالأرقام — لوحة داخلية فقط.
 * ADR-001: لا استيراد db.
 */

import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { getWcNumbersReport } from "../services/wcNumbersReportService";

const router = Router();

router.get(
  "/api/admin/wc-2026-numbers-report",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (_req, res) => {
    try {
      const report = await getWcNumbersReport();
      res.setHeader("Cache-Control", "private, no-store");
      res.json(report);
    } catch (err) {
      console.error("[WcNumbersReport] failed:", err);
      res.status(500).json({ message: "تعذر بناء تقرير أرقام كأس العالم" });
    }
  },
);

export const wcNumbersReportRouter = router;
export default router;
