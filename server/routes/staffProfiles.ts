// ----------------------------------------------------------------------------
// ملف المنسوب الموحّد — مسارات لوحة التحكم /api/staff-profiles/*
//
// البوابة: صلاحيات staff_profiles.view / staff_profiles.manage /
// staff_documents.view — يملكها admin (superuser shortcut في
// getUserPermissions) ودور «الموارد البشرية» المستحدث. لا استيراد db
// هنا (ADR-001) — كل البيانات عبر staffProfileService.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { getUserPermissions } from "../rbac";
import { upload } from "../utils/uploadMiddleware";
import { ObjectStorageService, isPrivateObjectStorageConfigured } from "../objectStorage";
import {
  addDepartment,
  addJobTitle,
  getLookups,
  getStaffDocumentKey,
  getStaffProfile,
  listStaff,
  revealNationalId,
  setStaffDocumentKey,
  upsertStaffProfile,
  STAFF_DOC_KINDS,
  type StaffDocKind,
  type StaffProfilePatch,
} from "../services/staffProfileService";

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

router.use("/api/staff-profiles", isAuthenticated);

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
});

router.put(
  "/api/staff-profiles/:userId",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    try {
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" });
      }
      const result = await upsertStaffProfile(
        req.params.userId,
        parsed.data as StaffProfilePatch,
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

// ── وثائق المنسوب: رفع للتخزين الخاص + تنزيل برابط موقّع قصير العمر ──

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
      if (!isPrivateObjectStorageConfigured()) {
        return res.status(503).json({ message: "التخزين الخاص غير مهيأ" });
      }
      const ext = (req.file.originalname.split(".").pop() || "bin").toLowerCase().slice(0, 6);
      const key = `staff-docs/${req.params.userId}-${kind}-${Date.now()}.${ext}`;
      const stored = await new ObjectStorageService().uploadFile(key, req.file.buffer, req.file.mimetype, "private");
      await setStaffDocumentKey(req.params.userId, kind, stored.path, (req.user as { id: string }).id);
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
