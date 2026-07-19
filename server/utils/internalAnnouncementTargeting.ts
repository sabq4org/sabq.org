export interface InternalAnnouncementAudience {
  audienceRoles: string[] | null;
  audienceUserIds: string[] | null;
}

function normalizeTargets(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/**
 * Empty role/user targeting means everyone. Otherwise access is granted only
 * by an exact role-name match or an explicit user id.
 */
export function matchesInternalAnnouncementAudience(
  announcement: InternalAnnouncementAudience,
  userId: string,
  userRoles: string[],
): boolean {
  const audienceRoles = normalizeTargets(announcement.audienceRoles);
  const audienceUserIds = normalizeTargets(announcement.audienceUserIds);

  if (audienceRoles.length === 0 && audienceUserIds.length === 0) {
    return true;
  }

  if (audienceUserIds.includes(userId)) {
    return true;
  }

  return audienceRoles.some((role) => userRoles.includes(role));
}
