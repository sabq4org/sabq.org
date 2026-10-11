// مسارات لوحة «النشر أولاً»: أعلام التشغيل، تاريخ المقال، واسترجاع مراجعة.
// لا استعلام Drizzle هنا — البيانات في publishFirstService.

import { Router } from "express";
import { requireAuth, requirePermission, getUserRoleNames } from "../rbac";
import { isPublishFirstAdmin } from "@shared/publishFirst";
import {
  editorDisplayName,
  getPublishFirstFlags,
  listArticlePublishFirstHistory,
  rollbackArticleRevision,
  setPublishFirstFlags,
} from "../services/publishFirstService";

const router = Router();

router.get(
  "/api/admin/publish-first/flags",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (_req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const flags = await getPublishFirstFlags();
    res.json({
      flags,
      defaults: {
        validation: true,
        revisionHistory: true,
        updateLine: true,
      },
      keys: {
        validation: "publish_first_validation",
        revisionHistory: "publish_first_revision_history",
        updateLine: "publish_first_update_line",
      },
    });
  },
);

router.put(
  "/api/admin/publish-first/flags",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const body = req.body ?? {};
    const patch: Partial<Awaited<ReturnType<typeof getPublishFirstFlags>>> = {};
    for (const name of ["validation", "revisionHistory", "updateLine"] as const) {
      if (typeof body[name] === "boolean") patch[name] = body[name];
    }
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "أرسل علماً واحداً على الأقل بقيمة true أو false" });
    }
    const flags = await setPublishFirstFlags(patch);
    res.json({ flags });
  },
);

router.get(
  "/api/admin/articles/:id/publish-first",
  requireAuth,
  requirePermission("articles.view"),
  async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    try {
      const history = await listArticlePublishFirstHistory(req.params.id);
      res.json(history);
    } catch (error) {
      console.error("[publish-first] history failed", error);
      res.status(500).json({ message: "تعذر قراءة تاريخ النشر" });
    }
  },
);

router.post(
  "/api/admin/articles/:id/revisions/:revisionId/rollback",
  requireAuth,
  async (req: any, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const roles = await getUserRoleNames(userId);
    if (!isPublishFirstAdmin({ role: req.user?.role, roles, permissions: req.user?.permissions })) {
      return res.status(403).json({ message: "استرجاع المراجعة للمسؤول فقط" });
    }
    try {
      const editorName = await editorDisplayName(userId);
      const result = await rollbackArticleRevision({
        articleId: req.params.id,
        revisionId: req.params.revisionId,
        editorUserId: userId,
        editorName,
      });
      if (!result.ok) return res.status(404).json({ message: result.message });
      res.json({ ok: true, article: result.article });
    } catch (error) {
      console.error("[publish-first] rollback failed", error);
      res.status(500).json({ message: "تعذر استرجاع المراجعة" });
    }
  },
);

export default router;
