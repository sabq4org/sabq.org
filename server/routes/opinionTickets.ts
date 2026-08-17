/**
 * Contributor ↔ editorial ticket endpoints (كتّاب الرأي / الزوايا / المراسلون).
 * جدول واحد `opinion_tickets` — لا نموذج منفصل للمراسل.
 *
 *   GET    /api/opinion-tickets                       list tickets (contributor: own; admin: all)
 *   POST   /api/opinion-tickets                       contributor inbound OR admin outbound (writerId)
 *   GET    /api/opinion-tickets/unread-count
 *   GET    /api/opinion-tickets/writers/list           admin — كل المنسوبين المساهمين
 *   GET    /api/opinion-tickets/:id
 *   POST   /api/opinion-tickets/:id/messages
 *   PATCH  /api/opinion-tickets/:id/status            admin only
 *
 * Access:
 *   - Contributors (opinion_author, angle_writer, reporter): own tickets only.
 *   - Admins (SUPERUSER_ROLE_NAMES, or editor): all tickets + إرسال رسالة صادرة لزميل.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  opinionTickets,
  opinionTicketMessages,
  users,
  roles,
  userRoles,
  insertOpinionTicketSchema,
  insertOpinionTicketMessageSchema,
  updateOpinionTicketStatusSchema,
  opinionTicketStatuses,
} from "@shared/schema";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";

const router = Router();

const ADMIN_ROLE_NAMES = new Set<string>([
  ...SUPERUSER_ROLE_NAMES,
  "editor",
]);

/** من يستطيع فتح استفسار والرد عليه (نفس الصندوق). */
const CONTRIBUTOR_ROLE_NAMES = new Set(["opinion_author", "angle_writer", "reporter"]);

export type TicketAuthorKind = "reporter" | "opinion_author" | "angle_writer" | "other";

function requireAuth(req: any, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

/**
 * Returns the union of the user's roles: the legacy `users.role` text column
 * AND any rows in `user_roles` joined through `roles`.
 */
async function collectUserRoleNames(userId: string, legacyRole?: string | null): Promise<Set<string>> {
  const all = new Set<string>();
  if (legacyRole) all.add(legacyRole);

  const rbacRows = await db
    .select({ roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  for (const r of rbacRows) all.add(r.roleName);
  return all;
}

function resolveAuthorKind(roleNames: Set<string>): TicketAuthorKind {
  if (roleNames.has("reporter")) return "reporter";
  if (roleNames.has("angle_writer")) return "angle_writer";
  if (roleNames.has("opinion_author")) return "opinion_author";
  return "other";
}

async function getViewerRoles(req: any): Promise<{ isAdmin: boolean; isContributor: boolean }> {
  const userId = req.user?.id;
  if (!userId) return { isAdmin: false, isContributor: false };

  const all = await collectUserRoleNames(userId, req.user?.role);

  let isAdmin = false;
  for (const r of all) if (ADMIN_ROLE_NAMES.has(r)) { isAdmin = true; break; }
  let isContributor = false;
  for (const r of all) if (CONTRIBUTOR_ROLE_NAMES.has(r)) { isContributor = true; break; }
  return { isAdmin, isContributor };
}

async function authorKindsForUserIds(userIds: string[]): Promise<Map<string, TicketAuthorKind>> {
  const map = new Map<string, TicketAuthorKind>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const userRows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(inArray(users.id, unique));

  const rbacRows = await db
    .select({ userId: userRoles.userId, roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(inArray(userRoles.userId, unique));

  const byUser = new Map<string, Set<string>>();
  for (const u of userRows) {
    const set = byUser.get(u.id) ?? new Set<string>();
    if (u.role) set.add(u.role);
    byUser.set(u.id, set);
  }
  for (const r of rbacRows) {
    const set = byUser.get(r.userId) ?? new Set<string>();
    set.add(r.roleName);
    byUser.set(r.userId, set);
  }
  for (const id of unique) {
    map.set(id, resolveAuthorKind(byUser.get(id) ?? new Set()));
  }
  return map;
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
    const { isAdmin: admin, isContributor } = await getViewerRoles(req);
    if (!admin && !isContributor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const writerFilter = admin && typeof req.query.writerId === "string" ? req.query.writerId : undefined;
    const kindFilter = admin && typeof req.query.authorKind === "string" ? req.query.authorKind : undefined;

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

    const kinds = await authorKindsForUserIds(rows.map((r) => r.writerId));

    // اتجاه التذكرة = مرسل أول رسالة: admin → صادرة منا، writer → واردة من المساهم.
    const initiatorByTicket = new Map<string, "admin" | "writer">();
    if (rows.length > 0) {
      const firstMsgs = await db
        .select({
          ticketId: opinionTicketMessages.ticketId,
          senderRole: opinionTicketMessages.senderRole,
          createdAt: opinionTicketMessages.createdAt,
        })
        .from(opinionTicketMessages)
        .where(
          inArray(
            opinionTicketMessages.ticketId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(asc(opinionTicketMessages.createdAt));
      for (const m of firstMsgs) {
        if (initiatorByTicket.has(m.ticketId)) continue;
        if (m.senderRole === "admin" || m.senderRole === "writer") {
          initiatorByTicket.set(m.ticketId, m.senderRole);
        }
      }
    }

    const tickets = rows
      .map((row) => {
        const lastRead = admin ? row.lastReadByAdminAt : row.lastReadByWriterAt;
        const hasUnread = !lastRead || (row.lastMessageAt && row.lastMessageAt > lastRead);
        const authorKind = kinds.get(row.writerId) ?? "other";
        const initiator = initiatorByTicket.get(row.id) ?? "writer";
        return {
          id: row.id,
          writerId: row.writerId,
          writerName: fullName(row.writerFirstName, row.writerLastName),
          writerEmail: row.writerEmail,
          authorKind,
          title: row.title,
          status: row.status,
          /** واردة من المساهم | صادرة من الإدارة */
          direction: initiator === "admin" ? ("outbound" as const) : ("inbound" as const),
          lastMessageAt: row.lastMessageAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          hasUnread: !!hasUnread,
        };
      })
      .filter((t) => !kindFilter || kindFilter === "all" || t.authorKind === kindFilter);

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
    const { isAdmin: admin, isContributor } = await getViewerRoles(req);
    if (!admin && !isContributor) {
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
 * - مساهم: تذكرة واردة (writerId = نفسه).
 * - أدمن: تذكرة صادرة باختيار `writerId` (مراسل / كاتب رأي / زاوية).
 */
router.post("/api/opinion-tickets", requireAuth, async (req: any, res: Response) => {
  try {
    const { isAdmin: admin, isContributor } = await getViewerRoles(req);
    if (!admin && !isContributor) {
      return res.status(403).json({ message: "هذه الميزة متاحة للمراسلين وكتّاب الرأي والزوايا وإدارة التحرير فقط" });
    }
    const parsed = insertOpinionTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات غير صالحة", errors: parsed.error.flatten() });
    }

    const now = new Date();
    let targetWriterId = req.user.id as string;
    let senderRole: "writer" | "admin" = "writer";
    let status: "open" | "answered" = "open";
    let lastReadByWriterAt: Date | null = now;
    let lastReadByAdminAt: Date | null = null;

    if (admin && parsed.data.writerId) {
      const kinds = await authorKindsForUserIds([parsed.data.writerId]);
      const kind = kinds.get(parsed.data.writerId) ?? "other";
      if (kind === "other") {
        return res.status(400).json({
          message: "اختر زميلاً من منسوبي سبق: مراسل أو كاتب رأي أو كاتب زاوية",
        });
      }
      targetWriterId = parsed.data.writerId;
      senderRole = "admin";
      // صادرة من الإدارة: تُحسب مجابة حتى يرد المساهم، وغير مقروءة لديه.
      status = "answered";
      lastReadByWriterAt = null;
      lastReadByAdminAt = now;
    } else if (admin && !isContributor) {
      return res.status(400).json({ message: "اختر الزميل المستلم للرسالة" });
    } else if (!isContributor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const [ticket] = await db
      .insert(opinionTickets)
      .values({
        writerId: targetWriterId,
        title: parsed.data.title,
        status,
        lastMessageAt: now,
        lastReadByWriterAt,
        lastReadByAdminAt,
      })
      .returning();

    await db.insert(opinionTicketMessages).values({
      ticketId: ticket.id,
      senderId: req.user.id,
      senderRole,
      message: parsed.data.message,
    });

    return res.status(201).json({ ticket });
  } catch (err) {
    console.error("[opinion-tickets] create error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/**
 * GET /api/opinion-tickets/writers/list
 * Admin only — كل المنسوبين المساهمين (مراسل / كاتب رأي / زاوية)، لا من لديهم تذاكر فقط.
 * اختياري: ?q= للبحث بالاسم أو البريد. قبل :id حتى لا يُلتقط كمعرّف تذكرة.
 */
router.get("/api/opinion-tickets/writers/list", requireAuth, async (req: any, res: Response) => {
  try {
    const { isAdmin: admin } = await getViewerRoles(req);
    if (!admin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const contributorRoles = [...CONTRIBUTOR_ROLE_NAMES];
    const byLegacy = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(and(inArray(users.role, contributorRoles), eq(users.status, "active")));

    const byRbac = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(inArray(roles.name, contributorRoles), eq(users.status, "active")));

    const byId = new Map<string, { id: string; firstName: string | null; lastName: string | null; email: string | null }>();
    for (const row of [...byLegacy, ...byRbac]) {
      if (row.id) byId.set(row.id, row);
    }

    const ids = [...byId.keys()];
    const kinds = await authorKindsForUserIds(ids);
    const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

    let writers = ids.map((id) => {
      const r = byId.get(id)!;
      return {
        id,
        name: fullName(r.firstName, r.lastName),
        email: r.email,
        authorKind: kinds.get(id) ?? ("other" as TicketAuthorKind),
      };
    });

    writers = writers.filter((w) => w.authorKind !== "other");
    if (q) {
      writers = writers.filter((w) => {
        const hay = `${w.name ?? ""} ${w.email ?? ""}`.toLowerCase();
        return hay.includes(q);
      });
    }
    writers.sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", "ar"));

    return res.json({ writers });
  } catch (err) {
    console.error("[opinion-tickets] writers error", err);
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
    const { isAdmin: admin, isContributor } = await getViewerRoles(req);
    if (!admin && !isContributor) {
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

    const kinds = await authorKindsForUserIds([ticket.writerId]);
    const authorKind = kinds.get(ticket.writerId) ?? "other";

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
      authorKind,
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
    const { isAdmin: admin, isContributor } = await getViewerRoles(req);
    if (!admin && !isContributor) {
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
    // If the viewer is the ticket's writer, they reply as the writer even
    // when they also have admin role. Admins reply as "admin" on others' tickets.
    const senderRole = ticket.writerId === req.user.id ? "writer" : admin ? "admin" : "writer";

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
    const { isAdmin: admin } = await getViewerRoles(req);
    if (!admin) {
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

export default router;
