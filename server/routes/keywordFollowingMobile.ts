/**
 * متابعة الكلمات للتطبيقات — نظائر v1 لمسارات keywordFollowing.ts.
 *
 *   GET  /api/v1/keywords/followed   قائمة «كلماتي» مع عدد الأخبار
 *   POST /api/v1/keywords/follow     { keyword }
 *   POST /api/v1/keywords/unfollow   { keyword }
 *   POST /api/v1/keywords/sync       { keywords: string[] } دمج ما تابعه القارئ
 *                                    على الجهاز قبل الدخول، ثم القائمة كاملة
 *
 * مسارات الويب محمية بجلسة Passport ولا تقبل رمز Bearer، وتعمل بمعرّف الوسم
 * الذي لا يعرفه التطبيق؛ هنا الاسم، والتحقق عبر verifyMemberBearer. لا كاش
 * (بيانات خاصة بالمستخدم). لا استيراد لـ db هنا (ADR-001).
 */
import { Router, type Request, type Response } from "express";
import { verifyMemberBearer } from "../services/memberSessionService";
import {
  followKeyword,
  unfollowKeyword,
  listFollowedKeywords,
  normalizeKeyword,
  KEYWORD_SYNC_MAX,
} from "../services/keywordFollowService";

const router = Router();

function noStore(res: Response) {
  res.set("Cache-Control", "private, no-store");
}

async function requireMember(req: Request, res: Response): Promise<string | null> {
  const session = await verifyMemberBearer(req);
  if (!session) {
    res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    return null;
  }
  return session.userId;
}

router.get("/api/v1/keywords/followed", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    res.json({ keywords: await listFollowedKeywords(userId) });
  } catch (error) {
    console.error("[KeywordFollow Mobile] list error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب الكلمات المتابعة" });
  }
});

router.post("/api/v1/keywords/follow", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    const keyword = normalizeKeyword(req.body?.keyword);
    if (!keyword) return res.status(400).json({ success: false, message: "الكلمة المفتاحية مطلوبة" });
    const tagId = await followKeyword(userId, keyword);
    if (!tagId) return res.status(500).json({ success: false, message: "تعذر متابعة الكلمة" });
    res.json({ success: true, tagId });
  } catch (error) {
    console.error("[KeywordFollow Mobile] follow error:", error);
    res.status(500).json({ success: false, message: "تعذر متابعة الكلمة" });
  }
});

router.post("/api/v1/keywords/unfollow", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    const keyword = normalizeKeyword(req.body?.keyword);
    if (!keyword) return res.status(400).json({ success: false, message: "الكلمة المفتاحية مطلوبة" });
    await unfollowKeyword(userId, keyword);
    res.json({ success: true });
  } catch (error) {
    console.error("[KeywordFollow Mobile] unfollow error:", error);
    res.status(500).json({ success: false, message: "تعذر إلغاء متابعة الكلمة" });
  }
});

router.post("/api/v1/keywords/sync", async (req: Request, res: Response) => {
  noStore(res);
  try {
    const userId = await requireMember(req, res);
    if (!userId) return;
    const raw: unknown[] = Array.isArray(req.body?.keywords) ? req.body.keywords : [];
    const local = Array.from(
      new Set(raw.map(normalizeKeyword).filter((k): k is string => k !== null)),
    ).slice(0, KEYWORD_SYNC_MAX);
    for (const keyword of local) await followKeyword(userId, keyword);
    res.json({ keywords: await listFollowedKeywords(userId) });
  } catch (error) {
    console.error("[KeywordFollow Mobile] sync error:", error);
    res.status(500).json({ success: false, message: "تعذرت مزامنة الكلمات" });
  }
});

export default router;
