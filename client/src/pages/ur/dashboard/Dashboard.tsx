import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiUrl } from "@/lib/queryClient";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {
  FileText,
  Users,
  MessageSquare,
  FolderTree,
  FlaskConical,
  Heart,
  TrendingUp,
  Clock,
  Eye,
  Archive,
  FileEdit,
  CheckCircle,
  XCircle,
  AlertCircle,
  Activity,
  Sparkles,
  Bell,
  Calendar,
  ClipboardList,
  X,
  BellRing,
} from "lucide-react";
import { ViewsCount } from "@/components/ViewsCount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UrduDashboardLayout } from "@/components/ur/UrduDashboardLayout";
import { StatsCard } from "@/components/en/dashboard/StatsCard";
import { ChartCard } from "@/components/en/dashboard/ChartCard";
import { ActivityCard } from "@/components/en/dashboard/ActivityCard";
import { formatDistanceToNow, formatDistance } from "date-fns";
import { enUS } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useMemo, useState } from "react";

interface AdminDashboardStats {
  articles: {
    total: number;
    published: number;
    draft: number;
    archived: number;
    scheduled: number;
    totalViews: number;
    viewsToday: number;
  };
  users: {
    total: number;
    emailVerified: number;
    active24h: number;
    newThisWeek: number;
    activeToday: number;
  };
  comments: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  categories: {
    total: number;
  };
  abTests: {
    total: number;
    running: number;
  };
  reactions: {
    total: number;
    todayCount: number;
  };
  engagement: {
    averageTimeOnSite: number;
    totalReads: number;
    readsToday: number;
  };
  recentArticles: Array<{
    id: string;
    title: string;
    status: string;
    views: number;
    createdAt: string;
    author?: {
      firstName?: string;
      lastName?: string;
      email: string;
    };
  }>;
  recentComments: Array<{
    id: string;
    content: string;
    status: string;
    createdAt: string;
    user?: {
      firstName?: string;
      lastName?: string;
      email: string;
    };
  }>;
  topArticles: Array<{
    id: string;
    title: string;
    views: number;
    createdAt: string;
    category?: {
      nameAr: string;
    };
  }>;
}

// Motivational quotes in Urdu
const MOTIVATIONAL_QUOTES = [
  "نیا دن، نئی کامیابی ✨… آئیں زور دار شروعات کریں، چیمپئن!",
  "اپنے دن کا آغاز جوش و جذبے سے کریں—آپ کا ہر خیال سبق میں فرق ڈالتا ہے 💪",
  "ذہانت اور تخلیقیت کی صبح بخیر… آج آپ ہی بہترین کا مرکز ہیں! 🚀",
  "یاد رکھیں: معیار سب سے چھوٹی تفصیلات سے شروع ہوتا ہے 👀",
  "آپ کی موجودگی اثر ڈالتی ہے، اور آپ کے نتائج ٹیم کو متاثر کرتے ہیں 🌟",
  "ہر مضمون جو آپ آج لکھتے ہیں… سبق کی تاریخ میں ایک نشان ہے 🖋️",
  "ہر کام میں اپنے آپ کا بہترین ورژن بنیں 🔥",
  "بہترین ہونا کوئی انتخاب نہیں… یہ سبق میں زندگی کا طریقہ ہے 👑",
  "ایسے جدت کریں جیسے آپ پہلی بار پڑھی جانے والی خبر بنا رہے ہیں 💡",
  "آپ کا ہر کلک ہزاروں قارئین کے تجربے میں فرق ڈالتا ہے 🌍",
];

// Get time-based greeting
function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "صبح بخیر";
  if (hour < 18) return "سہ پہر بخیر";
  return "شام بخیر";
}

// Get random motivational quote (changes on each visit)
function getRandomMotivationalQuote(): string {
  const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  return MOTIVATIONAL_QUOTES[randomIndex];
}

function Dashboard() {
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });

  const { data: stats, isLoading } = useQuery<AdminDashboardStats>({
    queryKey: ["/api/ur/admin/dashboard/stats"],
    enabled: !!user && hasRole(user, "admin", "system_admin", "editor"),
  });

  // Get greeting (memoized to avoid recalculation during re-renders)
  const greeting = useMemo(() => getTimeBasedGreeting(), []);
  
  // Get a fresh random quote on each render to ensure it changes on every visit
  const motivationalQuote = getRandomMotivationalQuote();

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      published: "default",
      draft: "secondary",
      pending: "outline",
      approved: "default",
      rejected: "destructive",
      archived: "outline",
    };
    const labels: Record<string, string> = {
      published: "شائع",
      draft: "مسودہ",
      pending: "زیر التواء",
      approved: "منظور شدہ",
      rejected: "مسترد",
      archived: "محفوظ شدہ",
    };
    return (
      <Badge variant={variants[status] || "outline"} data-testid={`badge-status-${status}`}>
        {labels[status] || status}
      </Badge>
    );
  };

  // Chart colors
  const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

  // Prepare chart data
  const articleChartData = stats ? [
    { name: "شائع", value: stats.articles.published, color: COLORS[0] },
    { name: "مسودہ", value: stats.articles.draft, color: COLORS[1] },
    { name: "محفوظ شدہ", value: stats.articles.archived, color: COLORS[2] },
  ] : [];

  const commentChartData = stats ? [
    { name: "منظور شدہ", value: stats.comments.approved, color: COLORS[0] },
    { name: "زیر التواء", value: stats.comments.pending, color: COLORS[1] },
    { name: "مسترد", value: stats.comments.rejected, color: COLORS[2] },
  ] : [];

  if (isUserLoading || !user) {
    return (
      <UrduDashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </UrduDashboardLayout>
    );
  }

  // Allow access to dashboard for all staff roles
  // The nav system will automatically filter menu items based on role permissions

  return (
    <UrduDashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Welcome Section with Greeting */}
        <Card className="bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50 dark:from-card dark:via-card dark:to-card border-primary/20 shadow-sm shadow-indigo-50 dark:shadow-none" data-testid="card-welcome">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Sparkles className="h-6 w-6 text-primary animate-pulse" data-testid="icon-sparkles" />
                    <div className="absolute -inset-1 bg-primary/20 rounded-full blur-md animate-pulse"></div>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-accent-foreground bg-clip-text text-transparent" data-testid="text-greeting">
                    {greeting}, {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.firstName || user?.email?.split('@')[0] || "there"}
                  </h2>
                </div>
                <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl" data-testid="text-motivational-quote">
                  {motivationalQuote}
                </p>
              </div>
              <div className="flex flex-col items-start md:items-end gap-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span data-testid="text-current-time">
                    {new Date().toLocaleString('en-US', { 
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Urgent Reminder Banner */}
        <UrgentReminderBanner />

        {/* Main Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="مضامین"
            value={stats?.articles.total || 0}
            description={`${stats?.articles.published || 0} شائع · ${stats?.articles.draft || 0} مسودہ · ${stats?.articles.scheduled || 0} مقرر`}
            icon={FileText}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            isLoading={isLoading}
            testId="card-articles-stats"
          />
          <StatsCard
            title="صارفین"
            value={stats?.users.total || 0}
            description={`${stats?.users.active24h || 0} آج فعال · ${stats?.users.newThisWeek || 0} اس ہفتے نئے`}
            icon={Users}
            iconColor="text-purple-600 dark:text-purple-400"
            iconBgColor="bg-purple-100/50 dark:bg-purple-900/20"
            isLoading={isLoading}
            testId="card-users-stats"
          />
          <StatsCard
            title="تبصرے"
            value={stats?.comments.total || 0}
            description={`${stats?.comments.pending || 0} زیر التواء · ${stats?.comments.approved || 0} منظور شدہ`}
            icon={MessageSquare}
            iconColor="text-green-600 dark:text-green-400"
            iconBgColor="bg-green-100/50 dark:bg-green-900/20"
            isLoading={isLoading}
            testId="card-comments-stats"
          />
          <StatsCard
            title="کل ملاحظات"
            value={stats?.articles.totalViews || 0}
            description="کل مضمون ملاحظات"
            icon={Eye}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            isLoading={isLoading}
            testId="card-views-stats"
          />
        </div>

        {/* Today's Activity Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="آج کے ملاحظات"
            value={stats?.articles.viewsToday || 0}
            description="آج نئے ملاحظات"
            icon={Activity}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            isLoading={isLoading}
            testId="card-views-today-stats"
          />
          <StatsCard
            title="آج فعال قارئین"
            value={stats?.users.activeToday || 0}
            description="اب فعال زائرین"
            icon={Users}
            iconColor="text-chart-2"
            iconBgColor="bg-blue-100/50 dark:bg-blue-900/20"
            isLoading={isLoading}
            testId="card-active-today-stats"
          />
          <StatsCard
            title="آج پڑھا گیا"
            value={stats?.engagement.readsToday || 0}
            description={`کل ${stats?.engagement.totalReads || 0} میں سے`}
            icon={FileText}
            iconColor="text-chart-3"
            iconBgColor="bg-cyan-100/50 dark:bg-cyan-900/20"
            isLoading={isLoading}
            testId="card-reads-today-stats"
          />
          <StatsCard
            title="آج مشغولیت"
            value={stats?.reactions.todayCount || 0}
            description={`کل ${stats?.reactions.total || 0} میں سے`}
            icon={Heart}
            iconColor="text-chart-4"
            iconBgColor="bg-pink-100/50 dark:bg-pink-900/20"
            isLoading={isLoading}
            testId="card-engagement-today-stats"
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatsCard
            title="زمرے"
            value={stats?.categories.total || 0}
            icon={FolderTree}
            iconColor="text-amber-600 dark:text-amber-400"
            iconBgColor="bg-amber-100/50 dark:bg-amber-900/20"
            isLoading={isLoading}
            testId="card-categories-stats"
          />
          <StatsCard
            title="A/B ٹیسٹ"
            value={stats?.abTests.total || 0}
            description={`${stats?.abTests.running || 0} چل رہا ہے`}
            icon={FlaskConical}
            iconColor="text-indigo-600 dark:text-indigo-400"
            iconBgColor="bg-indigo-100/50 dark:bg-indigo-900/20"
            isLoading={isLoading}
            testId="card-abtests-stats"
          />
          <StatsCard
            title="اوسط پڑھنے کا وقت"
            value={`${Math.floor((stats?.engagement.averageTimeOnSite || 0) / 60)}:${String((stats?.engagement.averageTimeOnSite || 0) % 60).padStart(2, '0')}`}
            description="منٹ:سیکنڈ فی مضمون"
            icon={Clock}
            iconColor="text-teal-600 dark:text-teal-400"
            iconBgColor="bg-teal-100/50 dark:bg-teal-900/20"
            isLoading={isLoading}
            testId="card-avg-time-stats"
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard
            title="مضامین کی تقسیم"
            description="حیثیت کے لحاظ سے"
            isLoading={isLoading}
            testId="card-articles-chart"
          >
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={articleChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={90}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {articleChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="تبصروں کی تقسیم"
            description="حیثیت کے لحاظ سے"
            isLoading={isLoading}
            testId="card-comments-chart"
          >
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={commentChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ActivityCard
            title="حالیہ مضامین"
            description="آخری 5 مضامین"
            items={(stats?.recentArticles || []).map(article => ({
              id: article.id,
              title: article.title,
              status: article.status,
              timestamp: article.createdAt,
              metadata: { views: article.views }
            }))}
            isLoading={isLoading}
            emptyMessage="کوئی حالیہ مضمون نہیں"
            testId="card-recent-articles"
            actions={
              <Button asChild variant="ghost" size="sm" data-testid="button-view-all-articles">
                <Link href="/dashboard/articles">تمام دیکھیں</Link>
              </Button>
            }
            renderItem={(item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 p-3 border rounded-lg hover-elevate transition-all"
                data-testid={`recent-article-${item.id}`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-medium text-sm truncate" data-testid={`text-article-title-${item.id}`}>
                      {item.title}
                    </h4>
                    {item.status && getStatusBadge(item.status)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(item.timestamp), {
                        addSuffix: true,
                        locale: enUS,
                      })}
                    </span>
                    <ViewsCount 
                      views={item.metadata?.views || 0}
                      iconClassName="h-3 w-3"
                    />
                  </div>
                </div>
              </div>
            )}
            getStatusBadge={getStatusBadge}
          />

          <ActivityCard
            title="حالیہ تبصرے"
            description="آخری 5 تبصرے"
            items={(stats?.recentComments || []).map(comment => ({
              id: comment.id,
              title: comment.content.substring(0, 80) + "...",
              status: comment.status,
              timestamp: comment.createdAt,
              metadata: { user: comment.user }
            }))}
            isLoading={isLoading}
            emptyMessage="کوئی حالیہ تبصرہ نہیں"
            testId="card-recent-comments"
            actions={
              <Button asChild variant="ghost" size="sm" data-testid="button-view-all-comments">
                <Link href="/dashboard/ai-moderation">ذہین نگرانی</Link>
              </Button>
            }
            renderItem={(item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 p-3 border rounded-lg hover-elevate transition-all"
                data-testid={`recent-comment-${item.id}`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm truncate" data-testid={`text-comment-content-${item.id}`}>
                      {item.title}
                    </p>
                    {item.status && getStatusBadge(item.status)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {item.metadata?.user?.firstName || item.metadata?.user?.email || "صارف"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(item.timestamp), {
                        addSuffix: true,
                        locale: enUS,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            )}
            getStatusBadge={getStatusBadge}
          />
        </div>

        {/* Upcoming Reminders and Tasks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="grid-reminders-tasks">
          <UpcomingRemindersWidget />
          <UpcomingTasksWidget />
        </div>

        {/* Top Articles */}
        <Card data-testid="card-top-articles">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  سب سے زیادہ دیکھے گئے مضامین
                </CardTitle>
                <CardDescription>ملاحظات کی بنیاد پر ٹاپ 5 مضامین</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : stats?.topArticles && stats.topArticles.length > 0 ? (
              <div className="space-y-4">
                {stats?.topArticles?.map((article, index) => (
                  <div
                    key={article.id}
                    className="flex items-center gap-4 p-3 border rounded-lg hover-elevate transition-all"
                    data-testid={`top-article-${article.id}`}
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate text-sm mb-1" data-testid={`text-top-article-title-${article.id}`}>
                        {article.title}
                      </h4>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {article.category && (
                          <Badge variant="outline" className="text-xs">
                            {article.category.nameAr}
                          </Badge>
                        )}
                        <span className="flex items-center gap-1">
                          <ViewsCount 
                            views={article.views}
                            iconClassName="h-3 w-3"
                          />
                          <span>ملاحظات</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8" data-testid="text-no-top-articles">
                کوئی مضمون نہیں
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </UrduDashboardLayout>
  );
}

// Widget: Upcoming Reminders
function UpcomingRemindersWidget() {
  const { data: reminders, isLoading } = useQuery<Array<{
    id: string;
    eventId: string;
    eventTitle: string;
    reminderTime: string;
    channelType: string;
  }>>({
    queryKey: ["/api/calendar/upcoming-reminders"],
  });

  return (
    <Card data-testid="card-upcoming-reminders">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" data-testid="icon-reminders" />
          آنے والی یاد دہانیاں
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" data-testid={`skeleton-reminder-${i}`} />
            ))}
          </div>
        ) : reminders && reminders.length > 0 ? (
          <div className="space-y-3">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className="p-3 border rounded-lg hover-elevate transition-all"
                data-testid={`reminder-item-${reminder.id}`}
              >
                <div className="flex flex-col gap-2">
                  <h4 className="font-medium text-sm" data-testid={`text-reminder-title-${reminder.id}`}>
                    {reminder.eventTitle}
                  </h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-reminder-time-${reminder.id}`}>
                      <Clock className="h-3 w-3" />
                      {(() => {
                        const reminderDate = new Date(reminder.reminderTime);
                        const now = new Date();
                        if (reminderDate > now) {
                          return `in ${formatDistance(reminderDate, now, { locale: enUS })}`;
                        } else {
                          return formatDistanceToNow(reminderDate, {
                            addSuffix: true,
                            locale: enUS,
                          });
                        }
                      })()}
                    </span>
                    <Badge variant="outline" data-testid={`badge-reminder-channel-${reminder.id}`}>
                      {reminder.channelType === 'IN_APP' ? 'ایپ میں' :
                       reminder.channelType === 'EMAIL' ? 'ای میل' : 
                       reminder.channelType === 'WHATSAPP' ? 'واٹس ایپ' :
                       reminder.channelType === 'SLACK' ? 'سلیک' : 
                       reminder.channelType}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8" data-testid="text-no-reminders">
            کوئی آنے والی یاد دہانی نہیں
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Widget: Upcoming Tasks
function UpcomingTasksWidget() {
  const { data: tasks, isLoading } = useQuery<Array<{
    id: string;
    eventId: string;
    eventTitle: string;
    role: string;
    status: string;
  }>>({
    queryKey: ["/api/calendar/my-assignments"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/api/calendar/my-assignments?status=pending"));
      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }
      return response.json();
    },
  });

  return (
    <Card data-testid="card-upcoming-tasks">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" data-testid="icon-tasks" />
          آنے والے کام
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" data-testid={`skeleton-task-${i}`} />
            ))}
          </div>
        ) : tasks && tasks.length > 0 ? (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-3 border rounded-lg hover-elevate transition-all"
                data-testid={`task-item-${task.id}`}
              >
                <div className="flex flex-col gap-2">
                  <h4 className="font-medium text-sm" data-testid={`text-task-title-${task.id}`}>
                    {task.eventTitle}
                  </h4>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" data-testid={`badge-task-role-${task.id}`}>
                      {task.role === 'coordinator' ? 'کوآرڈینیٹر' :
                       task.role === 'reporter' ? 'رپورٹر' :
                       task.role === 'photographer' ? 'فوٹوگرافر' :
                       task.role === 'editor' ? 'ایڈیٹر' :
                       task.role}
                    </Badge>
                    <Badge 
                      variant={task.status === 'pending' ? 'outline' : 'default'}
                      data-testid={`badge-task-status-${task.id}`}
                    >
                      {task.status === 'pending' ? 'زیر التواء' :
                       task.status === 'in_progress' ? 'جاری' :
                       task.status === 'completed' ? 'مکمل' :
                       task.status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8" data-testid="text-no-tasks">
            کوئی آنے والا کام نہیں
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Component: Urgent Reminder Banner
function UrgentReminderBanner() {
  const [dismissed, setDismissed] = useState(false);
  
  const { data: reminders, isLoading } = useQuery<Array<{
    id: string;
    eventId: string;
    eventTitle: string;
    reminderTime: string;
    channelType: string;
  }>>({
    queryKey: ["/api/calendar/upcoming-reminders"],
  });

  // Filter reminders that are within 1 hour
  const urgentReminders = useMemo(() => {
    if (!reminders) return [];
    
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    return reminders.filter(reminder => {
      const reminderDate = new Date(reminder.reminderTime);
      return reminderDate >= now && reminderDate <= oneHourFromNow;
    });
  }, [reminders]);

  if (isLoading || dismissed || urgentReminders.length === 0) {
    return null;
  }

  const reminder = urgentReminders[0];
  const reminderDate = new Date(reminder.reminderTime);
  const now = new Date();
  const minutesUntil = Math.floor((reminderDate.getTime() - now.getTime()) / (1000 * 60));

  return (
    <div 
      className="relative bg-gradient-to-r from-blue-50/80 via-blue-50/50 to-blue-50/80 dark:from-card dark:via-card dark:to-card border-r-4 border-r-blue-400 dark:border-r-border rounded-lg p-4 shadow-sm"
      data-testid="banner-urgent-reminder"
    >
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <BellRing className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse" data-testid="icon-bell-ring" />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-blue-900 dark:text-blue-100" data-testid="text-banner-title">
                  یاد دہانی بہت جلد
                </h3>
                <Badge 
                  variant="outline" 
                  className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700"
                  data-testid="badge-urgent-time"
                >
                  {minutesUntil > 0 ? `${minutesUntil} منٹ میں` : 'ابھی'}
                </Badge>
              </div>
              
              <Link href={`/calendar/${reminder.eventId}`} data-testid="link-reminder-event">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium mb-2 hover:underline" data-testid="text-banner-event">
                  {reminder.eventTitle}
                </p>
              </Link>
              
              <div className="flex items-center gap-3 text-xs text-blue-700 dark:text-blue-300">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {reminderDate.toLocaleString('en-US', { 
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
                <span className="text-blue-500 dark:text-blue-400">•</span>
                <span>
                  {reminder.channelType === 'IN_APP' ? 'ایپ میں' :
                   reminder.channelType === 'EMAIL' ? 'ای میل' : 
                   reminder.channelType === 'WHATSAPP' ? 'واٹس ایپ' :
                   reminder.channelType === 'SLACK' ? 'سلیک' : 
                   reminder.channelType}
                </span>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDismissed(true)}
              className="h-8 w-8 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              data-testid="button-dismiss-banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {urgentReminders.length > 1 && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2" data-testid="text-more-reminders">
              + {urgentReminders.length - 1} مزید آنے والی یاد دہانیاں
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Wrap with Protected Route for staff-only access
export default function ProtectedDashboard() {
  return (
    <ProtectedRoute requireStaff={true}>
      <Dashboard />
    </ProtectedRoute>
  );
}
