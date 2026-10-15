import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Clock,
  Heart,
  MessageSquare,
  Bookmark,
  TrendingUp,
  Smartphone,
  Monitor,
  Tablet,
  RefreshCw,
  Sun,
  CloudSun,
  Moon,
  Sunrise,
  BarChart3,
  MousePointerClick,
  CheckCircle2,
  Flame,
  Eye,
  Sparkles,
  Calendar,
  Compass,
  Activity,
  ExternalLink,
} from "lucide-react";

interface UserBehaviorData {
  totalUsers: number;
  readingTimeAvg: number;
  totalReads: number;
  topCategories: Array<{ name: string; count: number }>;
  interactionCounts: {
    likes: number;
    comments: number;
    bookmarks: number;
  };
  activeHours: {
    morning: number;
    noon: number;
    evening: number;
    night: number;
  };
  deviceDistribution: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  returnRate: number;
  returningUsersCount: number;
}

interface AdvancedOverviewData {
  sessions: {
    total: number;
    uniqueUsers: number;
    newVisitors: number;
    returningVisitors: number;
    avgDuration: number;
    avgPagesPerSession: number;
  };
  engagement: {
    avgScrollDepth: number;
    avgTimeOnPage: number;
    bounceRate: number;
    completionRate: number;
  };
  topArticles: Array<{
    articleId: string;
    title: string;
    views: number;
    avgTimeOnPage: number;
    engagementScore: number;
  }>;
  topCategories: Array<{
    categoryId: string;
    name: string;
    views: number;
    avgEngagement: number;
  }>;
}

interface PeakHoursData {
  hourly: Array<{ hour: number; count: number; avgEngagement: number }>;
  daily: Array<{ day: string; count: number; avgEngagement: number }>;
}

interface RealTimeData {
  activeUsers: number;
  currentPageViews: number;
  topCurrentArticles: Array<{ articleId: string; title: string; viewers: number }>;
  recentEvents: Array<{ type: string; count: number; trend: number }>;
}

const RANGE_OPTIONS = [
  { value: "1d", days: "1", label: "24 ساعة" },
  { value: "7d", days: "7", label: "7 أيام" },
  { value: "30d", days: "30", label: "30 يوماً" },
  { value: "90d", days: "90", label: "90 يوماً" },
] as const;

const ARABIC_DAYS: Record<string, string> = {
  sunday: "الأحد",
  monday: "الاثنين",
  tuesday: "الثلاثاء",
  wednesday: "الأربعاء",
  thursday: "الخميس",
  friday: "الجمعة",
  saturday: "السبت",
};

const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatNumber(val: number | undefined | null): string {
  if (val === undefined || val === null || Number.isNaN(val)) return "0";
  return Number(val).toLocaleString("en-US");
}

function formatSecondsToArabic(seconds: number | undefined | null): string {
  if (!seconds || seconds <= 0) return "—";
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded} ثانية`;
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (secs === 0) return `${mins} د`;
  return `${mins} د و ${secs} ث`;
}

function formatHourLabel(hour: number): string {
  if (hour === 0) return "12 ص";
  if (hour < 12) return `${hour} ص`;
  if (hour === 12) return "12 م";
  return `${hour - 12} م`;
}

function normalizeRate(val: number | undefined | null): number {
  if (!val || Number.isNaN(val)) return 0;
  const num = Number(val);
  return num <= 1 ? Math.round(num * 100) : Math.round(num);
}

export default function UserBehavior() {
  const [range, setRange] = useState<string>("7d");
  const selectedRangeObj = RANGE_OPTIONS.find((r) => r.value === range) ?? RANGE_OPTIONS[1];
  const daysParam = selectedRangeObj.days;

  const {
    data: behaviorData,
    isLoading: behaviorLoading,
    isFetching: behaviorFetching,
    refetch: refetchBehavior,
  } = useQuery<UserBehaviorData>({
    queryKey: [`/api/analytics/user-behavior?range=${range}`],
  });

  const {
    data: overviewData,
    isLoading: overviewLoading,
    isFetching: overviewFetching,
    refetch: refetchOverview,
  } = useQuery<AdvancedOverviewData>({
    queryKey: [`/api/advanced-analytics/overview?range=${daysParam}`],
  });

  const {
    data: peakHoursData,
    isLoading: peakLoading,
    refetch: refetchPeak,
  } = useQuery<PeakHoursData>({
    queryKey: [`/api/advanced-analytics/peak-hours?range=${daysParam}`],
  });

  const {
    data: realtimeData,
    isLoading: realtimeLoading,
    refetch: refetchRealtime,
  } = useQuery<RealTimeData>({
    queryKey: ["/api/advanced-analytics/realtime"],
    refetchInterval: 120000,
  });

  const isRefreshing = behaviorFetching || overviewFetching;

  const handleRefresh = () => {
    void refetchBehavior();
    void refetchOverview();
    void refetchPeak();
    void refetchRealtime();
  };

  // Compute merged categories (preferring advanced overview which has engagement + up to 10 categories)
  const categoriesList = useMemo(() => {
    if (Array.isArray(overviewData?.topCategories) && overviewData.topCategories.length > 0) {
      const totalViews = overviewData.topCategories.reduce((acc, c) => acc + (c.views || 0), 0);
      return overviewData.topCategories.map((c) => ({
        name: c.name || "غير مصنف",
        count: c.views || 0,
        share: totalViews > 0 ? Math.round(((c.views || 0) / totalViews) * 100) : 0,
        engagement: normalizeRate(c.avgEngagement),
      }));
    }
    if (Array.isArray(behaviorData?.topCategories) && behaviorData.topCategories.length > 0) {
      const totalViews = behaviorData.topCategories.reduce((acc, c) => acc + (c.count || 0), 0);
      return behaviorData.topCategories.map((c) => ({
        name: c.name || "غير مصنف",
        count: c.count || 0,
        share: totalViews > 0 ? Math.round(((c.count || 0) / totalViews) * 100) : 0,
        engagement: null as number | null,
      }));
    }
    return [];
  }, [overviewData?.topCategories, behaviorData?.topCategories]);

  // Compute time periods (Morning, Noon, Evening, Night)
  const timePeriods = useMemo(() => {
    const hours = behaviorData?.activeHours ?? { morning: 0, noon: 0, evening: 0, night: 0 };
    const raw = [
      {
        id: "morning",
        name: "الفترة الصباحية",
        sub: "6:00 ص – 12:00 م",
        value: hours.morning || 0,
        icon: Sunrise,
        tone: "text-amber-500 bg-amber-500/10",
        barColor: "bg-amber-500",
      },
      {
        id: "noon",
        name: "فترة الظهيرة",
        sub: "12:00 م – 5:00 م",
        value: hours.noon || 0,
        icon: Sun,
        tone: "text-orange-500 bg-orange-500/10",
        barColor: "bg-orange-500",
      },
      {
        id: "evening",
        name: "الفترة المسائية",
        sub: "5:00 م – 10:00 م",
        value: hours.evening || 0,
        icon: CloudSun,
        tone: "text-primary bg-primary/10",
        barColor: "bg-primary",
      },
      {
        id: "night",
        name: "الفترة الليلية",
        sub: "10:00 م – 6:00 ص",
        value: hours.night || 0,
        icon: Moon,
        tone: "text-indigo-500 bg-indigo-500/10",
        barColor: "bg-indigo-500",
      },
    ];
    const total = raw.reduce((sum, item) => sum + item.value, 0);
    const maxVal = Math.max(...raw.map((item) => item.value), 1);
    return raw.map((item) => ({
      ...item,
      share: total > 0 ? Math.round((item.value / total) * 100) : 0,
      widthPercent: Math.round((item.value / maxVal) * 100),
    }));
  }, [behaviorData?.activeHours]);

  // Peak hour from 24h distribution
  const hourlyBreakdown = useMemo(() => {
    const list = Array.isArray(peakHoursData?.hourly) ? peakHoursData.hourly : [];
    const map = new Map(list.map((h) => [Number(h.hour), h]));
    const full24 = Array.from({ length: 24 }, (_, hour) => {
      const item = map.get(hour);
      return {
        hour,
        label: formatHourLabel(hour),
        count: Number(item?.count || 0),
        engagement: normalizeRate(item?.avgEngagement),
      };
    });
    const maxCount = Math.max(...full24.map((h) => h.count), 1);
    const peak = full24.reduce(
      (best, cur) => (cur.count > best.count ? cur : best),
      full24[0] || { hour: 0, label: "12 ص", count: 0, engagement: 0 }
    );
    return { full24, maxCount, peak };
  }, [peakHoursData?.hourly]);

  // Daily breakdown (Sunday - Saturday)
  const dailyBreakdown = useMemo(() => {
    const list = Array.isArray(peakHoursData?.daily) ? peakHoursData.daily : [];
    const rows = DAY_ORDER.map((day) => {
      const match = list.find((d) => d.day?.toLowerCase().trim() === day.toLowerCase());
      return {
        dayKey: day,
        label: ARABIC_DAYS[day.toLowerCase()] || day,
        count: Number(match?.count || 0),
        engagement: normalizeRate(match?.avgEngagement),
      };
    });
    const maxCount = Math.max(...rows.map((r) => r.count), 1);
    const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
    const bestDay = rows.reduce(
      (best, cur) => (cur.count > best.count ? cur : best),
      rows[0] || { dayKey: "Sunday", label: "الأحد", count: 0, engagement: 0 }
    );
    return {
      rows: rows.map((r) => ({
        ...r,
        widthPercent: Math.round((r.count / maxCount) * 100),
        share: totalCount > 0 ? Math.round((r.count / totalCount) * 100) : 0,
      })),
      bestDay,
    };
  }, [peakHoursData?.daily]);

  // Interactions breakdown
  const interactionsSummary = useMemo(() => {
    const likes = behaviorData?.interactionCounts?.likes || 0;
    const comments = behaviorData?.interactionCounts?.comments || 0;
    const bookmarks = behaviorData?.interactionCounts?.bookmarks || 0;
    const total = likes + comments + bookmarks;
    return {
      total,
      items: [
        {
          id: "likes",
          testId: "stat-likes",
          label: "الإعجابات والتفاعل العاطفي",
          value: likes,
          share: total > 0 ? Math.round((likes / total) * 100) : 0,
          icon: Heart,
          color: "text-rose-500",
          bg: "bg-rose-500/10",
          bar: "bg-rose-500",
        },
        {
          id: "comments",
          testId: "stat-comments",
          label: "التعليقات والنقاشات",
          value: comments,
          share: total > 0 ? Math.round((comments / total) * 100) : 0,
          icon: MessageSquare,
          color: "text-blue-500",
          bg: "bg-blue-500/10",
          bar: "bg-blue-500",
        },
        {
          id: "bookmarks",
          testId: "stat-bookmarks",
          label: "الحفظ للقراءة لاحقاً",
          value: bookmarks,
          share: total > 0 ? Math.round((bookmarks / total) * 100) : 0,
          icon: Bookmark,
          color: "text-emerald-500",
          bg: "bg-emerald-500/10",
          bar: "bg-emerald-500",
        },
      ],
    };
  }, [behaviorData?.interactionCounts]);

  // Device breakdown
  const devicesList = useMemo(() => {
    const dist = behaviorData?.deviceDistribution ?? { mobile: 65, desktop: 30, tablet: 5 };
    return [
      {
        id: "mobile",
        name: "الهواتف الذكية",
        desc: "تصفح عبر الجوال وتطبيقات سبق",
        value: dist.mobile ?? 65,
        icon: Smartphone,
        tone: "text-primary bg-primary/10",
        bar: "bg-primary",
      },
      {
        id: "desktop",
        name: "أجهزة الحاسوب",
        desc: "تصفح مكتبي وشاشات عريضة",
        value: dist.desktop ?? 30,
        icon: Monitor,
        tone: "text-blue-500 bg-blue-500/10",
        bar: "bg-blue-500",
      },
      {
        id: "tablet",
        name: "الأجهزة اللوحية",
        desc: "آيباد وأجهزة التابلت",
        value: dist.tablet ?? 5,
        icon: Tablet,
        tone: "text-emerald-500 bg-emerald-500/10",
        bar: "bg-emerald-500",
      },
    ];
  }, [behaviorData?.deviceDistribution]);

  const scrollDepth = normalizeRate(overviewData?.engagement?.avgScrollDepth);
  const completionRate = normalizeRate(overviewData?.engagement?.completionRate);
  const avgTimeSeconds = overviewData?.engagement?.avgTimeOnPage || 0;
  const readingMinutesDisplay =
    behaviorData?.readingTimeAvg && behaviorData.readingTimeAvg > 0
      ? `${behaviorData.readingTimeAvg} دقيقة`
      : avgTimeSeconds > 0
        ? formatSecondsToArabic(avgTimeSeconds)
        : "0 دقيقة";

  const topArticles = Array.isArray(overviewData?.topArticles) ? overviewData.topArticles : [];
  const liveArticles = Array.isArray(realtimeData?.topCurrentArticles)
    ? realtimeData.topCurrentArticles
    : [];

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-12 sm:px-6" dir="rtl">
        {/* Page Header — always rendered immediately */}
        <DashboardPageHeader
          icon={Users}
          title="سلوك المستخدمين الذكي"
          description="تحليل متعمق لحركة القرّاء، جودة الاستبقاء، أوقات الذروة، والتفاعل اللحظي مع المحتوى"
          titleTestId="heading-user-behavior"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-xl border border-border bg-muted/40 p-1">
                {RANGE_OPTIONS.map((opt) => {
                  const active = range === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRange(opt.value)}
                      data-testid={`button-range-${opt.value}`}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-9 gap-2 rounded-xl"
                data-testid="button-refresh"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                تحديث البيانات
              </Button>
            </div>
          }
        />

        {/* Primary KPI Grid — 6 Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* 1. إجمالي القراءات */}
          <Card className="relative overflow-hidden border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">إجمالي القراءات</p>
                  {behaviorLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div
                      className="text-2xl font-bold tracking-tight tabular-nums"
                      data-testid="stat-total-reads"
                    >
                      {formatNumber(behaviorData?.totalReads)}
                    </div>
                  )}
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500">
                  <BarChart3 className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>خلال {selectedRangeObj.label}</span>
                {behaviorData?.totalUsers ? (
                  <Badge variant="secondary" className="text-[11px] font-medium">
                    {(behaviorData.totalReads / Math.max(behaviorData.totalUsers, 1)).toFixed(1)} مقال/قارئ
                  </Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* 2. القراء النشطون */}
          <Card className="relative overflow-hidden border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">إجمالي المستخدمين النشطين</p>
                  {behaviorLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div
                      className="text-2xl font-bold tracking-tight tabular-nums"
                      data-testid="stat-total-users"
                    >
                      {formatNumber(behaviorData?.totalUsers)}
                    </div>
                  )}
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
                  <Users className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>مسجلون متفاعلون</span>
                {behaviorData?.returningUsersCount !== undefined && (
                  <span className="font-medium text-foreground">
                    {formatNumber(behaviorData.returningUsersCount)} عائد
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 3. معدل العودة */}
          <Card className="relative overflow-hidden border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">معدل العودة والولاء</p>
                  {behaviorLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div
                      className="text-2xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400"
                      data-testid="stat-return-rate"
                    >
                      {behaviorData?.returnRate ?? 0}%
                    </div>
                  )}
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
                  <TrendingUp className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${Math.min(behaviorData?.returnRate ?? 0, 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">من القرّاء يعودون لأكثر من يوم</p>
              </div>
            </CardContent>
          </Card>

          {/* 4. متوسط وقت القراءة */}
          <Card className="relative overflow-hidden border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">متوسط وقت القراءة</p>
                  {behaviorLoading && overviewLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div
                      className="text-2xl font-bold tracking-tight tabular-nums"
                      data-testid="stat-reading-time"
                    >
                      {readingMinutesDisplay}
                    </div>
                  )}
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                  <Clock className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>لكل مقال مقروء</span>
                {avgTimeSeconds > 0 && (
                  <span className="font-medium text-foreground tabular-nums">
                    ({Math.round(avgTimeSeconds)} ثانية)
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 5. عمق التمرير */}
          <Card className="relative overflow-hidden border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">متوسط عمق التمرير</p>
                  {overviewLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div
                      className="text-2xl font-bold tracking-tight tabular-nums"
                      data-testid="stat-scroll-depth"
                    >
                      {scrollDepth}%
                    </div>
                  )}
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <MousePointerClick className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                    style={{ width: `${Math.min(scrollDepth, 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">نسبة التمرير داخل نص الخبر</p>
              </div>
            </CardContent>
          </Card>

          {/* 6. معدل إتمام القراءة */}
          <Card className="relative overflow-hidden border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">معدل إتمام القراءة</p>
                  {overviewLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div
                      className="text-2xl font-bold tracking-tight tabular-nums"
                      data-testid="stat-completion-rate"
                    >
                      {completionRate}%
                    </div>
                  )}
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-rose-500 transition-all duration-500"
                    style={{ width: `${Math.min(completionRate, 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">إكمال قراءة المادة للنهاية</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Middle Section: Temporal Rhythm (8 cols) + Community Interactions & Live Pulse (4 cols) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Temporal Rhythm & Peak Hours */}
          <Card className="border-border/60 lg:col-span-8">
            <CardHeader className="flex flex-col gap-3 border-b border-border/50 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="h-5 w-5 text-primary" />
                  الإيقاع الزمني للنشاط وأوقات الذروة
                </CardTitle>
                <CardDescription className="mt-1">
                  توزيع نشاط القراءة والتفاعل حسب فترات اليوم وساعات الذروة وأيام الأسبوع
                </CardDescription>
              </div>
              {hourlyBreakdown.peak.count > 0 && (
                <Badge variant="outline" className="gap-1.5 self-start px-3 py-1 text-xs sm:self-auto">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  ذروة القراءة: {hourlyBreakdown.peak.label} ({formatNumber(hourlyBreakdown.peak.count)})
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-5">
              <Tabs defaultValue="periods" dir="rtl" className="space-y-5">
                <TabsList className="grid w-full max-w-md grid-cols-3">
                  <TabsTrigger value="periods" data-testid="tab-time-periods">
                    فترات اليوم
                  </TabsTrigger>
                  <TabsTrigger value="hourly" data-testid="tab-hourly-24">
                    24 ساعة
                  </TabsTrigger>
                  <TabsTrigger value="daily" data-testid="tab-weekly-days">
                    أيام الأسبوع
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: 4 Day Periods + Hourly Mini Strip */}
                <TabsContent value="periods" className="space-y-6">
                  {behaviorLoading ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-24 rounded-xl" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {timePeriods.map((period) => {
                        const Icon = period.icon;
                        return (
                          <div
                            key={period.id}
                            className="rounded-xl border border-border/60 bg-muted/20 p-4 transition-colors hover:bg-muted/40"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <span
                                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${period.tone}`}
                                >
                                  <Icon className="h-5 w-5" />
                                </span>
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{period.name}</p>
                                  <p className="text-xs text-muted-foreground">{period.sub}</p>
                                </div>
                              </div>
                              <div className="text-left">
                                <p className="text-lg font-bold tabular-nums text-foreground">
                                  {formatNumber(period.value)}
                                </p>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {period.share}% من النشاط
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${period.barColor}`}
                                style={{ width: `${period.widthPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 24-hour visual sparkline bar below periods */}
                  {!peakLoading && hourlyBreakdown.peak.count > 0 && (
                    <div className="rounded-xl border border-border/50 bg-card p-4">
                      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">خريطة النشاط على مدار 24 ساعة</span>
                        <span>مرّر المؤشر على الساعة لعرض حجم القراءات</span>
                      </div>
                      <div className="flex h-28 items-end gap-1 pt-2">
                        {hourlyBreakdown.full24.map((item) => {
                          const heightPct = Math.max(
                            Math.round((item.count / hourlyBreakdown.maxCount) * 100),
                            6
                          );
                          const isPeak = item.hour === hourlyBreakdown.peak.hour && item.count > 0;
                          return (
                            <div
                              key={item.hour}
                              className="group relative flex h-full flex-1 flex-col justify-end"
                              title={`${item.label}: ${formatNumber(item.count)} قراءة (${item.engagement}% تفاعل)`}
                            >
                              <div
                                className={`w-full rounded-t transition-all ${
                                  isPeak
                                    ? "bg-primary"
                                    : "bg-primary/30 group-hover:bg-primary/70"
                                }`}
                                style={{ height: `${heightPct}%` }}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                        <span>12 ص</span>
                        <span>6 ص</span>
                        <span>12 م</span>
                        <span>6 م</span>
                        <span>11 م</span>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Tab 2: Detailed 24-Hour Breakdown */}
                <TabsContent value="hourly" className="space-y-4">
                  {peakLoading ? (
                    <Skeleton className="h-64 w-full rounded-xl" />
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                      {hourlyBreakdown.full24.map((item) => {
                        const pct = Math.round((item.count / hourlyBreakdown.maxCount) * 100);
                        const isPeak = item.hour === hourlyBreakdown.peak.hour && item.count > 0;
                        return (
                          <div
                            key={item.hour}
                            className={`rounded-xl border p-3 transition-colors ${
                              isPeak
                                ? "border-primary/50 bg-primary/5"
                                : "border-border/60 bg-muted/15"
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-foreground">{item.label}</span>
                              <span className="font-bold tabular-nums text-primary">
                                {formatNumber(item.count)}
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>معدل التفاعل</span>
                              <span className="tabular-nums">{item.engagement}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>

                {/* Tab 3: Weekly Days Breakdown */}
                <TabsContent value="daily" className="space-y-3">
                  {peakLoading ? (
                    <Skeleton className="h-64 w-full rounded-xl" />
                  ) : (
                    <div className="space-y-3">
                      {dailyBreakdown.rows.map((row) => {
                        const isBest =
                          row.dayKey === dailyBreakdown.bestDay.dayKey && row.count > 0;
                        return (
                          <div
                            key={row.dayKey}
                            className={`flex items-center gap-4 rounded-xl border p-3 ${
                              isBest
                                ? "border-primary/40 bg-primary/5"
                                : "border-border/50 bg-muted/15"
                            }`}
                          >
                            <div className="w-20 shrink-0">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm font-semibold">{row.label}</span>
                              </div>
                            </div>
                            <div className="flex-1">
                              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary transition-all duration-500"
                                  style={{ width: `${row.widthPercent}%` }}
                                />
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 text-left">
                              <span className="w-16 text-sm font-bold tabular-nums">
                                {formatNumber(row.count)}
                              </span>
                              <Badge variant="secondary" className="text-xs tabular-nums">
                                {row.engagement}% تفاعل
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Left Column (4 cols): Interactions + Live Pulse */}
          <div className="space-y-6 lg:col-span-4">
            {/* Interactions Breakdown Card */}
            <Card className="border-border/60">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Heart className="h-5 w-5 text-rose-500" />
                    تفاعلات القرّاء
                  </CardTitle>
                  <Badge variant="outline" className="tabular-nums">
                    {formatNumber(interactionsSummary.total)} تفاعل
                  </Badge>
                </div>
                <CardDescription>توزيع الإعجابات والتعليقات وحفظ المقالات</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                {/* Stacked proportional bar */}
                {interactionsSummary.total > 0 && (
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted p-0.5 gap-0.5">
                    {interactionsSummary.items.map((item) => (
                      <div
                        key={item.id}
                        className={`h-full first:rounded-r-full last:rounded-l-full ${item.bar}`}
                        style={{ width: `${Math.max(item.share, 4)}%` }}
                        title={`${item.label}: ${item.share}%`}
                      />
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  {interactionsSummary.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-3.5 transition-colors hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.bg} ${item.color}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.share}% من إجمالي التفاعل</p>
                          </div>
                        </div>
                        <span
                          className="text-lg font-bold tabular-nums text-foreground"
                          data-testid={item.testId}
                        >
                          {formatNumber(item.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Real-time Reading Pulse */}
            <Card className="border-border/60">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                    يُقرأ الآن لحظياً
                  </CardTitle>
                  <Activity className="h-4 w-4 text-emerald-500" />
                </div>
                <CardDescription>أبرز الأخبار النشطة في هذه اللحظة</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {realtimeLoading ? (
                  <div className="space-y-2.5">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-lg" />
                    ))}
                  </div>
                ) : liveArticles.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    لا توجد قراءات لحظية نشطة في هذه الثانية
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {liveArticles.slice(0, 5).map((art, idx) => (
                      <div
                        key={art.articleId}
                        className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/20 p-2.5 text-sm"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary tabular-nums">
                          {idx + 1}
                        </span>
                        <span className="flex-1 truncate font-medium text-foreground">
                          {art.title}
                        </span>
                        <Badge variant="secondary" className="shrink-0 gap-1 tabular-nums">
                          <Eye className="h-3 w-3 text-emerald-500" />
                          {art.viewers}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom Section: Categories Interest (5 cols) + Top Engaging Articles (7 cols) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Categories Interest Map */}
          <Card className="border-border/60 lg:col-span-5">
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Compass className="h-5 w-5 text-primary" />
                    الاهتمامات الذكية حسب التصنيف
                  </CardTitle>
                  <CardDescription className="mt-1">
                    الأقسام الأكثر جذباً للقرّاء ومعدل التفاعل مع كل قسم
                  </CardDescription>
                </div>
                <Badge variant="outline" className="tabular-nums">
                  {categoriesList.length} أقسام
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {behaviorLoading && overviewLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : categoriesList.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  لا توجد بيانات تصنيفات متاحة لهذه الفترة
                </div>
              ) : (
                <div className="space-y-3.5">
                  {categoriesList.slice(0, 8).map((cat, idx) => {
                    const maxCatCount = Math.max(...categoriesList.map((c) => c.count), 1);
                    const widthPct = Math.round((cat.count / maxCatCount) * 100);
                    return (
                      <div
                        key={`${cat.name}-${idx}`}
                        className="rounded-xl border border-border/50 bg-muted/15 p-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary tabular-nums">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-sm text-foreground">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold tabular-nums text-foreground">
                              {formatNumber(cat.count)}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              ({cat.share}%)
                            </span>
                            {cat.engagement !== null && (
                              <Badge variant="secondary" className="text-[11px] tabular-nums">
                                {cat.engagement}% تفاعل
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Engaging Articles */}
          <Card className="border-border/60 lg:col-span-7">
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Flame className="h-5 w-5 text-orange-500" />
                    المقالات الأعلى قراءة واستبقاءً للقرّاء
                  </CardTitle>
                  <CardDescription className="mt-1">
                    ترتيب المواد الإخبارية حسب القراءات الفعلية ومتوسط زمن البقاء ومؤشر التفاعل
                  </CardDescription>
                </div>
                <Link href="/dashboard/article-analytics">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    تحليلات المقالات
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {overviewLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : topArticles.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  لا توجد مقالات مسجلة خلال هذه الفترة
                </div>
              ) : (
                <div className="space-y-2.5">
                  {topArticles.slice(0, 8).map((article, index) => {
                    const engagementPct = normalizeRate(article.engagementScore);
                    return (
                      <div
                        key={article.articleId}
                        className="flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/15 p-3.5 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary tabular-nums">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-semibold text-foreground">
                              {article.title || "مقال بدون عنوان"}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Eye className="h-3.5 w-3.5 text-blue-500" />
                                {formatNumber(article.views)} قراءة
                              </span>
                              <span>•</span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Clock className="h-3.5 w-3.5 text-amber-500" />
                                متوسط البقاء: {formatSecondsToArabic(article.avgTimeOnPage)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                          <Badge
                            variant={engagementPct >= 40 ? "default" : "secondary"}
                            className="tabular-nums"
                          >
                            {engagementPct}% تفاعل
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Devices & Platforms Distribution Strip */}
        <Card className="border-border/60">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-5 w-5 text-primary" />
              توزيع الأجهزة وبيئة القراءة
            </CardTitle>
            <CardDescription>نسب وصول القرّاء إلى المنصة بحسب نوع الجهاز</CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {devicesList.map((dev) => {
                const Icon = dev.icon;
                return (
                  <div
                    key={dev.id}
                    className="flex flex-col justify-between rounded-xl border border-border/60 bg-muted/15 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${dev.tone}`}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{dev.name}</p>
                          <p className="text-xs text-muted-foreground">{dev.desc}</p>
                        </div>
                      </div>
                      <span className="text-2xl font-bold tabular-nums text-foreground">
                        {dev.value}%
                      </span>
                    </div>
                    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${dev.bar}`}
                        style={{ width: `${Math.min(dev.value, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
