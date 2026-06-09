import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Flame, 
  Clock, 
  Camera,
  Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { OptimizedImage } from "./OptimizedImage";
import { getObjectPosition } from "@/lib/imageUtils";

interface TrendingArticle {
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
  views?: number;
  category?: {
    id: string;
    nameAr: string;
    color?: string | null;
  } | null;
}

interface TrendingResponse {
  trending: TrendingArticle[];
}

function TrendingCardSkeleton() {
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

function TrendingCard({ article, index }: { article: TrendingArticle; index: number }) {
  if (!article) return null;

  const timeAgo = article.publishedAt
    ? formatDistanceToNow(new Date(article.publishedAt), {
        addSuffix: true,
        locale: arSA,
      })
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
    >
      <Link href={`/article/${article.englishSlug || article.slug}`} data-testid={`link-trending-article-${article.id}`}>
        <Card 
          className="group overflow-hidden border-0 dark:border dark:border-card-border h-full hover-elevate active-elevate-2 cursor-pointer transition-all duration-300"
          data-testid={`card-trending-${article.id}`}
        >
          <div className="relative aspect-[16/9] overflow-hidden">
            {(article.infographicBannerUrl || article.imageUrl || article.thumbnailUrl) ? (
              <OptimizedImage
                src={article.infographicBannerUrl || article.imageUrl || article.thumbnailUrl || ''}
                alt={article.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                objectPosition={getObjectPosition(article)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-orange-500/20 via-red-500/20 to-orange-500/10" />
            )}
            <div className="absolute top-2 right-2 flex gap-1">
              {article.views !== undefined && article.views > 0 && (
                <Badge 
                  className="bg-orange-500/90 hover:bg-orange-600 text-white border-0 text-[10px] gap-0.5 px-2 py-0.5"
                  data-testid={`badge-views-${article.id}`}
                >
                  <Eye className="h-2.5 w-2.5" />
                  {article.views.toLocaleString('en-US')}
                </Badge>
              )}
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
              data-testid={`text-trending-title-${article.id}`}
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
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

export function TrendingWeekSection() {
  const { data, isLoading } = useQuery<TrendingResponse>({
    queryKey: ['/api/recommendations/trending', { limit: 5 }],
    queryFn: async () => {
      const res = await fetch('/api/recommendations/trending?limit=5', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Failed to fetch trending articles');
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const articles = data?.trending || [];
  const hasArticles = articles.length > 0;

  if (!hasArticles && !isLoading) return null;

  return (
    <section className="py-8" dir="rtl" data-testid="section-trending-week">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div 
          className="flex items-center justify-between gap-3 mb-6 flex-wrap"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Flame className="h-6 w-6 text-orange-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold" data-testid="heading-trending-week">
                ترند الأسبوع
              </h2>
              <p className="text-sm text-muted-foreground">
                أكثر المقالات مشاهدة هذا الأسبوع
              </p>
            </div>
          </div>
        </motion.div>

        {isLoading ? (
          <>
            {/* Mobile Loading Skeleton */}
            <Card className="lg:hidden border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0 divide-y divide-border/50">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-3 flex gap-3">
                    <Skeleton className="w-24 h-16 rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Desktop Loading Skeleton */}
            <div className="hidden lg:grid lg:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <TrendingCardSkeleton key={i} />
              ))}
            </div>
          </>
        ) : hasArticles ? (
          <>
            {/* Mobile: List View (styled like Muqtarab Showcase) */}
            <Card className="lg:hidden border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0 divide-y divide-border/50 bg-card">
                {articles.slice(0, 5).map((article, index) => {
                  const timeAgo = article.publishedAt
                    ? formatDistanceToNow(new Date(article.publishedAt), {
                        addSuffix: true,
                        locale: arSA,
                      })
                    : null;
                  
                  const categoryColor = article.category?.color || 'hsl(var(--primary))';

                  return (
                    <Link 
                      key={article.id} 
                      href={`/article/${article.englishSlug || article.slug}`}
                      data-testid={`link-trending-article-mobile-${article.id}`}
                    >
                      <div className="block group cursor-pointer">
                        <div className="p-3 hover-elevate active-elevate-2 transition-all">
                          <div className="flex gap-3">
                            {/* Image */}
                            <div className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden">
                              {article.infographicBannerUrl || article.imageUrl || article.thumbnailUrl ? (
                                <OptimizedImage
                                  src={article.infographicBannerUrl || article.imageUrl || article.thumbnailUrl || ''}
                                  alt={article.title}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                  objectPosition={getObjectPosition(article)}
                                  preferSize="small"
                                  aspectRatio="16/9"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-orange-500/20 via-red-500/20 to-orange-500/10" />
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 space-y-1">
                              {/* Category / Views Badge */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {article.category && (
                                  <Badge 
                                    variant="secondary"
                                    className="text-[10px] h-4 text-black font-semibold"
                                    style={{ 
                                      borderRight: `3px solid ${categoryColor}`, 
                                      backgroundColor: '#e5e5e6' 
                                    }}
                                  >
                                    {article.category.nameAr}
                                  </Badge>
                                )}
                                {article.views !== undefined && article.views > 0 && (
                                  <Badge 
                                    className="bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-0 text-[10px] gap-0.5 px-2 h-4"
                                  >
                                    <Eye className="h-2.5 w-2.5" />
                                    {article.views.toLocaleString('en-US')}
                                  </Badge>
                                )}
                              </div>

                              {/* Title */}
                              <h4 className="font-bold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors text-foreground">
                                {article.title}
                              </h4>

                              {/* Meta */}
                              {timeAgo && (
                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  <span>{timeAgo}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>

            {/* Desktop View */}
            <div className="hidden lg:grid lg:grid-cols-5 gap-4">
              {articles.slice(0, 5).map((article, index) => (
                <TrendingCard 
                  key={article.id} 
                  article={article} 
                  index={index}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
