/**
 * Comment appeals — remediation channel for automated moderation decisions.
 *
 *   POST /api/comments/:id/appeal   صاحب التعليق المرفوض آليًا يطلب مراجعة بشرية
 *
 * القاعدة: اعتراض واحد لكل تعليق، ولصاحبه فقط، وعلى تعليق مرفوض فقط.
 * الاعتراض يعيد التعليق إلى طابور المراجعة (pending) حيث يحسمه مشرف بشري.
 * Drizzle queries live in commentInsightsService per ADR-001.
 */
import { Router } from "express";
import { requireAuth } from "../rbac";
import { appealRejectedComment } from "../services/commentInsightsService";

const router = Router();

router.post("/api/comments/:id/appeal", requireAuth, async (req: any, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    const outcome = await appealRejectedComment(req.params.id, req.user.id);

    switch (outcome) {
      case "queued":
        return res.json({
          success: true,
          message: "استلمنا اعتراضك — سيراجع تعليقك مشرف بشري وستصلك النتيجة.",
        });
      case "already_appealed":
        return res.status(409).json({
          success: false,
          message: "سبق تقديم اعتراض على هذا التعليق وهو قيد المراجعة أو تمت مراجعته.",
        });
      case "not_rejected":
        return res.status(409).json({
          success: false,
          message: "هذا التعليق ليس مرفوضًا، لا حاجة للاعتراض.",
        });
      case "not_owner":
      case "not_found":
      default:
        // نفس الرد للحالتين حتى لا يُستخدم المسار لاستكشاف تعليقات الآخرين
        return res.status(404).json({ success: false, message: "التعليق غير موجود." });
    }
  } catch (error) {
    console.error("[Comment Appeals] Failed to process appeal:", error);
    return res.status(500).json({ success: false, message: "تعذّر تقديم الاعتراض، حاول مجددًا." });
  }
});

export default router;
