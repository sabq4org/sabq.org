/**
 * Realtime chat REST endpoints (1-to-1 conversations between staff).
 *
 *   GET    /api/chat/conversations                    list my conversations
 *   POST   /api/chat/conversations                    initiate (requires chat.manage)
 *   GET    /api/chat/conversations/:id/messages       paginated history (cursor)
 *   POST   /api/chat/conversations/:id/messages       send (text + optional attachments)
 *   POST   /api/chat/conversations/:id/read           mark as read
 *   POST   /api/chat/upload-image                     upload to Cloudflare Images
 *   GET    /api/chat/staff                            searchable staff list (chat.use users)
 *
 * Sending publishes to chatBus → server/chat/websocketServer.ts pushes to
 * both participants' open sockets. The sender gets the new message back
 * via the HTTP response AND via the WS broadcast (deduped by clientId on
 * the frontend), so the experience stays consistent even across tabs.
 */
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { and, desc, eq, ilike, inArray, lt, ne, or } from "drizzle-orm";
import { db } from "../db";
import {
  chatConversations,
  chatMessages,
  chatMessageAttachments,
  chatPresence,
  roles,
  userRoles,
  users,
} from "@shared/schema";
import { userHasPermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { chatBus } from "../chat/chatBus";
import { isUserOnline } from "../chat/websocketServer";
import { cloudflareImagesService } from "../services/cloudflareImagesService";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per image
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new Error("Only image uploads are allowed"));
  },
});

function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

/**
 * Permission check that bridges the two RBAC layers in this codebase:
 * the DB tables (authoritative) AND the hardcoded ROLE_PERMISSIONS_MAP
 * in shared/rbac-constants.ts. The chat permissions (chat.use,
 * chat.manage) are new and not yet seeded into the DB, so we ALSO honor
 * the role-based grant — admins, editors, content managers, reporters
 * etc. get chat.use; admins/content_managers get chat.manage.
 *
 * Without this fallback, every non-superuser staff member would 403 on
 * every chat endpoint, because `userHasPermission` only consults the DB.
 */
const CHAT_USE_ROLES = [
  "system_admin",
  "admin",
  "editor",
  "content_manager",
  "reporter",
  "opinion_author",
  "comments_moderator",
  "media_manager",
];
const CHAT_MANAGE_ROLES = ["system_admin", "admin", "editor", "content_manager"];

function roleGrantsPermission(role: string | undefined, code: string): boolean {
  if (!role) return false;
  if (code === PERMISSION_CODES.CHAT_USE) return CHAT_USE_ROLES.includes(role);
  if (code === PERMISSION_CODES.CHAT_MANAGE) return CHAT_MANAGE_ROLES.includes(role);
  return false;
}

async function requirePerm(req: any, res: any, code: string): Promise<boolean> {
  // Fast path: user's text-column role implicitly grants this permission.
  if (roleGrantsPermission(req.user?.role, code)) return true;
  // Fallback to the DB-backed check (handles user_roles + overrides).
  const ok = await userHasPermission(req.user.id, code);
  if (!ok) {
    res.status(403).json({ message: "Permission denied" });
    return false;
  }
  return true;
}

function formatUserName(u: { firstName: string | null; lastName: string | null; email: string | null }): string {
  const composed = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return composed || u.email || "مستخدم";
}

const VALID_PRESENCE_STATUSES = ["available", "busy", "away", "invisible"] as const;
type PresenceStatus = (typeof VALID_PRESENCE_STATUSES)[number];

// Don't let an unmigrated chat_presence table kill the chat. If the table is
// missing OR the query errors for any other reason, fall back to "everyone is
// available" — the rest of the chat keeps working, status picker just won't
// have a value to display until the migration is applied.
let _presenceTableWarnedOnce = false;
async function loadPresenceMap(userIds: string[]): Promise<Map<string, PresenceStatus>> {
  if (userIds.length === 0) return new Map();
  try {
    const rows = await db
      .select()
      .from(chatPresence)
      .where(inArray(chatPresence.userId, userIds));
    const map = new Map<string, PresenceStatus>();
    for (const r of rows) {
      if ((VALID_PRESENCE_STATUSES as readonly string[]).includes(r.status)) {
        map.set(r.userId, r.status as PresenceStatus);
      }
    }
    return map;
  } catch (err: any) {
    if (!_presenceTableWarnedOnce) {
      _presenceTableWarnedOnce = true;
      console.warn(
        `[chat] presence lookup failed (continuing with defaults): ${err?.message || err}. ` +
        `If you see "relation chat_presence does not exist", run the migration SQL.`,
      );
    }
    return new Map();
  }
}

// "invisible" appears offline to OTHER users (own UI still shows reality).
// effectiveOnline = WS connected AND not invisible.
function effectivePresence(userId: string, status: PresenceStatus | undefined) {
  const status_ = status ?? "available";
  const onlineReal = isUserOnline(userId);
  const onlinePublic = onlineReal && status_ !== "invisible";
  return { status: status_, online: onlinePublic };
}

// ============================================================================
// GET /api/chat/conversations — my conversations, ordered by lastMessageAt
// ============================================================================
router.get("/api/chat/conversations", requireAuth, async (req: any, res) => {
  try {
    if (!(await requirePerm(req, res, PERMISSION_CODES.CHAT_USE))) return;
    const me = req.user.id;

    // Pull my conversations (no join — we fetch the other-side user info
    // separately in a second query to sidestep aliasing complexity).
    const convs = await db
      .select()
      .from(chatConversations)
      .where(
        or(
          eq(chatConversations.initiatorId, me),
          eq(chatConversations.participantId, me),
        ),
      )
      .orderBy(desc(chatConversations.lastMessageAt))
      .limit(200);

    if (convs.length === 0) {
      return res.json({ conversations: [] });
    }

    // Collect every "other user" id from the conversation set.
    const otherIds = Array.from(
      new Set(convs.map((c) => (c.initiatorId === me ? c.participantId : c.initiatorId))),
    );

    const otherUsers = otherIds.length
      ? await db
          .select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            profileImageUrl: users.profileImageUrl,
            role: users.role,
          })
          .from(users)
          .where(inArray(users.id, otherIds))
      : [];
    const usersById = new Map(otherUsers.map((u) => [u.id, u]));
    const presenceByUserId = await loadPresenceMap(otherIds);

    const shaped = convs.map((c) => {
      const isInitiator = c.initiatorId === me;
      const otherId = isInitiator ? c.participantId : c.initiatorId;
      const other = usersById.get(otherId);
      const myLastReadAt = isInitiator ? c.initiatorLastReadAt : c.participantLastReadAt;
      const partnerLastReadAt = isInitiator ? c.participantLastReadAt : c.initiatorLastReadAt;
      const hasUnread =
        !!c.lastMessageAt &&
        (!myLastReadAt || c.lastMessageAt > myLastReadAt);
      const presence = effectivePresence(otherId, presenceByUserId.get(otherId));
      return {
        id: c.id,
        otherUser: other
          ? {
              id: other.id,
              name: formatUserName(other),
              avatarUrl: other.profileImageUrl,
              role: other.role,
              online: presence.online,
              status: presence.status,
            }
          : { id: otherId, name: "مستخدم", avatarUrl: null, role: null, online: false, status: "available" as PresenceStatus },
        lastMessagePreview: c.lastMessagePreview,
        lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
        hasUnread,
        partnerLastReadAt: partnerLastReadAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      };
    });

    res.json({ conversations: shaped });
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error("[chat] GET conversations error:", msg);
    // Friendlier error when the migration hasn't been applied yet.
    if (msg.includes("chat_conversations") && msg.includes("does not exist")) {
      return res.status(503).json({
        message: "جداول الدردشة غير موجودة بعد — شغّل `npm run db:push` لتطبيق المخطط",
      });
    }
    res.status(500).json({ message: "Failed to load conversations" });
  }
});

// ============================================================================
// POST /api/chat/conversations — create or fetch a 1-to-1 conversation
// ============================================================================
const createConversationSchema = z.object({
  participantId: z.string().min(1),
});

router.post("/api/chat/conversations", requireAuth, async (req: any, res) => {
  try {
    if (!(await requirePerm(req, res, PERMISSION_CODES.CHAT_MANAGE))) return;
    const me = req.user.id;
    const body = createConversationSchema.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: "بيانات غير صحيحة" });
    }
    const { participantId } = body.data;
    if (participantId === me) {
      return res.status(400).json({ message: "لا يمكن بدء محادثة مع نفسك" });
    }

    // Confirm participant exists and has chat.use
    const [target] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, participantId))
      .limit(1);
    if (!target) return res.status(404).json({ message: "المستخدم غير موجود" });
    // Eligible if either path 1 (text role) OR path 2 (RBAC user_roles).
    let eligible = isChatEligibleRole(target.role);
    if (!eligible) {
      const [rbacRow] = await db
        .select({ name: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(
          and(
            eq(userRoles.userId, target.id),
            inArray(roles.name, STAFF_ROLES_FOR_CHAT),
          ),
        )
        .limit(1);
      eligible = !!rbacRow;
    }
    if (!eligible) {
      return res.status(403).json({ message: "هذا المستخدم لا يملك صلاحية الدردشة" });
    }

    // Find existing conversation in either direction (me/them OR them/me)
    const [existing] = await db
      .select()
      .from(chatConversations)
      .where(
        or(
          and(
            eq(chatConversations.initiatorId, me),
            eq(chatConversations.participantId, participantId),
          ),
          and(
            eq(chatConversations.initiatorId, participantId),
            eq(chatConversations.participantId, me),
          ),
        ),
      )
      .limit(1);

    let conversationId: string;
    if (existing) {
      conversationId = existing.id;
    } else {
      const [created] = await db
        .insert(chatConversations)
        .values({ initiatorId: me, participantId })
        .returning();
      conversationId = created.id;

      // Notify both ends of the new conversation
      chatBus.publish({
        type: "conversation:new",
        conversationId,
        recipientIds: [me, participantId],
        payload: {
          id: conversationId,
          otherUserId: participantId,
        },
      });
    }

    const presenceMap = await loadPresenceMap([target.id]);
    const presence = effectivePresence(target.id, presenceMap.get(target.id));
    res.json({
      id: conversationId,
      otherUser: {
        id: target.id,
        name: formatUserName(target),
        avatarUrl: target.profileImageUrl,
        role: target.role,
        online: presence.online,
        status: presence.status,
      },
    });
  } catch (err) {
    console.error("[chat] POST conversations error:", err);
    res.status(500).json({ message: "Failed to create conversation" });
  }
});

// ============================================================================
// GET /api/chat/conversations/:id/messages?before=<iso>&limit=50
// ============================================================================
router.get("/api/chat/conversations/:id/messages", requireAuth, async (req: any, res) => {
  try {
    if (!(await requirePerm(req, res, PERMISSION_CODES.CHAT_USE))) return;
    const me = req.user.id;
    const conversationId = req.params.id;

    const [conv] = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    if (!conv) return res.status(404).json({ message: "المحادثة غير موجودة" });
    if (conv.initiatorId !== me && conv.participantId !== me) {
      return res.status(403).json({ message: "ليس لديك صلاحية الوصول لهذه المحادثة" });
    }

    const limit = Math.min(parseInt(String(req.query.limit) || "50", 10) || 50, 100);
    const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;

    const conditions = [eq(chatMessages.conversationId, conversationId)];
    if (before && !isNaN(before.getTime())) {
      conditions.push(lt(chatMessages.createdAt, before));
    }

    const messageRows = await db
      .select()
      .from(chatMessages)
      .where(and(...conditions))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);

    const messageIds = messageRows.map((m) => m.id);
    const attachments = messageIds.length
      ? await db
          .select()
          .from(chatMessageAttachments)
          .where(inArray(chatMessageAttachments.messageId, messageIds))
      : [];
    const attachmentsByMessageId = new Map<string, typeof attachments>();
    for (const a of attachments) {
      const list = attachmentsByMessageId.get(a.messageId) ?? [];
      list.push(a);
      attachmentsByMessageId.set(a.messageId, list);
    }

    const shaped = messageRows
      .reverse() // oldest → newest within the page
      .map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        senderId: m.senderId,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        editedAt: m.editedAt?.toISOString() ?? null,
        attachments: (attachmentsByMessageId.get(m.id) ?? []).map((a) => ({
          id: a.id,
          kind: a.kind,
          url: a.url,
          thumbnailUrl: a.thumbnailUrl,
          width: a.width,
          height: a.height,
          mimeType: a.mimeType,
        })),
      }));

    res.json({
      messages: shaped,
      hasMore: messageRows.length >= limit,
    });
  } catch (err) {
    console.error("[chat] GET messages error:", err);
    res.status(500).json({ message: "Failed to load messages" });
  }
});

// ============================================================================
// POST /api/chat/conversations/:id/messages
// ============================================================================
const sendMessageSchema = z.object({
  body: z.string().max(8000).default(""),
  attachments: z
    .array(
      z.object({
        kind: z.literal("image"),
        url: z.string().url(),
        thumbnailUrl: z.string().url().optional().nullable(),
        width: z.number().int().positive().optional().nullable(),
        height: z.number().int().positive().optional().nullable(),
        sizeBytes: z.number().int().nonnegative().optional().nullable(),
        mimeType: z.string().max(80).optional().nullable(),
      }),
    )
    .max(6)
    .optional(),
  clientId: z.string().max(80).optional(), // round-trips back so the sender can match optimistic
});

router.post("/api/chat/conversations/:id/messages", requireAuth, async (req: any, res) => {
  try {
    if (!(await requirePerm(req, res, PERMISSION_CODES.CHAT_USE))) return;
    const me = req.user.id;
    const conversationId = req.params.id;

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات غير صحيحة" });
    }
    const { body, attachments = [], clientId } = parsed.data;
    const trimmed = body.trim();
    if (!trimmed && attachments.length === 0) {
      return res.status(400).json({ message: "الرسالة فارغة" });
    }

    const [conv] = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    if (!conv) return res.status(404).json({ message: "المحادثة غير موجودة" });
    if (conv.initiatorId !== me && conv.participantId !== me) {
      return res.status(403).json({ message: "ليس لديك صلاحية إرسال رسالة في هذه المحادثة" });
    }

    const now = new Date();
    const [created] = await db
      .insert(chatMessages)
      .values({
        conversationId,
        senderId: me,
        body: trimmed,
        hasAttachment: attachments.length > 0,
        createdAt: now,
      })
      .returning();

    let insertedAttachments: any[] = [];
    if (attachments.length > 0) {
      insertedAttachments = await db
        .insert(chatMessageAttachments)
        .values(
          attachments.map((a) => ({
            messageId: created.id,
            kind: a.kind,
            url: a.url,
            thumbnailUrl: a.thumbnailUrl ?? null,
            width: a.width ?? null,
            height: a.height ?? null,
            sizeBytes: a.sizeBytes ?? null,
            mimeType: a.mimeType ?? null,
          })),
        )
        .returning();
    }

    // Update conversation summary + clear sender's "unread" since they obviously read up to now.
    const preview = trimmed
      ? trimmed.slice(0, 160)
      : insertedAttachments.length === 1
        ? "📷 صورة"
        : `📷 ${insertedAttachments.length} صور`;
    const isInitiator = conv.initiatorId === me;
    await db
      .update(chatConversations)
      .set({
        lastMessageAt: now,
        lastMessagePreview: preview,
        ...(isInitiator
          ? { initiatorLastReadAt: now }
          : { participantLastReadAt: now }),
      })
      .where(eq(chatConversations.id, conversationId));

    const messagePayload = {
      id: created.id,
      conversationId,
      senderId: me,
      body: trimmed,
      createdAt: now.toISOString(),
      clientId,
      attachments: insertedAttachments.map((a) => ({
        id: a.id,
        kind: a.kind,
        url: a.url,
        thumbnailUrl: a.thumbnailUrl,
        width: a.width,
        height: a.height,
        mimeType: a.mimeType,
      })),
    };

    chatBus.publish({
      type: "message:new",
      conversationId,
      recipientIds: [conv.initiatorId, conv.participantId],
      payload: messagePayload,
    });

    res.json({ message: messagePayload });
  } catch (err) {
    console.error("[chat] POST message error:", err);
    res.status(500).json({ message: "Failed to send message" });
  }
});

// ============================================================================
// POST /api/chat/conversations/:id/read
// ============================================================================
router.post("/api/chat/conversations/:id/read", requireAuth, async (req: any, res) => {
  try {
    if (!(await requirePerm(req, res, PERMISSION_CODES.CHAT_USE))) return;
    const me = req.user.id;
    const conversationId = req.params.id;

    const [conv] = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    if (!conv) return res.status(404).json({ message: "المحادثة غير موجودة" });
    if (conv.initiatorId !== me && conv.participantId !== me) {
      return res.status(403).json({ message: "ليس لديك صلاحية" });
    }

    const now = new Date();
    const isInitiator = conv.initiatorId === me;
    await db
      .update(chatConversations)
      .set(isInitiator ? { initiatorLastReadAt: now } : { participantLastReadAt: now })
      .where(eq(chatConversations.id, conversationId));

    chatBus.publish({
      type: "message:read",
      conversationId,
      recipientIds: [isInitiator ? conv.participantId : conv.initiatorId],
      payload: {
        conversationId,
        readerId: me,
        readAt: now.toISOString(),
      },
    });

    res.json({ ok: true, readAt: now.toISOString() });
  } catch (err) {
    console.error("[chat] POST read error:", err);
    res.status(500).json({ message: "Failed to mark as read" });
  }
});

// ============================================================================
// POST /api/chat/upload-image — multipart form upload to Cloudflare Images
// ============================================================================
router.post("/api/chat/upload-image", requireAuth, upload.single("file"), async (req: any, res) => {
  try {
    if (!(await requirePerm(req, res, PERMISSION_CODES.CHAT_USE))) return;
    if (!req.file) return res.status(400).json({ message: "لم يتم اختيار صورة" });

    if (!cloudflareImagesService.isCloudflareConfigured()) {
      return res.status(503).json({
        message: "خدمة الصور غير مفعّلة على الخادم — لا يمكن رفع الصور حالياً",
      });
    }

    const result = await cloudflareImagesService.uploadToCloudflare(
      req.file.buffer,
      req.file.originalname || `chat-${Date.now()}.jpg`,
      { source: "chat", userId: req.user.id },
      req.file.mimetype,
    );

    if (!result.success || !result.deliveryUrl) {
      return res.status(502).json({
        message: result.error || "تعذّر رفع الصورة",
      });
    }

    res.json({
      url: result.deliveryUrl,
      thumbnailUrl: result.deliveryUrl, // CF Images delivery URL supports variant resizing on read
      sizeBytes: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (err: any) {
    console.error("[chat] upload error:", err);
    res.status(500).json({ message: err?.message || "Failed to upload image" });
  }
});

// ============================================================================
// GET /api/chat/staff?q=... — staff search for the user picker.
//
// We use the user's role (text column on users.role) as the proxy for
// "this person can use chat". Reason: the sabq RBAC has two layers — the
// DB tables (authoritative) and the hardcoded ROLE_PERMISSIONS_MAP in
// shared/rbac-constants.ts. The DB doesn't have `chat.use` rows yet (it
// would need a seed migration), but ROLE_PERMISSIONS_MAP grants it to
// every staff role. Filtering by role here keeps the picker responsive and
// matches the user-facing intent without requiring a separate seed step.
// ============================================================================
const STAFF_ROLES_FOR_CHAT = [
  "system_admin",
  "admin",
  "editor",
  "content_manager",
  "reporter",
  "opinion_author",
  "comments_moderator",
  "media_manager",
];

function isChatEligibleRole(role: string | null | undefined): boolean {
  return !!role && STAFF_ROLES_FOR_CHAT.includes(role);
}

router.get("/api/chat/staff", requireAuth, async (req: any, res) => {
  try {
    if (!(await requirePerm(req, res, PERMISSION_CODES.CHAT_MANAGE))) return;
    const me = req.user.id;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    // In this codebase a user's "role" can live in two places:
    //   1. users.role (legacy text column — admins almost always set this)
    //   2. user_roles → roles (RBAC join — most non-admin staff use this)
    // We need to return users qualifying via EITHER path, or the picker
    // shows only admins (which is what was happening).
    //
    // Strategy: pull staff via users.role in one query, pull staff via the
    // RBAC join in a second query, merge and dedupe.

    const searchClause = q
      ? or(
          ilike(users.firstName, `%${q}%`),
          ilike(users.lastName, `%${q}%`),
          ilike(users.email, `%${q}%`),
        )
      : undefined;

    // Path 1: users.role matches a staff role directly.
    const byTextRole = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
      })
      .from(users)
      .where(
        and(
          ne(users.id, me),
          inArray(users.role, STAFF_ROLES_FOR_CHAT),
          searchClause as any,
        ),
      )
      .limit(80);

    // Path 2: user_roles links to a roles.name in our staff list.
    const byRbac = await db
      .selectDistinct({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
        roleName: roles.name,
      })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          ne(users.id, me),
          inArray(roles.name, STAFF_ROLES_FOR_CHAT),
          searchClause as any,
        ),
      )
      .limit(80);

    // Merge — prefer the displayed role to be the more specific one (RBAC
    // role if available, else the text column).
    const byId = new Map<string, any>();
    for (const u of byTextRole) {
      byId.set(u.id, {
        id: u.id,
        name: formatUserName(u),
        avatarUrl: u.profileImageUrl,
        role: u.role,
      });
    }
    for (const u of byRbac) {
      const existing = byId.get(u.id);
      const displayRole = u.roleName || u.role || existing?.role || null;
      byId.set(u.id, {
        id: u.id,
        name: formatUserName(u),
        avatarUrl: u.profileImageUrl,
        role: displayRole,
      });
    }

    const merged = Array.from(byId.values());
    const presenceMap = await loadPresenceMap(merged.map((u) => u.id));

    const staff = merged
      .map((u) => {
        const p = effectivePresence(u.id, presenceMap.get(u.id));
        return { ...u, online: p.online, status: p.status };
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"))
      .slice(0, 50);

    res.json({ staff });
  } catch (err: any) {
    console.error("[chat] GET staff error:", err?.message || err);
    res.status(500).json({ message: "Failed to load staff list" });
  }
});

// ============================================================================
// GET /api/chat/me/presence — my current presence
// PUT /api/chat/me/presence — set my presence (broadcasts to all my partners)
// ============================================================================
router.get("/api/chat/me/presence", requireAuth, async (req: any, res) => {
  try {
    if (!(await requirePerm(req, res, PERMISSION_CODES.CHAT_USE))) return;
    const me = req.user.id;
    try {
      const [row] = await db
        .select()
        .from(chatPresence)
        .where(eq(chatPresence.userId, me))
        .limit(1);
      return res.json({
        status: (row?.status as PresenceStatus) ?? "available",
        statusMessage: row?.statusMessage ?? null,
        online: isUserOnline(me),
      });
    } catch (innerErr: any) {
      // Table likely missing — degrade gracefully so the picker still loads.
      const msg = innerErr?.message || String(innerErr);
      if (msg.includes("chat_presence") && msg.includes("does not exist")) {
        return res.json({ status: "available", statusMessage: null, online: isUserOnline(me) });
      }
      throw innerErr;
    }
  } catch (err: any) {
    console.error("[chat] GET presence error:", err?.message || err);
    res.status(500).json({ message: "Failed to load presence" });
  }
});

const updatePresenceSchema = z.object({
  status: z.enum(["available", "busy", "away", "invisible"]),
  statusMessage: z.string().max(160).optional().nullable(),
});

router.put("/api/chat/me/presence", requireAuth, async (req: any, res) => {
  try {
    if (!(await requirePerm(req, res, PERMISSION_CODES.CHAT_USE))) return;
    const me = req.user.id;
    const parsed = updatePresenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "حالة غير صحيحة" });
    const { status, statusMessage } = parsed.data;

    try {
      await db
        .insert(chatPresence)
        .values({ userId: me, status, statusMessage: statusMessage ?? null, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: chatPresence.userId,
          set: { status, statusMessage: statusMessage ?? null, updatedAt: new Date() },
        });
    } catch (innerErr: any) {
      const msg = innerErr?.message || String(innerErr);
      if (msg.includes("chat_presence") && msg.includes("does not exist")) {
        return res.status(503).json({
          message: "جدول chat_presence غير موجود — شغّل SQL الهجرة على Neon أولاً",
        });
      }
      throw innerErr;
    }

    // Find all my conversation partners and broadcast the new status.
    const myConvs = await db
      .select({ initiatorId: chatConversations.initiatorId, participantId: chatConversations.participantId })
      .from(chatConversations)
      .where(
        or(
          eq(chatConversations.initiatorId, me),
          eq(chatConversations.participantId, me),
        ),
      );
    const partnerIds = Array.from(
      new Set(myConvs.map((c) => (c.initiatorId === me ? c.participantId : c.initiatorId))),
    );

    // "invisible" means partners see me as offline regardless of WS state.
    const onlinePublic = status !== "invisible" && isUserOnline(me);

    if (partnerIds.length > 0) {
      chatBus.publish({
        type: "presence:update",
        conversationId: "",
        recipientIds: partnerIds,
        payload: { userId: me, status, online: onlinePublic },
      });
    }

    res.json({ status, statusMessage: statusMessage ?? null, online: onlinePublic });
  } catch (err) {
    console.error("[chat] PUT presence error:", err);
    res.status(500).json({ message: "Failed to update presence" });
  }
});

// ============================================================================
// POST /api/chat/conversations/:id/typing — broadcast "is typing" to partner
// Body: { isTyping: boolean }
// ============================================================================
const typingSchema = z.object({ isTyping: z.boolean() });

router.post("/api/chat/conversations/:id/typing", requireAuth, async (req: any, res) => {
  try {
    if (!(await requirePerm(req, res, PERMISSION_CODES.CHAT_USE))) return;
    const me = req.user.id;
    const conversationId = req.params.id;
    const parsed = typingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "بيانات غير صحيحة" });

    const [conv] = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    if (!conv) return res.status(404).json({ message: "المحادثة غير موجودة" });
    if (conv.initiatorId !== me && conv.participantId !== me) {
      return res.status(403).json({ message: "ليس لديك صلاحية" });
    }

    const partnerId = conv.initiatorId === me ? conv.participantId : conv.initiatorId;
    chatBus.publish({
      type: "typing",
      conversationId,
      recipientIds: [partnerId],
      payload: { conversationId, userId: me, isTyping: parsed.data.isTyping },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("[chat] POST typing error:", err);
    res.status(500).json({ message: "Failed" });
  }
});

export default router;
