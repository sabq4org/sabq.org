import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SubmitRevisionButton } from "@/components/SubmitRevisionButton";
import { WriterInquiriesButton } from "@/components/WriterInquiriesButton";
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
  AlertCircle,
  Eye,
  ThumbsUp,
  MessageCircle,
  Bookmark,
  Newspaper,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReporterAnalytics {
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

type ListFilter = "active" | "archived" | "all";

const EMPTY_COMPARISON = {
  viewsThisMonth: 0,
  viewsLastMonth: 0,
  likesThisMonth: 0,
  likesLastMonth: 0,
};

function isArchived(status: string) {
  return status === "archived" || status === "deleted";
}

export default function ReporterMyArticlesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [listFilter, setListFilter] = useState<ListFilter>("active");

  const {
    data: analytics,
    isLoading,
    isError,
    refetch,
  } = useQuery<ReporterAnalytics>({
    queryKey: ["/api/reporter/analytics"],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  const articles = Array.isArray(analytics?.articles) ? analytics.articles : [];
  const needsChangesList = articles.filter((a) => a.reviewStatus === "needs_changes");

  const filteredArticles = useMemo(() => {
    if (listFilter === "all") return articles;
    if (listFilter === "archived") return articles.filter((a) => isArchived(a.status));
    return articles.filter((a) => !isArchived(a.status));
  }, [articles, listFilter]);

  const filterCounts = useMemo(() => {
    const archived = articles.filter((a) => isArchived(a.status)).length;
    return {
      active: articles.length - archived,
      archived,
      all: articles.length,
    };
  }, [articles]);

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
      <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="px-4 pb-20 sm:px-6">
        <DashboardPageHeader
          icon={Newspaper}
          title="أخباري"
          description="واقع أدائك التحريري والتفاعل مع أخبارك — وما يحتاجه منك فريق التحرير"
          titleTestId="text-reporter-page-title"
          actions={
            <>
              <WriterInquiriesButton />
              <Button
                onClick={handleNewArticle}
                className="h-10 gap-2 px-4"
                data-testid="button-reporter-new-article"
              >
                <PlusCircle className="h-4 w-4" />
                خبر جديد
              </Button>
            </>
          }
        />

        {isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
            <p className="text-sm text-destructive">تعذّر تحميل أخبارك. جرّب تحديث الصفحة.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <>
            {needsChangesList.length > 0 && (
              <div className="rounded-2xl border-2 border-warning/50 bg-warning/10 dark:bg-card dark:border-border p-4 md:p-5 space-y-3">
                <div className="flex items-center gap-2 text-warning font-semibold">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  أخبار تحتاج تعديلك ({needsChangesList.length})
                </div>
                <p className="text-sm text-warning">
                  عدّل الخبر ثم اضغط «إرسال» ليعود إلى مسودات التحرير.
                </p>
                <ul className="space-y-2">
                  {needsChangesList.map((article) => (
                    <li
                      key={article.id}
                      className="rounded-xl border border-warning/40 dark:border-border bg-card/80 dark:bg-background/40 p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
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
                        <Button size="sm" variant="outline" className="h-9" onClick={() => handleEditArticle(article.id)}>
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

            <section className="space-y-4">
              <h2 className="text-lg font-semibold">واقع التفاعل</h2>
              <ContributorStatsRow
                totalViews={analytics?.totalViews ?? 0}
                totalLikes={analytics?.totalLikes ?? 0}
                totalComments={analytics?.totalComments ?? 0}
                totalBookmarks={analytics?.totalBookmarks ?? 0}
                comparison={analytics?.comparison}
                loading={isLoading}
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <ArticleStatusBreakdown
                  published={analytics?.publishedArticles ?? 0}
                  draft={analytics?.draftArticles ?? 0}
                  pending={analytics?.pendingArticles ?? 0}
                  needsChanges={analytics?.needsChangesArticles ?? 0}
                  rejected={analytics?.rejectedArticles ?? 0}
                  loading={isLoading}
                  title="توزيع الأخبار"
                  emptyLabel="لا توجد أخبار"
                />
                <MonthComparisonCard
                  comparison={analytics?.comparison ?? EMPTY_COMPARISON}
                  loading={isLoading}
                />
                <BestArticleCard
                  article={analytics?.bestArticleThisWeek ?? null}
                  loading={isLoading}
                  onNavigate={(id) => navigate(`/article/${id}`)}
                  title="أفضل خبر هذا الأسبوع"
                  emptyLabel="لا توجد أخبار منشورة بعد"
                />
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">أداء الأخبار</h2>
              <PerformanceChart
                dailyStats={analytics?.dailyStats ?? []}
                loading={isLoading}
                title="أداء الأخبار"
                description="المشاهدات والتفاعل خلال الفترة"
              />
            </section>

            <section className="space-y-3">
              <h2 className="text-lg font-semibold">التفاعل والجمهور</h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <EngagementTable
                    articles={analytics?.topArticles ?? []}
                    loading={isLoading}
                    onNavigate={(id) => navigate(`/article/${id}`)}
                    title="أعلى الأخبار تفاعلاً"
                    emptyLabel="لا توجد أخبار منشورة"
                  />
                </div>
                <FeaturedCommentCard
                  comment={analytics?.featuredComment ?? null}
                  loading={isLoading}
                  onNavigate={(id) => navigate(`/article/${id}`)}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FollowerCard
                  count={analytics?.followers?.count ?? 0}
                  dailyGrowth={analytics?.followers?.dailyGrowth ?? []}
                  loading={isLoading}
                />
                <ContributorRankCard roleType="reporter" loading={isLoading} />
                <PublishingActivityCard
                  lastPublishedAt={analytics?.publishingActivity?.lastPublishedAt ?? null}
                  daysSinceLastPublished={analytics?.publishingActivity?.daysSinceLastPublished ?? null}
                  thisWeekCount={analytics?.publishingActivity?.thisWeekCount ?? 0}
                  thisMonthCount={analytics?.publishingActivity?.thisMonthCount ?? 0}
                  loading={isLoading}
                />
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold">قائمة أخباري</h2>
                <div className="flex flex-wrap gap-1.5 rounded-xl border bg-muted/30 p-1">
                  {(
                    [
                      { id: "active", label: "النشطة" },
                      { id: "archived", label: "المؤرشفة" },
                      { id: "all", label: "الكل" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setListFilter(tab.id)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors tabular-nums",
                        listFilter === tab.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      data-testid={`filter-articles-${tab.id}`}
                    >
                      {tab.label} ({filterCounts[tab.id]})
                    </button>
                  ))}
                </div>
              </div>

              {filteredArticles.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border">
                  <table className="w-full text-sm">
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
                      {filteredArticles.map((article) => (
                        <tr
                          key={article.id}
                          className="border-t hover:bg-muted/30 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <span className="line-clamp-1 font-medium">{article.title}</span>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={contributorArticleStatusLabel(article).variant}>
                              {contributorArticleStatusLabel(article).label}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            {article.reviewStatus === "needs_changes" && article.reviewNotes ? (
                              <div className="rounded-lg border border-warning/40 bg-warning/10 dark:bg-muted/40 dark:border-border px-3 py-2 text-xs text-warning leading-relaxed max-w-md">
                                <span className="font-medium flex items-center gap-1 mb-1">
                                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                  ملاحظات التحرير
                                </span>
                                {article.reviewNotes}
                              </div>
                            ) : article.reviewStatus === "pending_review" && article.reviewedAt ? (
                              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-muted/40 dark:border-border px-3 py-2 text-xs text-blue-900 dark:text-blue-100 leading-relaxed max-w-md">
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
                <div className="rounded-2xl border bg-muted/20 py-12 text-center">
                  <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="mb-4 text-muted-foreground">
                    {listFilter === "archived"
                      ? "لا توجد أخبار مؤرشفة"
                      : listFilter === "active"
                        ? "لا توجد أخبار نشطة حالياً"
                        : "لا توجد أخبار بعد"}
                  </p>
                  {listFilter !== "archived" && (
                    <Button onClick={handleNewArticle} className="h-10 gap-2 px-4">
                      <PlusCircle className="h-4 w-4" />
                      ابدأ بكتابة خبرك الأول
                    </Button>
                  )}
                </div>
              ) : null}
            </section>
          </>
        )}
      </DashboardPageShell>
    </DashboardLayout>
  );
}
