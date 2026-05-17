/** Article fields needed to gate "إرسال بعد التعديل". */
export type RevisionGateArticle = {
  reviewStatus?: string | null;
  reviewedAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

/** True when the author saved the piece after the editor's revision request. */
export function canSubmitAfterRevision(article: RevisionGateArticle): boolean {
  if (article.reviewStatus !== "needs_changes") return false;
  if (!article.reviewedAt) return false;
  const reviewedMs = new Date(article.reviewedAt).getTime();
  const updatedMs = new Date(article.updatedAt || 0).getTime();
  if (Number.isNaN(reviewedMs) || Number.isNaN(updatedMs)) return false;
  return updatedMs > reviewedMs;
}

export const REVISION_SUBMIT_HINT =
  "احفظ تعديلاتك على المقال أولاً (زر حفظ) ثم يُفعَّل زر الإرسال";
