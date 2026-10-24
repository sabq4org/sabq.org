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

/**
 * ترتيب أولوية الأدوار (الأعلى فهرساً = الأعلى سلطة/أولوية).
 * متوافق مع ROLE_HIERARCHY في client/src/hooks/useAuth.ts بحيث يظل المحرر أو
 * المسؤول في دوره الأساسي حتى لو أُضيف له دور مساهم (مثل reporter) في user_roles.
 */
export const ROLE_PRIORITY_ORDER: readonly string[] = [
  "reader",
  "content_creator",
  "writer",
  "author",
  "article_writer",
  "article_author",
  "columnist",
  "angle_writer",
  "media_manager",
  "photographer",
  "comments_moderator",
  "moderator",
  "opinion_author",
  "reporter",
  "correspondent",
  "journalist",
  "content_manager",
  "publisher",
  "editor",
  "senior_editor",
  "managing_editor",
  "editorial_manager",
  "chief_editor",
  "editor_in_chief",
  "admin",
  "system_admin",
  "system.admin",
  "superadmin",
  "super_admin",
];

/** الأدوار الإشرافية/التحريرية في غرفة الأخبار (تعلو على أدوار المساهمين). */
export const SUPERVISORY_STAFF_ROLE_KEYS = new Set([
  "super_admin",
  "superadmin",
  "system.admin",
  "system_admin",
  "admin",
  "editor_in_chief",
  "chief_editor",
  "editorial_manager",
  "managing_editor",
  "senior_editor",
  "editor",
  "content_manager",
]);

/** أدوار المساهمين التي تُقيَّد واجهاتها عندما تكون هي الدور الوحيد للمستخدم. */
export const CONTRIBUTOR_ROLE_KEYS = new Set([
  "reporter",
  "correspondent",
  "journalist",
  "opinion_author",
  "angle_writer",
  "publisher",
]);

export function normalizeRoleKey(value?: string | null): string {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, "_") || "";
}

export function rolePriority(role?: string | null): number {
  const key = normalizeRoleKey(role);
  if (!key) return -1;
  return ROLE_PRIORITY_ORDER.indexOf(key);
}

export function isReaderLikeRole(role?: string | null): boolean {
  return READER_LIKE_ROLE_KEYS.has(normalizeRoleKey(role));
}

export function isStaffRole(role?: string | null): boolean {
  return STAFF_ROLE_KEYS.has(normalizeRoleKey(role));
}

export function isSupervisoryStaffRole(role?: string | null): boolean {
  return SUPERVISORY_STAFF_ROLE_KEYS.has(normalizeRoleKey(role));
}

export function collectNormalizedUserRoles(
  userOrRoles?:
    | {
        role?: string | null;
        roles?: Array<string | { name?: string | null } | null | undefined> | null;
      }
    | Array<string | { name?: string | null } | null | undefined>
    | null,
): string[] {
  if (!userOrRoles) return [];
  const rawList: Array<string | null | undefined> = [];
  if (Array.isArray(userOrRoles)) {
    for (const item of userOrRoles) {
      if (typeof item === "string" || item == null) rawList.push(item);
      else if (typeof item === "object" && "name" in item) rawList.push(item.name);
    }
  } else {
    if (userOrRoles.role) rawList.push(userOrRoles.role);
    if (Array.isArray(userOrRoles.roles)) {
      for (const item of userOrRoles.roles) {
        if (typeof item === "string" || item == null) rawList.push(item);
        else if (typeof item === "object" && "name" in item) rawList.push(item.name);
      }
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawList) {
    const key = normalizeRoleKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function hasSupervisoryStaffRole(
  userOrRoles?: Parameters<typeof collectNormalizedUserRoles>[0],
): boolean {
  return collectNormalizedUserRoles(userOrRoles).some((r) => isSupervisoryStaffRole(r));
}

/**
 * يتحقق مما إذا كان المستخدم يحمل دور المساهم المحدد (مثل reporter أو opinion_author)
 * دون أن يملك دوراً تحريرياً/إشرافياً أعلى (مثل editor أو admin).
 */
export function isContributorRoleOnly(
  userOrRoles: Parameters<typeof collectNormalizedUserRoles>[0],
  contributorRole: string,
): boolean {
  const roles = collectNormalizedUserRoles(userOrRoles);
  const target = normalizeRoleKey(contributorRole);
  if (!target || !roles.includes(target)) return false;
  return !roles.some((r) => isSupervisoryStaffRole(r));
}

/**
 * فحص excludeRoles للقوائم والمسارات المحمية:
 * استبعاد أدوار المساهمين (مثل reporter / opinion_author) يهدف لتبسيط الواجهة
 * للمساهم المتفرغ، ولا يجوز أن يحجب أقسام لوحة التحكم أو المسارات عن محرر/مسؤول
 * أُضيف له دور مساهم ثانوي (مثل مراسل ليظهر في قائمة المراسلين).
 */
export function isRoleExcluded(
  userOrRoles: Parameters<typeof collectNormalizedUserRoles>[0],
  excludeRoles?: readonly string[] | null,
): boolean {
  if (!excludeRoles || excludeRoles.length === 0) return false;
  const roles = collectNormalizedUserRoles(userOrRoles);
  if (roles.length === 0) return false;
  const hasSupervisory = roles.some((r) => isSupervisoryStaffRole(r));
  return excludeRoles.some((excluded) => {
    const key = normalizeRoleKey(excluded);
    if (!key || !roles.includes(key)) return false;
    if (hasSupervisory && CONTRIBUTOR_ROLE_KEYS.has(key)) {
      return false;
    }
    return true;
  });
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

export function primaryRoleKey(roles: Array<string | null | undefined>): string {
  let highestKnown: string | null = null;
  let highestPriority = -1;
  let firstUnknown: string | null = null;

  for (const raw of roles) {
    const key = normalizeRoleKey(raw);
    if (!key) continue;
    const priority = rolePriority(key);
    if (priority > highestPriority) {
      highestPriority = priority;
      highestKnown = key;
    } else if (priority === -1 && key !== "reader" && !firstUnknown) {
      firstUnknown = key;
    }
  }

  if (highestPriority > 0 && highestKnown) {
    return highestKnown;
  }
  if (firstUnknown) {
    return firstUnknown;
  }
  return highestKnown ?? "reader";
}

/** يختار سجل الدور الأعلى أولوية من قائمة أدوار المستخدم (لبطاقات العرض الإدارية). */
export function pickPrimaryRoleRecord<T extends { name?: string | null; roleName?: string | null }>(
  records: readonly T[],
): T | undefined {
  let best: T | undefined;
  let bestPriority = -2;
  for (const rec of records) {
    const rawName = rec.name ?? rec.roleName;
    const key = normalizeRoleKey(rawName);
    const p = rolePriority(key);
    const effectivePriority = p >= 0 ? p : key && key !== "reader" ? 0.5 : -1;
    if (!best || effectivePriority > bestPriority) {
      best = rec;
      bestPriority = effectivePriority;
    }
  }
  return best;
}
