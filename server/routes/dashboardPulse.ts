import { Router } from "express";
import { requireAuth, requireAnyPermission } from "../rbac";
import { getDashboardPulseStats } from "../services/dashboardPulseService";

const router: Router = Router();

router.get(
  "/api/admin/dashboard/pulse",
  requireAuth,
  requireAnyPermission("dashboard.view_stats", "articles.view"),
  async (_req, res) => {
    try {
      res.json(await getDashboardPulseStats());
    } catch (error) {
      console.error("[Dashboard Pulse] Failed to build newsroom pulse:", error);
      res.status(500).json({ message: "تعذر تحميل نبض غرفة الأخبار" });
    }
  },
);

export default router;
