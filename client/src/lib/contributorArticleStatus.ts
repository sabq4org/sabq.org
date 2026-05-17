/** Status badge for contributor dashboards (opinion author / reporter). */
export function contributorArticleStatusLabel(article: {
  status: string;
  reviewStatus?: string | null;
}) {
  if (article.reviewStatus === "needs_changes") {
    return { label: "يحتاج تعديل", variant: "outline" as const };
  }
  if (article.reviewStatus === "pending_review") {
    return { label: "مرسل للتحرير", variant: "secondary" as const };
  }
  if (article.status === "published") {
    return { label: "منشور", variant: "default" as const };
  }
  if (article.status === "archived") {
    return { label: "مؤرشف", variant: "destructive" as const };
  }
  if (article.status === "rejected") {
    return { label: "مرفوض", variant: "destructive" as const };
  }
  return { label: "مسودة", variant: "secondary" as const };
}
