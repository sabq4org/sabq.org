/**
 * The single authority on "may this user put an article in front of readers?".
 *
 * Before this existed, every article surface implemented the check its own way:
 * the Arabic admin create path had the full check, the Arabic PATCH path only
 * looked at "published", the English create/update paths had no check at all,
 * and the Urdu path had the check sitting after an unconditional `return` —
 * dead code. The result was six ways for a contributor to reach the live site.
 *
 * This module does the two lookups (permissions, publisher window); the
 * decision itself lives in ./publishGateRules so it stays db-free and unit
 * testable — see tests/unit/publishGate.test.ts.
 */
import { getUserPermissions } from "../rbac";
import { getPublishingGate } from "./publisherPortalService";
import { decidePublish, isPublishingStatus, type PublishDenial } from "./publishGateRules";

export {
  PUBLISHING_STATUSES,
  isPublishingStatus,
  decidePublish,
  type PublishDenial,
} from "./publishGateRules";

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
  // Skip both lookups entirely when the status isn't a publishing one — this
  // runs on every article write.
  if (!isPublishingStatus(nextStatus)) return null;

  if (!userId) {
    return { httpStatus: 401, message: "يجب تسجيل الدخول للنشر" };
  }

  const [gate, permissions] = await Promise.all([
    getPublishingGate(userId),
    getUserPermissions(userId),
  ]);

  return decidePublish({ nextStatus, gate, permissions });
}
