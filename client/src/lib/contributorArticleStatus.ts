/** Status badge for contributor dashboards (opinion author / reporter). */
export function contributorArticleStatusLabel(article: {
  status: string;
  reviewStatus?: string | null;
}) {
  // الحالة النهائية أولًا: النشر لا يمسح reviewStatus، فكان المنشور يظهر «أُرسل للمراجعة».
  if (article.status === "published") {
    return { label: "منشور", variant: "default" as const };
  }
  if (article.status === "scheduled") {
    return { label: "مجدول", variant: "default" as const };
  }
  if (article.reviewStatus === "needs_changes") {
    return { label: "يحتاج تعديل", variant: "outline" as const };
  }
  if (article.reviewStatus === "pending_review") {
    return { label: "أُرسل للمراجعة", variant: "secondary" as const };
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

export type ReporterArticleBucket = "fix" | "rev" | "sch" | "pub" | "draft" | "arch";

/** خانة الخبر في شرائح التصفية. الحالة النهائية أولًا كما في شارة الحالة. */
export function reporterArticleBucket(a: { status: string; reviewStatus?: string | null }): ReporterArticleBucket {
  if (a.status === "archived" || a.status === "deleted") return "arch";
  if (a.status === "published") return "pub";
  if (a.status === "scheduled") return "sch";
  if (a.reviewStatus === "needs_changes") return "fix";
  if (a.reviewStatus === "pending_review" || a.status === "pending") return "rev";
  return "draft";
}
