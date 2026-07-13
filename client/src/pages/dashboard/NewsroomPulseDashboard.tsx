import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  BellRing,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Eye,
  FileClock,
  FileText,
  Gauge,
  Heart,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  UserRoundCheck,
  WandSparkles,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardAnnouncementBanner } from "@/components/DashboardAnnouncementBanner";
import { MessagesTabs } from "@/components/dashboard/MessagesTabs";
import { OnlineModeratorsWidget } from "@/components/OnlineModeratorsWidget";
import { QuickActionsSection } from "@/components/QuickActionsSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { hasPermission, hasRole, useAuth } from "@/hooks/useAuth";
import { PERMISSION_CODES } from "@shared/rbac-constants";

interface DashboardStats {
  articles: {
    total: number;
    published: number;
    draft: number;
    archived: number;
    scheduled: number;
    publishedToday: number;
    publishedYesterday: number;
    pendingReview: number;
    needsChanges: number;
    totalViews: number;
    viewsToday: number;
    viewsYesterday: number;
  };
  users: {
    total: number;
    emailVerified: number;
    active24h: number;
    newThisWeek: number;
    activeToday: number;
    activeYesterday: number;
  };
  comments: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    receivedToday: number;
    moderatedToday: number;
    pendingOlderThanTwoHours: number;
  };
  categories: { total: number };
  abTests: { total: number; running: number };
  reactions: { total: number; todayCount: number; yesterdayCount: number };
  engagement: {
    averageTimeOnSite: number;
    totalReads: number;
    readsToday: number;
    readsYesterday: number;
  };
  audioNewsletters?: { total: number; published: number; totalListens: number };
  deepAnalyses?: { total: number; published: number };
  publishers?: { total: number; active: number };
  mediaLibrary?: { totalFiles: number; totalSize: number };
  aiTasks?: { total: number; pending: number; completed: number };
  aiImages?: { total: number; thisWeek: number };
  smartBlocks?: { total: number };
  recentArticles: Array<{
    id: string;
    title: string;
    status: string;
    views: number;
    createdAt: string;
  }>;
  recentComments: Array<{
    id: string;
    content: string;
    status: string;
    createdAt: string;
  }>;
  topArticles: Array<{
    id: string;
    title: string;
    views: number;
    category?: { nameAr: string };
  }>;
  trendingArticles: Array<{
    id: string;
    title: string;
    slug: string;
    views: number;
    recentViews: number;
    categoryName: string | null;
  }>;
  upcomingSchedule: Array<{ id: string; title: string; scheduledAt: string | null }>;
  hourlyViews: Array<{ hour: string; views: number }>;
  generatedAt: string;
}

interface DashboardPulse {
  articles: Pick<DashboardStats["articles"], "publishedToday" | "publishedYesterday" | "pendingReview" | "needsChanges" | "viewsYesterday">;
  comments: Pick<DashboardStats["comments"], "receivedToday" | "moderatedToday" | "pendingOlderThanTwoHours">;
  reactions: Pick<DashboardStats["reactions"], "yesterdayCount">;
  engagement: Pick<DashboardStats["engagement"], "readsYesterday">;
  trendingArticles: DashboardStats["trendingArticles"];
  upcomingSchedule: DashboardStats["upcomingSchedule"];
  hourlyViews: DashboardStats["hourlyViews"];
  generatedAt: string;
}

type IconType = React.ComponentType<{ className?: string }>;

const number = (value?: number) => (value ?? 0).toLocaleString("en-US");

const scheduleDateFormatter = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Riyadh",
});

const scheduleTimeFormatter = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Riyadh",
});

function scheduleCountdown(scheduledAt: string | null, nowMs: number): string | null {
  if (!scheduledAt) return null;
  const targetMs = new Date(scheduledAt).getTime();
  if (!Number.isFinite(targetMs)) return null;

  const remainingMs = targetMs - nowMs;
  if (remainingMs <= 0) return "حان موعد النشر";

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `متبقي ${number(days)} يوم${hours ? ` و${number(hours)} ساعة` : ""}`;
  }
  if (hours > 0) {
    return `متبقي ${number(hours)} ساعة${minutes ? ` و${number(minutes)} دقيقة` : ""}`;
  }
  return `متبقي ${number(minutes)} دقيقة`;
}

const percentChange = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

const duration = (seconds: number) => {
  if (!seconds) return "غير متاح";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const METRIC_TONES = {
  sky: {
    card: "border-sky-200/60 from-sky-50/70 to-card dark:border-sky-900/40 dark:from-sky-950/25",
    icon: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  },
  emerald: {
    card: "border-emerald-200/60 from-emerald-50/70 to-card dark:border-emerald-900/40 dark:from-emerald-950/25",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  teal: {
    card: "border-teal-200/60 from-teal-50/70 to-card dark:border-teal-900/40 dark:from-teal-950/25",
    icon: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
  },
  rose: {
    card: "border-rose-200/60 from-rose-50/70 to-card dark:border-rose-900/40 dark:from-rose-950/25",
    icon: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  },
  amber: {
    card: "border-amber-200/60 from-amber-50/70 to-card dark:border-amber-900/40 dark:from-amber-950/25",
    icon: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  },
  cyan: {
    card: "border-cyan-200/60 from-cyan-50/70 to-card dark:border-cyan-900/40 dark:from-cyan-950/25",
    icon: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  },
} as const;

type MetricTone = keyof typeof METRIC_TONES;

function MetricCard({
  title,
  value,
  previous,
  icon: Icon,
  helper,
  tone = "sky",
  loading,
}: {
  title: string;
  value: number | string;
  previous?: number;
  icon: IconType;
  helper?: string;
  tone?: MetricTone;
  loading?: boolean;
}) {
  const numericValue = typeof value === "number" ? value : undefined;
  const change = numericValue !== undefined && previous !== undefined
    ? percentChange(numericValue, previous)
    : undefined;
  const palette = METRIC_TONES[tone];

  return (
    <Card className={cn("overflow-hidden rounded-2xl border bg-gradient-to-br shadow-sm", palette.card)}>
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", palette.icon)}>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            {change !== undefined && !loading && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium",
                  change > 0 && "bg-emerald-100/90 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                  change < 0 && "bg-rose-100/90 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
                  change === 0 && "bg-muted/80 text-muted-foreground",
                )}
              >
                {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                {change > 0 ? "+" : ""}{change}%
              </span>
            )}
          </div>

          <div>
            <p className="text-[13px] font-semibold leading-snug text-foreground">{title}</p>
            {loading ? (
              <Skeleton className="mt-2 h-9 w-20" />
            ) : (
              <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight sm:text-[2rem]">
                {typeof value === "number" ? number(value) : value}
              </p>
            )}
            {change !== undefined && !loading && (
              <p className="mt-1 text-[11px] text-muted-foreground">مقارنةً بنفس الساعة أمس</p>
            )}
          </div>
        </div>

        {helper && (
          <div className="border-t border-border/50 bg-background/45 px-4 py-2.5 backdrop-blur-[2px]">
            <p className="text-[11px] leading-relaxed text-muted-foreground">{helper}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionCard({
  title,
  count,
  description,
  href,
  icon: Icon,
  tone,
}: {
  title: string;
  count: number;
  description: string;
  href: string;
  icon: IconType;
  tone: "danger" | "warning" | "info";
}) {
  const styles = {
    danger: {
      accent: "text-rose-600 dark:text-rose-400",
      icon: "bg-rose-50 text-rose-600 dark:bg-rose-950/35 dark:text-rose-400",
    },
    warning: {
      accent: "text-amber-700 dark:text-amber-400",
      icon: "bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-400",
    },
    info: {
      accent: "text-sky-700 dark:text-sky-400",
      icon: "bg-sky-50 text-sky-700 dark:bg-sky-950/35 dark:text-sky-400",
    },
  };
  const style = styles[tone];

  return (
    <Link href={href}>
      <a className="group block rounded-2xl border border-border/70 bg-card p-4 text-foreground shadow-none transition hover:border-border hover:bg-muted/20 hover:shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", style.icon)}>
            <Icon className="h-5 w-5" />
          </span>
          <ChevronLeft className="h-4 w-4 text-muted-foreground/60 transition group-hover:-translate-x-1" />
        </div>
        <div className={cn("mt-4 text-2xl font-bold", style.accent)}>{number(count)}</div>
        <div className="mt-1 text-sm font-semibold">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </a>
    </Link>
  );
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function SmartBrief({ stats, muqtarabCount, operationalOnly = false }: { stats: DashboardStats; muqtarabCount: number; operationalOnly?: boolean }) {
  const priority = operationalOnly
    ? stats.articles.needsChanges > 0
      ? `${number(stats.articles.needsChanges)} مواد تحتاج تعديلات`
      : `${number(stats.articles.pendingReview)} مواد تنتظر المراجعة`
    : stats.comments.pendingOlderThanTwoHours > 0
      ? `${number(stats.comments.pendingOlderThanTwoHours)} تعليقاً تجاوز ساعتين دون مراجعة`
      : `${number(stats.comments.pending)} تعليقاً ينتظر المراجعة`;
  const trend = percentChange(stats.articles.viewsToday, stats.articles.viewsYesterday);
  const scheduleMessage = stats.articles.scheduled > 0
    ? `ولديك ${number(stats.articles.scheduled)} مواد مجدولة.`
    : "ولا توجد مواد مجدولة حالياً.";

  return (
    <Card className="overflow-hidden border-primary/15 bg-gradient-to-l from-primary/[0.07] via-background to-background shadow-none">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <WandSparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold">موجز سبق الذكي</h2>
                <Badge variant="secondary" className="text-[10px]">مبني على بيانات اللحظة</Badge>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                الأولوية الآن: <strong className="text-foreground">{priority}</strong>.
                {!operationalOnly && muqtarabCount > 0 && <> وهناك <strong className="text-foreground">{number(muqtarabCount)} موضوعاً في مُقترب</strong> بانتظار القرار.</>}
                {operationalOnly
                  ? <> {scheduleMessage}</>
                  : <> مرات فتح الأخبار {trend >= 0 ? "أعلى" : "أقل"} من أمس بنسبة {Math.abs(trend)}%، {scheduleMessage}</>}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild size="sm"><Link href={operationalOnly ? "/dashboard/articles" : "/dashboard/ai-moderation"}>ابدأ بالأولوية</Link></Button>
            <Button asChild size="sm" variant="outline"><Link href="/dashboard/articles">إدارة المحتوى</Link></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditorialPipeline({ stats }: { stats: DashboardStats }) {
  const steps = [
    { label: "مسودات", value: stats.articles.draft, color: "bg-slate-400" },
    { label: "بانتظار المراجعة", value: stats.articles.pendingReview, color: "bg-amber-500" },
    { label: "تحتاج تعديلات", value: stats.articles.needsChanges, color: "bg-rose-500" },
    { label: "مجدولة", value: stats.articles.scheduled, color: "bg-sky-500" },
    { label: "نُشرت اليوم", value: stats.articles.publishedToday, color: "bg-emerald-500" },
  ];
  const max = Math.max(...steps.map((step) => step.value), 1);

  return (
    <Card className="h-full border-border/70 shadow-none">
      <CardHeader className="pb-3"><CardTitle className="text-base">مسار العمل التحريري</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step) => (
          <div key={step.label}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{step.label}</span>
              <strong>{number(step.value)}</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", step.color)} style={{ width: `${Math.max((step.value / max) * 100, step.value ? 5 : 0)}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function OperationsCards() {
  const { data: remindersRaw } = useQuery<Array<{ id: string; eventTitle: string; reminderTime: string }>>({
    queryKey: ["/api/calendar/upcoming-reminders"],
  });
  const { data: tasksRaw } = useQuery<Array<{ id: string; eventTitle: string; status: string }>>({
    queryKey: ["/api/calendar/my-assignments?status=pending"],
  });
  const reminders = Array.isArray(remindersRaw) ? remindersRaw.slice(0, 3) : [];
  const tasks = Array.isArray(tasksRaw) ? tasksRaw.slice(0, 3) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" /> التذكيرات القادمة</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {reminders.length ? reminders.map((item) => (
            <div key={item.id} className="rounded-xl border bg-muted/20 p-3 text-sm">{item.eventTitle}</div>
          )) : <p className="py-4 text-center text-sm text-muted-foreground">لا توجد تذكيرات قريبة</p>}
        </CardContent>
      </Card>
      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4 text-primary" /> مهامي القادمة</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {tasks.length ? tasks.map((item) => (
            <div key={item.id} className="rounded-xl border bg-muted/20 p-3 text-sm">{item.eventTitle}</div>
          )) : <p className="py-4 text-center text-sm text-muted-foreground">لا توجد مهام معلقة</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function UpcomingScheduleList({ schedule }: { schedule: DashboardStats["upcomingSchedule"] }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!schedule.length) {
    return (
      <div className="py-10 text-center">
        <CalendarClock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">لا توجد مواد مجدولة قادمة</p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/dashboard/articles/new">إضافة مادة</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {schedule.map((article) => {
        const scheduledDate = article.scheduledAt ? new Date(article.scheduledAt) : null;
        const hasValidDate = scheduledDate && Number.isFinite(scheduledDate.getTime());
        const countdown = scheduleCountdown(article.scheduledAt, nowMs);

        return (
          <Link key={article.id} href={`/dashboard/articles/${article.id}/edit`}>
            <a className="group block rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-muted/20 hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarClock className="h-5 w-5" />
                </span>
                <p className="min-w-0 flex-1 line-clamp-2 pt-0.5 text-sm font-semibold leading-6">
                  {article.title}
                </p>
                <ArrowLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:-translate-x-1" />
              </div>

              {hasValidDate ? (
                <div className="mt-4 flex items-center gap-2 overflow-x-auto rounded-xl border border-primary/10 bg-primary/[0.045] px-3 py-2.5 text-xs">
                  <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-foreground">
                    <CalendarDays className="h-3.5 w-3.5 text-primary" />
                    <span className="font-medium">{scheduleDateFormatter.format(scheduledDate)}</span>
                  </span>
                  <span className="h-3.5 w-px shrink-0 bg-primary/15" aria-hidden />
                  <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-foreground">
                    <Clock3 className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold">{scheduleTimeFormatter.format(scheduledDate)}</span>
                  </span>
                  {countdown && (
                    <>
                      <span className="h-3.5 w-px shrink-0 bg-primary/15" aria-hidden />
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 gap-1.5 border-0 px-2.5 py-1 whitespace-nowrap",
                          countdown === "حان موعد النشر"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                            : "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
                        )}
                      >
                        <Timer className="h-3.5 w-3.5" />
                        {countdown}
                      </Badge>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  لم يحدد وقت النشر
                </div>
              )}
            </a>
          </Link>
        );
      })}
    </div>
  );
}

export default function NewsroomPulseDashboard() {
  const { user, isLoading: userLoading } = useAuth({ redirectToLogin: true });
  const [, navigate] = useLocation();
  const isAngleWriter = hasRole(user, "angle_writer");
  const isContentManager = hasRole(user, "content_manager");
  const hasElevatedDashboardRole = hasRole(user, "admin", "system_admin", "editor", "content_manager", "analyst", "reviewer", "author", "comments_moderator");
  const isReporterOnly = hasRole(user, "reporter") && !hasElevatedDashboardRole;
  const canViewStats = !isReporterOnly && (hasPermission(user, PERMISSION_CODES.DASHBOARD_VIEW_STATS) || hasRole(user, "admin", "system_admin", "editor", "content_manager"));
  const canReviewMuqtarab = hasPermission(user, "muqtarab.manage");
  const canViewMessages = hasPermission(user, PERMISSION_CODES.DASHBOARD_VIEW_MESSAGES);
  const canViewWriterTickets = hasRole(user, "admin", "editor", "system_admin");

  useEffect(() => {
    if (user?.role === "opinion_author") navigate("/dashboard/opinion-author", { replace: true });
    if (user && isAngleWriter) navigate("/dashboard/my-angle", { replace: true });
    if (user && isReporterOnly) navigate("/dashboard/reporter/articles", { replace: true });
  }, [user, isAngleWriter, isReporterOnly, navigate]);

  const statsQuery = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard/stats"],
    enabled: !!user && canViewStats,
    refetchInterval: 120_000,
  });
  const pulseQuery = useQuery<DashboardPulse>({
    queryKey: ["/api/admin/dashboard/pulse"],
    enabled: !!user && canViewStats,
    refetchInterval: 120_000,
  });
  const { data: muqtarabRaw } = useQuery<Array<{ id: string }>>({
    queryKey: ["/api/admin/muqtarab/review-queue"],
    enabled: !!user && canReviewMuqtarab,
    refetchInterval: 120_000,
  });
  const muqtarabCount = Array.isArray(muqtarabRaw) ? muqtarabRaw.length : 0;
  const stats = useMemo<DashboardStats | undefined>(() => {
    const base = statsQuery.data;
    const pulse = pulseQuery.data;
    if (!base) return undefined;
    return {
      ...base,
      articles: {
        ...base.articles,
        publishedToday: 0,
        publishedYesterday: 0,
        pendingReview: 0,
        needsChanges: 0,
        viewsYesterday: 0,
        ...pulse?.articles,
      },
      users: { ...base.users, activeYesterday: 0 },
      comments: {
        ...base.comments,
        receivedToday: 0,
        moderatedToday: 0,
        pendingOlderThanTwoHours: 0,
        ...pulse?.comments,
      },
      reactions: { ...base.reactions, yesterdayCount: 0, ...pulse?.reactions },
      engagement: { ...base.engagement, readsYesterday: 0, ...pulse?.engagement },
      trendingArticles: pulse?.trendingArticles ?? [],
      upcomingSchedule: pulse?.upcomingSchedule ?? [],
      hourlyViews: pulse?.hourlyViews ?? [],
      generatedAt: pulse?.generatedAt ?? new Date().toISOString(),
    };
  }, [statsQuery.data, pulseQuery.data]);

  const dateLabel = useMemo(() => new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date()), []);

  const refreshedAt = stats?.generatedAt
    ? new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit" }).format(new Date(stats.generatedAt))
    : "—";

  if (userLoading || !user || isAngleWriter || isReporterOnly || user.role === "opinion_author") {
    return <DashboardLayout><div className="space-y-4"><Skeleton className="h-20 w-full" /><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-32" />)}</div></div></DashboardLayout>;
  }

  if (!stats && !statsQuery.isLoading) {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-xl"><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" /><h2 className="font-bold">تعذر تحميل نبض غرفة الأخبار</h2><Button className="mt-4" onClick={() => statsQuery.refetch()}>إعادة المحاولة</Button></CardContent></Card>
      </DashboardLayout>
    );
  }

  const pipelineTotal = stats ? stats.articles.draft + stats.articles.pendingReview + stats.articles.needsChanges + stats.articles.scheduled : 0;
  const schedule = stats?.upcomingSchedule ?? [];
  const trending = stats?.trendingArticles?.length ? stats.trendingArticles : (stats?.topArticles ?? []).map((article) => ({
    id: article.id,
    title: article.title,
    slug: "",
    views: article.views,
    recentViews: 0,
    categoryName: article.category?.nameAr ?? null,
  }));
  const platformItems = stats ? (isContentManager ? [
    ["إجمالي المقالات", number(stats.articles.total)],
    ["التصنيفات", number(stats.categories.total)],
    ["ملفات الوسائط", number(stats.mediaLibrary?.totalFiles)],
  ] : [
    ["إجمالي المقالات", number(stats.articles.total)],
    ["المستخدمون", number(stats.users.total)],
    ["التصنيفات", number(stats.categories.total)],
    ["ملفات الوسائط", number(stats.mediaLibrary?.totalFiles)],
    ["الناشرون النشطون", number(stats.publishers?.active)],
    ["القوالب الذكية", number(stats.smartBlocks?.total)],
    ["صور الذكاء", number(stats.aiImages?.total)],
    ["صور هذا الأسبوع", number(stats.aiImages?.thisWeek)],
    ["تحليلات عميقة", number(stats.deepAnalyses?.total)],
    ["نشرات صوتية", number(stats.audioNewsletters?.total)],
    ["اختبارات نشطة", number(stats.abTests.running)],
    ["مستخدمون جدد أسبوعياً", number(stats.users.newThisWeek)],
  ]) : [];

  return (
    <DashboardLayout>
      <main dir="rtl" className="mx-auto max-w-[1600px] space-y-7 pb-10">
        <DashboardAnnouncementBanner deferLoading={statsQuery.isLoading} />

        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">{dateLabel}</p>
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Activity className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">نبض سبق اليوم</h1>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">مرحباً {user.firstName || "بك"}، هذه الأولويات وما يحدث في غرفة الأخبار الآن.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-emerald-500" /> آخر تحديث {refreshedAt}</span>
            <Button variant="outline" size="sm" onClick={() => { statsQuery.refetch(); pulseQuery.refetch(); }} disabled={statsQuery.isFetching || pulseQuery.isFetching} className="gap-2">
              <RefreshCw className={cn("h-3.5 w-3.5", (statsQuery.isFetching || pulseQuery.isFetching) && "animate-spin")} /> تحديث
            </Button>
          </div>
        </header>

        <section className="space-y-3">
          <SectionTitle title="يتطلب تدخلك" description="الأعمال التي لا ينبغي أن تبقى في قائمة الانتظار" />
          <div className={cn("grid gap-3 sm:grid-cols-2", !isContentManager && "xl:grid-cols-4")}>
            {!isContentManager && <ActionCard title="تعليقات للمراجعة" count={stats?.comments.pending ?? 0} description={stats?.comments.pendingOlderThanTwoHours ? `${number(stats.comments.pendingOlderThanTwoHours)} تجاوزت ساعتين` : "ضمن وقت الاستجابة"} href="/dashboard/ai-moderation" icon={MessageSquare} tone="danger" />}
            {canReviewMuqtarab && <ActionCard title="مراجعة مُقترب" count={muqtarabCount} description="مواضيع تنتظر قرار التحرير" href="/dashboard/muqtarab/review" icon={BellRing} tone="warning" />}
            <ActionCard title="المسار التحريري" count={pipelineTotal} description={`${number(stats?.articles.scheduled)} مواد مجدولة`} href="/dashboard/articles" icon={FileClock} tone="info" />
            <ActionCard title="تحتاج تعديلات" count={stats?.articles.needsChanges ?? 0} description="مواد أُعيدت للمعالجة" href="/dashboard/articles" icon={AlertTriangle} tone="warning" />
          </div>
          {(canViewMessages || canViewWriterTickets) && <MessagesTabs showVisitorMessages={canViewMessages} showWriterTickets={canViewWriterTickets} />}
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <div className="min-w-0"><QuickActionsSection /></div>
          <OnlineModeratorsWidget />
        </section>

        {stats && <SmartBrief stats={stats} muqtarabCount={muqtarabCount} operationalOnly={isContentManager} />}

        {!isContentManager && <section className="space-y-3">
          <SectionTitle title="أداء اليوم" description="أرقام اليوم حتى الآن، مقارنةً بنفس الساعة من أمس" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <MetricCard title="نُشر اليوم" value={stats?.articles.publishedToday ?? 0} previous={stats?.articles.publishedYesterday} icon={FileText} helper="مواد نُشرت منذ منتصف الليل" tone="emerald" loading={statsQuery.isLoading} />
            <MetricCard title="مرات فتح الأخبار" value={stats?.articles.viewsToday ?? 0} previous={stats?.articles.viewsYesterday} icon={Eye} helper="يشمل كل الزوار" tone="sky" loading={statsQuery.isLoading} />
            <MetricCard title="قراءات الأعضاء" value={stats?.engagement.readsToday ?? 0} previous={stats?.engagement.readsYesterday} icon={BarChart3} helper="للأعضاء المسجّلين فقط" tone="teal" loading={statsQuery.isLoading} />
            <MetricCard title="تفاعلات اليوم" value={stats?.reactions.todayCount ?? 0} previous={stats?.reactions.yesterdayCount} icon={Heart} helper="إعجابات وردود الفعل" tone="rose" loading={statsQuery.isLoading} />
            <MetricCard title="أعضاء نشطون" value={stats?.users.activeToday ?? 0} icon={UserRoundCheck} helper="سجّلوا نشاطاً منذ منتصف الليل" tone="amber" loading={statsQuery.isLoading} />
            <MetricCard title="متوسط مدة القراءة" value={duration(stats?.engagement.averageTimeOnSite ?? 0)} icon={Clock3} helper="دقيقة:ثانية · من جلسات الأعضاء" tone="cyan" loading={statsQuery.isLoading} />
          </div>
        </section>}

        <section className={cn("grid gap-4", !isContentManager && "xl:grid-cols-2")}>
          {!isContentManager && <Card className="border-border/70 shadow-none">
            <CardHeader className="pb-2"><CardTitle className="text-base">حركة فتح الأخبار اليوم</CardTitle></CardHeader>
            <CardContent>
              {statsQuery.isLoading ? <Skeleton className="h-[260px] w-full" /> : stats?.hourlyViews?.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={stats.hourlyViews} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25}/><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                    <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={42} />
                    <ChartTooltip formatter={(value: number) => [number(value), "فتحة"]} />
                    <Area type="monotone" dataKey="views" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#viewsFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="flex h-[260px] flex-col items-center justify-center text-center text-muted-foreground"><Gauge className="mb-3 h-8 w-8 opacity-30" /><p className="text-sm">ستظهر الحركة عند تسجيل فتحات الأخبار</p></div>}
            </CardContent>
          </Card>}
          {stats && <EditorialPipeline stats={stats} />}
        </section>

        <section className={cn("grid gap-4", !isContentManager && "xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,.75fr)]")}>
          {!isContentManager && <Card className="border-border/70 shadow-none">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-emerald-500" /> المقالات الصاعدة</CardTitle><p className="mt-1 text-xs text-muted-foreground">الأسرع في آخر 24 ساعة، ثم الأعلى إجمالاً عند غياب بيانات اللحظة</p></div>
              <Button asChild variant="ghost" size="sm"><Link href="/dashboard/articles">عرض الكل</Link></Button>
            </CardHeader>
            <CardContent className="grid gap-3">
              {trending.slice(0, 5).map((article, index) => (
                <Link key={article.id} href={`/dashboard/articles/${article.id}/edit`}>
                  <a className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-500/25 hover:bg-muted/20 hover:shadow-md">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xs font-bold text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300">{index + 1}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{article.title}</p><div className="mt-1 flex gap-3 text-[11px] text-muted-foreground">{article.categoryName && <span>{article.categoryName}</span>}<span>{article.recentViews ? `${number(article.recentViews)} خلال 24 ساعة` : `${number(article.views)} إجمالاً`}</span></div></div>
                    <ArrowLeft className="h-4 w-4 text-muted-foreground/60 transition group-hover:-translate-x-1" />
                  </a>
                </Link>
              ))}
              {!trending.length && <p className="py-10 text-center text-sm text-muted-foreground">لا توجد بيانات كافية للمقالات الصاعدة</p>}
            </CardContent>
          </Card>}

          <Card className="border-border/70 shadow-none">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" /> جدول النشر القادم</CardTitle></CardHeader>
            <CardContent>
              <UpcomingScheduleList schedule={schedule} />
            </CardContent>
          </Card>
        </section>

        {!isContentManager && <section className="space-y-3">
          <SectionTitle title="التشغيل والمتابعة" description="المهام والتذكيرات القريبة من يوم العمل" />
          <OperationsCards />
        </section>}

        {isContentManager && (
          <Card className="border-border/70 shadow-none">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold">إنتاجية فريق المحتوى</h2>
                <p className="mt-1 text-sm text-muted-foreground">متابعة إنتاج المواد وأداء الفريق وفق الصلاحية الممنوحة لك.</p>
              </div>
              <Button asChild variant="outline"><Link href="/dashboard/productivity">فتح لوحة الإنتاجية</Link></Button>
            </CardContent>
          </Card>
        )}

        <details className="group rounded-2xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"><Gauge className="h-5 w-5" /></span><div><h2 className="font-bold">{isContentManager ? "إجماليات المحتوى" : "صحة المنصة والإجماليات"}</h2><p className="mt-1 text-xs text-muted-foreground">{isContentManager ? "بيانات تشغيلية خاصة بإدارة المحتوى" : "بيانات إدارية لا تحتاج متابعة يومية"}</p></div></div>
            <ChevronLeft className="h-5 w-5 text-muted-foreground transition group-open:-rotate-90" />
          </summary>
          {stats && (
            <div className="grid grid-cols-2 gap-3 border-t p-5 md:grid-cols-4 xl:grid-cols-6">
              {platformItems.map(([label, value]) => <div key={label} className="rounded-xl bg-muted/35 p-3"><div className="text-lg font-bold">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div>)}
            </div>
          )}
        </details>

        <div className="fixed bottom-4 left-4 z-20 sm:hidden">
          <Button asChild className="h-12 rounded-full px-5 shadow-lg"><Link href="/dashboard/articles/new"><Sparkles className="ml-2 h-4 w-4" /> مادة جديدة</Link></Button>
        </div>
      </main>
    </DashboardLayout>
  );
}
