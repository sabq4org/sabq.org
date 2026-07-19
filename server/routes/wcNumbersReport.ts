/**
 * تقرير كأس العالم 2026 بالأرقام.
 * - عام: GET /api/world-cup/numbers-report (الرئيسية)
 * - أدمن: GET /api/admin/wc-2026-numbers-report
 * ADR-001: لا استيراد db.
 */

import { Router, type Request, type Response } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { getWcNumbersReport } from "../services/wcNumbersReportService";

const router = Router();

async function handleReport(req: Request, res: Response, opts: { publicCache: boolean }) {
  try {
    const forceFresh =
      req.query.fresh === "1" ||
      req.query.fresh === "true" ||
      req.query.refresh === "1";
    const report = await getWcNumbersReport({ forceFresh });
    if (opts.publicCache) {
      // البطولة انتهت — كاش أطول على الحافة لتقليل الانتظار على الرئيسية
      res.setHeader(
        "Cache-Control",
        "public, max-age=120, s-maxage=900, stale-while-revalidate=1800",
      );
    } else {
      res.setHeader("Cache-Control", "private, no-store");
    }
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
}

/** واجهة الزائر — مكان بانر المونديال على الرئيسية */
router.get("/api/world-cup/numbers-report", async (req, res) => {
  await handleReport(req, res, { publicCache: true });
});

router.get(
  "/api/admin/wc-2026-numbers-report",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (req, res) => {
    await handleReport(req, res, { publicCache: false });
  },
);

export const wcNumbersReportRouter = router;
export default router;
