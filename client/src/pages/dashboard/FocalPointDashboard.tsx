import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Focus, Image, Loader2, CheckCircle, XCircle, Play, AlertTriangle, Eye, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

export default function FocalPointDashboard() {
  const [batchSize, setBatchSize] = useState("20");
  const [concurrency, setConcurrency] = useState("3");
  const [showReview, setShowReview] = useState(false);
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading } = useQuery<FocalPointStats>({
    queryKey: ["/api/admin/focal-points/stats"],
  });

  const { data: reviewArticles, isLoading: reviewLoading } = useQuery<ReviewArticle[]>({
    queryKey: ["/api/admin/focal-points/needs-review"],
    enabled: showReview,
  });

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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <Focus className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold">نقاط التركيز الذكية</h1>
        <Badge variant="secondary">AI Vision</Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        تحليل الصور تلقائياً بالذكاء الاصطناعي لتحديد نقطة التركيز المثالية لقص الصور
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card data-testid="card-stat-published">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المنشورة</CardTitle>
            <Image className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-published">
              {statsLoading ? "..." : totalPublished.toLocaleString("ar-SA")}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-with-images">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">بصور</CardTitle>
            <Image className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-with-images">
              {statsLoading ? "..." : withImages.toLocaleString("ar-SA")}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-with-focal">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">بنقاط تركيز</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-with-focal">
              {statsLoading ? "..." : withFocalPoints.toLocaleString("ar-SA")}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-missing">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">بدون تركيز</CardTitle>
            <XCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600" data-testid="text-missing-focal">
              {statsLoading ? "..." : missingFocalPoints.toLocaleString("ar-SA")}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-needs-review" className={needsReviewCount > 0 ? "border-amber-300 dark:border-amber-700" : ""}>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">تحتاج مراجعة</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600" data-testid="text-needs-review">
              {statsLoading ? "..." : needsReviewCount.toLocaleString("ar-SA")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">نسبة التغطية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={coveragePercent} className="h-3" />
          <p className="text-sm text-muted-foreground">
            {coveragePercent}% من الصور تم تحديد نقاط تركيزها
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">التحليل الدفعي</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            تحليل مجموعة من المقالات باستخدام GPT-4o Vision — الصور ذات الثقة المنخفضة تُعلَّم للمراجعة اليدوية
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">حجم الدفعة:</label>
              <Select value={batchSize} onValueChange={setBatchSize}>
                <SelectTrigger className="w-24" data-testid="trigger-batch-size">
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
                <SelectTrigger className="w-20" data-testid="trigger-concurrency">
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
                <Badge variant="default" data-testid="badge-succeeded">
                  نجح: {batchMutation.data.succeeded}
                </Badge>
                {batchMutation.data.needsReview > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-400" data-testid="badge-needs-review">
                    <AlertTriangle className="h-3 w-3 ml-1" />
                    تحتاج مراجعة: {batchMutation.data.needsReview}
                  </Badge>
                )}
                {batchMutation.data.failed > 0 && (
                  <Badge variant="destructive" data-testid="badge-failed">
                    فشل: {batchMutation.data.failed}
                  </Badge>
                )}
                {batchMutation.data.cachedHits > 0 && (
                  <Badge variant="secondary" data-testid="badge-cached">
                    من الكاش: {batchMutation.data.cachedHits}
                  </Badge>
                )}
              </div>
              {batchMutation.data.results && batchMutation.data.results.length > 0 && (
                <div className="max-h-60 overflow-y-auto border rounded-md">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 text-right">المقال</th>
                        <th className="p-2 text-right">الحالة</th>
                        <th className="p-2 text-right">الإحداثيات</th>
                        <th className="p-2 text-right">الموضوع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchMutation?.data?.results?.map((r) => (
                        <tr key={r.id} className="border-t" data-testid={`row-result-${r.id}`}>
                          <td className="p-2 font-mono text-xs">{r.id.slice(0, 8)}...</td>
                          <td className="p-2">
                            {r.status === "ok" ? (
                              <Badge variant="secondary" className="text-green-600">
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
                          <td className="p-2 font-mono text-xs">
                            {r.x !== undefined ? `${r.x}%, ${r.y}%` : "-"}
                          </td>
                          <td className="p-2 text-xs">{r.subject || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {needsReviewCount > 0 && (
        <Card className="border-amber-300 dark:border-amber-700">
          <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg">مقالات تحتاج مراجعة نقطة التركيز</CardTitle>
              <Badge variant="outline" className="text-amber-600 border-amber-400">
                {needsReviewCount}
              </Badge>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowReview(!showReview)}
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
              ) : reviewArticles && reviewArticles.length > 0 ? (
                <div className="space-y-3">
                  {reviewArticles.map((article) => (
                    <div
                      key={article.id}
                      className="flex items-center gap-3 p-3 border rounded-md flex-wrap"
                      data-testid={`review-article-${article.id}`}
                    >
                      <div className="relative w-16 h-16 rounded-md overflow-hidden flex-shrink-0 bg-muted">
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
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{article.title}</p>
                        <p className="text-xs text-muted-foreground">
                          نقطة التركيز: {article.imageFocalPoint?.x}%, {article.imageFocalPoint?.y}%
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
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
                          data-testid={`button-approve-${article.id}`}
                        >
                          <CheckCircle className="h-3 w-3 ml-1" />
                          موافقة
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد مقالات تحتاج مراجعة</p>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
