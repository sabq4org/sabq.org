// مسارات إدارة المراسلين: القائمة، أخبار المراسل، وملف الترخيص.
// مقيدة بمسؤول النظام فقط (مثل صفحة الرادار) — لا تكفي users.view/articles.view.
import { Router, type Request, type Response } from "express";
import { requireAuth, requireRole } from "../rbac";
import { ObjectStorageService } from "../objectStorage";
import {
  getReporterArticlesWithStats,
  getReporterMediaLicenseFileKey,
  listReporters,
} from "../services/reportersAdminService";

const router = Router();
const reportersAdminAuth = [
  requireAuth,
  requireRole("system_admin", "system.admin", "superadmin", "super_admin"),
] as const;

router.get("/api/admin/reporters", ...reportersAdminAuth, async (_req: Request, res: Response) => {
  try {
    res.json({ reporters: await listReporters() });
  } catch (error) {
    console.error("[reporters] list failed:", error);
    res.status(500).json({ message: "تعذر جلب قائمة المراسلين" });
  }
});

router.get(
  "/api/admin/reporters/:reporterId/articles",
  ...reportersAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page)) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit)) || 20));
      const result = await getReporterArticlesWithStats(req.params.reporterId, page, limit);
      if (!result.reporter) return res.status(404).json({ message: "المراسل غير موجود" });
      res.json(result);
    } catch (error) {
      console.error("[reporters] articles failed:", error);
      res.status(500).json({ message: "تعذر جلب أخبار المراسل" });
    }
  },
);

router.get(
  "/api/admin/reporters/:reporterId/media-license-file",
  ...reportersAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const key = await getReporterMediaLicenseFileKey(req.params.reporterId);
      if (!key) {
        return res.status(404).json({ message: "لا يوجد ملف ترخيص لهذا المراسل" });
      }
      const url = await new ObjectStorageService().getPrivateFileDownloadURL(key, 300);
      res.redirect(url);
    } catch (error) {
      console.error("[reporters] media license file failed:", error);
      res.status(500).json({ message: "تعذر جلب ملف الترخيص" });
    }
  },
);

export default router;
