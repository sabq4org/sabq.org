// مسارات إعلانات كتّاب الرأي ومتابعة التفاعل بالأسماء:
//   GET    /api/opinion-writer-announcements                 الإعلانات السارية مع حالة الكاتب (كاتب أو إدارة)
//   POST   /api/opinion-writer-announcements/seen            { ids } تسجيل الظهور في لوحة الكاتب
//   POST   /api/opinion-writer-announcements/:id/vote        { optionIndex } تصويت (قابل للتغيير)
//   POST   /api/opinion-writer-announcements/:id/acted       فتح رابط أو قراءة ملاحظة
//   GET    /api/admin/opinion-writer-announcements           كل الإعلانات مع الأعداد (opinion.review)
//   POST   /api/admin/opinion-writer-announcements           إنشاء إعلان (opinion.review)
//   POST   /api/admin/opinion-writer-announcements/:id/archive  إنهاء الإعلان مبكراً
//   GET    /api/admin/opinion-writer-announcements/:id/tracking  المتابعة بالأسماء
//   GET    /api/admin/opinion-writer-announcements/feedback-form/tracking  من عبّأ نموذج الاهتمامات
//   POST   /api/admin/opinion-writer-announcements/:id/remind    بريد لمن لم يتفاعل (مرة في اليوم)
// تحميل الملفات يُسجَّل في مسار ملفات الكتّاب نفسه. ADR-001: الاستعلامات في الخدمة.

import { Router, type Request, type Response } from "express";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { validateCreateAnnouncement, validateVote } from "@shared/opinionWriterAnnouncements";
import { logActivity, requireAuth, requirePermission, userHasAnyRole, userHasPermission } from "../rbac";
import {
  AnnouncementError,
  archiveAnnouncement,
  createAnnouncement,
  getAnnouncementTracking,
  getFeedbackFormTracking,
  listAnnouncementsForAdmin,
  listAnnouncementsForWriter,
  markAnnouncementActed,
  markAnnouncementsSeen,
  remindPendingWriters,
  sendAnnouncementEmailInBackground,
  voteOnAnnouncement,
} from "../services/opinionWriterAnnouncementsService";

const router = Router();

const requestUserId = (req: Request) => (req.user as { id: string }).id;

function noStore(res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
}

async function isWriter(userId: string) {
  return userHasAnyRole(userId, ["opinion_author"]);
}

function sendError(res: Response, error: unknown, fallback: string, tag: string) {
  if (error instanceof AnnouncementError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  console.error(`[opinion-announcements] ${tag}:`, error);
  return res.status(500).json({ message: fallback });
}

router.get("/api/opinion-writer-announcements", requireAuth, async (req: Request, res: Response) => {
  noStore(res);
  try {
    const userId = requestUserId(req);
    const [writer, manager] = await Promise.all([
      isWriter(userId),
      userHasPermission(userId, PERMISSION_CODES.OPINION_REVIEW),
    ]);
    if (!writer && !manager) return res.status(403).json({ message: "هذا القسم مخصص لكتّاب الرأي" });
    const announcements = await listAnnouncementsForWriter(userId);
    return res.json({ announcements, isWriter: writer });
  } catch (error) {
    return sendError(res, error, "تعذر جلب الإعلانات", "list");
  }
});

router.post("/api/opinion-writer-announcements/seen", requireAuth, async (req: Request, res: Response) => {
  noStore(res);
  try {
    const userId = requestUserId(req);
    // الإدارة تستطيع المعاينة دون أن تُحسب في المتابعة
    if (!(await isWriter(userId))) return res.json({ ok: true, recorded: 0 });
    const body = req.body as Record<string, unknown> | undefined;
    const extra = body && typeof body === "object" ? Object.keys(body).filter((k) => k !== "ids") : [];
    if (extra.length) return res.status(400).json({ code: "UNKNOWN_FIELD", message: `حقول غير مدعومة: ${extra.join("، ")}` });
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
      return res.status(400).json({ code: "INVALID_IDS", message: "قائمة الإعلانات غير صحيحة" });
    }
    const recorded = await markAnnouncementsSeen(userId, ids as string[]);
    return res.json({ ok: true, recorded });
  } catch (error) {
    return sendError(res, error, "تعذر تسجيل الظهور", "seen");
  }
});

router.post("/api/opinion-writer-announcements/:id/vote", requireAuth, async (req: Request, res: Response) => {
  noStore(res);
  try {
    const userId = requestUserId(req);
    if (!(await isWriter(userId))) {
      return res.status(403).json({ code: "WRITERS_ONLY", message: "التصويت متاح لكتّاب الرأي فقط" });
    }
    const v = validateVote(req.body, 100);
    if (!v.ok) return res.status(400).json({ code: v.code, message: v.message });
    await voteOnAnnouncement(userId, req.params.id, v.optionIndex);
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, "تعذر حفظ صوتك", "vote");
  }
});

router.post("/api/opinion-writer-announcements/:id/acted", requireAuth, async (req: Request, res: Response) => {
  noStore(res);
  try {
    const userId = requestUserId(req);
    if (!(await isWriter(userId))) return res.json({ ok: true, recorded: false });
    if (req.body && typeof req.body === "object" && Object.keys(req.body).length) {
      return res.status(400).json({ code: "UNKNOWN_FIELD", message: "هذا الطلب لا يقبل حقولاً" });
    }
    await markAnnouncementActed(userId, req.params.id);
    return res.json({ ok: true, recorded: true });
  } catch (error) {
    return sendError(res, error, "تعذر التسجيل", "acted");
  }
});

// ───────── الإدارة ─────────

const requireReview = requirePermission(PERMISSION_CODES.OPINION_REVIEW);

router.get("/api/admin/opinion-writer-announcements", requireAuth, requireReview, async (_req: Request, res: Response) => {
  noStore(res);
  try {
    return res.json(await listAnnouncementsForAdmin());
  } catch (error) {
    return sendError(res, error, "تعذر جلب الإعلانات", "admin list");
  }
});

router.post("/api/admin/opinion-writer-announcements", requireAuth, requireReview, async (req: Request, res: Response) => {
  noStore(res);
  try {
    const v = validateCreateAnnouncement(req.body);
    if (!v.ok) return res.status(400).json({ code: v.code, message: v.message });
    const actorId = requestUserId(req);
    const row = await createAnnouncement(v.value, actorId);
    await logActivity({
      userId: actorId,
      action: "opinion_writer_announcement_create",
      entityType: "opinion_writer_announcement",
      entityId: row.id,
      newValue: { kind: row.kind, title: row.title, expiresAt: row.expiresAt, sendEmail: row.emailRequested },
      metadata: { ip: req.ip, userAgent: req.get("user-agent") },
    }).catch(() => {});
    if (row.emailRequested) {
      void sendAnnouncementEmailInBackground(row.id).catch((err) =>
        console.error("[opinion-announcements] email start failed:", err),
      );
    }
    return res.status(201).json({ id: row.id });
  } catch (error) {
    return sendError(res, error, "تعذر نشر الإعلان", "create");
  }
});

router.post(
  "/api/admin/opinion-writer-announcements/:id/archive",
  requireAuth,
  requireReview,
  async (req: Request, res: Response) => {
    noStore(res);
    try {
      const ok = await archiveAnnouncement(req.params.id);
      if (!ok) return res.status(404).json({ code: "NOT_FOUND", message: "الإعلان غير موجود أو منتهٍ" });
      await logActivity({
        userId: requestUserId(req),
        action: "opinion_writer_announcement_archive",
        entityType: "opinion_writer_announcement",
        entityId: req.params.id,
        metadata: { ip: req.ip, userAgent: req.get("user-agent") },
      }).catch(() => {});
      return res.json({ ok: true });
    } catch (error) {
      return sendError(res, error, "تعذر إنهاء الإعلان", "archive");
    }
  },
);

router.get(
  "/api/admin/opinion-writer-announcements/feedback-form/tracking",
  requireAuth,
  requireReview,
  async (_req: Request, res: Response) => {
    noStore(res);
    try {
      return res.json(await getFeedbackFormTracking());
    } catch (error) {
      return sendError(res, error, "تعذر جلب المتابعة", "form tracking");
    }
  },
);

router.get(
  "/api/admin/opinion-writer-announcements/:id/tracking",
  requireAuth,
  requireReview,
  async (req: Request, res: Response) => {
    noStore(res);
    try {
      const result = await getAnnouncementTracking(req.params.id);
      if (!result) return res.status(404).json({ code: "NOT_FOUND", message: "الإعلان غير موجود" });
      return res.json(result);
    } catch (error) {
      return sendError(res, error, "تعذر جلب المتابعة", "tracking");
    }
  },
);

router.post(
  "/api/admin/opinion-writer-announcements/:id/remind",
  requireAuth,
  requireReview,
  async (req: Request, res: Response) => {
    noStore(res);
    try {
      const result = await remindPendingWriters(req.params.id);
      await logActivity({
        userId: requestUserId(req),
        action: "opinion_writer_announcement_remind",
        entityType: "opinion_writer_announcement",
        entityId: req.params.id,
        newValue: { recipients: result.recipients },
        metadata: { ip: req.ip, userAgent: req.get("user-agent") },
      }).catch(() => {});
      return res.status(202).json(result);
    } catch (error) {
      return sendError(res, error, "تعذر إرسال التذكير", "remind");
    }
  },
);

export default router;
