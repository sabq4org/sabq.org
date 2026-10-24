import { Router } from "express";
import { z } from "zod";
import { logActivity, requireAuth, requireRole } from "../rbac";
import {
  getEditorAlertSettingsPublic,
  updateEditorAlertSettings,
} from "../services/editorAlerts";

const router: Router = Router();

router.get(
  "/api/admin/editor-alerts/settings",
  requireAuth,
  requireRole("admin"),
  async (_req, res) => {
    try {
      const settings = await getEditorAlertSettingsPublic();
      res.json(settings);
    } catch (error) {
      console.error("[Editor Alerts] Error fetching settings:", error);
      res.status(500).json({ message: "فشل في جلب إعدادات التنبيهات" });
    }
  },
);

const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  email: z.string().email().optional().or(z.literal("")),
  whatsappNumber: z.string().optional(),
  whatsappNumbers: z.array(z.string()).optional(),
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  aiCriticalAlertsEnabled: z.boolean().optional(),
  deskBotAlertEmails: z.array(z.string().trim().email()).optional(),
});

router.put(
  "/api/admin/editor-alerts/settings",
  requireAuth,
  requireRole("admin"),
  async (req: any, res) => {
    try {
      const parsed = updateSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: parsed.error.issues });
      }
      const settings = await updateEditorAlertSettings(parsed.data);
      const userId = req.user?.id;
      if (userId) {
        await logActivity({
          userId,
          action: "update",
          entityType: "system_setting",
          entityId: "editor_alerts",
          newValue: settings as Record<string, unknown>,
        });
      }
      res.json(settings);
    } catch (error) {
      console.error("[Editor Alerts] Error updating settings:", error);
      res.status(500).json({ message: "فشل في تحديث إعدادات التنبيهات" });
    }
  },
);

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
