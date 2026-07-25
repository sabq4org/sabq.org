/**
 * The publishing decision itself — pure, with no database or RBAC imports.
 *
 * Kept separate from publishGate.ts on purpose: that module reaches for
 * `getUserPermissions` and `getPublishingGate`, which transitively require a
 * live database connection, so the rules could not be exercised in a unit
 * test. The two rules below are precisely the ones that regressed across six
 * endpoints, so they need to be pinned by tests.
 */

/**
 * Statuses that reach the public site.
 *
 * "scheduled" belongs here: `publishScheduledArticles()` in
 * server/notificationWorker.ts promotes any row with
 * `status="scheduled" AND scheduledAt <= now` to "published" and performs no
 * permission check of its own. Gating only "published" lets a contributor
 * publish by scheduling instead.
 */
export const PUBLISHING_STATUSES = new Set(["published", "scheduled"]);

export function isPublishingStatus(status: unknown): boolean {
  return typeof status === "string" && PUBLISHING_STATUSES.has(status);
}

export type PublishDenial = {
  httpStatus: number;
  message: string;
  code?: string;
};

/** Structural shape of `PublishingGate` — declared here to stay db-free. */
export type PublishGateState = {
  allowed: boolean;
  code: string;
  message?: string;
  publisher: { autoPublish?: boolean | null } | null;
};

export function decidePublish(input: {
  nextStatus: unknown;
  gate: PublishGateState;
  permissions: string[];
}): PublishDenial | null {
  const { nextStatus, gate, permissions } = input;

  if (!isPublishingStatus(nextStatus)) return null;

  // Publisher-agency accounts have a contractual publishing window
  // (`publishers.publishing_ends_at`). Once it closes they must be blocked
  // even though their role still carries the permission.
  if (gate.publisher && !gate.allowed) {
    return {
      httpStatus: 403,
      message: gate.message || "لا يمكن النشر من هذا الحساب حاليًا",
      code: gate.code,
    };
  }

  // الناشر الموثوق (auto_publish) ينشر دون articles.publish العامة —
  // بوابته المفتوحة هي التفويض.
  const canPublish =
    permissions.includes("articles.publish") ||
    (gate.allowed && gate.publisher?.autoPublish === true);

  if (!canPublish) {
    return {
      httpStatus: 403,
      message: "ليس لديك صلاحية نشر المقالات. يرجى الحفظ كمسودة.",
      code: "NO_PUBLISH_PERMISSION",
    };
  }

  return null;
}
