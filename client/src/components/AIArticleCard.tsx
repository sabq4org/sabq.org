import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Clock, 
  Heart, 
  MessageCircle, 
  Bookmark,
  Sparkles,
  Zap,
  TrendingUp,
  Star,
  Brain
} from "lucide-react";
import { Link } from "wouter";
import type { ArticleWithDetails } from "@shared/schema";
import { getObjectPosition } from "@/lib/imageUtils";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import FollowStoryButton from "./FollowStoryButton";
import { motion } from "framer-motion";
import { InfographicBadgeIcon } from "./InfographicBadge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AIArticleCardProps {
  article: ArticleWithDetails;
  aiScore?: number; // 0-1 score indicating AI confidence
  selectionReason?: "breaking" | "trending" | "featured" | "recommended";
  variant?: "grid" | "featured" | "list";
  onReact?: (articleId: string) => void;
  onBookmark?: (articleId: string) => void;
}

// Get reason badge based on selection reason
function getReasonBadge(reason?: string) {
  switch (reason) {
    case "breaking":
      return { label: "عاجل", icon: <Zap className="h-3 w-3" />, color: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50" };
    case "trending":
      return { label: "رائج", icon: <TrendingUp className="h-3 w-3" />, color: "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/50" };
    case "featured":
      return { label: "مميز", icon: <Star className="h-3 w-3" />, color: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/50" };
    case "recommended":
      return { label: "موصى به", icon: <Brain className="h-3 w-3" />, color: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/50" };
    default:
      return null;
  }
}

export function AIArticleCard({ 
  article, 
  aiScore = 0.85,
  selectionReason,
  variant = "grid",
  onReact,
  onBookmark 
}: AIArticleCardProps) {
  const timeAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), { 
        addSuffix: true, 
        locale: arSA 
      })
    : null;

  const reasonBadge = getReasonBadge(selectionReason);
  const scorePercentage = Math.round(aiScore * 100);

  // For infographic articles, prefer the horizontal banner URL for card display
  const getDisplayImageUrl = () => {
    if (article.articleType === 'infographic' && (article as any).infographicBannerUrl) {
      return (article as any).infographicBannerUrl;
    }
    return article.imageUrl || article.thumbnailUrl;
  };
  const displayImageUrl = getDisplayImageUrl();

  if (variant === "featured") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link href={`/article/${article.englishSlug || article.slug}`} data-testid={`link-article-${article.id}`}>
          <Card className="group overflow-hidden border-2 border-primary/30 dark:border-primary/20 relative bg-gradient-to-br from-primary/5 via-background to-accent/5">
            {/* AI Gradient Border Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/30 via-accent/30 to-primary/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-lg" style={{ padding: '2px' }}>
              <div className="absolute inset-[2px] bg-card rounded-lg" />
            </div>
            
            <div className="relative aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9] overflow-hidden">
              {displayImageUrl ? (
                <img
                  src={displayImageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                  style={{
                    objectPosition: getObjectPosition(article)
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
              
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex flex-wrap gap-2">
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
                {/* AI Badge */}
                <Badge className="bg-gradient-to-r from-primary to-accent text-primary-foreground border-0 gap-1.5 text-xs sm:text-sm shadow-lg" data-testid={`badge-ai-${article.id}`}>
                  <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  اختيار ذكي
                </Badge>
                
                {reasonBadge && (
                  <Badge className={`${reasonBadge.color} border gap-1 text-xs sm:text-sm backdrop-blur-sm`} data-testid={`badge-reason-${article.id}`}>
                    {reasonBadge.icon}
                    {reasonBadge.label}
                  </Badge>
                )}
              </div>

              {/* AI Score Indicator */}
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
                <div className="bg-black/70 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1.5">
                  <Brain className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
                  <span className="text-xs sm:text-sm font-bold text-white">{scorePercentage}%</span>
                </div>
              </div>

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
      </motion.div>
    );
  }

  // Grid variant (default) - Simple Clean Design
  return (
    <Link href={`/article/${article.englishSlug || article.slug}`}>
      <Card 
        className="group hover-elevate active-elevate-2 cursor-pointer h-full overflow-hidden" 
        data-testid={`card-ai-article-${article.id}`}
      >
        {displayImageUrl && (
          <div className="relative h-44 sm:h-48 overflow-hidden">
            <img
              src={displayImageUrl}
              alt={article.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              style={{
                objectPosition: getObjectPosition(article)
              }}
            />
            
            {/* Simple Smart Selection Badge */}
            <div className="absolute top-2 sm:top-3 right-2 sm:right-3 flex gap-2">
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
              {reasonBadge && (
                <Badge 
                  className={`${reasonBadge.color} shadow-md text-xs px-2`}
                  data-testid={`badge-reason-${article.id}`}
                >
                  {reasonBadge.icon}
                  <span className="mr-1">{reasonBadge.label}</span>
                </Badge>
              )}
              {article.category && !reasonBadge && (
                <Badge 
                  variant="default" 
                  className="shadow-md text-xs px-2" 
                  data-testid={`badge-category-${article.id}`}
                >
                  {article.category.icon} {article.category.nameAr}
                </Badge>
              )}
            </div>
          </div>
        )}

        <CardContent className="p-3 sm:p-4 space-y-2 sm:space-y-3">
          <h3 className="text-base sm:text-lg font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors" data-testid={`text-title-${article.id}`}>
            {article.title}
          </h3>

          {article.storyId && article.storyTitle && (
            <div className="hidden sm:block" onClick={(e) => e.preventDefault()}>
              <FollowStoryButton 
                storyId={article.storyId} 
                storyTitle={article.storyTitle}
              />
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto">
            {article.author && (
              <span className="font-medium truncate">
                {article.author.firstName} {article.author.lastName}
              </span>
            )}
            {timeAgo && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {timeAgo}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
