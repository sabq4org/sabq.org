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
 *   - Admins (SUPERUSER_ROLE_NAMES, or editor — via isOpinionDeskViewer): all tickets + إرسال رسالة صادرة لزميل.
 *     صف user_roles إداري لحساب users.role فيه قارئ لا يُحتسب.
 */

import { Router, type Response, type NextFunction } from "express";
import {
  insertOpinionTicketSchema,
  insertOpinionTicketMessageSchema,
  updateOpinionTicketStatusSchema,
} from "@shared/schema";
import {
  OpinionTicketServiceError,
  appendOpinionTicketMessage,
  createOpinionTicket,
  getOpinionTicketWithMessages,
  getOpinionTicketsUnreadCounts,
  getViewerTicketRoles,
  listContributorWriters,
  listOpinionTickets,
  updateOpinionTicketStatus,
  type TicketAuthorKind,
} from "../services/opinionTicketsService";

export type { TicketAuthorKind };

const router = Router();

function requireAuth(req: any, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.() || !req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

/**
 * GET /api/opinion-tickets
 * Writer  → own tickets only
 * Admin   → all tickets, optional filters: writerId, status, authorKind
 */
router.get("/api/opinion-tickets", requireAuth, async (req: any, res: Response) => {
  try {
    const { isAdmin: admin, isContributor } = await getViewerTicketRoles(
      req.user.id,
      req.user?.role,
    );
    if (!admin && !isContributor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const writerFilter =
      admin && typeof req.query.writerId === "string" ? req.query.writerId : undefined;
    const kindFilter =
      admin && typeof req.query.authorKind === "string" ? req.query.authorKind : undefined;

    const tickets = await listOpinionTickets({
      viewerId: req.user.id,
      isAdmin: admin,
      status,
      writerId: writerFilter,
      authorKind: kindFilter,
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
    const { isAdmin: admin, isContributor } = await getViewerTicketRoles(
      req.user.id,
      req.user?.role,
    );
    if (!admin && !isContributor) {
      return res.json({ unreadCount: 0 });
    }

    const counts = await getOpinionTicketsUnreadCounts({
      viewerId: req.user.id,
      isAdmin: admin,
    });
    return res.json(counts);
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
    const { isAdmin: admin, isContributor, authorKind } = await getViewerTicketRoles(
      req.user.id,
      req.user?.role,
    );
    if (!admin && !isContributor) {
      return res.status(403).json({
        message: "هذه الميزة متاحة للمراسلين وكتّاب الرأي والزوايا وإدارة التحرير فقط",
      });
    }
    const parsed = insertOpinionTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات غير صالحة", errors: parsed.error.flatten() });
    }

    const ticket = await createOpinionTicket({
      actorId: req.user.id,
      actorFirstName: req.user.firstName,
      actorLastName: req.user.lastName,
      isAdmin: admin,
      isContributor,
      authorKind,
      title: parsed.data.title,
      message: parsed.data.message,
      writerId: parsed.data.writerId,
    });

    return res.status(201).json({ ticket });
  } catch (err) {
    if (err instanceof OpinionTicketServiceError) {
      return res.status(err.status).json({ message: err.message });
    }
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
    const { isAdmin: admin } = await getViewerTicketRoles(req.user.id, req.user?.role);
    if (!admin) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const writers = await listContributorWriters(q);
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
    const { isAdmin: admin, isContributor } = await getViewerTicketRoles(
      req.user.id,
      req.user?.role,
    );
    if (!admin && !isContributor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const detail = await getOpinionTicketWithMessages({
      ticketId: req.params.id,
      viewerId: req.user.id,
      isAdmin: admin,
    });
    return res.json(detail);
  } catch (err) {
    if (err instanceof OpinionTicketServiceError) {
      return res.status(err.status).json({ message: err.message });
    }
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
    const { isAdmin: admin, isContributor, authorKind } = await getViewerTicketRoles(
      req.user.id,
      req.user?.role,
    );
    if (!admin && !isContributor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const parsed = insertOpinionTicketMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات غير صالحة", errors: parsed.error.flatten() });
    }

    const result = await appendOpinionTicketMessage({
      ticketId: req.params.id,
      senderId: req.user.id,
      senderFirstName: req.user.firstName,
      senderLastName: req.user.lastName,
      isAdmin: admin,
      authorKind,
      message: parsed.data.message,
      parentMessageId: parsed.data.parentMessageId ?? null,
    });

    return res.status(201).json({ message: result.message });
  } catch (err) {
    if (err instanceof OpinionTicketServiceError) {
      return res.status(err.status).json({ message: err.message });
    }
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
    const { isAdmin: admin } = await getViewerTicketRoles(req.user.id, req.user?.role);
    if (!admin) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const parsed = updateOpinionTicketStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "حالة غير صالحة" });
    }

    const updated = await updateOpinionTicketStatus({
      ticketId: req.params.id,
      status: parsed.data.status,
    });
    return res.json({ ticket: updated });
  } catch (err) {
    if (err instanceof OpinionTicketServiceError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error("[opinion-tickets] status error", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
