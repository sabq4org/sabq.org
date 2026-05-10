import { useState, useCallback } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Sparkles, 
  Clock, 
  RefreshCw,
  Camera,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { OptimizedImage } from "./OptimizedImage";
import { getObjectPosition } from "@/lib/imageUtils";

interface RecommendedArticle {
  articleId: string;
  score: number;
  reasons: string[];
  article?: {
    id: string;
    title: string;
    excerpt: string | null;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    infographicBannerUrl: string | null;
    imageFocalPoint: { x: number; y: number } | null;
    publishedAt: Date | string | null;
    slug: string;
    englishSlug?: string | null;
    articleType?: string | null;
    category?: {
      id: string;
      nameAr: string;
    } | null;
  };
}

interface HybridRecommendationsResponse {
  recommendations: RecommendedArticle[];
  count: number;
  engine: string;
}

function ForYouCardSkeleton() {
  return (
    <Card className="overflow-hidden border-0 dark:border dark:border-card-border">
      <Skeleton className="aspect-[16/9] w-full" />
      <CardContent className="p-3 space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-24 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function ForYouCard({ recommendation, index }: { recommendation: RecommendedArticle; index: number }) {
  const article = recommendation.article;
  if (!article) return null;

  const timeAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), {
        addSuffix: true,
        locale: arSA,
      })
    : null;

  const primaryReason = recommendation.reasons[0] || "مقترح لك";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
    >
      <Link href={`/article/${article.englishSlug || article.slug}`} data-testid={`link-foryou-article-${article.id}`}>
        <Card 
          className="group overflow-hidden border-0 dark:border dark:border-card-border h-full hover-elevate active-elevate-2 cursor-pointer transition-all duration-300"
          data-testid={`card-foryou-${article.id}`}
        >
          <div className="relative aspect-[16/9] overflow-hidden">
            {/* Priority: infographicBannerUrl (AI 16:9 banner) → imageUrl → thumbnailUrl */}
            {(article.infographicBannerUrl || article.imageUrl || article.thumbnailUrl) ? (
              <OptimizedImage
                src={article.infographicBannerUrl || article.imageUrl || article.thumbnailUrl || ''}
                alt={article.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                objectPosition={getObjectPosition(article)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10" />
            )}
            <div className="absolute top-2 right-2 flex gap-1">
              {article.articleType === 'weekly_photos' && (
                <Badge 
                  className="bg-violet-500/90 hover:bg-violet-600 text-white border-0 text-[10px] gap-0.5 px-2 py-0.5"
                  data-testid={`badge-photos-${article.id}`}
                >
                  <Camera className="h-2.5 w-2.5" />
                  صور
                </Badge>
              )}
              {article.category && (
                <Badge 
                  className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm text-gray-900 dark:text-white border border-gray-200/50 dark:border-gray-700/50 text-[10px] shadow-sm px-2 py-0.5 font-semibold"
                  data-testid={`badge-category-${article.id}`}
                >
                  {article.category.nameAr}
                </Badge>
              )}
            </div>
          </div>
          
          <CardContent className="p-3 space-y-2">
            <h3 
              className="font-bold text-sm leading-relaxed line-clamp-2 group-hover:text-primary transition-colors"
              data-testid={`text-foryou-title-${article.id}`}
            >
              {article.title}
            </h3>

            <div className="flex flex-wrap items-center gap-1.5">
              {timeAgo && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  {timeAgo}
                </span>
              )}
              <Badge 
                variant="outline" 
                className="text-[9px] h-4 gap-0.5 border-primary/30 text-primary bg-primary/5 px-1.5"
                data-testid={`badge-reason-${article.id}`}
              >
                <Sparkles className="h-2 w-2" />
                {primaryReason}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

export function ForYouSection() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, refetch } = useQuery<HybridRecommendationsResponse>({
    queryKey: ['/api/recommendations/hybrid', { limit: 6 }, refreshKey],
    queryFn: async () => {
      const res = await fetch('/api/recommendations/hybrid?limit=6', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch recommendations');
      }
      return res.json();
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = useCallback(async () => {
    setRefreshKey(k => k + 1);
    await refetch();
  }, [refetch]);

  if (isAuthLoading) return null;
  if (!user) return null;

  const recommendations = data?.recommendations?.filter(r => r.article) || [];
  const hasRecommendations = recommendations.length > 0;

  return (
    <section className="py-8" dir="rtl" data-testid="section-for-you">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div 
          className="flex items-center justify-between gap-3 mb-6 flex-wrap"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold" data-testid="heading-for-you">
                مقترحة لك
              </h2>
              <p className="text-sm text-muted-foreground">
                توصيات مخصصة بناءً على اهتماماتك
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            className="h-8 gap-1.5"
            data-testid="button-refresh-recommendations"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">تحديث</span>
          </Button>
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <ForYouCardSkeleton key={i} />
            ))}
          </div>
        ) : hasRecommendations ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
            {recommendations.slice(0, 6).map((recommendation, index) => (
              <ForYouCard 
                key={recommendation.articleId} 
                recommendation={recommendation} 
                index={index}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
