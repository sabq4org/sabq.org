import summaryAudioSettingsRouter from "./summaryAudioSettings";
import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requirePermission } from "../rbac";
import { TOURNAMENT_BLOCK_KEYS } from "../services/tournamentBlockSettings";
import {
  DASHBOARD_THEME_IDS,
  DASHBOARD_THEME_SETTING_KEY,
  DEFAULT_DASHBOARD_THEME_ID,
  isDashboardThemeId,
  parseDashboardThemeId,
} from "@shared/dashboard-theme";

const router: Router = Router();
router.use(summaryAudioSettingsRouter);

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

// Get DMS top-ads visibility (public - web + apps read it)
router.get("/api/system/dms-top-ads", async (req, res) => {
  try {
    const setting = await storage.getSystemSetting("dms_top_ads_visibility");
    res.json({ showTopAds: setting?.showTopAds ?? true });
  } catch (error) {
    console.error("Error fetching DMS top ads visibility:", error);
    res.json({ showTopAds: true });
  }
});

// Update DMS top-ads visibility (admin only)
router.post("/api/system/dms-top-ads", requireAuth, requirePermission("system.manage_settings"), async (req: any, res) => {
  try {
    const { showTopAds } = req.body;

    await storage.upsertSystemSetting("dms_top_ads_visibility", { showTopAds: !!showTopAds }, "system", true);

    res.json({ success: true, showTopAds: !!showTopAds });
  } catch (error) {
    console.error("Error updating DMS top ads visibility:", error);
    res.status(500).json({ message: "Failed to update DMS top ads visibility" });
  }
});

// Tournament home-block settings (world-cup / gulf-cup / asian-cup) —
// GET public (web + apps read it), POST admin-only. Partial merge so the
// visibility toggle, the schedule window, and the manual-champion select
// can each save independently. See services/tournamentBlockSettings.ts.
for (const [slug, settingKey] of Object.entries(TOURNAMENT_BLOCK_KEYS)) {
  router.get(`/api/system/${slug}-block`, async (req, res) => {
    try {
      const setting = await storage.getSystemSetting(settingKey);
      res.json({
        visible: setting?.visible ?? true,
        manualChampionTeamId: setting?.manualChampionTeamId ?? null,
        startAt: setting?.startAt ?? null,
        endAt: setting?.endAt ?? null,
      });
    } catch (error) {
      console.error(`Error fetching ${slug} block settings:`, error);
      res.json({ visible: true, manualChampionTeamId: null, startAt: null, endAt: null });
    }
  });

  router.post(`/api/system/${slug}-block`, requireAuth, requirePermission("system.manage_settings"), async (req: any, res) => {
    try {
      const { visible, manualChampionTeamId, startAt, endAt } = req.body;
      const current = (await storage.getSystemSetting(settingKey)) ?? {};

      // نافذة التوقيت: null = مسح الحدّ، نص ISO صالح = تعيينه، غير مرسل = إبقاؤه
      const isoOrNull = (v: any) =>
        typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;

      const next = {
        visible: visible !== undefined ? !!visible : (current.visible ?? true),
        manualChampionTeamId:
          manualChampionTeamId !== undefined
            ? (manualChampionTeamId == null ? null : Number(manualChampionTeamId) || null)
            : (current.manualChampionTeamId ?? null),
        startAt: startAt !== undefined ? isoOrNull(startAt) : (current.startAt ?? null),
        endAt: endAt !== undefined ? isoOrNull(endAt) : (current.endAt ?? null),
      };

      await storage.upsertSystemSetting(settingKey, next, "system", true);

      res.json({ success: true, ...next });
    } catch (error) {
      console.error(`Error updating ${slug} block settings:`, error);
      res.status(500).json({ message: `Failed to update ${slug} block settings` });
    }
  });
}

// Org-wide dashboard shell theme (shared by all users)
router.get("/api/system/dashboard-theme", async (_req, res) => {
  try {
    const setting = await storage.getSystemSetting(DASHBOARD_THEME_SETTING_KEY);
    const themeId = parseDashboardThemeId(setting?.themeId ?? setting);
    res.json({ themeId });
  } catch (error) {
    console.error("Error fetching dashboard theme:", error);
    res.json({ themeId: DEFAULT_DASHBOARD_THEME_ID });
  }
});

router.post(
  "/api/system/dashboard-theme",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (req: any, res) => {
    try {
      const themeId = parseDashboardThemeId(req.body?.themeId);
      if (!isDashboardThemeId(req.body?.themeId)) {
        return res.status(400).json({
          message: "Invalid themeId",
          allowed: DASHBOARD_THEME_IDS,
        });
      }

      await storage.upsertSystemSetting(
        DASHBOARD_THEME_SETTING_KEY,
        { themeId },
        "appearance",
        true,
      );

      res.json({ success: true, themeId });
    } catch (error) {
      console.error("Error updating dashboard theme:", error);
      res.status(500).json({ message: "Failed to update dashboard theme" });
    }
  },
);

export default router;
