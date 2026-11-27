/**
 * لوحة كاتب الرأي في التطبيقات (/api/v1/contributor/*): نظائر مسارات الويب
 * التي تعمل بجلسة المتصفح فقط، بـ Bearer العضو وبالخدمات نفسها.
 *
 *   GET  /contributor/home                          «خطوتك التالية» + الإعلانات + فرصة تغيير اليوم
 *   POST /contributor/announcements/seen            { ids }
 *   POST /contributor/announcements/:id/vote        { optionIndex }
 *   POST /contributor/announcements/:id/acted
 *   GET  /contributor/files/:id/link                رابط موقّع مؤقت لملف (يُسجَّل التحميل بالاسم)
 *   GET  /contributor/slot-change                   حالة فرصة تغيير اليوم
 *   POST /contributor/slot-change                   { weekday, time, acceptedTerms }
 *   GET  /contributor/articles/:articleId/social-proposal
 *   POST /contributor/articles/:articleId/social-proposal  { text, textSource }
 *   GET  /contributor/tickets                       محادثاتي مع التحرير (+ unreadCount)
 *   POST /contributor/tickets                       { title, message }
 *   GET  /contributor/tickets/:id                   الرسائل (ويُعلَّم مقروءًا)
 *   POST /contributor/tickets/:id/messages          { message }
 *
 * يُركَّب قبل mobileApiRoutes في server/index.ts (ذلك الملف فوق سقف الأسطر).
 * لا استيراد لـ db هنا (ADR-001).
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { insertOpinionTicketMessageSchema, insertOpinionTicketSchema } from "@shared/schema";
import { validateVote } from "@shared/opinionWriterAnnouncements";
import { computeWriterNextStep } from "@shared/writerNextStep";
import { logActivity, userHasAnyRole } from "../rbac";
import { verifyMemberBearer } from "../services/memberSessionService";
import { getOpinionAuthorWorkspace } from "../services/opinionAuthorWorkspaceService";
import {
  AnnouncementError,
  listAnnouncementsForWriter,
  markAnnouncementActed,
  markAnnouncementsSeen,
  recordFileDownload,
  voteOnAnnouncement,
} from "../services/opinionWriterAnnouncementsService";
import { getOpinionWriterFileDownload } from "../services/opinionWriterFilesService";
import {
  OpinionTicketServiceError,
  appendOpinionTicketMessage,
  createOpinionTicket,
  getOpinionTicketWithMessages,
  getOpinionTicketsUnreadCounts,
  listOpinionTickets,
} from "../services/opinionTicketsService";
import { getWriterScheduleBanner } from "../services/opinionWritersService";
import { storage } from "../storage";
import { applyWriterSlotChange, getWriterSlotChangeState } from "../services/opinionSlotChangeService";
import {
  createOrUpdateAuthorSocialProposal,
  getAuthorSocialProposalStatus,
  SocialPublishValidationError,
} from "../services/socialPublishing/socialPublishingService";

const router = Router();

const NOT_WRITER = { success: false, message: "هذه المساحة خاصة بكتّاب الرأي" };

/** جلسة التطبيق لكاتب رأي، وإلا يُرد 401/403 ويعود null. */
async function writerSession(req: Request, res: Response): Promise<string | null> {
  res.setHeader("Cache-Control", "private, no-store");
  const session = await verifyMemberBearer(req);
  if (!session) {
    res.status(401).json({ success: false, message: "سجّل الدخول أولًا" });
    return null;
  }
  if (!(await userHasAnyRole(session.userId, ["opinion_author"]))) {
    res.status(403).json(NOT_WRITER);
    return null;
  }
  return session.userId;
}

function sendError(res: Response, error: unknown, fallback: string, tag: string) {
  if (error instanceof AnnouncementError) {
    return res.status(error.status).json({ success: false, code: error.code, message: error.message });
  }
  if (error instanceof OpinionTicketServiceError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  if (error instanceof SocialPublishValidationError) {
    return res.status(error.status).json({ success: false, message: error.message });
  }
  console.error(`[Mobile API] writer ${tag} failed:`, error);
  return res.status(500).json({ success: false, message: fallback });
}

// ── الرئيسية ──

router.get("/contributor/home", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    const [workspace, banner, slotChange, announcements] = await Promise.all([
      getOpinionAuthorWorkspace(userId, { trackingLimit: 20 }),
      getWriterScheduleBanner(userId),
      getWriterSlotChangeState(userId),
      listAnnouncementsForWriter(userId),
    ]);
    const nextStep = computeWriterNextStep({
      articles: workspace.tracking.map((a) => ({
        id: a.id,
        title: a.title,
        status: a.status,
        reviewStatus: a.reviewStatus,
        reviewNotes: a.reviewNotes,
        scheduledAt: a.scheduledAt,
        updatedAt: a.updatedAt,
      })),
      banner,
      slotChange: slotChange.round ? { canChange: slotChange.canChange, closesAt: slotChange.round.closesAt } : null,
      announcements,
    });
    res.json({ success: true, nextStep, announcements, banner, slotChange });
  } catch (error) {
    return sendError(res, error, "تعذر تجهيز لوحة الكاتب", "home");
  }
});

// ── الإعلانات ──

router.post("/contributor/announcements/seen", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    const ids = (req.body as { ids?: unknown } | undefined)?.ids;
    if (!Array.isArray(ids) || ids.length > 50 || ids.some((x) => typeof x !== "string")) {
      return res.status(400).json({ success: false, message: "قائمة الإعلانات غير صحيحة" });
    }
    const recorded = await markAnnouncementsSeen(userId, ids as string[]);
    res.json({ success: true, recorded });
  } catch (error) {
    return sendError(res, error, "تعذر تسجيل الظهور", "seen");
  }
});

router.post("/contributor/announcements/:id/vote", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    const v = validateVote(req.body, 100);
    if (!v.ok) return res.status(400).json({ success: false, code: v.code, message: v.message });
    await voteOnAnnouncement(userId, req.params.id, v.optionIndex);
    res.json({ success: true });
  } catch (error) {
    return sendError(res, error, "تعذر حفظ صوتك", "announcement vote");
  }
});

router.post("/contributor/announcements/:id/acted", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    await markAnnouncementActed(userId, req.params.id);
    res.json({ success: true });
  } catch (error) {
    return sendError(res, error, "تعذر التسجيل", "announcement acted");
  }
});

router.get("/contributor/files/:id/link", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    const file = await getOpinionWriterFileDownload(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: "الملف غير موجود" });
    void recordFileDownload(userId, file.id);
    res.json({ success: true, url: file.signedUrl, title: file.title });
  } catch (error) {
    return sendError(res, error, "تعذر فتح الملف", "file link");
  }
});

// ── فرصة تغيير اليوم الأسبوعي ──

router.get("/contributor/slot-change", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    res.json({ success: true, ...(await getWriterSlotChangeState(userId)) });
  } catch (error) {
    return sendError(res, error, "تعذر جلب فرصة تغيير الموعد", "slot-change state");
  }
});

const slotChangeSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  acceptedTerms: z.literal(true),
}).strict();

router.post("/contributor/slot-change", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    const parsed = slotChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "اختر يومًا ووقتًا ووافق على الإيضاحات" });
    }
    const result = await applyWriterSlotChange(userId, parsed.data);
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
    void logActivity({
      userId,
      action: "opinion_writer_slot_changed",
      entityType: "opinion_writer_schedule",
      entityId: userId,
      oldValue: result.from,
      newValue: result.to,
      metadata: { roundId: result.roundId, termsAccepted: true, movedArticles: result.moved, source: "mobile-app" },
    }).catch(() => undefined);
    res.json({ success: true, from: result.from, to: result.to, moved: result.moved });
  } catch (error) {
    return sendError(res, error, "تعذر حفظ الموعد الجديد", "slot-change apply");
  }
});

// ── مقترح منشور X لمقال منشور (نافذة 72 ساعة) ──

router.get("/contributor/articles/:articleId/social-proposal", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    res.json({ success: true, ...(await getAuthorSocialProposalStatus(req.params.articleId, userId)) });
  } catch (error) {
    return sendError(res, error, "تعذر التحقق من حالة النشر الاجتماعي", "social status");
  }
});

const proposalSchema = z.object({
  text: z.string().trim().min(1, "نص المنشور مطلوب").max(2000, "النص طويل جداً"),
  textSource: z.enum(["title", "custom"]),
}).strict();

router.post("/contributor/articles/:articleId/social-proposal", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    const parsed = proposalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || "بيانات المقترح غير صالحة" });
    }
    const post = await createOrUpdateAuthorSocialProposal({
      articleId: req.params.articleId,
      authorUserId: userId,
      text: parsed.data.text,
      textSource: parsed.data.textSource,
    });
    res.status(201).json({ success: true, post: { id: post.id, status: post.status } });
  } catch (error) {
    return sendError(res, error, "تعذر إرسال مقترح النشر الاجتماعي", "social submit");
  }
});

// ── محادثة التحرير (الاستفسارات) ──
// في مساحة الكاتب يُعامل كاتبًا دائمًا، حتى لو كان يملك دورًا تحريريًا أيضًا.

router.get("/contributor/tickets", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    const [tickets, counts] = await Promise.all([
      listOpinionTickets({ viewerId: userId, isAdmin: false, limit: 50 }),
      getOpinionTicketsUnreadCounts({ viewerId: userId, isAdmin: false }),
    ]);
    res.json({
      success: true,
      unreadCount: counts.unreadCount,
      tickets: tickets.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        direction: t.direction,
        lastMessageAt: t.last_message_at,
        hasUnread: t.hasUnread,
        excerpt: t.latestMessageExcerpt,
      })),
    });
  } catch (error) {
    return sendError(res, error, "تعذر جلب المحادثات", "tickets list");
  }
});

router.post("/contributor/tickets", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    const parsed = insertOpinionTicketSchema.omit({ writerId: true }).strict().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || "بيانات غير صالحة" });
    }
    const user = await storage.getUser(userId);
    const ticket = await createOpinionTicket({
      actorId: userId,
      actorFirstName: user?.firstName,
      actorLastName: user?.lastName,
      isAdmin: false,
      isContributor: true,
      authorKind: "opinion_author",
      title: parsed.data.title,
      message: parsed.data.message,
    });
    res.status(201).json({ success: true, ticket: { id: ticket.id } });
  } catch (error) {
    return sendError(res, error, "تعذر إرسال الرسالة", "ticket create");
  }
});

router.get("/contributor/tickets/:id", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    const detail = await getOpinionTicketWithMessages({ ticketId: req.params.id, viewerId: userId, isAdmin: false });
    res.json({
      success: true,
      ticket: { id: detail.ticket.id, title: detail.ticket.title, status: detail.ticket.status },
      messages: detail.messages.map((m) => ({
        id: m.id,
        mine: m.senderId === userId,
        senderRole: m.senderRole,
        senderName: m.senderName,
        message: m.message,
        createdAt: m.created_at,
      })),
    });
  } catch (error) {
    return sendError(res, error, "تعذر فتح المحادثة", "ticket detail");
  }
});

router.post("/contributor/tickets/:id/messages", async (req: Request, res: Response) => {
  try {
    const userId = await writerSession(req, res);
    if (!userId) return;
    const parsed = insertOpinionTicketMessageSchema.pick({ message: true }).strict().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || "الرسالة مطلوبة" });
    }
    const user = await storage.getUser(userId);
    const result = await appendOpinionTicketMessage({
      ticketId: req.params.id,
      senderId: userId,
      senderFirstName: user?.firstName,
      senderLastName: user?.lastName,
      isAdmin: false,
      authorKind: "opinion_author",
      message: parsed.data.message,
    });
    res.status(201).json({ success: true, message: { id: result.message.id } });
  } catch (error) {
    return sendError(res, error, "تعذر إرسال الرسالة", "ticket reply");
  }
});

export default router;
