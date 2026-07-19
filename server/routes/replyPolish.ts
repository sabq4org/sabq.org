import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../rbac";
import { polishProfessionalReply } from "../services/professionalReplyService";

const router = Router();

const bodySchema = z.object({
  draft: z.string().trim().min(3, "اكتب مسودة الرد أولاً").max(4000),
  channel: z.enum(["contributor_ticket", "contact_message"]),
  recipientName: z.string().trim().max(200).optional().nullable(),
  subject: z.string().trim().max(300).optional().nullable(),
  originalMessage: z.string().trim().max(4000).optional().nullable(),
});

/**
 * POST /api/admin/ai/polish-reply
 * يحوّل مسودة الإدارة إلى رد مهني (ترحيب + شكر + تحرير + تقبّل تحياتي).
 */
router.post(
  "/api/admin/ai/polish-reply",
  requireAuth,
  requireRole("admin", "editor", "system_admin"),
  async (req, res) => {
    try {
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة",
        });
      }
      const reply = await polishProfessionalReply(parsed.data);
      res.json({ reply });
    } catch (error: any) {
      console.error("[reply-polish] failed:", error);
      res.status(500).json({
        message: error?.message || "تعذر توليد الرد",
      });
    }
  },
);

export default router;
