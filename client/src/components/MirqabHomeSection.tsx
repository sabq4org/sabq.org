import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Telescope, TrendingUp, Radar, Brain, Eye, Calendar, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { MirqabEntryWithDetails } from "@shared/schema";

interface MirqabHomeSectionProps {
  enabled?: boolean;
}

export function MirqabHomeSection({ enabled = true }: MirqabHomeSectionProps) {
  const { data: sabqIndexesRaw, isLoading: loadingSabq } = useQuery<MirqabEntryWithDetails[]>({
    queryKey: ['/api/mirqab/sabq-index'],
    queryFn: async () => {
      const res = await fetch('/api/mirqab/sabq-index?limit=2&status=published', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
    enabled,
  });
  const sabqIndexes = Array.isArray(sabqIndexesRaw) ? sabqIndexesRaw : [];

  const { data: nextStoriesRaw, isLoading: loadingStories } = useQuery<MirqabEntryWithDetails[]>({
    queryKey: ['/api/mirqab/next-stories'],
    queryFn: async () => {
      const res = await fetch('/api/mirqab/next-stories?limit=2&status=published', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
    enabled,
  });
  const nextStories = Array.isArray(nextStoriesRaw) ? nextStoriesRaw : [];

  const { data: algorithmArticlesRaw, isLoading: loadingAlgorithm } = useQuery<MirqabEntryWithDetails[]>({
    queryKey: ['/api/mirqab/algorithm-writes'],
    queryFn: async () => {
      const res = await fetch('/api/mirqab/algorithm-writes?limit=2&status=published', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.entries || [];
    },
    enabled,
  });
  const algorithmArticles = Array.isArray(algorithmArticlesRaw) ? algorithmArticlesRaw : [];

  const isLoading = loadingSabq || loadingStories || loadingAlgorithm;
  const hasContent = sabqIndexes.length > 0 || nextStories.length > 0 || algorithmArticles.length > 0;

  if (!isLoading && !hasContent) {
    return null;
  }

  return (
    <section className="py-12 border-t">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-md bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-600 dark:via-purple-600 dark:to-pink-600">
            <Telescope className="w-8 h-8 text-white" data-testid="icon-telescope-home" />
          </div>
          <div>
            <h2 className="text-xl md:text-3xl font-bold" data-testid="heading-mirqab-home">
              المرقاب - استشراف المستقبل
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground" data-testid="text-mirqab-subtitle">
              تحليلات وتوقعات مدعومة بالذكاء الاصطناعي
            </p>
          </div>
        </div>
        <Link href="/mirqab">
          <Button variant="outline" data-testid="button-mirqab-explore">
            استكشف المرقاب
            <ArrowLeft className="mr-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="space-y-12">
        {/* Sabq Index */}
        {(loadingSabq || sabqIndexes.length > 0) && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-md bg-gradient-to-br from-blue-500 to-cyan-500 dark:from-blue-600 dark:to-cyan-600">
                <TrendingUp className="w-6 h-6 text-white" data-testid="icon-sabq-home" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg md:text-2xl font-bold" data-testid="heading-sabq-home">مؤشر سبق</h3>
                <p className="text-xs md:text-sm text-muted-foreground">مؤشرات اقتصادية وسياسية واجتماعية</p>
              </div>
              <Link href="/mirqab/sabq-index">
                <Button variant="ghost" size="sm" data-testid="button-view-sabq">
                  عرض الكل
                  <ArrowLeft className="mr-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            {loadingSabq ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-16 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sabqIndexes.map((index: any) => (
                  <Link key={index.id} href={`/mirqab/sabq-index/${index.slug}`}>
                    <Card className="hover-elevate h-full" data-testid={`card-sabq-home-${index.id}`}>
                      <CardHeader>
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="secondary" data-testid={`badge-category-${index.id}`}>
                            {index.indexCategory}
                          </Badge>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Eye className="w-4 h-4" />
                            <span data-testid={`text-views-${index.id}`}>{index.views || 0}</span>
                          </div>
                        </div>
                        <CardTitle className="line-clamp-2 text-base md:text-lg" data-testid={`text-title-${index.id}`}>
                          {index.title}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span data-testid={`text-date-${index.id}`}>
                            {format(new Date(index.createdAt), 'dd MMMM yyyy', { locale: ar })}
                          </span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-3xl font-bold text-primary" data-testid={`text-value-${index.id}`}>
                              {index.indexValue}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              من {index.maxValue}
                            </div>
                          </div>
                          <Badge 
                            variant={index.trend === 'up' ? 'default' : index.trend === 'down' ? 'destructive' : 'secondary'}
                            data-testid={`badge-trend-${index.id}`}
                          >
                            {index.trend === 'up' ? '↑ صاعد' : index.trend === 'down' ? '↓ هابط' : '→ مستقر'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Next Stories */}
        {(loadingStories || nextStories.length > 0) && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-md bg-gradient-to-br from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600">
                <Telescope className="w-6 h-6 text-white" data-testid="icon-stories-home" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg md:text-2xl font-bold" data-testid="heading-stories-home">قصة قادمة</h3>
                <p className="text-xs md:text-sm text-muted-foreground">توقعات الأحداث المستقبلية</p>
              </div>
              <Link href="/mirqab/next-stories">
                <Button variant="ghost" size="sm" data-testid="button-view-stories">
                  عرض الكل
                  <ArrowLeft className="mr-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            {loadingStories ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {nextStories.map((story: any) => (
                  <Link key={story.id} href={`/mirqab/next-stories/${story.slug}`}>
                    <Card className="hover-elevate h-full" data-testid={`card-story-home-${story.id}`}>
                      <CardHeader>
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="secondary" data-testid={`badge-confidence-${story.id}`}>
                            ثقة {story.confidenceLevel}%
                          </Badge>
                          <Badge variant="outline" data-testid={`badge-timing-${story.id}`}>
                            {story.expectedTiming === 'week' ? 'أسبوع' :
                             story.expectedTiming === 'month' ? 'شهر' :
                             story.expectedTiming === 'quarter' ? 'ربع سنة' : 'سنة'}
                          </Badge>
                        </div>
                        <CardTitle className="line-clamp-2 text-base md:text-lg" data-testid={`text-title-${story.id}`}>
                          {story.title}
                        </CardTitle>
                        <CardDescription className="line-clamp-3" data-testid={`text-summary-${story.id}`}>
                          {story.executiveSummary}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Algorithm Writes - AI Enhanced */}
        {(loadingAlgorithm || algorithmArticles.length > 0) && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-md bg-ai-gradient ai-pulse ai-glow">
                <Brain className="w-6 h-6 text-white" data-testid="icon-algorithm-home" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg md:text-2xl font-bold" data-testid="heading-algorithm-home">
                  الخوارزمي يكتب
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground">تحليلات وآراء مدعومة بالذكاء الاصطناعي</p>
              </div>
              <Link href="/mirqab/algorithm-writes">
                <Button variant="ghost" size="sm" data-testid="button-view-algorithm">
                  عرض الكل
                  <ArrowLeft className="mr-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
            {loadingAlgorithm ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {algorithmArticles.map((article: any) => (
                  <Link key={article.id} href={`/mirqab/algorithm-writes/${article.slug}`}>
                    <div className="relative h-full">
                      {/* AI Gradient Pulse Background - Outside Card */}
                      <div className="absolute inset-0 ai-gradient-pulse opacity-20 rounded-lg pointer-events-none"></div>
                      
                      <Card className="hover-elevate h-full border-2 relative bg-card/95 backdrop-blur-sm" data-testid={`card-algorithm-home-${article.id}`}>
                      <CardHeader className="relative">
                        <div className="flex gap-2 mb-2 flex-wrap">
                          <Badge variant="secondary" data-testid={`badge-type-${article.id}`}>
                            {article.analysisType === 'opinion' ? 'رأي' :
                             article.analysisType === 'analysis' ? 'تحليل' : 'توقع'}
                          </Badge>
                          {article.aiPercentage && (
                            <Badge className="bg-ai-gradient text-white border-0" data-testid={`badge-ai-${article.id}`}>
                              <Brain className="w-3 h-3 ml-1" />
                              AI {article.aiPercentage}%
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="line-clamp-2 text-base md:text-lg" data-testid={`text-title-${article.id}`}>
                          {article.title}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span data-testid={`text-date-${article.id}`}>
                            {format(new Date(article.createdAt), 'dd MMMM yyyy', { locale: ar })}
                          </span>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="relative">
                        {article.humanReviewed && (
                          <Badge variant="default" className="mt-2" data-testid={`badge-reviewed-${article.id}`}>
                            ✓ تمت المراجعة
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
