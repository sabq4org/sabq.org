/**
 * مسارات رادار سبق الذكي — لوحة التحكم فقط (لا شيء هنا عام).
 *
 * الصلاحيات تعتمد رموز المقالات القائمة (مبذورة في كل البيئات — لا حاجة
 * لبذر رموز جديدة): العرض articles.view، التحويل/التصدير articles.create،
 * إدارة المصادر والقواعد والتشغيل اليدوي articles.publish.
 *
 * وفق ADR-001: لا استيراد db هنا — كل الاستعلامات في services/radar/repo.ts.
 */
import type { Express } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { insertRadarAlertRuleSchema, insertRadarSourceSchema } from "@shared/schema";
import {
  createRule,
  createSource,
  deleteRule,
  deleteSource,
  getItem,
  listItems,
  listRules,
  listSources,
  radarStats,
  updateItem,
  updateRule,
  updateSource,
} from "../services/radar/repo";
import { fetchSingleSource, runRadarCycle } from "../services/radar/cycle";
import { transformItem } from "../services/radar/transformer";
import { exportItemToArticle } from "../services/radar/exporter";
import { isTelegramConfigured } from "../services/radar/alerts";
import { detectWatchType, xProvidersConfigured } from "../services/radar/xProvider";

const canView = requirePermission(PERMISSION_CODES.ARTICLES_VIEW);
const canWork = requirePermission(PERMISSION_CODES.ARTICLES_CREATE);
const canManage = requirePermission(PERMISSION_CODES.ARTICLES_PUBLISH);

const RADAR_STATUSES = ["new", "analyzed", "ready", "exported", "dismissed"] as const;

const itemsQuerySchema = z.object({
  // قائمة حالات مفصولة بفواصل — التبويبات تجمع أكثر من حالة (مثل new,analyzed)
  status: z
    .string()
    .transform((value) => value.split(",").map((s) => s.trim()))
    .pipe(z.array(z.enum(RADAR_STATUSES)).min(1))
    .optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  sourceId: z.string().optional(),
  breaking: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export function registerRadarRoutes(app: Express) {
  // ---------- نظرة عامة ----------

  app.get("/api/radar/stats", requireAuth, canView, async (_req, res) => {
    try {
      const stats = await radarStats();
      res.json({ ...stats, telegramConfigured: isTelegramConfigured() });
    } catch (error) {
      console.error("[Radar API] stats failed:", error);
      res.status(500).json({ message: "تعذر جلب إحصاءات الرادار" });
    }
  });

  // ---------- المواد المرصودة ----------

  app.get("/api/radar/items", requireAuth, canView, async (req, res) => {
    const parsed = itemsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "معاملات استعلام غير صالحة" });
    }
    try {
      const { breaking, status, ...rest } = parsed.data;
      const result = await listItems({ ...rest, statuses: status, breakingOnly: breaking });
      res.json(result);
    } catch (error) {
      console.error("[Radar API] items failed:", error);
      res.status(500).json({ message: "تعذر جلب مواد الرادار" });
    }
  });

  app.post("/api/radar/items/:id/transform", requireAuth, canWork, async (req, res) => {
    try {
      const item = await getItem(String(req.params.id));
      if (!item) return res.status(404).json({ message: "المادة غير موجودة" });
      if (item.status === "exported") {
        return res.status(409).json({ message: "المادة صُدّرت مسبقًا" });
      }
      const updated = await transformItem(item);
      res.json({ item: updated });
    } catch (error) {
      console.error("[Radar API] transform failed:", error);
      res.status(502).json({ message: "تعذر التحويل التحريري — حاول مجددًا" });
    }
  });

  app.post("/api/radar/items/:id/export", requireAuth, canWork, async (req: any, res) => {
    try {
      const overrideCategoryId = req.body?.categoryId ? String(req.body.categoryId) : undefined;
      const { articleId } = await exportItemToArticle(
        String(req.params.id),
        req.user.id,
        overrideCategoryId
      );
      res.json({ articleId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "RADAR_ITEM_NOT_FOUND") {
        return res.status(404).json({ message: "المادة غير موجودة" });
      }
      if (message === "RADAR_DRAFT_MISSING") {
        return res.status(409).json({ message: "حوّل المادة تحريريًا أولًا ثم صدّرها" });
      }
      console.error("[Radar API] export failed:", error);
      res.status(500).json({ message: "تعذر تصدير المادة" });
    }
  });

  app.post("/api/radar/items/:id/dismiss", requireAuth, canWork, async (req, res) => {
    try {
      const item = await getItem(String(req.params.id));
      if (!item) return res.status(404).json({ message: "المادة غير موجودة" });
      if (item.status === "exported") {
        return res.status(409).json({ message: "لا يمكن استبعاد مادة مُصدَّرة" });
      }
      const updated = await updateItem(item.id, { status: "dismissed" });
      res.json({ item: updated });
    } catch (error) {
      console.error("[Radar API] dismiss failed:", error);
      res.status(500).json({ message: "تعذر استبعاد المادة" });
    }
  });

  app.post("/api/radar/items/:id/restore", requireAuth, canWork, async (req, res) => {
    try {
      const item = await getItem(String(req.params.id));
      if (!item) return res.status(404).json({ message: "المادة غير موجودة" });
      if (item.status !== "dismissed") {
        return res.status(409).json({ message: "المادة ليست مستبعدة" });
      }
      const updated = await updateItem(item.id, {
        status: item.draft ? "ready" : item.analyzedAt ? "analyzed" : "new",
      });
      res.json({ item: updated });
    } catch (error) {
      console.error("[Radar API] restore failed:", error);
      res.status(500).json({ message: "تعذر استعادة المادة" });
    }
  });

  // ---------- المصادر ----------

  app.get("/api/radar/sources", requireAuth, canView, async (_req, res) => {
    try {
      res.json({ sources: await listSources() });
    } catch (error) {
      console.error("[Radar API] sources failed:", error);
      res.status(500).json({ message: "تعذر جلب المصادر" });
    }
  });

  app.post("/api/radar/sources", requireAuth, canManage, async (req, res) => {
    const parsed = insertRadarSourceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات المصدر غير صالحة", issues: parsed.error.issues });
    }
    try {
      res.status(201).json({ source: await createSource(parsed.data) });
    } catch (error) {
      console.error("[Radar API] create source failed:", error);
      res.status(500).json({ message: "تعذر إضافة المصدر (الرابط مكرر؟)" });
    }
  });

  app.patch("/api/radar/sources/:id", requireAuth, canManage, async (req, res) => {
    const parsed = insertRadarSourceSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات المصدر غير صالحة", issues: parsed.error.issues });
    }
    try {
      const source = await updateSource(String(req.params.id), parsed.data);
      if (!source) return res.status(404).json({ message: "المصدر غير موجود" });
      res.json({ source });
    } catch (error) {
      console.error("[Radar API] update source failed:", error);
      res.status(500).json({ message: "تعذر تعديل المصدر" });
    }
  });

  app.delete("/api/radar/sources/:id", requireAuth, canManage, async (req, res) => {
    try {
      await deleteSource(String(req.params.id));
      res.json({ ok: true });
    } catch (error) {
      console.error("[Radar API] delete source failed:", error);
      res.status(500).json({ message: "تعذر حذف المصدر" });
    }
  });

  app.post("/api/radar/sources/:id/fetch", requireAuth, canManage, async (req, res) => {
    try {
      const inserted = await fetchSingleSource(String(req.params.id));
      res.json({ inserted });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "RADAR_SOURCE_NOT_FOUND") {
        return res.status(404).json({ message: "المصدر غير موجود" });
      }
      console.error("[Radar API] manual fetch failed:", error);
      res.status(502).json({ message: "فشل جلب المصدر — تحقق من الرابط" });
    }
  });

  // ---------- رصدات إكس ----------
  // الرصدة مصدر من نوع "x" — التعديل/الحذف/الجلب اليدوي عبر مسارات المصادر نفسها

  const watchBodySchema = z.object({
    value: z.string().trim().min(1).max(200),
    type: z.enum(["keyword", "hashtag", "account", "query", "trend"]).optional(),
    label: z.string().trim().min(1).max(120).optional(),
    provider: z.enum(["auto", "official", "twitterapiio"]).optional(),
    language: z.string().trim().min(2).max(10).optional(),
    categorySlug: z.string().trim().max(80).optional(),
    fetchIntervalMinutes: z.coerce.number().int().min(2).max(1440).optional(),
  });

  app.get("/api/radar/watches", requireAuth, canView, async (_req, res) => {
    try {
      const sources = await listSources();
      res.json({
        watches: sources.filter((source) => source.type === "x"),
        providers: xProvidersConfigured(),
      });
    } catch (error) {
      console.error("[Radar API] watches failed:", error);
      res.status(500).json({ message: "تعذر جلب الرصدات" });
    }
  });

  app.post("/api/radar/watches", requireAuth, canManage, async (req, res) => {
    const parsed = watchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات الرصدة غير صالحة", issues: parsed.error.issues });
    }
    const { value, label, provider, language, categorySlug, fetchIntervalMinutes } = parsed.data;
    const xType = parsed.data.type ?? detectWatchType(value);
    try {
      const watch = await createSource({
        name: label ?? value,
        // رابط اصطناعي فريد — إضافة نفس الرصدة مرتين تصطدم بقيد url
        url: `x:${xType}:${value.toLowerCase()}`,
        type: "x",
        language: language ?? "ar",
        categorySlug: categorySlug ?? null,
        fetchIntervalMinutes: fetchIntervalMinutes ?? (xType === "trend" ? 15 : 5),
        isActive: true,
        xType,
        xValue: value,
        xProvider: provider ?? "auto",
      });
      // جلبة أولى فورية — المحرر يرى النتيجة الآن لا بعد دورة الكرون؛
      // فشلها (مفتاح ناقص/استعلام خاطئ) لا يلغي الرصدة ويظهر في lastError
      let inserted: number | null = null;
      let fetchError: string | null = null;
      try {
        inserted = await fetchSingleSource(watch.id);
      } catch (error) {
        fetchError = error instanceof Error ? error.message : String(error);
      }
      res.status(201).json({ watch, inserted, fetchError });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/duplicate|unique/i.test(message)) {
        return res.status(409).json({ message: "هذه الرصدة موجودة مسبقًا" });
      }
      console.error("[Radar API] create watch failed:", error);
      res.status(500).json({ message: "تعذر إضافة الرصدة" });
    }
  });

  // ---------- قواعد التنبيه ----------

  app.get("/api/radar/alert-rules", requireAuth, canView, async (_req, res) => {
    try {
      res.json({ rules: await listRules() });
    } catch (error) {
      console.error("[Radar API] rules failed:", error);
      res.status(500).json({ message: "تعذر جلب قواعد التنبيه" });
    }
  });

  app.post("/api/radar/alert-rules", requireAuth, canManage, async (req, res) => {
    const parsed = insertRadarAlertRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات القاعدة غير صالحة", issues: parsed.error.issues });
    }
    try {
      res.status(201).json({ rule: await createRule(parsed.data) });
    } catch (error) {
      console.error("[Radar API] create rule failed:", error);
      res.status(500).json({ message: "تعذر إضافة القاعدة" });
    }
  });

  app.patch("/api/radar/alert-rules/:id", requireAuth, canManage, async (req, res) => {
    const parsed = insertRadarAlertRuleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات القاعدة غير صالحة", issues: parsed.error.issues });
    }
    try {
      const rule = await updateRule(String(req.params.id), parsed.data);
      if (!rule) return res.status(404).json({ message: "القاعدة غير موجودة" });
      res.json({ rule });
    } catch (error) {
      console.error("[Radar API] update rule failed:", error);
      res.status(500).json({ message: "تعذر تعديل القاعدة" });
    }
  });

  app.delete("/api/radar/alert-rules/:id", requireAuth, canManage, async (req, res) => {
    try {
      await deleteRule(String(req.params.id));
      res.json({ ok: true });
    } catch (error) {
      console.error("[Radar API] delete rule failed:", error);
      res.status(500).json({ message: "تعذر حذف القاعدة" });
    }
  });

  // ---------- تشغيل يدوي لدورة كاملة (تشخيص/تجربة) ----------

  app.post("/api/radar/run", requireAuth, canManage, async (_req, res) => {
    try {
      res.json({ summary: await runRadarCycle() });
    } catch (error) {
      console.error("[Radar API] manual run failed:", error);
      res.status(500).json({ message: "فشل تشغيل دورة الرادار" });
    }
  });
}
