// سجل «تحرير وتوليد شامل» لتطبيقات الجوال (POST /api/v1/admin/ai/edit-and-generate).
// يسبق mobileApiRoutes (ملف فوق سقف الأسطر) فلا يغيّر المسار: يلتقط النص المرسل
// وجسم الرد الناجح ثم يسجّل التشغيل بعد الإرسال. لا يؤخر الرد ولا يفشله.
// ويربط التشغيلات بالخبر عند إنشائه أو حفظه من التطبيق، لأن مسارَي الجوال لا يمرّان
// بـrecordArticleSave (حيث يحدث الربط في الويب).

import { Router, type NextFunction, type Request, type Response } from "express";
import { verifyMemberBearer } from "../services/memberSessionService";
import { recordSmartEditRunInBackground, syncSmartEditRunsAfterSave } from "../services/smartEditRunsService";

const router = Router();

router.post("/admin/ai/edit-and-generate", (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  const inputContent = typeof req.body?.content === "string" ? req.body.content : "";
  const articleId = typeof req.body?.articleId === "string" ? req.body.articleId : null;
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const result = originalJson(body);
    void (async () => {
      try {
        if (inputContent.trim().length < 100) return; // رفضه المسار قبل أي تشغيل
        const session = await verifyMemberBearer(req);
        if (!session?.userId || res.statusCode === 403) return;
        const payload = (body ?? {}) as { success?: boolean; result?: Record<string, unknown> };
        const ok = res.statusCode < 400 && payload.success === true && payload.result;
        const out = (payload.result ?? {}) as Record<string, unknown>;
        recordSmartEditRunInBackground({
          userId: session.userId,
          articleId,
          channel: "mobile",
          status: ok ? "success" : "failed",
          errorType: ok ? null : "unknown",
          inputContent,
          outputContent: ok && typeof out.content === "string" ? out.content : null,
          outputTitle: ok && typeof out.title === "string" ? out.title : null,
          outputFields: ok
            ? { subTitle: out.subtitle, smartSummary: out.summary, keywords: out.keywords, seo: out.seo, detectedCategory: out.categoryName }
            : null,
          latencyMs: Date.now() - startedAt,
        });
      } catch (error) {
        console.warn("[smart-edit-runs] mobile hook failed:", (error as Error)?.message);
      }
    })();
    return result;
  }) as Response["json"];
  next();
});

/** بعد إنشاء خبر أو حفظه من التطبيق بنجاح: اربط تشغيلات صاحبه وأعد حساب البصمة. */
function linkRunsAfterMobileSave(articleIdFrom: (req: Request, body: unknown) => string | null) {
  return (req: Request, res: Response, next: NextFunction) => {
    const content = typeof req.body?.content === "string" ? req.body.content : null;
    if (!content) return next(); // لم يتغير المتن
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const result = originalJson(body);
      void (async () => {
        try {
          if (res.statusCode >= 300 || (body as { success?: boolean })?.success !== true) return;
          const articleId = articleIdFrom(req, body);
          if (!articleId) return;
          const session = await verifyMemberBearer(req);
          if (!session?.userId) return;
          await syncSmartEditRunsAfterSave({ articleId, actorId: session.userId, content });
        } catch (error) {
          console.warn("[smart-edit-runs] mobile save hook failed:", (error as Error)?.message);
        }
      })();
      return result;
    }) as Response["json"];
    next();
  };
}

router.post("/admin/articles", linkRunsAfterMobileSave((_req, body) => {
  const id = (body as { id?: unknown })?.id;
  return typeof id === "string" ? id : null;
}));
router.patch("/admin/articles/:id", linkRunsAfterMobileSave((req) => req.params.id || null));

export default router;
