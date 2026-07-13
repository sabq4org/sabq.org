import { Router, type Request } from "express";
import { requireAuth, requireAnyPermission } from "../rbac";
import { getDashboardPulseStats } from "../services/dashboardPulseService";
import { storage } from "../storage";

const router: Router = Router();

router.get(
  "/api/admin/dashboard/pulse",
  requireAuth,
  requireAnyPermission("dashboard.view_stats", "articles.view"),
  async (req: Request, res) => {
    try {
      const userId = (req.user as { id?: string } | undefined)?.id;
      const user = userId ? await storage.getUser(userId) : null;
      const assignedRoles = userId ? await storage.getUserRoles(userId).catch(() => []) : [];
      const roleNames = new Set([user?.role, ...assignedRoles.map((role) => role.name)].filter(Boolean));
      const isReporter = roleNames.has("reporter");
      const hasElevatedDashboardRole = ["admin", "superadmin", "system_admin", "editor", "chief_editor", "content_manager", "analyst"]
        .some((role) => roleNames.has(role));

      if (isReporter && !hasElevatedDashboardRole) {
        return res.status(403).json({ message: "هذه الإحصاءات غير متاحة لدور المراسل" });
      }

      res.json(await getDashboardPulseStats());
    } catch (error) {
      console.error("[Dashboard Pulse] Failed to build newsroom pulse:", error);
      res.status(500).json({ message: "تعذر تحميل نبض غرفة الأخبار" });
    }
  },
);

export default router;
