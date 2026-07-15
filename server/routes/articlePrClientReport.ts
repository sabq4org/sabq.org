import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { buildArticlePrClientReportPdf } from "../services/articlePrClientReportPdfService";

const router: Router = Router();

/**
 * Client-facing PR article PDF for system admins.
 * Optional query: clientName, lang=ar|en (EN uses linked English translation).
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
      const langRaw = String(req.query.lang || req.query.locale || "ar").toLowerCase();
      const lang = langRaw === "en" || langRaw === "english" ? "en" : "ar";

      const report = await buildArticlePrClientReportPdf({
        articleId,
        clientName,
        lang,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${report.filename}"`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Sabq-Report-Ref", report.reportRef);
      res.setHeader("X-Sabq-Report-Lang", lang);
      res.send(report.buffer);
    } catch (error: any) {
      if (error?.code === "ARTICLE_NOT_FOUND" || error?.message === "ARTICLE_NOT_FOUND") {
        return res.status(404).json({ message: "المقال غير موجود" });
      }
      if (error?.code === "EN_ARTICLE_NOT_FOUND" || error?.message === "EN_ARTICLE_NOT_FOUND") {
        return res.status(404).json({
          message: "لا توجد ترجمة إنجليزية مرتبطة بهذا الخبر",
          detail: "Create or link an English article first, then export again.",
        });
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
