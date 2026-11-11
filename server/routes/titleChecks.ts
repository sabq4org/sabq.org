import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import {
  getTitleCheckForArticle,
  isTitleCheckEnabled,
  listFlaggedTitleChecks,
} from "../services/titleConsistencyService";

const router: Router = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  all: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => value === "true" || value === "1"),
});

// فحص الظل لتطابق العنوان مع المتن (Gemini Decisions): قراءة فقط، معلوماتي.
// «راجع العنوان» = احتمال دقة العنوان أقل من 0.5. لا يمنع النشر.
router.get(
  "/api/internal/title-checks",
  requireAuth,
  requirePermission("articles.view"),
  async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "معاملات غير صالحة", issues: parsed.error.issues });
    }
    const { limit, offset, all } = parsed.data;
    const enabled = isTitleCheckEnabled();
    try {
      const items = await listFlaggedTitleChecks({ limit, offset, includeAll: all });
      res.json({ enabled, items, limit, offset });
    } catch (error) {
      const err = error as { code?: string; cause?: { code?: string } } | null;
      if (err?.code === "42P01" || err?.cause?.code === "42P01") {
        return res.json({ enabled, items: [], limit, offset, tableMissing: true });
      }
      console.error("[TitleCheck] list failed:", error);
      res.status(500).json({ message: "تعذر جلب فحوص العناوين" });
    }
  },
);

function isTableMissing(error: unknown): boolean {
  const err = error as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "42P01" || err?.cause?.code === "42P01";
}

const articleIdSchema = z.string().trim().min(1).max(64);

// آخر فحص لخبر واحد، لإشعار «راجع العنوان» في المحرر. قراءة فقط.
router.get(
  "/api/internal/title-checks/article/:articleId",
  requireAuth,
  requirePermission("articles.view"),
  async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const parsed = articleIdSchema.safeParse(req.params.articleId);
    if (!parsed.success) {
      return res.status(400).json({ message: "معرف الخبر غير صالح" });
    }
    const enabled = isTitleCheckEnabled();
    try {
      const item = await getTitleCheckForArticle(parsed.data);
      res.json({ enabled, item });
    } catch (error) {
      if (isTableMissing(error)) return res.json({ enabled, item: null, tableMissing: true });
      console.error("[TitleCheck] article lookup failed:", error);
      res.status(500).json({ message: "تعذر جلب فحص العنوان" });
    }
  },
);

export default router;
