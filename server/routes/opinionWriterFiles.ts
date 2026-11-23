// مسارات ملفات كتّاب الرأي (PDF):
//   GET    /api/opinion-writer-files                قائمة الملفات (لكتّاب الرأي وإدارة قسم المقالات)
//   GET    /api/opinion-writer-files/:id/download   عرض أو تحميل الملف (?download=1 للتحميل المباشر)
//   POST   /api/admin/opinion-writer-files          رفع ملف PDF جديد (صلاحية opinion.review أو *)
//   DELETE /api/admin/opinion-writer-files/:id      حذف لطيف للملف (صلاحية opinion.review أو *)
// ADR-001: لا وصول مباشر لقاعدة البيانات هنا — كل الاستعلامات في opinionWriterFilesService.

import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import {
  logActivity,
  requireAuth,
  requirePermission,
  userHasAnyRole,
  userHasPermission,
} from "../rbac";
import {
  MAX_OPINION_WRITER_FILE_BYTES,
  OpinionWriterFileError,
  buildPdfContentDisposition,
  createOpinionWriterFile,
  getOpinionWriterFileDownload,
  listOpinionWriterFiles,
  softDeleteOpinionWriterFile,
} from "../services/opinionWriterFilesService";
import { recordFileDownload } from "../services/opinionWriterAnnouncementsService";

const router = Router();

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_OPINION_WRITER_FILE_BYTES, files: 1 },
});

const requestUserId = (req: Request) => (req.user as { id: string }).id;

async function canReadOpinionWriterFiles(userId: string): Promise<boolean> {
  const [canManage, isWriter] = await Promise.all([
    userHasPermission(userId, PERMISSION_CODES.OPINION_REVIEW),
    userHasAnyRole(userId, ["opinion_author"]),
  ]);
  return canManage || isWriter;
}

function handleSinglePdfUpload(req: Request, res: Response, next: NextFunction) {
  uploadPdf.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "حجم الملف يتجاوز الحد المسموح به (25 ميجابايت)" });
    }
    return res.status(400).json({ message: "تعذر قراءة الملف المرفوع" });
  });
}

router.get("/api/opinion-writer-files", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = requestUserId(req);
    if (!(await canReadOpinionWriterFiles(userId))) {
      return res.status(403).json({ message: "هذا القسم مخصص لكتّاب الرأي وإدارة المقالات" });
    }
    const files = await listOpinionWriterFiles();
    return res.json({ files });
  } catch (error) {
    console.error("[opinion-writer-files] list failed:", error);
    return res.status(500).json({ message: "تعذر جلب قائمة الملفات" });
  }
});

router.get(
  "/api/opinion-writer-files/:id/download",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = requestUserId(req);
      if (!(await canReadOpinionWriterFiles(userId))) {
        return res.status(403).json({ message: "لا تملك صلاحية تحميل هذا الملف" });
      }
      const result = await getOpinionWriterFileDownload(req.params.id);
      if (!result) {
        return res.status(404).json({ message: "الملف غير موجود" });
      }

      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      // متابعة «من حمّل الملف» بالاسم — لا تؤخر التنزيل ولا تُفشله
      void recordFileDownload(userId, result.id);

      if (req.query.download === "1") {
        const upstream = await fetch(result.signedUrl, {
          signal: AbortSignal.timeout(20_000),
        });
        if (!upstream.ok) {
          return res.status(502).json({ message: "تعذر تنزيل الملف من التخزين" });
        }
        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          buildPdfContentDisposition(result.title, result.id),
        );
        return res.send(buffer);
      }

      return res.redirect(result.signedUrl);
    } catch (error) {
      console.error("[opinion-writer-files] download failed:", error);
      return res.status(500).json({ message: "تعذر تحميل الملف" });
    }
  },
);

router.post(
  "/api/admin/opinion-writer-files",
  requireAuth,
  requirePermission(PERMISSION_CODES.OPINION_REVIEW),
  handleSinglePdfUpload,
  async (req: Request, res: Response) => {
    try {
      const uploadedFile = req.file;
      if (!uploadedFile) {
        return res.status(400).json({ message: "يرجى اختيار ملف PDF للرفع" });
      }
      const title = typeof req.body?.title === "string" ? req.body.title : "";
      const description = typeof req.body?.description === "string" ? req.body.description : null;
      const actorId = requestUserId(req);

      const file = await createOpinionWriterFile({
        title,
        description,
        fileBuffer: uploadedFile.buffer,
        originalFileName: uploadedFile.originalname,
        mimeType: uploadedFile.mimetype,
        uploadedBy: actorId,
      });

      await logActivity({
        userId: actorId,
        action: "opinion_writer_file_upload",
        entityType: "opinion_writer_file",
        entityId: file.id,
        newValue: { title: file.title, fileSizeBytes: file.fileSizeBytes },
        metadata: { ip: req.ip, userAgent: req.get("user-agent") },
      }).catch(() => {});

      return res.status(201).json({ file });
    } catch (error) {
      if (error instanceof OpinionWriterFileError) {
        return res.status(error.status).json({ message: error.message });
      }
      console.error("[opinion-writer-files] upload failed:", error);
      return res.status(500).json({ message: "تعذر رفع الملف" });
    }
  },
);

router.delete(
  "/api/admin/opinion-writer-files/:id",
  requireAuth,
  requirePermission(PERMISSION_CODES.OPINION_REVIEW),
  async (req: Request, res: Response) => {
    try {
      const deleted = await softDeleteOpinionWriterFile(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "الملف غير موجود أو تم حذفه مسبقاً" });
      }
      await logActivity({
        userId: requestUserId(req),
        action: "opinion_writer_file_delete",
        entityType: "opinion_writer_file",
        entityId: req.params.id,
        metadata: { ip: req.ip, userAgent: req.get("user-agent") },
      }).catch(() => {});
      return res.json({ ok: true });
    } catch (error) {
      console.error("[opinion-writer-files] delete failed:", error);
      return res.status(500).json({ message: "تعذر حذف الملف" });
    }
  },
);

export default router;
