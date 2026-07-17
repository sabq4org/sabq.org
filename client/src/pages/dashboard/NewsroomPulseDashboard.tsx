import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  EyeOff,
  FileClock,
  FilePenLine,
  FileText,
  Flame,
  Gauge,
  Heart,
  MessageSquare,
  Radar,
  RefreshCw,
  Sparkles,
  Star,
  Timer,
  TrendingDown,
  TrendingUp,
  UserPlus,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getHighestRole, hasPermission, hasRole, useAuth } from "@/hooks/useAuth";
import { useDashboardFavorites } from "@/hooks/useDashboardFavorites";
import { useNav, trackNavClick } from "@/nav/useNav";
import { resolveUserRole } from "@/lib/roleMapping";
import type { UserRole } from "@/nav/types";
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

function MetricCard({
  title,
  value,
  previous,
  icon: Icon,
  helper,
  loading,
}: {
  title: string;
  value: number | string;
  previous?: number;
  icon: IconType;
  helper?: string;
  loading?: boolean;
}) {
  const numericValue = typeof value === "number" ? value : undefined;
  const change = numericValue !== undefined && previous !== undefined
    ? percentChange(numericValue, previous)
    : undefined;

  return (
    <Card className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-none sm:rounded-2xl sm:shadow-sm">
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex flex-1 flex-col gap-2 p-3 sm:gap-3 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-10 sm:w-10 sm:rounded-xl">
              <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
            </span>
            {change !== undefined && !loading && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:px-2 sm:py-1 sm:text-[11px]",
                  change > 0 && "bg-primary/10 text-primary",
                  change < 0 && "bg-destructive/10 text-destructive",
                  change === 0 && "bg-muted text-muted-foreground",
                )}
              >
                {change > 0 ? <TrendingUp className="h-3 w-3" /> : change < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                {change > 0 ? "+" : ""}{change}%
              </span>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold leading-snug text-foreground sm:text-[13px]">{title}</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-16 sm:h-9 sm:w-20" />
            ) : (
              <p className="mt-1 text-xl font-bold tabular-nums tracking-tight sm:mt-1.5 sm:text-[2rem]">
                {typeof value === "number" ? number(value) : value}
              </p>
            )}
            {change !== undefined && !loading && (
              <p className="mt-1 hidden text-[11px] text-muted-foreground sm:block">مقارنةً بنفس الساعة أمس</p>
            )}
          </div>
        </div>

        {helper && (
          <div className="hidden border-t border-border/60 bg-muted/30 px-4 py-2.5 sm:block">
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
  // Desktop keeps the original vertical card; mobile uses a compact row.
  const styles = {
    danger: {
      accent: "text-destructive",
      icon: "bg-destructive/10 text-destructive",
    },
    warning: {
      accent: "text-primary",
      icon: "bg-primary/10 text-primary",
    },
    info: {
      accent: "text-primary",
      icon: "bg-primary/10 text-primary",
    },
  };
  const style = styles[tone];

  return (
    <Link href={href}>
      <a className="group block rounded-xl border border-border/70 bg-card text-foreground shadow-none transition hover:border-border hover:bg-muted/20 hover:shadow-sm sm:rounded-2xl">
        {/* Mobile: compact horizontal row */}
        <div className="flex items-center gap-2.5 px-2.5 py-2 sm:hidden">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", style.icon)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-tight">{title}</div>
            <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{description}</p>
          </div>
          <div className={cn("shrink-0 text-base font-bold tabular-nums", style.accent)}>{number(count)}</div>
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        </div>

        {/* Desktop/tablet: original vertical card */}
        <div className="hidden p-4 sm:block">
          <div className="flex items-start justify-between gap-3">
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", style.icon)}>
              <Icon className="h-5 w-5" />
            </span>
            <ChevronLeft className="h-4 w-4 text-muted-foreground/60 transition group-hover:-translate-x-1" />
          </div>
          <div className={cn("mt-4 text-2xl font-bold", style.accent)}>{number(count)}</div>
          <div className="mt-1 text-sm font-semibold">{title}</div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </a>
    </Link>
  );
}

function SectionTitle({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold sm:text-xl">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground max-sm:line-clamp-1">{description}</p>}
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
    <Card className="overflow-hidden border-border bg-card shadow-none sm:shadow-sm">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between sm:gap-5">
          <div className="flex gap-3 sm:gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary sm:h-11 sm:w-11 sm:rounded-2xl">
              <WandSparkles className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold sm:text-base">موجز سبق الذكي</h2>
                <Badge variant="secondary" className="text-[10px]">مبني على بيانات اللحظة</Badge>
              </div>
              <p className="mt-1.5 max-w-3xl text-xs leading-6 text-muted-foreground sm:mt-2 sm:text-sm sm:leading-7">
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
            <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex"><Link href="/dashboard/articles">إدارة المحتوى</Link></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EditorialPipeline({ stats }: { stats: DashboardStats }) {
  const steps = [
    { label: "مسودات", value: stats.articles.draft, color: "bg-muted-foreground/45" },
    { label: "بانتظار المراجعة", value: stats.articles.pendingReview, color: "bg-secondary" },
    { label: "تحتاج تعديلات", value: stats.articles.needsChanges, color: "bg-destructive" },
    { label: "مجدولة", value: stats.articles.scheduled, color: "bg-primary" },
    { label: "نُشرت اليوم", value: stats.articles.publishedToday, color: "bg-primary/70" },
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
                            ? "bg-secondary text-secondary-foreground"
                            : "bg-primary/10 text-primary",
                        )}
                      >
                        <Timer className="h-3.5 w-3.5" />
                        {countdown}
                      </Badge>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-secondary/80 p-3 text-xs font-medium text-secondary-foreground">
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

// ============================================
// قسم «فجوات التغطية الآن» — مواضيع رصدها الرادار الذكي بلا تغطية داخلية.
// المصدر: GET /api/admin/dashboard/coverage-gaps (رادار الفجوات #949/#950)
// ============================================

type CoverageGapStatus = "open" | "drafting" | "scheduled" | "covered" | "dismissed";

interface CoverageGapActiveEditor {
  userId: string;
  userName: string;
  userAvatar: string | null;
}

interface CoverageGap {
  id: string;
  radarItemId: string;
  storyId?: string | null;
  title: string;
  originalTitle: string;
  link: string;
  imageUrl: string | null;
  sourceName: string | null;
  sourceType: string | null;
  sourceCount?: number | null;
  publishedAt: string | null;
  isBreaking: boolean;
  newsValue: number | null;
  topicFingerprint: string;
  heatScore: number;
  relevanceScore?: number | null;
  momentumScore?: number | null;
  gapReason?: string[] | null;
  status: CoverageGapStatus;
  firstDetectedAt: string;
  coveredByArticleId: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  activeEditors: CoverageGapActiveEditor[];
}

interface CoverageGapsResponse {
  gaps: CoverageGap[];
  matcher: { lastRunAt: string | null; lastRunMode: string | null; isRunning: boolean };
}

const COVERAGE_GAPS_KEY = "/api/admin/dashboard/coverage-gaps";

/** صياغة الجمع العربي: مفرد/مثنى/جمع قلة/جمع كثرة */
function arabicCount(value: number, one: string, two: string, few: string, many: string): string {
  if (value === 1) return one;
  if (value === 2) return two;
  if (value >= 3 && value <= 10) return `${number(value)} ${few}`;
  return `${number(value)} ${many}`;
}

/** عدّاد عُمر الموضوع — من وقت نشر المصدر (publishedAt) مع سقوط إلى وقت اكتشاف الفجوة؛ يتجدد كل 30 ثانية */
function gapAgeLabel(startIso: string, nowMs: number): string {
  const startedMs = new Date(startIso).getTime();
  if (!Number.isFinite(startedMs)) return "تتصاعد الآن";
  const elapsedMinutes = Math.max(1, Math.floor((nowMs - startedMs) / 60_000));
  if (elapsedMinutes < 60) return `تتصاعد منذ ${arabicCount(elapsedMinutes, "دقيقة", "دقيقتين", "دقائق", "دقيقة")}`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `تتصاعد منذ ${arabicCount(hours, "ساعة", "ساعتين", "ساعات", "ساعة")}`;
  return `تتصاعد منذ ${arabicCount(Math.floor(hours / 24), "يوم", "يومين", "أيام", "يوماً")}`;
}

/** مؤشر الحرارة متدرج اللون من heatScore (0–100) */
function heatTier(score: number) {
  if (score >= 80) return { label: "حار جداً", bar: "bg-destructive", text: "text-destructive", chip: "bg-destructive/10 text-destructive" };
  if (score >= 60) return { label: "حار", bar: "bg-warning", text: "text-warning", chip: "bg-warning/10 text-warning" };
  if (score >= 40) return { label: "متوسط", bar: "bg-primary", text: "text-primary", chip: "bg-primary/10 text-primary" };
  return { label: "هادئ", bar: "bg-muted-foreground/50", text: "text-muted-foreground", chip: "bg-muted text-muted-foreground" };
}

function gapStatusBadge(gap: CoverageGap): { label: string; className: string } {
  switch (gap.status) {
    case "open":
      return { label: "لا تغطية", className: "bg-destructive/10 text-destructive border-destructive/20" };
    case "drafting": {
      const editors = gap.activeEditors?.map((e) => e.userName).filter(Boolean) ?? [];
      return {
        label: editors.length ? `مسودة قيد الإعداد — ${editors.join("، ")}` : "مسودة قيد الإعداد",
        className: "bg-primary/10 text-primary border-primary/20",
      };
    }
    case "scheduled":
      return { label: "مجدولة", className: "bg-secondary text-secondary-foreground border-secondary" };
    default:
      return { label: "مغطاة", className: "bg-muted text-muted-foreground border-border" };
  }
}

function CoverageGapsSection() {
  const { toast } = useToast();
  const queryClientHook = useQueryClient();
  const [, navigate] = useLocation();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [assignTarget, setAssignTarget] = useState<CoverageGap | null>(null);
  const [assignNote, setAssignNote] = useState("");
  const [assignDueAt, setAssignDueAt] = useState("");

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const gapsQuery = useQuery<CoverageGapsResponse>({
    queryKey: [COVERAGE_GAPS_KEY],
    refetchInterval: 120_000,
  });

  // guard على المصفوفات — TanStack قد يعيد null؛ نخفي المستبعدة والمغطاة ونكتفي بـ 5
  const gaps = useMemo(() => {
    const list = Array.isArray(gapsQuery.data?.gaps) ? gapsQuery.data.gaps : [];
    return list.filter((gap) => gap.status !== "dismissed" && gap.status !== "covered").slice(0, 5);
  }, [gapsQuery.data]);

  const invalidateGaps = () => queryClientHook.invalidateQueries({ queryKey: [COVERAGE_GAPS_KEY] });

  // إنشاء مسودة أولية — تحديث متفائل للحالة ثم invalidate
  const draftMutation = useMutation({
    mutationFn: async (gapId: string) =>
      apiRequest(`/api/admin/coverage-gaps/${gapId}/draft`, { method: "POST" }),
    onMutate: async (gapId) => {
      await queryClientHook.cancelQueries({ queryKey: [COVERAGE_GAPS_KEY] });
      const previous = queryClientHook.getQueryData<CoverageGapsResponse>([COVERAGE_GAPS_KEY]);
      queryClientHook.setQueryData<CoverageGapsResponse>([COVERAGE_GAPS_KEY], (old) =>
        old ? { ...old, gaps: old.gaps.map((gap) => (gap.id === gapId ? { ...gap, status: "drafting" } : gap)) } : old,
      );
      return { previous };
    },
    onError: (error, _gapId, context) => {
      if (context?.previous) queryClientHook.setQueryData([COVERAGE_GAPS_KEY], context.previous);
      toast({
        title: "تعذر إنشاء المسودة",
        description: error instanceof Error ? error.message : "حاول مجدداً بعد قليل",
        variant: "destructive",
      });
    },
    onSuccess: (data: any) => {
      invalidateGaps();
      toast({
        title: "أُنشئت المسودة الأولية",
        description: "الفجوة انتقلت إلى «قيد الإعداد» — أكملها من محرر المقالات.",
        action: data?.articleId ? (
          <ToastAction altText="فتح المسودة" onClick={() => navigate(`/dashboard/articles/${data.articleId}/edit`)}>
            فتح المسودة
          </ToastAction>
        ) : undefined,
      });
    },
  });

  // تجاهل فجوة — إخفاء البطاقة فوراً (متفائل) ثم invalidate
  const dismissMutation = useMutation({
    mutationFn: async (gapId: string) =>
      apiRequest(`/api/admin/coverage-gaps/${gapId}/dismiss`, { method: "POST", body: JSON.stringify({}) }),
    onMutate: async (gapId) => {
      await queryClientHook.cancelQueries({ queryKey: [COVERAGE_GAPS_KEY] });
      const previous = queryClientHook.getQueryData<CoverageGapsResponse>([COVERAGE_GAPS_KEY]);
      queryClientHook.setQueryData<CoverageGapsResponse>([COVERAGE_GAPS_KEY], (old) =>
        old ? { ...old, gaps: old.gaps.filter((gap) => gap.id !== gapId) } : old,
      );
      return { previous };
    },
    onError: (error, _gapId, context) => {
      if (context?.previous) queryClientHook.setQueryData([COVERAGE_GAPS_KEY], context.previous);
      toast({
        title: "تعذر تجاهل الفجوة",
        description: error instanceof Error ? error.message : "حاول مجدداً بعد قليل",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      invalidateGaps();
      toast({ title: "تم التجاهل", description: "أُخفيت الفجوة من قائمة المتابعة." });
    },
  });

  // تكليف محرر — الـ API يسند للمستخدم الحالي عند غياب userId
  const assignMutation = useMutation({
    mutationFn: async ({ gapId, note, dueAt }: { gapId: string; note?: string; dueAt?: string }) =>
      apiRequest(`/api/admin/coverage-gaps/${gapId}/assign`, {
        method: "POST",
        body: JSON.stringify({ ...(note ? { note } : {}), ...(dueAt ? { dueAt } : {}) }),
      }),
    onError: (error) => {
      toast({
        title: "تعذر تكليف الفجوة",
        description: error instanceof Error ? error.message : "حاول مجدداً بعد قليل",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      invalidateGaps();
      setAssignTarget(null);
      setAssignNote("");
      setAssignDueAt("");
      toast({ title: "تم التكليف", description: "أُنشئت مهمة تغطية في التقويم التحريري وأُسندت إليك." });
    },
  });

  const renderActions = (gap: CoverageGap, compact = false) => (
    <div className={cn("flex flex-wrap items-center gap-1.5", compact && "gap-1")}>
      <Button
        size="sm"
        variant="outline"
        className={cn("gap-1.5", compact && "h-7 px-2 text-[11px]")}
        disabled={assignMutation.isPending}
        onClick={() => { setAssignTarget(gap); setAssignNote(""); setAssignDueAt(""); }}
      >
        <UserPlus className="h-3.5 w-3.5" /> كلّف محرراً
      </Button>
      {gap.status === "open" && (
        <Button
          size="sm"
          className={cn("gap-1.5", compact && "h-7 px-2 text-[11px]")}
          disabled={draftMutation.isPending}
          onClick={() => draftMutation.mutate(gap.id)}
        >
          <FilePenLine className="h-3.5 w-3.5" /> أنشئ مسودة أولية
        </Button>
      )}
      {gap.status === "drafting" && gap.coveredByArticleId && (
        <Button
          size="sm"
          variant="secondary"
          className={cn("gap-1.5", compact && "h-7 px-2 text-[11px]")}
          onClick={() => navigate(`/dashboard/articles/${gap.coveredByArticleId}/edit`)}
        >
          <FilePenLine className="h-3.5 w-3.5" /> فتح المسودة
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className={cn("gap-1.5 text-muted-foreground", compact && "h-7 px-2 text-[11px]")}
        disabled={dismissMutation.isPending}
        onClick={() => dismissMutation.mutate(gap.id)}
      >
        <EyeOff className="h-3.5 w-3.5" /> تجاهل
      </Button>
    </div>
  );

  let body: React.ReactNode;
  if (gapsQuery.isLoading) {
    body = (
      <div className="space-y-2 sm:flex sm:gap-3 sm:space-y-0">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full sm:h-44 sm:min-w-[280px]" />
        ))}
      </div>
    );
  } else if (gapsQuery.isError) {
    body = (
      <Card className="border-border/70 shadow-none">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <AlertTriangle className="h-7 w-7 text-destructive" />
          <p className="text-sm text-muted-foreground">تعذر تحميل فجوات التغطية</p>
          <Button variant="outline" size="sm" onClick={() => gapsQuery.refetch()}>إعادة المحاولة</Button>
        </CardContent>
      </Card>
    );
  } else if (!gaps.length) {
    body = (
      <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        لا فجوات حرجة — تغطيتكم مواكبة للمشهد ✅
      </div>
    );
  } else {
    body = (
      // الجوال: صفوف مدمجة بنمط ActionCard — الديسكتوب: شريط بطاقات أفقي قابل للتمرير
      <div className="space-y-2 sm:flex sm:gap-3 sm:space-y-0 sm:overflow-x-auto sm:pb-2">
        {gaps.map((gap) => {
          const heat = heatTier(gap.heatScore ?? 0);
          const badge = gapStatusBadge(gap);
          return (
            <div
              key={gap.id}
              className="rounded-xl border border-border/70 bg-card shadow-none sm:flex sm:w-[300px] sm:shrink-0 sm:flex-col sm:rounded-2xl"
            >
              {/* الجوال — صف مدمج */}
              <div className="px-2.5 py-2 sm:hidden">
                <div className="flex items-center gap-2.5">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", heat.chip)}>
                    <Flame className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-[13px] font-semibold leading-tight">{gap.title}</div>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Timer className="h-3 w-3" /> {gapAgeLabel(gap.publishedAt ?? gap.firstDetectedAt, nowMs)}
                      {gap.sourceCount != null && gap.sourceCount > 1 ? (
                        <> · {gap.sourceCount} مصادر</>
                      ) : gap.sourceName ? (
                        <> · {gap.sourceName}</>
                      ) : null}
                    </p>
                    {Array.isArray(gap.gapReason) && gap.gapReason.length > 0 && (
                      <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">
                        {gap.gapReason.slice(0, 2).join(" · ")}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={cn("shrink-0 px-1.5 py-0.5 text-[10px]", badge.className)}>
                    {badge.label}
                  </Badge>
                </div>
                <div className="mt-2">{renderActions(gap, true)}</div>
              </div>

              {/* الديسكتوب — بطاقة ضمن الشريط الأفقي */}
              <div className="hidden sm:flex sm:flex-1 sm:flex-col sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline" className={cn("px-2 py-0.5 text-[11px]", badge.className)}>
                    {badge.label}
                  </Badge>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", heat.chip)}>
                    <Flame className="h-3 w-3" /> {number(gap.heatScore ?? 0)}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-6">{gap.title}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", heat.bar)} style={{ width: `${Math.min(Math.max(gap.heatScore ?? 0, 4), 100)}%` }} />
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Timer className="h-3 w-3 shrink-0" />
                  <span>{gapAgeLabel(gap.publishedAt ?? gap.firstDetectedAt, nowMs)}</span>
                  {gap.sourceCount != null && gap.sourceCount > 1 ? (
                    <span>· {gap.sourceCount} مصادر</span>
                  ) : gap.sourceName ? (
                    <span className="truncate">· {gap.sourceName}</span>
                  ) : null}
                </div>
                {Array.isArray(gap.gapReason) && gap.gapReason.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {gap.gapReason.slice(0, 4).map((reason) => (
                      <Badge key={reason} variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                )}
                {gap.assigneeName && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">مكلّف: {gap.assigneeName}</p>
                )}
                <div className="mt-auto pt-3">{renderActions(gap)}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section className="space-y-2 sm:space-y-3" data-testid="coverage-gaps-section">
      <SectionTitle
        title="فجوات التغطية الآن"
        description="مواضيع تتصاعد خارجياً رصدها الرادار ولا تغطية داخلية لها بعد"
        action={
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Radar className="h-3.5 w-3.5 text-primary" /> رادار الفجوات
          </span>
        }
      />
      {body}

      {/* حوار التكليف — يسند للمستخدم الحالي (الـ API يفترض ذلك عند غياب userId) */}
      <Dialog open={!!assignTarget} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تكليف محرر بتغطية الفجوة</DialogTitle>
            <DialogDescription className="leading-6">
              {assignTarget?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">ملاحظة للمحرر (اختياري)</label>
              <Textarea
                value={assignNote}
                onChange={(event) => setAssignNote(event.target.value)}
                placeholder="زاوية مقترحة، مصادر إضافية، تعليمات…"
                rows={3}
                maxLength={1000}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">موعد الاستحقاق (اختياري)</label>
              <Input
                type="datetime-local"
                value={assignDueAt}
                onChange={(event) => setAssignDueAt(event.target.value)}
              />
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              ستُنشأ مهمة تغطية في التقويم التحريري وتُسند إليك مباشرة.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAssignTarget(null)}>إلغاء</Button>
            <Button
              disabled={assignMutation.isPending}
              onClick={() => {
                if (!assignTarget) return;
                assignMutation.mutate({
                  gapId: assignTarget.id,
                  note: assignNote.trim() || undefined,
                  dueAt: assignDueAt ? new Date(assignDueAt).toISOString() : undefined,
                });
              }}
            >
              {assignMutation.isPending ? "جارٍ التكليف…" : "تأكيد التكليف"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default function NewsroomPulseDashboard() {
  const { user, isLoading: userLoading } = useAuth({ redirectToLogin: true });
  const [location, navigate] = useLocation();
  const isAngleWriter = hasRole(user, "angle_writer");
  const isContentManager = hasRole(user, "content_manager");
  const hasElevatedDashboardRole = hasRole(user, "admin", "system_admin", "editor", "content_manager", "analyst", "reviewer", "author", "comments_moderator");
  const isReporterOnly = hasRole(user, "reporter") && !hasElevatedDashboardRole;
  const canViewStats = !isReporterOnly && (hasPermission(user, PERMISSION_CODES.DASHBOARD_VIEW_STATS) || hasRole(user, "admin", "system_admin", "editor", "content_manager"));
  const canReviewMuqtarab = hasPermission(user, "muqtarab.manage");
  const canViewMessages = hasPermission(user, PERMISSION_CODES.DASHBOARD_VIEW_MESSAGES);
  const canViewWriterTickets = hasRole(user, "admin", "editor", "system_admin");

  const role: UserRole = resolveUserRole(getHighestRole(user));
  const navFlags = useMemo(() => ({ aiDeepAnalysis: false, smartThemes: true, audioSummaries: false }), []);
  const { flat } = useNav({
    role,
    flags: navFlags,
    pathname: location,
    permissions: user?.permissions || [],
    allRoles: user?.roles && user.roles.length > 0 ? user.roles : (user?.role ? [user.role] : []),
  });
  const navigableItems = useMemo(() => {
    const seenPaths = new Set<string>();
    return flat.filter((item) => {
      if (!item.path || seenPaths.has(item.path)) return false;
      seenPaths.add(item.path);
      return true;
    });
  }, [flat]);
  const { favoriteItems, toggleFavorite } = useDashboardFavorites(navigableItems);

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
        <Card className="mx-auto max-w-xl"><CardContent className="p-8 text-center"><AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" /><h2 className="font-bold">تعذر تحميل نبض غرفة الأخبار</h2><Button className="mt-4" onClick={() => statsQuery.refetch()}>إعادة المحاولة</Button></CardContent></Card>
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
      <main dir="rtl" className="mx-auto max-w-[1600px] space-y-4 pb-24 sm:space-y-7 sm:pb-10">
        <DashboardAnnouncementBanner deferLoading={statsQuery.isLoading} />

        <header className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:pb-5">
          <div>
            <p className="mb-1 text-xs text-muted-foreground sm:text-sm">{dateLabel}</p>
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-10 sm:w-10 sm:rounded-xl">
                <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
              </span>
              <h1 className="text-xl font-bold tracking-tight sm:text-3xl">نبض سبق اليوم</h1>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground sm:mt-2">مرحباً {user.firstName || "بك"}، هذه الأولويات وما يحدث في غرفة الأخبار الآن.</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-primary" /> آخر تحديث {refreshedAt}</span>
            <Button variant="outline" size="sm" onClick={() => { statsQuery.refetch(); pulseQuery.refetch(); }} disabled={statsQuery.isFetching || pulseQuery.isFetching} className="gap-2">
              <RefreshCw className={cn("h-3.5 w-3.5", (statsQuery.isFetching || pulseQuery.isFetching) && "animate-spin")} /> تحديث
            </Button>
          </div>
        </header>

        <section className="space-y-2" data-testid="dashboard-favorites">
          <SectionTitle title="المفضلة" description="اختصاراتك السريعة من قائمة لوحة التحكم" />
          {favoriteItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-5">
              {favoriteItems.map((item) => {
                const FavoriteIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="group flex items-center gap-1 rounded-xl border border-border/70 bg-card"
                  >
                    <Link
                      href={item.path || "#"}
                      onClick={() => trackNavClick(item.id, item.path || "")}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-sm font-medium"
                    >
                      {FavoriteIcon && (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <FavoriteIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      )}
                      <span className="truncate">{item.labelAr || item.labelKey}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(item)}
                      className="shrink-0 rounded-lg p-2 text-warning opacity-80 hover:bg-muted hover:opacity-100"
                      aria-label={`إزالة ${item.labelAr || item.labelKey} من المفضلة`}
                    >
                      <Star className="h-3.5 w-3.5 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-3 text-[13px] text-muted-foreground">
              لا توجد مفضّلات بعد. افتح القائمة الجانبية واضغط ★ بجانب أي صفحة لتظهر هنا وفي القائمة.
            </div>
          )}
        </section>

        <section className="space-y-2 sm:space-y-3">
          <SectionTitle title="يتطلب تدخلك" description="الأعمال التي لا ينبغي أن تبقى في قائمة الانتظار" />
          <div className={cn("grid gap-1.5 sm:grid-cols-2 sm:gap-3", !isContentManager && "xl:grid-cols-4")}>
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

        {/* رادار الفجوات التحريرية — بين «إجراءات سريعة» و«موجز سبق الذكي»؛ يتبع شروط canViewStats ويُخفى عن content_manager كبقية الأقسام التحليلية */}
        {canViewStats && !isContentManager && <CoverageGapsSection />}

        {stats && <SmartBrief stats={stats} muqtarabCount={muqtarabCount} operationalOnly={isContentManager} />}

        {!isContentManager && <section className="space-y-3">
          <SectionTitle title="أداء اليوم" description="أرقام اليوم حتى الآن، مقارنةً بنفس الساعة من أمس" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <MetricCard title="نُشر اليوم" value={stats?.articles.publishedToday ?? 0} previous={stats?.articles.publishedYesterday} icon={FileText} helper="مواد نُشرت منذ منتصف الليل" loading={statsQuery.isLoading} />
            <MetricCard title="مرات فتح الأخبار" value={stats?.articles.viewsToday ?? 0} previous={stats?.articles.viewsYesterday} icon={Eye} helper="يشمل كل الزوار" loading={statsQuery.isLoading} />
            <MetricCard title="قراءات الأعضاء" value={stats?.engagement.readsToday ?? 0} previous={stats?.engagement.readsYesterday} icon={BarChart3} helper="للأعضاء المسجّلين فقط" loading={statsQuery.isLoading} />
            <MetricCard title="تفاعلات اليوم" value={stats?.reactions.todayCount ?? 0} previous={stats?.reactions.yesterdayCount} icon={Heart} helper="إعجابات وردود الفعل" loading={statsQuery.isLoading} />
            <MetricCard title="أعضاء نشطون" value={stats?.users.activeToday ?? 0} icon={UserRoundCheck} helper="سجّلوا نشاطاً منذ منتصف الليل" loading={statsQuery.isLoading} />
            <MetricCard title="متوسط مدة القراءة" value={duration(stats?.engagement.averageTimeOnSite ?? 0)} icon={Clock3} helper="دقيقة:ثانية · من جلسات الأعضاء" loading={statsQuery.isLoading} />
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
              <div><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-primary" /> المقالات الصاعدة</CardTitle><p className="mt-1 text-xs text-muted-foreground">الأسرع في آخر 24 ساعة، ثم الأعلى إجمالاً عند غياب بيانات اللحظة</p></div>
              <Button asChild variant="ghost" size="sm"><Link href="/dashboard/articles">عرض الكل</Link></Button>
            </CardHeader>
            <CardContent className="grid gap-3">
              {trending.slice(0, 5).map((article, index) => (
                <Link key={article.id} href={`/dashboard/articles/${article.id}/edit`}>
                  <a className="group flex items-center gap-3 rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-muted/20 hover:shadow-md">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
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
          <Button asChild size="sm" className="h-10 rounded-full px-4 shadow-md">
            <Link href="/dashboard/articles/new">
              <Sparkles className="ml-1.5 h-3.5 w-3.5" /> مادة جديدة
            </Link>
          </Button>
        </div>
      </main>
    </DashboardLayout>
  );
}
