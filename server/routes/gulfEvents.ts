import type { Express, Response } from "express";
import { db } from "../db";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import {
  gulfEvents,
  gulfEventLogs,
  insertGulfEventSchema,
  updateGulfEventSchema,
} from "@shared/schema";
import { requireAuth, requirePermission, requireRole } from "../rbac";
import { memoryCache } from "../memoryCache";
import { paginationOrReject } from "../utils/pagination";

// SSE broadcasting removed — clients now poll /api/gulf-events to avoid
// long-lived connections pinning Autoscale instances awake.
function broadcastGulfEvent(_data: any) {
  // no-op retained for call-site compatibility
}

async function logAction(eventId: string, action: string, editorId: string, editorName: string, details?: string) {
  await db.insert(gulfEventLogs).values({ eventId, action, editorId, editorName, details });
}

export function registerGulfEventRoutes(app: Express) {

  // SSE stream removed. Clients should poll /api/gulf-events instead.
  app.get("/api/gulf-events/stream", (_req, res) => {
    res.status(410).json({
      message: "SSE stream disabled. Poll /api/gulf-events instead.",
    });
  });

  app.get("/api/gulf-events", async (req, res) => {
    try {
      const { country } = req.query;
      const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path }, res, { defaultLimit: 100, maxLimit: 200 });
      if (!pg) return;
      const conditions = [eq(gulfEvents.status, "published")];
      if (country && country !== "all") {
        conditions.push(eq(gulfEvents.country, country as string));
      }

      const events = await db
        .select()
        .from(gulfEvents)
        .where(and(...conditions))
        .orderBy(desc(gulfEvents.isPinned), desc(gulfEvents.publishedAt))
        .limit(pg.limit)
        .offset(pg.offset);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(gulfEvents)
        .where(and(...conditions));

      res.json({ events, total: Number(countResult?.count || 0) });
    } catch (error) {
      console.error("[GulfEvents] Error fetching events:", error);
      res.status(500).json({ message: "فشل في جلب الأحداث" });
    }
  });

  app.get("/api/gulf-events/stats", async (_req, res) => {
    try {
      const stats = await db
        .select({
          country: gulfEvents.country,
          eventType: gulfEvents.eventType,
          count: sql<number>`count(*)`,
        })
        .from(gulfEvents)
        .where(eq(gulfEvents.status, "published"))
        .groupBy(gulfEvents.country, gulfEvents.eventType);

      let totalAttacks = 0;
      let intercepted = 0;
      let droneIntercepted = 0;
      let ballisticIntercepted = 0;
      let cruiseIntercepted = 0;
      let debris = 0;
      let injuries = 0;
      let martyrdom = 0;
      const byCountry: Record<string, number> = {};

      for (const row of stats) {
        const c = Number(row.count);
        totalAttacks += c;
        byCountry[row.country] = (byCountry[row.country] || 0) + c;
        if (["drone_intercepted", "ballistic_intercepted", "cruise_intercepted", "ballistic_and_drone"].includes(row.eventType)) intercepted += c;
        if (row.eventType === "drone_intercepted") droneIntercepted += c;
        if (row.eventType === "ballistic_intercepted") ballisticIntercepted += c;
        if (row.eventType === "cruise_intercepted") cruiseIntercepted += c;
        if (row.eventType === "ballistic_and_drone") { ballisticIntercepted += c; droneIntercepted += c; }
        if (row.eventType === "debris_fallen") debris += c;
        if (row.eventType === "injuries") injuries += c;
        if (row.eventType === "martyrdom") martyrdom += c;
      }

      res.json({ totalAttacks, intercepted, droneIntercepted, ballisticIntercepted, cruiseIntercepted, debris, injuries, martyrdom, byCountry });
    } catch (error) {
      console.error("[GulfEvents] Error fetching stats:", error);
      res.status(500).json({ message: "فشل في جلب الإحصائيات" });
    }
  });

  app.get("/api/gulf-events/latest", async (req, res) => {
    try {
      const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path }, res, { defaultLimit: 3, maxLimit: 10 });
      if (!pg) return;
      const limit = pg.limit;
      const cacheKey = `gulf-events:latest:${limit}`;
      const cached = memoryCache.get<any[]>(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const events = await db
        .select()
        .from(gulfEvents)
        .where(eq(gulfEvents.status, "published"))
        .orderBy(desc(gulfEvents.isPinned), desc(gulfEvents.publishedAt))
        .limit(limit);

      memoryCache.set(cacheKey, events, 120000);
      res.json(events);
    } catch (error) {
      console.error("[GulfEvents] Error fetching latest:", error);
      res.status(500).json({ message: "فشل في جلب آخر الأحداث" });
    }
  });

  app.get("/api/gulf-events/:id", async (req, res) => {
    try {
      const [event] = await db.select().from(gulfEvents).where(and(eq(gulfEvents.id, req.params.id), eq(gulfEvents.status, "published"))).limit(1);
      if (!event) return res.status(404).json({ message: "الحدث غير موجود" });

      const updates = await db
        .select()
        .from(gulfEvents)
        .where(and(eq(gulfEvents.parentEventId, event.id), eq(gulfEvents.status, "published")))
        .orderBy(desc(gulfEvents.publishedAt));

      res.json({ ...event, updates });
    } catch (error) {
      console.error("[GulfEvents] Error fetching event:", error);
      res.status(500).json({ message: "فشل في جلب الحدث" });
    }
  });

  app.post("/api/admin/gulf-events", requireAuth, requireRole("admin", "editor", "content_manager"), async (req: any, res) => {
    try {
      const body = { ...req.body, authorId: req.user.id };
      if (body.publishedAt && typeof body.publishedAt === "string" && body.publishedAt.trim()) {
        body.publishedAt = new Date(body.publishedAt);
      } else {
        body.publishedAt = new Date();
      }
      const parsed = insertGulfEventSchema.parse(body);

      const [event] = await db.insert(gulfEvents).values(parsed).returning();

      await logAction(event.id, "create", req.user.id, req.user.firstName || req.user.username, `نشر حدث: ${event.content.slice(0, 60)}`);

      broadcastGulfEvent({ type: "new_event", event });
      res.status(201).json(event);
    } catch (error) {
      console.error("[GulfEvents] Error creating event:", error);
      res.status(500).json({ message: "فشل في إنشاء الحدث" });
    }
  });

  app.patch("/api/admin/gulf-events/:id", requireAuth, requireRole("admin", "editor", "content_manager"), async (req: any, res) => {
    try {
      const body = { ...req.body };
      delete body.publishedAt;

      const parsed = updateGulfEventSchema.parse(body);
      delete (parsed as any).publishedAt;

      const [event] = await db
        .update(gulfEvents)
        .set({ ...parsed, editedAt: new Date(), updatedAt: new Date() })
        .where(eq(gulfEvents.id, req.params.id))
        .returning();

      if (!event) return res.status(404).json({ message: "الحدث غير موجود" });

      await logAction(event.id, "update", req.user.id, req.user.firstName || req.user.username, `تعديل حدث`);

      broadcastGulfEvent({ type: "update_event", event });
      res.json(event);
    } catch (error) {
      console.error("[GulfEvents] Error updating event:", error);
      res.status(500).json({ message: "فشل في تعديل الحدث" });
    }
  });

  app.patch("/api/admin/gulf-events/:id/pin", requireAuth, requireRole("admin", "editor", "content_manager"), async (req: any, res) => {
    try {
      const [existing] = await db.select({ isPinned: gulfEvents.isPinned }).from(gulfEvents).where(eq(gulfEvents.id, req.params.id)).limit(1);
      if (!existing) return res.status(404).json({ message: "الحدث غير موجود" });

      const [event] = await db
        .update(gulfEvents)
        .set({ isPinned: !existing.isPinned, updatedAt: new Date() })
        .where(eq(gulfEvents.id, req.params.id))
        .returning();

      await logAction(event.id, event.isPinned ? "pin" : "unpin", req.user.id, req.user.firstName || req.user.username);

      broadcastGulfEvent({ type: "update_event", event });
      res.json(event);
    } catch (error) {
      console.error("[GulfEvents] Error toggling pin:", error);
      res.status(500).json({ message: "فشل في تثبيت/إلغاء تثبيت الحدث" });
    }
  });

  app.delete("/api/admin/gulf-events/:id", requireAuth, requireRole("admin", "editor", "content_manager"), async (req: any, res) => {
    try {
      const [event] = await db
        .update(gulfEvents)
        .set({ status: "deleted", updatedAt: new Date() })
        .where(eq(gulfEvents.id, req.params.id))
        .returning();

      if (!event) return res.status(404).json({ message: "الحدث غير موجود" });

      await logAction(event.id, "delete", req.user.id, req.user.firstName || req.user.username, `حذف حدث`);

      broadcastGulfEvent({ type: "delete_event", eventId: event.id });
      res.json({ message: "تم حذف الحدث" });
    } catch (error) {
      console.error("[GulfEvents] Error deleting event:", error);
      res.status(500).json({ message: "فشل في حذف الحدث" });
    }
  });

  app.get("/api/admin/gulf-events/logs", requireAuth, requireRole("admin", "editor", "content_manager"), async (req: any, res) => {
    try {
      const { eventId } = req.query;
      const conditions = eventId ? [eq(gulfEventLogs.eventId, eventId as string)] : [];

      const logs = await db
        .select()
        .from(gulfEventLogs)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(gulfEventLogs.createdAt))
        .limit(100);

      res.json(logs);
    } catch (error) {
      console.error("[GulfEvents] Error fetching logs:", error);
      res.status(500).json({ message: "فشل في جلب السجلات" });
    }
  });

  app.get("/api/admin/gulf-events/drafts", requireAuth, requireRole("admin", "editor", "content_manager"), async (req: any, res) => {
    try {
      const drafts = await db
        .select()
        .from(gulfEvents)
        .where(eq(gulfEvents.status, "draft"))
        .orderBy(desc(gulfEvents.createdAt))
        .limit(50);

      res.json(drafts);
    } catch (error) {
      console.error("[GulfEvents] Error fetching drafts:", error);
      res.status(500).json({ message: "فشل في جلب المسودات" });
    }
  });

  app.get("/api/gulf-events/daily-summary", async (req, res) => {
    try {
      const date = req.query.date as string || new Date().toISOString().split("T")[0];
      const startOfDay = new Date(`${date}T00:00:00Z`);
      const endOfDay = new Date(`${date}T23:59:59Z`);

      const events = await db
        .select({
          country: gulfEvents.country,
          eventType: gulfEvents.eventType,
          count: sql<number>`count(*)`,
        })
        .from(gulfEvents)
        .where(and(
          eq(gulfEvents.status, "published"),
          sql`${gulfEvents.publishedAt} >= ${startOfDay}`,
          sql`${gulfEvents.publishedAt} <= ${endOfDay}`,
        ))
        .groupBy(gulfEvents.country, gulfEvents.eventType);

      let attempts = 0;
      let intercepted = 0;
      let debris = 0;
      let injuries = 0;
      const countries = new Set<string>();

      for (const row of events) {
        const c = Number(row.count);
        attempts += c;
        countries.add(row.country);
        if (["drone_intercepted", "ballistic_intercepted", "cruise_intercepted"].includes(row.eventType)) intercepted += c;
        if (row.eventType === "debris_fallen") debris += c;
        if (row.eventType === "injuries") injuries += c;
      }

      res.json({ date, attempts, intercepted, debris, injuries, countries: Array.from(countries) });
    } catch (error) {
      console.error("[GulfEvents] Error fetching daily summary:", error);
      res.status(500).json({ message: "فشل في جلب ملخص اليوم" });
    }
  });
}
