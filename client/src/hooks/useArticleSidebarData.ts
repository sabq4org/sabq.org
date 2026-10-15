import { useEffect, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { withQueryDeadline } from "@/lib/queryDeadline";

export interface ArticleInsights {
  avgReadTime: number;
  totalReads: number;
  totalReactions: number;
  totalComments: number;
  totalViews: number;
  engagementRate: number;
  completionRate: number;
  totalInteractions: number;
}

export interface ArticleRecommendation {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string | null;
  excerpt?: string;
  imageUrl?: string;
  views?: number;
  publishedAt?: string;
  category?: { nameAr: string; icon?: string };
  aiMetadata: { reason: string; icon: string; aiLabel: string; relevanceScore: number };
}

export const ARTICLE_SIDEBAR_TIMEOUT_MS = 6_000;

export type ArticleSidebarQuery<T> = UseQueryResult<T, Error> & {
  waitingForSession: boolean;
  sessionUnavailable: boolean;
  retrySidebar: () => void;
};

function useSidebarQuery<T>(slug: string, kind: "ai-insights" | "ai-recommendations") {
  // Resolve the audience before caching personalized results. This request is
  // shared with the header/article auth query, not repeated for each component.
  const auth = useQuery<{ id: string } | null>({ queryKey: ["/api/auth/user"] });
  const [sessionWaitExpired, setSessionWaitExpired] = useState(false);
  useEffect(() => {
    setSessionWaitExpired(false);
    if (auth.isSuccess) return;
    const timer = setTimeout(() => setSessionWaitExpired(true), ARTICLE_SIDEBAR_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [auth.isSuccess, slug]);
  const query = useQuery<T>({
    queryKey: ["article-sidebar", kind, slug, auth.data?.id ?? "guest"],
    enabled: !!slug && auth.isSuccess,
    queryFn: async (context) => {
      const metric = `sabq:article-sidebar:${kind}`;
      const start = performance.now();
      try {
        return await withQueryDeadline(
          async (signal) => getQueryFn<T>({ on401: "throw", silent: true })({
            ...context,
            queryKey: ["/api/articles", slug, kind],
            signal,
          }),
          context.signal,
          ARTICLE_SIDEBAR_TIMEOUT_MS,
        );
      } finally {
        // Local browser timing only: no slugs, account IDs or network telemetry.
        try {
          performance.clearMeasures(metric);
          performance.measure(metric, { start, end: performance.now() });
        } catch { /* Older browsers may not support User Timing options. */ }
      }
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => kind === "ai-insights" && q.state.status !== "error" ? 60_000 : false,
    refetchIntervalInBackground: false,
  });
  return {
    ...query,
    waitingForSession: !auth.isSuccess && !auth.isError && !sessionWaitExpired,
    sessionUnavailable: !auth.isSuccess && (auth.isError || sessionWaitExpired),
    retrySidebar: () => {
      if (auth.isSuccess) void query.refetch();
      else void auth.refetch();
    },
  } satisfies ArticleSidebarQuery<T>;
}

export function useArticleInsights(slug: string) {
  return useSidebarQuery<ArticleInsights>(slug, "ai-insights");
}

export function useArticleRecommendations(slug: string) {
  return useSidebarQuery<ArticleRecommendation[]>(slug, "ai-recommendations");
}
