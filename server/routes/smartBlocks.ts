/**
 * Smart Blocks / Homepage Stage API
 *
 * يستبدل معالجات /api/smart-blocks القديمة في routes.ts (يُسجَّل عبر
 * registerSplitRoutes قبل المعالجات القديمة فيتمّت الأولوية هنا).
 * ملتزم بـ ADR-001: لا استيراد db.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import {
  insertSmartBlockSchema,
  insertEnSmartBlockSchema,
  insertUrSmartBlockSchema,
  smartBlockSourceTypes,
} from "@shared/schema";
import {
  activatePlaybook,
  createSmartBlockRecord,
  deleteSmartBlockRecord,
  getHomepageSmartBlocksBundle,
  getSmartBlockById,
  getStageSummary,
  listPlaybooks,
  listSmartBlocks,
  queryArticlesPreview,
  reorderSmartBlocks,
  resolveSavedBlockArticlesCached,
  suggestDirectorScenes,
  updateSmartBlockRecord,
  type SmartBlockLocale,
} from "../services/smartBlocksService";

const router = Router();

function localeFromPath(path: string): SmartBlockLocale {
  if (path.includes("/en/")) return "en";
  if (path.includes("/ur/")) return "ur";
  return "ar";
}

function insertSchemaFor(locale: SmartBlockLocale) {
  if (locale === "en") return insertEnSmartBlockSchema;
  if (locale === "ur") return insertUrSmartBlockSchema;
  return insertSmartBlockSchema;
}

const reorderSchema = z.object({
  placement: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1),
});

const previewSchema = z.object({
  keyword: z.string().optional().default(""),
  keywords: z.array(z.string()).optional(),
  sourceType: z.enum(smartBlockSourceTypes).optional(),
  limit: z.coerce.number().min(1).max(24).optional(),
  limitCount: z.coerce.number().min(1).max(24).optional(),
  categories: z.union([z.string(), z.array(z.string())]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  lookbackHours: z.coerce.number().optional(),
  pinnedArticleIds: z.array(z.string()).optional(),
  minArticles: z.coerce.number().optional(),
  filters: z
    .object({
      categories: z.array(z.string()).optional(),
      dateRange: z
        .object({ from: z.string(), to: z.string() })
        .optional(),
    })
    .optional(),
});

function mountLocale(base: string) {
  // GET homepage bundle — طلب واحد + SWR (بديل N+1 على الصفحة الرئيسية)
  router.get(`${base}/homepage`, async (req, res) => {
    try {
      const locale = localeFromPath(base);
      const bundle = await getHomepageSmartBlocksBundle(locale);
      res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
      res.json(bundle);
    } catch (error) {
      console.error("[SmartBlocks] homepage bundle failed:", error);
      res.status(500).json({ message: "فشل في جلب حزمة البلوكات" });
    }
  });

  // GET list
  router.get(base, async (req: any, res) => {
    try {
      const locale = localeFromPath(base);
      const filters: any = {};
      if (req.query.isActive !== undefined) {
        filters.isActive = req.query.isActive === "true";
      }
      if (req.query.placement) filters.placement = String(req.query.placement);
      if (req.query.playbook) filters.playbook = String(req.query.playbook);
      if (req.query.respectSchedule === "true" || req.query.isActive === "true") {
        filters.respectSchedule = true;
      }
      const blocks = await listSmartBlocks(locale, filters);
      // قائمة الأدمن لا تُكاش؛ الصفحة العامة تستخدم /homepage
      if (req.query.isActive === "true") {
        res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60");
      } else {
        res.setHeader("Cache-Control", "private, no-store");
      }
      res.json(blocks);
    } catch (error) {
      console.error("[SmartBlocks] list failed:", error);
      res.status(500).json({ message: "فشل في جلب البلوكات الذكية" });
    }
  });

  // GET stage summary
  router.get(`${base}/stage/summary`, requireAuth, requirePermission("system.manage_settings"), async (req, res) => {
    try {
      const locale = localeFromPath(base);
      res.json(await getStageSummary(locale));
    } catch (error) {
      console.error("[SmartBlocks] summary failed:", error);
      res.status(500).json({ message: "فشل في جلب ملخص المسرح" });
    }
  });

  // GET director suggestions
  router.get(`${base}/director/suggest`, requireAuth, requirePermission("system.manage_settings"), async (req, res) => {
    try {
      const locale = localeFromPath(base);
      res.json({ suggestions: await suggestDirectorScenes(locale) });
    } catch (error) {
      console.error("[SmartBlocks] director failed:", error);
      res.status(500).json({ message: "فشل في اقتراح المشاهد" });
    }
  });

  // GET playbooks
  router.get(`${base}/playbooks`, requireAuth, requirePermission("system.manage_settings"), async (req, res) => {
    try {
      const locale = localeFromPath(base);
      res.json({ playbooks: await listPlaybooks(locale) });
    } catch (error) {
      console.error("[SmartBlocks] playbooks failed:", error);
      res.status(500).json({ message: "فشل في جلب السيناريوهات" });
    }
  });

  // POST activate playbook
  router.post(
    `${base}/playbooks/:key/activate`,
    requireAuth,
    requirePermission("system.manage_settings"),
    async (req, res) => {
      try {
        const locale = localeFromPath(base);
        const result = await activatePlaybook(locale, req.params.key);
        res.json({ success: true, ...result });
      } catch (error) {
        console.error("[SmartBlocks] activate playbook failed:", error);
        res.status(500).json({ message: "فشل تفعيل السيناريو" });
      }
    },
  );

  // POST reorder
  router.post(
    `${base}/reorder`,
    requireAuth,
    requirePermission("system.manage_settings"),
    async (req, res) => {
      try {
        const locale = localeFromPath(base);
        const parsed = reorderSchema.parse(req.body);
        await reorderSmartBlocks(locale, parsed.placement, parsed.orderedIds);
        res.json({ success: true });
      } catch (error: any) {
        if (error?.name === "ZodError") {
          return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
        }
        console.error("[SmartBlocks] reorder failed:", error);
        res.status(500).json({ message: "فشل إعادة الترتيب" });
      }
    },
  );

  // GET query/articles (preview + public resolve by params)
  router.get(`${base}/query/articles`, async (req: any, res) => {
    try {
      const locale = localeFromPath(base);
      const parsed = previewSchema.parse(req.query);
      const categories = parsed.categories
        ? Array.isArray(parsed.categories)
          ? parsed.categories
          : [parsed.categories]
        : parsed.filters?.categories;

      const result = await queryArticlesPreview(locale, {
        keyword: parsed.keyword,
        keywords: parsed.keywords,
        sourceType: parsed.sourceType,
        limitCount: parsed.limitCount ?? parsed.limit ?? 6,
        lookbackHours: parsed.lookbackHours,
        pinnedArticleIds: parsed.pinnedArticleIds,
        minArticles: parsed.minArticles,
        filters: {
          categories,
          dateRange:
            parsed.dateFrom && parsed.dateTo
              ? { from: parsed.dateFrom, to: parsed.dateTo }
              : parsed.filters?.dateRange,
        },
      });
      res.json(result);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      console.error("[SmartBlocks] query articles failed:", error);
      res.status(500).json({ message: "فشل في البحث عن المقالات" });
    }
  });

  // POST preview (body — أدق للفلاتر والمثبتات)
  router.post(
    `${base}/preview`,
    requireAuth,
    requirePermission("system.manage_settings"),
    async (req, res) => {
      try {
        const locale = localeFromPath(base);
        const parsed = previewSchema.parse(req.body);
        const result = await queryArticlesPreview(locale, {
          keyword: parsed.keyword,
          keywords: parsed.keywords,
          sourceType: parsed.sourceType,
          limitCount: parsed.limitCount ?? parsed.limit ?? 6,
          lookbackHours: parsed.lookbackHours,
          pinnedArticleIds: parsed.pinnedArticleIds,
          minArticles: parsed.minArticles,
          filters: parsed.filters || {
            categories: parsed.categories
              ? Array.isArray(parsed.categories)
                ? parsed.categories
                : [parsed.categories]
              : undefined,
            dateRange:
              parsed.dateFrom && parsed.dateTo
                ? { from: parsed.dateFrom, to: parsed.dateTo }
                : undefined,
          },
        });
        res.json(result);
      } catch (error: any) {
        if (error?.name === "ZodError") {
          return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
        }
        console.error("[SmartBlocks] preview failed:", error);
        res.status(500).json({ message: "فشل المعاينة" });
      }
    },
  );

  // POST create
  router.post(base, requireAuth, requirePermission("system.manage_settings"), async (req: any, res) => {
    try {
      const locale = localeFromPath(base);
      const schema = insertSchemaFor(locale);
      const validated = schema.parse({
        ...req.body,
        createdBy: req.user?.id,
      });
      const block = await createSmartBlockRecord(locale, validated as any);
      res.status(201).json(block);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      console.error("[SmartBlocks] create failed:", error);
      res.status(500).json({ message: "فشل في إنشاء البلوك الذكي" });
    }
  });

  // GET by id
  router.get(`${base}/:id`, async (req, res) => {
    try {
      const locale = localeFromPath(base);
      const block = await getSmartBlockById(locale, req.params.id);
      if (!block) return res.status(404).json({ message: "البلوك الذكي غير موجود" });
      res.json(block);
    } catch (error) {
      console.error("[SmartBlocks] get failed:", error);
      res.status(500).json({ message: "فشل في جلب البلوك الذكي" });
    }
  });

  // GET articles for a saved block (SWR-cached unless preview=true)
  router.get(`${base}/:id/articles`, async (req, res) => {
    try {
      const locale = localeFromPath(base);
      const preview = req.query.preview === "true";
      const result = await resolveSavedBlockArticlesCached(locale, req.params.id, {
        limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
        preview,
      });
      if (result.hiddenReason === "missing") {
        return res.status(404).json({ message: "البلوك الذكي غير موجود" });
      }
      if (!preview) {
        res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
      } else {
        res.setHeader("Cache-Control", "private, no-store");
      }
      res.json(result);
    } catch (error) {
      console.error("[SmartBlocks] block articles failed:", error);
      res.status(500).json({ message: "فشل في جلب مقالات البلوك" });
    }
  });

  // PUT update
  router.put(`${base}/:id`, requireAuth, requirePermission("system.manage_settings"), async (req, res) => {
    try {
      const locale = localeFromPath(base);
      const existing = await getSmartBlockById(locale, req.params.id);
      if (!existing) return res.status(404).json({ message: "البلوك الذكي غير موجود" });
      const updated = await updateSmartBlockRecord(locale, req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      console.error("[SmartBlocks] update failed:", error);
      res.status(500).json({ message: "فشل في تحديث البلوك الذكي" });
    }
  });

  // DELETE
  router.delete(`${base}/:id`, requireAuth, requirePermission("system.manage_settings"), async (req, res) => {
    try {
      const locale = localeFromPath(base);
      const existing = await getSmartBlockById(locale, req.params.id);
      if (!existing) return res.status(404).json({ message: "البلوك الذكي غير موجود" });
      await deleteSmartBlockRecord(locale, req.params.id);
      res.json({ success: true, message: "تم حذف البلوك الذكي بنجاح" });
    } catch (error) {
      console.error("[SmartBlocks] delete failed:", error);
      res.status(500).json({ message: "فشل في حذف البلوك الذكي" });
    }
  });
}

mountLocale("/api/smart-blocks");
mountLocale("/api/en/smart-blocks");
mountLocale("/api/ur/smart-blocks");

export const smartBlocksRouter = router;
export default router;
