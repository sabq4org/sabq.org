import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import {
  createLegacyRedirect,
  findArticleForSocialPreview,
  findArticleIdBySlug,
  LegacyRedirectConflictError,
  updateArticleViewsBySlug,
  updateAvgReadTimeOverrideBySlug,
  updateCompletionRateOverrideBySlug,
} from "../services/adminToolsService";
import {
  isSocialPreviewRefreshConfigured,
  refreshArticleSocialPreviews,
} from "../services/socialPreviewRefresh";
import { invalidateArticleWrite } from "../services/contentInvalidation";

const router = Router();

router.get(
  "/api/admin/article-id/:slug",
  requireAuth,
  requirePermission("articles.view"),
  async (req, res) => {
    try {
      const article = await findArticleIdBySlug(req.params.slug);
      if (!article) {
        return res.status(404).json({ message: "الخبر غير موجود" });
      }
      res.json({ id: article.id, title: article.title, locale: article.locale });
    } catch (error) {
      console.error("Error getting article ID:", error);
      res.status(500).json({ message: "فشل في استخراج معرف الخبر" });
    }
  },
);

router.post(
  "/api/admin/legacy-redirects",
  requireAuth,
  requirePermission("system.settings"),
  async (req, res) => {
    try {
      const { oldPath, newPath, redirectType } = req.body ?? {};
      if (!oldPath || !newPath) {
        return res.status(400).json({ message: "الرجاء إدخال الرابط القديم والجديد" });
      }

      const userId = (req.user as { id?: string } | undefined)?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const redirect = await createLegacyRedirect({
        oldPath,
        newPath,
        redirectType,
        createdBy: userId,
      });
      res.json({ success: true, redirect });
    } catch (error) {
      if (error instanceof LegacyRedirectConflictError) {
        return res.status(409).json({ message: error.message });
      }
      console.error("[LegacyRedirect] Error creating redirect:", error);
      res.status(500).json({ message: "فشل في إنشاء التحويل" });
    }
  },
);

router.post(
  "/api/admin/update-views",
  requireAuth,
  requirePermission("articles.edit"),
  async (req, res) => {
    try {
      const { slug, viewCount } = req.body ?? {};
      if (!slug || viewCount === undefined) {
        return res.status(400).json({ message: "الرجاء إدخال الرابط وعدد المشاهدات" });
      }

      const views = Number(viewCount);
      if (!Number.isFinite(views) || !Number.isInteger(views) || views < 0) {
        return res.status(400).json({ message: "عدد المشاهدات يجب أن يكون رقماً صحيحاً" });
      }

      const article = await updateArticleViewsBySlug(slug, views);
      if (!article) {
        return res.status(404).json({ message: "الخبر غير موجود" });
      }

      res.json({
        success: true,
        article: { id: article.id, title: article.title, views: article.views },
        locale: article.locale,
      });
    } catch (error) {
      console.error("Error updating views:", error);
      res.status(500).json({ message: "فشل في تحديث عدد المشاهدات" });
    }
  },
);

router.post(
  "/api/admin/update-read-time",
  requireAuth,
  requirePermission("articles.edit"),
  async (req, res) => {
    try {
      const { slug, avgReadTime } = req.body ?? {};
      if (!slug || avgReadTime === undefined) {
        return res.status(400).json({ message: "الرجاء إدخال الرابط ومتوسط زمن القراءة" });
      }

      const seconds = Number(avgReadTime);
      if (!Number.isFinite(seconds) || seconds < 0 || !Number.isInteger(seconds)) {
        return res.status(400).json({ message: "متوسط زمن القراءة يجب أن يكون رقماً صحيحاً بالثواني" });
      }

      const article = await updateAvgReadTimeOverrideBySlug(slug, seconds);
      if (!article) {
        return res.status(404).json({ message: "الخبر غير موجود" });
      }

      res.json({ success: true, article, locale: article.locale });
    } catch (error) {
      console.error("Error updating read time:", error);
      res.status(500).json({ message: "فشل في تحديث متوسط زمن القراءة" });
    }
  },
);

router.post(
  "/api/admin/update-completion-rate",
  requireAuth,
  requirePermission("articles.edit"),
  async (req, res) => {
    try {
      const { slug, completionRate } = req.body ?? {};
      if (!slug || completionRate === undefined) {
        return res.status(400).json({ message: "الرجاء إدخال الرابط ونسبة الإكمال" });
      }

      const rate = Number(completionRate);
      if (!Number.isFinite(rate) || !Number.isInteger(rate) || rate < 0 || rate > 100) {
        return res.status(400).json({ message: "نسبة الإكمال يجب أن تكون رقماً صحيحاً بين 0 و 100" });
      }

      const article = await updateCompletionRateOverrideBySlug(slug, rate);
      if (!article) {
        return res.status(404).json({ message: "الخبر غير موجود" });
      }

      res.json({ success: true, article, locale: article.locale });
    } catch (error) {
      console.error("Error updating completion rate:", error);
      res.status(500).json({ message: "فشل في تحديث نسبة الإكمال" });
    }
  },
);

/**
 * Force-refresh WhatsApp/Facebook link previews for an article.
 * Purges our CDN first, then asks Meta Graph to re-scrape the public URL(s).
 */
router.post(
  "/api/admin/refresh-social-preview",
  requireAuth,
  requirePermission("articles.edit"),
  async (req, res) => {
    try {
      const slug =
        typeof req.body?.slug === "string"
          ? req.body.slug.trim()
          : typeof req.body?.url === "string"
            ? String(req.body.url)
                .replace(/^https?:\/\/[^/]+\/(?:en\/|ur\/)?article\//, "")
                .replace(/[?#].*$/, "")
                .trim()
            : "";

      if (!slug) {
        return res.status(400).json({
          message: "الرجاء إدخال slug الخبر أو رابطه",
        });
      }

      const article = await findArticleForSocialPreview(slug);
      if (!article) {
        return res.status(404).json({ message: "الخبر غير موجود" });
      }

      // Ensure crawlers hit fresh HTML/meta before Meta scrapes.
      invalidateArticleWrite(article, { reason: "social-preview-refresh" });

      const summary = await refreshArticleSocialPreviews(article);

      res.json({
        success: summary.success,
        configured: summary.configured || isSocialPreviewRefreshConfigured(),
        message: summary.message,
        article: {
          id: article.id,
          title: article.title,
          slug: article.slug,
          englishSlug: article.englishSlug,
          status: article.status,
          imageUrl: article.imageUrl,
          locale: article.locale,
        },
        results: summary.results,
        tips: {
          whatsapp:
            "واتساب يعتمد على زحف فيسبوك — بعد Scrape Again أعد لصق الرابط في محادثة جديدة",
          twitter:
            "تويتر/X لا يوفّر واجهة إعادة زحف عامة؛ جرّب مشاركة الرابط بعد دقائق أو استخدم بطاقة جديدة",
        },
      });
    } catch (error) {
      console.error("[refresh-social-preview] error:", error);
      res.status(500).json({ message: "فشل في تحديث معاينة المشاركة" });
    }
  },
);

export default router;
