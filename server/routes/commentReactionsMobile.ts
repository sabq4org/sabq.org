/**
 * إعجاب التطبيقات بالتعليقات — نظائر v1 لمسارات commentReactions.ts.
 *
 *   POST   /api/v1/comments/:id/like                 إعجاب بتعليق
 *   DELETE /api/v1/comments/:id/like                 إلغاء الإعجاب
 *   GET    /api/v1/articles/:slug/comments/my-likes  معرّفات ما أعجب به القارئ
 *
 * مسارات الويب محمية بجلسة Passport (requireAuth) فلا تقبل رمز Bearer الذي
 * تحمله تطبيقات iOS وAndroid. هنا نفس الخدمة ونفس شكل الاستجابة، والتحقق عبر
 * verifyMemberBearer (جلسات app_member_sessions نفسها). لا كاش: الإعجاب يغيّر
 * البيانات، وقائمة my-likes خاصة بالمستخدم. لا استيراد لـ db هنا (ADR-001).
 */
import { Router, type Request, type Response } from "express";
import { verifyMemberBearer } from "../services/memberSessionService";
import {
  likeComment,
  unlikeComment,
  getLikedCommentIdsBySlug,
} from "../services/commentReactionsService";

const router = Router();

function noStore(res: Response) {
  res.set("Cache-Control", "private, no-store");
}

router.post("/api/v1/comments/:id/like", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const result = await likeComment(req.params.id, session.userId);
    if (!result) return res.status(404).json({ success: false, message: "التعليق غير موجود" });
    res.json(result);
  } catch (error) {
    console.error("[CommentReactions Mobile] like error:", error);
    res.status(500).json({ success: false, message: "تعذر تسجيل الإعجاب" });
  }
});

router.delete("/api/v1/comments/:id/like", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const result = await unlikeComment(req.params.id, session.userId);
    if (!result) return res.status(404).json({ success: false, message: "التعليق غير موجود" });
    res.json(result);
  } catch (error) {
    console.error("[CommentReactions Mobile] unlike error:", error);
    res.status(500).json({ success: false, message: "تعذر إلغاء الإعجاب" });
  }
});

router.get("/api/v1/articles/:slug/comments/my-likes", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const ids = await getLikedCommentIdsBySlug(req.params.slug, session.userId);
    res.json(ids);
  } catch (error) {
    console.error("[CommentReactions Mobile] my-likes error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب الإعجابات" });
  }
});

export default router;
