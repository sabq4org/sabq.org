/**
 * Who may read the English dashboard overview stats.
 * Mirrors the Arabic /api/admin/dashboard/stats rule: any staff role
 * (legacy `users.role` or an RBAC role other than "reader"). The old EN check
 * only accepted the literal legacy roles editor/admin/reporter, so
 * system_admin / superadmin accounts got 403 and an empty dashboard.
 */
const STAFF_ROLES = new Set([
  "admin",
  "superadmin",
  "system_admin",
  "system.admin",
  "editor",
  "chief_editor",
  "content_manager",
  "analyst",
  "moderator",
  "comments_moderator",
  "publisher",
  "writer",
  "content_creator",
  "opinion_author",
  "reporter",
]);

export function canReadEnDashboardStats(
  legacyRole: string | null | undefined,
  rbacRoleNames: readonly string[],
): boolean {
  if (legacyRole && STAFF_ROLES.has(legacyRole)) return true;
  return rbacRoleNames.some((name) => STAFF_ROLES.has(name) || (name && name !== "reader"));
}
