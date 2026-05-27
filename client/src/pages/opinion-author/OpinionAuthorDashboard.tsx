import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SubmitRevisionButton } from "@/components/SubmitRevisionButton";
import { contributorArticleStatusLabel } from "@/lib/contributorArticleStatus";
import {
  markArticleSubmittedInAnalyticsCache,
  invalidateContributorAnalytics,
} from "@/lib/contributorAnalyticsCache";
import {
  ContributorStatsRow,
  PerformanceChart,
  BestArticleCard,
  EngagementTable,
  FollowerCard,
  FeaturedCommentCard,
  PublishingActivityCard,
  ContributorRankCard,
  MonthComparisonCard,
  ArticleStatusBreakdown,
} from "@/components/contributor-dashboard";
import {
  FileText,
  Edit,
  PlusCircle,
  MessageSquare,
  AlertCircle,
  Eye,
  ThumbsUp,
  MessageCircle,
  Bookmark,
} from "lucide-react";

interface OpinionAuthorAnalytics {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  pendingArticles: number;
  needsChangesArticles?: number;
  rejectedArticles: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalBookmarks: number;
  dailyStats: Array<{ date: string; views: number; likes: number; comments: number }>;
  bestArticleThisWeek: { id: string; title: string; views: number } | null;
  comparison: {
    viewsThisMonth: number;
    viewsLastMonth: number;
    likesThisMonth: number;
    likesLastMonth: number;
  };
  followers: {
    count: number;
    dailyGrowth: Array<{ date: string; count: number }>;
  };
  topArticles: Array<{
    id: string;
    title: string;
    views: number;
    likes: number;
    comments: number;
    bookmarks: number;
    publishedAt: string | null;
  }>;
  featuredComment: {
    content: string;
    userName: string;
    articleTitle: string;
    articleId: string;
  } | null;
  publishingActivity: {
    lastPublishedAt: string | null;
    daysSinceLastPublished: number | null;
    thisWeekCount: number;
    thisMonthCount: number;
  };
  articles: Array<{
    id: string;
    title: string;
    status: string;
    reviewStatus?: string | null;
    reviewNotes?: string | null;
    reviewedAt?: string | null;
    updatedAt?: string | null;
    views: number;
    likes: number;
    comments: number;
    bookmarks: number;
    publishedAt: string | null;
    createdAt: string;
  }>;
}

export default function OpinionAuthorDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const {
    data: analytics,
    isLoading,
    isError,
    refetch,
  } = useQuery<OpinionAuthorAnalytics>({
    queryKey: ["/api/opinion-author/analytics"],
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const needsChangesList =
    analytics?.articles?.filter((a) => a.reviewStatus === "needs_changes") ?? [];

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
    onSuccess: (data, articleId) => {
      markArticleSubmittedInAnalyticsCache(queryClient, {
        id: articleId,
        reviewStatus: data?.reviewStatus ?? "pending_review",
        status: data?.status ?? "draft",
        updatedAt: data?.updatedAt,
      });
      invalidateContributorAnalytics(queryClient);
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
        {/* Header */}
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

        {isError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
            <p className="text-sm text-destructive">تعذّر تحميل مقالاتك. جرّب تحديث الصفحة.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <>
            {/* Needs Changes Alert */}
            {needsChangesList.length > 0 && (
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40 p-4 md:p-5 space-y-3">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-100 font-semibold">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  مقالات تحتاج تعديلك ({needsChangesList.length})
                </div>
                <p className="text-sm text-amber-800/90 dark:text-amber-200/90">
                  يؤسفنا إبلاغكم بوجود بعض الملاحظات — عدّل المقال ثم اضغط «إرسال» ليعود إلى مسودات التحرير.
                </p>
                <ul className="space-y-2">
                  {needsChangesList.map((article) => (
                    <li
                      key={article.id}
                      className="rounded-lg border border-amber-200/80 bg-white/60 dark:bg-background/40 p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="font-medium line-clamp-2">{article.title}</p>
                        {article.reviewNotes && (
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            <span className="font-medium text-foreground">الملاحظات: </span>
                            {article.reviewNotes}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEditArticle(article.id)}>
                          <Edit className="h-4 w-4 ml-1" />
                          تعديل
                        </Button>
                        <SubmitRevisionButton
                          article={article}
                          isPending={submitReviewMutation.isPending}
                          onSubmit={(id) => submitReviewMutation.mutate(id)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Section: Overview */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">نظرة عامة</h2>

              <ContributorStatsRow
                totalViews={analytics?.totalViews ?? 0}
                totalLikes={analytics?.totalLikes ?? 0}
                totalComments={analytics?.totalComments ?? 0}
                totalBookmarks={analytics?.totalBookmarks ?? 0}
                comparison={analytics?.comparison}
                loading={isLoading}
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <ArticleStatusBreakdown
                  published={analytics?.publishedArticles ?? 0}
                  draft={analytics?.draftArticles ?? 0}
                  pending={analytics?.pendingArticles ?? 0}
                  needsChanges={analytics?.needsChangesArticles ?? 0}
                  rejected={analytics?.rejectedArticles ?? 0}
                  loading={isLoading}
                />
                <MonthComparisonCard
                  comparison={analytics?.comparison ?? { viewsThisMonth: 0, viewsLastMonth: 0, likesThisMonth: 0, likesLastMonth: 0 }}
                  loading={isLoading}
                />
                <BestArticleCard
                  article={analytics?.bestArticleThisWeek ?? null}
                  loading={isLoading}
                  onNavigate={(id) => navigate(`/article/${id}`)}
                />
              </div>
            </section>

            {/* Section: Performance Chart */}
            <section>
              <h2 className="text-lg font-semibold mb-4">أداء المقالات</h2>
              <PerformanceChart
                dailyStats={analytics?.dailyStats ?? []}
                loading={isLoading}
              />
            </section>

            {/* Section: Engagement */}
            <section>
              <h2 className="text-lg font-semibold mb-4">التفاعل</h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <EngagementTable
                    articles={analytics?.topArticles ?? []}
                    loading={isLoading}
                    onNavigate={(id) => navigate(`/article/${id}`)}
                  />
                </div>
                <FeaturedCommentCard
                  comment={analytics?.featuredComment ?? null}
                  loading={isLoading}
                  onNavigate={(id) => navigate(`/article/${id}`)}
                />
              </div>
            </section>

            {/* Section: Audience */}
            <section>
              <h2 className="text-lg font-semibold mb-4">الجمهور</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FollowerCard
                  count={analytics?.followers?.count ?? 0}
                  dailyGrowth={analytics?.followers?.dailyGrowth ?? []}
                  loading={isLoading}
                />
                <ContributorRankCard roleType="opinion_author" loading={isLoading} />
                <PublishingActivityCard
                  lastPublishedAt={analytics?.publishingActivity?.lastPublishedAt ?? null}
                  daysSinceLastPublished={analytics?.publishingActivity?.daysSinceLastPublished ?? null}
                  thisWeekCount={analytics?.publishingActivity?.thisWeekCount ?? 0}
                  thisMonthCount={analytics?.publishingActivity?.thisMonthCount ?? 0}
                  loading={isLoading}
                />
              </div>
            </section>

            {/* Section: Articles Table */}
            <section>
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
                        <th className="text-center py-3 px-4 font-medium">
                          <Eye className="h-3.5 w-3.5 inline" />
                        </th>
                        <th className="text-center py-3 px-4 font-medium">
                          <ThumbsUp className="h-3.5 w-3.5 inline" />
                        </th>
                        <th className="text-center py-3 px-4 font-medium">
                          <MessageCircle className="h-3.5 w-3.5 inline" />
                        </th>
                        <th className="text-center py-3 px-4 font-medium">
                          <Bookmark className="h-3.5 w-3.5 inline" />
                        </th>
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
                              variant={contributorArticleStatusLabel(article).variant}
                              data-testid={`badge-status-${article.id}`}
                            >
                              {contributorArticleStatusLabel(article).label}
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
                            ) : article.reviewStatus === "pending_review" && article.reviewedAt ? (
                              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-100 leading-relaxed max-w-md">
                                <span className="font-medium">أُرسل للمراجعة</span>
                                {article.reviewNotes ? (
                                  <p className="mt-1 text-muted-foreground">{article.reviewNotes}</p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center tabular-nums">
                            {(article.views || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center tabular-nums">
                            {(article.likes || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center tabular-nums">
                            {(article.comments || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center tabular-nums">
                            {(article.bookmarks || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
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
                                <SubmitRevisionButton
                                  article={article}
                                  isPending={submitReviewMutation.isPending}
                                  onSubmit={(aid) => submitReviewMutation.mutate(aid)}
                                  className="gap-1 h-8"
                                  testId={`button-submit-${article.id}`}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : !isLoading ? (
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
              ) : null}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
