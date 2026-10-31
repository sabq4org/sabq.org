// قواعد إرسال المحتوى من تطبيقات الجوال (POST /api/v1/articles/submit
// وتطبيق «مكتب سبق»): من يُعد كاتباً أو مراسلاً، وأي روابط صور نقبلها
// جاهزة بعد رفعها مسبقاً. منطق خالص بلا قاعدة بيانات.

/** أدوار كاتب الرأي (المقال يُرسل رأياً بصورة واحدة). */
export const MOBILE_WRITER_ROLES: ReadonlySet<string> = new Set([
  "opinion_author",
  "columnist",
  "article_author",
  "article_writer",
  "writer",
  "author",
]);

/** أدوار المراسل (الخبر يُرسل بصورة بارزة وألبوم). */
export const MOBILE_REPORTER_ROLES: ReadonlySet<string> = new Set([
  "reporter",
  "correspondent",
  "journalist",
]);

/** أدوار التحرير والإدارة: ترسل أي نوع بتحديد kind. */
export const MOBILE_ADMIN_LIKE_ROLES: ReadonlySet<string> = new Set([
  "admin",
  "system_admin",
  "superadmin",
  "editor",
  "editor_in_chief",
  "senior_editor",
  "managing_editor",
  "editorial_manager",
  "content_manager",
]);

export interface MobileSubmitterFlags {
  isWriter: boolean;
  isReporter: boolean;
  isAdminLike: boolean;
}

export function classifyMobileSubmitter(roleNames: Iterable<string | null | undefined>): MobileSubmitterFlags {
  const names = [...roleNames].map((r) => (r || "").toLowerCase()).filter(Boolean);
  return {
    isWriter: names.some((r) => MOBILE_WRITER_ROLES.has(r)),
    isReporter: names.some((r) => MOBILE_REPORTER_ROLES.has(r)),
    isAdminLike: names.some((r) => MOBILE_ADMIN_LIKE_ROLES.has(r)),
  };
}

export function canSubmitFromMobile(flags: MobileSubmitterFlags): boolean {
  return flags.isWriter || flags.isReporter || flags.isAdminLike;
}

/** صيغة الصورة المرسلة base64 في جسم الطلب. */
export const MOBILE_IMAGE_DATA_URI = /^data:image\/(png|jpeg|jpg|webp|gif|heic|heif);base64,(.+)$/i;

/** الحد الأقصى لحجم صورة واحدة بعد فك base64. */
export const MOBILE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * رابط صورة رُفعت مسبقاً عبر POST /api/v1/articles/images يُقبل في الإرسال
 * فقط إن كان على أصل صور سبق: R2 العام (media.sabq.org أو ما يضبطه الخادم)
 * أو Cloudflare Images بحساب سبق. أي رابط آخر يُرفض كي لا يصير الخبر
 * مرآة لصور خارجية.
 */
export function isTrustedSubmissionImageUrl(
  rawUrl: unknown,
  opts: { r2Origins: readonly string[]; cloudflareAccountHash?: string | null },
): rawUrl is string {
  if (typeof rawUrl !== "string" || !rawUrl.startsWith("https://")) return false;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.port) return false;
  if (opts.r2Origins.includes(parsed.origin)) return parsed.pathname.length > 1;
  const hash = (opts.cloudflareAccountHash || "").trim();
  if (hash && parsed.hostname === "imagedelivery.net") {
    return parsed.pathname.startsWith(`/${hash}/`);
  }
  return false;
}

/** خبر مراسل وصل (أو عاد) إلى pending_review: يُنبَّه المحررون كما في إرسال الويب. */
export function shouldNotifyNewsDraft(
  previousReviewStatus: string | null | undefined,
  article: { articleType: string | null | undefined; reviewStatus: string | null | undefined; reporterId: string | null | undefined },
): boolean {
  return (
    article.articleType !== "opinion" &&
    Boolean(article.reporterId) &&
    article.reviewStatus === "pending_review" &&
    previousReviewStatus !== "pending_review"
  );
}
