import { Router, type NextFunction, type Request, type Response } from "express";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { canReadEnDashboardStats } from "@shared/enDashboardAccess";
import { canUserLogin } from "@shared/schema";
import { getInactiveRoles } from "../services/roleStatusCache";
import { ContentDutyConfigError, getContentDutyRoster } from "../services/contentDutyService";

const router = Router();

async function requireStaffDashboardAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as { id?: string } | undefined)?.id;
    const user = userId ? await storage.getUser(userId) : undefined;
    if (!user || !canUserLogin(user)) return res.status(403).json({ message: "Forbidden" });
    const roles = await storage.getUserRoles(user.id);
    const inactive = await getInactiveRoles();
    const activeRoles = roles
      .filter((role) => !inactive.names.has(role.name) && !inactive.ids.has(role.id))
      .map((role) => role.name);
    const legacyRole = user.role && !inactive.names.has(user.role) ? user.role : null;
    if (!canReadEnDashboardStats(legacyRole, activeRoles)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  } catch (error) {
    console.error("[ContentDuty] access check failed");
    return res.status(500).json({ message: "Failed to check access" });
  }
}

router.get(
  "/api/admin/dashboard/content-duty",
  isAuthenticated,
  requireStaffDashboardAccess,
  async (_req, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      return res.json(await getContentDutyRoster());
    } catch (error) {
      if (error instanceof ContentDutyConfigError) {
        return res.status(503).json({ error: error.code, message: "Content duty roster is not configured" });
      }
      console.error("[ContentDuty] roster failed");
      return res.status(500).json({ message: "Failed to load content duty roster" });
    }
  },
);

export default router;
