import { EDITORIAL_STATE_LABELS, editorialState } from "@shared/editorialStates";

/**
 * Status badge for contributor dashboards (opinion author / reporter).
 * النص من القاموس الموحّد (shared/editorialStates.ts)، فيطابق تطبيق سبق حرفيًا.
 */
export function contributorArticleStatusLabel(article: {
  status: string;
  reviewStatus?: string | null;
}) {
  const state = editorialState(article);
  const variant =
    state === "published" || state === "scheduled"
      ? ("default" as const)
      : state === "needs_changes"
        ? ("outline" as const)
        : state === "archived" || state === "not_published"
          ? ("destructive" as const)
          : ("secondary" as const);
  return { label: EDITORIAL_STATE_LABELS[state], variant };
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
