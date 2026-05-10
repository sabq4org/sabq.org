import type { Express } from "express";
import { storage } from "../storage";
import { insertMirqabEntrySchema } from "@shared/schema";
import { requireAuth, requirePermission } from "../rbac";

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

export function registerMirqabRoutes(app: Express) {
  // GENERAL MIRQAB ENTRY ROUTES

  // GET /api/mirqab/entries - List Mirqab entries (with filters)
  app.get("/api/mirqab/entries", async (req, res) => {
    try {
      const { type, status, limit, offset } = req.query;
      const entries = await storage.getMirqabEntries({
        type: type as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
      });
      res.json(entries);
    } catch (error) {
      console.error("Error fetching Mirqab entries:", error);
      res.status(500).json({ message: "فشل في جلب مدخلات المرقاب" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/mirqab/entries/:id - Get single Mirqab entry by ID
  app.get("/api/mirqab/entries/:id", async (req, res) => {
    try {
      const entry = await storage.getMirqabEntryById(req.params.id);
      if (!entry) {
        return res.status(404).json({ message: "المدخل غير موجود" });
      }
      res.json(entry);
    } catch (error) {
      console.error("Error fetching Mirqab entry:", error);
      res.status(500).json({ message: "فشل في جلب المدخل" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/mirqab/entries/:id - Delete Mirqab entry
  app.delete("/api/mirqab/entries/:id", requireAuth, requirePermission('mirqab.delete'), async (req: any, res) => {
    try {
      await storage.deleteMirqabEntry(req.params.id);
      
      await logActivity({
        userId: req.user?.id,
        action: 'delete_mirqab_entry',
        entityType: 'mirqab_entry',
        entityId: req.params.id
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting Mirqab entry:", error);
      res.status(500).json({ message: "فشل في حذف المدخل" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/mirqab/entries/slug/:slug - Get single Mirqab entry by slug
  app.get("/api/mirqab/entries/slug/:slug", async (req, res) => {
    try {
      const entry = await storage.getMirqabEntryBySlug(req.params.slug);
      if (!entry) {
        return res.status(404).json({ message: "المدخل غير موجود" });
      }
      res.json(entry);
    } catch (error) {
      console.error("Error fetching Mirqab entry by slug:", error);
      res.status(500).json({ message: "فشل في جلب المدخل" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // SABQ INDEX ROUTES - مؤشر سبق

  // GET /api/mirqab/sabq-index - List SABQ Indexes
  app.get("/api/mirqab/sabq-index", async (req, res) => {
    try {
      const { limit } = req.query;
      const indexes = await storage.getLatestSabqIndexes(
        limit ? parseInt(limit as string) : 10
      );
      res.json(indexes);
    } catch (error) {
      console.error("Error fetching SABQ indexes:", error);
      res.status(500).json({ message: "فشل في جلب مؤشرات سبق" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/mirqab/sabq-index/:id - Get single SABQ Index
  app.get("/api/mirqab/sabq-index/:id", async (req, res) => {
    try {
      const entry = await storage.getMirqabEntryById(req.params.id);
      if (!entry || entry.entryType !== 'sabq_index') {
        return res.status(404).json({ message: "المؤشر غير موجود" });
      }
      
      const indexData = await storage.getSabqIndexByEntryId(entry.id);
      res.json({ ...entry, indexData });
    } catch (error) {
      console.error("Error fetching SABQ index:", error);
      res.status(500).json({ message: "فشل في جلب المؤشر" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/mirqab/sabq-index - Create SABQ Index
  app.post("/api/mirqab/sabq-index", requireAuth, requirePermission('mirqab.create'), async (req: any, res) => {
    try {
      const entryData = insertMirqabEntrySchema.parse({
        ...req.body.entry,
        entryType: 'sabq_index',
        slug: generateSlug(req.body.entry.title),
        authorId: req.user?.id,
      });
      
      const entry = await storage.createMirqabEntry(entryData);
      
      const indexData = insertMirqabSabqIndexSchema.parse({
        ...req.body.indexData,
        entryId: entry.id,
      });
      
      const sabqIndex = await storage.createSabqIndex(indexData);
      
      await logActivity({
        userId: req.user?.id,
        action: 'create_sabq_index',
        entityType: 'mirqab_entry',
        entityId: entry.id,
        newValue: { title: entry.title }
      });
      
      res.status(201).json({ entry, indexData: sabqIndex });
    } catch (error) {
      console.error("Error creating SABQ index:", error);
      res.status(500).json({ message: "فشل في إنشاء المؤشر" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PUT /api/mirqab/sabq-index/:id - Update SABQ Index
  app.put("/api/mirqab/sabq-index/:id", requireAuth, requirePermission('mirqab.edit'), async (req: any, res) => {
    try {
      const entry = await storage.getMirqabEntryById(req.params.id);
      if (!entry || entry.entryType !== 'sabq_index') {
        return res.status(404).json({ message: "المؤشر غير موجود" });
      }
      
      if (req.body.entry) {
        const entryUpdates = updateMirqabEntrySchema.parse({
          ...req.body.entry,
          editorId: req.user?.id,
        });
        await storage.updateMirqabEntry(req.params.id, entryUpdates);
      }
      
      if (req.body.indexData) {
        const indexData = await storage.getSabqIndexByEntryId(req.params.id);
        if (indexData) {
          const indexUpdates = updateMirqabSabqIndexSchema.parse(req.body.indexData);
          await storage.updateSabqIndex(indexData.id, indexUpdates);
        }
      }
      
      await logActivity({
        userId: req.user?.id,
        action: 'update_sabq_index',
        entityType: 'mirqab_entry',
        entityId: req.params.id,
        newValue: { title: entry.title }
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating SABQ index:", error);
      res.status(500).json({ message: "فشل في تحديث المؤشر" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/mirqab/sabq-index/:id - Delete SABQ Index
  app.delete("/api/mirqab/sabq-index/:id", requireAuth, requirePermission('mirqab.delete'), async (req: any, res) => {
    try {
      await storage.deleteMirqabEntry(req.params.id);
      
      await logActivity({
        userId: req.user?.id,
        action: 'delete_sabq_index',
        entityType: 'mirqab_entry',
        entityId: req.params.id
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting SABQ index:", error);
      res.status(500).json({ message: "فشل في حذف المؤشر" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // NEXT STORY ROUTES - قصة قادمة

  // GET /api/mirqab/next-stories - List Next Stories
  app.get("/api/mirqab/next-stories", async (req, res) => {
    try {
      const { limit } = req.query;
      const stories = await storage.getUpcomingNextStories(
        limit ? parseInt(limit as string) : 10
      );
      res.json(stories);
    } catch (error) {
      console.error("Error fetching next stories:", error);
      res.status(500).json({ message: "فشل في جلب القصص القادمة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/mirqab/next-stories/:id - Get single Next Story
  app.get("/api/mirqab/next-stories/:id", async (req, res) => {
    try {
      const entry = await storage.getMirqabEntryById(req.params.id);
      if (!entry || entry.entryType !== 'next_story') {
        return res.status(404).json({ message: "القصة غير موجودة" });
      }
      
      const storyData = await storage.getNextStoryByEntryId(entry.id);
      res.json({ ...entry, storyData });
    } catch (error) {
      console.error("Error fetching next story:", error);
      res.status(500).json({ message: "فشل في جلب القصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/mirqab/next-stories - Create Next Story
  app.post("/api/mirqab/next-stories", requireAuth, requirePermission('mirqab.create'), async (req: any, res) => {
    try {
      const entryData = insertMirqabEntrySchema.parse({
        ...req.body.entry,
        entryType: 'next_story',
        slug: generateSlug(req.body.entry.title),
        authorId: req.user?.id,
      });
      
      const entry = await storage.createMirqabEntry(entryData);
      
      const storyData = insertMirqabNextStorySchema.parse({
        ...req.body.storyData,
        entryId: entry.id,
      });
      
      const nextStory = await storage.createNextStory(storyData);
      
      await logActivity({
        userId: req.user?.id,
        action: 'create_next_story',
        entityType: 'mirqab_entry',
        entityId: entry.id,
        newValue: { title: entry.title }
      });
      
      res.status(201).json({ entry, storyData: nextStory });
    } catch (error) {
      console.error("Error creating next story:", error);
      res.status(500).json({ message: "فشل في إنشاء القصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PUT /api/mirqab/next-stories/:id - Update Next Story
  app.put("/api/mirqab/next-stories/:id", requireAuth, requirePermission('mirqab.edit'), async (req: any, res) => {
    try {
      const entry = await storage.getMirqabEntryById(req.params.id);
      if (!entry || entry.entryType !== 'next_story') {
        return res.status(404).json({ message: "القصة غير موجودة" });
      }
      
      if (req.body.entry) {
        const entryUpdates = updateMirqabEntrySchema.parse({
          ...req.body.entry,
          editorId: req.user?.id,
        });
        await storage.updateMirqabEntry(req.params.id, entryUpdates);
      }
      
      if (req.body.storyData) {
        const storyData = await storage.getNextStoryByEntryId(req.params.id);
        if (storyData) {
          const storyUpdates = updateMirqabNextStorySchema.parse(req.body.storyData);
          await storage.updateNextStory(storyData.id, storyUpdates);
        }
      }
      
      await logActivity({
        userId: req.user?.id,
        action: 'update_next_story',
        entityType: 'mirqab_entry',
        entityId: req.params.id,
        newValue: { title: entry.title }
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating next story:", error);
      res.status(500).json({ message: "فشل في تحديث القصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/mirqab/next-stories/:id - Delete Next Story
  app.delete("/api/mirqab/next-stories/:id", requireAuth, requirePermission('mirqab.delete'), async (req: any, res) => {
    try {
      await storage.deleteMirqabEntry(req.params.id);
      
      await logActivity({
        userId: req.user?.id,
        action: 'delete_next_story',
        entityType: 'mirqab_entry',
        entityId: req.params.id
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting next story:", error);
      res.status(500).json({ message: "فشل في حذف القصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // RADAR ALERT ROUTES - الرادار

  // GET /api/mirqab/radar - List Radar Reports
  app.get("/api/mirqab/radar", async (req, res) => {
    try {
      const { limit } = req.query;
      const reports = await storage.getLatestRadarReports(
        limit ? parseInt(limit as string) : 10
      );
      res.json(reports);
    } catch (error) {
      console.error("Error fetching radar reports:", error);
      res.status(500).json({ message: "فشل في جلب تقارير الرادار" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/mirqab/radar/today - Get today's radar report
  app.get("/api/mirqab/radar/today", async (req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const report = await storage.getRadarReportByDate(today);
      res.json(report || null);
    } catch (error) {
      console.error("Error fetching today's radar report:", error);
      res.status(500).json({ message: "فشل في جلب تقرير اليوم" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/mirqab/radar/:id - Get single Radar Report
  app.get("/api/mirqab/radar/:id", async (req, res) => {
    try {
      const entry = await storage.getMirqabEntryById(req.params.id);
      if (!entry || entry.entryType !== 'radar') {
        return res.status(404).json({ message: "التقرير غير موجود" });
      }
      
      const radarData = await storage.getRadarReportByEntryId(entry.id);
      res.json({ ...entry, radarData });
    } catch (error) {
      console.error("Error fetching radar report:", error);
      res.status(500).json({ message: "فشل في جلب التقرير" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/mirqab/radar - Create Radar Report
  app.post("/api/mirqab/radar", requireAuth, requirePermission('mirqab.create'), async (req: any, res) => {
    try {
      const entryData = insertMirqabEntrySchema.parse({
        ...req.body.entry,
        entryType: 'radar',
        slug: generateSlug(req.body.entry.title),
        authorId: req.user?.id,
      });
      
      const entry = await storage.createMirqabEntry(entryData);
      
      const radarData = insertMirqabRadarAlertSchema.parse({
        ...req.body.radarData,
        entryId: entry.id,
      });
      
      const radarReport = await storage.createRadarReport(radarData);
      
      await logActivity({
        userId: req.user?.id,
        action: 'create_radar_report',
        entityType: 'mirqab_entry',
        entityId: entry.id,
        newValue: { title: entry.title }
      });
      
      res.status(201).json({ entry, radarData: radarReport });
    } catch (error) {
      console.error("Error creating radar report:", error);
      res.status(500).json({ message: "فشل في إنشاء التقرير" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PUT /api/mirqab/radar/:id - Update Radar Report
  app.put("/api/mirqab/radar/:id", requireAuth, requirePermission('mirqab.edit'), async (req: any, res) => {
    try {
      const entry = await storage.getMirqabEntryById(req.params.id);
      if (!entry || entry.entryType !== 'radar') {
        return res.status(404).json({ message: "التقرير غير موجود" });
      }
      
      if (req.body.entry) {
        const entryUpdates = updateMirqabEntrySchema.parse({
          ...req.body.entry,
          editorId: req.user?.id,
        });
        await storage.updateMirqabEntry(req.params.id, entryUpdates);
      }
      
      if (req.body.radarData) {
        const radarData = await storage.getRadarReportByEntryId(req.params.id);
        if (radarData) {
          const radarUpdates = updateMirqabRadarAlertSchema.parse(req.body.radarData);
          await storage.updateRadarReport(radarData.id, radarUpdates);
        }
      }
      
      await logActivity({
        userId: req.user?.id,
        action: 'update_radar_report',
        entityType: 'mirqab_entry',
        entityId: req.params.id,
        newValue: { title: entry.title }
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating radar report:", error);
      res.status(500).json({ message: "فشل في تحديث التقرير" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/mirqab/radar/:id - Delete Radar Report
  app.delete("/api/mirqab/radar/:id", requireAuth, requirePermission('mirqab.delete'), async (req: any, res) => {
    try {
      await storage.deleteMirqabEntry(req.params.id);
      
      await logActivity({
        userId: req.user?.id,
        action: 'delete_radar_report',
        entityType: 'mirqab_entry',
        entityId: req.params.id
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting radar report:", error);
      res.status(500).json({ message: "فشل في حذف التقرير" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // ALGORITHM ARTICLE ROUTES - الخوارزمي يكتب

  // GET /api/mirqab/algorithm-writes - List Algorithm Articles
  app.get("/api/mirqab/algorithm-writes", async (req, res) => {
    try {
      const { limit } = req.query;
      const articles = await storage.getLatestAlgorithmArticles(
        limit ? parseInt(limit as string) : 10
      );
      res.json({
        entries: articles,
        total: articles.length
      });
    } catch (error) {
      console.error("Error fetching algorithm articles:", error);
      res.status(500).json({ message: "فشل في جلب مقالات الخوارزمي" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/mirqab/algorithm-writes/:id - Get single Algorithm Article
  app.get("/api/mirqab/algorithm-writes/:id", async (req, res) => {
    try {
      const entry = await storage.getMirqabEntryById(req.params.id);
      if (!entry || entry.entryType !== 'algorithm_article') {
        return res.status(404).json({ message: "المقال غير موجود" });
      }
      
      const articleData = await storage.getAlgorithmArticleByEntryId(entry.id);
      res.json({ ...entry, articleData });
    } catch (error) {
      console.error("Error fetching algorithm article:", error);
      res.status(500).json({ message: "فشل في جلب المقال" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/mirqab/algorithm-writes - Create Algorithm Article
  app.post("/api/mirqab/algorithm-writes", requireAuth, requirePermission('mirqab.create'), async (req: any, res) => {
    try {
      const entryData = insertMirqabEntrySchema.parse({
        ...req.body.entry,
        entryType: 'algorithm_article',
        slug: generateSlug(req.body.entry.title),
        authorId: req.user?.id,
      });
      
      const entry = await storage.createMirqabEntry(entryData);
      
      const articleData = insertMirqabAlgorithmArticleSchema.parse({
        ...req.body.articleData,
        entryId: entry.id,
      });
      
      const algorithmArticle = await storage.createAlgorithmArticle(articleData);
      
      await logActivity({
        userId: req.user?.id,
        action: 'create_algorithm_article',
        entityType: 'mirqab_entry',
        entityId: entry.id,
        newValue: { title: entry.title }
      });
      
      res.status(201).json({ entry, articleData: algorithmArticle });
    } catch (error) {
      console.error("Error creating algorithm article:", error);
      res.status(500).json({ message: "فشل في إنشاء المقال" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PUT /api/mirqab/algorithm-writes/:id - Update Algorithm Article
  app.put("/api/mirqab/algorithm-writes/:id", requireAuth, requirePermission('mirqab.edit'), async (req: any, res) => {
    try {
      const entry = await storage.getMirqabEntryById(req.params.id);
      if (!entry || entry.entryType !== 'algorithm_article') {
        return res.status(404).json({ message: "المقال غير موجود" });
      }
      
      if (req.body.entry) {
        const entryUpdates = updateMirqabEntrySchema.parse({
          ...req.body.entry,
          editorId: req.user?.id,
        });
        await storage.updateMirqabEntry(req.params.id, entryUpdates);
      }
      
      if (req.body.articleData) {
        const articleData = await storage.getAlgorithmArticleByEntryId(req.params.id);
        if (articleData) {
          const articleUpdates = updateMirqabAlgorithmArticleSchema.parse(req.body.articleData);
          await storage.updateAlgorithmArticle(articleData.id, articleUpdates);
        }
      }
      
      await logActivity({
        userId: req.user?.id,
        action: 'update_algorithm_article',
        entityType: 'mirqab_entry',
        entityId: req.params.id,
        newValue: { title: entry.title }
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating algorithm article:", error);
      res.status(500).json({ message: "فشل في تحديث المقال" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/mirqab/algorithm-writes/:id - Delete Algorithm Article
  app.delete("/api/mirqab/algorithm-writes/:id", requireAuth, requirePermission('mirqab.delete'), async (req: any, res) => {
    try {
      await storage.deleteMirqabEntry(req.params.id);
      
      await logActivity({
        userId: req.user?.id,
        action: 'delete_algorithm_article',
        entityType: 'mirqab_entry',
        entityId: req.params.id
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting algorithm article:", error);
      res.status(500).json({ message: "فشل في حذف المقال" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

}
