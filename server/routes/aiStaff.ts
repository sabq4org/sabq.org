/**
 * فريق سبق الذكي — مسارات القسم.
 *
 * لوحة التحكم: /api/admin/ai-staff (الدليل والهيكل) و /:slug (بطاقة الهوية).
 * مقروءة لكل مستخدمي اللوحة المسجلين — عرض فقط؛ أي إيقاف/تعديل يمر من
 * AI Hub بصلاحياته وسجل تدقيقه، لا من هنا.
 *
 * العلني: /api/public/ai-team — شريحة «فريق سبق الذكي» في صفحة عقل سبق:
 * أسماء وأدوار ومجاميع منقّاة فقط (لا تكاليف ولا نماذج ولا أعطال).
 */
import { Router } from "express";
import { requireAuth } from "../rbac";
import { cacheControl, CACHE_DURATIONS } from "../cacheMiddleware";
import { getAiStaffProfile, getAiStaffTeam, getAiTeamPublic } from "../services/aiStaffService";

const router: Router = Router();

router.get("/api/admin/ai-staff", requireAuth, async (_req, res) => {
  try {
    res.json(await getAiStaffTeam());
  } catch (err) {
    console.error("[ai-staff] team failed:", err);
    res.status(500).json({ message: "تعذر تحميل فريق سبق الذكي" });
  }
});

router.get("/api/admin/ai-staff/:slug", requireAuth, async (req, res) => {
  try {
    const profile = await getAiStaffProfile(String(req.params.slug || ""));
    if (!profile) {
      res.status(404).json({ message: "لا يوجد موظف بهذا المعرف" });
      return;
    }
    res.json(profile);
  } catch (err) {
    console.error("[ai-staff] profile failed:", err);
    res.status(500).json({ message: "تعذر تحميل ملف الموظف" });
  }
});

router.get(
  "/api/public/ai-team",
  cacheControl({ maxAge: CACHE_DURATIONS.MEDIUM, staleWhileRevalidate: CACHE_DURATIONS.MEDIUM }),
  async (_req, res) => {
    try {
      res.json(await getAiTeamPublic());
    } catch (err) {
      console.error("[ai-staff] public failed:", err);
      // الواجهة تُسقط الشريحة بصمت عند الفشل — لا أرقام وهمية
      res.status(500).json({ message: "تعذر جلب بيانات الفريق" });
    }
  },
);

export default router;
