import { Router } from "express";
import { storage } from "../storage";
import { requireAuth } from "../rbac";
import { isDashboardThemeId } from "@shared/dashboard-theme";

const router: Router = Router();

/**
 * Personal dashboard theme for the signed-in user.
 * null themeId = follow the organization default from system_settings.
 */
router.get("/api/user/dashboard-theme", requireAuth, async (req: any, res) => {
  try {
    const prefs = await storage.getUserFullPreferences(req.user.id);
    const raw = prefs?.dashboardThemeId ?? null;
    const themeId = isDashboardThemeId(raw) ? raw : null;
    res.json({ themeId });
  } catch (error) {
    console.error("Error fetching personal dashboard theme:", error);
    res.status(500).json({ message: "Failed to fetch dashboard theme preference" });
  }
});

router.put("/api/user/dashboard-theme", requireAuth, async (req: any, res) => {
  try {
    const raw = req.body?.themeId;
    if (raw === null || raw === "" || raw === undefined) {
      await storage.updateUserFullPreferences(req.user.id, { dashboardThemeId: null });
      return res.json({ success: true, themeId: null });
    }
    if (!isDashboardThemeId(raw)) {
      return res.status(400).json({ message: "Invalid themeId" });
    }
    await storage.updateUserFullPreferences(req.user.id, { dashboardThemeId: raw });
    res.json({ success: true, themeId: raw });
  } catch (error) {
    console.error("Error updating personal dashboard theme:", error);
    res.status(500).json({ message: "Failed to update dashboard theme preference" });
  }
});

export default router;
