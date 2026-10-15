import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Focus,
  Image,
  Loader2,
  CheckCircle,
  XCircle,
  Play,
  AlertTriangle,
  Eye,
  ExternalLink,
  RefreshCw,
  Search,
  Filter,
  X,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

interface FocalPointStats {
  total_published: string;
  with_images: string;
  with_focal_points: string;
  missing_focal_points: string;
  needs_review: string;
}

interface BatchResult {
  id: string;
  status: string;
  x?: number;
  y?: number;
  subject?: string;
}

interface BatchResponse {
  processed: number;
  succeeded: number;
  failed: number;
  needsReview: number;
  cachedHits: number;
  results: BatchResult[];
  message?: string;
}

interface ReviewArticle {
  id: string;
  title: string;
  imageUrl: string;
  imageFocalPoint: { x: number; y: number; needsReview?: boolean; confidence?: string };
  publishedAt: string;
}

const batchStatusFilterOptions = [
  { value: "all", label: "كل النتائج" },
  { value: "ok", label: "ناجحة" },
  { value: "needs_review", label: "تحتاج مراجعة" },
  { value: "failed", label: "فاشلة" },
];

export default function FocalPointDashboard() {
  const [batchSize, setBatchSize] = useState("20");
  const [concurrency, setConcurrency] = useState("3");
  const [showReview, setShowReview] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();

  const {
    data: stats,
    isLoading: statsLoading,
    isFetching: statsFetching,
    refetch: refetchStats,
  } = useQuery<FocalPointStats>({
    queryKey: ["/api/admin/focal-points/stats"],
  });

  const {
    data: reviewArticlesRaw,
    isLoading: reviewLoading,
    isFetching: reviewFetching,
    refetch: refetchReview,
  } = useQuery<ReviewArticle[]>({
    queryKey: ["/api/admin/focal-points/needs-review"],
    enabled: showReview,
  });

  const reviewArticles = Array.isArray(reviewArticlesRaw) ? reviewArticlesRaw : [];

  const batchMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<BatchResponse>("/api/admin/focal-points/batch", {
        method: "POST",
        body: JSON.stringify({
          batchSize: Number(batchSize),
          concurrency: Number(concurrency),
        }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/focal-points/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/focal-points/needs-review"] });
      toast({
        title: "اكتمل التحليل",
        description: `تم تحليل ${data.succeeded} صورة بنجاح${data.needsReview > 0 ? ` (${data.needsReview} تحتاج مراجعة)` : ""}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل التحليل الدفعي",
        variant: "destructive",
      });
    },
  });

  const markReviewedMutation = useMutation({
    mutationFn: async (articleId: string) => {
      return await apiRequest(`/api/admin/focal-points/mark-reviewed/${articleId}`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/focal-points/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/focal-points/needs-review"] });
    },
  });

  const totalPublished = Number(stats?.total_published || 0);
  const withImages = Number(stats?.with_images || 0);
  const withFocalPoints = Number(stats?.with_focal_points || 0);
  const missingFocalPoints = Number(stats?.missing_focal_points || 0);
  const needsReviewCount = Number(stats?.needs_review || 0);
  const coveragePercent = withImages > 0 ? Math.round((withFocalPoints / withImages) * 100) : 0;

  const batchResults = useMemo(() => {
    return Array.isArray(batchMutation.data?.results) ? batchMutation.data.results : [];
  }, [batchMutation.data?.results]);

  const filteredBatchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return batchResults.filter((r) => {
      if (statusFilter !== "all") {
        if (statusFilter === "failed" && (r.status === "ok" || r.status === "needs_review")) {
          return false;
        }
        if (statusFilter !== "failed" && r.status !== statusFilter) {
          return false;
        }
      }
      if (!q) return true;
      return (
        r.id.toLowerCase().includes(q) ||
        (r.subject && r.subject.toLowerCase().includes(q))
      );
    });
  }, [batchResults, searchQuery, statusFilter]);

  const filteredReviewArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return reviewArticles;
    return reviewArticles.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) ||
        a.id?.toLowerCase().includes(q),
    );
  }, [reviewArticles, searchQuery]);

  const handleRefreshAll = () => {
    void refetchStats();
    if (showReview) {
      void refetchReview();
    }
  };

  const isRefreshing = statsFetching || reviewFetching;

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
        <DashboardPageHeader
          icon={Focus}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span>نقاط التركيز الذكية</span>
              <Badge variant="secondary" className="rounded-lg px-2 py-0.5 text-xs font-medium">
                AI Vision
              </Badge>
            </span>
          }
          description="تحليل الصور تلقائياً بالذكاء الاصطناعي لتحديد نقطة التركيز المثالية لقص الصور"
          titleTestId="text-focal-points-title"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {needsReviewCount > 0 && (
                <Button
                  type="button"
                  variant={showReview ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowReview(!showReview)}
                  className="h-9 gap-1.5 rounded-xl text-xs font-medium"
                  data-testid="button-header-toggle-review"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>{showReview ? "إخفاء المراجعة" : `مراجعة (${formatNumber(needsReviewCount)})`}</span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefreshAll}
                disabled={isRefreshing}
                className="h-9 gap-1.5 rounded-xl border-border/80 text-xs font-medium"
                data-testid="button-refresh-focal-points"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                <span>تحديث</span>
              </Button>
            </div>
          }
        />

        {/* 4-Card KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="focal-kpi-strip">
          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-stat-with-images">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-medium text-muted-foreground">مقالات بصور</span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Image className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums text-foreground" data-testid="text-with-images">
                {statsLoading ? "..." : formatNumber(withImages)}
              </div>
              <div
                className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"
                data-testid="card-stat-published"
              >
                <span>من إجمالي المنشورة:</span>
                <span className="font-semibold tabular-nums text-foreground" data-testid="text-total-published">
                  {statsLoading ? "..." : formatNumber(totalPublished)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-stat-with-focal">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-medium text-muted-foreground">بنقاط تركيز</span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-4 w-4" />
                </span>
              </div>
              <div
                className="mt-2 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400"
                data-testid="text-with-focal"
              >
                {statsLoading ? "..." : formatNumber(withFocalPoints)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                نسبة التغطية: {coveragePercent}%
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-stat-missing">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-medium text-muted-foreground">بدون تركيز</span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <XCircle className="h-4 w-4" />
                </span>
              </div>
              <div
                className="mt-2 text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400"
                data-testid="text-missing-focal"
              >
                {statsLoading ? "..." : formatNumber(missingFocalPoints)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                بانتظار التحليل الدفعي
              </p>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "rounded-xl border-border/60 bg-card shadow-none",
              needsReviewCount > 0 && "border-amber-400/60 dark:border-amber-500/40",
            )}
            data-testid="card-stat-needs-review"
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs sm:text-sm font-medium text-muted-foreground">تحتاج مراجعة</span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              </div>
              <div
                className="mt-2 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400"
                data-testid="text-needs-review"
              >
                {statsLoading ? "..." : formatNumber(needsReviewCount)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                صور منخفضة الثقة للمراجعة اليدوية
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Coverage Bar Card */}
        <Card className="rounded-xl border-border/60 bg-card shadow-none">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-bold">نسبة التغطية</CardTitle>
              <Badge variant="outline" className="rounded-lg text-xs font-semibold tabular-nums">
                {coveragePercent}%
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={coveragePercent} className="h-3" />
            <p className="text-sm text-muted-foreground tabular-nums">
              {coveragePercent}% من الصور ({formatNumber(withFocalPoints)} من أصل {formatNumber(withImages)}) تم تحديد نقاط تركيزها
            </p>
          </CardContent>
        </Card>

        {/* Search & Quick Filter Toolbar */}
        <Card className="rounded-xl border-border/60 bg-card shadow-none">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                البحث والتصفية السريعة
              </CardTitle>
              {(searchQuery || statusFilter !== "all") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                  }}
                  className="h-7 rounded-lg text-xs text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-focal-filters"
                >
                  <X className="h-3.5 w-3.5 ml-1" />
                  مسح الفلاتر
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث في نتائج الدفعة أو قائمة المراجعة بالعنوان أو المعرّف أو الموضوع..."
                  className="pr-10 rounded-xl border-border/60 bg-background"
                  data-testid="input-focal-search"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="مسح البحث"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-44 rounded-xl border-border/60 bg-card" data-testid="select-batch-status-filter">
                  <SelectValue placeholder="حالة النتائج" />
                </SelectTrigger>
                <SelectContent>
                  {batchStatusFilterOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground ml-1">تصفية نتائج الدفعة:</span>
              {batchStatusFilterOptions.map((opt) => {
                const active = statusFilter === opt.value;
                return (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    onClick={() => setStatusFilter(opt.value)}
                    className={cn(
                      "h-7 rounded-xl px-2.5 text-xs font-medium",
                      !active && "border-border/60 bg-card text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`pill-batch-status-${opt.value}`}
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Batch Analysis Card */}
        <Card className="rounded-xl border-border/60 bg-card shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">التحليل الدفعي</CardTitle>
            <CardDescription>
              تحليل مجموعة من المقالات باستخدام GPT-4o Vision — الصور ذات الثقة المنخفضة تُعلَّم للمراجعة اليدوية
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">حجم الدفعة:</label>
                <Select value={batchSize} onValueChange={setBatchSize}>
                  <SelectTrigger className="w-24 rounded-xl border-border/60 bg-card" data-testid="trigger-batch-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">التزامن:</label>
                <Select value={concurrency} onValueChange={setConcurrency}>
                  <SelectTrigger className="w-20 rounded-xl border-border/60 bg-card" data-testid="trigger-concurrency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => batchMutation.mutate()}
                disabled={batchMutation.isPending || missingFocalPoints === 0}
                className="rounded-xl"
                data-testid="button-start-batch"
              >
                {batchMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    جاري التحليل...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 ml-2" />
                    بدء التحليل
                  </>
                )}
              </Button>
            </div>

            {batchMutation.data && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="default" className="rounded-lg tabular-nums" data-testid="badge-succeeded">
                    نجح: {batchMutation.data.succeeded}
                  </Badge>
                  {batchMutation.data.needsReview > 0 && (
                    <Badge variant="outline" className="rounded-lg text-amber-600 border-amber-400 tabular-nums" data-testid="badge-needs-review">
                      <AlertTriangle className="h-3 w-3 ml-1" />
                      تحتاج مراجعة: {batchMutation.data.needsReview}
                    </Badge>
                  )}
                  {batchMutation.data.failed > 0 && (
                    <Badge variant="destructive" className="rounded-lg tabular-nums" data-testid="badge-failed">
                      فشل: {batchMutation.data.failed}
                    </Badge>
                  )}
                  {batchMutation.data.cachedHits > 0 && (
                    <Badge variant="secondary" className="rounded-lg tabular-nums" data-testid="badge-cached">
                      من الكاش: {batchMutation.data.cachedHits}
                    </Badge>
                  )}
                </div>

                {batchResults.length > 0 && (
                  <>
                    {filteredBatchResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        لا توجد نتائج مطابقة لفلتر البحث الحالي
                      </p>
                    ) : (
                      <>
                        {/* Desktop Table View */}
                        <div className="hidden md:block max-h-72 overflow-y-auto border border-border/60 rounded-xl">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 sticky top-0 border-b border-border/60">
                              <tr>
                                <th className="p-2.5 text-right font-semibold">المقال</th>
                                <th className="p-2.5 text-right font-semibold">الحالة</th>
                                <th className="p-2.5 text-right font-semibold">الإحداثيات</th>
                                <th className="p-2.5 text-right font-semibold">الموضوع</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                              {filteredBatchResults.map((r) => (
                                <tr key={r.id} className="hover:bg-muted/30" data-testid={`row-result-${r.id}`}>
                                  <td className="p-2.5 font-mono text-xs">{r.id.slice(0, 8)}...</td>
                                  <td className="p-2.5">
                                    {r.status === "ok" ? (
                                      <Badge variant="secondary" className="text-emerald-600">
                                        <CheckCircle className="h-3 w-3 ml-1" /> نجح
                                      </Badge>
                                    ) : r.status === "needs_review" ? (
                                      <Badge variant="outline" className="text-amber-600 border-amber-400">
                                        <AlertTriangle className="h-3 w-3 ml-1" /> مراجعة
                                      </Badge>
                                    ) : (
                                      <Badge variant="destructive">
                                        <XCircle className="h-3 w-3 ml-1" /> فشل
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="p-2.5 font-mono text-xs tabular-nums">
                                    {r.x !== undefined ? `${r.x}%, ${r.y}%` : "-"}
                                  </td>
                                  <td className="p-2.5 text-xs">{r.subject || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile Stacked Cards View */}
                        <div className="space-y-2.5 md:hidden max-h-80 overflow-y-auto">
                          {filteredBatchResults.map((r) => (
                            <div
                              key={r.id}
                              className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-2"
                              data-testid={`row-result-${r.id}-mobile`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs text-muted-foreground">
                                  #{r.id.slice(0, 8)}...
                                </span>
                                {r.status === "ok" ? (
                                  <Badge variant="secondary" className="text-emerald-600 text-xs">
                                    <CheckCircle className="h-3 w-3 ml-1" /> نجح
                                  </Badge>
                                ) : r.status === "needs_review" ? (
                                  <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">
                                    <AlertTriangle className="h-3 w-3 ml-1" /> مراجعة
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs">
                                    <XCircle className="h-3 w-3 ml-1" /> فشل
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">
                                  الإحداثيات:{" "}
                                  <span className="font-mono tabular-nums text-foreground">
                                    {r.x !== undefined ? `${r.x}%, ${r.y}%` : "-"}
                                  </span>
                                </span>
                                <span className="text-muted-foreground truncate max-w-[180px]">
                                  {r.subject || "-"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {needsReviewCount > 0 && (
          <Card className="rounded-xl border-amber-300 dark:border-border bg-card shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <CardTitle className="text-lg">مقالات تحتاج مراجعة نقطة التركيز</CardTitle>
                <Badge variant="outline" className="rounded-lg text-amber-600 border-amber-400 tabular-nums">
                  {formatNumber(needsReviewCount)}
                </Badge>
              </div>
              <Button
                variant="outline"
                onClick={() => setShowReview(!showReview)}
                className="rounded-xl"
                data-testid="button-toggle-review"
              >
                <Eye className="h-4 w-4 ml-2" />
                {showReview ? "إخفاء" : "عرض القائمة"}
              </Button>
            </CardHeader>
            {showReview && (
              <CardContent>
                {reviewLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredReviewArticles.length > 0 ? (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block rounded-xl border border-border/60 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b border-border/60 text-xs text-muted-foreground">
                          <tr>
                            <th className="py-3 px-4 text-right font-semibold">معاينة التركيز</th>
                            <th className="py-3 px-4 text-right font-semibold">عنوان المقال</th>
                            <th className="py-3 px-4 text-center font-semibold">نقطة التركيز</th>
                            <th className="py-3 px-4 text-left font-semibold">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {filteredReviewArticles.map((article) => (
                            <tr
                              key={article.id}
                              className="hover:bg-muted/30"
                              data-testid={`review-article-${article.id}`}
                            >
                              <td className="py-3 px-4 w-24">
                                <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted">
                                  {article.imageUrl && (
                                    <img
                                      src={article.imageUrl}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      style={{
                                        objectPosition: `${article.imageFocalPoint?.x || 50}% ${article.imageFocalPoint?.y || 50}%`,
                                      }}
                                    />
                                  )}
                                  <div
                                    className="absolute w-2.5 h-2.5 bg-amber-400 border-2 border-white rounded-full"
                                    style={{
                                      left: `${article.imageFocalPoint?.x || 50}%`,
                                      top: `${article.imageFocalPoint?.y || 50}%`,
                                      transform: "translate(-50%, -50%)",
                                    }}
                                  />
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <p className="text-sm font-medium line-clamp-2">{article.title}</p>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <Badge variant="outline" className="font-mono text-xs tabular-nums">
                                  {article.imageFocalPoint?.x ?? 50}%, {article.imageFocalPoint?.y ?? 50}%
                                </Badge>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    asChild
                                    className="rounded-xl"
                                    data-testid={`button-edit-${article.id}`}
                                  >
                                    <a href={`/dashboard/articles/${article.id}/edit`} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-3 w-3 ml-1" />
                                      تعديل
                                    </a>
                                  </Button>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => markReviewedMutation.mutate(article.id)}
                                    disabled={markReviewedMutation.isPending}
                                    className="rounded-xl"
                                    data-testid={`button-approve-${article.id}`}
                                  >
                                    <CheckCircle className="h-3 w-3 ml-1" />
                                    موافقة
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Stacked Cards View */}
                    <div className="space-y-3 md:hidden">
                      {filteredReviewArticles.map((article) => (
                        <div
                          key={article.id}
                          className="rounded-xl border border-border/60 bg-card p-3.5 space-y-3"
                          data-testid={`review-article-${article.id}-mobile`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                              {article.imageUrl && (
                                <img
                                  src={article.imageUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  style={{
                                    objectPosition: `${article.imageFocalPoint?.x || 50}% ${article.imageFocalPoint?.y || 50}%`,
                                  }}
                                />
                              )}
                              <div
                                className="absolute w-2.5 h-2.5 bg-amber-400 border-2 border-white rounded-full"
                                style={{
                                  left: `${article.imageFocalPoint?.x || 50}%`,
                                  top: `${article.imageFocalPoint?.y || 50}%`,
                                  transform: "translate(-50%, -50%)",
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <p className="text-sm font-medium line-clamp-2">{article.title}</p>
                              <p className="text-xs text-muted-foreground tabular-nums">
                                نقطة التركيز: {article.imageFocalPoint?.x ?? 50}%, {article.imageFocalPoint?.y ?? 50}%
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="flex-1 rounded-xl"
                              data-testid={`button-edit-${article.id}-mobile`}
                            >
                              <a href={`/dashboard/articles/${article.id}/edit`} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3 ml-1" />
                                تعديل
                              </a>
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => markReviewedMutation.mutate(article.id)}
                              disabled={markReviewedMutation.isPending}
                              className="flex-1 rounded-xl"
                              data-testid={`button-approve-${article.id}-mobile`}
                            >
                              <CheckCircle className="h-3 w-3 ml-1" />
                              موافقة
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {searchQuery ? "لا توجد مقالات مطابقة للبحث" : "لا توجد مقالات تحتاج مراجعة"}
                  </p>
                )}
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
