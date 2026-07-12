// إعدادات التكاملات — /api/admin/integrations/*
// محمي بـ requirePermission (لا فحوص نص الدور): الأدمن يمر تلقائياً عبر
// اختصار الـ superuser، وكودا integrations.view / integrations.manage
// مزروعان بـ scripts/seed-integrations-permissions.ts لمنحهما لأدوار أخرى.
//
// ملتزم بـ ADR-001: لا استيراد لـ db هنا — المنطق كله في
// server/services/integrationsStatusService.ts.

import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import {
  getStatuses,
  testAllIntegrations,
  testIntegration,
} from "../services/integrationsStatusService";

const router = Router();

router.use("/api/admin/integrations", requireAuth);

router.get(
  "/api/admin/integrations/status",
  requirePermission("integrations.view"),
  (_req, res) => {
    try {
      res.json({ integrations: getStatuses() });
    } catch (err) {
      console.error("[Integrations] status failed:", err);
      res.status(500).json({ message: "تعذر تحميل حالة التكاملات" });
    }
  },
);

router.post(
  "/api/admin/integrations/test-all",
  requirePermission("integrations.manage"),
  async (_req, res) => {
    try {
      res.json({ integrations: await testAllIntegrations() });
    } catch (err) {
      console.error("[Integrations] test-all failed:", err);
      res.status(500).json({ message: "فشل الفحص الشامل" });
    }
  },
);

router.post(
  "/api/admin/integrations/:key/test",
  requirePermission("integrations.manage"),
  async (req, res) => {
    try {
      res.json(await testIntegration(req.params.key));
    } catch (err) {
      if (err instanceof Error && err.message === "unknown_integration") {
        return res.status(404).json({ message: "تكامل غير معروف" });
      }
      console.error("[Integrations] test failed:", err);
      res.status(500).json({ message: "فشل فحص التكامل" });
    }
  },
);

export { router as integrationsStatusRouter };
