import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useAuth, hasRole, hasPermission } from "@/hooks/useAuth";
import { PERMISSION_CODES } from "@shared/rbac-constants";
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
  Headphones,
  Brain,
  Building2,
  Image,
  Bot,
  Blocks,
  HardDrive,
} from "lucide-react";
import { ViewsCount } from "@/components/ViewsCount";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardLayout } from "@/components/DashboardLayout";
import { QuickActionsSection } from "@/components/QuickActionsSection";
import { OnlineModeratorsWidget } from "@/components/OnlineModeratorsWidget";
import { ContactMessagesWidget } from "@/components/ContactMessagesWidget";
import { UpcomingWorldDaysWidget } from "@/components/dashboard/UpcomingWorldDaysWidget";
import { DashboardAnnouncementBanner } from "@/components/DashboardAnnouncementBanner";
import { formatDistanceToNow, formatDistance } from "date-fns";
import { arSA } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useMemo } from "react";

// Safe date formatting helper to prevent "Invalid time value" crashes
function safeFormatDistanceToNow(dateValue: string | Date | null | undefined, options?: Parameters<typeof formatDistanceToNow>[1]): string {
  if (!dateValue) return "غير متوفر";
  try {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    if (Number.isNaN(date.getTime())) return "غير متوفر";
    return formatDistanceToNow(date, options);
  } catch {
    return "غير متوفر";
  }
}

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
  audioNewsletters?: {
    total: number;
    published: number;
    totalListens: number;
  };
  deepAnalyses?: {
    total: number;
    published: number;
  };
  publishers?: {
    total: number;
    active: number;
  };
  mediaLibrary?: {
    totalFiles: number;
    totalSize: number;
  };
  aiTasks?: {
    total: number;
    pending: number;
    completed: number;
  };
  aiImages?: {
    total: number;
    thisWeek: number;
  };
  smartBlocks?: {
    total: number;
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

// Motivational quotes in Arabic
const MOTIVATIONAL_QUOTES = [
  "يوم جديد، إنجاز جديد ✨… خلنا نبدأ بقوّة يا بطل!",
  "ابدأ يومك بحماس، فكل فكرة منك تصنع فرقاً في سبق 💪",
  "صباح الذكاء والإبداع… أنت محور التميّز اليوم! 🚀",
  "تذكّر: الجودة تبدأ من التفاصيل الصغيرة 👀",
  "وجودك يصنع الأثر، ونتائجك تُلهم الفريق 🌟",
  "كل مقال تكتبه اليوم… بصمة تُضاف لتاريخ سبق 🖋️",
  "كن النسخة الأفضل من نفسك في كل مهمة 🔥",
  "الإتقان ما هو خيار… هو أسلوب حياة في سبق 👑",
  "ابدع كأنك تصنع خبراً يُقرأ لأول مرة 💡",
  "كل ضغطة زر منك تُحدث فرقاً في تجربة آلاف القراء 🌍",
];

// Get time-based greeting
function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "صباح الخير";
  if (hour < 18) return "مساء الخير";
  return "مساء الخير";
}

// Get random motivational quote (changes on each visit)
function getRandomMotivationalQuote(): string {
  const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  return MOTIVATIONAL_QUOTES[randomIndex];
}

function Dashboard() {
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const [, navigate] = useLocation();

  // Redirect opinion authors to their dedicated dashboard
  useEffect(() => {
    if (user && user.role === 'opinion_author') {
      navigate('/dashboard/opinion-author', { replace: true });
    }
  }, [user, navigate]);

  // Check if user has dashboard view permission (base permission for accessing dashboard data)
  const canViewDashboard = hasPermission(user, PERMISSION_CODES.DASHBOARD_VIEW) || 
    hasRole(user, "admin", "system_admin", "editor");
  
  const canViewStats = hasPermission(user, PERMISSION_CODES.DASHBOARD_VIEW_STATS) || 
    hasRole(user, "admin", "system_admin", "editor");

  // Track initial load completion for deferred queries
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  const { data: stats, isLoading } = useQuery<AdminDashboardStats>({
    queryKey: ["/api/admin/dashboard/stats"],
    enabled: !!user && canViewStats,
    refetchInterval: 300000, // Auto-refresh every 5 minutes
  });

  // Mark initial load complete when stats are loaded
  useEffect(() => {
    if (stats && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [stats, initialLoadComplete]);


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
      published: "منشور",
      draft: "مسودة",
      pending: "قيد المراجعة",
      approved: "موافق عليه",
      rejected: "مرفوض",
      archived: "مؤرشف",
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
    { name: "منشور", value: stats.articles.published, color: COLORS[0] },
    { name: "مسودة", value: stats.articles.draft, color: COLORS[1] },
    { name: "مؤرشف", value: stats.articles.archived, color: COLORS[2] },
  ] : [];

  const commentChartData = stats ? [
    { name: "موافق", value: stats.comments.approved, color: COLORS[0] },
    { name: "قيد المراجعة", value: stats.comments.pending, color: COLORS[1] },
    { name: "مرفوض", value: stats.comments.rejected, color: COLORS[2] },
  ] : [];

  const SectionHeader = ({ title, color }: { title: string; color: string }) => (
    <div className="flex items-center gap-3 px-1">
      <div className={`h-8 w-1 ${color} rounded-full`}></div>
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
    </div>
  );

  if (isUserLoading || !user) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Allow access to dashboard for all staff roles
  // The nav system will automatically filter menu items based on role permissions

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Dashboard Announcements Banner */}
        <DashboardAnnouncementBanner deferLoading={!initialLoadComplete} />

        {/* Welcome Section with Greeting */}
        <Card className="bg-gradient-to-r from-blue-50 via-slate-50 to-blue-50 dark:from-blue-950/20 dark:via-slate-950/20 dark:to-blue-950/20 border-primary/20" data-testid="card-welcome">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Sparkles className="h-6 w-6 text-primary animate-pulse" data-testid="icon-sparkles" />
                    <div className="absolute -inset-1 bg-primary/20 rounded-full blur-md animate-pulse"></div>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-accent-foreground bg-clip-text text-transparent" data-testid="text-greeting">
                    {greeting} يا {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.firstName || user?.email?.split('@')[0] || "عزيزي"}
                  </h2>
                </div>
                <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl" data-testid="text-motivational-quote">
                  {motivationalQuote}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Urgent Reminder Banner */}
        <UrgentReminderBanner />

        {/* Quick Actions Section - Staff Only */}
        {user?.role !== 'comments_moderator' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
            {/* Quick Actions - shows only actions the user has permission for (handled internally) */}
            <div className="lg:col-span-2">
              <QuickActionsSection />
            </div>
            {/* Contact Messages - visible to all, but click-through requires dashboard.view_messages */}
            <div className="lg:col-span-1">
              <ContactMessagesWidget canViewDetails={hasPermission(user, PERMISSION_CODES.DASHBOARD_VIEW_MESSAGES)} deferLoading={!initialLoadComplete} />
            </div>
            {/* Online Moderators - visible to all staff */}
            <div className="lg:col-span-1">
              <OnlineModeratorsWidget />
            </div>
          </div>
        )}

        {/* Section: Overview Stats */}
        <div className="space-y-3">
          <SectionHeader title="نظرة عامة" color="bg-blue-500" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-6">
            {/* Articles Stats */}
            <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30" data-testid="card-articles-stats">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المقالات</CardTitle>
              <div className="p-2 rounded-md bg-accent-blue/30">
                <FileText className="h-4 w-4 text-primary" data-testid="icon-articles" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-articles-total">
                    {stats?.articles.total || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-articles-breakdown">
                    {stats?.articles.published || 0} منشور · {stats?.articles.draft || 0} مسودة · {stats?.articles.scheduled || 0} مجدولة
                  </p>
                </>
              )}
            </CardContent>
          </Card>

            {/* Users Stats */}
            <Card className="hover-elevate active-elevate-2 transition-all bg-violet-50 dark:bg-violet-950/30" data-testid="card-users-stats">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المستخدمون</CardTitle>
              <div className="p-2 rounded-md bg-accent-purple/30">
                <Users className="h-4 w-4 text-accent-foreground" data-testid="icon-users" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-users-total">
                    {stats?.users.total || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-users-breakdown">
                    {stats?.users.active24h || 0} نشط اليوم · {stats?.users.newThisWeek || 0} جديد هذا الأسبوع
                  </p>
                </>
              )}
            </CardContent>
          </Card>

            {/* Comments Stats */}
            <Card className="hover-elevate active-elevate-2 transition-all bg-green-50 dark:bg-green-950/30" data-testid="card-comments-stats">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">التعليقات</CardTitle>
              <div className="p-2 rounded-md bg-accent-green/30">
                <MessageSquare className="h-4 w-4 text-green-600 dark:text-green-400" data-testid="icon-comments" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-comments-total">
                    {stats?.comments.total || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-comments-breakdown">
                    {stats?.comments.pending || 0} قيد المراجعة · {stats?.comments.approved || 0} موافق عليه
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          </div>
        </div>

        {/* Section: Secondary Stats */}
        <div className="space-y-3">
          <SectionHeader title="إحصائيات إضافية" color="bg-slate-500" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4 md:gap-6">
            <Card data-testid="card-categories-stats" className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">التصنيفات</CardTitle>
              <FolderTree className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold" data-testid="text-categories-total">
                  {stats?.categories.total || 0}
                </div>
              )}
            </CardContent>
          </Card>

            <Card data-testid="card-abtests-stats" className="hover-elevate active-elevate-2 transition-all bg-amber-50 dark:bg-amber-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">اختبارات A/B</CardTitle>
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-abtests-total">
                    {stats?.abTests.total || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-abtests-running">
                    {stats?.abTests.running || 0} قيد التشغيل
                  </p>
                </>
              )}
            </CardContent>
          </Card>

            <Card data-testid="card-avg-time-stats" className="hover-elevate active-elevate-2 transition-all bg-amber-50 dark:bg-amber-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">متوسط وقت القراءة</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-avg-time">
                    {(stats?.engagement.averageTimeOnSite || 0) > 0 ? `${Math.floor((stats?.engagement.averageTimeOnSite || 0) / 60)}:${String((stats?.engagement.averageTimeOnSite || 0) % 60).padStart(2, '0')}` : 'غير متاح'}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-avg-time-description">
                    {(stats?.engagement.averageTimeOnSite || 0) > 0 ? 'دقيقة:ثانية لكل مقال' : 'سيتم التحديث عند توفر بيانات'}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          </div>
        </div>

        {/* Section: Platform Services */}
        <div className="space-y-3">
          <SectionHeader title="خدمات المنصة" color="bg-purple-500" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-6">
            {/* Audio Newsletters */}
            <Card data-testid="card-audio-newsletters-stats" className="hover-elevate active-elevate-2 transition-all bg-purple-50 dark:bg-purple-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">النشرات الصوتية</CardTitle>
              <div className="p-2 rounded-md bg-purple-500/20">
                <Headphones className="h-4 w-4 text-purple-500" data-testid="icon-audio-newsletters" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-audio-newsletters-total">
                    {stats?.audioNewsletters?.total || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-audio-newsletters-breakdown">
                    {stats?.audioNewsletters?.published || 0} منشورة · {stats?.audioNewsletters?.totalListens || 0} استماع
                  </p>
                </>
              )}
            </CardContent>
          </Card>

            {/* Deep Analyses */}
            <Card data-testid="card-deep-analyses-stats" className="hover-elevate active-elevate-2 transition-all bg-purple-50 dark:bg-purple-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">التحليلات العميقة</CardTitle>
              <div className="p-2 rounded-md bg-indigo-500/20">
                <Brain className="h-4 w-4 text-indigo-500" data-testid="icon-deep-analyses" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-deep-analyses-total">
                    {stats?.deepAnalyses?.total || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-deep-analyses-breakdown">
                    {stats?.deepAnalyses?.published || 0} تحليل منشور
                  </p>
                </>
              )}
            </CardContent>
          </Card>

            {/* Publishers */}
            <Card data-testid="card-publishers-stats" className="hover-elevate active-elevate-2 transition-all bg-purple-50 dark:bg-purple-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الناشرون</CardTitle>
              <div className="p-2 rounded-md bg-amber-500/20">
                <Building2 className="h-4 w-4 text-amber-500" data-testid="icon-publishers" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-publishers-total">
                    {stats?.publishers?.total || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-publishers-breakdown">
                    {stats?.publishers?.active || 0} ناشر نشط
                  </p>
                </>
              )}
            </CardContent>
          </Card>

            {/* Media Library */}
            <Card data-testid="card-media-library-stats" className="hover-elevate active-elevate-2 transition-all bg-purple-50 dark:bg-purple-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">مكتبة الوسائط</CardTitle>
              <div className="p-2 rounded-md bg-cyan-500/20">
                <HardDrive className="h-4 w-4 text-cyan-500" data-testid="icon-media-library" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-media-library-total">
                    {stats?.mediaLibrary?.totalFiles || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-media-library-breakdown">
                    {((stats?.mediaLibrary?.totalSize || 0) / (1024 * 1024)).toFixed(1)} MB حجم إجمالي
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          </div>
        </div>

        {/* Section: AI Features */}
        <div className="space-y-3">
          <SectionHeader title="الذكاء الاصطناعي" color="bg-emerald-500" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4 md:gap-6">
            {/* AI Tasks */}
            <Card data-testid="card-ai-tasks-stats" className="hover-elevate active-elevate-2 transition-all bg-emerald-50 dark:bg-emerald-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">مهام الذكاء الاصطناعي</CardTitle>
              <div className="p-2 rounded-md bg-emerald-500/20">
                <Bot className="h-4 w-4 text-emerald-500" data-testid="icon-ai-tasks" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-ai-tasks-total">
                    {stats?.aiTasks?.total || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-ai-tasks-breakdown">
                    {stats?.aiTasks?.pending || 0} معلقة · {stats?.aiTasks?.completed || 0} مكتملة
                  </p>
                </>
              )}
            </CardContent>
          </Card>

            {/* AI Generated Images */}
            <Card data-testid="card-ai-images-stats" className="hover-elevate active-elevate-2 transition-all bg-emerald-50 dark:bg-emerald-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">صور الذكاء الاصطناعي</CardTitle>
              <div className="p-2 rounded-md bg-rose-500/20">
                <Image className="h-4 w-4 text-rose-500" data-testid="icon-ai-images" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-ai-images-total">
                    {stats?.aiImages?.total || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-ai-images-breakdown">
                    {stats?.aiImages?.thisWeek || 0} هذا الأسبوع
                  </p>
                </>
              )}
            </CardContent>
          </Card>

            {/* Smart Blocks */}
            <Card data-testid="card-smart-blocks-stats" className="hover-elevate active-elevate-2 transition-all bg-emerald-50 dark:bg-emerald-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">القوالب الذكية</CardTitle>
              <div className="p-2 rounded-md bg-sky-500/20">
                <Blocks className="h-4 w-4 text-sky-500" data-testid="icon-smart-blocks" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold" data-testid="text-smart-blocks-total">
                    {stats?.smartBlocks?.total || 0}
                  </div>
                  <p className="text-xs text-muted-foreground" data-testid="text-smart-blocks-description">
                    قالب ذكي نشط
                  </p>
                </>
              )}
            </CardContent>
          </Card>
          </div>
        </div>

        {/* Section: Charts - Hidden for reporters */}
        {user?.role !== 'reporter' && (
        <div className="space-y-3">
          <SectionHeader title="التحليلات" color="bg-indigo-500" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Articles Distribution */}
          <Card data-testid="card-articles-chart" className="hover-elevate active-elevate-2 transition-all">
            <CardHeader>
              <CardTitle>توزيع المقالات</CardTitle>
              <CardDescription>حسب الحالة</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={articleChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={80}
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
              )}
            </CardContent>
          </Card>

          {/* Comments Distribution */}
          <Card data-testid="card-comments-chart" className="hover-elevate active-elevate-2 transition-all">
            <CardHeader>
              <CardTitle>توزيع التعليقات</CardTitle>
              <CardDescription>حسب الحالة</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={commentChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          </div>
        </div>
        )}

        {/* Section: Recent Activity */}
        <div className="space-y-3">
          <SectionHeader title="النشاط الأخير" color="bg-green-500" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Articles */}
          <Card data-testid="card-recent-articles" className="hover-elevate active-elevate-2 transition-all">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>أحدث المقالات</CardTitle>
                <CardDescription>آخر 5 مقالات تم إنشاؤها</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" data-testid="button-view-all-articles">
                <Link href="/dashboard/articles">عرض الكل</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : stats?.recentArticles && stats.recentArticles.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentArticles.map((article) => (
                    <div
                      key={article.id}
                      className="flex items-start justify-between p-3 border rounded-lg hover-elevate transition-all bg-blue-50 dark:bg-blue-950/30"
                      data-testid={`recent-article-${article.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium truncate text-sm" data-testid={`text-article-title-${article.id}`}>
                            {article.title}
                          </h4>
                          {getStatusBadge(article.status)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {safeFormatDistanceToNow(article.createdAt, {
                              addSuffix: true,
                              locale: arSA,
                            })}
                          </span>
                          <ViewsCount 
                            views={article.views}
                            iconClassName="h-3 w-3"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8" data-testid="text-no-recent-articles">
                  لا توجد مقالات حديثة
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recent Comments */}
          <Card data-testid="card-recent-comments" className="hover-elevate active-elevate-2 transition-all">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>أحدث التعليقات</CardTitle>
                <CardDescription>آخر 5 تعليقات</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm" data-testid="button-view-all-comments">
                <Link href="/dashboard/ai-moderation">الرقابة الذكية</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : stats?.recentComments && stats.recentComments.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentComments.map((comment) => (
                    <div
                      key={comment.id}
                      className="flex items-start justify-between p-3 border rounded-lg hover-elevate transition-all bg-green-50 dark:bg-green-950/30"
                      data-testid={`recent-comment-${comment.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm truncate" data-testid={`text-comment-content-${comment.id}`}>
                            {comment.content.substring(0, 80)}...
                          </p>
                          {getStatusBadge(comment.status)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {comment.user?.firstName || comment.user?.email || "مستخدم"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {safeFormatDistanceToNow(comment.createdAt, {
                              addSuffix: true,
                              locale: arSA,
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8" data-testid="text-no-recent-comments">
                  لا توجد تعليقات حديثة
                </p>
              )}
            </CardContent>
          </Card>
          </div>
        </div>

        {/* Upcoming Reminders, Tasks, and World Days - 3 columns on large screens */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 md:gap-6" data-testid="grid-reminders-tasks">
          <UpcomingRemindersWidget />
          <UpcomingTasksWidget />
          <UpcomingWorldDaysWidget deferLoading={!initialLoadComplete} />
        </div>

        {/* Top Articles */}
        <Card data-testid="card-top-articles" className="hover-elevate active-elevate-2 transition-all">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  أكثر المقالات مشاهدة
                </CardTitle>
                <CardDescription>أفضل 5 مقالات من حيث عدد المشاهدات</CardDescription>
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
                {stats.topArticles.map((article, index) => (
                  <div
                    key={article.id}
                    className="flex items-center gap-4 p-3 border rounded-lg hover-elevate transition-all bg-rose-50 dark:bg-rose-950/30"
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
                          <span>مشاهدة</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8" data-testid="text-no-top-articles">
                لا توجد مقالات
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
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
    <Card data-testid="card-upcoming-reminders" className="hover-elevate active-elevate-2 transition-all">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" data-testid="icon-reminders" />
          التذكيرات القادمة
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
                        try {
                          if (!reminder.reminderTime) return "غير متوفر";
                          const reminderDate = new Date(reminder.reminderTime);
                          if (Number.isNaN(reminderDate.getTime())) return "غير متوفر";
                          const now = new Date();
                          if (reminderDate > now) {
                            return `بعد ${formatDistance(reminderDate, now, { locale: arSA })}`;
                          } else {
                            return formatDistanceToNow(reminderDate, {
                              addSuffix: true,
                              locale: arSA,
                            });
                          }
                        } catch {
                          return "غير متوفر";
                        }
                      })()}
                    </span>
                    <Badge variant="outline" data-testid={`badge-reminder-channel-${reminder.id}`}>
                      {reminder.channelType === 'IN_APP' ? 'داخل التطبيق' :
                       reminder.channelType === 'EMAIL' ? 'بريد إلكتروني' : 
                       reminder.channelType === 'WHATSAPP' ? 'واتساب' :
                       reminder.channelType === 'SLACK' ? 'سلاك' : 
                       reminder.channelType}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8" data-testid="text-no-reminders">
            لا توجد تذكيرات قادمة
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
      const response = await fetch("/api/calendar/my-assignments?status=pending");
      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }
      return response.json();
    },
  });

  return (
    <Card data-testid="card-upcoming-tasks" className="hover-elevate active-elevate-2 transition-all">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" data-testid="icon-tasks" />
          المهام القادمة
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
                      {task.role === 'coordinator' ? 'منسق' :
                       task.role === 'reporter' ? 'مراسل' :
                       task.role === 'photographer' ? 'مصور' :
                       task.role === 'editor' ? 'محرر' :
                       task.role}
                    </Badge>
                    <Badge 
                      variant={task.status === 'pending' ? 'outline' : 'default'}
                      data-testid={`badge-task-status-${task.id}`}
                    >
                      {task.status === 'pending' ? 'معلق' :
                       task.status === 'in_progress' ? 'قيد التنفيذ' :
                       task.status === 'completed' ? 'مكتمل' :
                       task.status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8" data-testid="text-no-tasks">
            لا توجد مهام قادمة
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
      if (!reminder.reminderTime) return false;
      try {
        const reminderDate = new Date(reminder.reminderTime);
        if (Number.isNaN(reminderDate.getTime())) return false;
        return reminderDate >= now && reminderDate <= oneHourFromNow;
      } catch {
        return false;
      }
    });
  }, [reminders]);

  if (isLoading || dismissed || urgentReminders.length === 0) {
    return null;
  }

  const reminder = urgentReminders[0];
  let reminderDate: Date;
  let minutesUntil = 0;
  try {
    reminderDate = new Date(reminder.reminderTime);
    if (Number.isNaN(reminderDate.getTime())) {
      reminderDate = new Date();
    }
    const now = new Date();
    minutesUntil = Math.floor((reminderDate.getTime() - now.getTime()) / (1000 * 60));
  } catch {
    reminderDate = new Date();
  }

  return (
    <div 
      className="relative bg-gradient-to-r from-blue-50/80 via-blue-50/50 to-blue-50/80 dark:from-blue-950/30 dark:via-blue-950/20 dark:to-blue-950/30 border-r-4 border-r-blue-400 rounded-lg p-4 shadow-sm"
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
                  تذكير قريب جداً
                </h3>
                <Badge 
                  variant="outline" 
                  className="bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700"
                  data-testid="badge-urgent-time"
                >
                  {minutesUntil > 0 ? `بعد ${minutesUntil} دقيقة` : 'الآن'}
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
                  {reminderDate.toLocaleString('ar-SA-u-ca-gregory', { 
                    weekday: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
                <span className="text-blue-500 dark:text-blue-400">•</span>
                <span>
                  {reminder.channelType === 'IN_APP' ? 'داخل التطبيق' :
                   reminder.channelType === 'EMAIL' ? 'بريد إلكتروني' : 
                   reminder.channelType === 'WHATSAPP' ? 'واتساب' :
                   reminder.channelType === 'SLACK' ? 'سلاك' : 
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
              + {urgentReminders.length - 1} تذكير آخر قريب
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
