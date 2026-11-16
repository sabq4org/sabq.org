import { Router, type NextFunction, type Request, type Response } from "express";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { canReadEnDashboardStats } from "@shared/enDashboardAccess";
import { getInactiveRoles } from "../services/roleStatusCache";
import { getEnDeskOverview } from "../services/enDeskOverviewService";

const router = Router();

/** Staff only; disabled/archived roles grant nothing (same rule as getUserPermissionData). */
async function requireEnDeskAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as { id?: string } | undefined)?.id;
    const user = userId ? await storage.getUser(userId) : undefined;
    if (!user) return res.status(403).json({ message: "Forbidden" });
    const roles = await storage.getUserRoles(user.id).catch(() => []);
    const { names: inactive, ids: inactiveIds } = await getInactiveRoles();
    const legacyRole = user.role && !inactive.has(user.role) ? user.role : null;
    const activeRoleNames = roles
      .filter((r) => !inactive.has(r.name) && !inactiveIds.has(r.id))
      .map((r) => r.name);
    if (!canReadEnDashboardStats(legacyRole, activeRoleNames)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  } catch (error) {
    console.error("[EN Desk] access check failed:", error);
    res.status(500).json({ message: "Failed to check access" });
  }
}

// English dashboard analytics stats (moved out of routes.ts).
router.get("/api/en/admin/dashboard/stats", isAuthenticated, requireEnDeskAccess, async (_req, res) => {
  try {
    res.json(await storage.getEnglishAdminDashboardStats());
  } catch (error) {
    console.error("Error fetching English admin dashboard stats:", error);
    res.status(500).json({ message: "Failed to fetch English admin dashboard stats" });
  }
});

// English Desk home: needs-you list, translation pulse, published today.
router.get("/api/en/admin/desk-overview", isAuthenticated, requireEnDeskAccess, async (_req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await getEnDeskOverview());
  } catch (error) {
    console.error("[EN Desk] overview failed:", error);
    res.status(500).json({ message: "Failed to load the English Desk overview" });
  }
});

export default router;
