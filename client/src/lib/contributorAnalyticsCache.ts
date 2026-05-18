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

function recalcContributorCounts(articles: AnalyticsArticle[]) {
  return {
    needsChangesArticles: articles.filter((a) => a.reviewStatus === "needs_changes").length,
    pendingArticles: articles.filter(
      (a) => a.reviewStatus === "pending_review" || a.status === "pending",
    ).length,
  };
}

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
    const reviewStatus = article.reviewStatus ?? "pending_review";
    const status = article.status ?? "draft";

    if (!prev?.articles?.length) {
      return {
        ...prev,
        articles: [
          {
            id: article.id,
            reviewStatus,
            status,
            updatedAt: updatedAtIso,
          },
        ],
        ...recalcContributorCounts([
          {
            id: article.id,
            reviewStatus,
            status,
          },
        ]),
      };
    }

    const articles = prev.articles.map((a) =>
      a.id === article.id
        ? {
            ...a,
            reviewStatus,
            status,
            updatedAt: updatedAtIso,
          }
        : a,
    );
    return {
      ...prev,
      articles,
      ...recalcContributorCounts(articles),
    };
  };

  queryClient.setQueryData(["/api/opinion-author/analytics"], patch);
  queryClient.setQueryData(["/api/reporter/analytics"], patch);
}

/** Background sync — do not await in mutation onSuccess (race with optimistic cache). */
export function invalidateContributorAnalytics(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/analytics"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/reporter/analytics"] });
}
