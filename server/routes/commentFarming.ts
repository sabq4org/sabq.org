/**
 * Comment-farming dashboard for editors.
 *
 *   GET /api/admin/comments/suspicious-accounts?days=7|30&limit=50
 *
 * Ranks accounts by comment-farming suspicion (junk ratio, daily volume,
 * repeated text) computed on the fly from `comments`. Returns user id +
 * display name only — no email or phone. "frozen" accounts currently earn no
 * engagement points (services/commentSuspicion.ts).
 * Drizzle queries live in commentSuspicion per ADR-001.
 */
import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { getSuspiciousAccounts, SUSPICION_RULES } from "../services/commentSuspicion";

const router = Router();

router.get(
  "/api/admin/comments/suspicious-accounts",
  requireAuth,
  requirePermission("comments.moderate"),
  async (req: any, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const days = Number(req.query.days) === 30 ? 30 : 7;
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
      const accounts = await getSuspiciousAccounts(days, limit);
      res.json({ days, rules: SUSPICION_RULES, accounts });
    } catch (error) {
      console.error("[Comment Farming] Failed to load suspicious accounts:", error);
      res.status(500).json({ message: "تعذّر جلب الحسابات المشبوهة" });
    }
  },
);

export default router;
