/**
 * مسارات لوحة الأسماء الرياضية الموحّدة — الاعتماد التحريري فوق الترجمة الآلية.
 *
 * الصلاحيات برموز المقالات القائمة (مبذورة في كل البيئات، نفس منطق
 * sportmonksNews): العرض articles.view، والتحرير/الاعتماد articles.create.
 * نتجنّب فحص نص الدور عمدًا (حساب المالك بالإنتاج role='reader').
 *
 * وفق ADR-001: لا استيراد db هنا — كل الاستعلامات في services/sportsNamesService.ts.
 */
import type { Express } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import {
  deleteSportsName,
  listSportsNames,
  processPendingSportsNames,
  sportsNamesStats,
  updateSportsName,
} from "../services/sportsNamesService";

const canView = requirePermission(PERMISSION_CODES.ARTICLES_VIEW);
const canEdit = requirePermission(PERMISSION_CODES.ARTICLES_CREATE);

const patchSchema = z.object({
  arabic: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["auto", "verified", "pending"]).optional(),
}).refine((v) => v.arabic != null || v.status != null, { message: "لا تغيير" });

export function registerSportsNamesRoutes(app: Express) {
  // قائمة الترجمات مع الفلاتر — الأكثر ظهورًا أولًا (طابور المراجعة)
  app.get("/api/admin/sports-names", requireAuth, canView, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const pageSize = Math.min(100, Math.max(10, parseInt(String(req.query.pageSize ?? "50"), 10) || 50));
      const result = await listSportsNames({
        type: typeof req.query.type === "string" ? req.query.type : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        q: typeof req.query.q === "string" ? req.query.q : undefined,
        page,
        pageSize,
      });
      res.json({ ...result, page, pageSize });
    } catch (error) {
      console.error("[SportsNames] list failed:", error);
      res.status(500).json({ message: "تعذر جلب الترجمات" });
    }
  });

  // إحصاءات التغطية (عدّ لكل نوع/حالة)
  app.get("/api/admin/sports-names/stats", requireAuth, canView, async (_req, res) => {
    try {
      res.json({ stats: await sportsNamesStats() });
    } catch (error) {
      console.error("[SportsNames] stats failed:", error);
      res.status(500).json({ message: "تعذر جلب الإحصاءات" });
    }
  });

  // تعديل/اعتماد ترجمة — تعديل النص = اعتماد ضمني (origin=manual, status=verified)
  app.patch("/api/admin/sports-names/:id", requireAuth, canEdit, async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف غير صالح" });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "بيانات غير صالحة" });
    try {
      const row = await updateSportsName(id, parsed.data);
      if (!row) return res.status(404).json({ message: "الصف غير موجود" });
      res.json(row);
    } catch (error) {
      console.error("[SportsNames] update failed:", error);
      res.status(500).json({ message: "تعذر حفظ التعديل" });
    }
  });

  // حذف صف خاطئ — يُعاد حلّه تلقائيًا عند أول ظهور تالٍ
  app.delete("/api/admin/sports-names/:id", requireAuth, canEdit, async (req, res) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "معرّف غير صالح" });
    try {
      const row = await deleteSportsName(id);
      if (!row) return res.status(404).json({ message: "الصف غير موجود" });
      res.json({ ok: true });
    } catch (error) {
      console.error("[SportsNames] delete failed:", error);
      res.status(500).json({ message: "تعذر الحذف" });
    }
  });

  // معالجة فورية للمعلّق (زر «ترجم المعلّق الآن» في اللوحة)
  app.post("/api/admin/sports-names/process-pending", requireAuth, canEdit, async (_req, res) => {
    try {
      res.json(await processPendingSportsNames(300));
    } catch (error) {
      console.error("[SportsNames] process-pending failed:", error);
      res.status(500).json({ message: "تعذرت معالجة المعلّق" });
    }
  });
}
