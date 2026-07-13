import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SubmitRevisionButton } from "@/components/SubmitRevisionButton";
import { WriterInquiriesButton } from "@/components/WriterInquiriesButton";
import {
  ContributorStatsRow,
  PerformanceChart,
  BestArticleCard,
  EngagementTable,
  FollowerCard,
  FeaturedCommentCard,
  PublishingActivityCard,
  MonthComparisonCard,
  ArticleStatusBreakdown,
} from "@/components/contributor-dashboard";
import {
  ArrowLeft,
  BellRing,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CheckCheck,
  CircleX,
  Clock3,
  Edit3,
  Feather,
  FileCheck2,
  Lightbulb,
  PenLine,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Target,
  Users,
  WandSparkles,
} from "lucide-react";

type ArticleRow = {
  id: string;
  title: string;
  status: string;
  reviewStatus?: string | null;
  reviewNotes?: string | null;
  scheduledAt?: string | null;
  reviewedAt?: string | null;
  updatedAt?: string | null;
  createdAt: string;
  views: number;
  likes: number;
  comments: number;
  bookmarks: number;
  publishedAt: string | null;
};

type Analytics = {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalBookmarks: number;
  publishedArticles: number;
  draftArticles: number;
  pendingArticles: number;
  needsChangesArticles?: number;
  rejectedArticles: number;
  dailyStats: Array<{ date: string; views: number; likes: number; comments: number }>;
  bestArticleThisWeek: { id: string; title: string; views: number } | null;
  comparison: { viewsThisMonth: number; viewsLastMonth: number; likesThisMonth: number; likesLastMonth: number };
  followers: { count: number; dailyGrowth: Array<{ date: string; count: number }> };
  topArticles: Array<{ id: string; title: string; views: number; likes: number; comments: number; bookmarks: number; publishedAt: string | null }>;
  featuredComment: { content: string; userName: string; articleTitle: string; articleId: string } | null;
  publishingActivity: { lastPublishedAt: string | null; daysSinceLastPublished: number | null; thisWeekCount: number; thisMonthCount: number };
  articles: ArticleRow[];
};

type Workspace = {
  desk: Array<{ id: string; title: string; status: string; reviewStatus: string | null; reviewNotes: string | null; updatedAt: string; nextAction: string }>;
  tracking: TrackingArticle[];
  readerPulse: { commentsCount: number; positiveShare: number; highlightedComment: { content: string; articleTitle: string } | null; message: string };
  followUp: { articleId: string; title: string; views: number; prompt: string } | null;
  calendar: Array<{ id: string; name: string; date: string; category: string }>;
  monthlyBrief: { publishedCount: number; views: number; message: string };
};

type TrackingArticle = {
  id: string;
  title: string;
  status: string;
  reviewStatus: string | null;
  reviewNotes: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

type WriterIdea = {
  id: string;
  title: string;
  angle: string;
  whyNow: string;
  audience: string;
  sourcePrompts: string[];
  kind: "specialty" | "follow_up" | "timely";
};

type CoachResult = {
  reflection?: string;
  questions?: string[];
  thesisOptions?: string[];
  outline?: string[];
  counterpoint?: string;
  sourcesToSeek?: string[];
  cautions?: string[];
};

type ReviewResult = {
  overallScore?: number;
  summary?: string;
  checks?: Array<{ key: string; label: string; score: number; note: string }>;
  headlineSuggestions?: string[];
  sourceFlags?: string[];
  sensitiveClaims?: string[];
  strengths?: string[];
};

type EditorialNotification = {
  id: string;
  type: "scheduled" | "published" | "rejected" | "needs_revision" | "archived" | "deleted" | string;
  title: string;
  body: string;
  articleId: string | null;
  articleTitle: string | null;
  reviewerNote: string | null;
  readAt: string | null;
  createdAt: string;
};

const EMPTY_COMPARISON = { viewsThisMonth: 0, viewsLastMonth: 0, likesThisMonth: 0, likesLastMonth: 0 };

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "صباح الإبداع";
  if (hour < 18) return "مساء الفكرة الجميلة";
  return "مساء الإبداع";
}

export default function WriterWorkspacePage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("today");
  const [ideaInput, setIdeaInput] = useState("");
  const [coachResult, setCoachResult] = useState<CoachResult | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [reviewTitle, setReviewTitle] = useState("");

  const analyticsQuery = useQuery<Analytics>({
    queryKey: ["/api/opinion-author/analytics"],
    staleTime: 5 * 60 * 1000,
  });
  const workspaceQuery = useQuery<Workspace>({
    queryKey: ["/api/opinion-author/workspace"],
    staleTime: 20 * 1000,
    refetchInterval: activeTab === "articles" ? 30 * 1000 : false,
  });
  const ideasQuery = useQuery<{ ideas: WriterIdea[]; generatedBy: "ai" | "fallback" }>({
    queryKey: ["/api/opinion-author/ideas"],
    staleTime: 30 * 60 * 1000,
  });
  const styleQuery = useQuery<Record<string, unknown>>({
    queryKey: ["/api/opinion-author/style-profile"],
    enabled: activeTab === "ideas",
    staleTime: 24 * 60 * 60 * 1000,
  });
  const notificationsQuery = useQuery<{ items: EditorialNotification[]; unread: number }>({
    queryKey: ["/api/opinion-author/notifications"],
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  });

  const analytics = analyticsQuery.data;
  const workspace = workspaceQuery.data;
  const ideas = Array.isArray(ideasQuery.data?.ideas) ? ideasQuery.data.ideas : [];
  const trackedArticles: TrackingArticle[] = Array.isArray(workspace?.tracking)
    ? workspace.tracking
    : (analytics?.articles ?? []).map((article) => ({
        id: article.id,
        title: article.title,
        status: article.status,
        reviewStatus: article.reviewStatus ?? null,
        reviewNotes: article.reviewNotes ?? null,
        scheduledAt: article.scheduledAt ?? null,
        publishedAt: article.publishedAt,
        reviewedAt: article.reviewedAt ?? null,
        updatedAt: article.updatedAt || article.createdAt,
        createdAt: article.createdAt,
      }));
  const needsChanges = trackedArticles.filter((article) => article.reviewStatus === "needs_changes");
  const firstName = user?.firstName || "كاتبنا";

  const coachMutation = useMutation({
    mutationFn: () => apiRequest<CoachResult>("/api/opinion-author/idea-coach", { method: "POST", body: JSON.stringify({ idea: ideaInput }) }),
    onSuccess: (result) => setCoachResult(result),
    onError: (error: Error) => toast({ title: "تعذر تطوير الفكرة", description: error.message, variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: (article: Pick<ArticleRow, "id" | "title">) => apiRequest<ReviewResult>("/api/opinion-author/article-review", {
      method: "POST",
      body: JSON.stringify({ articleId: article.id }),
    }),
    onSuccess: (result, article) => {
      setReviewTitle(article.title);
      setReviewResult(result);
    },
    onError: (error: Error) => toast({ title: "تعذرت القراءة الذكية", description: error.message, variant: "destructive" }),
  });

  const submitReviewMutation = useMutation({
    mutationFn: (articleId: string) => apiRequest(`/api/my/articles/${articleId}/submit-review`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/workspace"] });
      toast({ title: "تم الإرسال", description: "وصل المقال إلى فريق التحرير للمراجعة" });
    },
    onError: (error: Error) => toast({ title: "لم يتم الإرسال", description: error.message, variant: "destructive" }),
  });

  const markNotificationReadMutation = useMutation({
    mutationFn: (notificationId: string) => apiRequest(`/api/opinion-author/notifications/${notificationId}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/notifications"] }),
    onError: (error: Error) => toast({ title: "تعذر تحديث التنبيه", description: error.message, variant: "destructive" }),
  });

  const markAllNotificationsReadMutation = useMutation({
    mutationFn: () => apiRequest("/api/opinion-author/notifications/read-all", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/notifications"] }),
    onError: (error: Error) => toast({ title: "تعذر تحديث التنبيهات", description: error.message, variant: "destructive" }),
  });

  const startFromIdea = (idea: WriterIdea) => {
    setIdeaInput(`${idea.title}\n\nالزاوية: ${idea.angle}`);
    setActiveTab("ideas");
  };

  const unreadNotifications = (notificationsQuery.data?.items ?? []).filter((notification) => !notification.readAt);
  const unreadNotificationsCount = notificationsQuery.data?.unread ?? unreadNotifications.length;
  const openEditorialNotification = (notification: EditorialNotification) => {
    markNotificationReadMutation.mutate(notification.id);
    setActiveTab("articles");
    if (notification.articleId) {
      window.setTimeout(() => {
        document.getElementById(`writer-article-${notification.articleId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }
  };

  const trackingCounts = useMemo(() => ({
    pending: trackedArticles.filter((article) => article.reviewStatus === "pending_review").length,
    action: trackedArticles.filter((article) => article.reviewStatus === "needs_changes").length,
    scheduled: trackedArticles.filter((article) => article.status === "scheduled").length,
    declined: trackedArticles.filter((article) => article.reviewStatus === "rejected" || article.status === "archived" || article.status === "rejected").length,
    completed: trackedArticles.filter((article) => article.status === "published").length,
  }), [trackedArticles]);

  return (
    <DashboardLayout>
      <div
        className="relative mt-4 min-h-full w-full overflow-hidden text-right"
        dir="rtl"
        style={{ direction: "rtl" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.06),transparent_55%)]"
        />
        <div className="w-full space-y-5" dir="rtl">
          <section
            className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-l from-primary/5 via-background to-transparent p-5 shadow-sm dark:border-border dark:from-primary/10 dark:via-background dark:to-transparent md:p-6"
            dir="rtl"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-primary/10 blur-3xl dark:bg-primary/15"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-success/10 blur-3xl"
            />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <Badge variant="outline" className="gap-1.5 border-primary/30 bg-background/70 px-3 py-1 text-primary backdrop-blur-sm dark:text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  مساحة الكاتب الذكية
                </Badge>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">
                    {greeting()} يا {firstName}
                  </h1>
                  <p className="mt-2 max-w-2xl text-muted-foreground">
                    فكرتك أولًا، والذكاء يساعدك على تطويرها ويحافظ على صوتك.
                  </p>
                </div>
                {workspace?.desk?.[0] && (
                  <p className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-1.5 text-sm text-foreground/80 backdrop-blur-sm dark:border-border">
                    <Clock3 className="h-4 w-4 text-primary" />
                    أقرب خطوة: {workspace.desk[0].nextAction} في «{workspace.desk[0].title}»
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 lg:pb-1">
                <Button variant="outline" className="gap-2 border-border bg-background/70 backdrop-blur-sm dark:border-border" onClick={() => navigate("/dashboard/opinion-author/guide")}>
                  <BookOpen className="h-4 w-4 text-primary dark:text-primary" /> دليل الكاتب
                </Button>
                <WriterInquiriesButton />
                <Button variant="outline" className="gap-2 border-warning/40 bg-background/70 backdrop-blur-sm dark:border-border" onClick={() => setActiveTab("ideas")}>
                  <Lightbulb className="h-4 w-4 text-warning dark:text-warning" /> ساعدني في اختيار فكرة
                </Button>
                <Button className="gap-2 bg-primary text-white hover:bg-primary/90" onClick={() => navigate("/dashboard/articles/new")}>
                  <PenLine className="h-4 w-4" /> ابدأ الكتابة
                </Button>
              </div>
            </div>
          </section>

          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
            <TabsList dir="rtl" className="grid h-auto w-full grid-cols-4 rounded-xl border border-border bg-primary/5 p-1 shadow-sm dark:border-border dark:bg-primary/10 md:w-fit md:min-w-[520px]">
              <TabsTrigger value="today" className="px-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-white sm:px-3 sm:text-sm">اليوم</TabsTrigger>
              <TabsTrigger value="ideas" className="px-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-white sm:px-3 sm:text-sm">أفكاري</TabsTrigger>
              <TabsTrigger value="articles" className="px-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-white sm:px-3 sm:text-sm"><span className="flex items-center gap-1.5">مقالاتي{unreadNotificationsCount > 0 && <span className="flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-background data-[state=active]:ring-primary">{unreadNotificationsCount > 99 ? "+99" : unreadNotificationsCount}</span>}</span></TabsTrigger>
              <TabsTrigger value="performance" className="px-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-white sm:px-3 sm:text-sm">أدائي</TabsTrigger>
            </TabsList>

            <TabsContent value="today" className="mt-5 space-y-5">
              {unreadNotifications.length > 0 && <EditorialAlertsPanel notifications={unreadNotifications} onOpen={openEditorialNotification} onMarkAll={() => markAllNotificationsReadMutation.mutate()} markingAll={markAllNotificationsReadMutation.isPending} />}
              <div className="grid gap-5 lg:grid-cols-3">
                <Card className="border-border bg-gradient-to-br from-primary/5 via-card to-card shadow-sm dark:border-border dark:from-primary/10 lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/15 p-1.5 text-primary dark:text-primary sm:rounded-xl sm:p-2"><BrainCircuit className="h-4 w-4 sm:h-5 sm:w-5" /></div>
                      <div>
                        <CardTitle>ما الذي يشغلك اليوم؟</CardTitle>
                        <CardDescription>اكتب بذرة الفكرة، وسنساعدك بالأسئلة والخريطة دون كتابة المقال بدلًا عنك.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea value={ideaInput} onChange={(event) => setIdeaInput(event.target.value)} placeholder="مثال: أفكر في الكتابة عن أثر التقنية على علاقتنا بالوقت…" className="min-h-28 resize-none border-border/70 bg-background/70 dark:border-border" />
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={ideaInput.trim().length < 12 || coachMutation.isPending} onClick={() => coachMutation.mutate()} className="gap-2 bg-primary text-white hover:bg-primary/90">
                        {coachMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                        تحدث مع فكرتك
                      </Button>
                      <Button variant="ghost" onClick={() => setActiveTab("ideas")}>افتح استوديو الأفكار <ArrowLeft className="mr-1 h-4 w-4" /></Button>
                    </div>
                    {coachResult && <CoachResultView result={coachResult} compact />}
                  </CardContent>
                </Card>

                <Card className="border-border bg-gradient-to-br from-success/10 via-card to-card shadow-sm dark:border-border dark:from-success/10">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-success dark:text-success sm:h-5 sm:w-5" /> موجزك هذا الشهر</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-6">
                      <Metric value={workspace?.monthlyBrief?.publishedCount ?? 0} label="مقال منشور" accent="emerald" />
                      <Metric value={(workspace?.monthlyBrief?.views ?? 0).toLocaleString()} label="قراءة" accent="sky" />
                    </div>
                    <p className="rounded-lg border border-border bg-background/50 p-3 text-sm leading-7 text-muted-foreground dark:border-border">{workspace?.monthlyBrief?.message || "نجهز موجزك الإبداعي…"}</p>
                  </CardContent>
                </Card>
              </div>

              <section className="space-y-3 rounded-2xl border border-warning/30 bg-gradient-to-l from-warning/[0.08] to-transparent p-4 dark:border-border dark:from-warning/10 md:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">بوصلة الأفكار</h2>
                    <p className="text-sm text-muted-foreground">ثلاث فرص منتقاة لك، وليست قائمة أخبار عامة.</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => ideasQuery.refetch()} disabled={ideasQuery.isFetching} className="gap-1.5 text-warning hover:bg-warning/10 dark:text-warning dark:hover:bg-warning/10"><RefreshCw className={`h-4 w-4 ${ideasQuery.isFetching ? "animate-spin" : ""}`} /> تحديث</Button>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {ideasQuery.isLoading ? [0, 1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl bg-warning/10 dark:bg-warning/10" />) : ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} onStart={() => startFromIdea(idea)} />)}
                </div>
              </section>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="border-border bg-gradient-to-br from-primary/5 via-card to-card dark:border-border dark:from-primary/10">
                  <CardHeader><CardTitle className="flex items-center gap-2"><span className="rounded-md bg-primary/10 p-1 dark:bg-primary/15 sm:rounded-lg sm:p-1.5"><Feather className="h-4 w-4 text-primary dark:text-primary sm:h-5 sm:w-5" /></span> على مكتبك الآن</CardTitle><CardDescription>الأهم أولًا، بلا ازدحام.</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    {workspaceQuery.isLoading ? <div className="h-32 animate-pulse rounded-xl bg-primary/10 dark:bg-primary/10" /> : workspace?.desk?.length ? workspace.desk.map((item) => (
                      <button key={item.id} onClick={() => navigate(`/dashboard/articles/${item.id}/edit`)} className="flex w-full items-start justify-between gap-3 rounded-xl border border-border/70 bg-background/80 p-3 text-right transition-colors hover:border-primary/40 hover:bg-primary/5 dark:border-border dark:hover:bg-primary/10">
                        <div className="min-w-0"><p className="line-clamp-1 font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.nextAction}</p></div>
                        <ArrowLeft className="mt-1 h-4 w-4 shrink-0 text-primary/70" />
                      </button>
                    )) : <EmptyState icon={CheckCircle2} title="مكتبك مرتب" text="لا توجد مسودات أو ملاحظات تنتظر إجراءك." tone="sky" />}
                  </CardContent>
                </Card>

                <Card className="border-border bg-gradient-to-br from-primary/5 via-card to-card dark:border-border dark:from-primary/10">
                  <CardHeader><CardTitle className="flex items-center gap-2"><span className="rounded-md bg-primary/10 p-1 dark:bg-primary/15 sm:rounded-lg sm:p-1.5"><Users className="h-4 w-4 text-primary dark:text-primary sm:h-5 sm:w-5" /></span> نبض قرائك</CardTitle><CardDescription>{workspace?.readerPulse?.message}</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3"><Metric value={workspace?.readerPulse?.commentsCount ?? 0} label="تعليق حديث" accent="teal" /><Metric value={`${workspace?.readerPulse?.positiveShare ?? 0}%`} label="نبض إيجابي" accent="emerald" /></div>
                    {workspace?.readerPulse?.highlightedComment && <blockquote className="rounded-xl border-r-4 border-primary bg-primary/5 p-4 text-sm leading-7 dark:bg-primary/10"><p>«{workspace.readerPulse.highlightedComment.content}»</p><footer className="mt-2 text-xs text-muted-foreground">حول: {workspace.readerPulse.highlightedComment.articleTitle}</footer></blockquote>}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="border-warning/30 bg-gradient-to-br from-warning/[0.08] via-card to-card dark:border-border dark:from-warning/10">
                  <CardHeader><CardTitle className="flex items-center gap-2"><span className="rounded-md bg-warning/15 p-1 dark:bg-warning/15 sm:rounded-lg sm:p-1.5"><Target className="h-4 w-4 text-warning dark:text-warning sm:h-5 sm:w-5" /></span> فرصة متابعة</CardTitle></CardHeader>
                  <CardContent>{workspace?.followUp ? <div className="space-y-3"><p className="font-medium">{workspace.followUp.title}</p><p className="text-sm leading-7 text-muted-foreground">{workspace.followUp.prompt}</p><Button variant="outline" size="sm" className="border-warning/40 dark:border-border" onClick={() => { setIdeaInput(workspace.followUp?.prompt || ""); setActiveTab("ideas"); }}>طوّر المتابعة</Button></div> : <EmptyState icon={Target} title="ستظهر هنا فرصة المتابعة" text="بعد نشر مقالك الأول وبدء تفاعل القراء." tone="amber" />}</CardContent>
                </Card>
                <Card className="border-slate-200/70 bg-gradient-to-br from-slate-50/60 via-card to-card dark:border-slate-800/60 dark:from-slate-950/30">
                  <CardHeader><CardTitle className="flex items-center gap-2"><span className="rounded-md bg-slate-100/80 p-1 dark:bg-slate-800/60 sm:rounded-lg sm:p-1.5"><CalendarDays className="h-4 w-4 text-slate-600 dark:text-slate-300 sm:h-5 sm:w-5" /></span> تقويم الإلهام</CardTitle></CardHeader>
                  <CardContent className="space-y-3">{workspace?.calendar?.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border-b border-slate-100 py-2 last:border-0 dark:border-slate-800/60"><span className="text-sm font-medium">{item.name}</span><span className="rounded-md bg-slate-100/80 px-2 py-0.5 text-xs text-muted-foreground dark:bg-slate-800/50">{formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: ar })}</span></div>)}</CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="ideas" className="mt-5 space-y-5">
              <div className="grid gap-5 lg:grid-cols-3">
                <Card className="border-border bg-gradient-to-br from-primary/5 via-card to-card dark:border-border dark:from-primary/10 lg:col-span-2">
                  <CardHeader><CardTitle className="flex items-center gap-2"><span className="rounded-md bg-primary/15 p-1 sm:rounded-lg sm:p-1.5"><BrainCircuit className="h-4 w-4 text-primary dark:text-primary sm:h-5 sm:w-5" /></span> استوديو الفكرة</CardTitle><CardDescription>فكّر بصوت مرتفع. المساعد يسأل ويرتب، وأنت صاحب الموقف والنص.</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea value={ideaInput} onChange={(event) => setIdeaInput(event.target.value)} className="min-h-36 border-border/70 bg-background/70 dark:border-border" placeholder="اكتب الفكرة أو السؤال أو الموقف الذي تريد اختباره…" />
                    <Button onClick={() => coachMutation.mutate()} disabled={ideaInput.trim().length < 12 || coachMutation.isPending} className="gap-2 bg-primary text-white hover:bg-primary/90"><WandSparkles className="h-4 w-4" /> ابنِ خريطة الفكرة</Button>
                    {coachResult && <CoachResultView result={coachResult} />}
                  </CardContent>
                </Card>
                <StyleProfileCard profile={styleQuery.data} loading={styleQuery.isLoading} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">{ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} onStart={() => startFromIdea(idea)} />)}</div>
            </TabsContent>

            <TabsContent value="articles" className="mt-5 space-y-5">
              {unreadNotifications.length > 0 && <EditorialAlertsPanel notifications={unreadNotifications} onOpen={openEditorialNotification} onMarkAll={() => markAllNotificationsReadMutation.mutate()} markingAll={markAllNotificationsReadMutation.isPending} />}
              <div className="rounded-2xl border border-border bg-gradient-to-l from-primary/5 to-transparent p-4 dark:border-border dark:from-primary/10 md:p-5">
                <h2 className="text-2xl font-bold">متابعة مقالاتي</h2>
                <p className="mt-1 text-sm text-muted-foreground">كل قرار تحريري وسببه وموعده في مكان واحد. تتحدث اللوحة تلقائيًا.</p>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <TrackingMetric icon={Clock3} label="تحت المراجعة" value={trackingCounts.pending} />
                <TrackingMetric icon={Edit3} label="تحتاج إجراءك" value={trackingCounts.action} tone="warning" />
                <TrackingMetric icon={CalendarClock} label="مجدولة" value={trackingCounts.scheduled} tone="info" />
                <TrackingMetric icon={CircleX} label="غير صالحة للنشر" value={trackingCounts.declined} tone="danger" />
                <TrackingMetric icon={CheckCircle2} label="منشورة" value={trackingCounts.completed} tone="success" />
              </div>
              {needsChanges.length > 0 && <Card className="border-warning/50 bg-warning/10 dark:bg-warning/10"><CardHeader><CardTitle className="text-warning dark:text-warning">مقالات تحتاج لمستك ({needsChanges.length})</CardTitle><CardDescription>ملاحظات التحرير ظاهرة أسفل كل مقال ويمكنك العودة للتعديل مباشرة.</CardDescription></CardHeader></Card>}
              <div className="space-y-3">
                {workspaceQuery.isLoading ? [0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-muted" />) : trackedArticles.map((article) => <WriterTrackingCard key={article.id} article={article} onEdit={() => navigate(`/dashboard/articles/${article.id}/edit`)} onView={() => navigate(`/article/${article.id}`)} onReview={() => reviewMutation.mutate(article)} reviewPending={reviewMutation.isPending} submitPending={submitReviewMutation.isPending} onSubmit={(id) => submitReviewMutation.mutate(id)} />)}
                {!workspaceQuery.isLoading && trackedArticles.length === 0 && <EmptyState icon={Feather} title="هنا تبدأ الحكاية" text="أنشئ مقالك الأول، وسنرافقك من الفكرة حتى النشر." tone="sky" />}
              </div>
            </TabsContent>

            <TabsContent value="performance" className="mt-5 space-y-5">
              <div className="rounded-2xl border border-border bg-gradient-to-l from-success/[0.06] to-transparent p-4 dark:border-border dark:from-success/10 md:p-5">
                <h2 className="text-2xl font-bold">أثر كتابتك</h2>
                <p className="text-muted-foreground">أرقام مفهومة تساعدك على القرار، لا مجرد لوحة مؤشرات.</p>
              </div>
              <ContributorStatsRow totalViews={analytics?.totalViews ?? 0} totalLikes={analytics?.totalLikes ?? 0} totalComments={analytics?.totalComments ?? 0} totalBookmarks={analytics?.totalBookmarks ?? 0} comparison={analytics?.comparison} loading={analyticsQuery.isLoading} />
              <div className="grid gap-4 md:grid-cols-3"><ArticleStatusBreakdown published={analytics?.publishedArticles ?? 0} draft={analytics?.draftArticles ?? 0} pending={analytics?.pendingArticles ?? 0} needsChanges={analytics?.needsChangesArticles ?? 0} rejected={analytics?.rejectedArticles ?? 0} loading={analyticsQuery.isLoading} /><MonthComparisonCard comparison={analytics?.comparison ?? EMPTY_COMPARISON} loading={analyticsQuery.isLoading} /><BestArticleCard article={analytics?.bestArticleThisWeek ?? null} loading={analyticsQuery.isLoading} onNavigate={(id) => navigate(`/article/${id}`)} /></div>
              <PerformanceChart dailyStats={analytics?.dailyStats ?? []} loading={analyticsQuery.isLoading} />
              <div className="grid gap-4 lg:grid-cols-3"><div className="lg:col-span-2"><EngagementTable articles={analytics?.topArticles ?? []} loading={analyticsQuery.isLoading} onNavigate={(id) => navigate(`/article/${id}`)} /></div><FeaturedCommentCard comment={analytics?.featuredComment ?? null} loading={analyticsQuery.isLoading} onNavigate={(id) => navigate(`/article/${id}`)} /></div>
              <div className="grid gap-4 md:grid-cols-2"><FollowerCard count={analytics?.followers?.count ?? 0} dailyGrowth={analytics?.followers?.dailyGrowth ?? []} loading={analyticsQuery.isLoading} /><PublishingActivityCard lastPublishedAt={analytics?.publishingActivity?.lastPublishedAt ?? null} daysSinceLastPublished={analytics?.publishingActivity?.daysSinceLastPublished ?? null} thisWeekCount={analytics?.publishingActivity?.thisWeekCount ?? 0} thisMonthCount={analytics?.publishingActivity?.thisMonthCount ?? 0} loading={analyticsQuery.isLoading} /></div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={Boolean(reviewResult)} onOpenChange={(open) => !open && setReviewResult(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-primary sm:h-5 sm:w-5" /> قارئ سبق الأول</DialogTitle><DialogDescription>{reviewTitle} — الملاحظات اقتراحات اختيارية، وأنت صاحب النص النهائي.</DialogDescription></DialogHeader>
          {reviewResult && <ReviewResultView result={reviewResult} />}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function Metric({ value, label, accent = "default" }: { value: string | number; label: string; accent?: "default" | "sky" | "emerald" | "teal" | "amber" }) {
  const accents = {
    default: "text-foreground",
    sky: "text-primary",
    emerald: "text-success dark:text-success",
    teal: "text-primary dark:text-primary",
    amber: "text-warning dark:text-warning",
  };
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <p className={`text-2xl font-bold tabular-nums ${accents[accent]}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text, tone = "default" }: { icon: typeof Feather; title: string; text: string; tone?: "default" | "sky" | "amber" }) {
  const tones = {
    default: "border-border bg-muted/20",
    sky: "border-border bg-primary/5 dark:border-border dark:bg-primary/10",
    amber: "border-warning/35 bg-warning/[0.08] dark:border-border dark:bg-warning/10",
  };
  const iconTones = {
    default: "text-muted-foreground",
    sky: "text-primary",
    amber: "text-warning dark:text-warning",
  };
  return (
    <div className={`rounded-xl border border-dashed p-6 text-center ${tones[tone]}`}>
      <Icon className={`mx-auto mb-2 h-5 w-5 sm:h-6 sm:w-6 ${iconTones[tone]}`} />
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function TrackingMetric({ icon: Icon, label, value, tone = "default" }: { icon: typeof Feather; label: string; value: number; tone?: "default" | "warning" | "info" | "success" | "danger" }) {
  const tones = {
    default: "border-border bg-primary/5 text-foreground dark:border-border dark:bg-primary/10 dark:text-foreground",
    warning: "border-warning/35 bg-warning/10 text-warning dark:border-border dark:bg-warning/10 dark:text-warning",
    info: "border-border bg-primary/5 text-primary dark:border-border dark:bg-primary/10 dark:text-foreground",
    success: "border-border bg-success/10 text-success dark:border-border dark:bg-success/10 dark:text-success",
    danger: "border-red-200/70 bg-red-50/70 text-red-900 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-100",
  };
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-3.5 w-3.5 opacity-70 sm:h-4 sm:w-4" />
        <span className="text-2xl font-bold tabular-nums">{value}</span>
      </div>
      <p className="mt-2 text-xs font-medium opacity-80">{label}</p>
    </div>
  );
}

function editorialNotificationStyle(type: EditorialNotification["type"]) {
  if (type === "published") return { icon: CheckCircle2, label: "تم النشر", item: "border-border bg-success/10 dark:border-border dark:bg-success/10", iconClass: "text-success dark:text-success" };
  if (type === "scheduled") return { icon: CalendarClock, label: "تمت الجدولة", item: "border-border bg-primary/5 dark:border-border dark:bg-primary/10", iconClass: "text-primary dark:text-primary" };
  if (type === "needs_revision") return { icon: Edit3, label: "ملاحظات تحريرية", item: "border-warning/40 bg-warning/10 dark:border-border dark:bg-warning/10", iconClass: "text-warning dark:text-warning" };
  return { icon: CircleX, label: type === "deleted" ? "حُذف نهائيًا" : "غير صالح للنشر", item: "border-red-200 bg-red-50/55 dark:border-red-900/40 dark:bg-red-950/10", iconClass: "text-red-700 dark:text-red-300" };
}

function EditorialAlertsPanel({ notifications, onOpen, onMarkAll, markingAll }: { notifications: EditorialNotification[]; onOpen: (notification: EditorialNotification) => void; onMarkAll: () => void; markingAll: boolean }) {
  return <Card className="border-red-200/80 shadow-sm dark:border-red-900/40"><CardHeader className="pb-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-lg"><span className="relative"><BellRing className="h-4 w-4 text-red-600 sm:h-5 sm:w-5" /><span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-600 ring-2 ring-background" /></span>لديك تحديثات على مقالاتك</CardTitle><CardDescription className="mt-1">افتح التنبيه لعرض المقال والتفاصيل، ولن يختفي قبل قراءته.</CardDescription></div><Button variant="ghost" size="sm" onClick={onMarkAll} disabled={markingAll} className="w-full gap-1.5 sm:w-auto"><CheckCheck className="h-4 w-4" /> تحديد الكل كمقروء</Button></div></CardHeader><CardContent className="grid gap-2 md:grid-cols-2">{notifications.slice(0, 4).map((notification) => { const style = editorialNotificationStyle(notification.type); const Icon = style.icon; return <button key={notification.id} type="button" onClick={() => onOpen(notification)} className={`w-full rounded-xl border p-3 text-right transition-transform hover:-translate-y-0.5 ${style.item}`}><div className="flex items-start gap-3"><span className="mt-0.5 rounded-md bg-background/80 p-1.5 sm:rounded-lg sm:p-2"><Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${style.iconClass}`} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{style.label}</span><span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: ar })}</span></div><p className="mt-1 line-clamp-1 text-sm font-medium">{notification.articleTitle || notification.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.reviewerNote || notification.body}</p></div><ArrowLeft className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" /></div></button>; })}</CardContent></Card>;
}

function trackingState(article: TrackingArticle) {
  if (article.status === "published") return { label: "تم النشر", description: "المقال متاح الآن للقراء.", icon: CheckCircle2, tone: "success" as const, dateLabel: "نُشر في", date: article.publishedAt };
  if (article.status === "scheduled") return { label: "مجدول للنشر", description: "اعتمد فريق التحرير المقال وحدد موعد نشره.", icon: CalendarClock, tone: "info" as const, dateLabel: "موعد النشر", date: article.scheduledAt };
  if (article.reviewStatus === "rejected" || article.status === "archived" || article.status === "rejected") return { label: "غير صالح للنشر", description: "أنهى فريق التحرير مراجعة المقال وقرر عدم نشره.", icon: CircleX, tone: "danger" as const, dateLabel: "صدر القرار في", date: article.reviewedAt || article.updatedAt };
  if (article.reviewStatus === "needs_changes") return { label: "عليه ملاحظات", description: "أعاد فريق التحرير المقال إليك لإجراء تعديلات محددة.", icon: Edit3, tone: "warning" as const, dateLabel: "وصلت الملاحظات في", date: article.reviewedAt || article.updatedAt };
  if (article.reviewStatus === "pending_review") return { label: "تحت المراجعة", description: "وصل المقال إلى فريق التحرير، ولا يحتاج منك إجراء الآن.", icon: Clock3, tone: "default" as const, dateLabel: "آخر تحديث", date: article.updatedAt };
  if (article.reviewStatus === "approved") return { label: "معتمد", description: "اعتمد فريق التحرير المقال وهو الآن بانتظار تحديد موعد النشر.", icon: FileCheck2, tone: "success" as const, dateLabel: "تم الاعتماد في", date: article.reviewedAt || article.updatedAt };
  return { label: "مسودة", description: "المقال محفوظ لديك ولم يُرسل إلى فريق التحرير بعد.", icon: Feather, tone: "default" as const, dateLabel: "آخر تعديل", date: article.updatedAt };
}

function WriterTrackingCard({ article, onEdit, onView, onReview, reviewPending, submitPending, onSubmit }: { article: TrackingArticle; onEdit: () => void; onView: () => void; onReview: () => void; reviewPending: boolean; submitPending: boolean; onSubmit: (id: string) => void }) {
  const state = trackingState(article);
  const StateIcon = state.icon;
  const isInvalid = state.tone === "danger";
  const needsChanges = article.reviewStatus === "needs_changes";
  const isPlainDraft = article.status === "draft" && !article.reviewStatus;
  const toneClasses = {
    default: "border-border bg-card",
    warning: "border-warning/50 bg-warning/[0.08] dark:border-border dark:bg-warning/10",
    info: "border-primary/30 bg-primary/5 dark:border-border dark:bg-primary/10",
    success: "border-success/40 bg-success/[0.08] dark:border-border dark:bg-success/10",
    danger: "border-border bg-card",
  };
  const badgeClasses = {
    default: "bg-muted text-foreground",
    warning: "bg-warning/15 text-warning dark:bg-warning/15 dark:text-warning",
    info: "bg-primary/10 text-primary dark:bg-primary/15 dark:text-foreground",
    success: "bg-success/15 text-success dark:bg-success/15 dark:text-success",
    danger: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  };

  return <Card id={`writer-article-${article.id}`} className={toneClasses[state.tone]}><CardContent className="space-y-4 p-4 md:p-5"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold leading-7">{article.title}</h3><Badge className={`gap-1.5 border-0 ${badgeClasses[state.tone]}`}><StateIcon className="h-3.5 w-3.5" />{state.label}</Badge></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{state.description}</p>{state.date && <p className="mt-1 text-xs text-muted-foreground">{state.dateLabel}: {format(new Date(state.date), "d MMMM yyyy، h:mm a", { locale: ar })}</p>}</div><div className="flex shrink-0 flex-wrap gap-2">{(isPlainDraft || needsChanges) && <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5"><Edit3 className="h-4 w-4" /> تعديل المقال</Button>}{isPlainDraft && <Button variant="secondary" size="sm" onClick={onReview} disabled={reviewPending} className="gap-1.5"><BrainCircuit className="h-4 w-4" /> قارئ سبق الأول</Button>}{(isPlainDraft || needsChanges) && <SubmitRevisionButton article={article} isPending={submitPending} onSubmit={onSubmit} />}{article.status === "published" && <Button variant="outline" size="sm" onClick={onView}>عرض المقال</Button>}</div></div>{needsChanges && article.reviewNotes && <EditorialChecklist notes={article.reviewNotes} />}{isInvalid && <div className="rounded-xl border border-red-200 bg-background/70 p-3 dark:border-red-900/40"><p className="text-xs font-semibold text-red-900 dark:text-red-100">سبب عدم النشر</p><p className="mt-1 text-sm leading-6 text-red-900/80 dark:text-red-100/80">{article.reviewNotes?.trim() || "لم يسجل فريق التحرير سببًا لهذا القرار. يرجى التواصل عبر الاستفسارات."}</p></div>}{!needsChanges && !isInvalid && article.reviewNotes && article.reviewStatus !== "pending_review" && <div className="rounded-xl border bg-background/70 p-3"><p className="text-xs font-semibold">ملاحظة فريق التحرير</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{article.reviewNotes}</p></div>}</CardContent></Card>;
}

function IdeaCard({ idea, onStart }: { idea: WriterIdea; onStart: () => void }) {
  const labels = { specialty: "قريب من صوتك", follow_up: "فرصة متابعة", timely: "توقيت مناسب" };
  const kindStyles = {
    specialty: {
      card: "border-border hover:border-primary/40 dark:border-border",
      bar: "bg-primary",
      badge: "border-primary/25 bg-primary/5 text-primary dark:text-primary",
      why: "bg-primary/5 dark:bg-primary/10",
    },
    follow_up: {
      card: "border-border hover:border-primary/40 dark:border-border",
      bar: "bg-primary/50",
      badge: "border-primary/30 bg-primary/5 text-primary dark:border-border dark:bg-primary/10 dark:text-primary",
      why: "bg-primary/5 dark:bg-primary/10",
    },
    timely: {
      card: "border-warning/35 hover:border-warning/50 dark:border-border",
      bar: "bg-warning",
      badge: "border-warning/40 bg-warning/10 text-warning dark:border-border dark:bg-warning/15 dark:text-warning",
      why: "bg-warning/10 dark:bg-warning/10",
    },
  } as const;
  const style = kindStyles[idea.kind];
  return (
    <Card className={`group overflow-hidden bg-card/90 transition-all hover:shadow-sm ${style.card}`}>
      <div className={`h-1 ${style.bar}`} />
      <CardHeader>
        <Badge variant="outline" className={`w-fit ${style.badge}`}>{labels[idea.kind]}</Badge>
        <CardTitle className="text-lg leading-7">{idea.title}</CardTitle>
        <CardDescription className="leading-6">{idea.angle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`rounded-lg p-3 text-sm ${style.why}`}><span className="font-medium">لماذا الآن؟ </span>{idea.whyNow}</div>
        <p className="text-xs text-muted-foreground">الجمهور المتوقع: {idea.audience}</p>
        <Button variant="outline" className="w-full gap-2" onClick={onStart}>طوّر هذه الفكرة <ArrowLeft className="h-4 w-4" /></Button>
      </CardContent>
    </Card>
  );
}

function CoachResultView({ result, compact = false }: { result: CoachResult; compact?: boolean }) {
  return <div className="mt-4 space-y-4 rounded-2xl border border-primary/20 bg-primary/[0.035] p-4"><div className="flex items-center gap-2 font-semibold text-primary dark:text-primary"><Sparkles className="h-4 w-4" /> خريطة الفكرة</div>{result.reflection && <p className="text-sm leading-7">{result.reflection}</p>}<div className={`grid gap-4 ${compact ? "md:grid-cols-2" : ""}`}>{result.questions?.length ? <ResultList title="أسئلة تستحق الإجابة" items={result.questions} /> : null}{result.thesisOptions?.length ? <ResultList title="مواقف محتملة" items={result.thesisOptions} /> : null}{!compact && result.outline?.length ? <ResultList title="بناء مقترح" items={result.outline} /> : null}{!compact && result.sourcesToSeek?.length ? <ResultList title="ما الذي يحتاج تحققًا؟" items={result.sourcesToSeek} /> : null}</div>{result.counterpoint && <div className="rounded-lg border-r-4 border-primary bg-background p-3 text-sm"><span className="font-medium">الرأي المقابل: </span>{result.counterpoint}</div>}<Button size="sm" className="gap-2" onClick={() => window.location.assign("/dashboard/articles/new")}><PenLine className="h-4 w-4" /> ابدأ مسودة بصوتك</Button></div>;
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return <div><h4 className="mb-2 text-sm font-semibold">{title}</h4><ul className="space-y-2">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-6 text-muted-foreground"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{item}</li>)}</ul></div>;
}

function EditorialChecklist({ notes }: { notes: string }) {
  const items = notes.split(/\n|[•؛]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
  return <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 dark:border-border dark:bg-warning/10"><p className="mb-2 text-xs font-semibold text-warning dark:text-warning">خطة ملاحظات التحرير</p><ul className="space-y-1.5">{items.map((item, index) => <li key={`${item}-${index}`} className="flex items-start gap-2 text-xs leading-5 text-warning dark:text-warning"><span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-warning bg-background" />{item}</li>)}</ul></div>;
}

function StyleProfileCard({ profile, loading }: { profile?: Record<string, unknown>; loading: boolean }) {
  const traits = Array.isArray(profile?.traits) ? profile.traits.filter((item): item is string => typeof item === "string") : [];
  const guidance = Array.isArray(profile?.guidance) ? profile.guidance.filter((item): item is string => typeof item === "string") : [];
  return (
    <Card className="border-border bg-gradient-to-br from-primary/5 via-card to-card dark:border-border dark:from-primary/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 p-1 dark:bg-primary/15 sm:rounded-lg sm:p-1.5">
            <Feather className="h-4 w-4 text-primary dark:text-primary sm:h-5 sm:w-5" />
          </span>
          بصمتك الكتابية
        </CardTitle>
        <CardDescription>ذاكرة تحترم صوتك ولا تستنسخه.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="h-32 animate-pulse rounded-xl bg-primary/10 dark:bg-primary/10" />
        ) : profile?.ready === false ? (
          <p className="text-sm text-muted-foreground">{String(profile.message || "تُبنى بعد نشر أول مقال.")}</p>
        ) : (
          <>
            <p className="text-sm leading-7">{String(profile?.signature || "صوتك يتضح أكثر مع كل مقال.")}</p>
            <div className="flex flex-wrap gap-2">
              {traits.map((trait) => (
                <Badge key={trait} variant="outline" className="border-border bg-background/70 dark:border-border">{trait}</Badge>
              ))}
            </div>
            <ResultList title="إشارات تحافظ على صوتك" items={guidance} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewResultView({ result }: { result: ReviewResult }) {
  const score = Math.max(0, Math.min(100, result.overallScore ?? 0));
  return <div className="space-y-5"><div className="rounded-2xl border bg-muted/25 p-4"><div className="mb-2 flex items-center justify-between"><span className="font-semibold">جاهزية القراءة</span><span className="text-2xl font-bold text-primary">{score}%</span></div><Progress value={score} /><p className="mt-3 text-sm leading-7 text-muted-foreground">{result.summary}</p></div><div className="grid gap-3 md:grid-cols-2">{result.checks?.map((check) => <div key={check.key} className="rounded-xl border p-3"><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">{check.label}</span><span className="text-sm font-bold">{check.score}%</span></div><Progress value={check.score} className="h-1.5" /><p className="mt-2 text-xs leading-5 text-muted-foreground">{check.note}</p></div>)}</div>{result.strengths?.length ? <ResultList title="نقاط القوة" items={result.strengths} /> : null}{result.headlineSuggestions?.length ? <ResultList title="عناوين تستحق التجربة" items={result.headlineSuggestions} /> : null}{result.sourceFlags?.length ? <ResultList title="مواضع تحتاج مصدرًا" items={result.sourceFlags} /> : null}{result.sensitiveClaims?.length ? <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 dark:bg-warning/10"><ResultList title="ادعاءات حساسة تحتاج مراجعة بشرية" items={result.sensitiveClaims} /></div> : null}</div>;
}
