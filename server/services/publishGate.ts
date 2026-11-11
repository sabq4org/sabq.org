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
import { getUserPermissionData } from "../rbac";
import { getPublishingGate } from "./publisherPortalService";
import { decidePublish, isPublishingStatus, type PublishDenial } from "./publishGateRules";
import { BANNED_WORD_FIELDS, type BannedWordContent, type BannedWordMatch } from "@shared/publishBannedWords";
import { denyBannedWords } from "./publishBannedWordsService";

export { denyBannedWords };
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

  const [gate, permissionData] = await Promise.all([
    getPublishingGate(userId),
    getUserPermissionData(userId),
  ]);

  return decidePublish({
    nextStatus,
    gate,
    permissions: permissionData.permissions,
    deniedPermissionCodes: permissionData.deniedPermissionCodes,
  });
}

/**
 * بوابة الحفظ الكاملة لمسارات المقالات: صلاحية النشر (عند تغيّر الحالة) ثم
 * الكلمات المحظورة من النشر (server/services/publishBannedWordsService.ts).
 *
 * `existing` = الصف الحالي في التحديث، وغيابه = إنشاء. الحقول الغائبة عن جسم
 * التحديث تؤخذ من الصف الحالي حتى يُفحص النص الذي سيُنشر فعلًا.
 */
export async function denyPublishOnSave(
  userId: string | undefined | null,
  update: BannedWordContent & { status?: unknown },
  existing?: (BannedWordContent & { id?: string; status?: unknown }) | null,
): Promise<(PublishDenial & { bannedWords?: BannedWordMatch[] }) | null> {
  const nextStatus = update.status ?? existing?.status;
  if (!existing || (update.status && update.status !== existing.status)) {
    const denial = await denyPublish(userId, existing ? update.status : nextStatus);
    if (denial) return denial;
  }
  if (!isPublishingStatus(nextStatus)) return null;
  const merged: BannedWordContent = { ...(existing ?? {}) };
  for (const field of [...BANNED_WORD_FIELDS, "seo"] as const) {
    if (update[field] !== undefined) merged[field] = update[field];
  }
  return denyBannedWords({
    userId,
    nextStatus,
    content: merged,
    previous: existing ?? null,
    articleId: existing?.id ?? null,
    surface: "dashboard",
  });
}
