import { useRef, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Clock, Brain, Zap, Flame } from "lucide-react";
import type { ArticleWithDetails } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { getObjectPosition } from "@/lib/imageUtils";

const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInMinutes = (now.getTime() - published.getTime()) / (1000 * 60);
  return diffInMinutes <= 30;
};

const getArabicReason = (reason?: string): string => {
  if (!reason) return "مقترح لك";
  
  const reasonMap: Record<string, string> = {
    'category_interest': 'مقترح لك',
    'liked_similar': 'مقترح لك',
    'saved_similar': 'مقترح لك',
    'reading_pattern': 'مقترح لك',
    'trending_match': 'مقترح لك',
    'personalized': 'مقترح لك',
    'similar': 'مقترح لك',
  };
  
  return reasonMap[reason] || reason;
};

interface PersonalizedRecommendationCardProps {
  article: ArticleWithDetails;
  reason?: string;
  recommendationId?: string;
  onDisplay?: (articleId: string, recommendationId?: string) => void;
  onArticleClick?: (articleId: string, recommendationId?: string) => void;
}

export function PersonalizedRecommendationCard({
  article,
  reason,
  recommendationId,
  onDisplay,
  onArticleClick,
}: PersonalizedRecommendationCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cardRef.current || !onDisplay) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onDisplay(article.id, recommendationId);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [article.id, recommendationId, onDisplay]);

  const handleClick = () => {
    if (onArticleClick) {
      onArticleClick(article.id, recommendationId);
    }
  };

  const timeAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), {
        addSuffix: true,
        locale: arSA,
      })
    : null;

  const arabicReason = getArabicReason(reason);

  return (
    <div ref={cardRef} dir="rtl">
      <Link href={`/article/${article.englishSlug || article.slug}`}>
        <Card
          onClick={handleClick}
          className={`cursor-pointer h-full overflow-hidden ring-1 ring-primary/20 hover:ring-primary/30 transition-all ${
            article.newsType === "breaking" ? "bg-destructive/5" : ""
          }`}
          data-testid={`card-recommendation-${article.id}`}
        >
          {(article.imageUrl || (article as any).thumbnailUrl) && (
            <div className="relative h-48 overflow-hidden">
              <img
                src={article.imageUrl || (article as any).thumbnailUrl || ''}
                alt={article.title}
                className="w-full h-full object-cover"
                loading="lazy"
                style={{
                  objectPosition: getObjectPosition(article)
                }}
              />
            </div>
          )}
          
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className="text-xs h-5 gap-1 bg-primary/80 hover:bg-primary/90 text-primary-foreground border-0"
                data-testid={`badge-recommendation-${article.id}`}
              >
                <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                {arabicReason}
              </Badge>

              {((article as any).isAiGeneratedThumbnail || (article as any).isAiGeneratedImage) && (
                <Badge className="text-xs h-5 gap-1 bg-purple-500/90 hover:bg-purple-600 text-white border-0">
                  الصورة
                  <Brain className="h-2.5 w-2.5" aria-hidden="true" />
                </Badge>
              )}

              {article.newsType === "breaking" ? (
                <Badge variant="destructive" className="text-xs h-5 gap-1">
                  <Zap className="h-2.5 w-2.5" aria-hidden="true" />
                  عاجل
                </Badge>
              ) : isNewArticle(article.publishedAt) ? (
                <Badge className="text-xs h-5 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600">
                  <Flame className="h-2.5 w-2.5" aria-hidden="true" />
                  جديد
                </Badge>
              ) : article.category ? (
                <Badge className="text-xs h-5 bg-muted text-muted-foreground border-0">
                  {article.category.nameAr}
                </Badge>
              ) : null}
            </div>

            <h3
              className={`font-bold text-lg line-clamp-2 ${
                article.newsType === "breaking"
                  ? "text-destructive"
                  : "text-foreground"
              }`}
              data-testid={`text-recommendation-title-${article.id}`}
            >
              {article.title}
            </h3>

            {article.excerpt && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {article.excerpt}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
              {timeAgo && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>{timeAgo}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
