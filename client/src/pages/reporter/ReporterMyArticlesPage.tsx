import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { MyServicesHomeLink } from "@/components/staff/MyServicesHomeLink";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useMediaLicenseGate } from "@/hooks/useMediaLicenseGate";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SubmitRevisionButton } from "@/components/SubmitRevisionButton";
import { WriterInquiriesButton } from "@/components/WriterInquiriesButton";
import { contributorArticleStatusLabel, reporterArticleBucket, type ReporterArticleBucket } from "@/lib/contributorArticleStatus";
import { EditRequestLabel, RequestEditButton, RequestEditDialog, ReviewEditRequestDialog, useArticleEditRequests } from "@/components/articles/ArticleEditRequests";
import { articleAcceptsEditRequests } from "@shared/articleEditRequests";
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
import { FileText, Edit, PlusCircle, Eye, Newspaper, PenLine, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type ReporterArticle = {
  id: string;
  title: string;
  status: string;
  reviewStatus?: string | null;
  reviewNotes?: string | null;
  reviewedAt?: string | null;
  updatedAt?: string | null;
  views?: number | null;
  publishedAt: string | null;
  scheduledAt?: string | null;
  createdAt: string;
};

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

type ListFilter = "all" | ReporterArticleBucket;

const FILTERS: Array<{ id: ListFilter; label: string }> = [
  { id: "all", label: "الكل" },
  { id: "fix", label: "تحتاج تعديلك" },
  { id: "rev", label: "قيد المراجعة" },
  { id: "sch", label: "مجدولة" },
  { id: "pub", label: "منشورة" },
  { id: "draft", label: "مسودات" },
  { id: "arch", label: "المؤرشفة" },
];

const PAGE_SIZE = 30;
const STATS_OPEN_PREF = "sabq.reporter.statsOpen";

const EMPTY_COMPARISON = {
  viewsThisMonth: 0,
  viewsLastMonth: 0,
  likesThisMonth: 0,
  likesLastMonth: 0,
};

const BUCKET_TONE: Record<ReporterArticleBucket, string> = {
  pub: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  sch: "bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  fix: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  rev: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  draft: "bg-slate-100 text-slate-700 dark:bg-muted dark:text-muted-foreground",
  arch: "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground",
};

function readStatsPref() {
  try {
    return localStorage.getItem(STATS_OPEN_PREF) === "1";
  } catch {
    return false;
  }
}

function formatDay(value?: string | null) {
  return value ? format(new Date(value), "d MMMM yyyy", { locale: ar }) : "";
}

export default function ReporterMyArticlesPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  // «طلب تعديل» على خبر المراسل نفسه (منشور أو بانتظار المراجعة): بدل إرسال خبر جديد.
  const editRequests = useArticleEditRequests(true);
  const [reviewRequestId, setReviewRequestId] = useState<string | null>(null);
  const [requestEditArticleId, setRequestEditArticleId] = useState<string | null>(null);
  const { createBlocked, createBlockedReason, openMediaLicenseForm } = useMediaLicenseGate();
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [statsOpen, setStatsOpen] = useState(readStatsPref);

  useEffect(() => {
    try {
      localStorage.setItem(STATS_OPEN_PREF, statsOpen ? "1" : "0");
    } catch {
      /* التذكّر راحة فقط */
    }
  }, [statsOpen]);

  // القائمة وحدها أولًا، والإحصاءات الثقيلة لا تُطلب إلا عند فتح «أداء أخباري».
  const {
    data: listData,
    isLoading: listLoading,
    isError,
    refetch,
  } = useQuery<{ articles: ReporterArticle[] }>({
    queryKey: ["/api/reporter/my-articles"],
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
  });

  const { data: analytics, isLoading: statsLoading } = useQuery<ReporterAnalytics>({
    queryKey: ["/api/reporter/analytics"],
    enabled: statsOpen,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });
  const isLoading = statsLoading;

  const articles = Array.isArray(listData?.articles) ? listData.articles : [];

  const counts = useMemo(() => {
    const c: Record<ListFilter, number> = { all: 0, fix: 0, rev: 0, sch: 0, pub: 0, draft: 0, arch: 0 };
    for (const a of articles) {
      const b = reporterArticleBucket(a);
      c[b] += 1;
      if (b !== "arch") c.all += 1;
    }
    return c;
  }, [articles]);

  const lastPublishedAt = useMemo(
    () =>
      articles.reduce<string | null>(
        (max, a) => (a.status === "published" && a.publishedAt && (!max || a.publishedAt > max) ? a.publishedAt : max),
        null,
      ),
    [articles],
  );

  const filteredArticles = useMemo(() => {
    const q = search.trim();
    const list = articles.filter((a) => {
      const b = reporterArticleBucket(a);
      if (listFilter === "all" ? b === "arch" : b !== listFilter) return false;
      return !q || a.title?.includes(q);
    });
    // ما ينتظر تعديلك أولًا، ثم الأحدث.
    return list.sort((x, y) => Number(reporterArticleBucket(y) === "fix") - Number(reporterArticleBucket(x) === "fix"));
  }, [articles, listFilter, search]);

  useEffect(() => setVisible(PAGE_SIZE), [listFilter, search]);

  const handleEditArticle = (articleId: string) => {
    navigate(`/dashboard/articles/${articleId}/edit`);
  };

  const handleNewArticle = () => {
    if (createBlocked) {
      toast({
        title: "الترخيص المهني مطلوب",
        description: createBlockedReason,
        variant: "destructive",
      });
      openMediaLicenseForm();
      return;
    }
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
        title: "تم إرسال الخبر لهيئة التحرير",
        description: "وصل الخبر إلى هيئة التحرير، وهو الآن بانتظار المراجعة والنشر",
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
          description="أخبارك وما ينتظر تعديلك أولًا، والأداء في الأسفل"
          titleTestId="text-reporter-page-title"
          actions={
            <>
              <WriterInquiriesButton />
              <Button
                onClick={handleNewArticle}
                className={`h-10 gap-2 rounded-full px-5${createBlocked ? " opacity-60" : ""}`}
                title={createBlocked ? createBlockedReason : undefined}
                data-testid="button-reporter-new-article"
              >
                <PlusCircle className="h-4 w-4" />
                خبر جديد
              </Button>
            </>
          }
        />

        <MyServicesHomeLink />

        {isError ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
            <p className="text-sm text-destructive">تعذّر تحميل أخبارك. جرّب تحديث الصفحة.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setListFilter("fix")}
              className="flex w-full flex-wrap items-center gap-4 rounded-[22px] border border-white bg-gradient-to-l from-[#E2F2FD] to-[#EEF1FE] p-4 text-right dark:border-border dark:from-card dark:to-card md:p-5"
              data-testid="button-reporter-needs-changes-summary"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#1E9BE6] dark:bg-background">
                <PenLine className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">{listLoading ? "…" : counts.fix}</span>
                  <span className="text-[15px] font-semibold text-muted-foreground">خبر يحتاج تعديلك</span>
                </span>
                <span className="mt-1 block text-[13px] text-muted-foreground">
                  و{counts.rev} قيد المراجعة عند المحرر، و{counts.sch} مجدول للنشر
                </span>
              </span>
              {lastPublishedAt && (
                <span className="ms-auto hidden rounded-2xl bg-white/70 px-4 py-2 text-xs text-muted-foreground dark:bg-background/60 sm:block">
                  آخر نشر
                  <b className="block text-[15px] text-foreground">{formatDay(lastPublishedAt)}</b>
                </span>
              )}
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setListFilter(f.id)}
                    aria-pressed={listFilter === f.id}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-medium shadow-sm transition-colors",
                      listFilter === f.id
                        ? "bg-[#1E9BE6] text-white shadow-[0_4px_12px_rgba(30,155,230,.3)]"
                        : "bg-card text-foreground hover:bg-muted",
                    )}
                    data-testid={`filter-articles-${f.id}`}
                  >
                    {f.label}
                    <span className={cn("text-xs tabular-nums", listFilter === f.id ? "text-white" : "text-muted-foreground")}>
                      {counts[f.id]}
                    </span>
                  </button>
                ))}
              </div>
              <label className="relative ms-auto hidden sm:block">
                <span className="sr-only">ابحث في أخبارك</span>
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="reporter-articles-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث في أخبارك"
                  className="h-9 w-56 rounded-full border-0 bg-card ps-9 pe-4 text-[13px] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#1E9BE6]"
                />
              </label>
            </div>

            {listLoading ? (
              <div className="space-y-px overflow-hidden rounded-[22px] bg-card shadow-sm">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-[76px] animate-pulse border-t border-border/40 bg-muted/30 first:border-t-0" />
                ))}
              </div>
            ) : filteredArticles.length > 0 ? (
              <div className="overflow-hidden rounded-[22px] bg-card shadow-sm" data-testid="list-reporter-articles">
                {filteredArticles.slice(0, visible).map((article) => {
                  const bucket = reporterArticleBucket(article);
                  const status = contributorArticleStatusLabel(article);
                  const requests = editRequests.byArticle.get(article.id);
                  const canRequestEdit =
                    articleAcceptsEditRequests(article.status)
                    && (article.status !== "draft" || article.reviewStatus === "pending_review")
                    && !requests?.some((i) => i.status === "pending");
                  const canEdit =
                    (article.status === "draft" || article.reviewStatus === "needs_changes")
                    && article.reviewStatus !== "pending_review";
                  const day = bucket === "sch" ? article.scheduledAt : article.publishedAt || article.createdAt;
                  return (
                    <div
                      key={article.id}
                      className={cn(
                        "grid grid-cols-1 items-center gap-x-4 gap-y-2.5 border-t border-border/50 px-4 py-3.5 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] md:px-5",
                        bucket === "fix" && "bg-amber-50/50 dark:bg-amber-950/10",
                      )}
                      data-testid={`row-reporter-article-${article.id}`}
                    >
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-[15px] font-semibold leading-relaxed">{article.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className={cn("whitespace-nowrap rounded-full px-2.5 py-0.5 font-semibold", BUCKET_TONE[bucket])}>
                            {status.label}
                          </span>
                          <EditRequestLabel items={requests} onOpen={setReviewRequestId} />
                          {day && <span>{formatDay(day)}</span>}
                          {(article.views ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 tabular-nums">
                              <Eye className="h-3.5 w-3.5" />
                              {(article.views ?? 0).toLocaleString("en-US")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {canRequestEdit && <RequestEditButton onClick={() => setRequestEditArticleId(article.id)} />}
                        {canEdit && (
                          <Button size="sm" variant="ghost" className="h-9 gap-1 rounded-full bg-[#E6F4FD] px-4 text-[#0B6FA8] hover:bg-[#d6ecfb] dark:bg-sky-950/40 dark:text-sky-300" onClick={() => handleEditArticle(article.id)}>
                            <Edit className="h-3.5 w-3.5" />
                            تعديل
                          </Button>
                        )}
                        {article.reviewStatus === "needs_changes" && (
                          <SubmitRevisionButton
                            article={article}
                            isPending={submitReviewMutation.isPending}
                            onSubmit={(aid) => submitReviewMutation.mutate(aid)}
                            className="h-9 gap-1 rounded-full px-4"
                          />
                        )}
                      </div>
                      {bucket === "fix" && article.reviewNotes && (
                        <div className="rounded-2xl bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:col-span-2">
                          <b>ملاحظة المحرر: </b>
                          <span className="whitespace-pre-wrap">{article.reviewNotes}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredArticles.length > visible && (
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="block w-full border-t border-border/50 py-3 text-center text-[13px] font-semibold text-[#0B6FA8] hover:bg-muted/40 dark:text-sky-300"
                  >
                    عرض المزيد ({filteredArticles.length - visible})
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-[22px] bg-card py-12 text-center shadow-sm">
                <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-4 text-muted-foreground">
                  {search.trim() ? "لا توجد أخبار تطابق البحث" : listFilter === "all" ? "لا توجد أخبار بعد" : "لا توجد أخبار هنا"}
                </p>
                {listFilter === "all" && !search.trim() && (
                  <Button onClick={handleNewArticle} className="h-10 gap-2 rounded-full px-5">
                    <PlusCircle className="h-4 w-4" />
                    ابدأ بكتابة خبرك الأول
                  </Button>
                )}
              </div>
            )}

            <Collapsible open={statsOpen} onOpenChange={setStatsOpen} className="rounded-[22px] bg-card shadow-sm">
              <CollapsibleTrigger
                className="flex w-full flex-wrap items-center gap-3 px-4 py-4 text-right md:px-5"
                data-testid="button-reporter-stats-toggle"
              >
                <span className="text-[15px] font-semibold">أداء أخباري</span>
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  {analytics
                    ? `${(analytics.totalViews ?? 0).toLocaleString("en-US")} مشاهدة · ${(analytics.totalLikes ?? 0).toLocaleString("en-US")} إعجابًا · ${(analytics.totalComments ?? 0).toLocaleString("en-US")} تعليقًا`
                    : "المشاهدات والتفاعل والجمهور"}
                </span>
                <span className="ms-auto inline-flex items-center gap-1 text-[13px] font-semibold text-[#0B6FA8] dark:text-sky-300">
                  {statsOpen ? "إخفاء" : "عرض"}
                  <ChevronDown className={cn("h-4 w-4 transition-transform", statsOpen && "rotate-180")} />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-6 border-t border-border/50 px-4 pb-5 pt-4 md:px-5">
                  <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-muted-foreground">واقع التفاعل</h2>
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
                    <h2 className="text-sm font-semibold text-muted-foreground">أداء الأخبار</h2>
                    <PerformanceChart
                      dailyStats={analytics?.dailyStats ?? []}
                      loading={isLoading}
                      title="أداء الأخبار"
                      description="المشاهدات والتفاعل خلال الفترة"
                    />
                  </section>

                  <section className="space-y-3">
                    <h2 className="text-sm font-semibold text-muted-foreground">التفاعل والجمهور</h2>
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
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </DashboardPageShell>
      <ReviewEditRequestDialog requestId={reviewRequestId} open={!!reviewRequestId} onOpenChange={(open) => !open && setReviewRequestId(null)} />
      <RequestEditDialog articleId={requestEditArticleId} open={!!requestEditArticleId} onOpenChange={(open) => !open && setRequestEditArticleId(null)} />
    </DashboardLayout>
  );
}
