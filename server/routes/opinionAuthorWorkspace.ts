import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireAuth, userHasAnyRole } from "../rbac";
import { upload } from "../utils/uploadMiddleware";
import { ObjectStorageService, isPrivateObjectStorageConfigured } from "../objectStorage";
import {
  coachWriterIdea,
  generateWriterIdeas,
  getOpinionAuthorWorkspace,
  getWriterEditorialNotifications,
  getWriterMediaLicense,
  getWriterStyleProfile,
  markAllWriterEditorialNotificationsRead,
  markWriterEditorialNotificationRead,
  parseMediaLicenseExpiry,
  reviewWriterArticle,
  saveWriterMediaLicense,
} from "../services/opinionAuthorWorkspaceService";

const router = Router();
const requestUserId = (req: Request) => (req.user as { id: string }).id;
const writerAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestUserId,
  message: { message: "أخذ المساعد استراحة قصيرة؛ حاول بعد دقائق" },
});

router.use("/api/opinion-author", requireAuth, async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "يجب تسجيل الدخول" });
  const userId = requestUserId(req);
  if (!(await userHasAnyRole(userId, ["opinion_author"]))) {
    return res.status(403).json({ message: "هذه المساحة خاصة بكتّاب الرأي" });
  }
  next();
});

router.get("/api/opinion-author/workspace", async (req, res) => {
  try {
    res.json(await getOpinionAuthorWorkspace(requestUserId(req)));
  } catch (error) {
    console.error("[Writer Workspace] load failed:", error);
    res.status(500).json({ message: "تعذر تجهيز مساحة الكاتب" });
  }
});

router.get("/api/opinion-author/notifications", async (req, res) => {
  const parsedLimit = z.coerce.number().int().min(1).max(50).catch(20).parse(req.query.limit);
  try {
    res.json(await getWriterEditorialNotifications(requestUserId(req), parsedLimit));
  } catch (error) {
    console.error("[Writer Workspace] notifications failed:", error);
    res.status(500).json({ message: "تعذر جلب التنبيهات التحريرية" });
  }
});

router.post("/api/opinion-author/notifications/read-all", async (req, res) => {
  try {
    await markAllWriterEditorialNotificationsRead(requestUserId(req));
    res.json({ success: true });
  } catch (error) {
    console.error("[Writer Workspace] read all notifications failed:", error);
    res.status(500).json({ message: "تعذر تحديث التنبيهات" });
  }
});

router.post("/api/opinion-author/notifications/:id/read", async (req, res) => {
  const parsedId = z.string().uuid().safeParse(req.params.id);
  if (!parsedId.success) return res.status(400).json({ message: "معرّف التنبيه غير صالح" });
  try {
    await markWriterEditorialNotificationRead(requestUserId(req), parsedId.data);
    res.json({ success: true });
  } catch (error) {
    console.error("[Writer Workspace] read notification failed:", error);
    res.status(500).json({ message: "تعذر تحديث التنبيه" });
  }
});

router.get("/api/opinion-author/ideas", writerAiLimiter, async (req, res) => {
  try {
    res.json(await generateWriterIdeas(requestUserId(req)));
  } catch (error) {
    console.error("[Writer Workspace] ideas failed:", error);
    res.status(502).json({ message: "تعذر توليد الأفكار الآن" });
  }
});

const ideaCoachSchema = z.object({ idea: z.string().trim().min(12).max(3000) });
router.post("/api/opinion-author/idea-coach", writerAiLimiter, async (req, res) => {
  const parsed = ideaCoachSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "اكتب فكرتك بتفصيل بسيط أولًا" });
  try {
    res.json(await coachWriterIdea(requestUserId(req), parsed.data.idea));
  } catch (error) {
    console.error("[Writer Workspace] coach failed:", error);
    res.status(502).json({ message: "تعذر تطوير الفكرة الآن" });
  }
});

const reviewSchema = z.object({
  articleId: z.string().min(1),
  title: z.string().max(500).optional(),
  content: z.string().max(100_000).optional(),
});
router.post("/api/opinion-author/article-review", writerAiLimiter, async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "بيانات المقال غير صالحة" });
  try {
    res.json(await reviewWriterArticle(requestUserId(req), parsed.data.articleId, parsed.data));
  } catch (error) {
    if (error instanceof Error && error.message === "ARTICLE_NOT_FOUND") {
      return res.status(404).json({ message: "المقال غير موجود أو لا تملكه" });
    }
    console.error("[Writer Workspace] first reader failed:", error);
    res.status(502).json({ message: "تعذرت مراجعة المقال الآن" });
  }
});

router.get("/api/opinion-author/style-profile", writerAiLimiter, async (req, res) => {
  try {
    res.json(await getWriterStyleProfile(requestUserId(req)));
  } catch (error) {
    console.error("[Writer Workspace] style profile failed:", error);
    res.status(502).json({ message: "تعذر بناء ملف الأسلوب الآن" });
  }
});

router.get("/api/opinion-author/media-license", async (req, res) => {
  try {
    res.json(await getWriterMediaLicense(requestUserId(req)));
  } catch (error) {
    console.error("[Writer Workspace] media license status failed:", error);
    res.status(500).json({ message: "تعذر جلب حالة الترخيص" });
  }
});

// رفع الترخيص: رقم + ملف عبر تخزين خاص S3/R2 فقط (نفس آلية طلبات المراسلين).
router.post(
  "/api/opinion-author/media-license",
  upload.single("licenseFile"),
  async (req, res) => {
    try {
      const licenseNumber = String(req.body?.licenseNumber || "").trim();
      if (licenseNumber.length < 3) {
        return res.status(400).json({ message: "رقم الترخيص المهني مطلوب" });
      }

      const expiresAt = parseMediaLicenseExpiry(String(req.body?.licenseExpiresAt || ""));
      if (!expiresAt) {
        return res.status(400).json({ message: "تاريخ انتهاء الترخيص مطلوب (يوم/شهر/سنة)" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "يرجى إرفاق صورة الترخيص أو ملف PDF" });
      }
      if (!file.mimetype.startsWith("image/") && file.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "الترخيص يجب أن يكون صورة أو ملف PDF" });
      }

      if (!isPrivateObjectStorageConfigured()) {
        console.error("[Writer Workspace] Private object storage not configured for media license");
        return res.status(502).json({ message: "خدمة رفع المستندات غير متاحة حالياً. حاول لاحقاً." });
      }

      const ext = file.mimetype === "application/pdf" ? "pdf" : (file.mimetype.split("/")[1] || "jpg");
      const key = `writer-media-licenses/${requestUserId(req)}/${randomUUID()}.${ext}`;
      const uploaded = await new ObjectStorageService().uploadFile(
        key,
        file.buffer,
        file.mimetype,
        "private",
      );

      const status = await saveWriterMediaLicense(requestUserId(req), {
        licenseNumber,
        licenseFileKey: uploaded.path,
        expiresAt,
      });

      res.json({
        message: "شكراً لك — تم استلام بيانات الترخيص بنجاح.",
        ...status,
      });
    } catch (error) {
      console.error("[Writer Workspace] media license upload failed:", error);
      res.status(500).json({ message: "تعذر حفظ الترخيص. حاول مرة أخرى لاحقاً." });
    }
  },
);

export default router;
