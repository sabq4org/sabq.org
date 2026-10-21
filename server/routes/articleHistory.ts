// السجل الزمني الكامل للمادة في المحرر: الأحداث والنسخ، مقارنة نسختين، والاسترجاع.
// لا استعلام Drizzle هنا — البيانات في articleHistoryService.

import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import { resolveRestoreFields } from "@shared/articleHistory";
import {
  getArticleHistory,
  getArticleVersionPair,
  restoreArticleVersion,
} from "../services/articleHistoryService";
import { invalidateArticleWrite } from "../services/contentInvalidation";

const router = Router();

router.get(
  "/api/admin/articles/:id/history",
  requireAuth,
  requirePermission("articles.view"),
  async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      res.json(await getArticleHistory(req.params.id));
    } catch (error) {
      console.error("[article-history] read failed", error);
      res.status(500).json({ message: "تعذر قراءة سجل المادة" });
    }
  },
);

router.get(
  "/api/admin/articles/:id/versions/:versionId",
  requireAuth,
  requirePermission("articles.view"),
  async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const compareTo = typeof req.query.compareTo === "string" ? req.query.compareTo : null;
      const pair = await getArticleVersionPair(req.params.id, req.params.versionId, compareTo);
      if (!pair) return res.status(404).json({ message: "النسخة غير موجودة" });
      res.json(pair);
    } catch (error) {
      console.error("[article-history] version read failed", error);
      res.status(500).json({ message: "تعذر قراءة النسخة" });
    }
  },
);

router.post(
  "/api/admin/articles/:id/versions/:versionId/restore",
  requireAuth,
  requirePermission("articles.edit_any"),
  async (req: any, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const fields = resolveRestoreFields(req.body?.fields);
    if (!fields) return res.status(400).json({ message: "حقول الاسترجاع غير صالحة" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : null;
    try {
      const result = await restoreArticleVersion({
        articleId: req.params.id,
        versionId: req.params.versionId,
        fields,
        actorId: userId,
        reason,
      });
      if (!result.ok) {
        return res.status(result.status).json({ message: result.message, code: (result as any).code });
      }
      invalidateArticleWrite(result.article, {
        reason: "article-version-restore",
        oldSlug: result.before.slug,
        oldEnglishSlug: result.before.englishSlug,
        warm: result.article.status === "published",
      });
      res.json({ ok: true, article: result.article });
    } catch (error) {
      console.error("[article-history] restore failed", error);
      res.status(500).json({ message: "تعذر استرجاع النسخة" });
    }
  },
);

export default router;
