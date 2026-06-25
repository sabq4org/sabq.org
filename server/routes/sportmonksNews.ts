/**
 * مسارات استيراد أخبار SportMonks التحريرية — لوحة التحكم فقط (لا شيء عام).
 *
 * الصلاحيات برموز المقالات القائمة (مبذورة في كل البيئات): العرض articles.view،
 * والاستيراد كمسودّات articles.create. نتجنّب فحص نص الدور عمدًا (حساب المالك
 * في الإنتاج role='reader' وصلاحياته من user_roles).
 *
 * وفق ADR-001: لا استيراد db هنا — كل المنطق في services/sportmonksNewsService.ts.
 */
import type { Express } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import {
  getSportmonksNewsStatus,
  listSportmonksNews,
  importSportmonksNews,
  type SmNewsKind,
} from "../services/sportmonksNewsService";

const canView = requirePermission(PERMISSION_CODES.ARTICLES_VIEW);
const canImport = requirePermission(PERMISSION_CODES.ARTICLES_CREATE);

const normKind = (v: unknown): SmNewsKind => (v === "postmatch" ? "postmatch" : "prematch");

const importSchema = z.object({
  kind: z.enum(["prematch", "postmatch"]).default("prematch"),
  ids: z.array(z.number().int().positive()).min(1).max(50),
  categoryId: z.string().min(1).optional(),
});

export function registerSportmonksNewsRoutes(app: Express) {
  // حالة الخدمة (مهيأة؟ متصلة؟ عدد المعاينات/التقارير المتاحة)
  app.get("/api/admin/sportmonks-news/status", requireAuth, canView, async (_req, res) => {
    try {
      res.json(await getSportmonksNewsStatus());
    } catch (error) {
      console.error("[SM News] status failed:", error);
      res.status(500).json({ message: "تعذر جلب حالة خدمة SportMonks" });
    }
  });

  // قائمة الأخبار المتاحة للاستيراد (معاينات أو تقارير)
  app.get("/api/admin/sportmonks-news/news", requireAuth, canView, async (req, res) => {
    const kind = normKind(req.query.kind);
    try {
      res.json({ kind, items: await listSportmonksNews(kind) });
    } catch (error) {
      console.error("[SM News] list failed:", error);
      res.status(502).json({ message: "تعذر جلب أخبار SportMonks — تحقّق من الاتصال" });
    }
  });

  // استيراد المواد المختارة كمسودّات عربية
  app.post("/api/admin/sportmonks-news/import", requireAuth, canImport, async (req: any, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات استيراد غير صالحة" });
    }
    try {
      const result = await importSportmonksNews({
        ...parsed.data,
        userId: req.user.id,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "SM_IMPORT_NO_ITEMS") {
        return res.status(400).json({ message: "اختر مواد للاستيراد" });
      }
      console.error("[SM News] import failed:", error);
      res.status(500).json({ message: "تعذر استيراد المواد" });
    }
  });
}
