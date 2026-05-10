import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Telescope, TrendingUp, Radar, Brain, ArrowLeft, Calendar, Eye } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { MirqabEntryWithDetails } from "@shared/schema";

export default function MirqabPage() {
  const { user } = useAuth();

  const { data: sabqIndexesRaw, isLoading: loadingSabq } = useQuery<MirqabEntryWithDetails[]>({
    queryKey: ['/api/mirqab/sabq-index'],
    queryFn: async () => {
      const res = await fetch('/api/mirqab/sabq-index?limit=3', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
  });
  const sabqIndexes = Array.isArray(sabqIndexesRaw) ? sabqIndexesRaw : [];

  const { data: nextStoriesRaw, isLoading: loadingStories } = useQuery<MirqabEntryWithDetails[]>({
    queryKey: ['/api/mirqab/next-stories'],
    queryFn: async () => {
      const res = await fetch('/api/mirqab/next-stories?limit=3', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
  });
  const nextStories = Array.isArray(nextStoriesRaw) ? nextStoriesRaw : [];

  const { data: radarReportsRaw, isLoading: loadingRadar } = useQuery<MirqabEntryWithDetails[]>({
    queryKey: ['/api/mirqab/radar'],
    queryFn: async () => {
      const res = await fetch('/api/mirqab/radar?limit=3', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
  });
  const radarReports = Array.isArray(radarReportsRaw) ? radarReportsRaw : [];

  const { data: algorithmArticlesRaw, isLoading: loadingAlgorithm } = useQuery<MirqabEntryWithDetails[]>({
    queryKey: ['/api/mirqab/algorithm-writes'],
    queryFn: async () => {
      const res = await fetch('/api/mirqab/algorithm-writes?limit=3', { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    },
  });
  const algorithmArticles = Array.isArray(algorithmArticlesRaw) ? algorithmArticlesRaw : [];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user} />
      
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 dark:from-indigo-900 dark:via-purple-900 dark:to-pink-900 text-white py-20">
        <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div>
        <div className="relative container mx-auto px-4 max-w-7xl">
          <div className="flex items-center gap-4 mb-6 justify-center">
            <Telescope className="w-16 h-16" data-testid="icon-telescope" />
          </div>
          <h1 className="text-5xl font-bold text-center mb-6" data-testid="heading-mirqab-title">
            المرقاب
          </h1>
          <p className="text-xl text-center text-white/90 max-w-3xl mx-auto leading-relaxed" data-testid="text-mirqab-description">
            زاوية استشراف المستقبل باستخدام الذكاء الاصطناعي. نحلل البيانات ونتوقع الأحداث ونرصد التغيرات قبل حدوثها.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-7xl py-12 space-y-16">
        {/* SABQ Index Section */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-md bg-gradient-to-br from-blue-500 to-cyan-500 dark:from-blue-600 dark:to-cyan-600">
                <TrendingUp className="w-8 h-8 text-white" data-testid="icon-trending-up" />
              </div>
              <div>
                <h2 className="text-3xl font-bold" data-testid="heading-sabq-index">
                  مؤشر سبق
                </h2>
                <p className="text-muted-foreground" data-testid="text-sabq-description">
                  مؤشرات اقتصادية وسياسية واجتماعية
                </p>
              </div>
            </div>
            <Link href="/mirqab/sabq-index">
              <Button variant="outline" data-testid="button-view-all-sabq">
                عرض الكل
                <ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {loadingSabq ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
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
          ) : sabqIndexes && sabqIndexes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sabqIndexes.map((index: any) => (
                <Link key={index.id} href={`/mirqab/sabq-index/${index.id}`}>
                  <Card className="hover-elevate h-full" data-testid={`card-sabq-${index.id}`}>
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
                      <CardTitle className="line-clamp-2" data-testid={`text-title-${index.id}`}>
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
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                لا توجد مؤشرات متاحة حالياً
              </CardContent>
            </Card>
          )}
        </section>

        {/* Next Stories Section */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-md bg-gradient-to-br from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600">
                <Telescope className="w-8 h-8 text-white" data-testid="icon-telescope-stories" />
              </div>
              <div>
                <h2 className="text-3xl font-bold" data-testid="heading-next-stories">
                  قصة قادمة
                </h2>
                <p className="text-muted-foreground" data-testid="text-stories-description">
                  توقعات الأحداث المستقبلية
                </p>
              </div>
            </div>
            <Link href="/mirqab/next-stories">
              <Button variant="outline" data-testid="button-view-all-stories">
                عرض الكل
                <ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {loadingStories ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
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
          ) : nextStories && nextStories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {nextStories.map((story: any) => (
                <Link key={story.id} href={`/mirqab/next-stories/${story.id}`}>
                  <Card className="hover-elevate h-full" data-testid={`card-story-${story.id}`}>
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
                      <CardTitle className="line-clamp-2" data-testid={`text-title-${story.id}`}>
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
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                لا توجد قصص متاحة حالياً
              </CardContent>
            </Card>
          )}
        </section>

        {/* Radar Section */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-md bg-gradient-to-br from-green-500 to-emerald-500 dark:from-green-600 dark:to-emerald-600">
                <Radar className="w-8 h-8 text-white" data-testid="icon-radar" />
              </div>
              <div>
                <h2 className="text-3xl font-bold" data-testid="heading-radar">
                  الرادار
                </h2>
                <p className="text-muted-foreground" data-testid="text-radar-description">
                  تقارير يومية عن التحركات والتغيرات
                </p>
              </div>
            </div>
            <Link href="/mirqab/radar">
              <Button variant="outline" data-testid="button-view-all-radar">
                عرض الكل
                <ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {loadingRadar ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
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
          ) : radarReports && radarReports.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {radarReports.map((report: any) => (
                <Link key={report.id} href={`/mirqab/radar/${report.id}`}>
                  <Card className="hover-elevate h-full" data-testid={`card-radar-${report.id}`}>
                    <CardHeader>
                      <CardTitle className="line-clamp-2" data-testid={`text-title-${report.id}`}>
                        {report.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span data-testid={`text-date-${report.id}`}>
                          {format(new Date(report.reportDate), 'dd MMMM yyyy', { locale: ar })}
                        </span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3" data-testid={`text-summary-${report.id}`}>
                        {report.summary}
                      </p>
                      {report.alerts && (
                        <div className="mt-4">
                          <Badge variant="secondary" data-testid={`badge-alerts-${report.id}`}>
                            {report.alerts.length} تنبيه
                          </Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                لا توجد تقارير متاحة حالياً
              </CardContent>
            </Card>
          )}
        </section>

        {/* Algorithm Articles Section */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-md bg-gradient-to-br from-orange-500 to-red-500 dark:from-orange-600 dark:to-red-600">
                <Brain className="w-8 h-8 text-white" data-testid="icon-brain" />
              </div>
              <div>
                <h2 className="text-3xl font-bold" data-testid="heading-algorithm">
                  الخوارزمي يكتب
                </h2>
                <p className="text-muted-foreground" data-testid="text-algorithm-description">
                  تحليلات وآراء مدعومة بالذكاء الاصطناعي
                </p>
              </div>
            </div>
            <Link href="/mirqab/algorithm-writes">
              <Button variant="outline" data-testid="button-view-all-algorithm">
                عرض الكل
                <ArrowLeft className="mr-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          {loadingAlgorithm ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
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
          ) : algorithmArticles && algorithmArticles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {algorithmArticles.map((article: any) => (
                <Link key={article.id} href={`/mirqab/algorithm-writes/${article.id}`}>
                  <Card className="hover-elevate h-full" data-testid={`card-algorithm-${article.id}`}>
                    <CardHeader>
                      <div className="flex gap-2 mb-2 flex-wrap">
                        <Badge variant="secondary" data-testid={`badge-type-${article.id}`}>
                          {article.analysisType === 'opinion' ? 'رأي' :
                           article.analysisType === 'analysis' ? 'تحليل' : 'توقع'}
                        </Badge>
                        {article.aiPercentage && (
                          <Badge variant="outline" data-testid={`badge-ai-${article.id}`}>
                            AI {article.aiPercentage}%
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="line-clamp-2" data-testid={`text-title-${article.id}`}>
                        {article.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span data-testid={`text-date-${article.id}`}>
                          {format(new Date(article.createdAt), 'dd MMMM yyyy', { locale: ar })}
                        </span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {article.humanReviewed && (
                        <Badge variant="default" className="mt-2" data-testid={`badge-reviewed-${article.id}`}>
                          ✓ تمت المراجعة
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                لا توجد مقالات متاحة حالياً
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
