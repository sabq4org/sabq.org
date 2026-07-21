// مسارات طلبات المراسلين: التقديم العام + المراجعة الإدارية (قبول/رفض).
// نُقلت من server/routes.ts أثناء إعادة هيكلة الخدمة 2026-07-18، مع:
//  - رفع الصورة عبر Cloudflare Images (لا Replit Object Storage).
//  - رفع الترخيص والسيرة عبر تخزين خاص S3/R2 فقط (objectStorage يرفض
//    مسار Replit sidecar خارج Replit — كان يكسر التقديم على Railway بـ
//    ECONNREFUSED 127.0.0.1:1106).
//  - منع تكرار التقديم أثناء وجود طلب قيد المراجعة بنفس البريد.
//  - ترقية حساب القارئ الموجود بدل إنشاء حساب مكرر عند القبول.
// ADR-001: لا وصول لقاعدة البيانات هنا — كل الاستعلامات في correspondentApplicationService.
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { requireAuth, requireRole, logActivity } from "../rbac";
import { cfKeyGenerator, cfValidate } from "../utils/rateLimiting";
import { upload } from "../utils/uploadMiddleware";
import { cloudflareImagesService } from "../services/cloudflareImagesService";
import { ObjectStorageService, isPrivateObjectStorageConfigured } from "../objectStorage";
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
import { mediaLicenseExpiryRejection } from "../services/mediaLicenseService";

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

// POST /api/correspondent-applications - Public registration (photo + license + CV)
router.post(
  "/api/correspondent-applications",
  applicationSubmitLimiter,
  upload.fields([
    { name: "profilePhoto", maxCount: 1 },
    { name: "licenseFile", maxCount: 1 },
    { name: "cvFile", maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const {
        arabicName, englishName, email, phone, jobTitle, bio, city,
        nationalId, region, licenseNumber, licenseExpiresAt,
        specializations, portfolioLinks, yearsOfExperience, currentEmployer, consent,
      } = req.body;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const profilePhoto = files?.profilePhoto?.[0];
      const licenseFile = files?.licenseFile?.[0];
      const cvFile = files?.cvFile?.[0];

      if (!arabicName || !englishName || !email || !phone || !city || !region
        || !nationalId || !licenseNumber || !specializations) {
        return res.status(400).json({ message: "جميع الحقول المطلوبة يجب ملؤها" });
      }

      if (consent !== "true") {
        return res.status(400).json({ message: "يجب الإقرار بصحة البيانات والموافقة على معالجتها" });
      }

      if (!/^[12]\d{9}$/.test(String(nationalId).trim())) {
        return res.status(400).json({ message: "رقم الهوية/الإقامة يجب أن يكون 10 أرقام ويبدأ بـ 1 أو 2" });
      }

      if (!profilePhoto) {
        return res.status(400).json({ message: "الصورة الشخصية مطلوبة" });
      }
      if (!profilePhoto.mimetype.startsWith("image/")) {
        return res.status(400).json({ message: "الصورة الشخصية يجب أن تكون ملف صورة" });
      }
      if (!licenseFile) {
        return res.status(400).json({ message: "صورة الترخيص المهني مطلوبة" });
      }
      if (!licenseFile.mimetype.startsWith("image/") && licenseFile.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "الترخيص المهني يجب أن يكون صورة أو ملف PDF" });
      }
      if (!cvFile) {
        return res.status(400).json({ message: "السيرة الذاتية مطلوبة" });
      }
      if (cvFile.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "السيرة الذاتية يجب أن تكون ملف PDF" });
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

      // Profile photo → Cloudflare Images (public delivery URL, shown in dashboard)
      let profilePhotoUrl: string | null = null;
      if (cloudflareImagesService.isCloudflareConfigured()) {
        const cfResult = await cloudflareImagesService.uploadToCloudflare(
          profilePhoto.buffer,
          profilePhoto.originalname || "profile.jpg",
          { type: "correspondent-application", email: normalizedEmail },
          profilePhoto.mimetype,
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

      // License + CV are sensitive documents → PRIVATE object storage (S3/R2).
      // Never fall through to the Replit GCS sidecar on Railway — that returns
      // ECONNREFUSED 127.0.0.1:1106. Only storage keys are persisted; admins
      // fetch via the protected /file/:kind route (short-lived signed URLs).
      if (!isPrivateObjectStorageConfigured()) {
        console.error(
          "[Correspondent] Private object storage not configured " +
            "(need R2 via R2_* or NEWS_IMAGES_R2_*, or S3 credentials)",
        );
        return res.status(502).json({
          message: "خدمة رفع المستندات غير متاحة حالياً. حاول لاحقاً.",
        });
      }

      const objectStorage = new ObjectStorageService();
      const docId = randomUUID();
      const { uploadMediaLicenseDocument } = await import("../services/mediaLicenseUpload");
      const [licenseUpload, cvUpload] = await Promise.all([
        uploadMediaLicenseDocument({
          relativeKey: `correspondent-docs/${docId}-license.bin`,
          buffer: licenseFile.buffer,
          contentType: licenseFile.mimetype,
        }),
        objectStorage.uploadPrivateDocument(
          `correspondent-docs/${docId}-cv.pdf`,
          cvFile.buffer,
          cvFile.mimetype,
        ),
      ]);

      const expYears = parseInt(String(yearsOfExperience), 10);
      const expiry = mediaLicenseExpiryRejection(String(licenseExpiresAt || ""));
      if ("error" in expiry) {
        return res.status(400).json({ message: expiry.error });
      }

      const application = await createCorrespondentApplication({
        arabicName,
        englishName,
        email: normalizedEmail,
        phone,
        jobTitle: jobTitle || "مراسل صحفي",
        bio: bio || null,
        city,
        region,
        nationalId: String(nationalId).trim(),
        licenseNumber: String(licenseNumber).trim(),
        licenseExpiresAt: expiry.expiresAt,
        licenseFileKey: licenseUpload.path,
        cvFileKey: cvUpload.path,
        specializations: String(specializations),
        portfolioLinks: portfolioLinks ? String(portfolioLinks) : null,
        yearsOfExperience: Number.isFinite(expYears) && expYears >= 0 ? expYears : null,
        currentEmployer: currentEmployer ? String(currentEmployer) : null,
        consentAt: new Date(),
        profilePhotoUrl,
      });

      console.log(`✅ Correspondent application created: ${application.id}`);
      res.status(201).json({
        message: "تم تقديم طلبك بنجاح. سيتم مراجعته والرد عليك قريباً.",
        applicationId: application.id,
      });
    } catch (error: unknown) {
      console.error("Error creating correspondent application:", error);
      // Do not leak backend/storage internals (e.g. ECONNREFUSED 127.0.0.1:1106)
      // into the public registration form.
      res.status(500).json({
        message: "حدث خطأ في تقديم الطلب. يرجى المحاولة مرة أخرى لاحقاً.",
      });
    }
  },
);

// GET /api/admin/correspondent-applications/:id/file/:kind - Signed download
// for the private license/CV documents (admin only; 5-minute URL).
router.get(
  "/api/admin/correspondent-applications/:id/file/:kind",
  requireAuth,
  requireRole("admin", "system_admin"),
  async (req: Request, res: Response) => {
    try {
      const { id, kind } = req.params;
      if (kind !== "license" && kind !== "cv") {
        return res.status(400).json({ message: "نوع الملف غير صحيح" });
      }
      const application = await getCorrespondentApplicationById(id);
      if (!application) {
        return res.status(404).json({ message: "الطلب غير موجود" });
      }
      const key = kind === "license" ? application.licenseFileKey : application.cvFileKey;
      if (!key) {
        return res.status(404).json({ message: "لا يوجد ملف مرفق لهذا الطلب" });
      }
      const url = await new ObjectStorageService().getPrivateFileDownloadURL(key, 300);
      res.redirect(url);
    } catch (error: unknown) {
      console.error("Error fetching correspondent application file:", error);
      res.status(500).json({ message: "فشل في جلب الملف" });
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
      if (err.message.includes("ترخيص منتهٍ")) {
        return res.status(400).json({ message: err.message });
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
