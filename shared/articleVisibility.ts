/**
 * Who may read an article that is not published (draft, scheduled, archived,
 * pending review...). Pure logic, shared by the public-read guard
 * (`server/routes/unpublishedArticleGuard.ts`) and its unit tests.
 *
 * `noindex` only asks search engines not to index a page; it is not access
 * control. Before this guard, anyone holding a draft or scheduled link could
 * read the full text on /article/:slug and /opinion/:slug (2026-10-16).
 */

/** Legacy `users.role` values that review or manage all newsroom content. */
export const UNPUBLISHED_VIEWER_ROLES = new Set([
  "admin",
  "system_admin",
  "system.admin",
  "superadmin",
  "super_admin",
  "editor",
  "editor_in_chief",
  "chief_editor",
  "senior_editor",
  "managing_editor",
  "editorial_manager",
  "content_manager",
]);

/** Effective permissions that imply reading any unpublished article. */
export const UNPUBLISHED_VIEWER_PERMISSIONS = [
  "*",
  "articles.edit_any",
  "articles.publish",
  "articles.schedule",
  "opinion.review",
  "opinion.edit_any",
];

export interface ArticleVisibilityRow {
  status: string | null;
  authorId: string | null;
  reporterId: string | null;
  submitterId?: string | null;
}

export interface ArticleViewer {
  id?: string | null;
  role?: string | null;
}

export function isPubliclyVisible(row: Pick<ArticleVisibilityRow, "status">): boolean {
  return row.status === "published";
}

/**
 * Decision without a permission lookup:
 * - "allow": published, or the viewer owns the article / holds an editorial role.
 * - "deny": anonymous viewer on an unpublished article.
 * - "check_permissions": logged in but neither owner nor editorial role; the
 *   caller resolves effective permissions and calls `permissionsAllow`.
 */
export function decideArticleVisibility(
  row: ArticleVisibilityRow,
  viewer: ArticleViewer | null | undefined,
): "allow" | "deny" | "check_permissions" {
  if (isPubliclyVisible(row)) return "allow";
  const userId = viewer?.id;
  if (!userId) return "deny";
  if (userId === row.authorId || userId === row.reporterId || userId === row.submitterId) {
    return "allow";
  }
  const role = String(viewer?.role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (UNPUBLISHED_VIEWER_ROLES.has(role) || UNPUBLISHED_VIEWER_ROLES.has(String(viewer?.role || ""))) {
    return "allow";
  }
  return "check_permissions";
}

export function permissionsAllow(permissions: readonly string[]): boolean {
  return UNPUBLISHED_VIEWER_PERMISSIONS.some((code) => permissions.includes(code));
}
