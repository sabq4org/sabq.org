import { Router } from "express";
import { requireAuth, requirePermission, logActivity } from "../rbac";
import { memoryCache } from "../memoryCache";
import { permanentlyDeleteArchivedEnArticles } from "../services/enArticleDeletionService";

/**
 * «Delete permanently» in the English article list. The button called this
 * path since it was built, but it never existed (404).
 */
const router = Router();

router.post(
  "/api/en/dashboard/articles/bulk-delete-permanent",
  requireAuth,
  requirePermission("articles.delete"),
  async (req: any, res) => {
    try {
      const raw = req.body?.articleIds;
      const ids = Array.isArray(raw) ? raw.filter((id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 64) : [];
      if (ids.length === 0 || ids.length > 200) return res.status(400).json({ message: "Article IDs are required (max 200)" });

      const result = await permanentlyDeleteArchivedEnArticles(ids);
      if (!result.ok) {
        return res.status(400).json({ message: "Only archived articles can be permanently deleted", nonArchivedCount: result.nonArchivedCount });
      }

      memoryCache.invalidatePattern("^en:article:base:");
      memoryCache.invalidatePattern("^articles:");
      memoryCache.invalidatePattern("^article:");
      await logActivity({
        userId: req.user.id,
        action: "bulk_deleted_permanent",
        entityType: "en_article",
        entityId: result.deleted.map((r) => r.id).join(","),
        oldValue: { articles: result.deleted.map((r) => ({ id: r.id, title: r.title, slug: r.englishSlug || r.slug })) },
        metadata: { ip: req.ip, userAgent: req.get("user-agent"), reason: typeof req.body?.deletionReason === "string" ? req.body.deletionReason.slice(0, 500) : undefined },
      }).catch((error: unknown) => console.error("[EN delete] activity log failed:", error));

      res.json({ message: `${result.deleted.length} articles permanently deleted`, deletedCount: result.deleted.length });
    } catch (error) {
      console.error("[EN delete] permanent delete failed:", error);
      res.status(500).json({ message: "Failed to delete articles" });
    }
  },
);

export default router;
