import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SubmitRevisionButton } from "@/components/SubmitRevisionButton";
import { contributorArticleStatusLabel } from "@/lib/contributorArticleStatus";
import {
  markArticleSubmittedInAnalyticsCache,
  refetchContributorAnalytics,
} from "@/lib/contributorAnalyticsCache";
import {
  FileText,
  Edit,
  Eye,
  ThumbsUp,
  MessageCircle,
  PlusCircle,
  AlertCircle,
} from "lucide-react";

interface ReporterAnalytics {
  totalArticles: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  articles: Array<{
    id: string;
    title: string;
    status: string;
    reviewStatus?: string | null;
    reviewNotes?: string | null;
    reviewedAt?: string | null;
    updatedAt?: string | null;
    views: number;
    publishedAt: string | null;
    createdAt: string;
  }>;
}

export default function ReporterMyArticlesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: analytics, isLoading } = useQuery<ReporterAnalytics>({
    queryKey: ["/api/reporter/analytics"],
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const submitReviewMutation = useMutation({
    mutationFn: async (articleId: string) => {
      return apiRequest(`/api/my/articles/${articleId}/submit-review`, { method: "POST" });
    },
    onSuccess: (data, articleId) => {
      markArticleSubmittedInAnalyticsCache(queryClient, {
        id: articleId,
        reviewStatus: data?.reviewStatus,
        status: data?.status,
        updatedAt: data?.updatedAt,
      });
      void refetchContributorAnalytics(queryClient);
      toast({
        title: "تم الإرسال",
        description: "عاد الخبر إلى مسودات فريق التحرير للمراجعة",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إرسال الخبر",
        variant: "destructive",
      });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">أخباري</h1>
            <p className="text-muted-foreground text-sm mt-1">
              تتبّع أخبارك وملاحظات فريق التحرير
            </p>
          </div>
          <Button onClick={() => navigate("/dashboard/articles/new")} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            خبر جديد
          </Button>
        </div>

        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">إجمالي الأخبار</p>
                    <p className="text-2xl font-bold">{analytics?.totalArticles ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <Eye className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">المشاهدات</p>
                    <p className="text-2xl font-bold">{analytics?.totalViews?.toLocaleString("en-US") ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <ThumbsUp className="h-5 w-5 text-pink-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">الإعجابات</p>
                    <p className="text-2xl font-bold">{analytics?.totalLikes ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <MessageCircle className="h-5 w-5 text-cyan-500" />
                  <div>
                    <p className="text-sm text-muted-foreground">التعليقات</p>
                    <p className="text-2xl font-bold">{analytics?.totalComments ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-right py-3 px-4 font-medium">العنوان</th>
                    <th className="text-right py-3 px-4 font-medium">الحالة</th>
                    <th className="text-right py-3 px-4 font-medium min-w-[200px]">ملاحظات التحرير</th>
                    <th className="text-center py-3 px-4 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.articles ?? []).map((article) => (
                    <tr key={article.id} className="border-t hover:bg-muted/30">
                      <td className="py-3 px-4 font-medium line-clamp-1">{article.title}</td>
                      <td className="py-3 px-4">
                        <Badge variant={contributorArticleStatusLabel(article).variant}>
                          {contributorArticleStatusLabel(article).label}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        {article.reviewStatus === "needs_changes" && article.reviewNotes ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs leading-relaxed max-w-md">
                            <span className="font-medium flex items-center gap-1 mb-1">
                              <AlertCircle className="h-3.5 w-3.5" />
                              ملاحظات التحرير
                            </span>
                            {article.reviewNotes}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex justify-center gap-1">
                          {(article.status === "draft" || article.reviewStatus === "needs_changes") &&
                            article.reviewStatus !== "pending_review" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/dashboard/articles/${article.id}/edit`)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {article.reviewStatus === "needs_changes" && (
                            <SubmitRevisionButton
                              article={article}
                              isPending={submitReviewMutation.isPending}
                              onSubmit={(aid) => submitReviewMutation.mutate(aid)}
                              className="gap-1 h-8"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(analytics?.articles?.length) && (
                <p className="text-center py-12 text-muted-foreground">لا توجد أخبار بعد</p>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
