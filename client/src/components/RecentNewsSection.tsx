import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Newspaper, ArrowLeft, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { getObjectPosition } from "@/lib/imageUtils";

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

function NewsCard({ article }: { article: NewsArticle }) {
  const imageUrl = article.imageUrl || article.thumbnailUrl || article.featuredImage;
  const timeAgo = article.publishedAt 
    ? formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true, locale: arSA })
    : null;
  
  const articleUrl = `/article/${article.englishSlug || article.slug}`;

  return (
    <Link href={articleUrl}>
      <Card 
        className="hover-elevate active-elevate-2 overflow-hidden group"
        data-testid={`recent-news-${article.id}`}
      >
        <CardContent className="p-3">
          <div className="flex gap-3">
            {imageUrl && (
              <div className="relative w-20 h-16 rounded-md overflow-hidden flex-shrink-0">
                <img
                  src={imageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: getObjectPosition(article) }}
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {article.title}
              </h3>
              {timeAgo && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {timeAgo}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
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
      const res = await fetch(`/api/articles/recent?${params}`, {
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 rounded-full bg-primary" />
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-primary" />
                أخبار نُشرت مؤخراً
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                قد تعجبك أيضاً
              </p>
            </div>
          </div>
          <Link href="/news">
            <Button 
              variant="ghost" 
              size="sm"
              className="gap-1" 
              data-testid="button-view-more-news"
            >
              المزيد
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* News List - No numbers */}
        <div className="space-y-2">
          {data?.articles?.slice(0, limit).map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
            >
              <NewsCard article={article} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
