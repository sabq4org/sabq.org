/**
 * إضافات مقال الرأي للتطبيقات (/api/v1): «جملة المقال» وبطاقتها، و«أوافق / لا أوافق».
 * نظير /api/opinion-extras الذي يعمل بجلسة الويب فقط. الدخول هنا بـ Bearer
 * العضو (اختياري للقراءة والتصويت، مطلوب للتعديل)، وهوية المصوّت المجهول من
 * ترويسة x-session-id (معرّف ثابت للجهاز) أو بصمة العنوان.
 * يُركَّب قبل mobileApiRoutes في server/index.ts. لا استيراد لـ db هنا (ADR-001).
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { userHasPermission } from "../rbac";
import { verifyMemberBearer } from "../services/memberSessionService";
import { resolveVoterSessionId } from "../services/pollVoteGuard";
import { cfKeyGenerator, cfValidate, getRealIp } from "../utils/rateLimiting";
import {
  castAgreeVote,
  getOpinionExtras,
  saveOpinionExtras,
  type OpinionExtrasView,
} from "../services/opinionReaderExtrasService";

const router = Router();

const API_ORIGIN = "https://api.sabq.org";

const voteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message: { success: false, message: "محاولات تصويت كثيرة. حاول بعد قليل." },
});

function editorCheck(userId: string | null) {
  return async () => {
    if (!userId) return false;
    if (await userHasPermission(userId, PERMISSION_CODES.OPINION_REVIEW)) return true;
    return userHasPermission(userId, PERMISSION_CODES.ARTICLES_EDIT_ANY);
  };
}

function voterSession(req: Request, ip: string) {
  return (pollId: string) =>
    resolveVoterSessionId({ headerSessionId: req.headers["x-session-id"], ip, pollId });
}

/** رابط البطاقة مطلق: التطبيق لا يعرف أصل /api. */
function forApp(view: OpinionExtrasView): OpinionExtrasView {
  return { ...view, quoteCardUrl: view.quoteCardUrl ? `${API_ORIGIN}${view.quoteCardUrl}` : null };
}

router.get("/opinion-extras/:articleId", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberBearer(req);
    const userId = session?.userId ?? null;
    const ip = getRealIp(req);
    const result = await getOpinionExtras(req.params.articleId, {
      userId,
      sessionIdFor: voterSession(req, ip),
      isEditor: editorCheck(userId),
    });
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ success: true, ...forApp(result.view) });
  } catch (error) {
    console.error("[Mobile API] GET /opinion-extras failed:", error);
    res.status(500).json({ success: false, message: "تعذر جلب إضافات المقال" });
  }
});

const voteSchema = z.object({ choice: z.enum(["agree", "disagree"]) }).strict();

router.post("/opinion-extras/:articleId/vote", voteLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = voteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, message: "اختر أوافق أو لا أوافق" });
    const session = await verifyMemberBearer(req);
    const ip = getRealIp(req);
    const result = await castAgreeVote(req.params.articleId, parsed.data.choice, {
      userId: session?.userId ?? null,
      sessionIdFor: voterSession(req, ip),
      ip,
    });
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ success: true, agree: result.agree });
  } catch (error) {
    console.error("[Mobile API] POST /opinion-extras/vote failed:", error);
    res.status(500).json({ success: false, message: "حدث خطأ أثناء التصويت" });
  }
});

// strict: حقل غير معروف (pull_quote مثلًا) يُرفض بدل أن يُسقط فيُرد «حُفظ» دون حفظ (REVIEW.md A4).
const saveSchema = z
  .object({
    pullQuote: z.string().max(1000).nullable().optional(),
    agreeVoteEnabled: z.boolean().optional(),
  })
  .strict();

router.put("/opinion-extras/:articleId", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ success: false, message: "سجّل الدخول أولًا" });
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
      const unknown = parsed.error.issues.find((i) => i.code === "unrecognized_keys");
      return res.status(400).json({
        success: false,
        code: unknown ? "UNKNOWN_FIELDS" : "INVALID_BODY",
        message: unknown ? "حقول غير معروفة في الطلب" : "بيانات غير صالحة",
      });
    }
    const result = await saveOpinionExtras(req.params.articleId, parsed.data, {
      id: session.userId,
      isEditor: editorCheck(session.userId),
    });
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] PUT /opinion-extras failed:", error);
    res.status(500).json({ success: false, message: "تعذر حفظ إضافات المقال" });
  }
});

export default router;
