// إضافات مقال الرأي: «جملة المقال» وبطاقتها صورةً، «أوافق / لا أوافق»،
// وتغيير الكاتب لموعد مقاله المجدول مرة واحدة.
// ADR-001: لا وصول لقاعدة البيانات هنا — الاستعلامات في opinionReaderExtrasService.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { riyadhLocalToDate } from "@shared/opinionReaderExtras";
import { requireAuth, userHasAnyRole, userHasPermission, logActivity } from "../rbac";
import { getRealIp } from "../utils/rateLimiting";
import { resolveVoterSessionId } from "../services/pollVoteGuard";
import {
  getOpinionExtras,
  getQuoteCardData,
  listWriterReschedules,
  rescheduleOpinionArticleOnce,
  saveOpinionExtras,
} from "../services/opinionReaderExtrasService";
import { renderOpinionQuoteCardPng } from "../services/opinionQuoteCardImage";

const router = Router();

const currentUserId = (req: Request): string | null => (req.user as { id?: string } | undefined)?.id ?? null;

function editorCheck(userId: string | null) {
  return async () => {
    if (!userId) return false;
    if (await userHasPermission(userId, PERMISSION_CODES.OPINION_REVIEW)) return true;
    return userHasPermission(userId, PERMISSION_CODES.ARTICLES_EDIT_ANY);
  };
}

// ── للقارئ (علني للمقال المنشور، ولكاتبه والتحرير قبل النشر) ──

router.get("/api/opinion-extras/:articleId", async (req: Request, res: Response) => {
  try {
    const userId = currentUserId(req);
    const ip = getRealIp(req);
    const result = await getOpinionExtras(req.params.articleId, {
      userId,
      sessionIdFor: (pollId) =>
        resolveVoterSessionId({
          cookieSessionId: req.cookies?.sessionId,
          headerSessionId: req.headers["x-session-id"],
          ip,
          pollId,
        }),
      isEditor: editorCheck(userId),
    });
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    // فيه اختيار القارئ نفسه: لا يُخزَّن في CDN
    res.setHeader("Cache-Control", "private, no-store");
    res.json(result.view);
  } catch (error) {
    console.error("[opinion-extras] get failed:", error);
    res.status(500).json({ message: "تعذر جلب إضافات المقال" });
  }
});

router.get("/api/opinion-extras/:articleId/quote-card.png", async (req: Request, res: Response) => {
  try {
    const data = await getQuoteCardData(req.params.articleId);
    if (!data) return res.status(404).json({ message: "لا توجد بطاقة لهذا المقال" });
    const png = await renderOpinionQuoteCardPng({
      quote: data.quote,
      authorName: data.authorName,
      authorImageUrl: data.authorImageUrl,
    });
    res.setHeader("Content-Type", "image/png");
    // تتغير الصورة إن غيّر الكاتب العبارة: ?v=<updatedAt> في الرابط يكسر الذاكرة
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    res.setHeader("Content-Disposition", `inline; filename="sabq-quote-${req.params.articleId.slice(0, 8)}.png"`);
    res.send(png);
  } catch (error) {
    console.error("[opinion-extras] quote card failed:", error);
    res.status(500).json({ message: "تعذر إنشاء بطاقة الاقتباس" });
  }
});

// ── للكاتب والتحرير ──

const saveSchema = z.object({
  pullQuote: z.string().max(1000).nullable().optional(),
  agreeVoteEnabled: z.boolean().optional(),
});

router.put("/api/opinion-extras/:articleId", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = currentUserId(req)!;
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "بيانات غير صالحة" });
    const result = await saveOpinionExtras(req.params.articleId, parsed.data, { id: userId, isEditor: editorCheck(userId) });
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    res.json({ ok: true });
  } catch (error) {
    console.error("[opinion-extras] save failed:", error);
    res.status(500).json({ message: "تعذر حفظ إضافات المقال" });
  }
});

// ── تغيير الموعد مرة واحدة ──

router.get("/api/opinion-author/reschedules", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = currentUserId(req)!;
    if (!(await userHasAnyRole(userId, ["opinion_author"]))) {
      return res.status(403).json({ message: "هذه المساحة خاصة بكتّاب الرأي" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ items: await listWriterReschedules(userId) });
  } catch (error) {
    console.error("[opinion-extras] list reschedules failed:", error);
    res.status(500).json({ message: "تعذر جلب تغييرات المواعيد" });
  }
});

const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

router.post("/api/opinion-author/articles/:id/reschedule", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = currentUserId(req)!;
    if (!(await userHasAnyRole(userId, ["opinion_author"]))) {
      return res.status(403).json({ message: "هذه المساحة خاصة بكتّاب الرأي" });
    }
    const parsed = rescheduleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "اختر تاريخًا ووقتًا صحيحين" });
    // الحقول بتوقيت الرياض دائمًا مهما كانت منطقة جهاز الكاتب
    const target = riyadhLocalToDate(parsed.data.date, parsed.data.time);
    const result = await rescheduleOpinionArticleOnce(userId, req.params.id, target);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    void logActivity({
      userId,
      action: "opinion_writer_rescheduled",
      entityType: "article",
      entityId: req.params.id,
      oldValue: { scheduledAt: result.fromAt.toISOString() },
      newValue: { scheduledAt: result.toAt.toISOString() },
      metadata: { reason: "writer_one_time_reschedule" },
    }).catch(() => undefined);
    res.json({ ok: true, fromAt: result.fromAt.toISOString(), toAt: result.toAt.toISOString() });
  } catch (error) {
    console.error("[opinion-extras] reschedule failed:", error);
    res.status(500).json({ message: "تعذر تغيير الموعد" });
  }
});

export default router;
