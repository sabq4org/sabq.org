/**
 * Public-read guard for unpublished articles (draft, scheduled, archived,
 * pending review...).
 *
 * The public article endpoints below resolve a row by slug with no status
 * filter, so a draft or scheduled article was readable in full by anyone with
 * the link (/article/:slug and /opinion/:slug in the SPA), only marked
 * `noindex` (2026-10-16). Instead of patching every handler in the capped
 * monoliths (routes.ts, storage.ts), this guard runs before them for every GET
 * under these prefixes, sub-resources included (comments, ai-bullets,
 * summary-audio...), and answers 404 to anyone who may not read the article.
 * Allowed: the article's author/reporter/submitter, editorial roles, and users
 * with an editorial permission (`shared/articleVisibility.ts`).
 *
 * Missing rows and non-article keys (e.g. /api/articles/featured) pass through
 * untouched; each handler keeps its own 404. Mobile `/api/v1/articles/:id`
 * already filters `status = 'published'` and web-next's seo-bundle already
 * 404s unpublished rows, so neither is mounted here.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { decideArticleVisibility, permissionsAllow } from "@shared/articleVisibility";
import { getArticleVisibilityRow, type ArticleLang } from "../services/articleVisibilityService";
import { getEffectiveUserPermissions } from "../rbac";

const router = Router();

const GUARDED_PREFIXES: Array<{ path: string; lang: ArticleLang }> = [
  { path: "/api/articles/:articleKey", lang: "ar" },
  { path: "/api/opinion/:articleKey", lang: "ar" },
  { path: "/api/en/articles/:articleKey", lang: "en" },
  { path: "/api/ur/articles/:articleKey", lang: "ur" },
  { path: "/api/ur/article/:articleKey", lang: "ur" },
];

function guardFor(lang: ArticleLang) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const key = String(req.params.articleKey || "");
    if (!key) return next();
    try {
      const row = await getArticleVisibilityRow(lang, key);
      if (!row) return next();
      const viewer = req.user as { id?: string; role?: string } | undefined;
      let decision = decideArticleVisibility(row, viewer);
      if (decision === "check_permissions" && viewer?.id) {
        decision = permissionsAllow(await getEffectiveUserPermissions(viewer.id)) ? "allow" : "deny";
      }
      if (decision === "allow") {
        // A staff/owner view of a draft must never land in a shared cache.
        if (row.status !== "published") res.setHeader("Cache-Control", "private, no-store");
        return next();
      }
      res.setHeader("Cache-Control", "no-store");
      return res.status(404).json({ message: "Article not found" });
    } catch (error) {
      // Pass through on a DB error: failing closed would turn a pool hiccup
      // into a site-wide article outage, while the handlers serve only
      // published rows from their caches and need the same DB to read a draft.
      console.error("[unpublishedArticleGuard] lookup failed:", error);
      return next();
    }
  };
}

for (const { path, lang } of GUARDED_PREFIXES) {
  router.use(path, guardFor(lang));
}

export default router;
