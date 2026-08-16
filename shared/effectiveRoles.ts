/**
 * دمج إشارات الدور (عمود users.role + صفوف user_roles).
 * مصدر واحد لعرض العضوية وبوابات المنسوب — حتى لا يظهر المراسل «قارئ»
 * إذا بقيت إحدى الطبقتين على reader.
 */

export const READER_LIKE_ROLE_KEYS = new Set([
  "reader",
  "user",
  "subscriber",
  "guest",
  "",
]);

export const STAFF_ROLE_KEYS = new Set([
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
  "moderator",
  "comments_moderator",
  "reporter",
  "correspondent",
  "journalist",
  "opinion_author",
  "publisher",
  "writer",
  "author",
  "article_writer",
  "article_author",
  "columnist",
  "content_creator",
  "angle_writer",
  "media_manager",
  "photographer",
]);

export function normalizeRoleKey(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, "_") || "";
}

export function isReaderLikeRole(role?: string | null): boolean {
  return READER_LIKE_ROLE_KEYS.has(normalizeRoleKey(role));
}

export function isStaffRole(role?: string | null): boolean {
  return STAFF_ROLE_KEYS.has(normalizeRoleKey(role));
}

export function mergeRoleSignals(
  rbacRoles: Array<string | null | undefined>,
  legacyRole?: string | null,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const raw of [...rbacRoles, legacyRole]) {
    const key = normalizeRoleKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(key);
  }

  const staff = merged.filter((role) => isStaffRole(role));
  if (staff.length > 0) return staff;

  const nonReader = merged.filter((role) => !isReaderLikeRole(role));
  if (nonReader.length > 0) return nonReader;

  return merged.length > 0 ? merged : ["reader"];
}

export function primaryRoleKey(roles: string[]): string {
  return roles[0] ?? "reader";
}
