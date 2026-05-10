import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Clock, 
  Heart, 
  MessageCircle, 
  Bookmark,
  Sparkles,
  Brain,
  TrendingUp,
  Eye,
  Play,
  Camera,
  BarChart3,
  Zap
} from "lucide-react";
import { differenceInMinutes } from "date-fns";
import { Link } from "wouter";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import type { ArticleWithDetails } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import FollowStoryButton from "./FollowStoryButton";
import { OptimizedImage } from "./OptimizedImage";
import { InfographicBadgeIcon } from "./InfographicBadge";
import { InfographicArticleCard } from "./InfographicArticleCard";

interface ArticleCardProps {
  article: ArticleWithDetails;
  variant?: "grid" | "featured" | "list" | "compact";
  onReact?: (articleId: string) => void;
  onBookmark?: (articleId: string) => void;
}

export function ArticleCard({ 
  article, 
  variant = "grid",
  onReact,
  onBookmark 
}: ArticleCardProps) {
  // Use special infographic card for infographic articles
  if (article.articleType === 'infographic') {
    const infographicVariant = variant === "featured" ? "featured" : 
                               variant === "compact" ? "compact" : "grid";
    return <InfographicArticleCard article={article} variant={infographicVariant} />;
  }

  const timeAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), { 
        addSuffix: true, 
        locale: arSA 
      })
    : null;

  // Check if article is new (published within 30 minutes)
  const isNew = article.publishedAt 
    ? differenceInMinutes(new Date(), new Date(article.publishedAt)) <= 30
    : false;

  // Convert gs:// URLs to proxy URLs for display and add cache busting
  // Use imageUrl if available, fall back to thumbnailUrl
  const getDisplayImageUrl = () => {
    const imageSource = article.imageUrl || article.thumbnailUrl;
    if (!imageSource) return null;
    
    // If it's a gs:// URL, it needs to be proxied
    if (imageSource.startsWith('gs://')) {
      console.warn('[ArticleCard] Found gs:// URL in article, this should not happen:', imageSource);
      return imageSource;
    }
    
    // Add cache busting based on updatedAt
    return getCacheBustedImageUrl(imageSource, article.updatedAt);
  };

  const displayImageUrl = getDisplayImageUrl();

  // Smart AI Indicator
  const getAIInsight = () => {
    if (article.aiGenerated) return { icon: Brain, text: "محتوى مُنشأ بالذكاء الاصطناعي" };
    if ((article.reactionsCount || 0) > 100) return { icon: TrendingUp, text: "تفاعل عالي من القراء" };
    if ((article.views || 0) > 500) return { icon: Eye, text: "الأكثر مشاهدة" };
    return null;
  };

  const aiInsight = getAIInsight();

  if (variant === "featured") {
    return (
      <Link href={`/article/${article.englishSlug || article.slug}`} data-testid={`link-article-${article.id}`}>
        <Card className="group overflow-hidden rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 !border-0 !bg-transparent">
          <div className="relative aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9] overflow-hidden">
            {displayImageUrl ? (
              <OptimizedImage
                src={displayImageUrl}
                alt={article.title}
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                objectPosition={getObjectPosition(article)}
                priority={true}
                preferSize="large"
                fallbackGradient="from-primary/20 via-accent/20 to-primary/10"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
            
            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex flex-wrap gap-2">
              {isNew && (
                <Badge 
                  className="bg-emerald-500/95 backdrop-blur-sm text-white border-0 text-xs sm:text-sm shadow-md gap-1 animate-pulse"
                  data-testid={`badge-new-${article.id}`}
                >
                  <Zap className="h-3 w-3" />
                  جديد
                </Badge>
              )}
              {article.articleType === 'infographic' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <InfographicBadgeIcon dataTestId={`badge-infographic-${article.id}`} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-sm">إنفوجرافيك</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {article.articleType === 'weekly_photos' && (
                <Badge 
                  className="bg-violet-500/90 backdrop-blur-sm text-white border-0 text-xs sm:text-sm shadow-md gap-1"
                  data-testid={`badge-photos-${article.id}`}
                >
                  <Camera className="h-3 w-3" />
                  صور
                </Badge>
              )}
              {article.hasPoll && (
                <Badge 
                  className="bg-cyan-500/90 backdrop-blur-sm text-white border-0 text-xs sm:text-sm shadow-md gap-1"
                  data-testid={`badge-poll-${article.id}`}
                >
                  <BarChart3 className="h-3 w-3" />
                  استطلاع
                </Badge>
              )}
              {article.category && (
                <Badge 
                  className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm text-gray-900 dark:text-white border border-gray-200/50 dark:border-gray-700/50 text-xs sm:text-sm shadow-lg font-semibold" 
                  data-testid={`badge-category-${article.id}`}
                >
                  {article.category.nameAr}
                </Badge>
              )}
            </div>

            {aiInsight && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
                      <Badge className="bg-black/60 backdrop-blur-md text-white border-white/30 gap-1.5 shadow-lg">
                        <aiInsight.icon className="h-3.5 w-3.5" />
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">{aiInsight.text}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {(article as any).isVideoTemplate && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                  <Play className="h-8 w-8 sm:h-10 sm:w-10 text-primary-foreground fill-current mr-[-2px]" />
                </div>
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 md:p-8 text-white">
              <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-2 sm:mb-3 leading-tight" data-testid={`text-title-${article.id}`}>
                {article.title}
              </h2>
              <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-white/80 flex-wrap">
                {article.author && (
                  <span className="font-medium">
                    {article.author.firstName} {article.author.lastName}
                  </span>
                )}
                {timeAgo && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                    {timeAgo}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link href={`/article/${article.englishSlug || article.slug}`} data-testid={`link-article-${article.id}`}>
        <Card className="group overflow-hidden rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md transition-all duration-300 !border-0 !bg-transparent">
          <CardContent className="p-3">
            <div className="flex items-start gap-2 mb-2">
              {isNew && (
                <Badge 
                  className="bg-emerald-500 text-white border-0 text-[10px] px-1.5 py-0.5 gap-1 animate-pulse"
                  data-testid={`badge-new-${article.id}`}
                >
                  <Zap className="h-2.5 w-2.5" />
                  جديد
                </Badge>
              )}
              {article.articleType === 'infographic' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <InfographicBadgeIcon dataTestId={`badge-infographic-${article.id}`} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-sm">إنفوجرافيك</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {article.articleType === 'weekly_photos' && (
                <Badge 
                  variant="outline" 
                  className="text-[10px] px-1.5 py-0.5 border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 gap-1"
                  data-testid={`badge-photos-${article.id}`}
                >
                  <Camera className="h-2.5 w-2.5" />
                  صور
                </Badge>
              )}
              {article.hasPoll && (
                <Badge 
                  variant="outline" 
                  className="text-[10px] px-1.5 py-0.5 border-cyan-300 dark:border-cyan-700 text-cyan-600 dark:text-cyan-400 gap-1"
                  data-testid={`badge-poll-${article.id}`}
                >
                  <BarChart3 className="h-2.5 w-2.5" />
                  استطلاع
                </Badge>
              )}
              {article.category && (
                <Badge 
                  variant="outline" 
                  className="text-[10px] px-1.5 py-0.5 border-primary/20 text-primary"
                  data-testid={`badge-category-${article.id}`}
                >
                  {article.category.nameAr}
                </Badge>
              )}
              {aiInsight && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-primary/20">
                        <aiInsight.icon className="h-2.5 w-2.5 text-primary" />
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{aiInsight.text}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            
            <h3 className="text-sm font-semibold leading-relaxed line-clamp-2 group-hover:text-primary transition-colors mb-2" data-testid={`text-title-${article.id}`}>
              {article.title}
            </h3>

            <div className="flex items-center justify-between text-[10px] text-slate-500">
              {timeAgo && <span>{timeAgo}</span>}
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  if (variant === "list") {
    return (
      <Card className="group rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md transition-all duration-300 !border-0 !bg-transparent">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <Link href={`/article/${article.englishSlug || article.slug}`} className="flex-shrink-0" data-testid={`link-article-${article.id}`}>
              <div className="relative w-32 h-32 rounded-lg overflow-hidden">
                {displayImageUrl ? (
                  <OptimizedImage
                    src={displayImageUrl}
                    alt={article.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    objectPosition={getObjectPosition(article)}
                    priority={false}
                    preferSize="small"
                    fallbackGradient="from-primary/10 to-accent/10"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-primary/10 to-accent/10" />
                )}
                {(article as any).isVideoTemplate && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-10 h-10 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                      <Play className="h-5 w-5 text-primary-foreground fill-current mr-[-1px]" />
                    </div>
                  </div>
                )}
                {article.category && (
                  <div className="absolute bottom-2 right-2">
                    <Badge 
                      className="bg-primary/90 backdrop-blur-sm text-white border-0 text-[10px] px-2 py-0.5"
                      data-testid={`badge-category-${article.id}`}
                    >
                      {article.category.nameAr}
                    </Badge>
                  </div>
                )}
              </div>
            </Link>

            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-2">
                {isNew && (
                  <Badge 
                    className="bg-emerald-500 text-white border-0 text-xs gap-1 animate-pulse"
                    data-testid={`badge-new-${article.id}`}
                  >
                    <Zap className="h-3 w-3" />
                    جديد
                  </Badge>
                )}
                {article.articleType === 'infographic' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <InfographicBadgeIcon dataTestId={`badge-infographic-${article.id}`} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-sm">إنفوجرافيك</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {article.articleType === 'weekly_photos' && (
                  <Badge 
                    className="bg-violet-500/90 text-white border-0 text-xs gap-1"
                    data-testid={`badge-photos-${article.id}`}
                  >
                    <Camera className="h-3 w-3" />
                    صور
                  </Badge>
                )}
                {article.hasPoll && (
                  <Badge 
                    className="bg-cyan-500/90 text-white border-0 text-xs gap-1"
                    data-testid={`badge-poll-${article.id}`}
                  >
                    <BarChart3 className="h-3 w-3" />
                    استطلاع
                  </Badge>
                )}
                {aiInsight && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-xs gap-1 border-primary/20" data-testid={`badge-ai-${article.id}`}>
                          <aiInsight.icon className="h-3 w-3 text-primary" />
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-sm">{aiInsight.text}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              <Link href={`/article/${article.englishSlug || article.slug}`}>
                <h3 className="text-[17px] font-semibold mb-2 line-clamp-2 leading-relaxed group-hover:text-primary transition-colors" data-testid={`text-title-${article.id}`}>
                  {article.title}
                </h3>
              </Link>

              {article.aiSummary && (
                <p className="text-sm text-[#475569] line-clamp-2 mb-3 leading-relaxed">
                  {article.aiSummary}
                </p>
              )}

              {article.storyId && article.storyTitle && (
                <div className="mb-3" onClick={(e) => e.preventDefault()}>
                  <FollowStoryButton 
                    storyId={article.storyId} 
                    storyTitle={article.storyTitle}
                  />
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {timeAgo && <span>{timeAgo}</span>}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 hover-elevate"
                    onClick={(e) => {
                      e.preventDefault();
                      onReact?.(article.id);
                    }}
                    data-testid={`button-react-${article.id}`}
                  >
                    <Heart className={`h-4 w-4 ${article.hasReacted ? 'fill-red-500 text-red-500' : ''}`} />
                    <span className="text-xs">{(article.reactionsCount || 0).toLocaleString('en-US')}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 hover-elevate"
                    onClick={(e) => {
                      e.preventDefault();
                      onBookmark?.(article.id);
                    }}
                    data-testid={`button-bookmark-${article.id}`}
                  >
                    <Bookmark className={`h-4 w-4 ${article.isBookmarked ? 'fill-current' : ''}`} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Grid variant (default) - Professional News Card
  return (
    <Card className="group overflow-hidden rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md transition-all duration-300 !border-0 !bg-transparent" data-testid={`card-article-${article.id}`}>
      <CardContent className="p-0">
        <Link href={`/article/${article.englishSlug || article.slug}`} data-testid={`link-article-${article.id}`}>
          <div className="relative aspect-[16/9] overflow-hidden">
            {displayImageUrl ? (
              <OptimizedImage
                src={displayImageUrl}
                alt={article.title}
                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                objectPosition={getObjectPosition(article)}
                priority={false}
                preferSize="medium"
                fallbackGradient="from-primary/10 to-accent/10"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/10 to-accent/10" />
            )}
            
            {(article as any).isVideoTemplate && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                  <Play className="h-6 w-6 text-primary-foreground fill-current mr-[-1px]" />
                </div>
              </div>
            )}
            
            <div className="absolute top-3 right-3 flex flex-wrap gap-2">
              {isNew && (
                <Badge 
                  className="bg-emerald-500/95 backdrop-blur-sm text-white border-0 text-xs shadow-md gap-1 animate-pulse"
                  data-testid={`badge-new-${article.id}`}
                >
                  <Zap className="h-3 w-3" />
                  جديد
                </Badge>
              )}
              {article.articleType === 'infographic' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <InfographicBadgeIcon dataTestId={`badge-infographic-${article.id}`} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-sm">إنفوجرافيك</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {article.articleType === 'weekly_photos' && (
                <Badge 
                  className="bg-violet-500/90 backdrop-blur-sm text-white border-0 text-xs shadow-md gap-1"
                  data-testid={`badge-photos-${article.id}`}
                >
                  <Camera className="h-3 w-3" />
                  صور
                </Badge>
              )}
              {article.hasPoll && (
                <Badge 
                  className="bg-cyan-500/90 backdrop-blur-sm text-white border-0 text-xs shadow-md gap-1"
                  data-testid={`badge-poll-${article.id}`}
                >
                  <BarChart3 className="h-3 w-3" />
                  استطلاع
                </Badge>
              )}
              {article.category && (
                <Badge 
                  className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm text-gray-900 dark:text-white border border-gray-200/50 dark:border-gray-700/50 text-xs shadow-lg font-semibold"
                  data-testid={`badge-category-${article.id}`}
                >
                  {article.category.nameAr}
                </Badge>
              )}
              {aiInsight && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="bg-black/60 backdrop-blur-md text-white border-white/30 gap-1.5 shadow-lg">
                        <aiInsight.icon className="h-3.5 w-3.5" />
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-sm">{aiInsight.text}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </Link>

        <div className="p-4">
          <Link href={`/article/${article.englishSlug || article.slug}`}>
            <h3 className="text-[17px] font-semibold mb-2 line-clamp-2 leading-relaxed text-[#0F172A] dark:text-foreground group-hover:text-primary transition-colors" data-testid={`text-title-${article.id}`}>
              {article.title}
            </h3>
          </Link>

        {article.aiSummary && (
          <p className="text-sm text-[#475569] dark:text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
            {article.aiSummary}
          </p>
        )}

        {article.storyId && article.storyTitle && (
          <div className="mb-3" onClick={(e) => e.preventDefault()}>
            <FollowStoryButton 
              storyId={article.storyId} 
              storyTitle={article.storyTitle}
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-3">
          <div className="flex items-center gap-2 text-xs">
            {article.category && (
              <Badge 
                variant="outline" 
                className="text-xs px-2 py-0.5 border-primary/30 text-primary font-medium"
                data-testid={`badge-category-footer-${article.id}`}
              >
                {article.category.nameAr}
              </Badge>
            )}
            {timeAgo && (
              <span className="flex items-center gap-1 text-slate-500 dark:text-muted-foreground">
                <Clock className="h-3 w-3" />
                {timeAgo}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover-elevate"
              onClick={(e) => {
                e.preventDefault();
                onReact?.(article.id);
              }}
              data-testid={`button-react-${article.id}`}
            >
              <Heart className={`h-4 w-4 ${article.hasReacted ? 'fill-red-500 text-red-500' : ''}`} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover-elevate"
              onClick={(e) => {
                e.preventDefault();
                onBookmark?.(article.id);
              }}
              data-testid={`button-bookmark-${article.id}`}
            >
              <Bookmark className={`h-4 w-4 ${article.isBookmarked ? 'fill-current' : ''}`} />
            </Button>

            <Link href={`/article/${article.englishSlug || article.slug}#comments`}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover-elevate"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-comments-${article.id}`}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
      </CardContent>
    </Card>
  );
}
