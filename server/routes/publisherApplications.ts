// تسجيل الناشرين من الرابط العام /publisher/register + مراجعة الإدارة.
// المسار: المتقدم يرسل البيانات والشعار ← بريد تأكيد له وتنبيه لصندوق الناشرين
// وجرس اللوحة ← الإدارة تقبل (حساب «ناشر» + كلمة مؤقتة بالبريد) أو ترفض بسبب.
// ADR-001: الاستعلامات في services/publisherApplicationService.
import path from "path";
import { randomUUID } from "crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import sharp from "sharp";
import { z } from "zod";
import { requireAuth, requireRole, logActivity } from "../rbac";
import { cfKeyGenerator, cfValidate } from "../utils/rateLimiting";
import { cloudflareImagesService } from "../services/cloudflareImagesService";
import {
  PublisherApplicationError,
  approvePublisherApplication,
  createPublisherApplication,
  hasPendingPublisherApplication,
  listPublisherApplications,
  rejectPublisherApplication,
} from "../services/publisherApplicationService";
import {
  sendPublisherApplicationAdminNotice,
  sendPublisherApplicationApproved,
  sendPublisherApplicationReceived,
  sendPublisherApplicationRejected,
} from "../services/publisherApplicationEmails";
import { notifyAdmins } from "../services/publisherPortalService";
import {
  PUBLISHER_LOGO_MAX_BYTES,
  approvePublisherApplicationSchema,
  publisherApplicationRef,
  publisherApplicationSchema,
  publisherLogoProblem,
} from "@shared/publisherApplications";

const router = Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "محاولات كثيرة. حاول بعد قليل." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
});

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PUBLISHER_LOGO_MAX_BYTES, files: 1, fields: 30 },
}).single("logo");

/** multer يرمي أخطاءه لمعالج Express العام؛ نعيدها هنا JSON مفهومًا للنموذج. */
function parseLogo(req: Request, res: Response, next: NextFunction) {
  logoUpload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "الشعار أكبر من 10 ميجا. صغّر حجمه أو اختر ملفًا آخر.", field: "logo" });
    }
    return res.status(400).json({ message: "تعذر قراءة الملف المرفق", field: "logo" });
  });
}

const SHARP_FORMATS: Record<string, { mime: string; ext: string }> = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
};

/** يتحقق من أن الملف صورة حقيقية (لا امتدادًا مزيفًا) ثم يرفعه. */
async function storeLogo(file: Express.Multer.File, agencyName: string): Promise<{ url: string } | { error: string; status: number }> {
  const problem = publisherLogoProblem({ type: file.mimetype, size: file.size });
  if (problem) return { error: problem, status: 400 };

  let format: { mime: string; ext: string } | undefined;
  try {
    const meta = await sharp(file.buffer).metadata();
    format = meta.format ? SHARP_FORMATS[meta.format] : undefined;
    if (!format) return { error: "الشعار يجب أن يكون صورة JPG أو PNG أو WebP", status: 400 };
    if ((meta.width ?? 0) < 64 || (meta.height ?? 0) < 64) {
      return { error: "الشعار صغير جدًا. ارفع صورة لا تقل عن 64×64 بكسل.", status: 400 };
    }
    if ((meta.pages ?? 1) > 1) return { error: "الشعار المتحرك غير مدعوم", status: 400 };
  } catch {
    return { error: "الملف ليس صورة صالحة", status: 400 };
  }

  if (cloudflareImagesService.isCloudflareConfigured()) {
    const result = await cloudflareImagesService.uploadToCloudflare(
      file.buffer,
      `publisher-logo.${format.ext}`,
      { type: "publisher-application-logo", agency: agencyName.slice(0, 80) },
      format.mime,
    );
    if (result.success && result.deliveryUrl) return { url: result.deliveryUrl };
    console.error("[Publisher Applications] logo upload failed:", result.error);
    return { error: "تعذر رفع الشعار الآن. حاول بعد قليل.", status: 502 };
  }

  // التطوير المحلي فقط: القرص يُقدَّم من /uploads. الإنتاج بلا Cloudflare Images يرفض.
  if (process.env.NODE_ENV !== "production") {
    const fsp = await import("fs/promises");
    const dir = path.join(process.cwd(), "uploads", "publisher-logos");
    await fsp.mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${format.ext}`;
    await fsp.writeFile(path.join(dir, name), file.buffer);
    return { url: `/uploads/publisher-logos/${name}` };
  }
  console.error("[Publisher Applications] Cloudflare Images is not configured");
  return { error: "خدمة رفع الشعار غير متاحة حاليًا. حاول لاحقًا.", status: 502 };
}

// POST /api/publisher-applications — تقديم عام (multipart: الحقول + logo)
router.post("/api/publisher-applications", submitLimiter, parseLogo, async (req: Request, res: Response) => {
  try {
    const parsed = publisherApplicationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return res.status(400).json({ message: issue?.message || "بيانات غير صحيحة", field: issue?.path?.[0] });
    }
    const data = parsed.data;

    if (!req.file) return res.status(400).json({ message: "شعار الوكالة مطلوب", field: "logo" });

    if (await hasPendingPublisherApplication(data.loginEmail, data.email)) {
      return res.status(409).json({ message: "لديكم طلب قيد المراجعة بنفس البريد. سنرد عليكم قريبًا." });
    }

    const logo = await storeLogo(req.file, data.agencyName);
    if ("error" in logo) return res.status(logo.status).json({ message: logo.error, field: "logo" });

    const { consent: _consent, ...fields } = data;
    const application = await createPublisherApplication({
      ...fields,
      agencyNameEn: fields.agencyNameEn ?? null,
      contactPersonEn: fields.contactPersonEn ?? null,
      commercialRegistration: fields.commercialRegistration ?? null,
      taxNumber: fields.taxNumber ?? null,
      address: fields.address ?? null,
      logoUrl: logo.url,
      consentAt: new Date(),
    });

    // الإشعارات لا توقف التقديم إن فشلت.
    void sendPublisherApplicationReceived(application).catch(() => {});
    void sendPublisherApplicationAdminNotice(application).catch(() => {});
    void notifyAdmins({
      title: "طلب ناشر جديد",
      body: `${application.agencyName} — ${application.contactPerson}`,
      deeplink: "/dashboard/admin/publisher-applications",
    });

    res.status(201).json({
      message: "وصلنا طلبك",
      reference: publisherApplicationRef(application.id),
      email: application.email,
      loginEmail: application.loginEmail,
    });
  } catch (error) {
    if (error instanceof PublisherApplicationError) return res.status(error.status).json({ message: error.message });
    console.error("[Publisher Applications] submit failed:", error);
    res.status(500).json({ message: "تعذر إرسال الطلب. حاول مرة أخرى." });
  }
});

const adminOnly = [requireAuth, requireRole("admin", "system_admin")];

router.get("/api/admin/publisher-applications", ...adminOnly, async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json(await listPublisherApplications(status));
  } catch (error) {
    console.error("[Publisher Applications] list failed:", error);
    res.status(500).json({ message: "تعذر جلب الطلبات" });
  }
});

router.post("/api/admin/publisher-applications/:id/approve", ...adminOnly, async (req: Request, res: Response) => {
  const parsed = approvePublisherApplicationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "إعدادات القبول غير صحيحة" });
  const reviewerId = (req.user as { id: string }).id;
  try {
    const result = await approvePublisherApplication(req.params.id, reviewerId, parsed.data);
    await logActivity({
      userId: reviewerId,
      action: "approve",
      entityType: "publisher_application",
      entityId: req.params.id,
      newValue: { status: "approved", publisherId: result.publisher.id, userId: result.userId },
    });
    const mail = await sendPublisherApplicationApproved(result.application, result.temporaryPassword);
    res.json({
      message: mail.success
        ? "تم القبول وإرسال بيانات الدخول إلى بريد الوكالة"
        : "تم القبول، لكن تعذر إرسال البريد. أعد تعيين كلمة المرور من إدارة المستخدمين.",
      emailSent: mail.success,
      publisherId: result.publisher.id,
    });
  } catch (error) {
    if (error instanceof PublisherApplicationError) return res.status(error.status).json({ message: error.message });
    console.error("[Publisher Applications] approve failed:", error);
    res.status(500).json({ message: "تعذر قبول الطلب" });
  }
});

const rejectSchema = z.object({ reason: z.string().trim().min(3, "اكتب سبب الرفض").max(1000) });

router.post("/api/admin/publisher-applications/:id/reject", ...adminOnly, async (req: Request, res: Response) => {
  const parsed = rejectSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || "سبب الرفض مطلوب" });
  const reviewerId = (req.user as { id: string }).id;
  try {
    const application = await rejectPublisherApplication(req.params.id, reviewerId, parsed.data.reason);
    await logActivity({
      userId: reviewerId,
      action: "reject",
      entityType: "publisher_application",
      entityId: req.params.id,
      newValue: { status: "rejected" },
    });
    const mail = await sendPublisherApplicationRejected(application, parsed.data.reason);
    res.json({ message: "تم رفض الطلب وإبلاغ الوكالة", emailSent: mail.success });
  } catch (error) {
    if (error instanceof PublisherApplicationError) return res.status(error.status).json({ message: error.message });
    console.error("[Publisher Applications] reject failed:", error);
    res.status(500).json({ message: "تعذر رفض الطلب" });
  }
});

export default router;
