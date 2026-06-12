import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Users, Coins, Gift, BarChart3, Download, Trophy, TrendingUp,
  TrendingDown, Minus, Sparkles, AlertCircle, Clock, RefreshCw,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
  BarChart, Bar,
} from "recharts";
import { LOYALTY_TIERS } from "@shared/loyalty";
import { formatNumber } from "@/lib/format";

// ----------------------------------------------------------------------------
// Types matching the /api/loyalty-admin/* contract on the backend
// ----------------------------------------------------------------------------

type Period = "7d" | "30d" | "90d" | "all";

type Kpis = {
  totalMembers: number;
  newMembersInRange: number | null;
  pointsEarned: number;
  pointsEarnedPrev: number | null;
  pointsSpent: number;
  pointsSpentPrev: number | null;
  avgLifetimePerMember: number;
  totalLifetimePoints: number;
};

type TierBucket = {
  level: number;
  nameAr: string;
  nameEn: string;
  color: string;
  minLifetimePoints: number;
  count: number;
  percentage: number;
  /** Users whose stored rank_level matches this tier but whose lifetime
   *  points fall BELOW the threshold (Phase 1 migration grandfathered
   *  legacy "سفير سبق" / old top-tier holders, e.g. veteran sabq.org
   *  editors). Surfaced as a sub-label so admins know the count
   *  visually + can investigate via export. */
  grandfathered: number;
};

type TimeSeriesPoint = { day: string; earned: number; spent: number };

type ActionRow = {
  action: string;
  labelAr: string;
  icon: string;
  pointsPerEvent: number | null;
  events: number;
  points: number;
  uniqueUsers: number;
};

type TopUser = {
  rank: number;
  userId: string;
  name: string;
  email: string | null;
  avatar: string | null;
  pointsInRange: number;
  actionsInRange: number;
  lifetimePoints: number;
  /** True when the stored rank_level is HIGHER than the tier derived
   *  from lifetime_points — i.e. a legacy "سفير سبق" account whose
   *  current points wouldn't qualify under the Phase 1 thresholds.
   *  Surfaced as a small ✦ next to the badge so editors know the
   *  badge they're seeing is a legacy grant, not a current earn. */
  isGrandfathered?: boolean;
  tier: { level: number; nameAr: string; color: string };
};

type RewardPerf = {
  id: string;
  nameAr: string;
  rewardType: string;
  pointsCost: number;
  remainingStock: number | null;
  totalStock: number | null;
  isActive: boolean;
  redemptions: number;
  totalPointsSpent: number;
  lowStock: boolean;
};

type RecentEvent = {
  id: string;
  userId: string;
  userName: string;
  action: string;
  actionLabel: string;
  actionIcon: string;
  points: number;
  createdAt: string;
};

// ----------------------------------------------------------------------------
// Page component
// ----------------------------------------------------------------------------

export default function LoyaltyAdminDashboard() {
  const { user, isLoading: authLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const [period, setPeriod] = useState<Period>("30d");
  const [actionFilter, setActionFilter] = useState<string>("all");

  // Gate: only admins/system_admins reach the data calls. Reader/writer roles
  // see a denied state instead of empty cards.
  const allowed = useMemo(() => hasRole(user, "admin") || hasRole(user, "system_admin"), [user]);

  const overview = useQuery<{ kpis: Kpis }>({
    queryKey: ["loyalty-admin:overview", period],
    queryFn: () => apiRequest(`/api/loyalty-admin/overview?period=${period}`),
    enabled: !!user && allowed,
  });

  const tiers = useQuery<{ total: number; tiers: TierBucket[] }>({
    queryKey: ["loyalty-admin:tiers"],
    queryFn: () => apiRequest(`/api/loyalty-admin/tier-distribution`),
    enabled: !!user && allowed,
  });

  const series = useQuery<{ series: TimeSeriesPoint[] }>({
    queryKey: ["loyalty-admin:series", period],
    queryFn: () => apiRequest(`/api/loyalty-admin/time-series?period=${period}`),
    enabled: !!user && allowed,
  });

  const actions = useQuery<{ actions: ActionRow[] }>({
    queryKey: ["loyalty-admin:actions", period],
    queryFn: () => apiRequest(`/api/loyalty-admin/action-breakdown?period=${period}`),
    enabled: !!user && allowed,
  });

  const topUsers = useQuery<{ users: TopUser[] }>({
    queryKey: ["loyalty-admin:top-users", period],
    queryFn: () => apiRequest(`/api/loyalty-admin/top-users?period=${period}&limit=10`),
    enabled: !!user && allowed,
  });

  const rewards = useQuery<{ rewards: RewardPerf[] }>({
    queryKey: ["loyalty-admin:rewards", period],
    queryFn: () => apiRequest(`/api/loyalty-admin/rewards-performance?period=${period}`),
    enabled: !!user && allowed,
  });

  const activity = useQuery<{ events: RecentEvent[] }>({
    queryKey: ["loyalty-admin:activity"],
    queryFn: () => apiRequest(`/api/loyalty-admin/recent-activity`),
    enabled: !!user && allowed,
    refetchInterval: 30_000, // light polling for the live feed
  });

  function handleExport() {
    const url = `/api/loyalty-admin/export?period=${period}`;
    // The browser handles the file download — no apiRequest wrapper needed.
    window.open(url, "_blank");
    toast({
      title: "جاري تجهيز التقرير",
      description: "سيبدأ التنزيل خلال ثوانٍ",
    });
  }

  function handleRefresh() {
    overview.refetch();
    tiers.refetch();
    series.refetch();
    actions.refetch();
    topUsers.refetch();
    rewards.refetch();
    activity.refetch();
  }

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 space-y-4">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!allowed) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center" dir="rtl">
          <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">صلاحية المسؤول مطلوبة</h2>
          <p className="text-muted-foreground">هذه الصفحة متاحة للمسؤولين فقط.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">نظام الولاء — لوحة التحكم</h1>
              <p className="text-sm text-muted-foreground">
                نظرة شاملة على أداء برنامج النقاط والمستويات
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-40" data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">آخر 7 أيام</SelectItem>
                <SelectItem value="30d">آخر 30 يوم</SelectItem>
                <SelectItem value="90d">آخر 90 يوم</SelectItem>
                <SelectItem value="all">كل الفترات</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4 ml-1" />
              تحديث
            </Button>

            <Button
              size="sm"
              onClick={handleExport}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid="button-export"
            >
              <Download className="h-4 w-4 ml-1" />
              تصدير Excel
            </Button>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="إجمالي الأعضاء"
            value={overview.data?.kpis.totalMembers ?? null}
            sublabel={
              overview.data?.kpis.newMembersInRange
                ? `+${overview.data.kpis.newMembersInRange} في الفترة`
                : "—"
            }
            icon={<Users className="h-5 w-5" />}
            color="blue"
            loading={overview.isLoading}
          />
          <KpiCard
            label="نقاط مكتسبة"
            value={overview.data?.kpis.pointsEarned ?? null}
            delta={diff(overview.data?.kpis.pointsEarned, overview.data?.kpis.pointsEarnedPrev)}
            icon={<Coins className="h-5 w-5" />}
            color="amber"
            loading={overview.isLoading}
          />
          <KpiCard
            label="نقاط مستبدلة"
            value={overview.data?.kpis.pointsSpent ?? null}
            delta={diff(overview.data?.kpis.pointsSpent, overview.data?.kpis.pointsSpentPrev)}
            icon={<Gift className="h-5 w-5" />}
            color="violet"
            loading={overview.isLoading}
          />
          <KpiCard
            label="متوسط النقاط / عضو"
            value={overview.data?.kpis.avgLifetimePerMember ?? null}
            sublabel="على مدى حياة العضوية"
            icon={<BarChart3 className="h-5 w-5" />}
            color="emerald"
            loading={overview.isLoading}
          />
        </div>

        {/* Tier distribution + Action breakdown side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">🎖 توزيع مستويات العضوية</CardTitle>
            </CardHeader>
            <CardContent>
              <TierDistribution data={tiers.data?.tiers ?? []} total={tiers.data?.total ?? 0} loading={tiers.isLoading} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">🎬 الأفعال الأكثر مكافأة</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionBreakdown data={actions.data?.actions ?? []} loading={actions.isLoading} />
            </CardContent>
          </Card>
        </div>

        {/* Time series */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📈 أداء النقاط عبر الزمن</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={series.data?.series ?? []} loading={series.isLoading} />
          </CardContent>
        </Card>

        {/* Top users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">⭐ الأكثر نشاطاً</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {topUsers.data?.users.length ?? 0} مستخدم
            </Badge>
          </CardHeader>
          <CardContent>
            <TopUsersTable data={topUsers.data?.users ?? []} loading={topUsers.isLoading} />
          </CardContent>
        </Card>

        {/* Rewards */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">🎁 المكافآت — أداء الاستبدال</CardTitle>
          </CardHeader>
          <CardContent>
            <RewardsGrid data={rewards.data?.rewards ?? []} loading={rewards.isLoading} />
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">⏱ السجل الأخير</CardTitle>
            <Badge variant="outline" className="text-xs">
              يتحدّث تلقائياً
            </Badge>
          </CardHeader>
          <CardContent>
            <ActivityFeed data={activity.data?.events ?? []} loading={activity.isLoading} />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

// ----------------------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------------------

function diff(now?: number | null, prev?: number | null) {
  if (now == null || prev == null || prev === 0) return null;
  return ((now - prev) / prev) * 100;
}

function KpiCard({
  label,
  value,
  sublabel,
  delta,
  icon,
  color,
  loading,
}: {
  label: string;
  value: number | null;
  sublabel?: string;
  delta?: number | null;
  icon: React.ReactNode;
  color: "blue" | "amber" | "violet" | "emerald";
  loading?: boolean;
}) {
  const colorMap = {
    blue: "from-blue-500/10 to-blue-500/5 text-blue-600 dark:text-blue-400",
    amber: "from-amber-500/10 to-amber-500/5 text-amber-600 dark:text-amber-400",
    violet: "from-violet-500/10 to-violet-500/5 text-violet-600 dark:text-violet-400",
    emerald: "from-emerald-500/10 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  };
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${colorMap[color]} dark:from-transparent dark:to-transparent blur-2xl opacity-50 -z-0`} />
      <CardContent className="p-5 relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${colorMap[color]}`}>{icon}</div>
        </div>
        <div className="text-3xl font-bold tabular-nums" data-testid={`kpi-${label}`}>
          {loading ? <Skeleton className="h-9 w-24" /> : formatNumber(value)}
        </div>
        <div className="mt-2 text-sm text-muted-foreground flex items-center gap-1.5">
          <span className="truncate">{label}</span>
        </div>
        {(sublabel || delta != null) && (
          <div className="mt-2 text-xs flex items-center gap-1.5">
            {delta != null && (
              <span
                className={`inline-flex items-center gap-0.5 font-medium ${
                  delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-muted-foreground"
                }`}
              >
                {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {Math.abs(delta).toFixed(1)}%
              </span>
            )}
            {sublabel && <span className="text-muted-foreground">{sublabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TierDistribution({ data, total, loading }: { data: TierBucket[]; total: number; loading: boolean }) {
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (data.length === 0 || total === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground">لا توجد بيانات بعد</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
      <div className="md:col-span-2 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="nameAr"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={2}
            >
              {data.map((entry) => (
                <Cell key={entry.level} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string, props: any) => [
                `${formatNumber(value)} عضو (${props.payload.percentage.toFixed(1)}%)`,
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="text-center text-sm font-medium -mt-3">
          {formatNumber(total)} عضو
        </div>
      </div>

      <div className="md:col-span-3 space-y-2">
        {data.map((tier) => (
          <div
            key={tier.level}
            className="flex items-start justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tier.color }} />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{tier.nameAr}</span>
                  <span className="text-xs text-muted-foreground">
                    ≥ {formatNumber(tier.minLifetimePoints)} نقطة
                  </span>
                </div>
                {tier.grandfathered > 0 && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                    + {tier.grandfathered} عضواً قديماً (مُرحَّل من النظام السابق)
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-bold tabular-nums">{formatNumber(tier.count)}</span>
              <span className="text-xs text-muted-foreground tabular-nums w-12 text-left">
                {tier.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionBreakdown({ data, loading }: { data: ActionRow[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (data.length === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground">لا توجد أفعال مسجّلة في هذه الفترة</div>;
  }
  const max = Math.max(...data.map((d) => d.points));
  return (
    <div className="space-y-3">
      {data.map((row) => (
        <div key={row.action}>
          <div className="flex items-center justify-between mb-1 text-sm">
            <div className="flex items-center gap-2">
              <span>{row.icon}</span>
              <span className="font-medium">{row.labelAr}</span>
              <span className="text-xs text-muted-foreground">
                · {formatNumber(row.uniqueUsers)} مستخدم
              </span>
            </div>
            <span className="font-bold tabular-nums text-sm">
              {formatNumber(row.points)} نقطة
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-amber-500 to-amber-400 transition-all duration-500"
              style={{ width: `${max > 0 ? (row.points / max) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TimeSeriesChart({ data, loading }: { data: TimeSeriesPoint[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-72 w-full" />;
  if (data.length === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground">لا توجد بيانات للفترة</div>;
  }
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => v.slice(5)}
            reversed
          />
          <YAxis tick={{ fontSize: 11 }} orientation="right" />
          <Tooltip
            labelFormatter={(label: string) => label}
            formatter={(value: number) => formatNumber(value)}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => (value === "earned" ? "نقاط مكتسبة" : "نقاط مستبدلة")}
          />
          <Line type="monotone" dataKey="earned" stroke="#3B82F6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="spent" stroke="#7C3AED" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopUsersTable({ data, loading }: { data: TopUser[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-64 w-full" />;
  if (data.length === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground">لا توجد بيانات</div>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-right w-12">#</TableHead>
          <TableHead className="text-right">المستخدم</TableHead>
          <TableHead className="text-right">المستوى</TableHead>
          <TableHead className="text-right">نقاط الفترة</TableHead>
          <TableHead className="text-right">الأفعال</TableHead>
          <TableHead className="text-right">إجمالي مدى الحياة</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((u) => (
          <TableRow key={u.userId}>
            <TableCell className="font-bold text-muted-foreground">{u.rank}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {u.avatar ? (
                  <img
                    src={u.avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs">
                    {u.name.charAt(0)}
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{u.name}</span>
                  {u.email && <span className="text-xs text-muted-foreground">{u.email}</span>}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge
                  className="text-xs font-medium"
                  style={{
                    backgroundColor: `${u.tier.color}20`,
                    color: u.tier.color,
                    border: `1px solid ${u.tier.color}40`,
                  }}
                >
                  {u.tier.nameAr}
                </Badge>
                {u.isGrandfathered && (
                  <span
                    className="text-[10px] text-amber-700 dark:text-amber-400 font-bold"
                    title="مُرحَّل من النظام السابق — البدج المخزَّن أعلى من المستوى الفعلي حسب النقاط"
                  >
                    ✦ مُرحَّل
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="font-bold tabular-nums">
              {formatNumber(u.pointsInRange)}
            </TableCell>
            <TableCell className="tabular-nums text-muted-foreground">
              {formatNumber(u.actionsInRange)}
            </TableCell>
            <TableCell className="tabular-nums text-muted-foreground">
              {formatNumber(u.lifetimePoints)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RewardsGrid({ data, loading }: { data: RewardPerf[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
      </div>
    );
  }
  if (data.length === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground">لا توجد مكافآت مكوّنة بعد</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.map((r) => (
        <div
          key={r.id}
          className={`p-4 rounded-xl border ${
            r.isActive ? "bg-card" : "bg-muted/30 opacity-60"
          } space-y-2`}
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold text-sm leading-tight">{r.nameAr}</h3>
            {!r.isActive && <Badge variant="outline" className="text-[10px]">موقوفة</Badge>}
            {r.lowStock && r.isActive && (
              <Badge className="text-[10px] bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300">
                مخزون منخفض
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{r.rewardType}</div>
          <div className="flex items-baseline justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">التكلفة</span>
            <span className="font-bold tabular-nums">{formatNumber(r.pointsCost)} نقطة</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">استُبدلت</span>
            <span className="font-bold tabular-nums">{formatNumber(r.redemptions)} مرة</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">المتبقي</span>
            <span className="font-medium tabular-nums text-sm">
              {r.remainingStock === null ? "∞" : formatNumber(r.remainingStock)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ data, loading }: { data: RecentEvent[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (data.length === 0) {
    return <div className="text-center py-10 text-sm text-muted-foreground">لا توجد أحداث بعد</div>;
  }
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {data.map((e) => (
        <div
          key={e.id}
          className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-sm"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-lg shrink-0">{e.actionIcon}</span>
            <div className="flex flex-col min-w-0">
              <span className="font-medium truncate">{e.userName}</span>
              <span className="text-xs text-muted-foreground">{e.actionLabel}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-bold text-emerald-600 tabular-nums">
              +{e.points}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {relativeTime(e.createdAt)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `منذ ${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}
