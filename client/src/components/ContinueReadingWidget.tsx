import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, Camera } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ArticleWithDetails } from "@shared/schema";
import { OptimizedImage } from "./OptimizedImage";
import { getObjectPosition, getArticleDisplayImageUrl } from "@/lib/imageUtils";

interface ContinueReadingArticle extends ArticleWithDetails {
  progress: number;
  lastReadAt: Date;
  reasonText?: string;
  reasonType?: string;
}

interface ContinueReadingResponse {
  articles: ContinueReadingArticle[];
}

function ContinueReadingCardSkeleton() {
  return (
    <Card className="overflow-hidden border-0 dark:border dark:border-card-border">
      <Skeleton className="aspect-[16/9] w-full" />
      <CardContent className="p-3 space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-1.5 w-full" />
        <div className="flex items-center gap-2 pt-1">
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

function ContinueReadingCard({ article, index }: { article: ContinueReadingArticle; index: number }) {
  if (!article) return null;

  const imageSource = getArticleDisplayImageUrl(article);
  const timeAgo = article.lastReadAt
    ? formatDistanceToNow(new Date(article.lastReadAt), {
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
      <Link href={`/article/${article.englishSlug || article.slug}`} data-testid={`link-continue-article-${article.id}`}>
        <Card
          className="group overflow-hidden border-0 dark:border dark:border-card-border h-full hover-elevate active-elevate-2 cursor-pointer transition-all duration-300"
          data-testid={`card-continue-${article.id}`}
        >
          <div className="relative aspect-[16/9] overflow-hidden">
            {imageSource ? (
              <OptimizedImage
                src={imageSource}
                alt={article.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                objectPosition={getObjectPosition(article)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-500/20 via-primary/20 to-blue-500/10" />
            )}
            <div className="absolute top-2 right-2 flex gap-1">
              <Badge
                className="bg-primary/90 hover:bg-primary text-primary-foreground border-0 text-[10px] gap-0.5 px-2 py-0.5"
                data-testid={`badge-progress-${article.id}`}
              >
                {article.progress}%
              </Badge>
              {article.articleType === 'weekly_photos' && (
                <Badge
                  className="bg-violet-500/90 hover:bg-violet-600 text-white border-0 text-[10px] gap-0.5 px-2 py-0.5"
                  data-testid={`badge-continue-photos-${article.id}`}
                >
                  <Camera className="h-2.5 w-2.5" />
                  صور
                </Badge>
              )}
              {article.category && (
                <Badge
                  className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm text-gray-900 dark:text-white border border-gray-200/50 dark:border-gray-700/50 text-[10px] shadow-sm px-2 py-0.5 font-semibold"
                  data-testid={`badge-continue-category-${article.id}`}
                >
                  {article.category.nameAr}
                </Badge>
              )}
            </div>
          </div>

          <CardContent className="p-3 space-y-2">
            <h3
              className="font-bold text-sm leading-relaxed line-clamp-2 group-hover:text-primary transition-colors"
              data-testid={`text-continue-title-${article.id}`}
            >
              {article.title}
            </h3>

            <Progress
              value={article.progress}
              className="h-1 bg-slate-100 dark:bg-slate-800"
              data-testid={`progress-${article.id}`}
            />

            {timeAgo && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  {timeAgo}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

export function ContinueReadingWidget() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ContinueReadingResponse>({
    queryKey: ["/api/personalization/continue-reading"],
    enabled: !!user,
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/personalization/continue-reading/clear-all", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personalization/continue-reading"] });
      toast({
        title: "تم المسح",
        description: "تم مسح جميع المقالات من قائمة المتابعة",
      });
    },
    onError: () => {
      toast({
        title: "حدث خطأ",
        description: "تعذر مسح المقالات، يرجى المحاولة مرة أخرى",
        variant: "destructive",
      });
    },
  });

  const handleClearAll = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearAllMutation.mutate();
  };

  if (!user) return null;

  const articles = data?.articles || [];
  const hasArticles = articles.length > 0;

  if (!hasArticles && !isLoading) return null;

  return (
    <section className="py-8" dir="rtl" data-testid="section-continue-reading">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="flex items-center justify-between gap-3 mb-6 flex-wrap"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold" data-testid="heading-continue-reading">
                تابع القراءة
              </h2>
              <p className="text-sm text-muted-foreground">
                المقالات التي بدأت قراءتها
              </p>
            </div>
          </div>
          <button
            onClick={handleClearAll}
            disabled={clearAllMutation.isPending}
            className="text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
            data-testid="button-clear-all-continue-reading"
          >
            {clearAllMutation.isPending ? "جاري المسح..." : "مسح الكل"}
          </button>
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
            <div className="hidden lg:grid lg:grid-cols-5 gap-3 sm:gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <ContinueReadingCardSkeleton key={i} />
              ))}
            </div>
          </>
        ) : hasArticles ? (
          <>
            {/* Mobile: List View (styled like Muqtarab Showcase) */}
            <Card className="lg:hidden border-0 shadow-sm overflow-hidden">
              <CardContent className="p-0 divide-y divide-border/50 bg-card">
                {articles.slice(0, 5).map((article, index) => {
                  const imageSource = getArticleDisplayImageUrl(article);
                  const timeAgo = article.lastReadAt
                    ? formatDistanceToNow(new Date(article.lastReadAt), {
                        addSuffix: true,
                        locale: arSA,
                      })
                    : null;
                  
                  const categoryColor = article.category?.color || 'hsl(var(--primary))';

                  return (
                    <Link 
                      key={article.id} 
                      href={`/article/${article.englishSlug || article.slug}`}
                      data-testid={`link-continue-article-mobile-${article.id}`}
                    >
                      <div className="block group cursor-pointer">
                        <div className="p-3 hover-elevate active-elevate-2 transition-all">
                          <div className="flex gap-3">
                            {/* Image */}
                            <div className="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden">
                              {imageSource ? (
                                <OptimizedImage
                                  src={imageSource}
                                  alt={article.title}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                  objectPosition={getObjectPosition(article)}
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-blue-500/20 via-primary/20 to-blue-500/10" />
                              )}
                              
                              {/* Progress Badge overlay */}
                              <div className="absolute top-1 right-1">
                                <Badge 
                                  className="bg-primary/95 text-primary-foreground border-0 text-[9px] px-1 py-0.5 h-3.5 flex items-center justify-center font-bold"
                                >
                                  {article.progress}%
                                </Badge>
                              </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0 space-y-1">
                              {/* Category / Meta Badge */}
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
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
                                <span className="text-[10px] text-primary font-bold">{article.progress}%</span>
                              </div>

                              {/* Title */}
                              <h4 className="font-bold text-sm line-clamp-2 leading-snug group-hover:text-primary transition-colors text-foreground">
                                {article.title}
                              </h4>

                              {/* Progress Bar */}
                              <Progress
                                value={article.progress}
                                className="h-1 bg-slate-100 dark:bg-slate-800"
                              />

                              {/* Meta */}
                              {timeAgo && (
                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                                  <Clock className="h-3 w-3" />
                                  <span>قرأت {timeAgo}</span>
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
            <div className="hidden lg:grid lg:grid-cols-5 gap-3 sm:gap-4">
              {articles.slice(0, 5).map((article, index) => (
                <ContinueReadingCard
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
