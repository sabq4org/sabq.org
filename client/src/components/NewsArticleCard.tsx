import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  MessageSquare,
  Flame,
  Zap,
  Sparkles,
  Bookmark,
  Share2,
  BookOpen,
  Brain,
  Camera,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import type { ArticleWithDetails } from "@shared/schema";
import { useState } from "react";
import { InfographicBadgeIcon } from "./InfographicBadge";
import { InfographicArticleCard } from "./InfographicArticleCard";
import { OptimizedImage } from "./OptimizedImage";

type ViewMode = 'grid' | 'list' | 'compact';

interface NewsArticleCardProps {
  article: ArticleWithDetails;
  viewMode: ViewMode;
  hideCategory?: boolean;
}

const isNewArticle = (publishedAt: Date | string | null | undefined) => {
  if (!publishedAt) return false;
  const published = typeof publishedAt === 'string' ? new Date(publishedAt) : publishedAt;
  const now = new Date();
  const diffInMinutes = (now.getTime() - published.getTime()) / (1000 * 60);
  return diffInMinutes <= 30;
};

const getReadingTime = (content?: string) => {
  if (!content) return 0;
  const wordsPerMinute = 200;
  const wordCount = content.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
};

export function NewsArticleCard({ article, viewMode, hideCategory = false }: NewsArticleCardProps) {
  // Use special infographic card for infographic articles
  if (article.articleType === 'infographic') {
    const infographicVariant = viewMode === "compact" ? "compact" : "grid";
    return <InfographicArticleCard article={article} variant={infographicVariant} />;
  }

  const [isHovered, setIsHovered] = useState(false);
  
  const timeAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), {
        addSuffix: true,
        locale: arSA,
      })
    : null;

  const readingTime = getReadingTime(article.content);

  const categoryName = article.category?.nameAr || 'أخبار';
  const ariaLabel = `مقال: ${article.title}${article.newsType === "breaking" ? ' - عاجل' : ''} - ${categoryName}${timeAgo ? ` - ${timeAgo}` : ''}`;
  
  // Prefer imageUrl for better focal point cropping, fallback to thumbnailUrl
  const imageUrl = getCacheBustedImageUrl(
    article.imageUrl || article.thumbnailUrl,
    article.updatedAt
  );

  // Default placeholder when no image
  const renderImagePlaceholder = () => (
    <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-background flex items-center justify-center">
      <div className="text-center p-4">
        <BookOpen className="h-12 w-12 mx-auto text-primary/40 mb-2" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">{categoryName}</span>
      </div>
    </div>
  );

  if (viewMode === 'grid') {
    return (
      <Card
        className="cursor-pointer h-full overflow-hidden hover-elevate active-elevate-2 transition-all group border-0 dark:border dark:border-card-border"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        data-testid={`card-article-grid-${article.id}`}
        role="article"
        aria-label={ariaLabel}
      >
        <Link href={`/article/${article.englishSlug || article.slug}`}>
          {/* Mobile View: Compact horizontal layout like SmartNewsBlock */}
          <div className="block md:hidden">
            <CardContent className="p-4">
              <div className="flex gap-3">
                {imageUrl && (
                  <div className="relative flex-shrink-0 w-24 h-20 rounded-lg overflow-hidden">
                    <OptimizedImage
                      src={imageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover rounded-lg transition-transform duration-500 group-hover:scale-110"
                      wrapperClassName="w-full h-full"
                      objectPosition={getObjectPosition(article)}
                    />
                    {(article.isAiGeneratedThumbnail || article.isAiGeneratedImage) && (
                      <Badge 
                        className="absolute -top-1 -right-1 z-20 gap-0.5 px-1 py-0 h-4 text-[9px] bg-violet-500/90 hover:bg-violet-600 text-white border-0 backdrop-blur-sm shadow-md"
                        data-testid={`badge-ai-image-mobile-${article.id}`}
                      >
                        <Brain className="h-2 w-2" aria-hidden="true" />
                      </Badge>
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    {article.newsType === "breaking" ? (
                      <Badge variant="destructive" className="text-[10px] h-4 gap-0.5 shrink-0" data-testid={`badge-content-type-mobile-${article.id}`}>
                        <Zap className="h-2 w-2" aria-hidden="true" />
                        عاجل
                      </Badge>
                    ) : isNewArticle(article.publishedAt) ? (
                      <Badge className="text-[10px] h-4 gap-0.5 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shrink-0" data-testid={`badge-content-type-mobile-${article.id}`}>
                        <Flame className="h-2 w-2" aria-hidden="true" />
                        جديد
                      </Badge>
                    ) : article.articleType === 'weekly_photos' ? (
                      <Badge className="text-[10px] h-4 gap-0.5 bg-orange-500/90 hover:bg-orange-600 text-white border-0 shrink-0" data-testid={`badge-content-type-mobile-${article.id}`}>
                        <Camera className="h-2 w-2" aria-hidden="true" />
                        صور
                      </Badge>
                    ) : (article.category && !hideCategory) ? (
                      <Badge variant="secondary" className="text-[10px] h-4 shrink-0 text-black" style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }} data-testid={`badge-content-type-mobile-${article.id}`}>
                        {article.category.nameAr}
                      </Badge>
                    ) : null}
                    {article.aiGenerated && (
                      <Badge className="text-[10px] h-4 gap-0.5 bg-violet-500/90 hover:bg-violet-600 text-white border-0 shrink-0" data-testid={`badge-ai-content-mobile-${article.id}`}>
                        <Brain className="h-2 w-2" aria-hidden="true" />
                        AI
                      </Badge>
                    )}
                  </div>
                  <h4 className={`font-bold text-sm line-clamp-2 leading-relaxed transition-colors ${article.newsType === "breaking" ? "text-destructive" : "group-hover:text-primary"}`} data-testid={`text-article-title-mobile-${article.id}`}>
                    {article.title}
                  </h4>
                  {timeAgo && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {timeAgo}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </div>

          {/* Desktop View: Full card with large image */}
          <div className="hidden md:block">
            <div className="relative aspect-[16/9] overflow-hidden">
              {imageUrl ? (
                <OptimizedImage
                  src={imageUrl}
                  alt={article.title}
                  className={`w-full h-full object-cover transition-transform duration-500 ${
                    isHovered ? 'scale-110' : 'scale-100'
                  }`}
                  objectPosition={getObjectPosition(article)}
                />
              ) : (
                renderImagePlaceholder()
              )}
              {(article.isAiGeneratedThumbnail || article.isAiGeneratedImage) && (
                <Badge 
                  className="absolute top-2 right-2 z-20 gap-1 bg-violet-500/90 hover:bg-violet-600 text-white border-0 text-xs backdrop-blur-sm shadow-lg"
                  data-testid={`badge-ai-image-overlay-${article.id}`}
                >
                  الصورة
                  <Brain className="h-3 w-3" aria-hidden="true" />
                </Badge>
              )}
            </div>

            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                {article.newsType === "breaking" ? (
                  <Badge 
                    variant="destructive" 
                    className="text-xs h-5 gap-1 shrink-0" 
                    data-testid={`badge-content-type-${article.id}`}
                  >
                    <Zap className="h-2.5 w-2.5" aria-hidden="true" />
                    عاجل
                  </Badge>
                ) : isNewArticle(article.publishedAt) ? (
                  <Badge 
                    className="text-xs h-5 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shrink-0" 
                    data-testid={`badge-content-type-${article.id}`}
                  >
                    <Flame className="h-2.5 w-2.5" aria-hidden="true" />
                    جديد
                  </Badge>
                ) : article.articleType === 'weekly_photos' ? (
                  <Badge 
                    className="text-xs h-5 gap-1 bg-orange-500/90 hover:bg-orange-600 text-white border-0 shrink-0" 
                    data-testid={`badge-content-type-${article.id}`}
                  >
                    <Camera className="h-2.5 w-2.5" aria-hidden="true" />
                    صور
                  </Badge>
                ) : (article.category && !hideCategory) ? (
                  <Badge 
                    variant="secondary"
                    className="text-xs h-5 shrink-0 text-black" 
                    style={{ borderRight: `3px solid ${article.category.color || 'hsl(var(--primary))'}`, backgroundColor: '#e5e5e6' }}
                    data-testid={`badge-content-type-${article.id}`}
                  >
                    {article.category.nameAr}
                  </Badge>
                ) : null}
                {article.aiGenerated && (
                  <Badge 
                    className="text-xs h-5 gap-1 bg-violet-500/90 hover:bg-violet-600 text-white border-0 shrink-0"
                    data-testid={`badge-ai-content-${article.id}`}
                  >
                    <Brain className="h-2.5 w-2.5" aria-hidden="true" />
                    محتوى AI
                  </Badge>
                )}
              </div>

              <h3 
                className={`text-lg font-bold line-clamp-2 transition-colors ${
                  article.newsType === "breaking"
                    ? "text-destructive"
                    : "group-hover:text-primary"
                }`}
                data-testid={`text-article-title-${article.id}`}
              >
                {article.title}
              </h3>

              {article.excerpt && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {article.excerpt}
                </p>
              )}

              <div className="flex flex-col gap-2 pt-2 border-t">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {timeAgo && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      <span>{timeAgo}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </div>
        </Link>
      </Card>
    );
  }

  if (viewMode === 'list') {
    return (
      <Card className="cursor-pointer hover-elevate transition-all" data-testid={`card-article-list-${article.id}`} role="article" aria-label={ariaLabel}>
        <Link href={`/article/${article.englishSlug || article.slug}`}>
          <div className="block">
            <CardContent className="p-0">
              <div className="flex gap-5 p-5">
                <div className="relative flex-shrink-0 w-64 h-40 rounded-lg overflow-hidden">
                  {imageUrl ? (
                    <OptimizedImage
                      src={imageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover"
                      objectPosition={getObjectPosition(article)}
                    />
                  ) : (
                    renderImagePlaceholder()
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  {/* Badges above title */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* AI Generated Image Badge (Featured or Thumbnail) */}
                    {(article.isAiGeneratedThumbnail || article.isAiGeneratedImage) && (
                      <Badge className="text-xs h-5 gap-1 bg-violet-500/90 hover:bg-violet-600 text-white border-0" data-testid={`badge-ai-image-${article.id}`}>
                        الصورة
                        <Brain className="h-2.5 w-2.5" aria-hidden="true" />
                      </Badge>
                    )}

                    {/* Content Type Badge */}
                    {article.newsType === "breaking" ? (
                      <Badge variant="destructive" className="text-xs h-5 gap-1" data-testid={`badge-content-type-${article.id}`}>
                        <Zap className="h-2.5 w-2.5" aria-hidden="true" />
                        عاجل
                      </Badge>
                    ) : isNewArticle(article.publishedAt) ? (
                      <Badge className="text-xs h-5 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600" data-testid={`badge-content-type-${article.id}`}>
                        <Flame className="h-2.5 w-2.5" aria-hidden="true" />
                        جديد
                      </Badge>
                    ) : article.articleType === 'weekly_photos' ? (
                      <Badge className="text-xs h-5 gap-1 bg-orange-500/90 hover:bg-orange-600 text-white border-0" data-testid={`badge-content-type-${article.id}`}>
                        <Camera className="h-2.5 w-2.5" aria-hidden="true" />
                        صور
                      </Badge>
                    ) : article.articleType === 'infographic' ? (
                      <Badge className="text-xs h-5 bg-muted text-muted-foreground border-0" data-testid={`badge-content-type-${article.id}`}>
                        إنفوجرافيك
                      </Badge>
                    ) : (article.category && !hideCategory) ? (
                      <Badge className="text-xs h-5 bg-muted text-muted-foreground border-0" data-testid={`badge-content-type-${article.id}`}>
                        {article.category.nameAr}
                      </Badge>
                    ) : null}
                  </div>

                  <h3
                    className={`font-bold text-xl line-clamp-2 ${
                      article.newsType === "breaking"
                        ? "text-destructive"
                        : "text-foreground"
                    }`}
                  >
                    {article.title}
                  </h3>

                  {article.excerpt && (
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {article.excerpt}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {timeAgo && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" aria-hidden="true" />
                        {timeAgo}
                      </div>
                    )}
                    {(article.commentsCount ?? 0) > 0 && (
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" aria-hidden="true" />
                        {(article.commentsCount ?? 0).toLocaleString('en-US')} تعليق
                      </div>
                    )}
                    {readingTime > 0 && (
                      <div className="flex items-center gap-1">
                        <BookOpen className="h-4 w-4" aria-hidden="true" />
                        {readingTime} دقائق قراءة
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => e.preventDefault()}
                      data-testid={`button-bookmark-${article.id}`}
                      aria-label={`حفظ المقال: ${article.title}`}
                    >
                      <Bookmark className="h-4 w-4 ml-2" aria-hidden="true" />
                      حفظ
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => e.preventDefault()}
                      data-testid={`button-share-${article.id}`}
                      aria-label={`مشاركة المقال: ${article.title}`}
                    >
                      <Share2 className="h-4 w-4 ml-2" aria-hidden="true" />
                      مشاركة
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </div>
        </Link>
      </Card>
    );
  }

  if (viewMode === 'compact') {
    return (
      <div className="border-b last:border-b-0 hover-elevate" data-testid={`card-article-compact-${article.id}`} role="article" aria-label={ariaLabel}>
        <Link href={`/article/${article.englishSlug || article.slug}`}>
          <div className="block p-4">
            <div className="flex gap-3">
              <div className="relative flex-shrink-0 w-24 h-20 rounded-lg overflow-hidden">
                {imageUrl ? (
                  <OptimizedImage
                    src={imageUrl}
                    alt={article.title}
                    className="w-full h-full object-cover rounded-lg transition-transform duration-500 group-hover:scale-110"
                    wrapperClassName="w-full h-full"
                    objectPosition={getObjectPosition(article)}
                  />
                ) : (
                  renderImagePlaceholder()
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                {/* Badges moved above title */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* AI Generated Image Badge (Featured or Thumbnail) */}
                  {(article.isAiGeneratedThumbnail || article.isAiGeneratedImage) && (
                    <Badge className="text-xs h-5 gap-1 bg-violet-500/90 hover:bg-violet-600 text-white border-0" data-testid={`badge-ai-image-${article.id}`}>
                      الصورة
                      <Brain className="h-2.5 w-2.5" aria-hidden="true" />
                    </Badge>
                  )}

                  {/* Content Type Badge */}
                  {article.newsType === "breaking" ? (
                    <Badge variant="destructive" className="text-xs h-5 gap-1" data-testid={`badge-content-type-${article.id}`}>
                      <Zap className="h-2.5 w-2.5" aria-hidden="true" />
                      عاجل
                    </Badge>
                  ) : isNewArticle(article.publishedAt) ? (
                    <Badge className="text-xs h-5 gap-1 bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600" data-testid={`badge-content-type-${article.id}`}>
                      <Flame className="h-2.5 w-2.5" aria-hidden="true" />
                      جديد
                    </Badge>
                  ) : article.articleType === 'weekly_photos' ? (
                    <Badge className="text-xs h-5 gap-1 bg-orange-500/90 hover:bg-orange-600 text-white border-0" data-testid={`badge-content-type-${article.id}`}>
                      <Camera className="h-2.5 w-2.5" aria-hidden="true" />
                      صور
                    </Badge>
                  ) : article.articleType === 'infographic' ? (
                    <Badge className="text-xs h-5 bg-muted text-muted-foreground border-0" data-testid={`badge-content-type-${article.id}`}>
                      إنفوجرافيك
                    </Badge>
                  ) : (article.category && !hideCategory) ? (
                    <Badge className="text-xs h-5 bg-muted text-muted-foreground border-0" data-testid={`badge-content-type-${article.id}`}>
                      {article.category.nameAr}
                    </Badge>
                  ) : null}
                </div>

                <h4
                  className={`font-bold text-sm line-clamp-2 leading-relaxed ${
                    article.newsType === "breaking"
                      ? "text-destructive"
                      : "text-foreground"
                  }`}
                >
                  {article.title}
                </h4>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {timeAgo && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {timeAgo}
                    </span>
                  )}
                  {(article.commentsCount ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" aria-hidden="true" />
                      {(article.commentsCount ?? 0).toLocaleString('en-US')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Link>
      </div>
    );
  }

  return null;
}
