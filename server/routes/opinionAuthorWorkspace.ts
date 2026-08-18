import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireAuth, userHasAnyRole } from "../rbac";
import { mediaLicenseUpload } from "../utils/uploadMiddleware";
import {
  coachWriterIdea,
  generateWriterIdeas,
  getOpinionAuthorWorkspace,
  getWriterEditorialNotifications,
  getWriterMediaLicense,
  getWriterStyleProfile,
  markAllWriterEditorialNotificationsRead,
  markWriterEditorialNotificationRead,
  reviewWriterArticle,
  saveWriterMediaLicense,
} from "../services/opinionAuthorWorkspaceService";
import { mediaLicenseExpiryRejection } from "../services/mediaLicenseService";
import { uploadMediaLicenseDocument } from "../services/mediaLicenseUpload";
import {
  createOrUpdateAuthorSocialProposal,
  getAuthorSocialProposalStatus,
  SocialPublishValidationError,
} from "../services/socialPublishing/socialPublishingService";

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
  mediaLicenseUpload.single("licenseFile"),
  async (req, res) => {
    try {
      const licenseNumber = String(req.body?.licenseNumber || "").trim();
      if (licenseNumber.length < 3) {
        return res.status(400).json({ message: "رقم الترخيص المهني مطلوب" });
      }

      const expiry = mediaLicenseExpiryRejection(String(req.body?.licenseExpiresAt || ""));
      if ("error" in expiry) {
        return res.status(400).json({ message: expiry.error });
      }
      const { expiresAt } = expiry;

      const file = req.file;
      if (!file) {
        return res.status(400).json({ message: "يرجى إرفاق صورة الترخيص أو ملف PDF" });
      }
      if (!file.mimetype.startsWith("image/") && file.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "الترخيص يجب أن يكون صورة أو ملف PDF" });
      }

      const uploaded = await uploadMediaLicenseDocument({
        relativeKey: `writer-media-licenses/${requestUserId(req)}/${randomUUID()}.bin`,
        buffer: file.buffer,
        contentType: file.mimetype,
      });

      const status = await saveWriterMediaLicense(requestUserId(req), {
        licenseNumber,
        licenseFileKey: uploaded.path,
        expiresAt,
      });

      res.json({
        message:
          "وصلنا ملفك وهو تحت مراجعة مسؤول النظام. لن تتمكن من إنشاء مقال حتى تتم الموافقة على الترخيص.",
        ...status,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("ترخيص منتهٍ") || msg.includes("صورة أو ملف PDF")) {
        return res.status(400).json({ message: msg });
      }
      if (msg.includes("غير متاحة حالياً")) {
        console.error("[Writer Workspace] Private object storage not configured for media license");
        return res.status(502).json({ message: msg });
      }
      console.error("[Writer Workspace] media license upload failed:", error);
      res.status(500).json({ message: "تعذر حفظ الترخيص. حاول مرة أخرى لاحقاً." });
    }
  },
);

// ── مقترح النشر على منصة X لمقال الرأي المنشور (نافذة 24 ساعة) ────────

router.get("/api/opinion-author/articles/:articleId/social-proposal", async (req, res) => {
  try {
    const status = await getAuthorSocialProposalStatus(req.params.articleId, requestUserId(req));
    res.json(status);
  } catch (error: unknown) {
    if (error instanceof SocialPublishValidationError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("[Opinion Author Social Proposal] get status failed:", error);
    res.status(500).json({ message: "تعذر التحقق من حالة النشر الاجتماعي" });
  }
});

const authorProposalSchema = z.object({
  text: z.string().trim().min(1, "نص المنشور مطلوب").max(2000, "النص طويل جداً"),
  textSource: z.enum(["title", "custom"]),
});

router.post("/api/opinion-author/articles/:articleId/social-proposal", async (req, res) => {
  try {
    const parsed = authorProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message || "بيانات المقترح غير صالحة" });
    }
    const post = await createOrUpdateAuthorSocialProposal({
      articleId: req.params.articleId,
      authorUserId: requestUserId(req),
      text: parsed.data.text,
      textSource: parsed.data.textSource,
    });
    res.status(201).json({ success: true, post });
  } catch (error: unknown) {
    if (error instanceof SocialPublishValidationError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("[Opinion Author Social Proposal] submit failed:", error);
    res.status(500).json({ message: "تعذر إرسال مقترح النشر الاجتماعي" });
  }
});

export default router;
