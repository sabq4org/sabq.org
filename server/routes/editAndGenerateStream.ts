// POST /api/articles/edit-and-generate/stream — «تحرير وتوليد شامل» ببث SSE.
//
// نفس منطق /api/articles/edit-and-generate (services/editAndGenerateService) لكن
// يرسل أثناء التنفيذ: `delta` (نص إعادة الصياغة حرفًا بحرف)، `reset` (بدأت محاولة
// جديدة بعد فشل)، `phase` (اكتمال كل فرع)، ثم `result` بالحمولة الكاملة أو `error`.
// الواجهة تسقط تلقائيًا إلى المسار العادي إن لم تصلها استجابة SSE.
import { Router } from "express";
import { isAuthenticated } from "../auth";
import { requireAnyPermission } from "../rbac";
import { editAndGenerateErrorResponse, runEditAndGenerate } from "../services/editAndGenerateService";

const router = Router();

const HEARTBEAT_MS = 15_000;

router.post(
  "/api/articles/edit-and-generate/stream",
  isAuthenticated,
  requireAnyPermission("articles.create", "articles.edit_any", "articles.edit_own"),
  async (req, res) => {
    const { content, language = "ar" } = (req.body ?? {}) as { content?: unknown; language?: "ar" | "en" | "ur" };
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ message: "يجب توفير محتوى الخبر" });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    let closed = false;
    req.on("close", () => {
      closed = true;
    });
    const send = (event: string, data: unknown) => {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    // تعليق SSE دوري يمنع الوسطاء من قطع الاتصال أثناء الانتظار الطويل
    const heartbeat = setInterval(() => {
      if (!closed) res.write(`: ping\n\n`);
    }, HEARTBEAT_MS);

    try {
      console.log("[Edit+Generate API] Processing (SSE) with parallel AI calls...");
      const payload = await runEditAndGenerate({
        content,
        language,
        onEvent: (ev) => send(ev.type, ev),
      });
      send("result", payload);
    } catch (error) {
      console.error("[Edit+Generate API] ❌ SSE error:", (error as Error)?.message || error);
      const { message, errorType } = editAndGenerateErrorResponse(error);
      send("error", { message, errorType });
    } finally {
      clearInterval(heartbeat);
      if (!closed) res.end();
    }
  },
);

export const editAndGenerateStreamRouter = router;
