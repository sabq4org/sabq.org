import { Link } from "wouter";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import { Calendar, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

interface RelatedInfographic {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  infographicBannerUrl?: string | null;
  thumbnailUrl?: string | null;
  publishedAt: string | null;
  views: number;
  excerpt: string | null;
  category: {
    id: string;
    nameAr: string;
    icon: string | null;
  } | null;
}

interface RelatedInfographicsProps {
  currentSlug: string;
}

export function RelatedInfographics({ currentSlug }: RelatedInfographicsProps) {
  const { data: infographics, isLoading } = useQuery<RelatedInfographic[]>({
    queryKey: [`/api/articles/${currentSlug}/infographics`],
    enabled: !!currentSlug,
  });

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="h-32 w-full" />
            <CardContent className="p-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // No infographics found
  if (!infographics || infographics.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4" data-testid="sidebar-related-infographics">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold">إنفوجرافيك سابق</h3>
      </div>

      {/* Infographics List */}
      <div className="space-y-3">
        {infographics.map((infographic, index) => (
          <Link
            key={infographic.id}
            href={`/ar/ifox/${infographic.slug}`}
            data-testid={`link-related-infographic-${index}`}
          >
            <Card className="overflow-hidden cursor-pointer hover-elevate transition-all duration-300 border-muted">
              <div className="relative">
                {/* Thumbnail Image - prioritize infographic banner for 16:9 display */}
                {(() => {
                  const displayUrl = infographic.infographicBannerUrl || infographic.imageUrl || infographic.thumbnailUrl;
                  return displayUrl ? (
                    <div className="aspect-video w-full overflow-hidden bg-muted">
                      <img
                        src={displayUrl}
                        alt={infographic.title}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        data-testid={`image-related-infographic-${index}`}
                      />
                    </div>
                  ) : (
                    <div className="aspect-video w-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                      <TrendingUp className="h-8 w-8 text-primary/20" />
                    </div>
                  );
                })()}

                {/* Category Badge (overlay) */}
                {infographic.category && (
                  <div className="absolute top-2 right-2">
                    <Badge 
                      variant="secondary" 
                      className="text-xs bg-background/90 backdrop-blur-sm"
                      data-testid={`badge-category-${index}`}
                    >
                      {infographic.category.icon} {infographic.category.nameAr}
                    </Badge>
                  </div>
                )}
              </div>

              <CardContent className="p-3 space-y-2">
                {/* Title */}
                <h4 
                  className="font-bold text-sm line-clamp-2 hover:text-primary transition-colors"
                  data-testid={`text-title-${index}`}
                >
                  {infographic.title}
                </h4>

                {/* Excerpt if available */}
                {infographic.excerpt && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {infographic.excerpt}
                  </p>
                )}

                {/* Meta Info */}
                {infographic.publishedAt && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1" data-testid={`text-date-${index}`}>
                      <Calendar className="h-3 w-3" />
                      {format(new Date(infographic.publishedAt), 'dd MMM', { locale: arSA })}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* View More Link */}
      {infographics.length >= 4 && (
        <Link href="/ar/ifox">
          <Card className="p-3 text-center hover-elevate cursor-pointer border-dashed">
            <span className="text-sm font-medium text-primary">
              عرض المزيد من الإنفوجرافيك
            </span>
          </Card>
        </Link>
      )}
    </div>
  );
}