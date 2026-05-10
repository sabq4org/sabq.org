import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radar, Calendar, Eye, ArrowLeft, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { MirqabEntryWithDetails } from "@shared/schema";

export default function RadarListPage() {
  const { user } = useAuth();

  const [page, setPage] = useState(1);
  const limit = 12;

  const { data, isLoading } = useQuery<{ entries: MirqabEntryWithDetails[]; total: number }>({
    queryKey: ['/api/mirqab/radar', { page, limit }],
  });

  const entries = data?.entries || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user || undefined} />
      
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-600 dark:from-cyan-900 dark:via-blue-900 dark:to-indigo-900 text-white py-16">
        <div className="absolute inset-0 bg-black/20 dark:bg-black/40"></div>
        <div className="relative container mx-auto px-4 max-w-7xl">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/mirqab">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" data-testid="button-back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <Radar className="w-10 h-10" data-testid="icon-radar" />
          </div>
          <h1 className="text-4xl font-bold mb-4" data-testid="heading-title">
            الرادار
          </h1>
          <p className="text-lg text-white/90 max-w-2xl" data-testid="text-description">
            تقارير يومية بأهم التنبيهات والإشارات من مختلف القطاعات
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-7xl py-12">
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
                <Link key={entry.id} href={`/mirqab/radar/${entry.slug}`}>
                  <Card className="hover-elevate h-full" data-testid={`card-radar-${entry.id}`}>
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="default" data-testid={`badge-alerts-${entry.id}`}>
                          <AlertCircle className="w-3 h-3 ml-1" />
                          {entry.radarAlert?.alerts?.length || 0} تنبيهات
                        </Badge>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Eye className="w-4 h-4" />
                          <span data-testid={`text-views-${entry.id}`}>{entry.views || 0}</span>
                        </div>
                      </div>
                      <CardTitle className="line-clamp-1 mb-2" data-testid={`text-title-${entry.id}`}>
                        {entry.title}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mb-3">
                        <Calendar className="w-4 h-4" />
                        <span data-testid={`text-date-${entry.id}`}>
                          {entry.radarAlert?.reportDate && format(new Date(entry.radarAlert.reportDate), 'dd MMMM yyyy', { locale: ar })}
                        </span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3" data-testid={`text-summary-${entry.id}`}>
                        {entry.radarAlert?.summary.slice(0, 100)}...
                      </p>
                      {entry.radarAlert?.alerts && entry.radarAlert.alerts.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium text-foreground line-clamp-1" data-testid={`text-top-alert-${entry.id}`}>
                            🔴 {entry.radarAlert.alerts[0].title}
                          </p>
                        </div>
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
              <Radar className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2" data-testid="heading-empty">
                لا توجد تقارير متاحة
              </h3>
              <p className="text-muted-foreground" data-testid="text-empty-description">
                لم يتم نشر أي تقارير رادار حتى الآن
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
