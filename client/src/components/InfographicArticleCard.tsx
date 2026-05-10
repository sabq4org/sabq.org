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
  BarChart3, 
  Download,
  Maximize2,
  Clock,
  Heart
} from "lucide-react";
import { Link } from "wouter";
import { OptimizedImage } from "./OptimizedImage";
import { getCacheBustedImageUrl } from "@/lib/imageUtils";
import type { ArticleWithDetails } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";

interface InfographicArticleCardProps {
  article: ArticleWithDetails;
  variant?: "grid" | "featured" | "compact";
}

export function InfographicArticleCard({ 
  article, 
  variant = "grid"
}: InfographicArticleCardProps) {
  const timeAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), { 
        addSuffix: true, 
        locale: arSA 
      })
    : null;

  // Always prefer horizontal banner (16:9) for card display if available
  // This provides better visual consistency across all card types
  const getBannerUrl = () => {
    const bannerUrl = (article as any).infographicBannerUrl;
    if (bannerUrl) {
      return getCacheBustedImageUrl(bannerUrl, article.updatedAt);
    }
    return getCacheBustedImageUrl(article.imageUrl || article.thumbnailUrl, article.updatedAt);
  };
  
  // Use banner for ALL variants - it's specifically designed for card displays
  const displayImageUrl = getBannerUrl();
  const thumbnailImageUrl = getBannerUrl();

  // Featured variant - large prominent display
  if (variant === "featured") {
    return (
      <Link href={`/article/${article.englishSlug || article.slug}`} data-testid={`link-infographic-${article.id}`}>
        <Card 
          className="group overflow-hidden rounded-2xl border-2 border-primary/20 hover:border-primary/40 transition-all duration-300 bg-gradient-to-br from-primary/5 via-background to-accent/5"
          data-testid={`card-infographic-${article.id}`}
        >
          <CardContent className="p-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
              {/* Image Section - Portrait aspect ratio */}
              <div className="relative overflow-hidden bg-gradient-to-br from-muted to-muted/50">
                {displayImageUrl ? (
                  <div className="relative aspect-[3/4] md:aspect-auto md:h-full">
                    <OptimizedImage
                      src={displayImageUrl}
                      alt={article.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      priority={true}
                      preferSize="large"
                      fallbackGradient="from-primary/20 to-accent/20"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:hidden" />
                  </div>
                ) : (
                  <div className="aspect-[3/4] md:h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
                    <BarChart3 className="h-20 w-20 text-primary/30" />
                  </div>
                )}
                
                {/* Infographic Type Badge */}
                <div className="absolute top-4 right-4">
                  <Badge 
                    className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0 gap-1.5 shadow-lg px-3 py-1.5"
                    data-testid={`badge-infographic-type-${article.id}`}
                  >
                    <BarChart3 className="h-4 w-4" />
                    إنفوجرافيك
                  </Badge>
                </div>

                {/* Preview overlay on hover */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30 backdrop-blur-[2px]">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/90 text-primary rounded-full p-4 shadow-xl">
                      <Maximize2 className="h-8 w-8" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Content Section */}
              <div className="p-6 flex flex-col justify-center">
                {/* Category */}
                {article.category && (
                  <Badge 
                    variant="outline" 
                    className="w-fit mb-4 text-sm border-primary/30 text-primary"
                    data-testid={`badge-category-${article.id}`}
                  >
                    {article.category.icon} {article.category.nameAr}
                  </Badge>
                )}

                {/* Title */}
                <h2 
                  className="text-xl md:text-2xl lg:text-3xl font-bold mb-4 leading-tight group-hover:text-primary transition-colors line-clamp-3"
                  data-testid={`text-title-${article.id}`}
                >
                  {article.title}
                </h2>

                {/* Summary */}
                {article.aiSummary && (
                  <p className="text-muted-foreground text-base leading-relaxed line-clamp-2 mb-4">
                    {article.aiSummary}
                  </p>
                )}

                {/* Meta Row */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                  {timeAgo && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      {timeAgo}
                    </span>
                  )}
                  {(article.reactionsCount || 0) > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Heart className="h-4 w-4" />
                      {article.reactionsCount}
                    </span>
                  )}
                </div>

                {/* CTA Button */}
                <Button 
                  size="lg" 
                  className="w-full md:w-auto gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                  data-testid={`button-view-infographic-${article.id}`}
                >
                  <Maximize2 className="h-5 w-5" />
                  استعرض الإنفوجرافيك
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  // Compact variant - use horizontal banner for thumbnails
  if (variant === "compact") {
    return (
      <Link href={`/article/${article.englishSlug || article.slug}`} data-testid={`link-infographic-${article.id}`}>
        <Card 
          className="group overflow-hidden rounded-xl border border-primary/20 hover:border-primary/40 transition-all hover-elevate bg-gradient-to-r from-primary/5 to-transparent"
          data-testid={`card-infographic-${article.id}`}
        >
          <CardContent className="p-3 flex items-center gap-3">
            {/* Small thumbnail - use banner URL for horizontal display */}
            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gradient-to-br from-primary/10 to-accent/10">
              {thumbnailImageUrl ? (
                <OptimizedImage
                  src={thumbnailImageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover"
                  priority={false}
                  preferSize="small"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-primary/40" />
                </div>
              )}
              {/* Mini badge */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <BarChart3 className="h-4 w-4 text-white drop-shadow-md" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold line-clamp-2 group-hover:text-primary transition-colors">
                {article.title}
              </h3>
              {timeAgo && (
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{timeAgo}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  }

  // Grid variant (default) - Portrait card with distinctive design
  return (
    <Link href={`/article/${article.englishSlug || article.slug}`} data-testid={`link-infographic-${article.id}`}>
      <Card 
        className="group overflow-hidden rounded-xl border-2 border-primary/20 hover:border-primary/40 transition-all duration-300 hover-elevate bg-gradient-to-b from-primary/5 via-background to-accent/5"
        data-testid={`card-infographic-${article.id}`}
      >
        <CardContent className="p-0">
          {/* Image Section - Portrait ratio for infographics */}
          <div className="relative overflow-hidden bg-gradient-to-br from-muted to-muted/50">
            {displayImageUrl ? (
              <div className="relative aspect-[3/4]">
                <OptimizedImage
                  src={displayImageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  priority={false}
                  preferSize="medium"
                  fallbackGradient="from-primary/20 to-accent/20"
                />
                {/* Gradient overlay at bottom */}
                <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
              </div>
            ) : (
              <div className="aspect-[3/4] flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
                <BarChart3 className="h-16 w-16 text-primary/30" />
              </div>
            )}
            
            {/* Infographic Type Badge */}
            <div className="absolute top-3 right-3">
              <Badge 
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0 gap-1.5 shadow-lg text-xs px-2.5 py-1"
                data-testid={`badge-infographic-type-${article.id}`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                إنفوجرافيك
              </Badge>
            </div>

            {/* Category Badge */}
            {article.category && (
              <div className="absolute top-3 left-3">
                <Badge 
                  className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm text-foreground border-0 text-xs shadow-md"
                  data-testid={`badge-category-${article.id}`}
                >
                  {article.category.nameAr}
                </Badge>
              </div>
            )}

            {/* Preview overlay on hover */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/30 backdrop-blur-[2px]">
              <div className="bg-white/90 text-primary rounded-full p-3 shadow-xl">
                <Maximize2 className="h-6 w-6" />
              </div>
            </div>

            {/* Bottom info on image */}
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h3 
                className="text-white font-bold text-lg leading-tight line-clamp-2 drop-shadow-lg"
                data-testid={`text-title-${article.id}`}
              >
                {article.title}
              </h3>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-gradient-to-b from-muted/30 to-transparent">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                {timeAgo && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {timeAgo}
                  </span>
                )}
              </div>
              {(article.reactionsCount || 0) > 0 && (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" />
                    {article.reactionsCount}
                  </span>
                </div>
              )}
            </div>

            {/* View CTA */}
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-3 gap-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
              data-testid={`button-view-infographic-${article.id}`}
            >
              <Maximize2 className="h-4 w-4" />
              استعرض الإنفوجرافيك
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
