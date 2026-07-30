// ----------------------------------------------------------------------------
// ملف المنسوب الموحّد — مسارات لوحة التحكم /api/staff-profiles/*
//
// البوابة: صلاحيات staff_profiles.view / staff_profiles.manage /
// staff_documents.view — يملكها admin (superuser shortcut في
// getUserPermissions) ودور «الموارد البشرية» المستحدث.
//
// مسار ذاتي للكاتب/المراسل: /api/staff-profiles/me* — جلسة + دور
// opinion_author أو reporter. لا استيراد db هنا (ADR-001).
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { getUserPermissions, getUserRoleNames, userHasAnyRole } from "../rbac";
import { upload } from "../utils/uploadMiddleware";
import { ObjectStorageService, isPrivateObjectStorageConfigured } from "../objectStorage";
import {
  addDepartment,
  addJobTitle,
  employmentTypeForSelfRole,
  getLookups,
  getStaffDocumentKey,
  getStaffProfile,
  isSelfStaffDocKind,
  listStaff,
  revealNationalId,
  setStaffDocumentKey,
  upsertStaffProfile,
  approveStaffProfile,
  requestStaffProfileCorrection,
  getStaffProfileReviewStatus,
  SELF_STAFF_PROFILE_ROLES,
  STAFF_DOC_KINDS,
  type StaffDocKind,
  type StaffProfilePatch,
} from "../services/staffProfileService";
import {
  assertPressIdNumberChange,
  ensurePressIdNumber,
} from "../services/pressCardNumberService";

const router = Router();

function requirePermission(code: string) {
  return async (req: Request, res: Response, next: () => void) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.status(401).json({ message: "غير مصرح" });
    const perms = await getUserPermissions(user.id);
    if (perms.includes(code) || perms.includes("*")) return next();
    return res.status(403).json({ message: "لا تملك صلاحية الوصول لملفات المنسوبين" });
  };
}

/** أي صلاحية من القائمة تكفي — توليد رقم البطاقة متاح من سطحَي الإدارة:
 *  ملف المنسوب (staff_profiles.manage) ولوحة المستخدمين (users.update). */
function requireAnyPermission(codes: string[]) {
  return async (req: Request, res: Response, next: () => void) => {
    const user = req.user as { id: string } | undefined;
    if (!user) return res.status(401).json({ message: "غير مصرح" });
    const perms = await getUserPermissions(user.id);
    if (perms.includes("*") || codes.some((code) => perms.includes(code))) return next();
    return res.status(403).json({ message: "لا تملك صلاحية إصدار رقم البطاقة الصحفية" });
  };
}

async function requireSelfStaffAccess(req: Request, res: Response, next: () => void) {
  const user = req.user as { id: string } | undefined;
  if (!user) return res.status(401).json({ message: "غير مصرح" });
  const ok = await userHasAnyRole(user.id, [...SELF_STAFF_PROFILE_ROLES]);
  if (!ok) {
    return res.status(403).json({ message: "استكمال الملف متاح لكتّاب الرأي والمراسلين فقط" });
  }
  return next();
}

router.use("/api/staff-profiles", isAuthenticated);

// nullish (نص | null | غير موجود): الملفات المرحّلة تحمل حقولاً null
// والفورم يعيدها كما هي — رفض null كان يفشل الحفظ بـ
// «Expected string, received null». null = تفريغ الحقل في الخدمة.
const nStr = (max: number) => z.string().max(max).nullish();

const patchSchema = z.object({
  nationalId: z.string().trim().regex(/^\d{10}$/, "الهوية 10 أرقام").optional().or(z.literal("")),
  nationality: nStr(60),
  officialBirthDate: nStr(30),
  officialPhotoUrl: nStr(600),
  jobTitleId: nStr(60),
  departmentId: nStr(60),
  employmentType: z.enum(["employee", "collaborator", "field_reporter", "opinion_writer"]).nullish(),
  joinedAt: nStr(30),
  managerUserId: nStr(60),
  workRegion: nStr(120),
  pressIdNumber: nStr(40),
  pressCardValidUntil: nStr(30),
  mediaLicenseNumber: nStr(60),
  mediaLicenseExpiresAt: nStr(30),
  officialPhone: nStr(30),
  officialEmail: nStr(160),
  emergencyContactName: nStr(120),
  emergencyContactRelation: nStr(60),
  emergencyContactPhone: nStr(30),
  bloodType: nStr(3),
  bioAr: nStr(2000),
  bioEn: nStr(2000),
  specializations: z.array(z.string().max(80)).max(20).nullish(),
  socialX: nStr(200),
  socialLinkedin: nStr(200),
  personalWebsite: nStr(300),
  yearsOfExperience: z.number().int().min(0).max(60).nullish(),
  previousEmployers: nStr(1000),
  notes: nStr(2000),
  officialFullNameAr: nStr(200),
  firstName: nStr(80),
  lastName: nStr(80),
  phoneNumber: nStr(30),
});

/** حقول يمنع المنسوب من تعديلها ذاتياً (حوكمة HR / اعتماد صحفي). */
const SELF_FORBIDDEN_KEYS = [
  "notes",
  "managerUserId",
  "pressIdNumber",
  "pressCardValidUntil",
  "mediaLicenseNumber",
  "mediaLicenseExpiresAt",
] as const;

async function uploadStaffDocument(
  userId: string,
  kind: StaffDocKind,
  file: Express.Multer.File,
  actorId: string,
) {
  if (!isPrivateObjectStorageConfigured()) {
    return { ok: false as const, status: 503, message: "التخزين الخاص غير مهيأ" };
  }
  const rawExt = (file.originalname.split(".").pop() || "").toLowerCase();
  const ALLOWED_DOC_EXT = new Set(["pdf", "jpg", "jpeg", "png", "webp"]);
  if (!ALLOWED_DOC_EXT.has(rawExt)) {
    return {
      ok: false as const,
      status: 400,
      message: "امتداد الملف غير مسموح. المسموح: PDF, JPG, PNG, WEBP",
    };
  }
  const key = `staff-docs/${userId}-${kind}-${Date.now()}.${rawExt}`;
  const stored = await new ObjectStorageService().uploadFile(key, file.buffer, file.mimetype, "private");
  await setStaffDocumentKey(userId, kind, stored.path, actorId);
  return { ok: true as const };
}

// ── مسار ذاتي للكاتب/المراسل (قبل :userId حتى لا يُلتقط «me») ──

router.get(
  "/api/staff-profiles/me/lookups",
  requireSelfStaffAccess,
  async (_req: Request, res: Response) => {
    try {
      res.json(await getLookups());
    } catch (error) {
      console.error("[StaffProfiles] self lookups error:", error);
      res.status(500).json({ message: "تعذر جلب القوائم" });
    }
  },
);

router.get(
  "/api/staff-profiles/me",
  requireSelfStaffAccess,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      const data = await getStaffProfile(userId);
      if (!data) return res.status(404).json({ message: "المستخدم غير موجود" });
      const roles = await getUserRoleNames(userId);
      res.json({
        ...data,
        selfService: true,
        suggestedEmploymentType: employmentTypeForSelfRole(roles),
      });
    } catch (error) {
      console.error("[StaffProfiles] self get error:", error);
      res.status(500).json({ message: "تعذر جلب ملفك" });
    }
  },
);

router.put(
  "/api/staff-profiles/me",
  requireSelfStaffAccess,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      const review = await getStaffProfileReviewStatus(userId);
      if (review.status === "pending_review") {
        return res.status(409).json({
          message: "ملفك قيد مراجعة الإدارة — لا يمكن التعديل حتى تكتمل المراجعة أو يُطلب منك تصحيح",
        });
      }
      // معتمد: يُسمح بالتعديل فقط لتعبئة الاسم الرباعي إن كان فارغاً (لا يمس اسم المقالات)
      if (review.status === "approved") {
        const me = await getStaffProfile(userId);
        const hasOfficial = Boolean(
          (me?.profile as { officialFullNameAr?: string | null } | null)?.officialFullNameAr?.trim(),
        );
        if (hasOfficial) {
          return res.status(409).json({
            message: "ملفك معتمد — لا يمكن التعديل. اطلب من الإدارة فتح تصحيح إن لزم",
          });
        }
      }

      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      }
      const patch = { ...parsed.data } as StaffProfilePatch;
      for (const key of SELF_FORBIDDEN_KEYS) {
        delete (patch as Record<string, unknown>)[key];
      }

      // ثبّت نوع العلاقة حسب الدور إن لم يُرسل أو كان غير متوافق
      const roles = await getUserRoleNames(userId);
      const suggested = employmentTypeForSelfRole(roles);
      if (suggested) {
        const allowed =
          suggested === "opinion_writer"
            ? ["opinion_writer", "collaborator"]
            : ["field_reporter", "collaborator"];
        if (!patch.employmentType || !allowed.includes(patch.employmentType)) {
          patch.employmentType = suggested;
        }
      }

      const result = await upsertStaffProfile(userId, patch, userId, { actorIsSelf: true });
      if (!result.success) return res.status(404).json({ message: result.message });
      res.json(result);
    } catch (error: unknown) {
      console.error("[StaffProfiles] self upsert error:", error);
      const message = error instanceof Error ? error.message : "تعذر حفظ الملف";
      res.status(500).json({ message });
    }
  },
);

router.get(
  "/api/staff-profiles/me/national-id",
  requireSelfStaffAccess,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      const value = await revealNationalId(userId, userId);
      if (!value) return res.status(404).json({ message: "لا توجد هوية محفوظة" });
      res.set("Cache-Control", "private, no-store");
      res.json({ nationalId: value });
    } catch (error) {
      console.error("[StaffProfiles] self reveal error:", error);
      res.status(500).json({ message: "تعذر كشف الهوية" });
    }
  },
);

router.post(
  "/api/staff-profiles/me/documents/:kind",
  requireSelfStaffAccess,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const kind = req.params.kind;
      if (!isSelfStaffDocKind(kind)) {
        return res.status(400).json({
          message: "يمكنك رفع السيرة أو صورة الهوية أو الترخيص فقط — العقد للموارد البشرية",
        });
      }
      if (!req.file) return res.status(400).json({ message: "لم يُرفق ملف" });
      const userId = (req.user as { id: string }).id;
      const review = await getStaffProfileReviewStatus(userId);
      if (review.status === "pending_review") {
        return res.status(409).json({
          message: "ملفك قيد مراجعة الإدارة — لا يمكن رفع وثائق حتى تكتمل المراجعة أو يُطلب منك تصحيح",
        });
      }
      if (review.status === "approved") {
        const me = await getStaffProfile(userId);
        const hasOfficial = Boolean(
          (me?.profile as { officialFullNameAr?: string | null } | null)?.officialFullNameAr?.trim(),
        );
        if (hasOfficial) {
          return res.status(409).json({
            message: "ملفك معتمد — لا يمكن رفع وثائق. اطلب من الإدارة فتح تصحيح إن لزم",
          });
        }
      }
      const uploaded = await uploadStaffDocument(userId, kind, req.file, userId);
      if (!uploaded.ok) return res.status(uploaded.status).json({ message: uploaded.message });
      res.json({ success: true, kind });
    } catch (error) {
      console.error("[StaffProfiles] self document upload error:", error);
      res.status(500).json({ message: "تعذر رفع الوثيقة" });
    }
  },
);

router.get(
  "/api/staff-profiles/me/documents/:kind",
  requireSelfStaffAccess,
  async (req: Request, res: Response) => {
    try {
      const kind = req.params.kind;
      if (!isSelfStaffDocKind(kind)) {
        return res.status(400).json({ message: "نوع الوثيقة غير متاح لك" });
      }
      const userId = (req.user as { id: string }).id;
      const key = await getStaffDocumentKey(userId, kind);
      if (!key) return res.status(404).json({ message: "لا توجد وثيقة" });
      const url = await new ObjectStorageService().getPrivateFileDownloadURL(key, 300);
      res.redirect(url);
    } catch (error) {
      console.error("[StaffProfiles] self document download error:", error);
      res.status(500).json({ message: "تعذر جلب الوثيقة" });
    }
  },
);

// ── مسارات الإدارة (HR / admin) ──

router.get(
  "/api/staff-profiles/lookups",
  requirePermission("staff_profiles.view"),
  async (_req: Request, res: Response) => {
    try {
      res.json(await getLookups());
    } catch (error) {
      console.error("[StaffProfiles] lookups error:", error);
      res.status(500).json({ message: "تعذر جلب القوائم" });
    }
  },
);

router.get(
  "/api/staff-profiles",
  requirePermission("staff_profiles.view"),
  async (req: Request, res: Response) => {
    try {
      const items = await listStaff({
        q: typeof req.query.q === "string" ? req.query.q : undefined,
        departmentId: typeof req.query.departmentId === "string" ? req.query.departmentId : undefined,
        employmentType: typeof req.query.employmentType === "string" ? req.query.employmentType : undefined,
      });
      res.json({ items });
    } catch (error) {
      console.error("[StaffProfiles] list error:", error);
      res.status(500).json({ message: "تعذر جلب المنسوبين" });
    }
  },
);

router.get(
  "/api/staff-profiles/:userId",
  requirePermission("staff_profiles.view"),
  async (req: Request, res: Response) => {
    try {
      const data = await getStaffProfile(req.params.userId);
      if (!data) return res.status(404).json({ message: "المستخدم غير موجود" });
      res.json(data);
    } catch (error) {
      console.error("[StaffProfiles] get error:", error);
      res.status(500).json({ message: "تعذر جلب الملف" });
    }
  },
);

router.put(
  "/api/staff-profiles/:userId",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    try {
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      }
      const patch = { ...parsed.data } as StaffProfilePatch & { pressIdNumber?: unknown };
      // رقم البطاقة دائم: يُقبل أول إدخال، ويُتجاهل الإرسال المطابق/الفارغ،
      // وتُرفض أي محاولة استبدال (الفورم يقفل الحقل، وهذه بوابة الخادم).
      const pressIdCheck = await assertPressIdNumberChange(req.params.userId, patch.pressIdNumber);
      if (!pressIdCheck.ok) return res.status(400).json({ message: pressIdCheck.message });
      if (pressIdCheck.value === undefined) delete patch.pressIdNumber;
      else patch.pressIdNumber = pressIdCheck.value ?? undefined;

      const result = await upsertStaffProfile(
        req.params.userId,
        patch as StaffProfilePatch,
        (req.user as { id: string }).id,
      );
      if (!result.success) return res.status(404).json({ message: result.message });
      res.json(result);
    } catch (error: unknown) {
      console.error("[StaffProfiles] upsert error:", error);
      const message = error instanceof Error ? error.message : "تعذر حفظ الملف";
      res.status(500).json({ message });
    }
  },
);

/**
 * توليد رقم البطاقة الصحفية مركزياً — SBQ-PR-#### مشتق من الرقم الوظيفي.
 * idempotent: من له رقم يُعاد رقمه نفسه بلا تغيير (created=false).
 */
router.post(
  "/api/staff-profiles/:userId/press-id-number",
  requireAnyPermission(["staff_profiles.manage", "users.update"]),
  async (req: Request, res: Response) => {
    try {
      const result = await ensurePressIdNumber(
        req.params.userId,
        (req.user as { id: string }).id,
      );
      if (!result.success) return res.status(400).json({ message: result.message });
      res.json(result);
    } catch (error) {
      console.error("[StaffProfiles] press-id-number error:", error);
      res.status(500).json({ message: "تعذر توليد رقم البطاقة الصحفية" });
    }
  },
);

/** اعتماد ملف المنسوب — يفتح له إصدار شهادة التعريف. */
router.post(
  "/api/staff-profiles/:userId/approve",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    try {
      const updated = await approveStaffProfile(
        req.params.userId,
        (req.user as { id: string }).id,
      );
      res.json({ ok: true, ...updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "تعذر الاعتماد";
      const code = /غير مكتمل|لا يوجد/.test(message) ? 400 : 500;
      if (code === 500) console.error("[StaffProfiles] approve error:", error);
      res.status(code).json({ message });
    }
  },
);

/** طلب تصحيح من المنسوب قبل الاعتماد. */
router.post(
  "/api/staff-profiles/:userId/request-correction",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    try {
      const note = String(req.body?.note ?? "");
      const updated = await requestStaffProfileCorrection(
        req.params.userId,
        (req.user as { id: string }).id,
        note,
      );
      res.json({ ok: true, ...updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "تعذر طلب التصحيح";
      const code = /مطلوبة|لا يوجد/.test(message) ? 400 : 500;
      if (code === 500) console.error("[StaffProfiles] request-correction error:", error);
      res.status(code).json({ message });
    }
  },
);

router.get(
  "/api/staff-profiles/:userId/national-id",
  requirePermission("staff_documents.view"),
  async (req: Request, res: Response) => {
    try {
      const value = await revealNationalId(req.params.userId, (req.user as { id: string }).id);
      if (!value) return res.status(404).json({ message: "لا توجد هوية محفوظة" });
      res.set("Cache-Control", "private, no-store");
      res.json({ nationalId: value });
    } catch (error) {
      console.error("[StaffProfiles] reveal error:", error);
      res.status(500).json({ message: "تعذر كشف الهوية" });
    }
  },
);

router.post(
  "/api/staff-profiles/:userId/documents/:kind",
  requirePermission("staff_profiles.manage"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const kind = req.params.kind as StaffDocKind;
      if (!(kind in STAFF_DOC_KINDS)) {
        return res.status(400).json({ message: "نوع الوثيقة غير صحيح" });
      }
      if (!req.file) return res.status(400).json({ message: "لم يُرفق ملف" });
      const uploaded = await uploadStaffDocument(
        req.params.userId,
        kind,
        req.file,
        (req.user as { id: string }).id,
      );
      if (!uploaded.ok) return res.status(uploaded.status).json({ message: uploaded.message });
      res.json({ success: true, kind });
    } catch (error) {
      console.error("[StaffProfiles] document upload error:", error);
      res.status(500).json({ message: "تعذر رفع الوثيقة" });
    }
  },
);

router.get(
  "/api/staff-profiles/:userId/documents/:kind",
  requirePermission("staff_documents.view"),
  async (req: Request, res: Response) => {
    try {
      const kind = req.params.kind as StaffDocKind;
      if (!(kind in STAFF_DOC_KINDS)) {
        return res.status(400).json({ message: "نوع الوثيقة غير صحيح" });
      }
      const key = await getStaffDocumentKey(req.params.userId, kind);
      if (!key) return res.status(404).json({ message: "لا توجد وثيقة" });
      const url = await new ObjectStorageService().getPrivateFileDownloadURL(key, 300);
      res.redirect(url);
    } catch (error) {
      console.error("[StaffProfiles] document download error:", error);
      res.status(500).json({ message: "تعذر جلب الوثيقة" });
    }
  },
);

router.post(
  "/api/staff-profiles/departments",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    const nameAr = String(req.body?.nameAr ?? "").trim();
    if (nameAr.length < 2) return res.status(400).json({ message: "اسم الإدارة مطلوب" });
    const row = await addDepartment(nameAr, req.body?.nameEn);
    res.json({ department: row });
  },
);

router.post(
  "/api/staff-profiles/job-titles",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    const nameAr = String(req.body?.nameAr ?? "").trim();
    if (nameAr.length < 2) return res.status(400).json({ message: "المسمى مطلوب" });
    const row = await addJobTitle(nameAr, req.body?.nameEn);
    res.json({ jobTitle: row });
  },
);

export default router;
