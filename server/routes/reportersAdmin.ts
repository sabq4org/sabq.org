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

router.post(
  "/api/admin/reporters/:reporterId/media-license-correction",
  ...reportersAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { requestMediaLicenseCorrection } = await import("../services/mediaLicenseService");
      const note = typeof req.body?.note === "string" ? req.body.note : "";
      const adminId = (req.user as { id: string }).id;
      const status = await requestMediaLicenseCorrection(req.params.reporterId, adminId, note);
      res.json({ ok: true, mediaLicense: status });
    } catch (error: any) {
      const msg = error?.message || "تعذر إرسال طلب التصحيح";
      const code = /ملاحظة|ملف ترخيص/.test(msg) ? 400 : 500;
      if (code === 500) console.error("[reporters] license correction failed:", error);
      res.status(code).json({ message: msg });
    }
  },
);

router.post(
  "/api/admin/reporters/:reporterId/media-license-approve",
  ...reportersAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { approveMediaLicense } = await import("../services/mediaLicenseService");
      const adminId = (req.user as { id: string }).id;
      const status = await approveMediaLicense(req.params.reporterId, adminId);
      res.json({ ok: true, mediaLicense: status });
    } catch (error: any) {
      const msg = error?.message || "تعذر اعتماد الترخيص";
      const code = /لا يوجد|بانتظار/.test(msg) ? 400 : 500;
      if (code === 500) console.error("[reporters] license approve failed:", error);
      res.status(code).json({ message: msg });
    }
  },
);

router.post(
  "/api/admin/reporters/:reporterId/media-license-reject",
  ...reportersAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { rejectMediaLicense } = await import("../services/mediaLicenseService");
      const note = typeof req.body?.note === "string" ? req.body.note : "";
      const adminId = (req.user as { id: string }).id;
      const status = await rejectMediaLicense(req.params.reporterId, adminId, note);
      res.json({ ok: true, mediaLicense: status });
    } catch (error: any) {
      const msg = error?.message || "تعذر رفض الترخيص";
      const code = /ملاحظة|ملف ترخيص/.test(msg) ? 400 : 500;
      if (code === 500) console.error("[reporters] license reject failed:", error);
      res.status(code).json({ message: msg });
    }
  },
);

export default router;
