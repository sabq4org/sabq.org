import { ArticleSidebarHeading } from "./ArticleSidebarHeading";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Newspaper, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NewsArticleCard } from "@/components/NewsArticleCard";
import type { ArticleWithDetails } from "@shared/schema";
import { apiUrl } from "@/lib/queryClient";

interface NewsArticle {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string;
  imageUrl?: string;
  featuredImage?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
  articleType?: string;
  category?: {
    id: string;
    nameAr: string;
    slug: string;
  };
}

interface RecentNewsSectionProps {
  excludeArticleId?: string;
  limit?: number;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-3 p-3 border rounded-lg">
            <Skeleton className="w-20 h-16 rounded-md flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecentNewsSection({
  excludeArticleId,
  limit = 5,
}: RecentNewsSectionProps) {
  const { data, isLoading } = useQuery<{ articles: NewsArticle[] }>({
    queryKey: ["/api/articles/recent", { excludeId: excludeArticleId, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(limit + 1),
        excludeOpinion: "true",
      });
      if (excludeArticleId) {
        params.append("excludeId", excludeArticleId);
      }
      const res = await fetch(apiUrl(`/api/articles/recent?${params}`), {
        credentials: "include",
      });
      if (!res.ok) return { articles: [] };
      const data = await res.json();
      return { articles: (data.articles || []).slice(0, limit) };
    },
  });

  if (isLoading) {
    return (
      <section className="py-4" dir="rtl">
        <LoadingSkeleton />
      </section>
    );
  }

  if (!data || data.articles.length === 0) {
    return null;
  }

  return (
    <section className="py-4" dir="rtl">
      <div className="space-y-4">
        {/* Header */}
        <ArticleSidebarHeading
          title="أخبار نُشرت مؤخراً"
          description="قد تعجبك أيضاً"
          icon={Newspaper}
          action={<Link href="/news"><Button variant="ghost" size="sm" className="gap-1" data-testid="button-view-more-news">المزيد<ArrowLeft className="h-4 w-4" /></Button></Link>}
        />

        {/* News List - No numbers */}
        <div className="space-y-2">
          {data?.articles?.slice(0, limit).map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
            >
              <NewsArticleCard
                article={{
                  ...article,
                  category: article.category ? { ...article.category, nameEn: article.category.nameAr } : undefined,
                } as unknown as ArticleWithDetails}
                viewMode="compact"
                hideCategory
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
