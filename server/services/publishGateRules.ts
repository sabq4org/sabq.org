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

/** حالة المادة بعد «إرسال للمراجعة»: الحية (مجدولة/منشورة) تبقى على حالتها،
 * وما دونها يعود مسودة. كانت نقاط submit-review تُسقط المادة الحية إلى مسودة
 * بلا شرط فتموت الجدولة بصمت (حادثة 2026-08-08). */
export function statusAfterSubmitForReview(currentStatus: string): string {
  return isPublishingStatus(currentStatus) ? currentStatus : "draft";
}

export type ArticleEditFlags = {
  hasAllPerms: boolean;
  canEditOwn: boolean;
  canEditAny: boolean;
};

/** أعلام التحرير من الصلاحيات الفعلية لـgetEffectiveUserPermissions — تفهم
 * "*" (صيغة الحساب الإداري) ومكافئات opinion.* على مواد الرأي. */
export function resolveArticleEditFlags(
  permissions: string[],
  articleType: unknown,
): ArticleEditFlags {
  const isOpinion = articleType === "opinion";
  const hasAllPerms = permissions.includes("*") || permissions.includes("system.admin");
  return {
    hasAllPerms,
    canEditOwn:
      permissions.includes("articles.edit_own") ||
      (isOpinion && permissions.includes("opinion.edit_own")),
    canEditAny:
      hasAllPerms ||
      permissions.includes("articles.edit_any") ||
      (isOpinion && permissions.includes("opinion.edit_any")),
  };
}

export type DemotionDecision =
  | { action: "pass" }
  | { action: "ignore" }
  | { action: "forbid"; httpStatus: number; message: string; code: string };

/**
 * حارس الهبوط: مادة مجدولة/منشورة لا تُنزَّل إلى «مسودة» ضمنيًا. زر «حفظ
 * كمسودة» على مادة حية كان يرسل status:"draft" حرفيًا فيقتل الجدولة بصمت —
 * وكرون النشر (notificationWorker.publishScheduledArticles) يستعلم عن
 * status='scheduled' فقط فلا تُنشر المادة أبدًا ولا يُنبَّه أحد (حادثة
 * 2026-08-08). الحفظ الاعتيادي يُبقي الحالة (ignore = احذف status من
 * التحديث)، والإنزال الصريح يمرّ فقط بعلم confirmStatusDowngrade مع صلاحية
 * نشر/إلغاء نشر.
 */
export function decideStatusDemotion(input: {
  requestedStatus: unknown;
  currentStatus: string;
  confirmed: boolean;
  permissions: string[];
  articleType: unknown;
}): DemotionDecision {
  const { requestedStatus, currentStatus, confirmed, permissions, articleType } = input;
  if (requestedStatus !== "draft" || !isPublishingStatus(currentStatus)) {
    return { action: "pass" };
  }
  if (!confirmed) return { action: "ignore" };
  const canDowngrade =
    permissions.includes("*") ||
    permissions.includes("system.admin") ||
    permissions.includes("articles.unpublish") ||
    permissions.includes("articles.publish") ||
    (articleType === "opinion" && permissions.includes("opinion.edit_any"));
  if (!canDowngrade) {
    return {
      action: "forbid",
      httpStatus: 403,
      message: "سحب مادة مجدولة/منشورة إلى مسودة يتطلب صلاحية نشر",
      code: "STATUS_DOWNGRADE_FORBIDDEN",
    };
  }
  return { action: "pass" };
}

export function decidePublish(input: {
  nextStatus: unknown;
  gate: PublishGateState;
  permissions: string[];
  deniedPermissionCodes?: string[];
}): PublishDenial | null {
  const { nextStatus, gate, permissions } = input;

  if (!isPublishingStatus(nextStatus)) return null;

  // Personal denial wins over every grant, including publisher auto-publish.
  // Superuser permission data deliberately supplies no personal denies.
  if (input.deniedPermissionCodes?.includes("articles.publish")) {
    return { httpStatus: 403, message: "ليس لديك صلاحية نشر المقالات. يرجى الحفظ كمسودة.", code: "NO_PUBLISH_PERMISSION" };
  }

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
