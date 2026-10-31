// إرسال المحتوى من الجوال: هوية المرسل (كاتب/مراسل/محرر)، رفع صورة واحدة
// (POST /api/v1/articles/images)، وتنبيه المحررين بخبر المراسل.
// الاستعلامات هنا (ADR-001)؛ القواعد الخالصة في shared/mobileSubmission.ts.

import { eq } from "drizzle-orm";
import { db } from "../db";
import { roles, userRoles, users } from "@shared/schema";
import {
  classifyMobileSubmitter,
  isTrustedSubmissionImageUrl,
  MOBILE_IMAGE_DATA_URI,
  MOBILE_IMAGE_MAX_BYTES,
  shouldNotifyNewsDraft,
  type MobileSubmitterFlags,
} from "@shared/mobileSubmission";
import { NEWS_IMAGES_R2_PUBLIC_HOST, newsImageStorageService } from "./newsImageStorageService";
import { sendDraftSubmittedNotification } from "../notificationService";

export interface MobileSubmitter extends MobileSubmitterFlags {
  user: { id: string; firstName: string | null; lastName: string | null; email: string | null };
  roleNames: Set<string>;
}

/** المستخدم وأدواره (RBAC + العمود القديم users.role)، أو null إن لم يوجد. */
export async function loadMobileSubmitter(userId: string): Promise<MobileSubmitter | null> {
  const [user] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      legacyRole: users.role,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const rbacRoles = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const roleNames = new Set<string>(
    [...rbacRoles.map((r) => (r.name || "").toLowerCase()), (user.legacyRole || "").toLowerCase()].filter(Boolean),
  );
  return {
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email },
    roleNames,
    ...classifyMobileSubmitter(roleNames),
  };
}

function r2Origins(): string[] {
  const origins = new Set<string>([new URL(NEWS_IMAGES_R2_PUBLIC_HOST).origin]);
  const configured = (process.env.NEWS_IMAGES_R2_PUBLIC_URL || "").trim();
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // إعداد غير صالح: نكتفي بالأصل الافتراضي.
    }
  }
  return [...origins];
}

/** رابط صورة رفعها الخادم مسبقاً (R2 سبق أو Cloudflare Images بحساب سبق). */
export function isOwnSubmissionImageUrl(url: unknown): url is string {
  return isTrustedSubmissionImageUrl(url, {
    r2Origins: r2Origins(),
    cloudflareAccountHash: process.env.CLOUDFLARE_ACCOUNT_HASH,
  });
}

export type SubmissionImageUploadResult =
  | { ok: true; url: string }
  | { ok: false; status: number; message: string };

/** يفك صورة base64 ويرفعها لخدمة صور الأخبار، ويعيد رابطها العام. */
export async function uploadMobileSubmissionImage(input: {
  userId: string;
  dataUri: string;
  slot: string;
}): Promise<SubmissionImageUploadResult> {
  const matches = input.dataUri.match(MOBILE_IMAGE_DATA_URI);
  if (!matches) return { ok: false, status: 400, message: "صيغة الصورة غير صحيحة" };
  const ext = matches[1].toLowerCase();
  const mimeType = `image/${ext === "heif" ? "heic" : ext}`;
  const buffer = Buffer.from(matches[2], "base64");
  if (buffer.length === 0) return { ok: false, status: 400, message: "الصورة فارغة" };
  if (buffer.length > MOBILE_IMAGE_MAX_BYTES) {
    return { ok: false, status: 413, message: "حجم الصورة كبير جداً (الحد الأقصى 20 ميجابايت)" };
  }
  if (!newsImageStorageService.isUploadAvailable()) {
    return { ok: false, status: 502, message: "خدمة رفع الصور غير مهيأة حالياً" };
  }
  const stamp = Date.now();
  const result = await newsImageStorageService.upload({
    buffer,
    filename: `submission-${input.userId}-${stamp}-${input.slot}.${ext}`,
    mimeType,
    purpose: "mobile-article-submission",
    metadata: { userId: input.userId, slot: input.slot, source: "mobile-app" },
    rolloutKey: `${input.userId}:${stamp}:${input.slot}`,
  });
  if (!result.success || !result.deliveryUrl) {
    console.error("[Mobile Submission] image upload failed:", result.error);
    return { ok: false, status: 502, message: "تعذر رفع الصورة. حاول لاحقاً." };
  }
  return { ok: true, url: result.deliveryUrl };
}

/**
 * تنبيه «مسودة جديدة من مراسل» في الخلفية (fire-and-forget): لا يُفشل الاستجابة أبداً.
 * يرجع true إن جُدول التنبيه.
 */
export function scheduleNewsDraftNotification(
  previousReviewStatus: string | null | undefined,
  article: {
    id: string;
    title: string;
    slug: string;
    articleType: string | null | undefined;
    reviewStatus: string | null | undefined;
    reporterId: string | null | undefined;
  },
): boolean {
  if (!shouldNotifyNewsDraft(previousReviewStatus, article)) return false;
  const reporterId = article.reporterId as string;
  setImmediate(async () => {
    try {
      const [reporter] = await db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, reporterId))
        .limit(1);
      const reporterName = reporter
        ? [reporter.firstName, reporter.lastName].filter(Boolean).join(" ") || "مراسل"
        : "مراسل";
      await sendDraftSubmittedNotification(
        { id: article.id, title: article.title, slug: article.slug },
        reporterName,
        reporterId,
      );
    } catch (err) {
      console.error("[Mobile Submission] news draft notify failed:", err);
    }
  });
  return true;
}
