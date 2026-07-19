// Internal announcements (نظام الإعلانات الداخلية) — extracted verbatim from
// server/routes.ts on 2026-06-10 as the first Milestone-2 monolith
// extraction (audit T2.2). Behavior is identical; only the registration
// moved to splitRoutesIndex. ADR-001-compliant: storage-only data access.
import type { Express } from "express";
import { storage } from "../storage";
import {
  requireAuth,
  requireRole,
  logActivity,
  getUserPermissions,
  getUserRoleNames,
} from "../rbac";
import {
  insertInternalAnnouncementSchema,
  updateInternalAnnouncementSchema,
} from "@shared/schema";

export function registerAnnouncementRoutes(app: Express) {
  async function findUnknownAudienceRoles(audienceRoles: string[] | null | undefined) {
    if (!audienceRoles || audienceRoles.length === 0) return [];
    const availableRoles = await storage.getAllRoles();
    const availableRoleNames = new Set(availableRoles.map((role) => role.name));
    return audienceRoles.filter((role) => !availableRoleNames.has(role));
  }

  // ============================================================
  // INTERNAL ANNOUNCEMENTS ROUTES - نظام الإعلانات الداخلية المتقدم
  // ============================================================

  // 1. POST /api/announcements - Create announcement (admin only)
  app.post("/api/announcements",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "غير مصرح" });
        }

        // Validate request body
        const validatedData = insertInternalAnnouncementSchema.parse(req.body);

        const unknownRoles = await findUnknownAudienceRoles(validatedData.audienceRoles);
        if (unknownRoles.length > 0) {
          return res.status(400).json({
            message: "تتضمن قائمة الاستهداف أدوارًا غير موجودة",
            roles: unknownRoles,
          });
        }

        if (validatedData.status === 'scheduled' && !validatedData.startAt) {
          return res.status(400).json({ message: "تاريخ البدء مطلوب عند جدولة الإعلان" });
        }

        // Publishing goes through the publish operation so publisher/time are
        // always recorded instead of inserting an incomplete published row.
        const shouldPublish = validatedData.status === 'published';
        const announcement = await storage.createInternalAnnouncement({
          ...validatedData,
          status: shouldPublish ? 'draft' : validatedData.status,
          createdBy: userId,
        } as any);
        const result = shouldPublish
          ? await storage.publishInternalAnnouncement(announcement.id, userId)
          : announcement;

        // Log activity
        await logActivity({
          userId,
          action: 'create',
          entityType: 'internal_announcement',
          entityId: announcement.id,
          newValue: { title: result.title, status: result.status },
        });

        res.status(201).json(result);
      } catch (error: any) {
        console.error("Error creating announcement:", error);
        if (error.name === 'ZodError') {
          return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
        }
        res.status(500).json({ message: "فشل في إنشاء الإعلان" });
      }
    }
  );

  // 2. GET /api/announcements/active - Get active announcements for user (public endpoint)
  // IMPORTANT: This must be BEFORE /:id route to avoid matching "active" as an id
  app.get("/api/announcements/active",
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        
        // If user is not logged in, return empty array (no announcements for guests)
        if (!userId) {
          return res.json([]);
        }

        const { channel } = req.query;

        // Use the unified RBAC resolver so legacy users.role accounts and
        // current user_roles assignments follow the same targeting rules.
        const userRoles = await getUserRoleNames(userId);

        // Get active announcements for this user
        const announcements = await storage.getActiveAnnouncementsForUser(
          userId,
          userRoles,
          channel as string | undefined
        );

        res.json(announcements);
      } catch (error: any) {
        console.error("Error fetching active announcements:", error);
        res.status(500).json({ message: "فشل في جلب الإعلانات النشطة" });
      }
    }
  );

  // 3. GET /api/announcements/roles - List every role available for targeting.
  // IMPORTANT: Keep this before /:id so "roles" is not treated as an announcement id.
  app.get("/api/announcements/roles",
    requireAuth,
    requireRole('admin'),
    async (_req: any, res) => {
    try {
        const availableRoles = await storage.getAllRoles();
        res.json(availableRoles);
      } catch (error: any) {
        console.error("Error fetching announcement roles:", error);
        res.status(500).json({ message: "فشل في جلب الأدوار المتاحة" });
      }
    }
  );

  // 4. GET /api/announcements - List all with filters (admin only)
  app.get("/api/announcements",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const {
          status,
          priority,
          channel,
          tags,
          search,
          limit,
          offset,
        } = req.query;

        const filters: any = {};
        
        if (status) filters.status = status;
        if (priority) filters.priority = priority;
        if (channel) filters.channel = channel;
        if (tags) filters.tags = Array.isArray(tags) ? tags : [tags];
        if (search) filters.search = search;
        if (limit) filters.limit = parseInt(limit as string);
        if (offset) filters.offset = parseInt(offset as string);

        const announcements = await storage.getAllInternalAnnouncements(filters);

        res.json(announcements);
      } catch (error: any) {
        console.error("Error fetching announcements:", error);
        res.status(500).json({ message: "فشل في جلب الإعلانات" });
      }
    }
  );

  // 4. GET /api/announcements/:id - Get single announcement with details
  app.get("/api/announcements/:id",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const announcement = await storage.getInternalAnnouncementById(req.params.id);

        if (!announcement) {
          return res.status(404).json({ message: "الإعلان غير موجود" });
        }

        res.json(announcement);
      } catch (error: any) {
        console.error("Error fetching announcement:", error);
        res.status(500).json({ message: "فشل في جلب الإعلان" });
      }
    }
  );

  // 4. PATCH /api/announcements/:id - Update announcement (auto-creates version)
  app.patch("/api/announcements/:id",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "غير مصرح" });
        }

        const announcementId = req.params.id;

        // Check if announcement exists
        const existing = await storage.getInternalAnnouncementById(announcementId);
        if (!existing) {
          return res.status(404).json({ message: "الإعلان غير موجود" });
        }

        // Validate request body
        const validatedData = updateInternalAnnouncementSchema.parse(req.body);

        const unknownRoles = await findUnknownAudienceRoles(validatedData.audienceRoles);
        if (unknownRoles.length > 0) {
          return res.status(400).json({
            message: "تتضمن قائمة الاستهداف أدوارًا غير موجودة",
            roles: unknownRoles,
          });
        }

        if (validatedData.status === 'scheduled' && !validatedData.startAt) {
          return res.status(400).json({ message: "تاريخ البدء مطلوب عند جدولة الإعلان" });
        }

        // Check permissions for editors
        const userPermissions = await getUserPermissions(userId);
        const isAdmin = userPermissions.includes('system.admin') || 
                       userPermissions.includes('announcements.publish');
        
        // Editors can only update drafts
        if (!isAdmin && existing.status !== 'draft') {
          return res.status(403).json({ 
            message: "لا يمكن تعديل الإعلان - يمكن للمحررين تعديل المسودات فقط" 
          });
        }

        // Update announcement (auto-creates version)
        const shouldPublish = validatedData.status === 'published' && existing.status !== 'published';
        const updated = await storage.updateInternalAnnouncement(
          announcementId,
          {
            ...validatedData,
            status: shouldPublish ? existing.status : validatedData.status,
          } as any,
          userId,
          req.body.changeReason
        );
        const result = shouldPublish
          ? await storage.publishInternalAnnouncement(announcementId, userId)
          : updated;

        // Log activity
        await logActivity({
          userId,
          action: 'update',
          entityType: 'internal_announcement',
          entityId: announcementId,
          oldValue: { 
            title: existing.title, 
            status: existing.status,
            message: existing.message 
          },
          newValue: { 
            title: result.title,
            status: result.status,
            message: result.message
          },
          metadata: { reason: req.body.changeReason },
        });

        res.json(result);
      } catch (error: any) {
        console.error("Error updating announcement:", error);
        if (error.name === 'ZodError') {
          return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
        }
        res.status(500).json({ message: "فشل في تحديث الإعلان" });
      }
    }
  );

  // 5. DELETE /api/announcements/:id - Delete announcement
  app.delete("/api/announcements/:id",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "غير مصرح" });
        }

        const announcementId = req.params.id;

        // Check if announcement exists
        const existing = await storage.getInternalAnnouncementById(announcementId);
        if (!existing) {
          return res.status(404).json({ message: "الإعلان غير موجود" });
        }

        // Delete announcement
        await storage.deleteInternalAnnouncement(announcementId);

        // Log activity
        await logActivity({
          userId,
          action: 'delete',
          entityType: 'internal_announcement',
          entityId: announcementId,
          oldValue: { title: existing.title, status: existing.status },
        });

        res.status(204).send();
      } catch (error: any) {
        console.error("Error deleting announcement:", error);
        res.status(500).json({ message: "فشل في حذف الإعلان" });
      }
    }
  );

  // 6. POST /api/announcements/:id/publish - Publish announcement
  app.post("/api/announcements/:id/publish",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "غير مصرح" });
        }

        const announcementId = req.params.id;

        // Check if announcement exists
        const existing = await storage.getInternalAnnouncementById(announcementId);
        if (!existing) {
          return res.status(404).json({ message: "الإعلان غير موجود" });
        }

        // Check if already published
        if (existing.status === 'published') {
          return res.status(400).json({ message: "الإعلان منشور بالفعل" });
        }

        // Publish announcement
        const published = await storage.publishInternalAnnouncement(announcementId, userId);

        // Log activity
        await logActivity({
          userId,
          action: 'publish',
          entityType: 'internal_announcement',
          entityId: announcementId,
          oldValue: { status: existing.status },
          newValue: { status: 'published', publishedAt: published.publishedAt },
        });

        res.json(published);
      } catch (error: any) {
        console.error("Error publishing announcement:", error);
        res.status(500).json({ message: "فشل في نشر الإعلان" });
      }
    }
  );

  // 7. POST /api/announcements/:id/archive - Archive announcement
  app.post("/api/announcements/:id/archive",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "غير مصرح" });
        }

        const announcementId = req.params.id;

        // Check if announcement exists
        const existing = await storage.getInternalAnnouncementById(announcementId);
        if (!existing) {
          return res.status(404).json({ message: "الإعلان غير موجود" });
        }

        // Archive announcement
        const archived = await storage.archiveInternalAnnouncement(announcementId);

        // Log activity
        await logActivity({
          userId,
          action: 'archive',
          entityType: 'internal_announcement',
          entityId: announcementId,
          oldValue: { status: existing.status },
          newValue: { status: 'archived' },
        });

        res.json(archived);
      } catch (error: any) {
        console.error("Error archiving announcement:", error);
        res.status(500).json({ message: "فشل في أرشفة الإعلان" });
      }
    }
  );

  // 8. POST /api/announcements/:id/schedule - Schedule announcement
  app.post("/api/announcements/:id/schedule",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "غير مصرح" });
        }

        const announcementId = req.params.id;
        const { startAt, endAt } = req.body;

        if (!startAt) {
          return res.status(400).json({ message: "تاريخ البدء مطلوب" });
        }

        // Validate dates
        const startDate = new Date(startAt);
        const endDate = endAt ? new Date(endAt) : undefined;

        if (isNaN(startDate.getTime())) {
          return res.status(400).json({ message: "تاريخ البدء غير صالح" });
        }

        if (endDate && isNaN(endDate.getTime())) {
          return res.status(400).json({ message: "تاريخ الانتهاء غير صالح" });
        }

        if (endDate && endDate <= startDate) {
          return res.status(400).json({ message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء" });
        }

        // Check if announcement exists
        const existing = await storage.getInternalAnnouncementById(announcementId);
        if (!existing) {
          return res.status(404).json({ message: "الإعلان غير موجود" });
        }

        // Schedule announcement
        const scheduled = await storage.scheduleInternalAnnouncement(
          announcementId,
          startDate,
          endDate
        );

        // Log activity
        await logActivity({
          userId,
          action: 'schedule',
          entityType: 'internal_announcement',
          entityId: announcementId,
          oldValue: { 
            status: existing.status,
            startAt: existing.startAt,
            endAt: existing.endAt 
          },
          newValue: { 
            status: 'scheduled',
            startAt: startDate,
            endAt: endDate 
          },
        });

        res.json(scheduled);
      } catch (error: any) {
        console.error("Error scheduling announcement:", error);
        res.status(500).json({ message: "فشل في جدولة الإعلان" });
      }
    }
  );

  // 9. GET /api/announcements/:id/versions - Get version history
  app.get("/api/announcements/:id/versions",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const announcementId = req.params.id;

        // Check if announcement exists
        const existing = await storage.getInternalAnnouncementById(announcementId);
        if (!existing) {
          return res.status(404).json({ message: "الإعلان غير موجود" });
        }

        const versions = await storage.getAnnouncementVersions(announcementId);

        res.json(versions);
      } catch (error: any) {
        console.error("Error fetching versions:", error);
        res.status(500).json({ message: "فشل في جلب الإصدارات" });
      }
    }
  );

  // 10. POST /api/announcements/:id/versions/:versionId/restore - Restore version
  app.post("/api/announcements/:id/versions/:versionId/restore",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "غير مصرح" });
        }

        const { id: announcementId, versionId } = req.params;

        // Check if announcement exists
        const existing = await storage.getInternalAnnouncementById(announcementId);
        if (!existing) {
          return res.status(404).json({ message: "الإعلان غير موجود" });
        }

        // Restore version
        const restored = await storage.restoreAnnouncementVersion(versionId, userId);

        // Log activity
        await logActivity({
          userId,
          action: 'restore_version',
          entityType: 'internal_announcement',
          entityId: announcementId,
          metadata: { reason: `Restored from version ${versionId}` },
        });

        res.json(restored);
      } catch (error: any) {
        console.error("Error restoring version:", error);
        if (error.message === 'Version not found' || error.message === 'Announcement not found') {
          return res.status(404).json({ message: "الإصدار أو الإعلان غير موجود" });
        }
        res.status(500).json({ message: "فشل في استعادة الإصدار" });
      }
    }
  );

  // 11. POST /api/announcements/:id/metrics - Track event
  app.post("/api/announcements/:id/metrics",
    requireAuth,
    async (req: any, res) => {
    try {
        const userId = req.user?.id;
        const announcementId = req.params.id;
        const { event, channel, meta } = req.body;

        if (!event) {
          return res.status(400).json({ message: "نوع الحدث مطلوب" });
        }

        // Validate event type
        const validEvents = ['impression', 'unique_view', 'dismiss', 'click'];
        if (!validEvents.includes(event)) {
          return res.status(400).json({ 
            message: "نوع حدث غير صالح. الأنواع المسموحة: impression, unique_view, dismiss, click" 
          });
        }

        // Track metric
        const metric = await storage.trackAnnouncementMetric({
          announcementId,
          userId: userId || null,
          event,
          channel: channel || null,
          meta: meta || null,
        } as any);

        res.status(201).json(metric);
      } catch (error: any) {
        console.error("Error tracking metric:", error);
        res.status(500).json({ message: "فشل في تتبع الحدث" });
      }
    }
  );

  // 12. GET /api/announcements/:id/analytics - Get aggregated analytics
  app.get("/api/announcements/:id/analytics",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const announcementId = req.params.id;

        // Check if announcement exists
        const existing = await storage.getInternalAnnouncementById(announcementId);
        if (!existing) {
          return res.status(404).json({ message: "الإعلان غير موجود" });
        }

        const analytics = await storage.getAnnouncementAnalytics(announcementId);

        res.json(analytics);
      } catch (error: any) {
        console.error("Error fetching analytics:", error);
        res.status(500).json({ message: "فشل في جلب التحليلات" });
      }
    }
  );
}
