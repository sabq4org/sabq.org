import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  opinionTickets,
  opinionTicketMessages,
  opinionTicketStatuses,
  roles,
  userRoles,
  users,
  type OpinionTicketStatus,
} from "@shared/schema";
import {
  countUnansweredTickets,
  isOpinionDeskViewer,
  shouldNotifyDeskOfTicketMessage,
} from "./opinionTicketNotice";
import { notifyDeskOfWriterInquiry } from "./opinionTicketNotifications";
import { clipDeskAlertExcerpt } from "./deskBotAlerts";

export const CONTRIBUTOR_ROLE_NAMES = new Set(["opinion_author", "angle_writer", "reporter"]);

export type TicketAuthorKind = "reporter" | "opinion_author" | "angle_writer" | "other";

export type OpinionTicketErrorCode =
  | "not_found"
  | "forbidden"
  | "ticket_closed"
  | "validation_error";

export class OpinionTicketServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: OpinionTicketErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OpinionTicketServiceError";
  }
}

export function fullName(first?: string | null, last?: string | null): string | null {
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function resolveAuthorKind(roleNames: Set<string>): TicketAuthorKind {
  if (roleNames.has("reporter")) return "reporter";
  if (roleNames.has("angle_writer")) return "angle_writer";
  if (roleNames.has("opinion_author")) return "opinion_author";
  return "other";
}

/**
 * Returns the union of the user's roles: the legacy `users.role` text column
 * AND any rows in `user_roles` joined through `roles`.
 */
export async function collectUserRoleNames(
  userId: string,
  legacyRole?: string | null,
): Promise<{ legacyRole: string | null; allRoles: Set<string> }> {
  let resolvedLegacy = legacyRole;
  if (resolvedLegacy === undefined) {
    const [u] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    resolvedLegacy = u?.role ?? null;
  }

  const all = new Set<string>();
  if (resolvedLegacy) all.add(resolvedLegacy);

  const rbacRows = await db
    .select({ roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  for (const r of rbacRows) all.add(r.roleName);
  return { legacyRole: resolvedLegacy ?? null, allRoles: all };
}

export async function getViewerTicketRoles(
  userId: string,
  legacyRole?: string | null,
): Promise<{
  isAdmin: boolean;
  isContributor: boolean;
  authorKind: TicketAuthorKind;
}> {
  if (!userId) {
    return { isAdmin: false, isContributor: false, authorKind: "other" };
  }
  const { legacyRole: effectiveLegacyRole, allRoles } = await collectUserRoleNames(
    userId,
    legacyRole,
  );
  const isAdmin = isOpinionDeskViewer(effectiveLegacyRole, [...allRoles]);
  let isContributor = false;
  for (const r of allRoles) {
    if (CONTRIBUTOR_ROLE_NAMES.has(r)) {
      isContributor = true;
      break;
    }
  }
  return {
    isAdmin,
    isContributor,
    authorKind: resolveAuthorKind(allRoles),
  };
}

export async function canUserViewOpinionDesk(
  userId: string,
  legacyRole?: string | null,
): Promise<boolean> {
  const { isAdmin } = await getViewerTicketRoles(userId, legacyRole);
  return isAdmin;
}

/** اتحاد أدوار كل مستخدم: عمود users.role + أدوار user_roles (RBAC). */
export async function roleNamesForUserIds(
  userIds: string[],
): Promise<Map<string, Set<string>>> {
  const byUser = new Map<string, Set<string>>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return byUser;

  const userRows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(inArray(users.id, unique));

  const rbacRows = await db
    .select({ userId: userRoles.userId, roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(inArray(userRoles.userId, unique));

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
  return byUser;
}

export async function authorKindsForUserIds(
  userIds: string[],
): Promise<Map<string, TicketAuthorKind>> {
  const map = new Map<string, TicketAuthorKind>();
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const byUser = await roleNamesForUserIds(unique);
  for (const id of unique) {
    map.set(id, resolveAuthorKind(byUser.get(id) ?? new Set()));
  }
  return map;
}

export async function listOpinionTickets(options: {
  viewerId: string;
  isAdmin: boolean;
  status?: string;
  writerId?: string;
  authorKind?: string;
  unread?: boolean;
  limit?: number;
}) {
  const conditions: SQL[] = [];
  if (!options.isAdmin) {
    conditions.push(eq(opinionTickets.writerId, options.viewerId));
  } else if (options.writerId) {
    conditions.push(eq(opinionTickets.writerId, options.writerId));
  }
  if (options.status && (opinionTicketStatuses as readonly string[]).includes(options.status)) {
    conditions.push(eq(opinionTickets.status, options.status));
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
      writerProfileImageUrl: users.profileImageUrl,
    })
    .from(opinionTickets)
    .leftJoin(users, eq(users.id, opinionTickets.writerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(opinionTickets.lastMessageAt));

  const kinds = await authorKindsForUserIds(rows.map((r) => r.writerId));

  // اتجاه التذكرة = مرسل أول رسالة: admin → صادرة منا، writer → واردة من المساهم.
  // ونلتقط كذلك آخر رسالة في التذكرة لمقتطف أحدث رسالة (latestMessageExcerpt).
  const initiatorByTicket = new Map<string, "admin" | "writer">();
  const latestMessageByTicket = new Map<string, string>();
  if (rows.length > 0) {
    const msgs = await db
      .select({
        ticketId: opinionTicketMessages.ticketId,
        senderRole: opinionTicketMessages.senderRole,
        message: opinionTicketMessages.message,
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
    for (const m of msgs) {
      if (!initiatorByTicket.has(m.ticketId)) {
        if (m.senderRole === "admin" || m.senderRole === "writer") {
          initiatorByTicket.set(m.ticketId, m.senderRole);
        }
      }
      if (typeof m.message === "string") {
        latestMessageByTicket.set(m.ticketId, clipDeskAlertExcerpt(m.message, 200));
      }
    }
  }

  let tickets = rows.map((row) => {
    const lastRead = options.isAdmin ? row.lastReadByAdminAt : row.lastReadByWriterAt;
    const hasUnread = !lastRead || (row.lastMessageAt && row.lastMessageAt > lastRead);
    const authorKind = kinds.get(row.writerId) ?? "other";
    const initiator = initiatorByTicket.get(row.id) ?? "writer";
    const writerName = fullName(row.writerFirstName, row.writerLastName);
    const latestMessageExcerpt = latestMessageByTicket.get(row.id) ?? null;
    const lastMessageAtIso = toIso(row.lastMessageAt);
    return {
      id: row.id,
      writerId: row.writerId,
      writerName,
      writerEmail: row.writerEmail,
      writerProfileImageUrl: row.writerProfileImageUrl ?? null,
      authorKind,
      writer: {
        id: row.writerId,
        name: writerName,
        email: row.writerEmail,
        profileImageUrl: row.writerProfileImageUrl ?? null,
        authorKind,
        roleKind: authorKind,
      },
      title: row.title,
      status: row.status,
      /** واردة من المساهم | صادرة من الإدارة */
      direction: initiator === "admin" ? ("outbound" as const) : ("inbound" as const),
      lastMessageAt: row.lastMessageAt,
      last_message_at: lastMessageAtIso,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      hasUnread: !!hasUnread,
      latestMessageExcerpt,
      latest_message_excerpt: latestMessageExcerpt,
    };
  });

  if (options.authorKind && options.authorKind !== "all") {
    tickets = tickets.filter((t) => t.authorKind === options.authorKind);
  }
  if (typeof options.unread === "boolean") {
    tickets = tickets.filter((t) => t.hasUnread === options.unread);
  }
  if (typeof options.limit === "number" && options.limit > 0) {
    tickets = tickets.slice(0, options.limit);
  }

  return tickets;
}

export async function getOpinionTicketsUnreadCounts(options: {
  viewerId: string;
  isAdmin: boolean;
}) {
  const conditions: SQL[] = [];
  if (!options.isAdmin) conditions.push(eq(opinionTickets.writerId, options.viewerId));

  const rows = await db
    .select({
      id: opinionTickets.id,
      status: opinionTickets.status,
      lastMessageAt: opinionTickets.lastMessageAt,
      lastReadByWriterAt: opinionTickets.lastReadByWriterAt,
      lastReadByAdminAt: opinionTickets.lastReadByAdminAt,
    })
    .from(opinionTickets)
    .where(conditions.length ? and(...conditions) : undefined);

  const unread = rows.filter((r) => {
    const lastRead = options.isAdmin ? r.lastReadByAdminAt : r.lastReadByWriterAt;
    return !lastRead || (r.lastMessageAt && r.lastMessageAt > lastRead);
  });

  return {
    unreadCount: unread.length,
    unansweredCount: countUnansweredTickets(rows),
  };
}

export async function createOpinionTicket(options: {
  actorId: string;
  actorFirstName?: string | null;
  actorLastName?: string | null;
  isAdmin: boolean;
  isContributor: boolean;
  authorKind?: TicketAuthorKind;
  title: string;
  message: string;
  writerId?: string;
}) {
  const now = new Date();
  let targetWriterId = options.actorId;
  let senderRole: "writer" | "admin" = "writer";
  let status: "open" | "answered" = "open";
  let lastReadByWriterAt: Date | null = now;
  let lastReadByAdminAt: Date | null = null;

  if (options.isAdmin && options.writerId) {
    const kinds = await authorKindsForUserIds([options.writerId]);
    const kind = kinds.get(options.writerId) ?? "other";
    if (kind === "other") {
      throw new OpinionTicketServiceError(
        400,
        "validation_error",
        "اختر زميلاً من منسوبي سبق: مراسل أو كاتب رأي أو كاتب زاوية",
      );
    }
    targetWriterId = options.writerId;
    senderRole = "admin";
    status = "answered";
    lastReadByWriterAt = null;
    lastReadByAdminAt = now;
  } else if (options.isAdmin && !options.isContributor) {
    throw new OpinionTicketServiceError(400, "validation_error", "اختر الزميل المستلم للرسالة");
  } else if (!options.isContributor) {
    throw new OpinionTicketServiceError(403, "forbidden", "Forbidden");
  }

  const [ticket] = await db
    .insert(opinionTickets)
    .values({
      writerId: targetWriterId,
      title: options.title,
      status,
      lastMessageAt: now,
      lastReadByWriterAt,
      lastReadByAdminAt,
    })
    .returning();

  await db.insert(opinionTicketMessages).values({
    ticketId: ticket.id,
    senderId: options.actorId,
    senderRole,
    message: options.message,
  });

  if (shouldNotifyDeskOfTicketMessage(senderRole)) {
    const writerName = fullName(options.actorFirstName, options.actorLastName);
    try {
      await notifyDeskOfWriterInquiry({
        kind: "new_ticket",
        ticketId: ticket.id,
        title: options.title,
        writerName,
        writerRole: options.authorKind && options.authorKind !== "other" ? options.authorKind : "writer",
        message: options.message,
        senderId: options.actorId,
        occurredAt: now,
      });
    } catch (notifyErr) {
      console.error("[opinion-tickets] notify failed", notifyErr);
    }
  }

  return ticket;
}

export async function listContributorWriters(queryText?: string) {
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

  const byId = new Map<
    string,
    { id: string; firstName: string | null; lastName: string | null; email: string | null }
  >();
  for (const row of [...byLegacy, ...byRbac]) {
    if (row.id) byId.set(row.id, row);
  }

  const ids = [...byId.keys()];
  const kinds = await authorKindsForUserIds(ids);
  const q = typeof queryText === "string" ? queryText.trim().toLowerCase() : "";

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
  return writers;
}

export async function getOpinionTicketWithMessages(options: {
  ticketId: string;
  viewerId: string;
  isAdmin: boolean;
}) {
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
      writerProfileImageUrl: users.profileImageUrl,
    })
    .from(opinionTickets)
    .leftJoin(users, eq(users.id, opinionTickets.writerId))
    .where(eq(opinionTickets.id, options.ticketId))
    .limit(1);

  if (!ticket) {
    throw new OpinionTicketServiceError(404, "not_found", "الاستفسار غير موجود");
  }
  if (!options.isAdmin && ticket.writerId !== options.viewerId) {
    throw new OpinionTicketServiceError(403, "forbidden", "Forbidden");
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

  const messages = messageRows.map((m) => {
    const senderName = fullName(m.senderFirstName, m.senderLastName);
    const createdAtIso = toIso(m.createdAt);
    return {
      id: m.id,
      ticketId: m.ticketId,
      senderId: m.senderId,
      senderRole: m.senderRole,
      role: m.senderRole,
      message: m.message,
      text: m.message,
      parentMessageId: m.parentMessageId,
      createdAt: createdAtIso ?? m.createdAt,
      created_at: createdAtIso,
      senderName,
    };
  });

  const now = new Date();
  if (options.isAdmin) {
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

  const writerName = fullName(ticket.writerFirstName, ticket.writerLastName);
  const ticketResp = {
    id: ticket.id,
    writerId: ticket.writerId,
    title: ticket.title,
    status: ticket.status,
    lastMessageAt: ticket.lastMessageAt,
    last_message_at: toIso(ticket.lastMessageAt),
    createdAt: ticket.createdAt,
    created_at: toIso(ticket.createdAt),
    updatedAt: ticket.updatedAt,
    updated_at: toIso(ticket.updatedAt),
    writerName,
    writerEmail: ticket.writerEmail,
    writerProfileImageUrl: ticket.writerProfileImageUrl ?? null,
    authorKind,
    writer: {
      id: ticket.writerId,
      name: writerName,
      email: ticket.writerEmail,
      profileImageUrl: ticket.writerProfileImageUrl ?? null,
      authorKind,
      roleKind: authorKind,
    },
  };

  return { ticket: ticketResp, messages };
}

export async function appendOpinionTicketMessage(options: {
  ticketId: string;
  senderId: string;
  senderFirstName?: string | null;
  senderLastName?: string | null;
  isAdmin: boolean;
  authorKind?: TicketAuthorKind;
  message: string;
  parentMessageId?: string | null;
  /** When true (e.g. Bot Desk API), always post as editorial desk ("admin"). */
  forceAdminRole?: boolean;
}) {
  const [ticket] = await db
    .select()
    .from(opinionTickets)
    .where(eq(opinionTickets.id, options.ticketId))
    .limit(1);
  if (!ticket) {
    throw new OpinionTicketServiceError(404, "not_found", "الاستفسار غير موجود");
  }
  if (!options.isAdmin && ticket.writerId !== options.senderId) {
    throw new OpinionTicketServiceError(403, "forbidden", "Forbidden");
  }
  if (ticket.status === "closed") {
    throw new OpinionTicketServiceError(400, "ticket_closed", "تم إغلاق هذا الاستفسار");
  }

  if (options.parentMessageId) {
    const [parent] = await db
      .select({ id: opinionTicketMessages.id, ticketId: opinionTicketMessages.ticketId })
      .from(opinionTicketMessages)
      .where(eq(opinionTicketMessages.id, options.parentMessageId))
      .limit(1);
    if (!parent || parent.ticketId !== ticket.id) {
      throw new OpinionTicketServiceError(400, "validation_error", "رسالة الأصل غير صالحة");
    }
  }

  const now = new Date();
  const senderRole: "writer" | "admin" = options.forceAdminRole
    ? "admin"
    : ticket.writerId === options.senderId
      ? "writer"
      : options.isAdmin
        ? "admin"
        : "writer";

  const [msg] = await db
    .insert(opinionTicketMessages)
    .values({
      ticketId: ticket.id,
      senderId: options.senderId,
      senderRole,
      message: options.message,
      parentMessageId: options.parentMessageId ?? null,
    })
    .returning();

  const updates: Partial<typeof opinionTickets.$inferInsert> = {
    lastMessageAt: now,
    updatedAt: now,
  };
  let nextStatus = ticket.status;
  if (senderRole === "admin") {
    updates.lastReadByAdminAt = now;
    if (ticket.status === "open") {
      updates.status = "answered";
      nextStatus = "answered";
    }
  } else {
    updates.lastReadByWriterAt = now;
    if (ticket.status === "answered") {
      updates.status = "open";
      nextStatus = "open";
    }
  }
  await db.update(opinionTickets).set(updates).where(eq(opinionTickets.id, ticket.id));

  if (shouldNotifyDeskOfTicketMessage(senderRole)) {
    const writerName = fullName(options.senderFirstName, options.senderLastName);
    try {
      await notifyDeskOfWriterInquiry({
        kind: "writer_message",
        ticketId: ticket.id,
        title: ticket.title,
        writerName,
        writerRole: options.authorKind && options.authorKind !== "other" ? options.authorKind : "writer",
        message: options.message,
        senderId: options.senderId,
        occurredAt: now,
      });
    } catch (notifyErr) {
      console.error("[opinion-tickets] notify failed", notifyErr);
    }
  }

  return {
    message: msg,
    previousStatus: ticket.status,
    status: nextStatus,
  };
}

export async function updateOpinionTicketStatus(options: {
  ticketId: string;
  status: OpinionTicketStatus;
}) {
  const [updated] = await db
    .update(opinionTickets)
    .set({ status: options.status, updatedAt: new Date() })
    .where(eq(opinionTickets.id, options.ticketId))
    .returning();

  if (!updated) {
    throw new OpinionTicketServiceError(404, "not_found", "الاستفسار غير موجود");
  }
  return updated;
}
