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
      <div className="mt-4 min-h-full w-full bg-background text-right" dir="rtl" style={{ direction: "rtl" }}>
        <div className="w-full space-y-5" dir="rtl">
          <section className="border-b border-border pb-5 md:pb-6" dir="rtl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <Badge variant="outline" className="gap-1.5 border-[#1BADF8]/30 bg-[#1BADF8]/5 px-3 py-1 text-[#078fd1] dark:text-[#45c0f5]">
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
                  <p className="flex items-center gap-2 text-sm text-foreground/75">
                    <Clock3 className="h-4 w-4 text-[#1BADF8]" />
                    أقرب خطوة: {workspace.desk[0].nextAction} في «{workspace.desk[0].title}»
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 lg:pb-1">
                <Button variant="outline" className="gap-2" onClick={() => navigate("/dashboard/opinion-author/guide")}>
                  <BookOpen className="h-4 w-4" /> دليل الكاتب
                </Button>
                <WriterInquiriesButton />
                <Button variant="outline" className="gap-2" onClick={() => setActiveTab("ideas")}>
                  <Lightbulb className="h-4 w-4" /> ساعدني في اختيار فكرة
                </Button>
                <Button className="gap-2" onClick={() => navigate("/dashboard/articles/new")}>
                  <PenLine className="h-4 w-4" /> ابدأ الكتابة
                </Button>
              </div>
            </div>
          </section>

          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
            <TabsList dir="rtl" className="grid h-auto w-full grid-cols-4 rounded-xl border bg-card p-1 shadow-sm md:w-fit md:min-w-[520px]">
              <TabsTrigger value="today" className="px-1 text-xs data-[state=active]:bg-[#1BADF8] data-[state=active]:text-white sm:px-3 sm:text-sm">اليوم</TabsTrigger>
              <TabsTrigger value="ideas" className="px-1 text-xs data-[state=active]:bg-[#1BADF8] data-[state=active]:text-white sm:px-3 sm:text-sm">أفكاري</TabsTrigger>
              <TabsTrigger value="articles" className="px-1 text-xs data-[state=active]:bg-[#1BADF8] data-[state=active]:text-white sm:px-3 sm:text-sm"><span className="flex items-center gap-1.5">مقالاتي{unreadNotificationsCount > 0 && <span className="flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-background data-[state=active]:ring-[#1BADF8]">{unreadNotificationsCount > 99 ? "+99" : unreadNotificationsCount}</span>}</span></TabsTrigger>
              <TabsTrigger value="performance" className="px-1 text-xs data-[state=active]:bg-[#1BADF8] data-[state=active]:text-white sm:px-3 sm:text-sm">أدائي</TabsTrigger>
            </TabsList>

            <TabsContent value="today" className="mt-5 space-y-5">
              {unreadNotifications.length > 0 && <EditorialAlertsPanel notifications={unreadNotifications} onOpen={openEditorialNotification} onMarkAll={() => markAllNotificationsReadMutation.mutate()} markingAll={markAllNotificationsReadMutation.isPending} />}
              <div className="grid gap-5 lg:grid-cols-3">
                <Card className="border-primary/15 shadow-sm lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-primary/10 p-2 text-primary"><BrainCircuit className="h-5 w-5" /></div>
                      <div>
                        <CardTitle>ما الذي يشغلك اليوم؟</CardTitle>
                        <CardDescription>اكتب بذرة الفكرة، وسنساعدك بالأسئلة والخريطة دون كتابة المقال بدلًا عنك.</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea value={ideaInput} onChange={(event) => setIdeaInput(event.target.value)} placeholder="مثال: أفكر في الكتابة عن أثر التقنية على علاقتنا بالوقت…" className="min-h-28 resize-none bg-muted/20" />
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={ideaInput.trim().length < 12 || coachMutation.isPending} onClick={() => coachMutation.mutate()} className="gap-2">
                        {coachMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                        تحدث مع فكرتك
                      </Button>
                      <Button variant="ghost" onClick={() => setActiveTab("ideas")}>افتح استوديو الأفكار <ArrowLeft className="mr-1 h-4 w-4" /></Button>
                    </div>
                    {coachResult && <CoachResultView result={coachResult} compact />}
                  </CardContent>
                </Card>

                <Card className="border-[#1BADF8]/20 bg-card shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-[#1BADF8]" /> موجزك هذا الشهر</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-6">
                      <Metric value={workspace?.monthlyBrief?.publishedCount ?? 0} label="مقال منشور" />
                      <Metric value={(workspace?.monthlyBrief?.views ?? 0).toLocaleString()} label="قراءة" />
                    </div>
                    <p className="text-sm leading-7 text-muted-foreground">{workspace?.monthlyBrief?.message || "نجهز موجزك الإبداعي…"}</p>
                  </CardContent>
                </Card>
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div><h2 className="text-xl font-semibold">بوصلة الأفكار</h2><p className="text-sm text-muted-foreground">ثلاث فرص منتقاة لك، وليست قائمة أخبار عامة.</p></div>
                  <Button variant="ghost" size="sm" onClick={() => ideasQuery.refetch()} disabled={ideasQuery.isFetching} className="gap-1.5"><RefreshCw className={`h-4 w-4 ${ideasQuery.isFetching ? "animate-spin" : ""}`} /> تحديث</Button>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  {ideasQuery.isLoading ? [0, 1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl bg-muted" />) : ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} onStart={() => startFromIdea(idea)} />)}
                </div>
              </section>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Feather className="h-5 w-5 text-primary" /> على مكتبك الآن</CardTitle><CardDescription>الأهم أولًا، بلا ازدحام.</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    {workspaceQuery.isLoading ? <div className="h-32 animate-pulse rounded-xl bg-muted" /> : workspace?.desk?.length ? workspace.desk.map((item) => (
                      <button key={item.id} onClick={() => navigate(`/dashboard/articles/${item.id}/edit`)} className="flex w-full items-start justify-between gap-3 rounded-xl border bg-background p-3 text-right transition-colors hover:border-primary/30 hover:bg-primary/[0.03]">
                        <div className="min-w-0"><p className="line-clamp-1 font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.nextAction}</p></div>
                        <ArrowLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    )) : <EmptyState icon={CheckCircle2} title="مكتبك مرتب" text="لا توجد مسودات أو ملاحظات تنتظر إجراءك." />}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> نبض قرائك</CardTitle><CardDescription>{workspace?.readerPulse?.message}</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3"><Metric value={workspace?.readerPulse?.commentsCount ?? 0} label="تعليق حديث" /><Metric value={`${workspace?.readerPulse?.positiveShare ?? 0}%`} label="نبض إيجابي" /></div>
                    {workspace?.readerPulse?.highlightedComment && <blockquote className="rounded-xl border-r-4 border-primary bg-muted/40 p-4 text-sm leading-7"><p>«{workspace.readerPulse.highlightedComment.content}»</p><footer className="mt-2 text-xs text-muted-foreground">حول: {workspace.readerPulse.highlightedComment.articleTitle}</footer></blockquote>}
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="border-primary/15">
                  <CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> فرصة متابعة</CardTitle></CardHeader>
                  <CardContent>{workspace?.followUp ? <div className="space-y-3"><p className="font-medium">{workspace.followUp.title}</p><p className="text-sm leading-7 text-muted-foreground">{workspace.followUp.prompt}</p><Button variant="outline" size="sm" onClick={() => { setIdeaInput(workspace.followUp?.prompt || ""); setActiveTab("ideas"); }}>طوّر المتابعة</Button></div> : <EmptyState icon={Target} title="ستظهر هنا فرصة المتابعة" text="بعد نشر مقالك الأول وبدء تفاعل القراء." />}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> تقويم الإلهام</CardTitle></CardHeader>
                  <CardContent className="space-y-3">{workspace?.calendar?.map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border-b py-2 last:border-0"><span className="text-sm font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: ar })}</span></div>)}</CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="ideas" className="mt-5 space-y-5">
              <div className="grid gap-5 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" /> استوديو الفكرة</CardTitle><CardDescription>فكّر بصوت مرتفع. المساعد يسأل ويرتب، وأنت صاحب الموقف والنص.</CardDescription></CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea value={ideaInput} onChange={(event) => setIdeaInput(event.target.value)} className="min-h-36" placeholder="اكتب الفكرة أو السؤال أو الموقف الذي تريد اختباره…" />
                    <Button onClick={() => coachMutation.mutate()} disabled={ideaInput.trim().length < 12 || coachMutation.isPending} className="gap-2"><WandSparkles className="h-4 w-4" /> ابنِ خريطة الفكرة</Button>
                    {coachResult && <CoachResultView result={coachResult} />}
                  </CardContent>
                </Card>
                <StyleProfileCard profile={styleQuery.data} loading={styleQuery.isLoading} />
              </div>
              <div className="grid gap-4 md:grid-cols-3">{ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} onStart={() => startFromIdea(idea)} />)}</div>
            </TabsContent>

            <TabsContent value="articles" className="mt-5 space-y-5">
              {unreadNotifications.length > 0 && <EditorialAlertsPanel notifications={unreadNotifications} onOpen={openEditorialNotification} onMarkAll={() => markAllNotificationsReadMutation.mutate()} markingAll={markAllNotificationsReadMutation.isPending} />}
              <div>
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
              {needsChanges.length > 0 && <Card className="border-amber-300 bg-amber-50/70 dark:bg-amber-950/10"><CardHeader><CardTitle className="text-amber-900 dark:text-amber-100">مقالات تحتاج لمستك ({needsChanges.length})</CardTitle><CardDescription>ملاحظات التحرير ظاهرة أسفل كل مقال ويمكنك العودة للتعديل مباشرة.</CardDescription></CardHeader></Card>}
              <div className="space-y-3">
                {workspaceQuery.isLoading ? [0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-2xl bg-muted" />) : trackedArticles.map((article) => <WriterTrackingCard key={article.id} article={article} onEdit={() => navigate(`/dashboard/articles/${article.id}/edit`)} onView={() => navigate(`/article/${article.id}`)} onReview={() => reviewMutation.mutate(article)} reviewPending={reviewMutation.isPending} submitPending={submitReviewMutation.isPending} onSubmit={(id) => submitReviewMutation.mutate(id)} />)}
                {!workspaceQuery.isLoading && trackedArticles.length === 0 && <EmptyState icon={Feather} title="هنا تبدأ الحكاية" text="أنشئ مقالك الأول، وسنرافقك من الفكرة حتى النشر." />}
              </div>
            </TabsContent>

            <TabsContent value="performance" className="mt-5 space-y-5">
              <div><h2 className="text-2xl font-bold">أثر كتابتك</h2><p className="text-muted-foreground">أرقام مفهومة تساعدك على القرار، لا مجرد لوحة مؤشرات.</p></div>
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
          <DialogHeader><DialogTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" /> قارئ سبق الأول</DialogTitle><DialogDescription>{reviewTitle} — الملاحظات اقتراحات اختيارية، وأنت صاحب النص النهائي.</DialogDescription></DialogHeader>
          {reviewResult && <ReviewResultView result={reviewResult} />}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return <div><p className="text-2xl font-bold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Feather; title: string; text: string }) {
  return <div className="rounded-xl border border-dashed p-6 text-center"><Icon className="mx-auto mb-2 h-6 w-6 text-muted-foreground" /><p className="font-medium">{title}</p><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>;
}

function TrackingMetric({ icon: Icon, label, value, tone = "default" }: { icon: typeof Feather; label: string; value: number; tone?: "default" | "warning" | "info" | "success" | "danger" }) {
  const tones = {
    default: "bg-muted/40 text-foreground",
    warning: "bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100",
    info: "bg-sky-50 text-sky-900 dark:bg-sky-950/20 dark:text-sky-100",
    success: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100",
    danger: "bg-red-50 text-red-900 dark:bg-red-950/20 dark:text-red-100",
  };
  return <div className={`rounded-xl border p-3 ${tones[tone]}`}><div className="flex items-center justify-between gap-3"><Icon className="h-4 w-4 opacity-70" /><span className="text-2xl font-bold tabular-nums">{value}</span></div><p className="mt-2 text-xs font-medium opacity-80">{label}</p></div>;
}

function editorialNotificationStyle(type: EditorialNotification["type"]) {
  if (type === "published") return { icon: CheckCircle2, label: "تم النشر", item: "border-emerald-200 bg-emerald-50/55 dark:border-emerald-900/40 dark:bg-emerald-950/10", iconClass: "text-emerald-700 dark:text-emerald-300" };
  if (type === "scheduled") return { icon: CalendarClock, label: "تمت الجدولة", item: "border-sky-200 bg-sky-50/55 dark:border-sky-900/40 dark:bg-sky-950/10", iconClass: "text-sky-700 dark:text-sky-300" };
  if (type === "needs_revision") return { icon: Edit3, label: "ملاحظات تحريرية", item: "border-amber-200 bg-amber-50/55 dark:border-amber-900/40 dark:bg-amber-950/10", iconClass: "text-amber-700 dark:text-amber-300" };
  return { icon: CircleX, label: type === "deleted" ? "حُذف نهائيًا" : "غير صالح للنشر", item: "border-red-200 bg-red-50/55 dark:border-red-900/40 dark:bg-red-950/10", iconClass: "text-red-700 dark:text-red-300" };
}

function EditorialAlertsPanel({ notifications, onOpen, onMarkAll, markingAll }: { notifications: EditorialNotification[]; onOpen: (notification: EditorialNotification) => void; onMarkAll: () => void; markingAll: boolean }) {
  return <Card className="border-red-200/80 shadow-sm dark:border-red-900/40"><CardHeader className="pb-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-lg"><span className="relative"><BellRing className="h-5 w-5 text-red-600" /><span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-600 ring-2 ring-background" /></span>لديك تحديثات على مقالاتك</CardTitle><CardDescription className="mt-1">افتح التنبيه لعرض المقال والتفاصيل، ولن يختفي قبل قراءته.</CardDescription></div><Button variant="ghost" size="sm" onClick={onMarkAll} disabled={markingAll} className="w-full gap-1.5 sm:w-auto"><CheckCheck className="h-4 w-4" /> تحديد الكل كمقروء</Button></div></CardHeader><CardContent className="grid gap-2 md:grid-cols-2">{notifications.slice(0, 4).map((notification) => { const style = editorialNotificationStyle(notification.type); const Icon = style.icon; return <button key={notification.id} type="button" onClick={() => onOpen(notification)} className={`w-full rounded-xl border p-3 text-right transition-transform hover:-translate-y-0.5 ${style.item}`}><div className="flex items-start gap-3"><span className="mt-0.5 rounded-lg bg-background/80 p-2"><Icon className={`h-4 w-4 ${style.iconClass}`} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold">{style.label}</span><span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: ar })}</span></div><p className="mt-1 line-clamp-1 text-sm font-medium">{notification.articleTitle || notification.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{notification.reviewerNote || notification.body}</p></div><ArrowLeft className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" /></div></button>; })}</CardContent></Card>;
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
    warning: "border-amber-300 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/10",
    info: "border-sky-300 bg-sky-50/40 dark:border-sky-900/40 dark:bg-sky-950/10",
    success: "border-emerald-300 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/10",
    danger: "border-border bg-card",
  };
  const badgeClasses = {
    default: "bg-muted text-foreground",
    warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
    info: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
    success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
    danger: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  };

  return <Card id={`writer-article-${article.id}`} className={toneClasses[state.tone]}><CardContent className="space-y-4 p-4 md:p-5"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold leading-7">{article.title}</h3><Badge className={`gap-1.5 border-0 ${badgeClasses[state.tone]}`}><StateIcon className="h-3.5 w-3.5" />{state.label}</Badge></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{state.description}</p>{state.date && <p className="mt-1 text-xs text-muted-foreground">{state.dateLabel}: {format(new Date(state.date), "d MMMM yyyy، h:mm a", { locale: ar })}</p>}</div><div className="flex shrink-0 flex-wrap gap-2">{(isPlainDraft || needsChanges) && <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5"><Edit3 className="h-4 w-4" /> تعديل المقال</Button>}{isPlainDraft && <Button variant="secondary" size="sm" onClick={onReview} disabled={reviewPending} className="gap-1.5"><BrainCircuit className="h-4 w-4" /> قارئ سبق الأول</Button>}{(isPlainDraft || needsChanges) && <SubmitRevisionButton article={article} isPending={submitPending} onSubmit={onSubmit} />}{article.status === "published" && <Button variant="outline" size="sm" onClick={onView}>عرض المقال</Button>}</div></div>{needsChanges && article.reviewNotes && <EditorialChecklist notes={article.reviewNotes} />}{isInvalid && <div className="rounded-xl border border-red-200 bg-background/70 p-3 dark:border-red-900/40"><p className="text-xs font-semibold text-red-900 dark:text-red-100">سبب عدم النشر</p><p className="mt-1 text-sm leading-6 text-red-900/80 dark:text-red-100/80">{article.reviewNotes?.trim() || "لم يسجل فريق التحرير سببًا لهذا القرار. يرجى التواصل عبر الاستفسارات."}</p></div>}{!needsChanges && !isInvalid && article.reviewNotes && article.reviewStatus !== "pending_review" && <div className="rounded-xl border bg-background/70 p-3"><p className="text-xs font-semibold">ملاحظة فريق التحرير</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{article.reviewNotes}</p></div>}</CardContent></Card>;
}

function IdeaCard({ idea, onStart }: { idea: WriterIdea; onStart: () => void }) {
  const labels = { specialty: "قريب من صوتك", follow_up: "فرصة متابعة", timely: "توقيت مناسب" };
  return <Card className="group overflow-hidden border-border bg-card transition-all hover:border-[#1BADF8]/40 hover:shadow-sm"><div className="h-1 bg-[#1BADF8]" /><CardHeader><Badge variant="outline" className="w-fit border-[#1BADF8]/25 bg-[#1BADF8]/5 text-[#078fd1] dark:text-[#45c0f5]">{labels[idea.kind]}</Badge><CardTitle className="text-lg leading-7">{idea.title}</CardTitle><CardDescription className="leading-6">{idea.angle}</CardDescription></CardHeader><CardContent className="space-y-3"><div className="rounded-lg bg-muted/50 p-3 text-sm"><span className="font-medium">لماذا الآن؟ </span>{idea.whyNow}</div><p className="text-xs text-muted-foreground">الجمهور المتوقع: {idea.audience}</p><Button variant="outline" className="w-full gap-2 group-hover:border-[#1BADF8]/50" onClick={onStart}>طوّر هذه الفكرة <ArrowLeft className="h-4 w-4" /></Button></CardContent></Card>;
}

function CoachResultView({ result, compact = false }: { result: CoachResult; compact?: boolean }) {
  return <div className="mt-4 space-y-4 rounded-2xl border border-[#1BADF8]/20 bg-[#1BADF8]/[0.035] p-4"><div className="flex items-center gap-2 font-semibold text-[#078fd1] dark:text-[#45c0f5]"><Sparkles className="h-4 w-4" /> خريطة الفكرة</div>{result.reflection && <p className="text-sm leading-7">{result.reflection}</p>}<div className={`grid gap-4 ${compact ? "md:grid-cols-2" : ""}`}>{result.questions?.length ? <ResultList title="أسئلة تستحق الإجابة" items={result.questions} /> : null}{result.thesisOptions?.length ? <ResultList title="مواقف محتملة" items={result.thesisOptions} /> : null}{!compact && result.outline?.length ? <ResultList title="بناء مقترح" items={result.outline} /> : null}{!compact && result.sourcesToSeek?.length ? <ResultList title="ما الذي يحتاج تحققًا؟" items={result.sourcesToSeek} /> : null}</div>{result.counterpoint && <div className="rounded-lg border-r-4 border-[#1BADF8] bg-background p-3 text-sm"><span className="font-medium">الرأي المقابل: </span>{result.counterpoint}</div>}<Button size="sm" className="gap-2" onClick={() => window.location.assign("/dashboard/articles/new")}><PenLine className="h-4 w-4" /> ابدأ مسودة بصوتك</Button></div>;
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return <div><h4 className="mb-2 text-sm font-semibold">{title}</h4><ul className="space-y-2">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-6 text-muted-foreground"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{item}</li>)}</ul></div>;
}

function EditorialChecklist({ notes }: { notes: string }) {
  const items = notes.split(/\n|[•؛]/).map((item) => item.trim()).filter(Boolean).slice(0, 5);
  return <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/30 dark:bg-amber-950/10"><p className="mb-2 text-xs font-semibold text-amber-900 dark:text-amber-100">خطة ملاحظات التحرير</p><ul className="space-y-1.5">{items.map((item, index) => <li key={`${item}-${index}`} className="flex items-start gap-2 text-xs leading-5 text-amber-900/80 dark:text-amber-100/80"><span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-amber-400 bg-background" />{item}</li>)}</ul></div>;
}

function StyleProfileCard({ profile, loading }: { profile?: Record<string, unknown>; loading: boolean }) {
  const traits = Array.isArray(profile?.traits) ? profile.traits.filter((item): item is string => typeof item === "string") : [];
  const guidance = Array.isArray(profile?.guidance) ? profile.guidance.filter((item): item is string => typeof item === "string") : [];
  return <Card className="border-[#1BADF8]/20 bg-card"><CardHeader><CardTitle className="flex items-center gap-2"><Feather className="h-5 w-5 text-[#1BADF8]" /> بصمتك الكتابية</CardTitle><CardDescription>ذاكرة تحترم صوتك ولا تستنسخه.</CardDescription></CardHeader><CardContent className="space-y-4">{loading ? <div className="h-32 animate-pulse rounded-xl bg-muted" /> : profile?.ready === false ? <p className="text-sm text-muted-foreground">{String(profile.message || "تُبنى بعد نشر أول مقال.")}</p> : <><p className="text-sm leading-7">{String(profile?.signature || "صوتك يتضح أكثر مع كل مقال.")}</p><div className="flex flex-wrap gap-2">{traits.map((trait) => <Badge key={trait} variant="outline">{trait}</Badge>)}</div><ResultList title="إشارات تحافظ على صوتك" items={guidance} /></>}</CardContent></Card>;
}

function ReviewResultView({ result }: { result: ReviewResult }) {
  const score = Math.max(0, Math.min(100, result.overallScore ?? 0));
  return <div className="space-y-5"><div className="rounded-2xl border bg-muted/25 p-4"><div className="mb-2 flex items-center justify-between"><span className="font-semibold">جاهزية القراءة</span><span className="text-2xl font-bold text-primary">{score}%</span></div><Progress value={score} /><p className="mt-3 text-sm leading-7 text-muted-foreground">{result.summary}</p></div><div className="grid gap-3 md:grid-cols-2">{result.checks?.map((check) => <div key={check.key} className="rounded-xl border p-3"><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">{check.label}</span><span className="text-sm font-bold">{check.score}%</span></div><Progress value={check.score} className="h-1.5" /><p className="mt-2 text-xs leading-5 text-muted-foreground">{check.note}</p></div>)}</div>{result.strengths?.length ? <ResultList title="نقاط القوة" items={result.strengths} /> : null}{result.headlineSuggestions?.length ? <ResultList title="عناوين تستحق التجربة" items={result.headlineSuggestions} /> : null}{result.sourceFlags?.length ? <ResultList title="مواضع تحتاج مصدرًا" items={result.sourceFlags} /> : null}{result.sensitiveClaims?.length ? <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:bg-amber-950/10"><ResultList title="ادعاءات حساسة تحتاج مراجعة بشرية" items={result.sensitiveClaims} /></div> : null}</div>;
}
