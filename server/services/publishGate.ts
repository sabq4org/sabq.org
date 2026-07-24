/**
 * The single authority on "may this user put an article in front of readers?".
 *
 * Before this existed, every article surface implemented the check its own way:
 * the Arabic admin create path had the full check, the Arabic PATCH path only
 * looked at "published", the English create/update paths had no check at all,
 * and the Urdu path had the check sitting after an unconditional `return` —
 * dead code. The result was six ways for a contributor to reach the live site.
 *
 * Two rules that are easy to get wrong and are centralised here:
 *
 *  1. "scheduled" IS a publishing status. `publishScheduledArticles()` in
 *     server/notificationWorker.ts promotes any row with
 *     `status="scheduled" AND scheduledAt <= now` to "published" with no
 *     permission check of its own. Gating only "published" lets a contributor
 *     publish by scheduling instead.
 *  2. Publisher-agency accounts have a contractual publishing window
 *     (`publishers.publishing_ends_at`). Once it closes they must be blocked
 *     even though their role still carries the permission.
 */
import { getUserPermissions } from "../rbac";
import { getPublishingGate, type PublishingGate } from "./publisherPortalService";

/** Statuses that reach the public site — directly, or via the scheduler. */
export const PUBLISHING_STATUSES = new Set(["published", "scheduled"]);

export function isPublishingStatus(status: unknown): boolean {
  return typeof status === "string" && PUBLISHING_STATUSES.has(status);
}

export type PublishDenial = {
  httpStatus: number;
  message: string;
  code?: string;
};

/**
 * Returns null when the user may move an article into `nextStatus`, or a
 * ready-to-send denial when they may not. Non-publishing statuses (draft,
 * pending review, archived…) always return null — this gate is only about
 * reaching readers.
 *
 * Usage:
 *   const denial = await denyPublish(req.user?.id, body.status);
 *   if (denial) return res.status(denial.httpStatus).json({ message: denial.message, code: denial.code });
 */
export async function denyPublish(
  userId: string | undefined | null,
  nextStatus: unknown,
): Promise<PublishDenial | null> {
  if (!isPublishingStatus(nextStatus)) return null;
  if (!userId) return { httpStatus: 401, message: "يجب تسجيل الدخول للنشر" };

  const [gate, permissions] = await Promise.all([
    getPublishingGate(userId),
    getUserPermissions(userId),
  ]);

  return decidePublish({ nextStatus, gate, permissions });
}

/**
 * The decision itself, separated from the two lookups above so it can be
 * exercised directly — the "scheduled counts as publishing" rule is the kind
 * of thing that silently regresses.
 */
export function decidePublish(input: {
  nextStatus: unknown;
  gate: PublishingGate;
  permissions: string[];
}): PublishDenial | null {
  const { nextStatus, gate, permissions } = input;
  if (!isPublishingStatus(nextStatus)) return null;

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
