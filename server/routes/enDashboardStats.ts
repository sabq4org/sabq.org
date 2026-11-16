import { Router } from "express";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { canReadEnDashboardStats } from "@shared/enDashboardAccess";
import { getInactiveRoles } from "../services/roleStatusCache";

const router = Router();

// English dashboard overview stats (moved out of routes.ts).
router.get("/api/en/admin/dashboard/stats", isAuthenticated, async (req: any, res) => {
  try {
    const user = await storage.getUser(req.user.id);
    if (!user) return res.status(403).json({ message: "Forbidden" });
    const roles = await storage.getUserRoles(user.id).catch(() => []);
    // Disabled/archived roles grant nothing (same rule as getUserPermissionData).
    const { names: inactive, ids: inactiveIds } = await getInactiveRoles();
    const legacyRole = user.role && !inactive.has(user.role) ? user.role : null;
    const activeRoleNames = roles
      .filter((r) => !inactive.has(r.name) && !inactiveIds.has(r.id))
      .map((r) => r.name);
    if (!canReadEnDashboardStats(legacyRole, activeRoleNames)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(await storage.getEnglishAdminDashboardStats());
  } catch (error) {
    console.error("Error fetching English admin dashboard stats:", error);
    res.status(500).json({ message: "Failed to fetch English admin dashboard stats" });
  }
});

export default router;
