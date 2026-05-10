import type { Express } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db";
import { articles } from "@shared/schema";
import { insertStorySchema } from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../rbac";

export function registerStoryRoutes(app: Express) {
  // GET /api/stories - جلب جميع القصص
  app.get("/api/stories", async (req, res) => {
    try {
      const stories = await storage.getAllStories({ status: 'active' });
      res.json(stories);
    } catch (error) {
      console.error("Error getting stories:", error);
      res.status(500).json({ message: "فشل في جلب القصص" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/stories/:slug - جلب قصة واحدة
  app.get("/api/stories/:slug", async (req, res) => {
    try {
      const story = await storage.getStoryBySlug(req.params.slug);
      if (!story) return res.status(404).json({ message: "القصة غير موجودة" });
      res.json(story);
    } catch (error) {
      console.error("Error getting story:", error);
      res.status(500).json({ message: "فشل في جلب القصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/stories - إنشاء قصة (للمشرفين)
  app.post("/api/stories", requireAuth, requireRole('admin', 'editor'), async (req: any, res) => {
    try {
      const data = insertStorySchema.parse(req.body);
      const story = await storage.createStory(data);
      await logActivity({
        userId: req.user?.id,
        action: 'StoryCreated',
        entityType: 'Story',
        entityId: story.id,
      });
      res.json(story);
    } catch (error) {
      console.error("Error creating story:", error);
      res.status(500).json({ message: "فشل في إنشاء القصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PUT /api/stories/:id - تحديث قصة
  app.put("/api/stories/:id", requireAuth, requireRole('admin', 'editor'), async (req: any, res) => {
    try {
      const story = await storage.updateStory(req.params.id, req.body);
      await logActivity({
        userId: req.user?.id,
        action: 'StoryUpdated',
        entityType: 'Story',
        entityId: req.params.id,
      });
      res.json(story);
    } catch (error) {
      console.error("Error updating story:", error);
      res.status(500).json({ message: "فشل في تحديث القصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/stories/:id - حذف قصة
  app.delete("/api/stories/:id", requireAuth, requireRole('admin', 'editor'), async (req: any, res) => {
    try {
      await storage.deleteStory(req.params.id);
      await logActivity({
        userId: req.user?.id,
        action: 'StoryDeleted',
        entityType: 'Story',
        entityId: req.params.id,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story:", error);
      res.status(500).json({ message: "فشل في حذف القصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // ============================================================
  // STORY TIMELINE ROUTES
  // ============================================================

  // GET /api/stories/:storyId/timeline - الأخبار المرتبطة بالقصة
  app.get("/api/stories/:storyId/timeline", async (req, res) => {
    try {
      const links = await storage.getStoryLinks(req.params.storyId);
      res.json(links);
    } catch (error) {
      console.error("Error getting story timeline:", error);
      res.status(500).json({ message: "فشل في جلب الأخبار المرتبطة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/stories/:storyId/links - ربط خبر بقصة (للمشرفين)
  app.post("/api/stories/:storyId/links", requireAuth, requireRole('admin', 'editor'), async (req, res) => {
    try {
      const data = insertStoryLinkSchema.parse({
        ...req.body,
        storyId: req.params.storyId
      });
      const link = await storage.createStoryLink(data);
      res.json(link);
    } catch (error) {
      console.error("Error creating story link:", error);
      res.status(500).json({ message: "فشل في ربط الخبر بالقصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/stories/links/:linkId - إزالة ربط
  app.delete("/api/stories/links/:linkId", requireAuth, requireRole('admin', 'editor'), async (req, res) => {
    try {
      await storage.deleteStoryLink(req.params.linkId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting story link:", error);
      res.status(500).json({ message: "فشل في إزالة الربط" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // ============================================================
  // STORY FOLLOWING ROUTES
  // ============================================================

  // POST /api/stories/:storyId/follow - متابعة قصة
  app.post("/api/stories/:storyId/follow", requireAuth, async (req: any, res) => {
    try {
      const follow = await storage.followStory({
        userId: req.user?.id,
        storyId: req.params.storyId,
        level: req.body.level || 'all',
        channels: req.body.channels || ['inapp'],
      });
      await logActivity({
        userId: req.user?.id,
        action: 'StoryFollowed',
        entityType: 'Story',
        entityId: req.params.storyId,
      });
      res.json(follow);
    } catch (error) {
      console.error("Error following story:", error);
      res.status(500).json({ message: "فشل في متابعة القصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/stories/:storyId/follow - إلغاء متابعة قصة
  app.delete("/api/stories/:storyId/follow", requireAuth, async (req: any, res) => {
    try {
      await storage.unfollowStory(req.user?.id, req.params.storyId);
      await logActivity({
        userId: req.user?.id,
        action: 'StoryUnfollowed',
        entityType: 'Story',
        entityId: req.params.storyId,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error unfollowing story:", error);
      res.status(500).json({ message: "فشل في إلغاء متابعة القصة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/stories/my-follows - قصصي المتابعة
  app.get("/api/stories/my-follows", requireAuth, async (req: any, res) => {
    try {
      const follows = await storage.getStoryFollows(req.user?.id);
      res.json(follows);
    } catch (error) {
      console.error("Error getting user story follows:", error);
      res.status(500).json({ message: "فشل في جلب القصص المتابعة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PUT /api/stories/follows/:storyId - تحديث إعدادات المتابعة
  app.put("/api/stories/follows/:storyId", requireAuth, async (req: any, res) => {
    try {
      const follow = await storage.updateStoryFollow(req.user?.id, req.params.storyId, req.body);
      res.json(follow);
    } catch (error) {
      console.error("Error updating story follow settings:", error);
      res.status(500).json({ message: "فشل في تحديث إعدادات المتابعة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/stories/:storyId/is-following - هل أتابع هذه القصة؟
  app.get("/api/stories/:storyId/is-following", requireAuth, async (req: any, res) => {
    try {
      const isFollowing = await storage.isFollowingStory(req.user?.id, req.params.storyId);
      res.json({ isFollowing });
    } catch (error) {
      console.error("Error checking story follow status:", error);
      res.status(500).json({ message: "فشل في التحقق من حالة المتابعة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/admin/stories/link-existing - ربط المقالات الموجودة بقصص (للإدمن فقط)
  app.post("/api/admin/stories/link-existing", requireAuth, requireRole("admin"), async (req: any, res) => {
    try {
      console.log("[ADMIN] Starting to link existing articles to stories...");
      
      // جلب جميع المقالات المنشورة
      const publishedArticles = await db
        .select()
        .from(articles)
        .where(and(
          eq(articles.status, 'published'),
          eq(articles.hideFromHomepage, false)
        ))
        .orderBy(desc(articles.publishedAt));

      console.log(`[ADMIN] Found ${publishedArticles.length} published articles`);

      const { matchAndLinkArticle } = await import("../storyMatcher");
      let successCount = 0;
      let errorCount = 0;

      // ربط كل مقال بقصة
      for (const article of publishedArticles) {
    try {
          console.log(`[ADMIN] Processing article: ${article.title}`);
          await matchAndLinkArticle(article.id);
          successCount++;
        } catch (error) {
          console.error(`[ADMIN] Error linking article ${article.id}:`, error);
          errorCount++;
        }
      }

      console.log(`[ADMIN] Finished! Success: ${successCount}, Errors: ${errorCount}`);

      res.json({
        success: true,
        message: `تم ربط ${successCount} مقال بقصص بنجاح`,
        stats: {
          total: publishedArticles.length,
          success: successCount,
          errors: errorCount
        }
      });
    } catch (error) {
      console.error("[ADMIN] Error in link-existing:", error);
      res.status(500).json({ message: "فشل في ربط المقالات بالقصص" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

}
