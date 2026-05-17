import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Edit,
  Eye,
  ThumbsUp,
  MessageCircle,
  PlusCircle,
  FileEdit,
  MessageSquare,
  Send,
  AlertCircle,
} from "lucide-react";

interface OpinionAuthorAnalytics {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  pendingArticles: number;
  rejectedArticles: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  articles: Array<{
    id: string;
    title: string;
    status: string;
    reviewStatus?: string | null;
    reviewNotes?: string | null;
    views: number;
    publishedAt: string | null;
    createdAt: string;
  }>;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  published: { label: "منشور", variant: "default" },
  draft: { label: "مسودة", variant: "secondary" },
  pending: { label: "قيد المراجعة", variant: "outline" },
  rejected: { label: "مرفوض", variant: "destructive" },
  archived: { label: "مؤرشف", variant: "destructive" },
};

function articleStatusLabel(article: { status: string; reviewStatus?: string | null }) {
  if (article.reviewStatus === "needs_changes") return { label: "يحتاج تعديل", variant: "outline" as const };
  if (article.reviewStatus === "pending_review") return { label: "قيد المراجعة", variant: "outline" as const };
  return statusConfig[article.status] || { label: article.status, variant: "secondary" as const };
}

export default function OpinionAuthorDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: analytics, isLoading } = useQuery<OpinionAuthorAnalytics>({
    queryKey: ["/api/opinion-author/analytics"],
  });

  const { data: ticketsUnread } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/opinion-tickets/unread-count"],
    refetchInterval: 60_000,
  });
  const unreadTickets = ticketsUnread?.unreadCount ?? 0;

  const handleEditArticle = (articleId: string) => {
    navigate(`/dashboard/articles/${articleId}/edit`);
  };

  const handleNewArticle = () => {
    navigate("/dashboard/articles/new");
  };

  const submitReviewMutation = useMutation({
    mutationFn: async (articleId: string) => {
      return apiRequest(`/api/my/articles/${articleId}/submit-review`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/analytics"] });
      toast({
        title: "تم الإرسال",
        description: "عاد المقال إلى مسودات فريق التحرير للمراجعة",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إرسال المقال",
        variant: "destructive",
      });
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 p-4 md:p-6" dir="rtl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              لوحة كاتب الرأي
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              مرحباً بك في لوحة التحكم الخاصة بك
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/dashboard/opinion-author/tickets")}
              data-testid="button-my-tickets"
              className="gap-2 relative bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-500/10 dark:hover:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-100"
            >
              <MessageSquare className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              استفساراتي
              {unreadTickets > 0 && (
                <>
                  <Badge className="ms-1 bg-amber-500 hover:bg-amber-500 text-white text-[10px] px-1.5 h-5 min-w-[20px] justify-center">
                    {unreadTickets}
                  </Badge>
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -end-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-background animate-pulse"
                  />
                </>
              )}
            </Button>
            <Button
              onClick={handleNewArticle}
              data-testid="button-new-article"
              className="gap-2"
            >
              <PlusCircle className="h-4 w-4" />
              مقال جديد
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card data-testid="card-total-articles">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">إجمالي المقالات</p>
                      <p className="text-2xl font-bold">{analytics?.totalArticles || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-published-articles">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">منشور</p>
                      <p className="text-2xl font-bold">{analytics?.publishedArticles || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-draft-articles">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-yellow-500/10">
                      <FileEdit className="h-5 w-5 text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">مسودة</p>
                      <p className="text-2xl font-bold">{analytics?.draftArticles || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-pending-articles">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Clock className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">قيد المراجعة</p>
                      <p className="text-2xl font-bold">{analytics?.pendingArticles || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-rejected-articles">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <XCircle className="h-5 w-5 text-red-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">مرفوض</p>
                      <p className="text-2xl font-bold">{analytics?.rejectedArticles || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-total-views">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Eye className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">المشاهدات</p>
                      <p className="text-2xl font-bold">{analytics?.totalViews?.toLocaleString("en-US") || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-total-likes">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-pink-500/10">
                      <ThumbsUp className="h-5 w-5 text-pink-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">الإعجابات</p>
                      <p className="text-2xl font-bold">{analytics?.totalLikes?.toLocaleString("en-US") || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-total-comments">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <MessageCircle className="h-5 w-5 text-cyan-500" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">التعليقات</p>
                      <p className="text-2xl font-bold">{analytics?.totalComments?.toLocaleString("en-US") || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8">
              <h2 className="text-lg font-semibold mb-4" data-testid="text-articles-section-title">
                مقالاتي
              </h2>

              {analytics?.articles && analytics.articles.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm" data-testid="table-articles">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-right py-3 px-4 font-medium">العنوان</th>
                        <th className="text-right py-3 px-4 font-medium">الحالة</th>
                        <th className="text-right py-3 px-4 font-medium min-w-[200px]">ملاحظات التحرير</th>
                        <th className="text-right py-3 px-4 font-medium">المشاهدات</th>
                        <th className="text-right py-3 px-4 font-medium">تاريخ الإنشاء</th>
                        <th className="text-center py-3 px-4 font-medium">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics?.articles?.map((article) => (
                        <tr
                          key={article.id}
                          className="border-t hover:bg-muted/30 transition-colors"
                          data-testid={`row-article-${article.id}`}
                        >
                          <td className="py-3 px-4">
                            <span className="line-clamp-1 font-medium">{article.title}</span>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={articleStatusLabel(article).variant}
                              data-testid={`badge-status-${article.id}`}
                            >
                              {articleStatusLabel(article).label}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            {article.reviewStatus === "needs_changes" && article.reviewNotes ? (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 leading-relaxed max-w-md">
                                <span className="font-medium flex items-center gap-1 mb-1">
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                  ملاحظات التحرير
                                </span>
                                {article.reviewNotes}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {article.views?.toLocaleString("en-US") || 0}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {article.createdAt
                              ? format(new Date(article.createdAt), "d MMMM yyyy", { locale: ar })
                              : "-"}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {(article.status === "draft" || article.reviewStatus === "needs_changes") &&
                                article.reviewStatus !== "pending_review" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditArticle(article.id)}
                                  data-testid={`button-edit-${article.id}`}
                                  title="تعديل"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              )}
                              {article.reviewStatus === "needs_changes" && (
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="gap-1 h-8"
                                  disabled={submitReviewMutation.isPending}
                                  onClick={() => submitReviewMutation.mutate(article.id)}
                                  data-testid={`button-submit-${article.id}`}
                                  title="إرسال بعد التعديل"
                                >
                                  <Send className="h-3.5 w-3.5" />
                                  إرسال
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 border rounded-lg bg-muted/20">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    لم تقم بكتابة أي مقالات بعد
                  </p>
                  <Button onClick={handleNewArticle} data-testid="button-new-article-empty">
                    <PlusCircle className="h-4 w-4 ml-2" />
                    ابدأ بكتابة مقالك الأول
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
