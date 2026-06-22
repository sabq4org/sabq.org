/**
 * مسارات خدمة أخبار واس (SPA News) — لوحة التحكم فقط (لا شيء هنا عام).
 *
 * الصلاحيات تعتمد رموز المقالات القائمة (مبذورة في كل البيئات): العرض
 * articles.view، والاستيراد كمسودّات articles.create. نتجنّب فحص نص الدور
 * عمدًا — حساب المالك في الإنتاج role='reader' وصلاحياته من user_roles.
 *
 * وفق ADR-001: لا استيراد db هنا — كل المنطق في services/spaNewsService.ts.
 */
import type { Express } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import {
  getSpaNews,
  getSpaSections,
  getSpaStatus,
  importSpaArticles,
  type SpaLang,
} from "../services/spaNewsService";

const canView = requirePermission(PERMISSION_CODES.ARTICLES_VIEW);
const canImport = requirePermission(PERMISSION_CODES.ARTICLES_CREATE);

// آمن ضد أي إدخال (لا يرمي) — الافتراضي عربي.
const normLang = (v: unknown): SpaLang => (v === "en" ? "en" : "ar");

const importSchema = z.object({
  lang: z.enum(["ar", "en"]).default("ar"),
  sourceSlug: z.string().min(1),
  categoryId: z.string().min(1),
  articleIds: z.array(z.string().min(1)).min(1).max(50),
});

export function registerSpaNewsRoutes(app: Express) {
  // حالة الخدمة (مهيأة؟ متصلة؟ عدد الأقسام)
  app.get("/api/admin/spa-news/status", requireAuth, canView, async (_req, res) => {
    try {
      res.json(await getSpaStatus());
    } catch (error) {
      console.error("[SPA News] status failed:", error);
      res.status(500).json({ message: "تعذر جلب حالة خدمة واس" });
    }
  });

  // الأقسام + الخلاصات لمُحدِّد الواجهة
  app.get("/api/admin/spa-news/sections", requireAuth, canView, async (req, res) => {
    const lang = normLang(req.query.lang);
    try {
      res.json({ lang, sections: await getSpaSections(lang) });
    } catch (error) {
      console.error("[SPA News] sections failed:", error);
      res.status(502).json({ message: "تعذر جلب أقسام واس — تحقّق من الاتصال" });
    }
  });

  // مواد قسم/خلاصة
  app.get("/api/admin/spa-news/news", requireAuth, canView, async (req, res) => {
    const lang = normLang(req.query.lang);
    const slug = String(req.query.slug || "").trim();
    if (!slug) return res.status(400).json({ message: "slug مطلوب" });
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.per_page) || 30;
    try {
      res.json(await getSpaNews(lang, slug, page, perPage));
    } catch (error) {
      console.error("[SPA News] news failed:", error);
      res.status(502).json({ message: "تعذر جلب مواد واس — تحقّق من الاتصال" });
    }
  });

  // استيراد المواد المختارة كمسودّات
  app.post("/api/admin/spa-news/import", requireAuth, canImport, async (req: any, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات استيراد غير صالحة" });
    }
    try {
      const result = await importSpaArticles({
        ...parsed.data,
        userId: req.user.id,
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "SPA_IMPORT_NO_CATEGORY") {
        return res.status(400).json({ message: "اختر القسم الوجهة قبل الاستيراد" });
      }
      if (message === "SPA_IMPORT_NO_ITEMS" || message === "SPA_IMPORT_NO_SOURCE") {
        return res.status(400).json({ message: "اختر مواد للاستيراد" });
      }
      console.error("[SPA News] import failed:", error);
      res.status(500).json({ message: "تعذر استيراد المواد" });
    }
  });
}
