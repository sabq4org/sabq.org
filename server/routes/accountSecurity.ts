import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../rbac";
import { changeWebPassword } from "../services/accountSecurityService";

const router = Router();

const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "محاولات كثيرة. حاول لاحقًا." },
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
});

/**
 * POST /api/account/change-password
 * تغيير كلمة المرور طوعيًا من مركز الإعدادات (جلسة Passport).
 */
router.post(
  "/api/account/change-password",
  requireAuth,
  changePasswordLimiter,
  async (req: any, res: Response) => {
    try {
      const userId = req.user?.id as string | undefined;
      if (!userId) {
        return res.status(401).json({ message: "غير مصرح" });
      }

      const { currentPassword, newPassword } = req.body ?? {};
      const result = await changeWebPassword({
        userId,
        currentPassword,
        newPassword,
        currentSessionId: req.sessionID,
      });

      if (!result.ok) {
        return res.status(result.status).json({ message: result.message });
      }

      return res.json({ message: "تم تغيير كلمة المرور بنجاح" });
    } catch (error) {
      console.error("[accountSecurity] change-password error:", error);
      return res.status(500).json({ message: "خطأ في تغيير كلمة المرور" });
    }
  },
);

export default router;
