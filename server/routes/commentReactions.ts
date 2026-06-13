/**
 * Likes on article/opinion comments (the shared `comments` table).
 *
 *   POST   /api/comments/:id/like               like a comment
 *   DELETE /api/comments/:id/like               remove a like
 *   GET    /api/articles/:slug/comments/my-likes  ids the viewer liked (overlay)
 *
 * All three are per-user and MUST NOT be cached — the like routes mutate, and
 * my-likes is user-specific (overlaid client-side onto the neutral cached
 * comments payload). Drizzle queries live in commentReactionsService per
 * ADR-001 (this module never imports `db`).
 */
import { Router } from "express";
import { requireAuth } from "../rbac";
import {
  likeComment,
  unlikeComment,
  getLikedCommentIdsBySlug,
} from "../services/commentReactionsService";

const router = Router();

function noStore(res: any) {
  res.set("Cache-Control", "private, no-store");
}

router.post("/api/comments/:id/like", requireAuth, async (req: any, res) => {
  try {
    const result = await likeComment(req.params.id, req.user.id);
    noStore(res);
    if (!result) return res.status(404).json({ message: "Comment not found" });
    res.json(result);
  } catch (error) {
    console.error("[CommentReactions] like error:", error);
    res.status(500).json({ message: "Failed to like comment" });
  }
});

router.delete("/api/comments/:id/like", requireAuth, async (req: any, res) => {
  try {
    const result = await unlikeComment(req.params.id, req.user.id);
    noStore(res);
    if (!result) return res.status(404).json({ message: "Comment not found" });
    res.json(result);
  } catch (error) {
    console.error("[CommentReactions] unlike error:", error);
    res.status(500).json({ message: "Failed to unlike comment" });
  }
});

router.get("/api/articles/:slug/comments/my-likes", requireAuth, async (req: any, res) => {
  try {
    const ids = await getLikedCommentIdsBySlug(req.params.slug, req.user.id);
    noStore(res);
    res.json(ids);
  } catch (error) {
    console.error("[CommentReactions] my-likes error:", error);
    res.status(500).json({ message: "Failed to fetch liked comments" });
  }
});

export default router;
