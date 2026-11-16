import { Router } from "express";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { canReadEnDashboardStats } from "@shared/enDashboardAccess";

const router = Router();

// English dashboard overview stats (moved out of routes.ts).
router.get("/api/en/admin/dashboard/stats", isAuthenticated, async (req: any, res) => {
  try {
    const user = await storage.getUser(req.user.id);
    if (!user) return res.status(403).json({ message: "Forbidden" });
    const roles = await storage.getUserRoles(user.id).catch(() => []);
    if (!canReadEnDashboardStats(user.role, roles.map((r) => r.name))) {
      return res.status(403).json({ message: "Forbidden" });
    }
    res.json(await storage.getEnglishAdminDashboardStats());
  } catch (error) {
    console.error("Error fetching English admin dashboard stats:", error);
    res.status(500).json({ message: "Failed to fetch English admin dashboard stats" });
  }
});

export default router;
