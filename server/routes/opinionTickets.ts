/**
 * Opinion writer ↔ editorial ticket endpoints.
 *
 *   GET    /api/opinion-tickets                       list tickets (writer: own; admin: all)
 *   POST   /api/opinion-tickets                       writer creates new ticket (title + first message)
 *   GET    /api/opinion-tickets/unread-count          unread count for current viewer (for badges)
 *   GET    /api/opinion-tickets/:id                   thread (messages + ticket); marks read
 *   POST   /api/opinion-tickets/:id/messages          append message (any participant)
 *   PATCH  /api/opinion-tickets/:id/status            admin only: change ticket status
 *
 * Access model:
 *   - Writers (role: opinion_author) can only see and act on their own tickets.
 *   - Admins (SUPERUSER_ROLE_NAMES, or editor) can see and act on every ticket.
 *
 * The same writer-side / admin-side branching used elsewhere
 * (server/routes.ts opinion-author/*) is repeated here — role is read off
 * the users.role text column to stay compatible with admin accounts that
 * have no user_roles entry.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  opinionTickets,
  opinionTicketMessages,
  users,
  insertOpinionTicketSchema,
  insertOpinionTicketMessageSchema,
  updateOpinionTicketStatusSchema,
  opinionTicketStatuses,
} from "@shared/schema";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";

const router = Router();

const ADMIN_ROLES = new Set<string>([
  ...SUPERUSER_ROLE_NAMES,
  "editor",
]);

function requireAuth(req: any, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function isAdmin(req: any): boolean {
  return ADMIN_ROLES.has(req.user?.role ?? "");
}

function isOpinionWriter(req: any): boolean {
  return req.user?.role === "opinion_author";
}

function fullName(first?: string | null, last?: string | null): string | null {
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || null;
}

/**
 * GET /api/opinion-tickets
 * Writer  → own tickets only
 * Admin   → all tickets, optional filters: writerId, status
 */
router.get("/api/opinion-tickets", requireAuth, async (req: any, res: Response) => {
  try {
    const admin = isAdmin(req);
    const writer = isOpinionWriter(req);
    if (!admin && !writer) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const writerFilter = admin && typeof req.query.writerId === "string" ? req.query.writerId : undefined;

    const conditions = [] as any[];
    if (!admin) {
      conditions.push(eq(opinionTickets.writerId, req.user.id));
    } else if (writerFilter) {
      conditions.push(eq(opinionTickets.writerId, writerFilter));
    }
    if (status && (opinionTicketStatuses as readonly string[]).includes(status)) {
      conditions.push(eq(opinionTickets.status, status));
    }

    const rows = await db
      .select({
        id: opinionTickets.id,
        writerId: opinionTickets.writerId,
        title: opinionTickets.title,
        status: opinionTickets.status,
        lastMessageAt: opinionTickets.lastMessageAt,
        lastReadByWriterAt: opinionTickets.lastReadByWriterAt,
        lastReadByAdminAt: opinionTickets.lastReadByAdminAt,
        createdAt: opinionTickets.createdAt,
        updatedAt: opinionTickets.updatedAt,
        writerFirstName: users.firstName,
        writerLastName: users.lastName,
        writerEmail: users.email,
      })
      .from(opinionTickets)
      .leftJoin(users, eq(users.id, opinionTickets.writerId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(opinionTickets.lastMessageAt));

    const tickets = rows.map((row) => {
      const lastRead = admin ? row.lastReadByAdminAt : row.lastReadByWriterAt;
      const hasUnread = !lastRead || (row.lastMessageAt && row.lastMessageAt > lastRead);
      return {
        id: row.id,
        writerId: row.writerId,
        writerName: fullName(row.writerFirstName, row.writerLastName),
        writerEmail: row.writerEmail,
        title: row.title,
        status: row.status,
        lastMessageAt: row.lastMessageAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        hasUnread: !!hasUnread,
      };
    });

    return res.json({ tickets });
  } catch (err) {
    console.error("[opinion-tickets] list error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /api/opinion-tickets/unread-count
 * Writer  → number of own tickets with new admin replies since last read
 * Admin   → number of tickets with new writer activity since last admin read
 */
router.get("/api/opinion-tickets/unread-count", requireAuth, async (req: any, res: Response) => {
  try {
    const admin = isAdmin(req);
    const writer = isOpinionWriter(req);
    if (!admin && !writer) {
      return res.json({ unreadCount: 0 });
    }

    const conditions: any[] = [];
    if (!admin) conditions.push(eq(opinionTickets.writerId, req.user.id));

    const rows = await db
      .select({
        id: opinionTickets.id,
        lastMessageAt: opinionTickets.lastMessageAt,
        lastReadByWriterAt: opinionTickets.lastReadByWriterAt,
        lastReadByAdminAt: opinionTickets.lastReadByAdminAt,
      })
      .from(opinionTickets)
      .where(conditions.length ? and(...conditions) : undefined);

    const unread = rows.filter((r) => {
      const lastRead = admin ? r.lastReadByAdminAt : r.lastReadByWriterAt;
      return !lastRead || (r.lastMessageAt && r.lastMessageAt > lastRead);
    });

    return res.json({ unreadCount: unread.length });
  } catch (err) {
    console.error("[opinion-tickets] unread-count error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/opinion-tickets
 * Writers create a new ticket with title + initial message body.
 */
router.post("/api/opinion-tickets", requireAuth, async (req: any, res: Response) => {
  try {
    if (!isOpinionWriter(req)) {
      return res.status(403).json({ message: "هذه الميزة متاحة لكتّاب الرأي فقط" });
    }
    const parsed = insertOpinionTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات غير صالحة", errors: parsed.error.flatten() });
    }

    const now = new Date();
    const [ticket] = await db
      .insert(opinionTickets)
      .values({
        writerId: req.user.id,
        title: parsed.data.title,
        status: "open",
        lastMessageAt: now,
        // writer has just sent the first message, so consider it read by them
        lastReadByWriterAt: now,
      })
      .returning();

    await db.insert(opinionTicketMessages).values({
      ticketId: ticket.id,
      senderId: req.user.id,
      senderRole: "writer",
      message: parsed.data.message,
    });

    return res.status(201).json({ ticket });
  } catch (err) {
    console.error("[opinion-tickets] create error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /api/opinion-tickets/:id
 * Returns the ticket + all its messages and marks the thread as read for
 * the current viewer.
 */
router.get("/api/opinion-tickets/:id", requireAuth, async (req: any, res: Response) => {
  try {
    const admin = isAdmin(req);
    const writer = isOpinionWriter(req);
    if (!admin && !writer) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const [ticket] = await db
      .select({
        id: opinionTickets.id,
        writerId: opinionTickets.writerId,
        title: opinionTickets.title,
        status: opinionTickets.status,
        lastMessageAt: opinionTickets.lastMessageAt,
        createdAt: opinionTickets.createdAt,
        updatedAt: opinionTickets.updatedAt,
        writerFirstName: users.firstName,
        writerLastName: users.lastName,
        writerEmail: users.email,
      })
      .from(opinionTickets)
      .leftJoin(users, eq(users.id, opinionTickets.writerId))
      .where(eq(opinionTickets.id, req.params.id))
      .limit(1);

    if (!ticket) {
      return res.status(404).json({ message: "الاستفسار غير موجود" });
    }
    if (!admin && ticket.writerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const messageRows = await db
      .select({
        id: opinionTicketMessages.id,
        ticketId: opinionTicketMessages.ticketId,
        senderId: opinionTicketMessages.senderId,
        senderRole: opinionTicketMessages.senderRole,
        message: opinionTicketMessages.message,
        parentMessageId: opinionTicketMessages.parentMessageId,
        createdAt: opinionTicketMessages.createdAt,
        senderFirstName: users.firstName,
        senderLastName: users.lastName,
      })
      .from(opinionTicketMessages)
      .leftJoin(users, eq(users.id, opinionTicketMessages.senderId))
      .where(eq(opinionTicketMessages.ticketId, ticket.id))
      .orderBy(asc(opinionTicketMessages.createdAt));

    const messages = messageRows.map((m) => ({
      id: m.id,
      ticketId: m.ticketId,
      senderId: m.senderId,
      senderRole: m.senderRole,
      message: m.message,
      parentMessageId: m.parentMessageId,
      createdAt: m.createdAt,
      senderName: fullName(m.senderFirstName, m.senderLastName),
    }));

    // Mark thread as read for the current viewer
    const now = new Date();
    if (admin) {
      await db
        .update(opinionTickets)
        .set({ lastReadByAdminAt: now })
        .where(eq(opinionTickets.id, ticket.id));
    } else {
      await db
        .update(opinionTickets)
        .set({ lastReadByWriterAt: now })
        .where(eq(opinionTickets.id, ticket.id));
    }

    const ticketResp = {
      id: ticket.id,
      writerId: ticket.writerId,
      title: ticket.title,
      status: ticket.status,
      lastMessageAt: ticket.lastMessageAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      writerName: fullName(ticket.writerFirstName, ticket.writerLastName),
      writerEmail: ticket.writerEmail,
    };

    return res.json({ ticket: ticketResp, messages });
  } catch (err) {
    console.error("[opinion-tickets] detail error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * POST /api/opinion-tickets/:id/messages
 * Both the ticket owner and any admin can append messages. An admin reply
 * moves status from "open" → "answered" automatically (unless the ticket
 * is already closed). A writer reply on an "answered" ticket moves it
 * back to "open" so admins notice it again.
 */
router.post("/api/opinion-tickets/:id/messages", requireAuth, async (req: any, res: Response) => {
  try {
    const admin = isAdmin(req);
    const writer = isOpinionWriter(req);
    if (!admin && !writer) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const parsed = insertOpinionTicketMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات غير صالحة", errors: parsed.error.flatten() });
    }

    const [ticket] = await db
      .select()
      .from(opinionTickets)
      .where(eq(opinionTickets.id, req.params.id))
      .limit(1);
    if (!ticket) return res.status(404).json({ message: "الاستفسار غير موجود" });
    if (!admin && ticket.writerId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (ticket.status === "closed") {
      return res.status(400).json({ message: "تم إغلاق هذا الاستفسار" });
    }

    // Validate parentMessageId belongs to the same ticket if provided
    if (parsed.data.parentMessageId) {
      const [parent] = await db
        .select({ id: opinionTicketMessages.id, ticketId: opinionTicketMessages.ticketId })
        .from(opinionTicketMessages)
        .where(eq(opinionTicketMessages.id, parsed.data.parentMessageId))
        .limit(1);
      if (!parent || parent.ticketId !== ticket.id) {
        return res.status(400).json({ message: "رسالة الأصل غير صالحة" });
      }
    }

    const now = new Date();
    const senderRole = admin ? "admin" : "writer";

    const [msg] = await db
      .insert(opinionTicketMessages)
      .values({
        ticketId: ticket.id,
        senderId: req.user.id,
        senderRole,
        message: parsed.data.message,
        parentMessageId: parsed.data.parentMessageId ?? null,
      })
      .returning();

    // Update ticket: bump lastMessageAt and adjust status + read-marker for sender
    const updates: Partial<typeof opinionTickets.$inferInsert> = {
      lastMessageAt: now,
      updatedAt: now,
    };
    if (senderRole === "admin") {
      updates.lastReadByAdminAt = now;
      if (ticket.status === "open") updates.status = "answered";
    } else {
      updates.lastReadByWriterAt = now;
      if (ticket.status === "answered") updates.status = "open";
    }
    await db.update(opinionTickets).set(updates).where(eq(opinionTickets.id, ticket.id));

    return res.status(201).json({ message: msg });
  } catch (err) {
    console.error("[opinion-tickets] reply error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * PATCH /api/opinion-tickets/:id/status
 * Admin only — open / answered / closed.
 */
router.patch("/api/opinion-tickets/:id/status", requireAuth, async (req: any, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const parsed = updateOpinionTicketStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "حالة غير صالحة" });
    }

    const [updated] = await db
      .update(opinionTickets)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(opinionTickets.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ message: "الاستفسار غير موجود" });
    return res.json({ ticket: updated });
  } catch (err) {
    console.error("[opinion-tickets] status error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /api/opinion-tickets/writers/list
 * Admin only — list of opinion writers (for the filter dropdown).
 */
router.get("/api/opinion-tickets/writers/list", requireAuth, async (req: any, res: Response) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    // Only writers who have at least one ticket
    const rows = await db
      .selectDistinct({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(opinionTickets)
      .leftJoin(users, eq(users.id, opinionTickets.writerId));
    const writers = rows
      .filter((r) => r.id != null)
      .map((r) => ({
        id: r.id as string,
        name: fullName(r.firstName, r.lastName),
        email: r.email,
      }));
    return res.json({ writers });
  } catch (err) {
    console.error("[opinion-tickets] writers error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
