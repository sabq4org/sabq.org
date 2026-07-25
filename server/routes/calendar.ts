// Calendar system (تقويم سبق) — events, reminders, assignments, AI drafts.
// Extracted verbatim from server/routes.ts on 2026-06-10 (Milestone-2
// extraction #4, audit T2.2). ADR-001-compliant: storage-only data access;
// AI generation goes through services/calendarAi.
import type { Express } from "express";
import { storage } from "../storage";
import { memoryCache } from "../memoryCache";
import {
  requireAuth,
  requirePermission,
  requireAnyPermission,
  logActivity,
} from "../rbac";
import { generateCalendarEventIdeas, generateArticleDraft } from "../services/calendarAi";
import { createNotification } from "../notificationEngine";
import { authorizeAssignmentWrite } from "../services/calendarAssignmentService";
import {
  insertCalendarEventSchema,
  updateCalendarEventSchema,
  insertCalendarAssignmentSchema,
  insertCalendarReminderSchema,
  updateCalendarAssignmentSchema,
} from "@shared/schema";

export function registerCalendarRoutes(app: Express) {
  // ============================================================
  // CALENDAR SYSTEM API ENDPOINTS - تقويم سبق
  // ============================================================

  // GET /api/calendar - قائمة الأحداث مع الفلاتر
  app.get("/api/calendar", async (req: any, res) => {
    try {
      const filters: any = {};
      
      if (req.query.type) filters.type = req.query.type;
      if (req.query.importance) filters.importance = parseInt(req.query.importance as string);
      if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
      if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);
      if (req.query.categoryId) filters.categoryId = req.query.categoryId;
      if (req.query.tags) {
        filters.tags = Array.isArray(req.query.tags) 
          ? req.query.tags 
          : [req.query.tags];
      }
      if (req.query.searchQuery) filters.searchQuery = req.query.searchQuery;
      if (req.query.page) filters.page = parseInt(req.query.page as string);
      if (req.query.limit) filters.limit = parseInt(req.query.limit as string);

      const result = await storage.getAllCalendarEvents(filters);
      res.json(result);
    } catch (error) {
      console.error("خطأ في جلب أحداث التقويم:", error);
      res.status(500).json({ message: "حدث خطأ في جلب أحداث التقويم" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/calendar/upcoming - الأحداث القادمة
  app.get("/api/calendar/upcoming", async (req: any, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      const events = await storage.getUpcomingCalendarEvents(days);
      res.json(events);
    } catch (error) {
      console.error("خطأ في جلب الأحداث القادمة:", error);
      res.status(500).json({ message: "حدث خطأ في جلب الأحداث القادمة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/calendar/upcoming-reminders - التذكيرات القادمة
  app.get("/api/calendar/upcoming-reminders", requireAuth, async (req: any, res) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      const reminders = await storage.getUpcomingReminders(days);
      res.json(reminders);
    } catch (error) {
      console.error("خطأ في جلب التذكيرات القادمة:", error);
      res.status(500).json({ message: "حدث خطأ في جلب التذكيرات القادمة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/calendar/my-assignments - المهام المخصصة للمستخدم
  app.get("/api/calendar/my-assignments", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user!.id;
      const status = req.query.status as string | undefined;
      
      const assignments = await storage.getCalendarAssignments({
        userId,
        status: status || undefined,
      });
      
      res.json(assignments);
    } catch (error) {
      console.error("خطأ في جلب المهام:", error);
      res.status(500).json({ message: "حدث خطأ في جلب المهام" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/calendar/:id - تفاصيل حدث
  app.get("/api/calendar/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const event = await storage.getCalendarEventById(id);
      
      if (!event) {
        return res.status(404).json({ message: "الحدث غير موجود" });
      }
      
      res.json(event);
    } catch (error) {
      console.error("خطأ في جلب تفاصيل الحدث:", error);
      res.status(500).json({ message: "حدث خطأ في جلب تفاصيل الحدث" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/calendar - إنشاء حدث جديد
  app.post("/api/calendar", requireAuth, requirePermission("calendar:create"), async (req: any, res) => {
    try {
      const userId = req.user!.id;
      
      // توليد slug تلقائياً من العنوان إذا لم يكن موجوداً
      if (!req.body.slug && req.body.title) {
        const baseSlug = req.body.title
          .toLowerCase()
          .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, '') // إبقاء العربية والإنجليزية والأرقام
          .trim()
          .replace(/\s+/g, '-') // استبدال المسافات بـ -
          .substring(0, 100); // الحد الأقصى 100 حرف
        
        // إضافة timestamp للتأكد من عدم التكرار
        req.body.slug = `${baseSlug}-${Date.now()}`;
      }
      
      const validatedData = insertCalendarEventSchema.parse(req.body);
      
      // تحويل التواريخ من string إلى Date
      const eventData = {
        ...validatedData,
        dateStart: new Date(validatedData.dateStart),
        dateEnd: validatedData.dateEnd ? new Date(validatedData.dateEnd) : undefined,
        createdById: userId
      };
      
      // تحويل التذكيرات: من scheduledFor (timestamp) إلى fireWhen (days before)
      const rawReminders = req.body.reminders || [];
      const reminders = rawReminders.map((r: any) => {
        // حساب عدد الأيام بين scheduledFor و dateStart
        const eventDate = new Date(validatedData.dateStart);
        const reminderDate = new Date(r.scheduledFor);
        const diffMs = eventDate.getTime() - reminderDate.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        
        return {
          fireWhen: Math.max(0, diffDays), // على الأقل 0 (يوم الحدث نفسه)
          channel: r.channel || 'IN_APP',
          enabled: true,
        };
      });
      
      const event = await storage.createCalendarEvent(
        eventData as any,
        reminders
      );

      await logActivity({
        userId,
        action: 'calendar_event_created',
        entityType: 'calendar_event',
        entityId: event.id,
        newValue: event,
      });

      res.status(201).json(event);
    } catch (error: any) {
      console.error("خطأ في إنشاء حدث:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
      }
      res.status(500).json({ message: "حدث خطأ في إنشاء الحدث" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PATCH /api/calendar/:id - تحديث حدث
  app.patch("/api/calendar/:id", requireAuth, requirePermission("calendar:edit"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      
      const event = await storage.getCalendarEventById(id);
      if (!event) {
        return res.status(404).json({ message: "الحدث غير موجود" });
      }

      const validatedData = updateCalendarEventSchema.parse(req.body);
      const updated = await storage.updateCalendarEvent(id, validatedData as any);

      await logActivity({
        userId,
        action: 'calendar_event_updated',
        entityType: 'calendar_event',
        entityId: id,
        oldValue: event,
        newValue: updated
      });

      res.json(updated);
    } catch (error: any) {
      console.error("خطأ في تحديث الحدث:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
      }
      res.status(500).json({ message: "حدث خطأ في تحديث الحدث" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/calendar/:id - حذف حدث
  app.delete("/api/calendar/:id", requireAuth, requirePermission("calendar:delete"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      
      const event = await storage.getCalendarEventById(id);
      if (!event) {
        return res.status(404).json({ message: "الحدث غير موجود" });
      }

      await storage.deleteCalendarEvent(id);

      await logActivity({
        userId,
        action: 'calendar_event_deleted',
        entityType: 'calendar_event',
        entityId: id,
        oldValue: event
      });

      res.json({ success: true, message: "تم حذف الحدث بنجاح" });
    } catch (error) {
      console.error("خطأ في حذف الحدث:", error);
      res.status(500).json({ message: "حدث خطأ في حذف الحدث" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/calendar/:id/reminders - جلب التذكيرات
  app.get("/api/calendar/:id/reminders", async (req: any, res) => {
    try {
      const { id } = req.params;
      const reminders = await storage.getCalendarReminders(id);
      res.json(reminders);
    } catch (error) {
      console.error("خطأ في جلب التذكيرات:", error);
      res.status(500).json({ message: "حدث خطأ في جلب التذكيرات" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/calendar/:id/reminders - إضافة تذكير
  app.post("/api/calendar/:id/reminders", requireAuth, requirePermission("calendar:edit"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      
      const event = await storage.getCalendarEventById(id);
      if (!event) {
        return res.status(404).json({ message: "الحدث غير موجود" });
      }

      const validatedData = insertCalendarReminderSchema.parse({ ...req.body, eventId: id });
      const reminder = await storage.createCalendarReminder(validatedData as any);

      await logActivity({
        userId,
        action: 'calendar_reminder_created',
        entityType: 'calendar_reminder',
        entityId: reminder.id,
        newValue: reminder,
      });

      res.status(201).json(reminder);
    } catch (error: any) {
      console.error("خطأ في إضافة تذكير:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
      }
      res.status(500).json({ message: "حدث خطأ في إضافة التذكير" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/calendar/reminders/:id - حذف تذكير
  app.delete("/api/calendar/reminders/:id", requireAuth, requirePermission("calendar:edit"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      await storage.deleteCalendarReminder(id);

      await logActivity({
        userId,
        action: 'calendar_reminder_deleted',
        entityType: 'calendar_reminder',
        entityId: id
      });

      res.json({ success: true, message: "تم حذف التذكير بنجاح" });
    } catch (error) {
      console.error("خطأ في حذف التذكير:", error);
      res.status(500).json({ message: "حدث خطأ في حذف التذكير" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/calendar/:id/assignments - جلب المهام
  app.get("/api/calendar/:id/assignments", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const assignments = await storage.getCalendarAssignments({ eventId: id });
      res.json(assignments);
    } catch (error) {
      console.error("خطأ في جلب المهام:", error);
      res.status(500).json({ message: "حدث خطأ في جلب المهام" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/calendar/:id/assignments - تعيين مهمة
  app.post("/api/calendar/:id/assignments", requireAuth, requirePermission("calendar:assign_tasks"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      
      const event = await storage.getCalendarEventById(id);
      if (!event) {
        return res.status(404).json({ message: "الحدث غير موجود" });
      }

      const validatedData = insertCalendarAssignmentSchema.parse({
        ...req.body,
        eventId: id,
        assignedBy: userId,
        assignedAt: new Date()
      });

      const assignment = await storage.createCalendarAssignment(validatedData as any);

      // إرسال إشعار للمستخدم المعين
      if (assignment.userId) {
        await createNotification({
          type: 'NEW_ARTICLE',
          data: {
            articleId: id,
            articleTitle: event.title,
            articleSlug: id,
          },
        });
      }

      await logActivity({
        userId,
        action: 'calendar_assignment_created',
        entityType: 'calendar_assignment',
        entityId: assignment.id,
        newValue: assignment,
      });

      res.status(201).json(assignment);
    } catch (error: any) {
      console.error("خطأ في تعيين المهمة:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
      }
      res.status(500).json({ message: "حدث خطأ في تعيين المهمة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PATCH /api/calendar/assignments/:id - تحديث حالة المهمة
  app.patch("/api/calendar/assignments/:id", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      // requireAuth alone let any account — including a self-registered public
      // reader — retarget any newsroom coverage assignment.
      const access = await authorizeAssignmentWrite(userId, id);
      if (!access.ok) {
        return res.status(access.httpStatus).json({ message: access.message });
      }

      const validatedData = updateCalendarAssignmentSchema.parse(req.body);
      const updated = await storage.updateCalendarAssignment(id, validatedData as any);

      await logActivity({
        userId,
        action: 'calendar_assignment_updated',
        entityType: 'calendar_assignment',
        entityId: id,
        newValue: updated
      });

      res.json(updated);
    } catch (error: any) {
      console.error("خطأ في تحديث المهمة:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
      }
      res.status(500).json({ message: "حدث خطأ في تحديث المهمة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/calendar/assignments/:id/complete - إكمال المهمة
  app.post("/api/calendar/assignments/:id/complete", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      // Same gap as the PATCH sibling: anyone could close out anyone's coverage.
      const access = await authorizeAssignmentWrite(userId, id);
      if (!access.ok) {
        return res.status(access.httpStatus).json({ message: access.message });
      }

      const updated = await storage.completeCalendarAssignment(id);

      await logActivity({
        userId,
        action: 'calendar_assignment_completed',
        entityType: 'calendar_assignment',
        entityId: id,
        newValue: updated
      });

      res.json(updated);
    } catch (error) {
      console.error("خطأ في إكمال المهمة:", error);
      res.status(500).json({ message: "حدث خطأ في إكمال المهمة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/calendar/:id/ai-drafts - جلب المسودة الذكية
  app.get("/api/calendar/:id/ai-drafts", requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const draft = await storage.getCalendarAiDraft(id);
      
      if (!draft) {
        return res.status(404).json({ message: "لا توجد مسودة ذكية لهذا الحدث" });
      }
      
      res.json(draft);
    } catch (error) {
      console.error("خطأ في جلب المسودة الذكية:", error);
      res.status(500).json({ message: "حدث خطأ في جلب المسودة الذكية" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/calendar/:id/ai-drafts/generate - توليد مسودة ذكية
  app.post("/api/calendar/:id/ai-drafts/generate", requireAuth, requirePermission("calendar:generate_ai"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      
      const event = await storage.getCalendarEventById(id);
      if (!event) {
        return res.status(404).json({ message: "الحدث غير موجود" });
      }

      console.log(`[CalendarAI] Generating draft for event: ${event.title}`);
      
      // توليد المحتوى الذكي
      const aiDraft = await generateCalendarEventIdeas(
        event.title,
        event.description || '',
        event.type,
        event.dateStart
      );

      // حفظ أو تحديث المسودة
      const existingDraft = await storage.getCalendarAiDraft(id);
      
      let savedDraft;
      if (existingDraft) {
        savedDraft = await storage.updateCalendarAiDraft(id, {
          editorialIdeas: aiDraft.editorialIdeas,
          headlines: aiDraft.headlines as any,
          infographicData: aiDraft.infographicData,
          socialMedia: aiDraft.socialMedia,
          seo: aiDraft.seo as any,
        } as any);
      } else {
        savedDraft = await storage.createCalendarAiDraft({
          eventId: id,
          editorialIdeas: aiDraft.editorialIdeas,
          headlines: aiDraft.headlines as any,
          infographicData: aiDraft.infographicData,
          socialMedia: aiDraft.socialMedia,
          seo: aiDraft.seo as any,
        } as any);
      }

      await logActivity({
        userId,
        action: 'calendar_ai_draft_generated',
        entityType: 'calendar_ai_draft',
        entityId: savedDraft.id,
        newValue: savedDraft,
      });

      console.log(`[CalendarAI] Draft generated successfully for event: ${event.title}`);
      res.json(savedDraft);
    } catch (error: any) {
      console.error("خطأ في توليد المسودة الذكية:", error);
      res.status(500).json({ message: "حدث خطأ في توليد المسودة الذكية" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/calendar/:id/create-article-draft - إنشاء مسودة مقال من الحدث
  app.post("/api/calendar/:id/create-article-draft", requireAuth, requireAnyPermission("calendar:generate_ai", "articles:create"), async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const { selectedAngle } = req.body;
      
      if (!selectedAngle) {
        return res.status(400).json({ message: "يجب اختيار زاوية تحريرية" });
      }

      const event = await storage.getCalendarEventById(id);
      if (!event) {
        return res.status(404).json({ message: "الحدث غير موجود" });
      }

      console.log(`[CalendarAI] Creating article draft for event: ${event.title}, angle: ${selectedAngle}`);
      
      // توليد مسودة المقال
      const articleDraft = await generateArticleDraft(
        event.title,
        event.description || '',
        selectedAngle
      );

      // إنشاء مقال كمسودة
      const slug = articleDraft.title
        .toLowerCase()
        .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 100);

      const article = await storage.createArticle({
        title: articleDraft.title,
        slug: slug + '-' + Date.now(),
        content: articleDraft.content,
        excerpt: articleDraft.summary,
        authorId: userId,
        categoryId: event.categoryId || undefined,
        status: 'draft',
        tags: event.tags || [],
      } as any);

      // Invalidate caches when articles are created
      memoryCache.invalidatePattern('^homepage');
      memoryCache.invalidatePattern('^blocks:');
      memoryCache.invalidatePattern('^insights:');
      memoryCache.invalidatePattern('^opinion:');
      memoryCache.invalidatePattern('^trending');
      memoryCache.invalidatePattern('^article:detail:');
      memoryCache.invalidatePattern('^article:id:');
      memoryCache.invalidatePattern('^articles:');
      memoryCache.invalidatePattern('^sidebar:');

      await logActivity({
        userId,
        action: 'article_created_from_calendar',
        entityType: 'article',
        entityId: article.id,
        newValue: article,
      });

      console.log(`[CalendarAI] Article draft created: ${article.id}`);
      res.status(201).json({ article, draft: articleDraft });
    } catch (error: any) {
      console.error("خطأ في إنشاء مسودة المقال:", error);
      res.status(500).json({ message: "حدث خطأ في إنشاء مسودة المقال" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // ============================================================
  // END CALENDAR SYSTEM API ENDPOINTS
  // ============================================================
}
