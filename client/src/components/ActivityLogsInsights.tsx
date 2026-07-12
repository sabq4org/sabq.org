import { useMemo } from "react";
import { format, subDays } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpLeft,
  Bot,
  Database,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getActionPresentation, getEntityTypeLabel } from "@/lib/activityUtils";

export interface ActivityLogsAnalytics {
  periodDays: number;
  summary: {
    totalCount: number;
    previousCount: number;
    changePercent: number | null;
    activeUsers: number;
    affectedEntities: number;
    sensitiveActions: number;
    automatedActions: number;
    averagePerDay: number;
    lastActivityAt: string | null;
  };
  topUsers: Array<{
    userId: string;
    userName: string;
    email: string;
    activityCount: number;
    profileImageUrl: string | null;
  }>;
  topActions: Array<{ action: string; count: number }>;
  topEntities: Array<{ entityType: string; count: number }>;
  recentActivity: Array<{ date: string; count: number }>;
}

interface ActivityLogsInsightsProps {
  analytics?: ActivityLogsAnalytics | null;
  isLoading?: boolean;
}

function formatNumber(value: number) {
  return value.toLocaleString("ar-SA");
}

export default function ActivityLogsInsights({ analytics, isLoading }: ActivityLogsInsightsProps) {
  const activityByDay = useMemo(() => {
    if (!analytics) return [];
    const counts = new Map(analytics.recentActivity.map((item) => [item.date, item.count]));
    return Array.from({ length: analytics.periodDays }, (_, index) => {
      const date = subDays(new Date(), analytics.periodDays - index - 1);
      const key = format(date, "yyyy-MM-dd");
      return {
        date: key,
        label: format(date, analytics.periodDays > 30 ? "d MMM" : "EEE d", { locale: ar }),
        count: counts.get(key) || 0,
      };
    });
  }, [analytics]);

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="insights-loading">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-32 rounded-2xl" />)}
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl xl:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  // Cloudflare Pages and Railway deploy independently. During a rolling deploy,
  // the new UI can briefly receive the legacy analytics payload, which did not
  // include `summary`. Keep the audit table usable instead of crashing the page.
  if (!analytics?.summary) return null;

  const { summary } = analytics;
  const change = summary.changePercent;
  const maxAction = Math.max(...analytics.topActions.map((item) => item.count), 1);
  const metricCards = [
    {
      title: "إجمالي النشاط",
      value: formatNumber(summary.totalCount),
      detail: `${formatNumber(summary.averagePerDay)} عملية يومياً في المتوسط`,
      icon: Activity,
      tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      testId: "stat-total",
    },
    {
      title: "المستخدمون النشطون",
      value: formatNumber(summary.activeUsers),
      detail: "مستخدمون نفّذوا عملية واحدة على الأقل",
      icon: Users,
      tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
      testId: "stat-active-users",
    },
    {
      title: "الكيانات المتأثرة",
      value: formatNumber(summary.affectedEntities),
      detail: "سجلات فريدة طالها تغيير أو إجراء",
      icon: Database,
      tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      testId: "stat-entities",
    },
    {
      title: "عمليات حساسة",
      value: formatNumber(summary.sensitiveActions),
      detail: "حذف أو حظر أو رفض أو تغيير وصول",
      icon: ShieldAlert,
      tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      testId: "stat-sensitive",
    },
  ];

  return (
    <section className="space-y-4" data-testid="activity-insights">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.title} className="rounded-2xl border-border/70 shadow-sm" data-testid={metric.testId}>
              <CardContent className="p-5">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">{metric.title}</span>
                  <span className={`rounded-xl p-2.5 ${metric.tone}`}><Icon className="h-5 w-5" /></span>
                </div>
                <div className="text-3xl font-bold tracking-tight tabular-nums">{metric.value}</div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl border-border/70 shadow-sm xl:col-span-2" data-testid="chart-activity-trend">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">اتجاه النشاط</CardTitle>
              <CardDescription className="mt-1">عدد العمليات المسجلة يومياً</CardDescription>
            </div>
            <div className="text-left">
              {change === null ? (
                <span className="text-xs text-muted-foreground">لا تتوفر فترة سابقة للمقارنة</span>
              ) : (
                <div className={`flex items-center gap-1 text-sm font-semibold ${change >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {change >= 0 ? <ArrowUpLeft className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                  <span dir="ltr">{Math.abs(change).toLocaleString("ar-SA")}%</span>
                </div>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">مقارنة بالفترة السابقة المماثلة</p>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4 sm:px-5">
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={activityByDay} margin={{ top: 10, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} className="stroke-border/70" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={34} tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? format(new Date(`${payload[0].payload.date}T12:00:00`), "d MMMM yyyy", { locale: ar }) : ""}
                  formatter={(value: number) => [`${formatNumber(value)} عملية`, "النشاط"]}
                  contentStyle={{ borderRadius: 12, borderColor: "hsl(var(--border))", background: "hsl(var(--popover))" }}
                />
                <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#activityFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm" data-testid="chart-top-actions">
          <CardHeader>
            <CardTitle className="text-base">أكثر العمليات تكراراً</CardTitle>
            <CardDescription>حصة كل عملية من النشاط الأعلى</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {analytics.topActions.length ? analytics.topActions.map((item) => {
              const presentation = getActionPresentation(item.action);
              const Icon = presentation.icon;
              return (
                <div key={item.action}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><Icon className={`h-4 w-4 ${presentation.textColor}`} />{presentation.label}</span>
                    <strong className="tabular-nums">{formatNumber(item.count)}</strong>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/75" style={{ width: `${(item.count / maxAction) * 100}%` }} />
                  </div>
                </div>
              );
            }) : <p className="py-16 text-center text-sm text-muted-foreground">لا توجد بيانات في هذه الفترة</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/70 shadow-sm" data-testid="chart-top-entities">
          <CardHeader>
            <CardTitle className="text-base">النشاط حسب نوع الكيان</CardTitle>
            <CardDescription>أكثر أجزاء النظام تأثراً بالعمليات</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={analytics.topEntities.map((item) => ({ ...item, label: getEntityTypeLabel(item.entityType) }))} layout="vertical" margin={{ right: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="4 4" horizontal={false} className="stroke-border/70" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={82} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => [`${formatNumber(value)} عملية`, "النشاط"]} contentStyle={{ borderRadius: 12, borderColor: "hsl(var(--border))", background: "hsl(var(--popover))" }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 6, 6]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 shadow-sm" data-testid="top-users-list">
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">الأكثر نشاطاً</CardTitle>
              <CardDescription className="mt-1">المستخدمون الأعلى تنفيذاً للعمليات</CardDescription>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" />
              {formatNumber(summary.automatedActions)} آلية
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {analytics.topUsers.length ? analytics.topUsers.map((user, index) => (
              <div key={user.userId} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/60">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-xs font-bold tabular-nums">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.userName}</p>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">{user.email}</p>
                </div>
                <strong className="text-sm tabular-nums">{formatNumber(user.activityCount)}</strong>
              </div>
            )) : <p className="py-16 text-center text-sm text-muted-foreground">لا توجد بيانات في هذه الفترة</p>}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
