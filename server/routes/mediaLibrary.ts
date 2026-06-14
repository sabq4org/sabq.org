import { Router } from "express";
import { requireAuth, requirePermission, requireAnyPermission } from "../rbac";
import { bulkMediaOperation, type BulkMediaAction } from "../services/mediaLibraryService";
import { generateSmartCaption } from "../services/mediaCaptionService";

const router: Router = Router();

const VALID_ACTIONS: BulkMediaAction[] = ["move", "delete", "favorite", "unfavorite"];

// POST /api/media/bulk - bulk move/delete/(un)favorite over selected media files.
// Gated by media.view (blocks readers); per-item ownership + media.edit/delete
// are enforced inside the service.
router.post("/api/media/bulk", requireAuth, requirePermission("media.view"), async (req: any, res) => {
  try {
    const { action, ids, folderId } = req.body || {};
    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ message: "عملية غير مدعومة" });
    }
    const result = await bulkMediaOperation(req.user.id, action, ids, folderId);
    res.json(result);
  } catch (error: any) {
    if (error?.statusCode === 400) {
      return res.status(400).json({ message: error.message });
    }
    console.error("Error in bulk media operation:", error);
    res.status(500).json({ message: "فشل في تنفيذ العملية الجماعية" });
  }
});

// POST /api/media/analyze - "صورة جاهزة للخبر": analyze an image with AI and
// return an Arabic alt text + caption (+ keywords, relevance, quality, content
// warnings) so the writer can one-click-fill the hero image metadata. Gated by
// article-edit / media permissions (any writer who can edit an article).
router.post(
  "/api/media/analyze",
  requireAuth,
  requireAnyPermission("articles.create", "articles.edit_own", "articles.edit_any", "media.view"),
  async (req: any, res) => {
    try {
      const { imageUrl, articleTitle, articleContent } = req.body || {};
      if (!imageUrl || typeof imageUrl !== "string") {
        return res.status(400).json({ message: "رابط الصورة مطلوب" });
      }

      const result = await generateSmartCaption({
        imageUrl,
        articleTitle: typeof articleTitle === "string" ? articleTitle : undefined,
        articleContent: typeof articleContent === "string" ? articleContent : undefined,
      });

      res.json(result);
    } catch (error: any) {
      if (error?.statusCode === 502) {
        return res.status(502).json({ message: error.message });
      }
      console.error("Error analyzing media image:", error);
      res.status(500).json({ message: "فشل في تحليل الصورة" });
    }
  },
);

export default router;
