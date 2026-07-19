import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { formatNumber } from "@/lib/format";
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Download,
  Gift,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRoundSearch,
  Users,
  WalletCards,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Period = "7d" | "30d" | "90d" | "all" | "custom";
type Audience = "readers" | "team" | "all";
type TabValue = "overview" | "members" | "rewards" | "campaigns" | "activity";

type Kpis = {
  totalMembers: number;
  activeMembers: number;
  newLoyaltyMembersInRange: number | null;
  pointsEarned: number;
  pointsEarnedPrev: number | null;
  pointsSpent: number;
  pointsSpentPrev: number | null;
  redemptionRate: number;
  currentBalance: number;
  avgLifetimePerMember: number;
  totalLifetimePoints: number;
};

type OverviewResponse = {
  kpis: Kpis;
  quality: { membersNeedingReview: number; futureEvents: number };
  range: { from: string | null; to: string; label: string; period: string };
  audience: Audience;
};

type TierBucket = {
  level: number;
  nameAr: string;
  nameEn: string;
  color: string;
  minLifetimePoints: number;
  count: number;
  percentage: number;
  grandfathered: number;
};

type TierResponse = { total: number; tiers: TierBucket[]; audience: Audience };
type TimeSeriesPoint = { day: string; earned: number; spent: number };
type SeriesResponse = { series: TimeSeriesPoint[]; granularity: "day" | "month" };

type ActionMeta = {
  action: string;
  labelAr: string;
  icon: string;
  category: string;
};

type ActionRow = ActionMeta & {
  configuredPointsPerEvent: number | null;
  averagePointsPerEvent: number;
  shareOfPoints: number;
  events: number;
  points: number;
  uniqueUsers: number;
};

type ActionsResponse = { actions: ActionRow[]; totalPoints: number };

type TopUser = {
  rank: number;
  userId: string;
  name: string;
  email: string | null;
  avatar: string | null;
  pointsInRange: number;
  actionsInRange: number;
  lifetimePoints: number;
  currentBalance: number;
  isGrandfathered?: boolean;
  needsReview?: boolean;
  tier: { level: number; nameAr: string; color: string };
};

type Member = Omit<TopUser, "rank"> & {
  role: string | null;
  lastActivityAt: string | null;
};

type MembersResponse = {
  members: Member[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
  pendingRedemptions: number;
  totalPointsSpent: number;
  lowStock: boolean;
};

type Campaign = {
  id: string;
  nameAr: string;
  nameEn: string;
  description: string | null;
  campaignType: string;
  targetAction: string | null;
  targetActionLabel: string;
  multiplier: number;
  bonusPoints: number;
  isActive: boolean;
  startAt: string;
  endAt: string;
  status: "active" | "upcoming" | "ended" | "paused";
  events: number;
  uniqueUsers: number;
  awardedPoints: number;
};

type RecentEvent = {
  id: string;
  userId: string;
  userName: string;
  action: string;
  actionLabel: string;
  actionIcon: string;
  source: string | null;
  points: number;
  createdAt: string;
};

type MetadataResponse = {
  actions: ActionMeta[];
  tiers: Array<{ level: number; nameAr: string; minLifetimePoints: number; color: string }>;
  audiences: Array<{ value: Audience; labelAr: string; descriptionAr: string }>;
};

const periodLabels: Record<Period, string> = {
  "7d": "آخر 7 أيام",
  "30d": "آخر 30 يوماً",
  "90d": "آخر 90 يوماً",
  all: "كل الفترات",
  custom: "فترة مخصّصة",
};

const audienceLabels: Record<Audience, string> = {
  readers: "القراء",
  team: "فريق سبق",
  all: "الكل",
};

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildInitialFrom() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return dateInputValue(date);
}

export default function LoyaltyAdminDashboard() {
  const { user, isLoading: authLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [period, setPeriod] = useState<Period>("30d");
  const [audience, setAudience] = useState<Audience>("readers");
  const [customFrom, setCustomFrom] = useState(buildInitialFrom);
  const [customTo, setCustomTo] = useState(() => dateInputValue(new Date()));
  const [memberSearch, setMemberSearch] = useState("");
  const deferredMemberSearch = useDeferredValue(memberSearch);
  const [memberTier, setMemberTier] = useState("all");
  const [memberAction, setMemberAction] = useState("all");
  const [memberPage, setMemberPage] = useState(1);
  const [activityAction, setActivityAction] = useState("all");

  const allowed = useMemo(
    () => hasRole(user, "admin") || hasRole(user, "system_admin"),
    [user],
  );
  const validRange = period !== "custom" || (!!customFrom && !!customTo && customFrom <= customTo);
  const querySuffix = useMemo(() => {
    const range = period === "custom"
      ? `from=${encodeURIComponent(customFrom)}&to=${encodeURIComponent(customTo)}`
      : `period=${period}`;
    return `${range}&audience=${audience}`;
  }, [audience, customFrom, customTo, period]);

  const metadata = useQuery<MetadataResponse>({
    queryKey: ["loyalty-admin", "metadata"],
    queryFn: () => apiRequest("/api/loyalty-admin/metadata"),
    enabled: !!user && allowed,
    staleTime: 10 * 60_000,
  });

  const overview = useQuery<OverviewResponse>({
    queryKey: ["loyalty-admin", "overview", querySuffix],
    queryFn: () => apiRequest(`/api/loyalty-admin/overview?${querySuffix}`),
    enabled: !!user && allowed && validRange && activeTab === "overview",
  });
  const tiers = useQuery<TierResponse>({
    queryKey: ["loyalty-admin", "tiers", audience],
    queryFn: () => apiRequest(`/api/loyalty-admin/tier-distribution?audience=${audience}`),
    enabled: !!user && allowed && activeTab === "overview",
  });
  const series = useQuery<SeriesResponse>({
    queryKey: ["loyalty-admin", "series", querySuffix],
    queryFn: () => apiRequest(`/api/loyalty-admin/time-series?${querySuffix}`),
    enabled: !!user && allowed && validRange && activeTab === "overview",
  });
  const actions = useQuery<ActionsResponse>({
    queryKey: ["loyalty-admin", "actions", querySuffix],
    queryFn: () => apiRequest(`/api/loyalty-admin/action-breakdown?${querySuffix}`),
    enabled: !!user && allowed && validRange && activeTab === "overview",
  });
  const topUsers = useQuery<{ users: TopUser[] }>({
    queryKey: ["loyalty-admin", "top-users", querySuffix],
    queryFn: () => apiRequest(`/api/loyalty-admin/top-users?${querySuffix}&limit=10`),
    enabled: !!user && allowed && validRange && activeTab === "overview",
  });
  const rewards = useQuery<{ rewards: RewardPerf[] }>({
    queryKey: ["loyalty-admin", "rewards", querySuffix],
    queryFn: () => apiRequest(`/api/loyalty-admin/rewards-performance?${querySuffix}`),
    enabled: !!user && allowed && validRange && (activeTab === "overview" || activeTab === "rewards"),
  });
  const members = useQuery<MembersResponse>({
    queryKey: [
      "loyalty-admin",
      "members",
      querySuffix,
      deferredMemberSearch,
      memberTier,
      memberAction,
      memberPage,
    ],
    queryFn: () => {
      const params = new URLSearchParams(querySuffix);
      params.set("page", String(memberPage));
      params.set("limit", "25");
      if (deferredMemberSearch) params.set("search", deferredMemberSearch);
      if (memberTier !== "all") params.set("tier", memberTier);
      if (memberAction !== "all") params.set("action", memberAction);
      return apiRequest(`/api/loyalty-admin/members?${params.toString()}`);
    },
    enabled: !!user && allowed && validRange && activeTab === "members",
    placeholderData: (previous) => previous,
  });
  const campaigns = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ["loyalty-admin", "campaigns"],
    queryFn: () => apiRequest("/api/loyalty-admin/campaigns"),
    enabled: !!user && allowed && activeTab === "campaigns",
  });
  const activity = useQuery<{ events: RecentEvent[] }>({
    queryKey: ["loyalty-admin", "activity", audience, activityAction],
    queryFn: () => apiRequest(
      `/api/loyalty-admin/recent-activity?audience=${audience}&action=${activityAction}&limit=60`,
    ),
    enabled: !!user && allowed && activeTab === "activity",
    refetchInterval: activeTab === "activity" ? 30_000 : false,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(apiUrl(`/api/loyalty-admin/export?${querySuffix}`), {
        credentials: "include",
      });
      if (!response.ok) throw new Error("تعذر إنشاء ملف Excel");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `loyalty-${period}-${Date.now()}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    },
    onSuccess: () => toast({ title: "تم إنشاء التقرير", description: "بدأ تنزيل ملف Excel بنجاح" }),
    onError: (error: Error) => toast({
      title: "فشل التصدير",
      description: error.message,
      variant: "destructive",
    }),
  });

  const lastUpdatedAt = Math.max(
    overview.dataUpdatedAt,
    tiers.dataUpdatedAt,
    series.dataUpdatedAt,
    actions.dataUpdatedAt,
    topUsers.dataUpdatedAt,
    rewards.dataUpdatedAt,
    members.dataUpdatedAt,
    campaigns.dataUpdatedAt,
    activity.dataUpdatedAt,
  );
  const isRefreshing = [overview, tiers, series, actions, topUsers, rewards, members, campaigns, activity]
    .some((query) => query.isFetching);

  async function handleRefresh() {
    await queryClient.invalidateQueries({ queryKey: ["loyalty-admin"] });
  }

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 space-y-4">
          <Skeleton className="h-10 w-72" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((item) => <Skeleton key={item} className="h-32" />)}
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
      <div className="mx-auto max-w-[1600px] space-y-5 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Trophy}
          title="نظام الولاء — مركز التشغيل"
          description="راقب اقتصاد النقاط، فعّل الأعضاء، وأدر المكافآت والحملات من مكان واحد"
          actions={(
            <>
              <Select value={audience} onValueChange={(value) => setAudience(value as Audience)}>
                <SelectTrigger className="w-32" aria-label="نوع الجمهور" data-testid="select-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="readers">القراء</SelectItem>
                  <SelectItem value="team">فريق سبق</SelectItem>
                  <SelectItem value="all">الكل</SelectItem>
                </SelectContent>
              </Select>
              <Select value={period} onValueChange={(value) => setPeriod(value as Period)}>
                <SelectTrigger className="w-40" aria-label="الفترة الزمنية" data-testid="select-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">آخر 7 أيام</SelectItem>
                  <SelectItem value="30d">آخر 30 يوماً</SelectItem>
                  <SelectItem value="90d">آخر 90 يوماً</SelectItem>
                  <SelectItem value="all">كل الفترات</SelectItem>
                  <SelectItem value="custom">فترة مخصّصة</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 ml-1 ${isRefreshing ? "animate-spin" : ""}`} />
                تحديث
              </Button>
              <Button
                size="sm"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending || !validRange}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {exportMutation.isPending
                  ? <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                  : <Download className="h-4 w-4 ml-1" />}
                تصدير Excel
              </Button>
            </>
          )}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{audienceLabels[audience]}</Badge>
            <Badge variant="outline">{periodLabels[period]}</Badge>
            <span>
              تعريف الجمهور: {metadata.data?.audiences.find((item) => item.value === audience)?.descriptionAr ?? "—"}
            </span>
          </div>
          <span>{lastUpdatedAt ? `آخر تحديث ${relativeTime(new Date(lastUpdatedAt).toISOString())}` : "بانتظار أول تحديث"}</span>
        </div>

        {period === "custom" && (
          <Card className="border-primary/20">
            <CardContent className="flex flex-wrap items-end gap-4 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="loyalty-from">من تاريخ</Label>
                <Input id="loyalty-from" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loyalty-to">إلى تاريخ</Label>
                <Input id="loyalty-to" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
              </div>
              {!validRange && <span className="text-sm text-destructive">تاريخ البداية يجب أن يسبق تاريخ النهاية.</span>}
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} dir="rtl">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-muted/70 p-1.5">
            <TabsTrigger value="overview" className="gap-2"><BarChart3 className="h-4 w-4" />نظرة عامة</TabsTrigger>
            <TabsTrigger value="members" className="gap-2"><UserRoundSearch className="h-4 w-4" />الأعضاء</TabsTrigger>
            <TabsTrigger value="rewards" className="gap-2"><Gift className="h-4 w-4" />المكافآت</TabsTrigger>
            <TabsTrigger value="campaigns" className="gap-2"><Megaphone className="h-4 w-4" />الحملات</TabsTrigger>
            <TabsTrigger value="activity" className="gap-2"><Activity className="h-4 w-4" />سجل النشاط</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5">
            <OverviewTab
              overview={overview}
              tiers={tiers}
              series={series}
              actions={actions}
              topUsers={topUsers}
              rewards={rewards}
            />
          </TabsContent>
          <TabsContent value="members" className="mt-5">
            <MembersTab
              query={members}
              metadata={metadata.data}
              search={memberSearch}
              tier={memberTier}
              action={memberAction}
              page={memberPage}
              onSearch={(value) => { setMemberSearch(value); setMemberPage(1); }}
              onTier={(value) => { setMemberTier(value); setMemberPage(1); }}
              onAction={(value) => { setMemberAction(value); setMemberPage(1); }}
              onPage={setMemberPage}
            />
          </TabsContent>
          <TabsContent value="rewards" className="mt-5">
            <RewardsTab query={rewards} />
          </TabsContent>
          <TabsContent value="campaigns" className="mt-5">
            <CampaignsTab query={campaigns} metadata={metadata.data} />
          </TabsContent>
          <TabsContent value="activity" className="mt-5">
            <ActivityTab
              query={activity}
              metadata={metadata.data}
              action={activityAction}
              onAction={setActivityAction}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function OverviewTab({
  overview,
  tiers,
  series,
  actions,
  topUsers,
  rewards,
}: {
  overview: UseQueryResult<OverviewResponse, Error>;
  tiers: UseQueryResult<TierResponse, Error>;
  series: UseQueryResult<SeriesResponse, Error>;
  actions: UseQueryResult<ActionsResponse, Error>;
  topUsers: UseQueryResult<{ users: TopUser[] }, Error>;
  rewards: UseQueryResult<{ rewards: RewardPerf[] }, Error>;
}) {
  if (overview.isError) {
    return <ErrorPanel title="تعذر تحميل مؤشرات الولاء" error={overview.error} onRetry={() => overview.refetch()} />;
  }

  const kpis = overview.data?.kpis;
  const firstTier = tiers.data?.tiers.find((tier) => tier.level === 1);
  const topAction = actions.data?.actions[0];
  const rewardCount = rewards.data?.rewards.length ?? 0;
  const insights = [
    rewardCount === 0
      ? { title: "الاستبدال غير مفعّل", text: "لا توجد مكافآت متاحة حالياً؛ النقاط تتراكم بلا مسار قيمة واضح.", tone: "rose" }
      : null,
    (firstTier?.percentage ?? 0) >= 70
      ? { title: "فرصة تفعيل كبيرة", text: `${firstTier?.percentage.toFixed(1)}% من الأعضاء ما زالوا في المستوى الأول.`, tone: "amber" }
      : null,
    (topAction?.shareOfPoints ?? 0) >= 40
      ? { title: "تركيز مرتفع في الإصدار", text: `${topAction?.labelAr} يمثل ${topAction?.shareOfPoints.toFixed(1)}% من النقاط المكتسبة.`, tone: "blue" }
      : null,
  ].filter(Boolean) as Array<{ title: string; text: string; tone: string }>;

  return (
    <div className="space-y-5">
      {((overview.data?.quality.membersNeedingReview ?? 0) > 0 || (overview.data?.quality.futureEvents ?? 0) > 0) && (
        <Alert className="border-amber-300 bg-amber-50/70 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>تنبيه جودة بيانات</AlertTitle>
          <AlertDescription>
            {(overview.data?.quality.membersNeedingReview ?? 0) > 0 && (
              <span>{formatNumber(overview.data?.quality.membersNeedingReview ?? 0)} أعضاء لديهم نقاط موجبة في الفترة تتجاوز إجمالي مدى الحياة. </span>
            )}
            {(overview.data?.quality.futureEvents ?? 0) > 0 && (
              <span>{formatNumber(overview.data?.quality.futureEvents ?? 0)} أحداث مؤرخة في المستقبل.</span>
            )}
          </AlertDescription>
        </Alert>
      )}
      {insights.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-3">
          {insights.map((insight) => (
            <Card key={insight.title} className="border-primary/20 bg-primary/[0.025]">
              <CardContent className="flex gap-3 p-4">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold">{insight.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{insight.text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          label="أعضاء الولاء"
          value={kpis?.totalMembers ?? null}
          sublabel={kpis?.newLoyaltyMembersInRange != null ? `+${formatNumber(kpis.newLoyaltyMembersInRange)} منضم خلال الفترة` : "إجمالي حالي"}
          icon={<Users className="h-5 w-5" />}
          loading={overview.isLoading}
        />
        <KpiCard
          label="أعضاء نشطون"
          value={kpis?.activeMembers ?? null}
          sublabel="كسبوا نقطة واحدة على الأقل"
          icon={<Activity className="h-5 w-5" />}
          loading={overview.isLoading}
        />
        <KpiCard
          label="نقاط مكتسبة"
          value={kpis?.pointsEarned ?? null}
          delta={diff(kpis?.pointsEarned, kpis?.pointsEarnedPrev)}
          sublabel="مقابل الفترة السابقة"
          icon={<Coins className="h-5 w-5" />}
          loading={overview.isLoading}
        />
        <KpiCard
          label="نقاط مستبدلة"
          value={kpis?.pointsSpent ?? null}
          delta={diff(kpis?.pointsSpent, kpis?.pointsSpentPrev)}
          sublabel="طلبات معلقة أو مكتملة"
          icon={<Gift className="h-5 w-5" />}
          loading={overview.isLoading}
        />
        <KpiCard
          label="الرصيد القائم"
          value={kpis?.currentBalance ?? null}
          sublabel="نقاط متاحة لدى الأعضاء الآن"
          icon={<WalletCards className="h-5 w-5" />}
          loading={overview.isLoading}
        />
        <KpiCard
          label="نسبة الاستبدال"
          value={kpis?.redemptionRate ?? null}
          valueSuffix="%"
          sublabel="المستبدلة ÷ المكتسبة في الفترة"
          icon={<CircleDollarSign className="h-5 w-5" />}
          loading={overview.isLoading}
          decimals={1}
        />
      </div>

      <SectionCard title="حركة اقتصاد النقاط" icon={<BarChart3 className="h-4 w-4" />}>
        {series.isError
          ? <ErrorPanel compact title="تعذر تحميل المخطط" error={series.error} onRetry={() => series.refetch()} />
          : <TimeSeriesChart data={series.data?.series ?? []} loading={series.isLoading} />}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="قمع مستويات العضوية" icon={<ShieldCheck className="h-4 w-4" />}>
          {tiers.isError
            ? <ErrorPanel compact title="تعذر تحميل المستويات" error={tiers.error} onRetry={() => tiers.refetch()} />
            : <TierDistribution data={tiers.data?.tiers ?? []} total={tiers.data?.total ?? 0} loading={tiers.isLoading} />}
        </SectionCard>
        <SectionCard title="تكلفة الأفعال ومساهمة الإصدار" icon={<Coins className="h-4 w-4" />}>
          {actions.isError
            ? <ErrorPanel compact title="تعذر تحميل الأفعال" error={actions.error} onRetry={() => actions.refetch()} />
            : <ActionBreakdown data={actions.data?.actions ?? []} loading={actions.isLoading} />}
        </SectionCard>
      </div>

      <SectionCard
        title="الأكثر نشاطاً خلال الفترة"
        icon={<Trophy className="h-4 w-4" />}
        action={<Badge variant="secondary">{topUsers.data?.users.length ?? 0} أعضاء</Badge>}
      >
        {topUsers.isError
          ? <ErrorPanel compact title="تعذر تحميل قائمة النشاط" error={topUsers.error} onRetry={() => topUsers.refetch()} />
          : <UsersTable data={topUsers.data?.users ?? []} loading={topUsers.isLoading} rankColumn />}
      </SectionCard>
    </div>
  );
}

function MembersTab({
  query,
  metadata,
  search,
  tier,
  action,
  page,
  onSearch,
  onTier,
  onAction,
  onPage,
}: {
  query: UseQueryResult<MembersResponse, Error>;
  metadata?: MetadataResponse;
  search: string;
  tier: string;
  action: string;
  page: number;
  onSearch: (value: string) => void;
  onTier: (value: string) => void;
  onAction: (value: string) => void;
  onPage: (page: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><UserRoundSearch className="h-4 w-4" />دليل أعضاء الولاء</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">ابحث وراجع النشاط والرصيد والمستوى الفعلي.</p>
          </div>
          <Badge variant="secondary">{formatNumber(query.data?.total ?? 0)} عضو</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_180px_220px]">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="ابحث بالاسم أو البريد"
              className="pr-9"
              aria-label="بحث أعضاء الولاء"
            />
          </div>
          <Select value={tier} onValueChange={onTier}>
            <SelectTrigger aria-label="تصفية حسب المستوى"><SelectValue placeholder="كل المستويات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المستويات</SelectItem>
              {metadata?.tiers.map((item) => (
                <SelectItem key={item.level} value={String(item.level)}>{item.nameAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={onAction}>
            <SelectTrigger aria-label="تصفية حسب الفعل"><SelectValue placeholder="كل الأفعال" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأفعال</SelectItem>
              {metadata?.actions.map((item) => (
                <SelectItem key={item.action} value={item.action}>{item.labelAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <ErrorPanel title="تعذر تحميل الأعضاء" error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <>
            <UsersTable data={query.data?.members ?? []} loading={query.isLoading} />
            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
              <span className="text-sm text-muted-foreground">
                صفحة {formatNumber(page)} من {formatNumber(query.data?.totalPages ?? 1)}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1 || query.isFetching}>
                  <ChevronRight className="h-4 w-4 ml-1" />السابق
                </Button>
                <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= (query.data?.totalPages ?? 1) || query.isFetching}>
                  التالي<ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RewardsTab({ query }: { query: UseQueryResult<{ rewards: RewardPerf[] }, Error> }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nameAr: "",
    nameEn: "",
    description: "",
    pointsCost: "500",
    rewardType: "COUPON",
    stock: "",
    maxRedemptionsPerUser: "1",
  });
  const createReward = useMutation({
    mutationFn: () => apiRequest("/api/loyalty-admin/rewards", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        pointsCost: Number(form.pointsCost),
        stock: form.stock ? Number(form.stock) : null,
        maxRedemptionsPerUser: form.maxRedemptionsPerUser ? Number(form.maxRedemptionsPerUser) : null,
      }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loyalty-admin", "rewards"] });
      setOpen(false);
      toast({ title: "تم إنشاء المكافأة", description: "أصبحت المكافأة متاحة وفق إعداداتها." });
    },
    onError: (error: Error) => toast({ title: "تعذر إنشاء المكافأة", description: error.message, variant: "destructive" }),
  });
  const toggleReward = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiRequest(`/api/loyalty-admin/rewards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loyalty-admin", "rewards"] }),
    onError: (error: Error) => toast({ title: "تعذر تحديث المكافأة", description: error.message, variant: "destructive" }),
  });

  if (query.isError) return <ErrorPanel title="تعذر تحميل المكافآت" error={query.error} onRetry={() => query.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">إدارة المكافآت</h2>
          <p className="text-sm text-muted-foreground">حوّل النقاط إلى قيمة واضحة واضبط المخزون وحدود الاستبدال.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" />مكافأة جديدة</Button>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-56" />)}</div>
      ) : (query.data?.rewards.length ?? 0) === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Gift className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-bold">ابدأ بأول مكافأة</h3>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">النقاط المكتسبة تحتاج مسار استبدال واضح حتى يشعر العضو بقيمتها.</p>
            <Button className="mt-5" onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" />إنشاء مكافأة</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {query.data?.rewards.map((reward) => (
            <Card key={reward.id} className={!reward.isActive ? "opacity-65" : ""}>
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{reward.nameAr}</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">{rewardTypeLabel(reward.rewardType)}</p>
                  </div>
                  <Switch
                    checked={reward.isActive}
                    onCheckedChange={(checked) => toggleReward.mutate({ id: reward.id, isActive: checked })}
                    aria-label={`تفعيل مكافأة ${reward.nameAr}`}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {!reward.isActive && <Badge variant="outline">موقوفة</Badge>}
                  {reward.lowStock && reward.isActive && <Badge variant="destructive">مخزون منخفض</Badge>}
                  {reward.pendingRedemptions > 0 && <Badge variant="secondary">{formatNumber(reward.pendingRedemptions)} معلّقة</Badge>}
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <Metric label="التكلفة" value={`${formatNumber(reward.pointsCost)} نقطة`} />
                <Metric label="الاستبدالات" value={formatNumber(reward.redemptions)} />
                <Metric label="النقاط المصروفة" value={formatNumber(reward.totalPointsSpent)} />
                <Metric label="المتبقي" value={reward.remainingStock === null ? "غير محدود" : formatNumber(reward.remainingStock)} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader className="text-right">
            <DialogTitle>إنشاء مكافأة جديدة</DialogTitle>
            <DialogDescription>أدخل قيمة واضحة ونطاق مخزون آمن قبل إتاحتها للأعضاء.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <FormField label="الاسم بالعربية" id="reward-name-ar"><Input id="reward-name-ar" value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} /></FormField>
            <FormField label="الاسم بالإنجليزية" id="reward-name-en"><Input id="reward-name-en" dir="ltr" value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></FormField>
            <div className="sm:col-span-2"><FormField label="الوصف" id="reward-description"><Input id="reward-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField></div>
            <FormField label="التكلفة بالنقاط" id="reward-cost"><Input id="reward-cost" type="number" min="1" value={form.pointsCost} onChange={(event) => setForm({ ...form, pointsCost: event.target.value })} /></FormField>
            <FormField label="النوع" id="reward-type">
              <Select value={form.rewardType} onValueChange={(value) => setForm({ ...form, rewardType: value })}>
                <SelectTrigger id="reward-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COUPON">قسيمة</SelectItem>
                  <SelectItem value="BADGE">شارة</SelectItem>
                  <SelectItem value="CONTENT_ACCESS">محتوى حصري</SelectItem>
                  <SelectItem value="PARTNER_REWARD">مكافأة شريك</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="المخزون (فارغ = غير محدود)" id="reward-stock"><Input id="reward-stock" type="number" min="0" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></FormField>
            <FormField label="الحد لكل عضو" id="reward-max"><Input id="reward-max" type="number" min="1" value={form.maxRedemptionsPerUser} onChange={(event) => setForm({ ...form, maxRedemptionsPerUser: event.target.value })} /></FormField>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={() => createReward.mutate()} disabled={createReward.isPending || !form.nameAr || !form.nameEn || Number(form.pointsCost) <= 0}>
              {createReward.isPending && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}حفظ المكافأة
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CampaignsTab({ query, metadata }: { query: UseQueryResult<{ campaigns: Campaign[] }, Error>; metadata?: MetadataResponse }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const initialStart = new Date();
  const initialEnd = new Date(initialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [form, setForm] = useState({
    nameAr: "",
    nameEn: "",
    description: "",
    campaignType: "MULTIPLIER",
    targetAction: "all",
    multiplier: "2",
    bonusPoints: "0",
    startAt: datetimeLocalValue(initialStart),
    endAt: datetimeLocalValue(initialEnd),
  });
  const createCampaign = useMutation({
    mutationFn: () => apiRequest("/api/loyalty-admin/campaigns", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        targetAction: form.targetAction === "all" ? null : form.targetAction,
        multiplier: Number(form.multiplier),
        bonusPoints: Number(form.bonusPoints),
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["loyalty-admin", "campaigns"] });
      setOpen(false);
      toast({ title: "تم إنشاء الحملة", description: "ستعمل الحملة تلقائياً ضمن وقتها المحدد." });
    },
    onError: (error: Error) => toast({ title: "تعذر إنشاء الحملة", description: error.message, variant: "destructive" }),
  });
  const toggleCampaign = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiRequest(`/api/loyalty-admin/campaigns/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
      headers: { "Content-Type": "application/json" },
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["loyalty-admin", "campaigns"] }),
    onError: (error: Error) => toast({ title: "تعذر تحديث الحملة", description: error.message, variant: "destructive" }),
  });

  if (query.isError) return <ErrorPanel title="تعذر تحميل الحملات" error={query.error} onRetry={() => query.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">حملات الولاء</h2>
          <p className="text-sm text-muted-foreground">شغّل مضاعفات أو نقاطاً إضافية وقِس أثرها الفعلي.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" />حملة جديدة</Button>
      </div>
      {query.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">{[1, 2].map((item) => <Skeleton key={item} className="h-52" />)}</div>
      ) : (query.data?.campaigns.length ?? 0) === 0 ? (
        <Card className="border-dashed"><CardContent className="flex flex-col items-center py-14 text-center"><Megaphone className="mb-4 h-12 w-12 text-muted-foreground" /><h3 className="text-lg font-bold">لا توجد حملات بعد</h3><p className="mt-2 text-sm text-muted-foreground">ابدأ بحملة محدودة المدة، ثم راقب النقاط والأعضاء المتأثرين.</p><Button className="mt-5" onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" />إنشاء حملة</Button></CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {query.data?.campaigns.map((campaign) => (
            <Card key={campaign.id} className={!campaign.isActive ? "opacity-65" : ""}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">{campaign.nameAr}</CardTitle><CampaignStatusBadge status={campaign.status} /></div>
                    <p className="mt-2 text-sm text-muted-foreground">{campaign.description || campaign.targetActionLabel}</p>
                  </div>
                  <Switch checked={campaign.isActive} onCheckedChange={(checked) => toggleCampaign.mutate({ id: campaign.id, isActive: checked })} aria-label={`تفعيل حملة ${campaign.nameAr}`} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3"><Metric label="النقاط الممنوحة" value={formatNumber(campaign.awardedPoints)} /><Metric label="الأعضاء" value={formatNumber(campaign.uniqueUsers)} /><Metric label="الأحداث" value={formatNumber(campaign.events)} /></div>
                <div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">{campaign.targetActionLabel}</Badge>{campaign.multiplier > 1 && <Badge variant="secondary">×{campaign.multiplier}</Badge>}{campaign.bonusPoints > 0 && <Badge variant="secondary">+{formatNumber(campaign.bonusPoints)} نقطة</Badge>}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" />{formatDate(campaign.startAt)} — {formatDate(campaign.endAt)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader className="text-right"><DialogTitle>إنشاء حملة ولاء</DialogTitle><DialogDescription>اختر فعلاً واحداً أو طبّق الحملة على كل الأفعال ضمن مدة محددة.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <FormField label="الاسم بالعربية" id="campaign-name-ar"><Input id="campaign-name-ar" value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} /></FormField>
            <FormField label="الاسم بالإنجليزية" id="campaign-name-en"><Input id="campaign-name-en" dir="ltr" value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></FormField>
            <div className="sm:col-span-2"><FormField label="الوصف" id="campaign-description"><Input id="campaign-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField></div>
            <FormField label="نوع الحملة" id="campaign-type"><Select value={form.campaignType} onValueChange={(value) => setForm({ ...form, campaignType: value })}><SelectTrigger id="campaign-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MULTIPLIER">مضاعف</SelectItem><SelectItem value="BONUS_POINTS">نقاط إضافية</SelectItem><SelectItem value="SPECIAL_EVENT">فعالية خاصة</SelectItem></SelectContent></Select></FormField>
            <FormField label="الفعل المستهدف" id="campaign-action"><Select value={form.targetAction} onValueChange={(value) => setForm({ ...form, targetAction: value })}><SelectTrigger id="campaign-action"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الأفعال</SelectItem>{metadata?.actions.filter((item) => item.category !== "admin").map((item) => <SelectItem key={item.action} value={item.action}>{item.labelAr}</SelectItem>)}</SelectContent></Select></FormField>
            <FormField label="المضاعف" id="campaign-multiplier"><Input id="campaign-multiplier" type="number" min="1" max="10" step="0.1" value={form.multiplier} onChange={(event) => setForm({ ...form, multiplier: event.target.value })} /></FormField>
            <FormField label="نقاط إضافية" id="campaign-bonus"><Input id="campaign-bonus" type="number" min="0" value={form.bonusPoints} onChange={(event) => setForm({ ...form, bonusPoints: event.target.value })} /></FormField>
            <FormField label="تبدأ في" id="campaign-start"><Input id="campaign-start" type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} /></FormField>
            <FormField label="تنتهي في" id="campaign-end"><Input id="campaign-end" type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} /></FormField>
          </div>
          <DialogFooter className="gap-2 sm:justify-start"><Button onClick={() => createCampaign.mutate()} disabled={createCampaign.isPending || !form.nameAr || !form.nameEn || !form.startAt || !form.endAt}>{createCampaign.isPending && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}حفظ الحملة</Button><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActivityTab({ query, metadata, action, onAction }: { query: UseQueryResult<{ events: RecentEvent[] }, Error>; metadata?: MetadataResponse; action: string; onAction: (value: string) => void }) {
  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />سجل أحداث الولاء</CardTitle><p className="mt-1 text-sm text-muted-foreground">آخر الأحداث، بتحديث تلقائي كل 30 ثانية.</p></div><Badge variant="outline">مباشر</Badge></div>
        <Select value={action} onValueChange={onAction}><SelectTrigger className="w-full sm:w-64" aria-label="تصفية سجل النشاط"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">كل الأفعال</SelectItem>{metadata?.actions.map((item) => <SelectItem key={item.action} value={item.action}>{item.labelAr}</SelectItem>)}</SelectContent></Select>
      </CardHeader>
      <CardContent>
        {query.isError ? <ErrorPanel title="تعذر تحميل السجل" error={query.error} onRetry={() => query.refetch()} /> : <ActivityFeed data={query.data?.events ?? []} loading={query.isLoading} />}
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, sublabel, delta, icon, loading, valueSuffix, decimals = 0 }: { label: string; value: number | null; sublabel?: string; delta?: number | null; icon: React.ReactNode; loading: boolean; valueSuffix?: string; decimals?: number }) {
  return (
    <Card className="border-border/70">
      <CardContent className="p-5">
        <div className="mb-4 flex items-start justify-between"><div className="rounded-xl bg-primary/10 p-2.5 text-primary">{icon}</div>{delta != null && <DeltaBadge value={delta} />}</div>
        <div className="text-3xl font-bold tabular-nums">{loading ? <Skeleton className="h-9 w-24" /> : value == null ? "—" : `${formatNumber(Number(value.toFixed(decimals)))}${valueSuffix ?? ""}`}</div>
        <p className="mt-2 text-sm font-medium">{label}</p>
        {sublabel && <p className="mt-1 text-xs leading-5 text-muted-foreground">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

function DeltaBadge({ value }: { value: number }) {
  const positive = value > 0;
  const className = positive ? "bg-emerald-100 text-emerald-700" : value < 0 ? "bg-rose-100 text-rose-700" : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-1 text-[11px] font-semibold tabular-nums ${className}`}>{positive ? "+" : ""}{value.toFixed(1)}%</span>;
}

function SectionCard({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>{action}</CardHeader><CardContent>{children}</CardContent></Card>;
}

function TimeSeriesChart({ data, loading }: { data: TimeSeriesPoint[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-72 w-full" />;
  if (data.length === 0) return <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="لا توجد أحداث في الفترة" text="غيّر الفترة أو الجمهور لمراجعة نطاق آخر." />;
  return (
    <div className="h-80" role="img" aria-label="مخطط النقاط المكتسبة والمستبدلة عبر الزمن">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} reversed />
          <YAxis tick={{ fontSize: 11 }} orientation="right" />
          <Tooltip formatter={(value: number) => formatNumber(value)} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => value === "earned" ? "مكتسبة" : "مستبدلة"} />
          <Line type="monotone" dataKey="earned" stroke="#2563EB" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="spent" stroke="#7C3AED" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TierDistribution({ data, total, loading }: { data: TierBucket[]; total: number; loading: boolean }) {
  if (loading) return <Skeleton className="h-72 w-full" />;
  if (data.length === 0 || total === 0) return <EmptyState icon={<Users className="h-8 w-8" />} title="لا توجد عضويات" text="لم يبدأ هذا الجمهور بجمع النقاط بعد." />;
  return (
    <div className="space-y-4">
      {data.map((tier) => (
        <div key={tier.level} className="space-y-2">
          <div className="flex items-start justify-between gap-4 text-sm"><div className="flex items-start gap-2"><span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tier.color }} /><div><p className="font-medium">{tier.nameAr}</p><p className="text-xs text-muted-foreground">من {formatNumber(tier.minLifetimePoints)} نقطة{tier.grandfathered > 0 ? ` · ${formatNumber(tier.grandfathered)} مرحّلون` : ""}</p></div></div><div className="text-left"><p className="font-bold tabular-nums">{formatNumber(tier.count)}</p><p className="text-xs text-muted-foreground">{tier.percentage.toFixed(1)}%</p></div></div>
          <Progress value={tier.percentage} className="h-2" />
        </div>
      ))}
    </div>
  );
}

function ActionBreakdown({ data, loading }: { data: ActionRow[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-72 w-full" />;
  if (data.length === 0) return <EmptyState icon={<Activity className="h-8 w-8" />} title="لا توجد أفعال" text="لم تُمنح نقاط لهذا الجمهور خلال الفترة." />;
  return (
    <div className="max-h-[420px] space-y-4 overflow-y-auto pl-1">
      {data.map((row) => (
        <div key={row.action} className="space-y-2">
          <div className="flex items-start justify-between gap-4 text-sm"><div className="flex min-w-0 items-start gap-2"><span className="w-5 shrink-0 text-center">{row.icon}</span><div className="min-w-0"><p className="truncate font-medium">{row.labelAr}</p><p className="text-xs text-muted-foreground">{formatNumber(row.events)} حدث · {formatNumber(row.uniqueUsers)} مستخدم · متوسط {formatNumber(Math.round(row.averagePointsPerEvent))}</p></div></div><div className="shrink-0 text-left"><p className="font-bold tabular-nums">{formatNumber(row.points)}</p><p className="text-xs text-muted-foreground">{row.shareOfPoints.toFixed(1)}%</p></div></div>
          <Progress value={row.shareOfPoints} className="h-2" />
        </div>
      ))}
    </div>
  );
}

function UsersTable({ data, loading, rankColumn = false }: { data: Array<TopUser | Member>; loading: boolean; rankColumn?: boolean }) {
  if (loading) return <Skeleton className="h-72 w-full" />;
  if (data.length === 0) return <EmptyState icon={<UserRoundSearch className="h-8 w-8" />} title="لا توجد نتائج" text="جرّب تغيير الجمهور أو الفترة أو المرشحات." />;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow>{rankColumn && <TableHead className="w-12 text-right">#</TableHead>}<TableHead className="text-right">المستخدم</TableHead><TableHead className="text-right">المستوى</TableHead><TableHead className="text-right">نقاط الفترة</TableHead><TableHead className="text-right">الأفعال</TableHead><TableHead className="text-right">الرصيد الحالي</TableHead><TableHead className="text-right">مدى الحياة</TableHead></TableRow></TableHeader>
        <TableBody>
          {data.map((member, index) => (
            <TableRow key={member.userId}>
              {rankColumn && <TableCell className="font-bold text-muted-foreground">{"rank" in member ? member.rank : index + 1}</TableCell>}
              <TableCell><div className="flex min-w-[220px] items-center gap-2">{member.avatar ? <img src={member.avatar} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs">{member.name.charAt(0)}</div>}<div><div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{member.name}</span>{member.needsReview && <Badge variant="destructive" className="text-[10px]">يحتاج مراجعة</Badge>}</div>{member.email && <p className="text-xs text-muted-foreground" dir="ltr">{member.email}</p>}</div></div></TableCell>
              <TableCell><div className="flex flex-wrap items-center gap-1.5"><Badge style={{ backgroundColor: `${member.tier.color}18`, color: member.tier.color, border: `1px solid ${member.tier.color}45` }}>{member.tier.nameAr}</Badge>{member.isGrandfathered && <Badge variant="outline" className="text-[10px]">مرحّل</Badge>}</div></TableCell>
              <TableCell className="font-bold tabular-nums">{formatNumber(member.pointsInRange)}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{formatNumber(member.actionsInRange)}</TableCell>
              <TableCell className="tabular-nums">{formatNumber(member.currentBalance)}</TableCell>
              <TableCell className="tabular-nums text-muted-foreground">{formatNumber(member.lifetimePoints)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ActivityFeed({ data, loading }: { data: RecentEvent[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-80 w-full" />;
  if (data.length === 0) return <EmptyState icon={<Activity className="h-8 w-8" />} title="لا توجد أحداث" text="لا توجد أحداث مطابقة للفلتر الحالي." />;
  return (
    <div className="divide-y">
      {data.map((event) => (
        <div key={event.id} className="flex items-center justify-between gap-4 py-3.5"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{event.actionIcon}</div><div className="min-w-0"><p className="truncate font-medium">{event.userName}</p><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{event.actionLabel}</span>{event.source && <span dir="ltr" className="max-w-48 truncate rounded bg-muted px-1.5 py-0.5">{event.source}</span>}</div></div></div><div className="shrink-0 text-left"><p className={`font-bold tabular-nums ${event.points >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{event.points >= 0 ? "+" : ""}{formatNumber(event.points)}</p><p className="text-xs text-muted-foreground">{relativeTime(event.createdAt)}</p></div></div>
      ))}
    </div>
  );
}

function ErrorPanel({ title, error, onRetry, compact = false }: { title: string; error: Error | null; onRetry: () => void; compact?: boolean }) {
  return (
    <Alert variant="destructive" className={compact ? "py-3" : "my-2"}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{error?.message || "حدث خطأ غير متوقع. لم نستبدل الخطأ بقيمة صفرية."}</span><Button variant="outline" size="sm" onClick={onRetry}>إعادة المحاولة</Button></AlertDescription>
    </Alert>
  );
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex flex-col items-center py-12 text-center text-muted-foreground"><div className="mb-3">{icon}</div><p className="font-semibold text-foreground">{title}</p><p className="mt-1 text-sm">{text}</p></div>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-bold tabular-nums">{value}</p></div>;
}

function FormField({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function CampaignStatusBadge({ status }: { status: Campaign["status"] }) {
  const labels = { active: "نشطة", upcoming: "قادمة", ended: "منتهية", paused: "موقوفة" };
  if (status === "active") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{labels[status]}</Badge>;
  if (status === "upcoming") return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">{labels[status]}</Badge>;
  return <Badge variant="outline">{labels[status]}</Badge>;
}

function rewardTypeLabel(type: string) {
  return ({ COUPON: "قسيمة", BADGE: "شارة", CONTENT_ACCESS: "محتوى حصري", PARTNER_REWARD: "مكافأة شريك" } as Record<string, string>)[type] ?? type;
}

function diff(now?: number | null, previous?: number | null) {
  if (now == null || previous == null || previous === 0) return null;
  return ((now - previous) / previous) * 100;
}

function relativeTime(iso: string) {
  const milliseconds = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${formatNumber(minutes)} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${formatNumber(hours)} ساعة`;
  return `منذ ${formatNumber(Math.floor(hours / 24))} يوم`;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

function datetimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
