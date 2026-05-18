export type RevisionGateArticle = {
  status?: string;
  reviewStatus?: string | null;
  reviewedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  reviewNotes?: string | null;
};

/** Editor asked for changes; contributor has not resent yet. */
export function isAwaitingContributorRevision(article: RevisionGateArticle): boolean {
  return article.status === "draft" && article.reviewStatus === "needs_changes";
}

/** Draft resubmitted by author/reporter after editorial requested changes. */
export function isResubmittedAfterRevision(article: RevisionGateArticle): boolean {
  if (article.status !== "draft" || article.reviewStatus !== "pending_review") {
    return false;
  }
  // reviewedAt is set when revision was requested; reviewNotes may remain after resubmit
  return !!article.reviewedAt || !!(article.reviewNotes?.trim());
}

export function hasEditorialReviewDraftCue(article: RevisionGateArticle): boolean {
  return isResubmittedAfterRevision(article) || isAwaitingContributorRevision(article);
}
