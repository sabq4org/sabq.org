/**
 * الإبلاغ عن التعليقات وحظر المستخدمين لتطبيقات الجوال (بند أبل 1.2).
 *
 *   POST   /api/v1/comments/:id/report       بلاغ { reason, details? }
 *   GET    /api/v1/members/blocks            من حظرهم القارئ
 *   POST   /api/v1/members/blocks            حظر { userId }
 *   DELETE /api/v1/members/blocks/:userId    إلغاء الحظر
 *
 * التحقق بجلسة Bearer نفسها (verifyMemberBearer). التطبيق يُخفي تعليقات
 * المحظورين محليًا لأن قائمة التعليقات العامة محايدة ومخزّنة 15ث.
 * لا استيراد لـ db هنا (ADR-001).
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { verifyMemberBearer } from "../services/memberSessionService";
import {
  COMMENT_REPORT_REASONS,
  blockUser,
  listBlockedUsers,
  reportComment,
  unblockUser,
} from "../services/commentSafetyService";

const router = Router();

function noStore(res: Response) {
  res.set("Cache-Control", "private, no-store");
}

const reportBody = z.object({
  reason: z.enum(COMMENT_REPORT_REASONS),
  details: z.string().max(2000).optional().nullable(),
});

router.post("/api/v1/comments/:id/report", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const parsed = reportBody.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ success: false, message: "سبب البلاغ غير صالح" });

    const result = await reportComment({
      commentId: req.params.id,
      reporterId: session.userId,
      reason: parsed.data.reason,
      details: parsed.data.details,
    });
    if (!result.ok) {
      if (result.code === "not_found") return res.status(404).json({ success: false, message: "التعليق غير موجود" });
      if (result.code === "own_comment") return res.status(400).json({ success: false, message: "لا يمكنك الإبلاغ عن تعليقك" });
      return res.status(429).json({ success: false, message: "تجاوزت حد البلاغات اليومي، حاول لاحقًا" });
    }
    res.json({ success: true, alreadyReported: result.alreadyReported });
  } catch (error) {
    console.error("[CommentSafety] report error:", error);
    res.status(500).json({ success: false, message: "تعذر إرسال البلاغ" });
  }
});

router.get("/api/v1/members/blocks", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    res.json({ success: true, users: await listBlockedUsers(session.userId) });
  } catch (error) {
    console.error("[CommentSafety] list blocks error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب قائمة الحظر" });
  }
});

const blockBody = z.object({ userId: z.string().min(1).max(100) });

router.post("/api/v1/members/blocks", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const parsed = blockBody.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ success: false, message: "المستخدم غير محدد" });
    const result = await blockUser(session.userId, parsed.data.userId);
    if (!result.ok) {
      if (result.code === "self") return res.status(400).json({ success: false, message: "لا يمكنك حظر نفسك" });
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("[CommentSafety] block error:", error);
    res.status(500).json({ success: false, message: "تعذر حظر المستخدم" });
  }
});

router.delete("/api/v1/members/blocks/:userId", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    await unblockUser(session.userId, req.params.userId);
    res.json({ success: true });
  } catch (error) {
    console.error("[CommentSafety] unblock error:", error);
    res.status(500).json({ success: false, message: "تعذر إلغاء الحظر" });
  }
});

export default router;
