import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requirePermission } from "../rbac";

const router: Router = Router();

// Get system announcement (public)
router.get("/api/system/announcement", async (req, res) => {
  try {
    const announcement = await storage.getSystemSetting("announcement");

    if (!announcement) {
      return res.json({ isActive: false, message: "", type: "info" });
    }

    res.json(announcement);
  } catch (error) {
    console.error("Error fetching announcement:", error);
    res.status(500).json({ message: "Failed to fetch announcement" });
  }
});

// Update system announcement (admin only)
router.post("/api/system/announcement", requireAuth, requirePermission("system.manage_settings"), async (req: any, res) => {
  try {
    const { message, type, isActive, durationType, expiresAt } = req.body;

    const announcementData = {
      message: message || "",
      type: type || "info",
      isActive: isActive !== undefined ? isActive : false,
      durationType: durationType || "never",
      expiresAt: expiresAt || null,
    };

    await storage.upsertSystemSetting("announcement", announcementData, "system", true);

    res.json({ success: true, announcement: announcementData });
  } catch (error) {
    console.error("Error updating announcement:", error);
    res.status(500).json({ message: "Failed to update announcement" });
  }
});

// Get stats visibility setting (public - no auth required)
router.get("/api/system/stats-visibility", async (req, res) => {
  try {
    const setting = await storage.getSystemSetting("stats_visibility");
    res.json({ showStats: setting?.showStats ?? true });
  } catch (error) {
    console.error("Error fetching stats visibility:", error);
    res.json({ showStats: true });
  }
});

// Update stats visibility setting (admin only)
router.post("/api/system/stats-visibility", requireAuth, requirePermission("system.manage_settings"), async (req: any, res) => {
  try {
    const { showStats } = req.body;

    await storage.upsertSystemSetting("stats_visibility", { showStats: !!showStats }, "system", true);

    res.json({ success: true, showStats: !!showStats });
  } catch (error) {
    console.error("Error updating stats visibility:", error);
    res.status(500).json({ message: "Failed to update stats visibility" });
  }
});

// Get iFox block visibility setting (public - no auth required)
router.get("/api/system/ifox-block-visibility", async (req, res) => {
  try {
    const setting = await storage.getSystemSetting("ifox_block_visibility");
    res.json({ showIFoxBlock: setting?.showIFoxBlock ?? true });
  } catch (error) {
    console.error("Error fetching iFox block visibility:", error);
    res.json({ showIFoxBlock: true });
  }
});

// Update iFox block visibility setting (admin only)
router.post("/api/system/ifox-block-visibility", requireAuth, requirePermission("system.manage_settings"), async (req: any, res) => {
  try {
    const { showIFoxBlock } = req.body;

    await storage.upsertSystemSetting("ifox_block_visibility", { showIFoxBlock: !!showIFoxBlock }, "system", true);

    res.json({ success: true, showIFoxBlock: !!showIFoxBlock });
  } catch (error) {
    console.error("Error updating iFox block visibility:", error);
    res.status(500).json({ message: "Failed to update iFox block visibility" });
  }
});

export default router;
