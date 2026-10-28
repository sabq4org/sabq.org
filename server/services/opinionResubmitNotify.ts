// تنبيه إعادة إرسال مقال رأي بعد «يحتاج تعديل» من تطبيق الجوال
// (PUT /api/v1/articles/:id/resubmit). نفس مسار الإرسال على الويب:
// notifyOpinionArticleSubmittedForReview (إشعار الكاتب + المحررين + push الديسك + بريد البوت).
import { notifyOpinionArticleSubmittedForReview } from "./opinionWritersService";

/** يُنبَّه فقط عند انتقال مقال رأي إلى pending_review من حالة أخرى. */
export function shouldNotifyOpinionResubmit(
  previousReviewStatus: string | null | undefined,
  updated: { articleType: string | null | undefined; reviewStatus: string | null | undefined },
): boolean {
  return (
    updated.articleType === "opinion" &&
    updated.reviewStatus === "pending_review" &&
    previousReviewStatus !== "pending_review"
  );
}

/**
 * يُطلق التنبيه في الخلفية (fire-and-forget) ولا يُفشل الاستجابة أبداً.
 * يرجع true إن جُدول التنبيه (للاختبار والسجل).
 */
export function scheduleOpinionResubmitNotification(
  previousReviewStatus: string | null | undefined,
  updated: {
    id: string;
    title: string;
    slug: string;
    authorId: string | null;
    articleType: string | null | undefined;
    reviewStatus: string | null | undefined;
  },
): boolean {
  if (!shouldNotifyOpinionResubmit(previousReviewStatus, updated)) return false;
  setImmediate(() => {
    notifyOpinionArticleSubmittedForReview({
      id: updated.id,
      title: updated.title,
      slug: updated.slug,
      authorId: updated.authorId,
    }).catch((err) => {
      console.error("[Mobile API] opinion resubmit notify failed:", err);
    });
  });
  return true;
}
