import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Film, Play, Heart, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface ShortItem {
  id: string;
  title: string;
  description?: string;
  slug: string;
  coverImage: string;
  duration?: number;
  category?: {
    id: string;
    nameAr: string;
    slug: string;
    color?: string;
  };
  reporter?: {
    id: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  };
  views: number;
  likes: number;
}

interface ShortsResponse {
  shorts: ShortItem[];
  total: number;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" data-testid="shorts-loading">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <Skeleton className="w-full sm:w-[280px] h-[498px] rounded-xl" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}

function EmptyState() {
  return null; // Don't show anything if there are no shorts
}

export function ShortsHomeBlock() {
  const { data, isLoading } = useQuery<ShortsResponse>({
    queryKey: ["/api/shorts/featured"],
  });

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // Don't render anything if no data or no shorts
  if (!data || !data.shorts || data.shorts.length === 0) {
    return <EmptyState />;
  }

  // Get the first featured short
  const featuredShort = data.shorts[0];
  const reporterName = featuredShort.reporter 
    ? `${featuredShort.reporter.firstName || ''} ${featuredShort.reporter.lastName || ''}`.trim() 
    : '';

  return (
    <div className="space-y-3" data-testid="shorts-home-block">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
          <Film className="h-3.5 w-3.5 text-white" />
        </div>
        <div>
          <h2 className="text-base sm:text-lg font-bold" data-testid="shorts-title">
            سبق قصير
          </h2>
          <p className="text-[10px] sm:text-xs text-muted-foreground" data-testid="shorts-subtitle">
            محتوى مرئي سريع ومميز
          </p>
        </div>
      </div>

      {/* Featured Short Card + View More Button */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        {/* Vertical Card (9:16 aspect ratio) */}
        <Link href="/shorts">
          <Card 
            className="group relative w-full sm:w-[280px] aspect-[9/16] overflow-hidden cursor-pointer hover-elevate border-2"
            data-testid={`short-card-${featuredShort.id}`}
          >
            {/* Cover Image */}
            <div className="absolute inset-0">
              <img 
                src={featuredShort.coverImage} 
                alt={featuredShort.title}
                className="w-full h-full object-cover"
                data-testid={`short-cover-${featuredShort.id}`}
              />
              
              {/* Gradient Overlay for better text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            </div>

            {/* Play Button Overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play className="h-8 w-8 text-white fill-white" data-testid={`play-button-${featuredShort.id}`} />
              </div>
            </div>

            {/* Content Overlay */}
            <div className="absolute inset-x-0 bottom-0 p-4 space-y-3">
              {/* Category Badge */}
              {featuredShort.category && (
                <Badge 
                  variant="secondary" 
                  className="bg-white/20 text-white backdrop-blur-sm border-0"
                  data-testid={`short-category-${featuredShort.id}`}
                >
                  {featuredShort.category.nameAr}
                </Badge>
              )}

              {/* Title */}
              <h3 
                className="text-white font-bold text-lg line-clamp-2"
                data-testid={`short-title-${featuredShort.id}`}
              >
                {featuredShort.title}
              </h3>

              {/* Reporter Name */}
              {reporterName && (
                <p 
                  className="text-white/90 text-sm"
                  data-testid={`short-reporter-${featuredShort.id}`}
                >
                  {reporterName}
                </p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-4 text-white/80 text-sm">
                <div className="flex items-center gap-1" data-testid={`short-likes-${featuredShort.id}`}>
                  <Heart className="h-4 w-4" />
                  <span>{featuredShort.likes.toLocaleString('en-US')}</span>
                </div>
              </div>

              {/* Duration Badge (if available) */}
              {featuredShort.duration && (
                <div 
                  className="absolute top-4 left-4 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm"
                  data-testid={`short-duration-${featuredShort.id}`}
                >
                  {Math.floor(featuredShort.duration / 60)}:{(featuredShort.duration % 60).toString().padStart(2, '0')}
                </div>
              )}
            </div>
          </Card>
        </Link>

        {/* View More Button */}
        <Link href="/shorts">
          <Button 
            variant="outline" 
            className="gap-1"
            data-testid="button-view-more-shorts"
          >
            شاهد المزيد
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
