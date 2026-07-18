// مسارات طلبات المراسلين: التقديم العام + المراجعة الإدارية (قبول/رفض).
// نُقلت من server/routes.ts أثناء إعادة هيكلة الخدمة 2026-07-18، مع:
//  - رفع الصورة عبر Cloudflare Images بدل حاوية Replit المحذوفة (كانت ترجع
//    ECONNREFUSED 127.0.0.1:1106 على Railway — نفس إصلاح طلبات كتّاب الرأي).
//  - منع تكرار التقديم أثناء وجود طلب قيد المراجعة بنفس البريد.
//  - ترقية حساب القارئ الموجود بدل إنشاء حساب مكرر عند القبول.
// ADR-001: لا وصول لقاعدة البيانات هنا — كل الاستعلامات في correspondentApplicationService.
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole, logActivity } from "../rbac";
import { cfKeyGenerator, cfValidate } from "../utils/rateLimiting";
import { upload } from "../utils/uploadMiddleware";
import { cloudflareImagesService } from "../services/cloudflareImagesService";
import {
  sendCorrespondentApprovalEmail,
  sendCorrespondentRejectionEmail,
} from "../services/employeeNotifications";
import {
  approveCorrespondentApplication,
  createCorrespondentApplication,
  getCorrespondentApplicationById,
  hasPendingCorrespondentApplication,
  listCorrespondentApplications,
  rejectCorrespondentApplication,
} from "../services/correspondentApplicationService";

const router = Router();

const applicationSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { message: "تم تجاوز حد رفع الملفات. يرجى المحاولة لاحقاً" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
});

// POST /api/correspondent-applications - Public registration with photo upload
router.post(
  "/api/correspondent-applications",
  applicationSubmitLimiter,
  upload.single("profilePhoto"),
  async (req: Request, res: Response) => {
    try {
      const { arabicName, englishName, email, phone, jobTitle, bio, city } = req.body;

      if (!arabicName || !englishName || !email || !phone || !city) {
        return res.status(400).json({ message: "جميع الحقول المطلوبة يجب ملؤها" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "الصورة الشخصية مطلوبة" });
      }

      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({ message: "الملف المرفوع يجب أن يكون صورة" });
      }

      const normalizedEmail = String(email).toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ message: "البريد الإلكتروني غير صحيح" });
      }

      // Block duplicate submissions while a previous application is pending
      if (await hasPendingCorrespondentApplication(normalizedEmail)) {
        return res.status(409).json({
          message: "لديك طلب قيد المراجعة بالفعل بنفس البريد الإلكتروني. سيتم الرد عليك قريباً.",
        });
      }

      let profilePhotoUrl: string | null = null;
      if (cloudflareImagesService.isCloudflareConfigured()) {
        const cfResult = await cloudflareImagesService.uploadToCloudflare(
          req.file.buffer,
          req.file.originalname || "profile.jpg",
          { type: "correspondent-application", email: normalizedEmail },
          req.file.mimetype,
        );
        if (cfResult.success && cfResult.deliveryUrl) {
          profilePhotoUrl = cfResult.deliveryUrl;
        } else {
          console.warn("[Correspondent] CF Images upload failed:", cfResult.error);
        }
      }

      if (!profilePhotoUrl) {
        return res.status(502).json({ message: "خدمة رفع الصورة غير متاحة حالياً. حاول لاحقاً." });
      }

      const application = await createCorrespondentApplication({
        arabicName,
        englishName,
        email: normalizedEmail,
        phone,
        jobTitle: jobTitle || "مراسل صحفي",
        bio: bio || null,
        city,
        profilePhotoUrl,
      });

      console.log(`✅ Correspondent application created: ${application.id}`);
      res.status(201).json({
        message: "تم تقديم طلبك بنجاح. سيتم مراجعته والرد عليك قريباً.",
        applicationId: application.id,
      });
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Error creating correspondent application:", err);
      res.status(500).json({ message: "حدث خطأ في تقديم الطلب: " + err.message });
    }
  },
);

// GET /api/admin/correspondent-applications - List all applications (admin only)
router.get(
  "/api/admin/correspondent-applications",
  requireAuth,
  requireRole("admin", "system_admin"),
  async (req: Request, res: Response) => {
    try {
      const { status, page = "1", limit = "10" } = req.query;
      const result = await listCorrespondentApplications(
        status as string,
        parseInt(page as string),
        parseInt(limit as string),
      );
      res.json(result);
    } catch (error: unknown) {
      console.error("Error fetching correspondent applications:", error);
      res.status(500).json({ message: "فشل في جلب الطلبات" });
    }
  },
);

// GET /api/admin/correspondent-applications/:id - Get application by ID (admin only)
router.get(
  "/api/admin/correspondent-applications/:id",
  requireAuth,
  requireRole("admin", "system_admin"),
  async (req: Request, res: Response) => {
    try {
      const application = await getCorrespondentApplicationById(req.params.id);
      if (!application) {
        return res.status(404).json({ message: "الطلب غير موجود" });
      }
      res.json(application);
    } catch (error: unknown) {
      console.error("Error fetching correspondent application:", error);
      res.status(500).json({ message: "فشل في جلب تفاصيل الطلب" });
    }
  },
);

// POST /api/admin/correspondent-applications/:id/approve - Approve application (admin only)
router.post(
  "/api/admin/correspondent-applications/:id/approve",
  requireAuth,
  requireRole("admin", "system_admin"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const reviewerId = (req.user as { id: string }).id;

      const result = await approveCorrespondentApplication(id, reviewerId, notes);

      await logActivity({
        userId: reviewerId,
        action: "approve",
        entityType: "correspondent_application",
        entityId: id,
        newValue: {
          status: "approved",
          createdUserId: result.user.id,
          existingAccountUpgraded: result.existingAccountUpgraded,
        },
      });

      // Send approval email notification (non-blocking)
      sendCorrespondentApprovalEmail(
        result.user.email,
        result.application.arabicName || "",
        result.application.englishName || "",
        result.temporaryPassword,
      ).catch((err) => console.error("Failed to send correspondent approval email:", err));

      res.json({
        message: result.existingAccountUpgraded
          ? "تمت الموافقة على الطلب وترقية حساب القارئ الحالي إلى حساب مراسل"
          : "تمت الموافقة على الطلب وإنشاء حساب المراسل",
        application: result.application,
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
        },
        temporaryPassword: result.temporaryPassword,
        existingAccountUpgraded: result.existingAccountUpgraded,
      });
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Error approving correspondent application:", err);
      if (err.message === "Application not found") {
        return res.status(404).json({ message: "الطلب غير موجود" });
      }
      if (err.message === "Application already processed") {
        return res.status(400).json({ message: "تمت معالجة هذا الطلب مسبقاً" });
      }
      if (err.message === "Existing staff account") {
        return res.status(409).json({
          message:
            "يوجد حساب موظف/إداري بنفس البريد الإلكتروني — لا يمكن ترقيته تلقائياً. راجع حسابه من إدارة المستخدمين أولاً.",
        });
      }
      res.status(500).json({ message: "فشل في الموافقة على الطلب: " + err.message });
    }
  },
);

// POST /api/admin/correspondent-applications/:id/reject - Reject application (admin only)
router.post(
  "/api/admin/correspondent-applications/:id/reject",
  requireAuth,
  requireRole("admin", "system_admin"),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const reviewerId = (req.user as { id: string }).id;

      if (!reason) {
        return res.status(400).json({ message: "سبب الرفض مطلوب" });
      }

      const application = await rejectCorrespondentApplication(id, reviewerId, reason);

      await logActivity({
        userId: reviewerId,
        action: "reject",
        entityType: "correspondent_application",
        entityId: id,
        newValue: { status: "rejected", reason },
      });

      // Send rejection email notification (non-blocking)
      sendCorrespondentRejectionEmail(application.email, application.arabicName || "", reason).catch(
        (err) => console.error("Failed to send correspondent rejection email:", err),
      );

      res.json({ message: "تم رفض الطلب", application });
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Error rejecting correspondent application:", err);
      if (err.message === "Application not found") {
        return res.status(404).json({ message: "الطلب غير موجود" });
      }
      res.status(500).json({ message: "فشل في رفض الطلب: " + err.message });
    }
  },
);

export default router;
