import type { QueryClient } from "@tanstack/react-query";

type AnalyticsArticle = {
  id: string;
  reviewStatus?: string | null;
  status?: string;
  updatedAt?: string | null;
};

type ContributorAnalytics = {
  articles?: AnalyticsArticle[];
  needsChangesArticles?: number;
  pendingArticles?: number;
};

/** Immediately reflect resubmit in contributor dashboards (banner + table). */
export function markArticleSubmittedInAnalyticsCache(
  queryClient: QueryClient,
  article: {
    id: string;
    reviewStatus?: string | null;
    status?: string;
    updatedAt?: string | Date | null;
  },
) {
  const updatedAtIso =
    article.updatedAt == null
      ? new Date().toISOString()
      : typeof article.updatedAt === "string"
        ? article.updatedAt
        : new Date(article.updatedAt).toISOString();

  const patch = (prev: ContributorAnalytics | undefined): ContributorAnalytics | undefined => {
    if (!prev?.articles) return prev;
    const articles = prev.articles.map((a) =>
      a.id === article.id
        ? {
            ...a,
            reviewStatus: "pending_review",
            status: article.status ?? "draft",
            updatedAt: updatedAtIso,
          }
        : a,
    );
    const next: ContributorAnalytics = { ...prev, articles };
    if (typeof prev.needsChangesArticles === "number") {
      next.needsChangesArticles = articles.filter((a) => a.reviewStatus === "needs_changes").length;
    }
    if (typeof prev.pendingArticles === "number") {
      next.pendingArticles = articles.filter(
        (a) => a.reviewStatus === "pending_review" || a.status === "pending",
      ).length;
    }
    return next;
  };

  queryClient.setQueryData(["/api/opinion-author/analytics"], patch);
  queryClient.setQueryData(["/api/reporter/analytics"], patch);
}

export async function refetchContributorAnalytics(queryClient: QueryClient) {
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["/api/opinion-author/analytics"] }),
    queryClient.refetchQueries({ queryKey: ["/api/reporter/analytics"] }),
  ]);
}
