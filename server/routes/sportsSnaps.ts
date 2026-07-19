/**
 * المسار العام للقطات VARA الذكية. لا يستورد db؛ القراءة والتوليد الكسول داخل
 * services/sportsSnaps/feed التزامًا بـ ADR-001.
 */
import type { Express, Request, Response } from "express";
import { isSaudiLeagueConfigured } from "../services/saudiLeagueService";
import { getTeamSnaps } from "../services/sportsSnaps/feed";
import { isSportsSnapsEnabled } from "../services/sportsSnaps/config";

export function registerSportsSnapsRoutes(app: Express): void {
  app.get("/api/sports/snaps/team/:teamId", async (req: Request, res: Response) => {
    try {
      if (!isSportsSnapsEnabled()) return res.status(404).json({ success: false, error: "not_found" });
      if (!isSaudiLeagueConfigured()) {
        return res.status(503).json({ success: false, configured: false, snaps: [] });
      }

      const teamId = Number(req.params.teamId);
      if (!Number.isInteger(teamId) || teamId <= 0) {
        return res.status(400).json({ success: false, error: "invalid_team_id" });
      }

      const snaps = await getTeamSnaps(teamId);
      res.json({ success: true, configured: true, snaps });
    } catch (error) {
      console.error("[SportsSnaps] public team feed failed:", error);
      res.status(500).json({ success: false, error: "snaps_failed", snaps: [] });
    }
  });
}
