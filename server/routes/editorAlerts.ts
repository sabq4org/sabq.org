import { Router } from "express";
import { requireAuth, requireRole } from "../rbac";

const router: Router = Router();

// Test the critical AI-Hub WhatsApp alert path: sends a sample "credit exhausted"
// alert to the editor-in-chief's registered WhatsApp number(s), bypassing the
// throttle. Split out of server/routes.ts to keep that monolith under its
// max-lines cap (ADR-001). Sibling GET/PUT/POST-test routes still live inline.
router.post(
  "/api/admin/editor-alerts/test-ai",
  requireAuth,
  requireRole("admin"),
  async (req: any, res) => {
    try {
      const { sendAiCriticalAlert } = await import("../services/aiCriticalAlerts");
      const result = await sendAiCriticalAlert(
        {
          provider: "anthropic",
          modelId: "claude-3-5-sonnet (تجريبي)",
          prevStatus: "healthy",
          newStatus: "quota_exceeded",
          lastError: "رسالة تجريبية للتحقق من وصول تنبيهات الذكاء الاصطناعي عبر واتساب",
          lastErrorCode: "QUOTA_EXCEEDED",
        },
        { bypassThrottle: true },
      );
      res.json({
        success: result.sent > 0,
        sent: result.sent,
        attempted: result.attempted,
        skipped: result.skipped,
        message:
          result.sent > 0
            ? `تم إرسال تنبيه تجريبي إلى ${result.sent} رقم`
            : result.skipped === "no-recipients"
              ? "لا يوجد رقم واتساب مسجّل"
              : "تعذّر إرسال التنبيه التجريبي",
      });
    } catch (error) {
      console.error("[Editor Alerts] Error sending AI test alert:", error);
      res.status(500).json({
        success: false,
        message: "فشل في إرسال التنبيه التجريبي",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export default router;
