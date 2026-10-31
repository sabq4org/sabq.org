// POST /api/v1/articles/images — رفع صورة واحدة لخبر أو مقال قبل إرساله من
// الجوال، فيرسل التطبيق بعدها روابط الصور في /articles/submit بدل base64
// لكل الصور في طلب واحد (يفشل كله على شبكة ميدانية ضعيفة).
// الجسم: { image: "data:image/jpeg;base64,...", slot?: "hero" | "album-3" }
// يعيد 201 { success, url }. للكتّاب والمراسلين والمحررين فقط، بجلسة Bearer.

import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { canSubmitFromMobile } from "@shared/mobileSubmission";
import { verifyMemberBearer } from "../services/memberSessionService";
import { loadMobileSubmitter, uploadMobileSubmissionImage } from "../services/mobileSubmissionService";

const router = Router();

type AuthedRequest = Request & { submissionUserId?: string };

const bodySchema = z.object({
  image: z.string().min(32),
  slot: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,32}$/)
    .optional(),
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: () => Number(process.env.MOBILE_SUBMISSION_IMAGE_RATE_LIMIT) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => `mobile-submission-image:${(req as AuthedRequest).submissionUserId ?? "anonymous"}`,
  handler: (_req, res) =>
    res.status(429).json({ success: false, code: "rate_limited", message: "صور كثيرة خلال وقت قصير؛ انتظر قليلاً" }),
});

router.post(
  "/articles/images",
  async (req: AuthedRequest, res: Response, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const session = await verifyMemberBearer(req);
      if (!session) {
        return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب لرفع الصور" });
      }
      req.submissionUserId = session.userId;
      return next();
    } catch (error) {
      console.error("[Mobile Submission] auth failed:", error);
      return res.status(500).json({ success: false, message: "تعذر التحقق من الجلسة" });
    }
  },
  uploadLimiter,
  async (req: AuthedRequest, res: Response) => {
    try {
      const userId = req.submissionUserId as string;
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: "بيانات الصورة غير صالحة" });
      }

      const submitter = await loadMobileSubmitter(userId);
      if (!submitter) {
        return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
      }
      if (!canSubmitFromMobile(submitter)) {
        return res.status(403).json({
          success: false,
          message: "رفع الصور متاح للكتّاب والمراسلين فقط.",
        });
      }

      const result = await uploadMobileSubmissionImage({
        userId,
        dataUri: parsed.data.image,
        slot: parsed.data.slot || "img",
      });
      if (!result.ok) {
        return res.status(result.status).json({ success: false, message: result.message });
      }
      return res.status(201).json({ success: true, url: result.url });
    } catch (error) {
      console.error("[Mobile Submission] /articles/images error:", error);
      return res.status(500).json({ success: false, message: "تعذر رفع الصورة. حاول لاحقاً." });
    }
  },
);

export default router;
