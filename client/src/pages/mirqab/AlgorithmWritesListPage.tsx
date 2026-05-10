import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Calendar, Eye, ArrowLeft, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { MirqabEntryWithDetails } from "@shared/schema";

export default function AlgorithmWritesListPage() {
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<string | null>(null);
  const limit = 12;

  const { data, isLoading } = useQuery<{ entries: MirqabEntryWithDetails[]; total: number }>({
    queryKey: ['/api/mirqab/algorithm-writes', { page, limit, type: filterType }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('limit', limit.toString());
      if (filterType) {
        params.append('type', filterType);
      }
      const url = `/api/mirqab/algorithm-writes?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch algorithm articles');
      return await res.json();
    },
  });

  const entries = data?.entries || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const getAnalysisTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      opinion: 'رأي',
      analysis: 'تحليل',
      forecast: 'توقعات',
    };
    return labels[type] || type;
  };

  const getAnalysisTypeVariant = (type: string): "default" | "secondary" | "outline" => {
    if (type === 'opinion') return 'default';
    if (type === 'analysis') return 'secondary';
    return 'outline';
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user || undefined} />
      
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 dark:from-green-900 dark:via-emerald-900 dark:to-teal-900 text-white py-16">
        <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div>
        <div className="relative container mx-auto px-4 max-w-7xl">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/mirqab">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <Brain className="w-10 h-10" data-testid="icon-brain" />
          </div>
          <h1 className="text-4xl font-bold mb-4" data-testid="heading-title">
            الخوارزمي يكتب
          </h1>
          <p className="text-lg text-white/90 max-w-2xl" data-testid="text-description">
            مقالات وتحليلات مكتوبة بواسطة الذكاء الاصطناعي بشفافية كاملة
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-7xl py-12">
        {/* Filter */}
        <div className="mb-8 flex flex-wrap gap-2" data-testid="filter-container">
          <Button
            variant={filterType === null ? "default" : "outline"}
            onClick={() => setFilterType(null)}
            data-testid="filter-all"
          >
            الكل
          </Button>
          <Button
            variant={filterType === 'opinion' ? "default" : "outline"}
            onClick={() => setFilterType('opinion')}
            data-testid="filter-opinion"
          >
            رأي
          </Button>
          <Button
            variant={filterType === 'analysis' ? "default" : "outline"}
            onClick={() => setFilterType('analysis')}
            data-testid="filter-analysis"
          >
            تحليل
          </Button>
          <Button
            variant={filterType === 'forecast' ? "default" : "outline"}
            onClick={() => setFilterType('forecast')}
            data-testid="filter-forecast"
          >
            توقعات
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} data-testid={`skeleton-card-${i}`}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : entries.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {entries.map((entry) => (
                <Link key={entry.id} href={`/mirqab/algorithm-writes/${entry.slug}`}>
                  <Card className="hover-elevate h-full" data-testid={`card-article-${entry.id}`}>
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge 
                            variant={entry.algorithmArticle ? getAnalysisTypeVariant(entry.algorithmArticle.analysisType) : 'secondary'}
                            data-testid={`badge-analysis-type-${entry.id}`}
                          >
                            {entry.algorithmArticle && getAnalysisTypeLabel(entry.algorithmArticle.analysisType)}
                          </Badge>
                          {entry.algorithmArticle?.humanReviewed && (
                            <Badge variant="outline" className="gap-1" data-testid={`badge-reviewed-${entry.id}`}>
                              <CheckCircle2 className="w-3 h-3" />
                              مراجع
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Eye className="w-4 h-4" />
                          <span data-testid={`text-views-${entry.id}`}>{entry.views || 0}</span>
                        </div>
                      </div>
                      <CardTitle className="line-clamp-2 mb-3" data-testid={`text-title-${entry.id}`}>
                        {entry.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span data-testid={`text-date-${entry.id}`}>
                          {entry.publishedAt && format(new Date(entry.publishedAt), 'dd MMMM yyyy', { locale: ar })}
                        </span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {entry.algorithmArticle && (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Brain className="w-4 h-4" />
                              <span>محتوى AI</span>
                            </div>
                            <span className="font-semibold" data-testid={`text-ai-percentage-${entry.id}`}>
                              {entry.algorithmArticle.aiPercentage}%
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-model-${entry.id}`}>
                            {entry.algorithmArticle.aiModel}
                          </Badge>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8" data-testid="pagination-container">
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  السابق
                </Button>
                <div className="flex items-center gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      onClick={() => setPage(p)}
                      data-testid={`button-page-${p}`}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  التالي
                </Button>
              </div>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="py-16 text-center">
              <Brain className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2" data-testid="heading-empty">
                لا توجد مقالات متاحة
              </h3>
              <p className="text-muted-foreground" data-testid="text-empty-description">
                لم يتم نشر أي مقالات حتى الآن
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
