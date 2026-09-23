// Sabq Shorts / Reels (سبق شورتس) — public + admin routes, extracted
// verbatim from server/routes.ts on 2026-06-10 (Milestone-2 extraction #3,
// audit T2.2). ADR-001-compliant: storage-only data access (the upload
// route uses ObjectStorageService, which is storage-provider logic, not db).
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAnyPermission, logActivity } from "../rbac";
import { ObjectStorageService } from "../objectStorage";
import { decrementShortLikes, listShortsForAdmin } from "../services/shortsService";
import {
  insertShortSchema,
  updateShortSchema,
  insertShortAnalyticSchema,
} from "@shared/schema";
import { paginationOrReject, parsePage, parseLimit } from "../utils/pagination";

export function registerShortsRoutes(app: Express) {
  // ============================================================
  // SABQ SHORTS (REELS) API ROUTES - سبق شورتس
  // ============================================================

  // ============================================================
  // PUBLIC ENDPOINTS (No auth required)
  // ============================================================

  // 1. GET /api/shorts - List all published shorts with pagination and filters
  app.get("/api/shorts", async (req, res) => {
    try {
      const { 
        page = "1", 
        limit = "20", 
        categoryId, 
        reporterId 
      } = req.query;

      const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path }, res, { defaultLimit: 20, maxLimit: 50, allowPage: true, defaultPage: 1 });
      if (!pg) return;
      const pageNum = pg.page;
      const limitNum = pg.limit;

      const filters: any = {
        status: "published",
        page: pageNum,
        limit: limitNum,
      };

      if (categoryId) {
        filters.categoryId = categoryId as string;
      }

      if (reporterId) {
        filters.reporterId = reporterId as string;
      }

      const result = await storage.getAllShorts(filters);

      res.json(result);
    } catch (error: any) {
      console.error("Error fetching shorts:", error);
      res.status(500).json({ message: "فشل في جلب الشورتس" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 2. GET /api/shorts/featured - Get featured shorts for homepage block
  app.get("/api/shorts/featured", async (req, res) => {
    try {
      const { limit = "10" } = req.query;
      const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path }, res, { defaultLimit: 10, maxLimit: 20 });
      if (!pg) return;
      const limitNum = pg.limit;

      const featuredShorts = await storage.getFeaturedShorts(limitNum);

      res.json({
        shorts: featuredShorts,
        total: featuredShorts.length,
      });
    } catch (error: any) {
      console.error("Error fetching featured shorts:", error);
      res.status(500).json({ message: "فشل في جلب الشورتس المميزة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 3. GET /api/shorts/:id - Get single short by ID
  app.get("/api/shorts/:id", async (req, res) => {
    try {
      const shortId = req.params.id;

      const short = await storage.getShortById(shortId);

      if (!short) {
        return res.status(404).json({ message: "الشورت غير موجود" });
      }

      // Only return published shorts for public endpoint
      if (short.status !== "published") {
        return res.status(404).json({ message: "الشورت غير موجود" });
      }

      res.json(short);
    } catch (error: any) {
      console.error("Error fetching short:", error);
      res.status(500).json({ message: "فشل في جلب الشورت" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 4. GET /api/shorts/slug/:slug - Get single short by slug
  app.get("/api/shorts/slug/:slug", async (req, res) => {
    try {
      const slug = req.params.slug;

      const short = await storage.getShortBySlug(slug);

      if (!short) {
        return res.status(404).json({ message: "الشورت غير موجود" });
      }

      // Only return published shorts for public endpoint
      if (short.status !== "published") {
        return res.status(404).json({ message: "الشورت غير موجود" });
      }

      res.json(short);
    } catch (error: any) {
      console.error("Error fetching short by slug:", error);
      res.status(500).json({ message: "فشل في جلب الشورت" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 5. POST /api/shorts/:id/view - Track view event
  app.post("/api/shorts/:id/view", async (req, res) => {
    try {
      const shortId = req.params.id;
      const userId = (req as any).user?.id || null;

      // Check if short exists and is published
      const short = await storage.getShortById(shortId);
      if (!short || short.status !== "published") {
        return res.status(404).json({ message: "الشورت غير موجود" });
      }

      // Increment view count
      await storage.incrementShortViews(shortId);

      // Track analytics event
      await storage.trackShortAnalytic({
        shortId,
        userId,
        eventType: "view",
      });

      res.status(201).json({ message: "تم تسجيل المشاهدة" });
    } catch (error: any) {
      console.error("Error tracking view:", error);
      res.status(500).json({ message: "فشل في تسجيل المشاهدة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 6. POST /api/shorts/:id/like - Like a short
  app.post("/api/shorts/:id/like", async (req, res) => {
    try {
      const shortId = req.params.id;
      const userId = (req as any).user?.id || null;

      // Check if short exists and is published
      const short = await storage.getShortById(shortId);
      if (!short || short.status !== "published") {
        return res.status(404).json({ message: "الشورت غير موجود" });
      }

      // Increment like count
      const updated = await storage.likeShort(shortId);

      // Track analytics event
      await storage.trackShortAnalytic({
        shortId,
        userId,
        eventType: "like",
      });

      res.json({ 
        message: "تم الإعجاب بالشورت",
        likes: updated.likes 
      });
    } catch (error: any) {
      console.error("Error liking short:", error);
      res.status(500).json({ message: "فشل في الإعجاب بالشورت" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 7. POST /api/shorts/:id/unlike - Unlike a short (decrement like count)
  app.post("/api/shorts/:id/unlike", async (req, res) => {
    try {
      const shortId = req.params.id;
      const userId = (req as any).user?.id || null;

      // Check if short exists and is published
      const short = await storage.getShortById(shortId);
      if (!short || short.status !== "published") {
        return res.status(404).json({ message: "الشورت غير موجود" });
      }

      // Decrement like count (floored at zero — see shortsService)
      const updated = await decrementShortLikes(shortId);
      if (!updated) {
        return res.status(404).json({ message: "الشورت غير موجود" });
      }

      // Track analytics event
      await storage.trackShortAnalytic({
        shortId,
        userId,
        eventType: "unlike",
      });

      res.json({ 
        message: "تم إلغاء الإعجاب بالشورت",
        likes: updated.likes 
      });
    } catch (error: any) {
      console.error("Error unliking short:", error);
      res.status(500).json({ message: "فشل في إلغاء الإعجاب بالشورت" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 8. POST /api/shorts/:id/share - Track share event
  app.post("/api/shorts/:id/share", async (req, res) => {
    try {
      const shortId = req.params.id;
      const userId = (req as any).user?.id || null;
      const { platform } = req.body;

      // Check if short exists and is published
      const short = await storage.getShortById(shortId);
      if (!short || short.status !== "published") {
        return res.status(404).json({ message: "الشورت غير موجود" });
      }

      // Increment share count
      const updated = await storage.shareShort(shortId);

      // Track analytics event with platform info
      await storage.trackShortAnalytic({
        shortId,
        userId,
        eventType: "share",
      });

      res.status(201).json({ 
        message: "تم تسجيل المشاركة",
        shares: updated.shares 
      });
    } catch (error: any) {
      console.error("Error tracking share:", error);
      res.status(500).json({ message: "فشل في تسجيل المشاركة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 9. POST /api/analytics/short - Track watch time and other analytics
  app.post("/api/analytics/short", async (req, res) => {
    try {
      const validatedData = insertShortAnalyticSchema.parse(req.body);
      const userId = (req as any).user?.id || null;

      // Add userId if authenticated
      const analyticData = {
        ...validatedData,
        userId,
      };

      const analytic = await storage.trackShortAnalytic(analyticData);

      res.status(201).json(analytic);
    } catch (error: any) {
      console.error("Error tracking analytics:", error);
      
      if (error.name === "ZodError") {
        return res.status(400).json({ 
          message: "بيانات غير صالحة",
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "فشل في تسجيل التحليلات" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // ============================================================
  // ADMIN/REPORTER ENDPOINTS (Auth required)
  // ============================================================

  // 10. GET /api/admin/shorts - List all shorts for admin panel (with all statuses)
  app.get("/api/admin/shorts",
    requireAuth,
    requireAnyPermission('shorts:view', 'shorts:manage'),
    async (req: any, res) => {
    try {
        const { 
          page = "1", 
          limit = "20", 
          status,
          categoryId, 
          reporterId 
        } = req.query;

        const pageNum = parsePage(page);
        const limitNum = parseLimit(limit, 20, 100);

        const { shorts: shortsWithDetails, total } = await listShortsForAdmin({
          status,
          categoryId,
          reporterId,
          page: pageNum,
          limit: limitNum,
        });

      res.json({
          shorts: shortsWithDetails,
          total,
          page: pageNum,
          limit: limitNum,
          hasMore: total > pageNum * limitNum,

          totalPages: Math.ceil(total / limitNum),
        });
      } catch (error: any) {
        console.error("Error fetching admin shorts:", error);
        res.status(500).json({ message: "فشل في جلب الشورتس" });
      }
    }
  );

  // 11. POST /api/admin/shorts - Create new short
  app.post("/api/admin/shorts",
    requireAuth,
    requireAnyPermission('shorts:create', 'shorts:manage'),
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "غير مصرح" });
        }

        // Validate request body
        const validatedData = insertShortSchema.parse(req.body);

        // Create short with current user as author if not specified
        const shortData: any = {
          ...validatedData,
          reporterId: validatedData.reporterId || userId,
        };

        // Auto-assign high displayOrder (timestamp in seconds) if not set - makes new shorts appear first
        if (shortData.displayOrder === undefined || shortData.displayOrder === null || shortData.displayOrder === 0) {
          shortData.displayOrder = Math.floor(Date.now() / 1000);
        }

        const newShort = await storage.createShort(shortData);

        // Log activity
        await logActivity({
          userId,
          action: 'create',
          entityType: 'short',
          entityId: newShort.id,
          newValue: { 
            title: newShort.title, 
            status: newShort.status,
            categoryId: newShort.categoryId 
          },
        });

        res.status(201).json(newShort);
      } catch (error: any) {
        console.error("Error creating short:", error);
        
        if (error.name === "ZodError") {
          return res.status(400).json({ 
            message: "بيانات غير صالحة",
            errors: error.errors 
          });
        }
        
        res.status(500).json({ message: "فشل في إنشاء الشورت" });
      }
    }
  );

  // 12. PUT /api/admin/shorts/:id - Update short
  app.put("/api/admin/shorts/:id",
    requireAuth,
    requireAnyPermission('shorts:edit', 'shorts:manage'),
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "غير مصرح" });
        }

        const shortId = req.params.id;

        // Check if short exists
        const existing = await storage.getShortById(shortId);
        if (!existing) {
          return res.status(404).json({ message: "الشورت غير موجود" });
        }

        // Validate request body
        const validatedData = updateShortSchema.parse(req.body);

        // Update short
        const updated = await storage.updateShort(shortId, validatedData);

        // Log activity
        await logActivity({
          userId,
          action: 'update',
          entityType: 'short',
          entityId: shortId,
          oldValue: { 
            title: existing.title,
            status: existing.status 
          },
          newValue: { 
            title: updated.title,
            status: updated.status 
          },
        });

        res.json(updated);
      } catch (error: any) {
        console.error("Error updating short:", error);
        
        if (error.name === "ZodError") {
          return res.status(400).json({ 
            message: "بيانات غير صالحة",
            errors: error.errors 
          });
        }
        
        res.status(500).json({ message: "فشل في تحديث الشورت" });
      }
    }
  );

  // 13. GET /api/admin/shorts/:id - Get single short (any status) for editing
  app.get("/api/admin/shorts/:id",
    requireAuth,
    requireAnyPermission('shorts:view', 'shorts:edit', 'shorts:manage'),
    async (req: any, res) => {
    try {
        const shortId = req.params.id;

        const short = await storage.getShortById(shortId);

        if (!short) {
          return res.status(404).json({ message: "الشورت غير موجود" });
        }

        res.json(short);
      } catch (error: any) {
        console.error("Error fetching short:", error);
        res.status(500).json({ message: "فشل في جلب الشورت" });
      }
    }
  );

  // 14. DELETE /api/admin/shorts/:id - Delete short (soft delete)
  app.delete("/api/admin/shorts/:id",
    requireAuth,
    requireAnyPermission('shorts:delete', 'shorts:manage'),
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "غير مصرح" });
        }

        const shortId = req.params.id;

        // Check if short exists
        const existing = await storage.getShortById(shortId);
        if (!existing) {
          return res.status(404).json({ message: "الشورت غير موجود" });
        }

        // Soft delete (set status to archived)
        const deleted = await storage.deleteShort(shortId);

        // Log activity
        await logActivity({
          userId,
          action: 'delete',
          entityType: 'short',
          entityId: shortId,
          oldValue: { 
            title: existing.title,
            status: existing.status 
          },
          newValue: { 
            status: 'archived' 
          },
        });

        res.json(deleted);
      } catch (error: any) {
        console.error("Error deleting short:", error);
        res.status(500).json({ message: "فشل في حذف الشورت" });
      }
    }
  );

  // 14. POST /api/admin/shorts/upload - Get upload URL for shorts files (images/videos)
  app.post("/api/admin/shorts/upload",
    requireAuth,
    requireAnyPermission('shorts:create', 'shorts:edit', 'shorts:manage'),
    async (req: any, res) => {
    try {
        const objectStorageService = new ObjectStorageService();
        const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
      } catch (error: any) {
        console.error("Error getting upload URL for shorts:", error);
        res.status(500).json({ message: "فشل في الحصول على رابط الرفع" });
      }
    }
  );

  // 15. GET /api/admin/shorts/:id/analytics - Get analytics for a short
  app.get("/api/admin/shorts/:id/analytics",
    requireAuth,
    requireAnyPermission('shorts:view', 'shorts:manage'),
    async (req: any, res) => {
    try {
        const shortId = req.params.id;
        const { eventType, startDate, endDate } = req.query;

        // Check if short exists
        const existing = await storage.getShortById(shortId);
        if (!existing) {
          return res.status(404).json({ message: "الشورت غير موجود" });
        }

        const filters: any = {};

        if (eventType) {
          filters.eventType = eventType as string;
        }

        if (startDate) {
          filters.startDate = new Date(startDate as string);
        }

        if (endDate) {
          filters.endDate = new Date(endDate as string);
        }

        const analytics = await storage.getShortAnalytics(shortId, filters);

        res.json(analytics);
      } catch (error: any) {
        console.error("Error fetching short analytics:", error);
        res.status(500).json({ message: "فشل في جلب التحليلات" });
      }
    }
  );
}
