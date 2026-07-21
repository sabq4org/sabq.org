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
import {
  addDepartment,
  addJobTitle,
  getLookups,
  getStaffProfile,
  listStaff,
  revealNationalId,
  upsertStaffProfile,
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

const patchSchema = z.object({
  nationalId: z.string().trim().regex(/^\d{10}$/, "الهوية 10 أرقام").optional().or(z.literal("")),
  nationality: z.string().max(60).optional(),
  officialBirthDate: z.string().optional(),
  officialPhotoUrl: z.string().max(600).optional(),
  jobTitleId: z.string().optional(),
  departmentId: z.string().optional(),
  employmentType: z.enum(["employee", "collaborator", "field_reporter", "opinion_writer"]).optional(),
  joinedAt: z.string().optional(),
  managerUserId: z.string().optional(),
  workRegion: z.string().max(120).optional(),
  pressIdNumber: z.string().max(40).optional(),
  pressCardValidUntil: z.string().optional(),
  mediaLicenseNumber: z.string().max(60).optional(),
  mediaLicenseExpiresAt: z.string().optional(),
  officialPhone: z.string().max(30).optional(),
  officialEmail: z.string().max(160).optional(),
  emergencyContactName: z.string().max(120).optional(),
  emergencyContactRelation: z.string().max(60).optional(),
  emergencyContactPhone: z.string().max(30).optional(),
  bloodType: z.string().max(3).optional(),
  bioAr: z.string().max(2000).optional(),
  bioEn: z.string().max(2000).optional(),
  specializations: z.array(z.string().max(80)).max(20).optional(),
  socialX: z.string().max(200).optional(),
  socialLinkedin: z.string().max(200).optional(),
  personalWebsite: z.string().max(300).optional(),
  yearsOfExperience: z.number().int().min(0).max(60).optional(),
  previousEmployers: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
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
