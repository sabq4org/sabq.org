import { Router } from "express";
import { requireAuth, requirePermission, requireAnyPermission } from "../rbac";
import { bulkMediaOperation, type BulkMediaAction } from "../services/mediaLibraryService";
import { generateSmartCaption } from "../services/mediaCaptionService";
import { analyzeAndTagMedia, backfillUntagged } from "../services/mediaAutoTagService";
import { semanticSearchMedia, backfillMediaEmbeddings } from "../services/mediaSearchService";
import { saveGeneratedImage } from "../services/mediaGenerationService";
import { getMediaStats } from "../services/mediaStatsService";
import { isAllowedMediaUrl } from "../utils/mediaUrl";

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

// POST /api/media/:id/retag - re-run AI auto-tagging for a single image (e.g. to
// retry a "failed" row, or refresh tags). Gated by media.edit. Non-destructive:
// only fills empty keywords/altText/description.
router.post(
  "/api/media/:id/retag",
  requireAuth,
  requirePermission("media.edit"),
  async (req: any, res) => {
    try {
      const status = await analyzeAndTagMedia(req.params.id);
      res.json({ status });
    } catch (error: any) {
      console.error("Error retagging media:", error);
      res.status(500).json({ message: "فشل في تحليل الصورة" });
    }
  },
);

// POST /api/media/backfill-tags - analyze a bounded batch of not-yet-tagged
// archive images and report how many remain, so the UI can loop until done.
// Gated by media.edit.
router.post(
  "/api/media/backfill-tags",
  requireAuth,
  requirePermission("media.edit"),
  async (req: any, res) => {
    try {
      const batch = Number(req.body?.batchSize) || 6;
      const result = await backfillUntagged(batch);
      res.json(result);
    } catch (error: any) {
      console.error("Error backfilling media tags:", error);
      res.status(500).json({ message: "فشل في تحليل دفعة الصور" });
    }
  },
);

// GET /api/media/semantic-search - "بحث دلالي": rank library images by meaning
// against an embedding of the query (not keyword match). Gated by media.view.
router.get(
  "/api/media/semantic-search",
  requireAuth,
  requirePermission("media.view"),
  async (req: any, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      if (!q.trim()) {
        return res.json({ files: [], total: 0, capped: false });
      }
      const limit = Number(req.query.limit) || 30;
      const folderId = typeof req.query.folderId === "string" ? req.query.folderId : null;
      const category = typeof req.query.category === "string" ? req.query.category : null;

      const result = await semanticSearchMedia(q, { limit, folderId, category });
      res.json(result);
    } catch (error: any) {
      console.error("Error in semantic media search:", error);
      res.status(500).json({ message: "فشل في البحث الدلالي" });
    }
  },
);

// POST /api/media/embeddings/backfill - index a bounded batch of not-yet-embedded
// archive images for semantic search, reporting how many remain so the UI can
// loop until the library is fully indexed. Gated by media.edit.
router.post(
  "/api/media/embeddings/backfill",
  requireAuth,
  requirePermission("media.edit"),
  async (req: any, res) => {
    try {
      const batch = Number(req.body?.batchSize) || 8;
      const result = await backfillMediaEmbeddings(batch);
      res.json(result);
    } catch (error: any) {
      console.error("Error backfilling media embeddings:", error);
      res.status(500).json({ message: "فشل في فهرسة دفعة الصور" });
    }
  },
);

// POST /api/media/save-generated - persist an AI-generated image (Phase 5) into
// the library. The image URL must already point at our own storage (the
// nano-banana service uploaded it). Gated by media.upload. Auto-tags + embeds.
router.post(
  "/api/media/save-generated",
  requireAuth,
  requirePermission("media.upload"),
  async (req: any, res) => {
    try {
      const { imageUrl, thumbnailUrl, prompt, model, folderId } = req.body || {};
      if (!imageUrl || typeof imageUrl !== "string") {
        return res.status(400).json({ message: "رابط الصورة مطلوب" });
      }
      if (!isAllowedMediaUrl(imageUrl, req.headers?.host)) {
        return res.status(400).json({ message: "رابط الصورة غير مسموح" });
      }
      const result = await saveGeneratedImage({
        imageUrl,
        thumbnailUrl: typeof thumbnailUrl === "string" ? thumbnailUrl : null,
        prompt: typeof prompt === "string" ? prompt : "",
        model: typeof model === "string" ? model : null,
        folderId: typeof folderId === "string" ? folderId : null,
        userId: req.user.id,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Error saving generated image:", error);
      res.status(500).json({ message: "فشل في حفظ الصورة المولّدة" });
    }
  },
);

// GET /api/media/stats - library governance dashboard (Phase 6): totals, license
// mix, storage, top-used. Gated by media.view.
router.get(
  "/api/media/stats",
  requireAuth,
  requirePermission("media.view"),
  async (_req: any, res) => {
    try {
      const stats = await getMediaStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching media stats:", error);
      res.status(500).json({ message: "فشل في جلب إحصائيات المكتبة" });
    }
  },
);

export default router;
