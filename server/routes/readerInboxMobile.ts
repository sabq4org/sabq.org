/**
 * صندوق إشعارات القارئ للتطبيقات — نظائر v1 لمركز الويب (/api/notifications
 * و/api/me/notification-prefs). مسارات /api/v1/notifications القائمة في
 * mobileApiRoutes.ts تخص الإشعارات التحريرية للكتّاب (editorial_notifications)
 * فلا تُمس؛ هذه منفصلة باسم inbox.
 *
 *   GET    /api/v1/inbox?limit&offset      { items, unread, hasMore }
 *   GET    /api/v1/inbox/unread-count      { unread }
 *   POST   /api/v1/inbox/read-all
 *   POST   /api/v1/inbox/:id/read
 *   DELETE /api/v1/inbox/:id
 *   GET    /api/v1/inbox/preferences       ReaderNotificationPrefs
 *   PATCH  /api/v1/inbox/preferences       جزء منها → القيم بعد الحفظ
 *
 * Bearer عبر verifyMemberBearer، بلا كاش، ولا استيراد لـ db (ADR-001).
 */
import { Router, type Request, type Response } from "express";
import { verifyMemberBearer } from "../services/memberSessionService";
import {
  listInbox,
  countUnread,
  markRead,
  markAllRead,
  deleteItem,
  getPrefs,
  updatePrefs,
  parsePrefsPatch,
} from "../services/readerInboxService";

const router = Router();

function noStore(res: Response) {
  res.set("Cache-Control", "private, no-store");
}

async function requireMember(req: Request, res: Response): Promise<string | null> {
  noStore(res);
  const session = await verifyMemberBearer(req);
  if (!session) {
    res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    return null;
  }
  return session.userId;
}

function intParam(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

router.get("/api/v1/inbox", async (req: Request, res: Response) => {
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    const limit = intParam(req.query.limit, 30, 1, 100);
    const offset = intParam(req.query.offset, 0, 0, 10_000);
    res.json(await listInbox(userId, limit, offset));
  } catch (error) {
    console.error("[ReaderInbox Mobile] list error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب الإشعارات" });
  }
});

router.get("/api/v1/inbox/unread-count", async (req: Request, res: Response) => {
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    res.json({ unread: await countUnread(userId) });
  } catch (error) {
    console.error("[ReaderInbox Mobile] count error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب عدد الإشعارات" });
  }
});

// قبل /:id/read كي لا تُفهم read-all معرّفًا
router.post("/api/v1/inbox/read-all", async (req: Request, res: Response) => {
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    await markAllRead(userId);
    res.json({ success: true });
  } catch (error) {
    console.error("[ReaderInbox Mobile] read-all error:", error);
    res.status(500).json({ success: false, message: "تعذر تحديث الإشعارات" });
  }
});

router.get("/api/v1/inbox/preferences", async (req: Request, res: Response) => {
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    res.json(await getPrefs(userId));
  } catch (error) {
    console.error("[ReaderInbox Mobile] prefs get error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب إعدادات الإشعارات" });
  }
});

router.patch("/api/v1/inbox/preferences", async (req: Request, res: Response) => {
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    const patch = parsePrefsPatch(req.body);
    if (!patch) return res.status(400).json({ success: false, message: "بيانات غير صالحة" });
    res.json(await updatePrefs(userId, patch));
  } catch (error) {
    console.error("[ReaderInbox Mobile] prefs patch error:", error);
    res.status(500).json({ success: false, message: "تعذر حفظ إعدادات الإشعارات" });
  }
});

router.post("/api/v1/inbox/:id/read", async (req: Request, res: Response) => {
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    if (!(await markRead(userId, req.params.id))) {
      return res.status(404).json({ success: false, message: "الإشعار غير موجود" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[ReaderInbox Mobile] read error:", error);
    res.status(500).json({ success: false, message: "تعذر تحديث الإشعار" });
  }
});

router.delete("/api/v1/inbox/:id", async (req: Request, res: Response) => {
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    if (!(await deleteItem(userId, req.params.id))) {
      return res.status(404).json({ success: false, message: "الإشعار غير موجود" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[ReaderInbox Mobile] delete error:", error);
    res.status(500).json({ success: false, message: "تعذر حذف الإشعار" });
  }
});

export default router;
