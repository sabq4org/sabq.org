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
  ExternalLink,
  Eye,
  EyeOff,
  FileClock,
  FilePenLine,
  FileText,
  Flame,
  FolderKanban,
  Gauge,
  Heart,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  Mic,
  Newspaper,
  Plus,
  Radar,
  RefreshCw,
  Share2,
  Sparkles,
  Star,
  Timer,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserRoundCheck,
  Users,
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { apiRequest } from "@/lib/queryClient";
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
    englishSlug?: string | null;
    views: number;
    recentViews: number;
    categoryName: string | null;
  }>;
  upcomingSchedule: Array<{ id: string; title: string; scheduledAt: string | null }>;
  hourlyViews: Array<{ hour: string; views: number }>;
  generatedAt: string;
}

interface DashboardPulse {
  articles: Pick<
    DashboardStats["articles"],
    "publishedToday" | "publishedYesterday" | "pendingReview" | "needsChanges" | "viewsYesterday"
  >;
  comments: Pick<
    DashboardStats["comments"],
    "receivedToday" | "moderatedToday" | "pendingOlderThanTwoHours"
  >;
  reactions: Pick<DashboardStats["reactions"], "yesterdayCount">;
  engagement: Pick<DashboardStats["engagement"], "readsYesterday">;
  trendingArticles: DashboardStats["trendingArticles"];
  upcomingSchedule: DashboardStats["upcomingSchedule"];
  hourlyViews: DashboardStats["hourlyViews"];
  generatedAt: string;
}

type IconType = React.ComponentType<{ className?: string }>;

const number = (value?: number) => (value ?? 0).toLocaleString("en-US");

const compactNumber = (value?: number) => {
  const v = value ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("en-US");
};

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
  const mins = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  if (mins === 0) return `${rem} ثانية`;
  if (rem === 0) return `${mins} دقيقة`;
  return `${mins} د و ${rem} ث`;
};

function MetricCard({
  title,
  value,
  previous,
  icon: Icon,
  iconBoxClass,
  helper,
  footerValue,
  loading,
}: {
  title: string;
  value: number | string;
  previous?: number;
  icon: IconType;
  iconBoxClass: string;
  helper?: string;
  footerValue?: string;
  loading?: boolean;
}) {
  const numericValue = typeof value === "number" ? value : undefined;
  const change =
    numericValue !== undefined && previous !== undefined
      ? percentChange(numericValue, previous)
      : undefined;

  return (
    <Card className="relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-all hover:border-primary/30 hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="mt-1.5 h-8 w-20" />
            ) : (
              <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {typeof value === "number" ? number(value) : value}
              </p>
            )}
          </div>
          <div className={cn("rounded-xl border p-2.5 shrink-0", iconBoxClass)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between gap-2 text-xs text-muted-foreground pt-2.5 border-t border-border/40">
          <span className="truncate">{helper || "مقارنةً بأمس"}</span>
          {change !== undefined && !loading ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums shrink-0",
                change > 0 && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                change < 0 && "bg-rose-500/10 text-rose-700 dark:text-rose-300",
                change === 0 && "bg-muted text-muted-foreground",
              )}
            >
              {change > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : change < 0 ? (
                <TrendingDown className="h-3 w-3" />
              ) : null}
              {change > 0 ? "+" : ""}
              {change}%
            </span>
          ) : footerValue ? (
            <span className="font-semibold text-foreground tabular-nums shrink-0">
              {footerValue}
            </span>
          ) : null}
        </div>
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
      accent: count > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground",
      icon: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      badge:
        count > 0
          ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      badgeLabel: count > 0 ? "يتطلب مراجعة" : "مكتمل ✓",
    },
    warning: {
      accent: count > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
      icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      badge:
        count > 0
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      badgeLabel: count > 0 ? "بانتظار القرار" : "مكتمل ✓",
    },
    info: {
      accent: "text-primary",
      icon: "bg-primary/10 text-primary border-primary/20",
      badge: "border-primary/25 bg-primary/10 text-primary",
      badgeLabel: "نشط",
    },
  };
  const style = styles[tone];

  return (
    <Link href={href}>
      <a className="group block rounded-xl border border-border/70 bg-card text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted/20 hover:shadow-md">
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                style.icon,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <Badge variant="outline" className={cn("text-[10px] font-semibold px-2 py-0.5", style.badge)}>
              {style.badgeLabel}
            </Badge>
          </div>
          <div className="mt-3.5 flex items-baseline justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-foreground">{title}</div>
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{description}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn("text-2xl font-bold tabular-nums", style.accent)}>
                {number(count)}
              </span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:-translate-x-1 group-hover:text-primary" />
            </div>
          </div>
        </div>
      </a>
    </Link>
  );
}

function SectionTitle({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: IconType;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div>
          <h2 className="text-base font-bold sm:text-lg text-foreground">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground max-sm:line-clamp-1">{description}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

function SmartBrief({
  stats,
  muqtarabCount,
  operationalOnly = false,
}: {
  stats: DashboardStats;
  muqtarabCount: number;
  operationalOnly?: boolean;
}) {
  const priority = operationalOnly
    ? stats.articles.needsChanges > 0
      ? `${number(stats.articles.needsChanges)} مواد تحتاج تعديلات`
      : `${number(stats.articles.pendingReview)} مواد تنتظر المراجعة`
    : stats.comments.pendingOlderThanTwoHours > 0
      ? `${number(stats.comments.pendingOlderThanTwoHours)} تعليقاً تجاوز ساعتين دون مراجعة`
      : `${number(stats.comments.pending)} تعليقاً ينتظر المراجعة`;
  const trend = percentChange(stats.articles.viewsToday, stats.articles.viewsYesterday);
  const scheduleMessage =
    stats.articles.scheduled > 0
      ? `ولديك ${number(stats.articles.scheduled)} مواد مجدولة للنشر.`
      : "ولا توجد مواد مجدولة حالياً.";

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
            <WandSparkles className="h-4 w-4" />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-primary">موجز غرفة الأخبار الذكي</span>
              <Badge variant="secondary" className="text-[10px] px-2 py-0">
                تحديث لحظي
              </Badge>
            </div>
            <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
              الأولوية الآن: <strong className="font-semibold text-foreground">{priority}</strong>.
              {!operationalOnly && muqtarabCount > 0 && (
                <>
                  {" "}
                  وهناك <strong className="font-semibold text-foreground">{number(muqtarabCount)} موضوعاً في مُقترب</strong> بانتظار القرار.
                </>
              )}
              {operationalOnly ? (
                <> {scheduleMessage}</>
              ) : (
                <>
                  {" "}
                  حركة فتح الأخبار اليوم{" "}
                  <strong className={cn("font-semibold", trend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                    {trend >= 0 ? `أعلى بـ ${Math.abs(trend)}%` : `أقل بـ ${Math.abs(trend)}%`}
                  </strong>{" "}
                  مقارنةً بأمس، {scheduleMessage}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild size="sm" className="h-8 text-xs">
            <Link href={operationalOnly ? "/dashboard/articles" : "/dashboard/ai-moderation"}>
              ابدأ بالأولوية
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8 text-xs bg-background">
            <Link href="/dashboard/articles">إدارة المحتوى</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditorialPipeline({ stats }: { stats: DashboardStats }) {
  const steps = [
    {
      label: "نُشرت اليوم",
      sublabel: "مواد منشورة منذ منتصف الليل",
      value: stats.articles.publishedToday,
      barColor: "bg-emerald-500",
      badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
      href: "/dashboard/articles",
    },
    {
      label: "مجدولة للنشر",
      sublabel: "بانتظار ساعة النشر الآلي",
      value: stats.articles.scheduled,
      barColor: "bg-primary",
      badgeClass: "bg-primary/10 text-primary border-primary/20",
      href: "/dashboard/articles",
    },
    {
      label: "بانتظار المراجعة",
      sublabel: "مواد مرفوعة للاعتماد التحريري",
      value: stats.articles.pendingReview,
      barColor: "bg-amber-500",
      badgeClass: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
      href: "/dashboard/articles",
    },
    {
      label: "تحتاج تعديلات",
      sublabel: "مواد أُعيدت لاستكمال الملاحظات",
      value: stats.articles.needsChanges,
      barColor: "bg-rose-500",
      badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
      href: "/dashboard/articles",
    },
    {
      label: "مسودات قيد الإعداد",
      sublabel: "مسودات مفتوحة لدى المحررين",
      value: stats.articles.draft,
      barColor: "bg-indigo-500",
      badgeClass: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
      href: "/dashboard/articles",
    },
  ];
  const max = Math.max(...steps.map((step) => step.value), 1);
  const totalInFlow = steps.reduce((acc, s) => acc + s.value, 0);

  return (
    <Card className="h-full rounded-xl border border-border/70 bg-card shadow-sm">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileClock className="h-4 w-4 text-primary" />
              مسار التدفق التحريري
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              توزيع المواد الصحفية عبر مراحل الإعداد والنشر
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs tabular-nums">
            {number(totalInFlow)} مادة
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3.5 pt-4">
        {steps.map((step) => {
          const widthPct = Math.max((step.value / max) * 100, step.value > 0 ? 6 : 2);
          return (
            <Link key={step.label} href={step.href}>
              <a className="block rounded-xl border border-border/60 p-3 transition-colors hover:border-primary/30 hover:bg-muted/20">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <span className="font-semibold text-foreground">{step.label}</span>
                    <p className="text-[11px] text-muted-foreground">{step.sublabel}</p>
                  </div>
                  <Badge variant="outline" className={cn("font-bold tabular-nums text-xs px-2.5 py-0.5", step.badgeClass)}>
                    {number(step.value)}
                  </Badge>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", step.barColor)}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </a>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

function OperationsCards() {
  const { data: remindersRaw } = useQuery<
    Array<{ id: string; eventTitle: string; reminderTime: string }>
  >({
    queryKey: ["/api/calendar/upcoming-reminders"],
  });
  const { data: tasksRaw } = useQuery<Array<{ id: string; eventTitle: string; status: string }>>({
    queryKey: ["/api/calendar/my-assignments?status=pending"],
  });
  const reminders = Array.isArray(remindersRaw) ? remindersRaw.slice(0, 4) : [];
  const tasks = Array.isArray(tasksRaw) ? tasksRaw.slice(0, 4) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-xl border border-border/70 bg-card shadow-sm">
        <CardHeader className="pb-3 border-b border-border/50 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <CalendarClock className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">التذكيرات والمواعيد القادمة</CardTitle>
              <CardDescription className="text-xs">مواعيد التقويم التحريري القريبة</CardDescription>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link href="/dashboard/calendar">التقويم</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-4">
          {reminders.length ? (
            reminders.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3.5 py-2.5 text-sm"
              >
                <span className="font-medium truncate">{item.eventTitle}</span>
                <Badge variant="outline" className="text-[11px] shrink-0">
                  تذكير
                </Badge>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed py-6 text-center text-xs text-muted-foreground">
              لا توجد تذكيرات قريبة مسجلة حالياً
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border/70 bg-card shadow-sm">
        <CardHeader className="pb-3 border-b border-border/50 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">مهامي وتكليفاتي القادمة</CardTitle>
              <CardDescription className="text-xs">التكليفات التحريرية المسندة إليك</CardDescription>
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-8 text-xs">
            <Link href="/dashboard/tasks">كل المهام</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-4">
          {tasks.length ? (
            tasks.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3.5 py-2.5 text-sm"
              >
                <span className="font-medium truncate">{item.eventTitle}</span>
                <Badge variant="secondary" className="text-[11px] shrink-0">
                  قيد التنفيذ
                </Badge>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed py-6 text-center text-xs text-muted-foreground">
              لا توجد مهام معلقة مسندة إليك حالياً
            </div>
          )}
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
        const isReady = countdown === "حان موعد النشر";

        return (
          <Link key={article.id} href={`/dashboard/articles/${article.id}/edit`}>
            <a className="group block rounded-xl border border-border/70 bg-card p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-muted/20 hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <p className="min-w-0 flex-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-primary transition-colors">
                  {article.title}
                </p>
                <ArrowLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:-translate-x-1 group-hover:text-primary" />
              </div>

              {hasValidDate ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      <CalendarDays className="h-3.5 w-3.5 text-primary" />
                      {scheduleDateFormatter.format(scheduledDate)}
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground tabular-nums">
                      <Clock3 className="h-3.5 w-3.5 text-primary" />
                      {scheduleTimeFormatter.format(scheduledDate)}
                    </span>
                  </div>
                  {countdown && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "gap-1 px-2 py-0.5 text-[11px] font-semibold",
                        isReady
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : "border-primary/25 bg-primary/10 text-primary",
                      )}
                    >
                      <Timer className="h-3 w-3" />
                      {countdown}
                    </Badge>
                  )}
                </div>
              ) : (
                <div className="mt-3 rounded-lg bg-secondary/80 px-3 py-2 text-xs font-medium text-secondary-foreground">
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

function arabicCount(value: number, one: string, two: string, few: string, many: string): string {
  if (value === 1) return one;
  if (value === 2) return two;
  if (value >= 3 && value <= 10) return `${number(value)} ${few}`;
  return `${number(value)} ${many}`;
}

function gapAgeLabel(startIso: string, nowMs: number): string {
  const startedMs = new Date(startIso).getTime();
  if (!Number.isFinite(startedMs)) return "تتصاعد الآن";
  const elapsedMinutes = Math.max(1, Math.floor((nowMs - startedMs) / 60_000));
  if (elapsedMinutes < 60) return `تتصاعد منذ ${arabicCount(elapsedMinutes, "دقيقة", "دقيقتين", "دقائق", "دقيقة")}`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `تتصاعد منذ ${arabicCount(hours, "ساعة", "ساعتين", "ساعات", "ساعة")}`;
  return `تتصاعد منذ ${arabicCount(Math.floor(hours / 24), "يوم", "يومين", "أيام", "يوماً")}`;
}

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

  const gaps = useMemo(() => {
    const list = Array.isArray(gapsQuery.data?.gaps) ? gapsQuery.data.gaps : [];
    return list.filter((gap) => gap.status !== "dismissed" && gap.status !== "covered").slice(0, 5);
  }, [gapsQuery.data]);

  const invalidateGaps = () => queryClientHook.invalidateQueries({ queryKey: [COVERAGE_GAPS_KEY] });

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
    onSuccess: (data: { articleId?: string } | undefined) => {
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

  const refreshMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ summary: { gapsCreated: number; gapsUpdated: number } }>(
        "/api/admin/coverage-gaps/refresh",
        { method: "POST" },
      ),
    onError: (error) => {
      toast({
        title: "تعذر تحديث الفجوات",
        description: error instanceof Error ? error.message : "حاول مجدداً بعد قليل",
        variant: "destructive",
      });
    },
    onSuccess: (data) => {
      invalidateGaps();
      const created = data?.summary?.gapsCreated ?? 0;
      const updated = data?.summary?.gapsUpdated ?? 0;
      toast({
        title: "اكتمل التحديث",
        description: created || updated
          ? `فجوات جديدة: ${created} — محدّثة: ${updated}`
          : "لا فجوات جديدة",
      });
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
      <div className="space-y-2 sm:flex sm:gap-3 sm:space-y-0 sm:overflow-x-auto sm:pb-2">
        {gaps.map((gap) => {
          const heat = heatTier(gap.heatScore ?? 0);
          const badge = gapStatusBadge(gap);
          return (
            <div
              key={gap.id}
              className="rounded-xl border border-border/70 bg-card shadow-none sm:flex sm:w-[300px] sm:shrink-0 sm:flex-col sm:rounded-2xl"
            >
              <div className="px-2.5 py-2 sm:hidden">
                <div className="flex items-center gap-2.5">
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", heat.chip)}>
                    <Flame className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-[13px] font-semibold leading-tight">{gap.title}</div>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Timer className="h-3 w-3" /> {gapAgeLabel(gap.publishedAt ?? gap.firstDetectedAt, nowMs)}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0 px-1.5 py-0.5 text-[10px]", badge.className)}>
                    {badge.label}
                  </Badge>
                </div>
                <div className="mt-2">{renderActions(gap, true)}</div>
              </div>

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
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Radar className="h-3.5 w-3.5 text-primary" /> رادار الفجوات
            </span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
              data-testid="button-refresh-coverage-gaps"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshMutation.isPending && "animate-spin")} />
              تحديث الآن
            </Button>
          </div>
        }
      />
      {body}

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
  const [hourlyViewMode, setHourlyViewMode] = useState<"area" | "bars">("area");

  const isAngleWriter = hasRole(user, "angle_writer");
  const isContentManager = hasRole(user, "content_manager");
  const hasElevatedDashboardRole = hasRole(
    user,
    "admin",
    "system_admin",
    "editor",
    "content_manager",
    "analyst",
    "reviewer",
    "author",
    "comments_moderator",
  );
  const isReporterOnly = hasRole(user, "reporter") && !hasElevatedDashboardRole;
  const isPublisherOnly = hasRole(user, "publisher") && !hasElevatedDashboardRole;
  const canViewStats =
    !isReporterOnly &&
    (hasPermission(user, PERMISSION_CODES.DASHBOARD_VIEW_STATS) ||
      hasRole(user, "admin", "system_admin", "editor", "content_manager"));
  const canReviewMuqtarab = hasPermission(user, "muqtarab.manage");
  const canViewMessages = hasPermission(user, PERMISSION_CODES.DASHBOARD_VIEW_MESSAGES);
  const canViewWriterTickets = hasRole(user, "admin", "editor", "system_admin");
  const canSocialPublish =
    !isReporterOnly &&
    (hasPermission(user, "social_publish.view") || hasRole(user, "admin", "system_admin", "editor"));

  const role: UserRole = resolveUserRole(getHighestRole(user));
  const navFlags = useMemo(
    () => ({ aiDeepAnalysis: false, smartThemes: true, audioSummaries: false }),
    [],
  );
  const { flat } = useNav({
    role,
    flags: navFlags,
    pathname: location,
    permissions: user?.permissions || [],
    allRoles: user?.roles && user.roles.length > 0 ? user.roles : user?.role ? [user.role] : [],
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
    if (user && isPublisherOnly) navigate("/dashboard/publisher", { replace: true });
  }, [user, isAngleWriter, isReporterOnly, isPublisherOnly, navigate]);

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

  const { data: socialStatsRaw } = useQuery<{
    total: number;
    publishedToday: number;
    scheduledUpcoming: number;
    failed: number;
    pendingDrafts: number;
    pendingAuthorProposals: number;
  }>({
    queryKey: ["/api/social-publishing/stats"],
    enabled: Boolean(user && canSocialPublish),
    refetchInterval: 60_000,
  });
  const pendingAuthorSocialProposals = socialStatsRaw?.pendingAuthorProposals ?? 0;

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

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date()),
    [],
  );

  const greetingLabel = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? "صباح الخير" : "مساء الخير";
  }, []);

  const refreshedAt = stats?.generatedAt
    ? new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(stats.generatedAt))
    : "—";

  if (
    userLoading ||
    !user ||
    isAngleWriter ||
    isReporterOnly ||
    isPublisherOnly ||
    user.role === "opinion_author"
  ) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!stats && !statsQuery.isLoading) {
    return (
      <DashboardLayout>
        <Card className="mx-auto max-w-xl rounded-2xl">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <h2 className="font-bold">تعذر تحميل نبض غرفة الأخبار</h2>
            <Button className="mt-4" onClick={() => statsQuery.refetch()}>
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const pipelineTotal = stats
    ? stats.articles.draft +
      stats.articles.pendingReview +
      stats.articles.needsChanges +
      stats.articles.scheduled
    : 0;
  const schedule = stats?.upcomingSchedule ?? [];
  const trending = stats?.trendingArticles?.length
    ? stats.trendingArticles
    : (stats?.topArticles ?? []).map((article) => ({
        id: article.id,
        title: article.title,
        slug: "",
        englishSlug: null,
        views: article.views,
        recentViews: 0,
        categoryName: article.category?.nameAr ?? null,
      }));
  const maxTrendingViews = Math.max(1, ...trending.slice(0, 5).map((a) => a.views || 0));

  const hourlyViews = stats?.hourlyViews ?? [];
  const maxHourlyViews = Math.max(1, ...hourlyViews.map((h) => h.views || 0));
  const peakHourlyItem = [...hourlyViews].sort((a, b) => b.views - a.views)[0];
  const totalHourlySum = hourlyViews.reduce((acc, h) => acc + (h.views || 0), 0);

  const platformItems = stats
    ? isContentManager
      ? [
          { label: "إجمالي المقالات", value: number(stats.articles.total), icon: Newspaper },
          { label: "التصنيفات", value: number(stats.categories.total), icon: FolderKanban },
          { label: "ملفات الوسائط", value: number(stats.mediaLibrary?.totalFiles), icon: ImageIcon },
        ]
      : [
          { label: "إجمالي المقالات", value: number(stats.articles.total), icon: Newspaper },
          { label: "المستخدمون المسجلون", value: number(stats.users.total), icon: Users },
          { label: "الأقسام والتصنيفات", value: number(stats.categories.total), icon: FolderKanban },
          { label: "ملفات مكتبة الوسائط", value: number(stats.mediaLibrary?.totalFiles), icon: ImageIcon },
          { label: "الناشرون النشطون", value: number(stats.publishers?.active), icon: Share2 },
          { label: "القوالب الذكية", value: number(stats.smartBlocks?.total), icon: Layers },
          { label: "صور الذكاء الاصطناعي", value: number(stats.aiImages?.total), icon: Sparkles },
          { label: "صور هذا الأسبوع", value: number(stats.aiImages?.thisWeek), icon: WandSparkles },
          { label: "تحليلات عميقة", value: number(stats.deepAnalyses?.total), icon: BarChart3 },
          { label: "نشرات صوتية", value: number(stats.audioNewsletters?.total), icon: Mic },
          { label: "اختبارات العناوين النشطة", value: number(stats.abTests.running), icon: Gauge },
          { label: "مستخدمون جدد أسبوعياً", value: number(stats.users.newThisWeek), icon: UserRoundCheck },
        ]
    : [];

  return (
    <DashboardLayout>
      <main dir="rtl" className="mx-auto max-w-[1600px] space-y-6 pb-24 sm:pb-10">
        <DashboardAnnouncementBanner deferLoading={statsQuery.isLoading} />

        {/* Executive Command Header Card */}
        <Card className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="h-1 w-full bg-gradient-to-l from-primary via-emerald-500 to-indigo-500" />
          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                      نبض سبق اليوم — غرفة الأخبار
                    </h1>
                    <Badge
                      variant="outline"
                      className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-semibold"
                    >
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      آخر تحديث {refreshedAt}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {greetingLabel} <strong className="font-semibold text-foreground">{user.firstName || "بك"}</strong> — {dateLabel} · متابعة فورية للأولويات التحريرية وحركة القراء.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" className="gap-1.5 shadow-sm">
                  <Link href="/dashboard/articles/new">
                    <Plus className="h-4 w-4" />
                    خبر جديد
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link href="/dashboard/analytics/behavior">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    سلوك القراء
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    statsQuery.refetch();
                    pulseQuery.refetch();
                  }}
                  disabled={statsQuery.isFetching || pulseQuery.isFetching}
                  className="gap-1.5"
                >
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5",
                      (statsQuery.isFetching || pulseQuery.isFetching) && "animate-spin",
                    )}
                  />
                  تحديث
                </Button>
              </div>
            </div>

            {stats && (
              <SmartBrief
                stats={stats}
                muqtarabCount={muqtarabCount}
                operationalOnly={isContentManager}
              />
            )}
          </CardContent>
        </Card>

        {/* 6 Executive KPI Cards */}
        {!isContentManager && (
          <section className="space-y-3">
            <SectionTitle
              icon={Gauge}
              title="مؤشرات الأداء اليومي اللحظية"
              description="أرقام اليوم منذ منتصف الليل مقارنةً بنفس الساعة من يوم أمس"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <MetricCard
                title="نُشر اليوم"
                value={stats?.articles.publishedToday ?? 0}
                previous={stats?.articles.publishedYesterday}
                icon={FileText}
                iconBoxClass="bg-primary/10 border-primary/20 text-primary"
                helper="مقارنةً بأمس"
                loading={statsQuery.isLoading}
              />
              <MetricCard
                title="مرات فتح الأخبار"
                value={stats?.articles.viewsToday ?? 0}
                previous={stats?.articles.viewsYesterday}
                icon={Eye}
                iconBoxClass="bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                helper={`التراكمي ${compactNumber(stats?.articles.totalViews)}`}
                loading={statsQuery.isLoading}
              />
              <MetricCard
                title="قراءات الأعضاء"
                value={stats?.engagement.readsToday ?? 0}
                previous={stats?.engagement.readsYesterday}
                icon={BarChart3}
                iconBoxClass="bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                helper="للأعضاء المسجلين"
                loading={statsQuery.isLoading}
              />
              <MetricCard
                title="تفاعلات القراء"
                value={stats?.reactions.todayCount ?? 0}
                previous={stats?.reactions.yesterdayCount}
                icon={Heart}
                iconBoxClass="bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                helper={`الإجمالي ${number(stats?.reactions.total)}`}
                loading={statsQuery.isLoading}
              />
              <MetricCard
                title="أعضاء نشطون اليوم"
                value={stats?.users.activeToday ?? 0}
                icon={UserRoundCheck}
                iconBoxClass="bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400"
                helper="جديد الأسبوع"
                footerValue={`+${number(stats?.users.newThisWeek)}`}
                loading={statsQuery.isLoading}
              />
              <MetricCard
                title="متوسط زمن القراءة"
                value={duration(stats?.engagement.averageTimeOnSite ?? 0)}
                icon={Clock3}
                iconBoxClass="bg-cyan-500/10 border-cyan-500/20 text-cyan-600 dark:text-cyan-400"
                helper="متوسط جلسة القارئ"
                footerValue={`${stats?.engagement.averageTimeOnSite ?? 0}ث`}
                loading={statsQuery.isLoading}
              />
            </div>
          </section>
        )}

        {/* Priority Intervention Section */}
        <section className="space-y-3">
          <SectionTitle
            icon={BellRing}
            title="يتطلب تدخلك الآن"
            description="المهام التحريرية والرقابية التي تنتظر المراجعة والاعتماد"
          />
          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2",
              !isContentManager && "lg:grid-cols-3 xl:grid-cols-5",
            )}
          >
            {!isContentManager && (
              <ActionCard
                title="تعليقات للمراجعة"
                count={stats?.comments.pending ?? 0}
                description={
                  stats?.comments.pendingOlderThanTwoHours
                    ? `${number(stats.comments.pendingOlderThanTwoHours)} تجاوزت ساعتين`
                    : "ضمن وقت الاستجابة"
                }
                href="/dashboard/ai-moderation"
                icon={MessageSquare}
                tone="danger"
              />
            )}
            {canReviewMuqtarab && (
              <ActionCard
                title="مراجعة مُقترب"
                count={muqtarabCount}
                description="مواضيع تنتظر قرار التحرير"
                href="/dashboard/muqtarab/review"
                icon={BellRing}
                tone="warning"
              />
            )}
            <ActionCard
              title="المسار التحريري"
              count={pipelineTotal}
              description={`${number(stats?.articles.scheduled)} مواد مجدولة للنشر`}
              href="/dashboard/articles"
              icon={FileClock}
              tone="info"
            />
            <ActionCard
              title="تحتاج تعديلات"
              count={stats?.articles.needsChanges ?? 0}
              description="مواد أُعيدت للمعالجة التحريرية"
              href="/dashboard/articles"
              icon={AlertTriangle}
              tone="warning"
            />
            {canSocialPublish && (
              <ActionCard
                title="مقترحات X للكتّاب"
                count={pendingAuthorSocialProposals}
                description={
                  pendingAuthorSocialProposals > 0
                    ? `${number(pendingAuthorSocialProposals)} مقترحات تنتظر المراجعة`
                    : "لا توجد مقترحات معلقة"
                }
                href="/dashboard/social-publishing?filter=draft"
                icon={Share2}
                tone={pendingAuthorSocialProposals > 0 ? "warning" : "info"}
              />
            )}
          </div>
          {(canViewMessages || canViewWriterTickets) && (
            <MessagesTabs
              showVisitorMessages={canViewMessages}
              showWriterTickets={canViewWriterTickets}
            />
          )}
        </section>

        {/* Quick Actions + Online Moderators */}
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-8">
            <QuickActionsSection />
          </div>
          <div className="min-w-0 lg:col-span-4">
            <OnlineModeratorsWidget />
          </div>
        </section>

        {/* فجوات التغطية — مخفية من الداشبورد بقرار تشغيلي (2026-07-19). غيّر الشرط لإعادة التفعيل. */}
        {false && canViewStats && !isContentManager && <CoverageGapsSection />}

        {/* Hourly Views Chart (7 cols) + Editorial Pipeline (5 cols) */}
        <section className={cn("grid gap-6", !isContentManager && "lg:grid-cols-12")}>
          {!isContentManager && (
            <Card className="rounded-xl border border-border/70 bg-card shadow-sm lg:col-span-7">
              <CardHeader className="pb-3 border-b border-border/50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      حركة فتح الأخبار على مدار الساعة اليوم
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      توزيع فتحات الأخبار الساعي منذ منتصف الليل وحتى الساعة الحالية
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {peakHourlyItem && peakHourlyItem.views > 0 && (
                      <Badge variant="secondary" className="text-xs tabular-nums">
                        الذروة: {peakHourlyItem.hour} ({number(peakHourlyItem.views)})
                      </Badge>
                    )}
                    <div className="inline-flex rounded-lg border bg-muted/50 p-1">
                      <button
                        type="button"
                        onClick={() => setHourlyViewMode("area")}
                        className={cn(
                          "px-2.5 py-1 text-xs rounded-md transition-all",
                          hourlyViewMode === "area"
                            ? "bg-background text-foreground shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        منحنى بياني
                      </button>
                      <button
                        type="button"
                        onClick={() => setHourlyViewMode("bars")}
                        className={cn(
                          "px-2.5 py-1 text-xs rounded-md transition-all",
                          hourlyViewMode === "bars"
                            ? "bg-background text-foreground shadow-sm font-semibold"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        أعمدة ساعية
                      </button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-5">
                {statsQuery.isLoading ? (
                  <Skeleton className="h-[280px] w-full rounded-xl" />
                ) : hourlyViews.length ? (
                  hourlyViewMode === "area" ? (
                    <div className="space-y-3">
                      <ResponsiveContainer width="100%" height={250}>
                        <AreaChart
                          data={hourlyViews}
                          margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                          <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={11} />
                          <YAxis tickLine={false} axisLine={false} fontSize={11} width={42} />
                          <ChartTooltip formatter={(value: number) => [number(value), "فتحة خبر"]} />
                          <Area
                            type="monotone"
                            dataKey="views"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2.5}
                            fill="url(#viewsFill)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                        <span>
                          إجمالي الساعات المرصودة: <strong className="text-foreground tabular-nums">{hourlyViews.length} ساعة</strong>
                        </span>
                        <span>
                          مجموع الفتحات الساعية: <strong className="text-foreground tabular-nums">{number(totalHourlySum)}</strong>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                      {hourlyViews.map((h) => {
                        const pct = Math.round((h.views / maxHourlyViews) * 100);
                        const isPeak = peakHourlyItem && h.hour === peakHourlyItem.hour && h.views > 0;
                        return (
                          <div
                            key={h.hour}
                            className={cn(
                              "rounded-xl border p-2.5 transition-colors",
                              isPeak ? "border-primary/50 bg-primary/5" : "bg-card",
                            )}
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-semibold tabular-nums">{h.hour}</span>
                              {isPeak && (
                                <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">
                                  الأعلى
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-base font-bold tabular-nums">{number(h.views)}</p>
                            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all duration-500"
                                style={{ width: `${Math.max(6, pct)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="flex h-[260px] flex-col items-center justify-center text-center text-muted-foreground">
                    <Gauge className="mb-3 h-8 w-8 opacity-30" />
                    <p className="text-sm">ستظهر الحركة عند تسجيل فتحات الأخبار</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <div className={cn(!isContentManager && "lg:col-span-5")}>
            {stats && <EditorialPipeline stats={stats} />}
          </div>
        </section>

        {/* Trending Articles (7 cols) + Upcoming Schedule (5 cols) */}
        <section className={cn("grid gap-6", !isContentManager && "lg:grid-cols-12")}>
          {!isContentManager && (
            <Card className="rounded-xl border border-border/70 bg-card shadow-sm lg:col-span-7">
              <CardHeader className="pb-3 border-b border-border/50 flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    المقالات الصاعدة والأعلى قراءة
                  </CardTitle>
                  <CardDescription className="mt-0.5 text-xs">
                    الأخبار الأسرع صعوداً في آخر 24 ساعة مع مؤشر الكثافة النسبية
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm" className="h-8 text-xs">
                  <Link href="/dashboard/articles">كل المقالات</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {trending.slice(0, 5).map((article, index) => {
                  const widthPct = Math.max(8, Math.round((article.views / maxTrendingViews) * 100));
                  const publicSlug = article.englishSlug || article.slug || article.id;
                  return (
                    <div
                      key={article.id}
                      className="group rounded-xl border border-border/70 bg-card p-3.5 transition-all hover:border-primary/30 hover:bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary tabular-nums">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <Link href={`/dashboard/articles/${article.id}/edit`}>
                              <a className="text-sm font-semibold leading-snug text-foreground hover:text-primary transition-colors line-clamp-1">
                                {article.title}
                              </a>
                            </Link>
                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {article.categoryName && (
                                <Badge variant="secondary" className="text-[10px] px-2 py-0">
                                  {article.categoryName}
                                </Badge>
                              )}
                              <span className="font-semibold text-foreground tabular-nums">
                                {number(article.views)} مشاهدة
                              </span>
                              {article.recentViews > 0 && (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] px-1.5 py-0 tabular-nums"
                                >
                                  +{number(article.recentViews)} حديثاً
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="معاينة الخبر">
                            <Link href={`/article/${publicSlug}`}>
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                            </Link>
                          </Button>
                          <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="تحرير الخبر">
                            <Link href={`/dashboard/articles/${article.id}/edit`}>
                              <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/80 transition-all duration-500"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {!trending.length && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    لا توجد بيانات كافية للمقالات الصاعدة
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className={cn("rounded-xl border border-border/70 bg-card shadow-sm", !isContentManager && "lg:col-span-5")}>
            <CardHeader className="pb-3 border-b border-border/50 flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  جدول النشر المجدول القادم
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  المواد المجدولة للنشر التلقائي بتوقيت الرياض
                </CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs tabular-nums">
                {number(schedule.length)} مجدول
              </Badge>
            </CardHeader>
            <CardContent className="pt-4">
              <UpcomingScheduleList schedule={schedule} />
            </CardContent>
          </Card>
        </section>

        {/* Favorites Section */}
        <section className="space-y-3" data-testid="dashboard-favorites">
          <SectionTitle
            icon={Star}
            title="اختصاراتك المفضلة"
            description="تُضاف بالضغط على نجمة ★ بجانب اسم أي صفحة في القائمة الجانبية"
          />
          {favoriteItems.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {favoriteItems.map((item) => {
                const FavoriteIcon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="group flex items-center gap-1 rounded-xl border border-border/70 bg-card shadow-sm transition-colors hover:border-primary/30"
                  >
                    <Link
                      href={item.path || "#"}
                      onClick={() => trackNavClick(item.id, item.path || "")}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-sm font-semibold"
                    >
                      {FavoriteIcon && (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                          <FavoriteIcon className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                      <span className="truncate">{item.labelAr || item.labelKey}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleFavorite(item)}
                      className="shrink-0 rounded-lg p-2 text-amber-500 opacity-80 hover:bg-muted hover:opacity-100"
                      aria-label={`إزالة ${item.labelAr || item.labelKey} من المفضلة`}
                    >
                      <Star className="h-4 w-4 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-3.5 text-xs text-muted-foreground">
              لا توجد صفحات مفضّلة بعد — اضغط ★ بجانب اسم أي قسم في القائمة الجانبية ليظهر هنا للوصول السريع.
            </div>
          )}
        </section>

        {/* Operations & Reminders */}
        {!isContentManager && (
          <section className="space-y-3">
            <SectionTitle
              icon={CalendarDays}
              title="التشغيل والمتابعة اليومية"
              description="المهام والتذكيرات القريبة المرتبطة بالتقويم التحريري"
            />
            <OperationsCards />
          </section>
        )}

        {/* Platform Health & Cumulative Totals */}
        <Card className="rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <Gauge className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base font-bold">
                    {isContentManager ? "إجماليات المحتوى التراكمية" : "صحة المنصة والإجماليات التراكمية"}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {isContentManager
                      ? "مؤشرات المحتوى الكلية المسجلة في النظام"
                      : "نظرة شاملة على مخزون المحتوى والمستخدمين والوسائط والذكاء الاصطناعي"}
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                {platformItems.length} مؤشر كلي
              </Badge>
            </div>
          </CardHeader>
          {stats && (
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {platformItems.map(({ label, value, icon: ItemIcon }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-3.5 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <ItemIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-base font-bold tabular-nums text-foreground">{value}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

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
