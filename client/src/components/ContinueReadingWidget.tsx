import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, ArrowLeft, Camera } from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ArticleWithDetails } from "@shared/schema";
import { OptimizedImage } from "./OptimizedImage";
import { getObjectPosition } from "@/lib/imageUtils";

interface ContinueReadingArticle extends ArticleWithDetails {
  progress: number;
  lastReadAt: Date;
  reasonText?: string;
  reasonType?: string;
}

interface ContinueReadingResponse {
  articles: ContinueReadingArticle[];
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

  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <section className="py-4 md:py-6" dir="rtl">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            <Skeleton className="h-5 w-28" />
          </div>
          {/* Mobile: horizontal compact cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex gap-3 p-2">
                    <Skeleton className="w-20 h-16 rounded-md flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-1.5 w-full" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Desktop: vertical grid cards */}
          <div className="hidden md:grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-0">
                  <Skeleton className="h-32 w-full" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const articles = data?.articles || [];

  if (articles.length === 0) {
    return null;
  }

  return (
    <section className="py-4 md:py-6" dir="rtl" data-testid="section-continue-reading">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-3 md:mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 md:h-5 md:w-5 text-primary" />
            <h2 className="text-lg md:text-xl font-bold">تابع القراءة</h2>
          </div>
          <button
            onClick={handleClearAll}
            disabled={clearAllMutation.isPending}
            className="text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
            data-testid="button-clear-all-continue-reading"
          >
            {clearAllMutation.isPending ? "جاري المسح..." : "مسح الكل"}
          </button>
        </div>

        {/* Mobile: Compact horizontal cards */}
        <div className="flex flex-col gap-2 md:hidden">
          {articles.slice(0, 3).map((article) => {
            const imageSource = article.imageUrl || article.thumbnailUrl;
            return (
              <Link
                key={article.id}
                href={`/article/${article.englishSlug || article.slug}`}
                data-testid={`link-continue-article-${article.id}`}
              >
                <Card className="group hover-elevate transition-all duration-200 overflow-hidden bg-white dark:bg-card border border-slate-200 dark:border-border/50 shadow-sm">
                  <CardContent className="p-0">
                    <div className="flex gap-3 p-2">
                      {/* Compact thumbnail */}
                      {imageSource && (
                        <div className="relative w-20 h-16 flex-shrink-0 rounded-md overflow-hidden">
                          <OptimizedImage
                            src={imageSource}
                            alt={article.title}
                            className="w-full h-full object-cover"
                            objectPosition={getObjectPosition(article)}
                          />
                          {/* Progress overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <span className="absolute bottom-0.5 right-0.5 text-[10px] font-medium text-white bg-primary/90 px-1 rounded">
                            {article.progress}%
                          </span>
                          {article.articleType === 'weekly_photos' && (
                            <Badge 
                              className="absolute top-0.5 right-0.5 text-[8px] h-3.5 gap-0.5 px-1 bg-violet-500/90 text-white border-0"
                              data-testid={`badge-continue-photos-mobile-${article.id}`}
                            >
                              <Camera className="h-2 w-2" />
                            </Badge>
                          )}
                        </div>
                      )}
                      {/* Content */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <h3 className="font-medium text-xs line-clamp-2 text-slate-800 dark:text-foreground group-hover:text-primary transition-colors leading-tight">
                          {article.title}
                        </h3>
                        <div className="mt-1.5 space-y-1">
                          <Progress
                            value={article.progress}
                            className="h-1 bg-slate-100 dark:bg-slate-800"
                            data-testid={`progress-${article.id}`}
                          />
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 dark:text-muted-foreground flex items-center gap-1">
                              <Clock className="h-2.5 w-2.5" />
                              {formatDistanceToNow(new Date(article.lastReadAt), {
                                addSuffix: true,
                                locale: arSA,
                              })}
                            </span>
                            <span className="text-primary font-medium flex items-center gap-0.5">
                              أكمل
                              <ArrowLeft className="h-2.5 w-2.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Tablet/Desktop: Vertical grid cards */}
        <div className="hidden md:grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {articles.slice(0, 3).map((article) => {
            const imageSource = article.imageUrl || article.thumbnailUrl;
            return (
              <Link
                key={article.id}
                href={`/article/${article.englishSlug || article.slug}`}
                data-testid={`link-continue-article-desktop-${article.id}`}
              >
                <Card className="group hover-elevate transition-all duration-200 h-full overflow-hidden bg-white dark:bg-card border border-slate-200 dark:border-border/50 shadow-sm">
                  <CardContent className="p-0">
                    {imageSource && (
                      <div className="relative h-36 overflow-hidden">
                        <OptimizedImage
                          src={imageSource}
                          alt={article.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          objectPosition={getObjectPosition(article)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                        <Badge
                          variant="secondary"
                          className="absolute bottom-2 right-2 bg-primary text-primary-foreground text-xs font-medium shadow-sm"
                          data-testid={`badge-progress-${article.id}`}
                        >
                          {article.progress}% مقروء
                        </Badge>
                        {article.articleType === 'weekly_photos' && (
                          <Badge 
                            className="absolute top-2 right-2 text-[10px] h-4 gap-0.5 px-1.5 bg-violet-500/90 text-white border-0"
                            data-testid={`badge-continue-photos-${article.id}`}
                          >
                            <Camera className="h-2.5 w-2.5" />
                            صور
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="p-4 bg-white dark:bg-card">
                      <h3 className="font-semibold text-sm line-clamp-2 mb-3 text-slate-800 dark:text-foreground group-hover:text-primary transition-colors">
                        {article.title}
                      </h3>
                      <div className="space-y-3">
                        <Progress
                          value={article.progress}
                          className="h-2 bg-slate-100 dark:bg-slate-800"
                          data-testid={`progress-desktop-${article.id}`}
                        />
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-slate-500 dark:text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>
                              {formatDistanceToNow(new Date(article.lastReadAt), {
                                addSuffix: true,
                                locale: arSA,
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-primary font-medium">
                            <span>أكمل القراءة</span>
                            <ArrowLeft className="h-3.5 w-3.5" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
