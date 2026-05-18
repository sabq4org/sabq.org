export type RevisionGateArticle = {
  status?: string;
  reviewStatus?: string | null;
  reviewedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  reviewNotes?: string | null;
};

/** Draft resubmitted by author/reporter after editorial requested changes. */
export function isResubmittedAfterRevision(article: RevisionGateArticle): boolean {
  return (
    article.status === "draft" &&
    article.reviewStatus === "pending_review" &&
    !!article.reviewedAt
  );
}
