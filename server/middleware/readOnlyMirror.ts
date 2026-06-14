import type { Request, Response, NextFunction } from "express";

/**
 * وضع المرآة (Read-Only Mirror)
 *
 * يُفعّل عبر متغير البيئة READ_ONLY_MODE=true على نسخة السيرفر الثاني
 * (مثل news.sabq.org) التي تقرأ من Read Replica لقاعدة البيانات.
 *
 * مسؤوليتان:
 *  1. منع أي عملية كتابة على مستوى التطبيق (دفاع ثانٍ فوق صلاحية SELECT-only
 *     لمستخدم قاعدة البيانات). كل طلب غير GET/HEAD/OPTIONS يُرفض بـ 405.
 *  2. إخفاء المرآة بالكامل عن محركات البحث عبر ترويسة X-Robots-Tag على كل
 *     استجابة — يمنع عقوبة المحتوى المكرر ويُبقي news.sabq.org خارج فهرسة Google.
 */
export const isReadOnlyMirror = (): boolean =>
  process.env.READ_ONLY_MODE === "true";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function readOnlyMirrorGuard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!isReadOnlyMirror()) {
    return next();
  }

  // إخفاء كامل عن الفهرسة (يشمل SPA shell و API و أي مسار آخر).
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (!SAFE_METHODS.has(req.method)) {
    return res.status(405).json({
      error: "read_only_mirror",
      message:
        "هذا السيرفر للقراءة فقط (نسخة مرآة). عمليات الكتابة معطّلة هنا.",
    });
  }

  return next();
}
