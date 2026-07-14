import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { buildArticlePrClientReportPdf } from "../services/articlePrClientReportPdfService";

const router: Router = Router();

/**
 * Client-facing PR article PDF for system admins.
 * Optional query: clientName (campaign / client label shown on the report).
 */
router.get(
  "/api/admin/articles/:articleId/pr-client-report.pdf",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (req: any, res) => {
    try {
      const articleId = String(req.params.articleId || "").trim();
      if (!articleId) {
        return res.status(400).json({ message: "معرف المقال مطلوب" });
      }

      const clientNameRaw = req.query.clientName ?? req.query.campaignName;
      const clientName =
        typeof clientNameRaw === "string" ? clientNameRaw : undefined;

      const report = await buildArticlePrClientReportPdf({
        articleId,
        clientName,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${report.filename}"`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Sabq-Report-Ref", report.reportRef);
      res.send(report.buffer);
    } catch (error: any) {
      if (error?.code === "ARTICLE_NOT_FOUND" || error?.message === "ARTICLE_NOT_FOUND") {
        return res.status(404).json({ message: "المقال غير موجود" });
      }
      console.error("[PrClientReportPdf] Failed to build report:", error);
      if (!res.headersSent) {
        const detail = error instanceof Error ? error.message : String(error ?? "");
        res.status(500).json({
          message: "تعذر إنشاء تقرير PDF",
          detail: detail.slice(0, 300),
        });
      }
    }
  },
);

export default router;
