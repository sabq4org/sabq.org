import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/queryClient";
import {
  FileText,
  Eye,
  Heart,
  MessageSquare,
  TrendingUp,
  Users,
  Star,
  Crown,
  Medal,
  Flame,
  Search,
  RefreshCw,
  Download,
  X,
  ArrowUpDown,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type TimeRange = "day" | "week" | "month" | "all";
type SortField = "score" | "articles" | "views" | "reactions" | "comments";

interface StaffMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  articlesCount: number;
  totalViews: number;
  reactionsCount: number;
  commentsCount: number;
  productivityScore: number;
}

interface ProductivityData {
  staff: StaffMember[];
  totals: {
    totalArticles: number;
    totalViews: number;
    totalReactions: number;
    totalComments: number;
  };
  range: TimeRange;
}

const roleLabels: Record<string, string> = {
  reporter: "مراسل",
  content_manager: "مدير محتوى",
  editor: "محرر",
  senior_editor: "محرر أول",
  editor_in_chief: "رئيس التحرير",
  moderator: "مشرف",
  opinion_author: "كاتب رأي",
  admin: "مسؤول",
  system_admin: "مسؤول النظام",
};

const rangeLabels: Record<TimeRange, string> = {
  day: "اليوم",
  week: "الأسبوع",
  month: "الشهر",
  all: "الكل",
};

function formatNumber(num: number): string {
  const safeNum = Number(num) || 0;
  if (safeNum >= 1000000) {
    return (safeNum / 1000000).toFixed(1) + "م";
  }
  if (safeNum >= 1000) {
    return (safeNum / 1000).toFixed(1) + "ك";
  }
  return safeNum.toString();
}

const SectionHeader = ({ title }: { title: string; color?: string }) => (
  <div className="flex items-center gap-3 px-1">
    <div className="h-6 w-1 rounded-full bg-primary/70"></div>
    <h3 className="text-base sm:text-lg font-bold text-foreground">{title}</h3>
  </div>
);

function StaffTableSkeleton() {
  return (
    <div className="space-y-3">
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الاسم</TableHead>
              <TableHead className="text-right">الدور</TableHead>
              <TableHead className="text-right">المقالات</TableHead>
              <TableHead className="text-right">المشاهدات</TableHead>
              <TableHead className="text-right">التفاعلات</TableHead>
              <TableHead className="text-right">التعليقات</TableHead>
              <TableHead className="text-right">النقاط</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-16" data-testid={`skeleton-cell-${i}-${j}`} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function StaffProductivity() {
  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortField>("score");

  const { data, isLoading, isFetching, error, refetch } = useQuery<ProductivityData>({
    queryKey: ["/api/staff/productivity", timeRange],
    queryFn: async () => {
      const response = await fetch(apiUrl(`/api/staff/productivity?range=${timeRange}`), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch productivity data");
      }
      return response.json();
    },
  });

  const safeStaff = useMemo(
    () => (Array.isArray(data?.staff) ? data.staff : []),
    [data?.staff]
  );

  const topPerformers = useMemo(
    () =>
      [...safeStaff]
        .sort((a, b) => (b.productivityScore || 0) - (a.productivityScore || 0))
        .slice(0, 3),
    [safeStaff]
  );

  const mostActive = useMemo(
    () =>
      [...safeStaff]
        .sort((a, b) => (b.articlesCount || 0) - (a.articlesCount || 0))
        .slice(0, 3),
    [safeStaff]
  );

  const rolePills = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of safeStaff) {
      const roleKey = member.role || "other";
      counts.set(roleKey, (counts.get(roleKey) || 0) + 1);
    }
    const items: Array<{ value: string; label: string; count: number }> = [
      { value: "all", label: "الكل", count: safeStaff.length },
    ];
    counts.forEach((count, roleKey) => {
      items.push({
        value: roleKey,
        label: roleLabels[roleKey] || roleKey,
        count,
      });
    });
    return items;
  }, [safeStaff]);

  const filteredStaff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = safeStaff.filter((member) => {
      if (roleFilter !== "all" && member.role !== roleFilter) return false;
      if (q) {
        const matchesName = (member.name || "").toLowerCase().includes(q);
        const matchesEmail = (member.email || "").toLowerCase().includes(q);
        const matchesRole = (roleLabels[member.role] || member.role || "")
          .toLowerCase()
          .includes(q);
        if (!matchesName && !matchesEmail && !matchesRole) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "articles":
          return (b.articlesCount || 0) - (a.articlesCount || 0);
        case "views":
          return (b.totalViews || 0) - (a.totalViews || 0);
        case "reactions":
          return (b.reactionsCount || 0) - (a.reactionsCount || 0);
        case "comments":
          return (b.commentsCount || 0) - (a.commentsCount || 0);
        case "score":
        default:
          return (b.productivityScore || 0) - (a.productivityScore || 0);
      }
    });
  }, [safeStaff, roleFilter, searchQuery, sortBy]);

  const handleExportCsv = () => {
    if (!filteredStaff.length) return;
    const headers = ["الاسم", "البريد الإلكتروني", "الدور", "المقالات", "المشاهدات", "التفاعلات", "التعليقات", "النقاط"];
    const rows = filteredStaff.map((m) => [
      `"${(m.name || m.email?.split("@")[0] || "").replace(/"/g, '""')}"`,
      `"${(m.email || "").replace(/"/g, '""')}"`,
      `"${roleLabels[m.role] || m.role || ""}"`,
      m.articlesCount || 0,
      m.totalViews || 0,
      m.reactionsCount || 0,
      m.commentsCount || 0,
      (m.productivityScore || 0).toFixed(1),
    ]);
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `staff-productivity-${timeRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={TrendingUp}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span>لوحة إنتاجية الموظفين</span>
              <Badge variant="secondary" className="text-xs font-medium tabular-nums">
                {safeStaff.length} موظف
              </Badge>
            </span>
          }
          description="متابعة الأداء لاتخاذ قرارات الرواتب وتقييم التميز التحريري"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div
                className="flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-background p-1"
                data-testid="time-range-filter"
              >
                {(Object.keys(rangeLabels) as TimeRange[]).map((range) => (
                  <Button
                    key={range}
                    variant={timeRange === range ? "default" : "ghost"}
                    size="sm"
                    className="h-8 rounded-lg px-3 text-xs"
                    onClick={() => setTimeRange(range)}
                    data-testid={`btn-range-${range}`}
                  >
                    {rangeLabels[range]}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="btn-refresh-productivity"
              >
                <RefreshCw className={cn("h-4 w-4 ml-1.5", isFetching && "animate-spin")} />
                تحديث
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={!filteredStaff.length}
                data-testid="btn-export-productivity"
              >
                <Download className="h-4 w-4 ml-1.5" />
                تصدير CSV
              </Button>
            </div>
          }
        />

        {/* Section: 4-Card KPI Summary Strip */}
        <div className="space-y-3">
          <SectionHeader title="إحصائيات الفريق" color="bg-blue-500" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Articles Stats */}
            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-articles-stats">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                  إجمالي المقالات
                </CardTitle>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" data-testid="icon-articles" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <div
                      className="text-2xl font-bold tabular-nums text-foreground"
                      data-testid="text-articles-total"
                    >
                      {formatNumber(data?.totals?.totalArticles || 0)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">مقال منشور</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Views Stats */}
            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-views-stats">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                  إجمالي المشاهدات
                </CardTitle>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Eye className="h-4 w-4" data-testid="icon-views" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <div
                      className="text-2xl font-bold tabular-nums text-foreground"
                      data-testid="text-views-total"
                    >
                      {formatNumber(data?.totals?.totalViews || 0)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">مشاهدة كلية</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Reactions Stats */}
            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-reactions-stats">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                  إجمالي التفاعلات
                </CardTitle>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Heart className="h-4 w-4" data-testid="icon-reactions" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <div
                      className="text-2xl font-bold tabular-nums text-foreground"
                      data-testid="text-reactions-total"
                    >
                      {formatNumber(data?.totals?.totalReactions || 0)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">تفاعل مع المحتوى</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Comments Stats */}
            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-comments-stats">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                  إجمالي التعليقات
                </CardTitle>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <MessageSquare className="h-4 w-4" data-testid="icon-comments" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <div
                      className="text-2xl font-bold tabular-nums text-foreground"
                      data-testid="text-comments-total"
                    >
                      {formatNumber(data?.totals?.totalComments || 0)}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">تعليق على المقالات</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section: Recognition Wall - حائط التقدير */}
        <div className="space-y-3">
          <SectionHeader title="حائط التقدير" color="bg-yellow-500" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* الأبرز - Most Prominent */}
            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-top-performers">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <div className="p-2 rounded-xl bg-yellow-500/15">
                    <Crown className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  الأبرز
                  <Badge variant="secondary" className="mr-auto text-xs">
                    أعلى الدرجات
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {topPerformers.map((member, index) => {
                      const medals = [
                        { icon: Crown, color: "text-yellow-500", bg: "bg-yellow-500/15" },
                        { icon: Medal, color: "text-slate-400", bg: "bg-slate-400/15" },
                        { icon: Medal, color: "text-amber-600", bg: "bg-amber-600/15" },
                      ];
                      const MedalIcon = medals[index]?.icon || Star;
                      return (
                        <div
                          key={member.userId}
                          className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/60"
                          data-testid={`top-performer-${index}`}
                        >
                          <div className={`p-2 rounded-xl shrink-0 ${medals[index]?.bg}`}>
                            <MedalIcon className={`h-5 w-5 ${medals[index]?.color}`} />
                          </div>
                          <Avatar className="h-10 w-10 shrink-0 border border-yellow-400/50">
                            <AvatarFallback className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 font-bold">
                              {(member.name || member.email)?.[0]?.toUpperCase() || "؟"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-semibold text-foreground truncate"
                              data-testid={`top-name-${index}`}
                            >
                              {member.name || member.email?.split("@")[0]}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {roleLabels[member.role] || member.role}
                            </p>
                          </div>
                          <div className="text-left shrink-0">
                            <p
                              className="text-xl font-bold tabular-nums text-yellow-600 dark:text-yellow-400"
                              data-testid={`top-score-${index}`}
                            >
                              {(member.productivityScore || 0).toFixed(0)}
                            </p>
                            <p className="text-xs text-muted-foreground">نقطة</p>
                          </div>
                        </div>
                      );
                    })}
                    {topPerformers.length === 0 && (
                      <p className="text-center text-muted-foreground py-6 text-sm">
                        لا توجد بيانات
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* الأكثر نشاطاً - Most Active */}
            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-most-active">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <div className="p-2 rounded-xl bg-orange-500/15">
                    <Flame className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  الأكثر نشاطاً
                  <Badge variant="secondary" className="mr-auto text-xs">
                    أكثر المقالات
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {mostActive.map((member, index) => {
                      const flames = [
                        { intensity: "text-red-500", bg: "bg-red-500/15" },
                        { intensity: "text-orange-500", bg: "bg-orange-500/15" },
                        { intensity: "text-amber-500", bg: "bg-amber-500/15" },
                      ];
                      return (
                        <div
                          key={member.userId}
                          className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/60"
                          data-testid={`most-active-${index}`}
                        >
                          <div className={`p-2 rounded-xl shrink-0 ${flames[index]?.bg}`}>
                            <Flame className={`h-5 w-5 ${flames[index]?.intensity}`} />
                          </div>
                          <Avatar className="h-10 w-10 shrink-0 border border-orange-400/50">
                            <AvatarFallback className="bg-orange-500/10 text-orange-700 dark:text-orange-300 font-bold">
                              {(member.name || member.email)?.[0]?.toUpperCase() || "؟"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p
                              className="font-semibold text-foreground truncate"
                              data-testid={`active-name-${index}`}
                            >
                              {member.name || member.email?.split("@")[0]}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {roleLabels[member.role] || member.role}
                            </p>
                          </div>
                          <div className="text-left shrink-0">
                            <p
                              className="text-xl font-bold tabular-nums text-orange-600 dark:text-orange-400"
                              data-testid={`active-articles-${index}`}
                            >
                              {member.articlesCount || 0}
                            </p>
                            <p className="text-xs text-muted-foreground">مقال</p>
                          </div>
                        </div>
                      );
                    })}
                    {mostActive.length === 0 && (
                      <p className="text-center text-muted-foreground py-6 text-sm">
                        لا توجد بيانات
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section: Staff Performance Table & Mobile Cards */}
        <div className="space-y-3">
          <SectionHeader title="ترتيب الموظفين" color="bg-orange-500" />

          {/* Search & Quick Filter Toolbar */}
          <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث باسم الموظف أو البريد الإلكتروني..."
                  className="pr-9"
                  data-testid="input-search-staff"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="مسح البحث"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="w-full sm:w-52">
                <Select value={sortBy} onValueChange={(v: SortField) => setSortBy(v)}>
                  <SelectTrigger data-testid="select-sort-staff">
                    <ArrowUpDown className="h-4 w-4 ml-2 text-muted-foreground" />
                    <SelectValue placeholder="ترتيب حسب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="score">الأعلى نقاطاً</SelectItem>
                    <SelectItem value="articles">الأكثر مقالات</SelectItem>
                    <SelectItem value="views">الأعلى مشاهدات</SelectItem>
                    <SelectItem value="reactions">الأكثر تفاعلاً</SelectItem>
                    <SelectItem value="comments">الأكثر تعليقات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {rolePills.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {rolePills.map((pill) => {
                  const active = roleFilter === pill.value;
                  return (
                    <button
                      key={pill.value}
                      type="button"
                      onClick={() => setRoleFilter(pill.value)}
                      data-testid={`filter-role-${pill.value}`}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <span>{pill.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                          active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {pill.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="card-staff-table">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3 border-b border-border/50">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Users className="h-5 w-5 text-muted-foreground" />
                أداء الموظفين
              </CardTitle>
              <Badge variant="secondary" className="tabular-nums">
                {filteredStaff.length} موظف
              </Badge>
            </CardHeader>
            <CardContent className="p-0 sm:p-4">
              {error ? (
                <div className="text-center text-destructive py-8" data-testid="error-message">
                  حدث خطأ في تحميل البيانات
                </div>
              ) : isLoading ? (
                <div className="p-4">
                  <StaffTableSkeleton />
                </div>
              ) : filteredStaff.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  لا توجد بيانات للعرض
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table data-testid="staff-table">
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-right">الاسم</TableHead>
                          <TableHead className="text-right">الدور</TableHead>
                          <TableHead className="text-right">المقالات</TableHead>
                          <TableHead className="text-right">المشاهدات</TableHead>
                          <TableHead className="text-right">التفاعلات</TableHead>
                          <TableHead className="text-right">التعليقات</TableHead>
                          <TableHead className="text-right">النقاط</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStaff.map((member, index) => (
                          <TableRow key={member.userId} data-testid={`row-staff-${index}`}>
                            <TableCell
                              className="font-medium"
                              data-testid={`text-name-${member.userId}`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                                  {index + 1}
                                </span>
                                <span className="truncate">
                                  {member.name || member.email?.split("@")[0]}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                data-testid={`badge-role-${member.userId}`}
                              >
                                {roleLabels[member.role] || member.role}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className="tabular-nums font-medium"
                              data-testid={`text-articles-${member.userId}`}
                            >
                              {member.articlesCount || 0}
                            </TableCell>
                            <TableCell
                              className="tabular-nums"
                              data-testid={`text-views-${member.userId}`}
                            >
                              {formatNumber(member.totalViews || 0)}
                            </TableCell>
                            <TableCell
                              className="tabular-nums"
                              data-testid={`text-reactions-${member.userId}`}
                            >
                              {member.reactionsCount || 0}
                            </TableCell>
                            <TableCell
                              className="tabular-nums"
                              data-testid={`text-comments-${member.userId}`}
                            >
                              {member.commentsCount || 0}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={(member.productivityScore || 0) > 100 ? "default" : "outline"}
                                className="tabular-nums"
                                data-testid={`badge-score-${member.userId}`}
                              >
                                {(member.productivityScore || 0).toFixed(1)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Stacked Cards */}
                  <div className="space-y-3 p-3 md:hidden" data-testid="staff-list-mobile">
                    {filteredStaff.map((member, index) => (
                      <div
                        key={member.userId}
                        className="rounded-xl border border-border/60 bg-background p-3.5 space-y-3"
                        data-testid={`row-staff-${index}-mobile`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold tabular-nums text-primary">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <p
                                className="font-semibold text-foreground truncate"
                                data-testid={`text-name-${member.userId}-mobile`}
                              >
                                {member.name || member.email?.split("@")[0]}
                              </p>
                              <div className="mt-0.5 flex items-center gap-1.5">
                                <Badge
                                  variant="secondary"
                                  className="text-[11px] px-2 py-0"
                                  data-testid={`badge-role-${member.userId}-mobile`}
                                >
                                  {roleLabels[member.role] || member.role}
                                </Badge>
                              </div>
                            </div>
                          </div>

                          <Badge
                            variant={(member.productivityScore || 0) > 100 ? "default" : "outline"}
                            className="shrink-0 tabular-nums text-xs"
                            data-testid={`badge-score-${member.userId}-mobile`}
                          >
                            {(member.productivityScore || 0).toFixed(1)} نقطة
                          </Badge>
                        </div>

                        <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/40 p-2.5 text-center">
                          <div>
                            <p className="text-[11px] text-muted-foreground">المقالات</p>
                            <p
                              className="text-sm font-bold tabular-nums text-foreground"
                              data-testid={`text-articles-${member.userId}-mobile`}
                            >
                              {member.articlesCount || 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">المشاهدات</p>
                            <p
                              className="text-sm font-bold tabular-nums text-foreground"
                              data-testid={`text-views-${member.userId}-mobile`}
                            >
                              {formatNumber(member.totalViews || 0)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">التفاعلات</p>
                            <p
                              className="text-sm font-bold tabular-nums text-foreground"
                              data-testid={`text-reactions-${member.userId}-mobile`}
                            >
                              {member.reactionsCount || 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground">التعليقات</p>
                            <p
                              className="text-sm font-bold tabular-nums text-foreground"
                              data-testid={`text-comments-${member.userId}-mobile`}
                            >
                              {member.commentsCount || 0}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Score Formula Info */}
        <div className="space-y-3">
          <SectionHeader title="معادلة الحساب" color="bg-slate-500" />
          <Card className="rounded-xl border-border/60 bg-card shadow-none">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div className="text-sm text-muted-foreground min-w-0 flex-1">
                  <p className="font-medium mb-1.5 text-foreground">معادلة حساب النقاط:</p>
                  <p className="font-mono text-xs bg-muted/50 p-2.5 rounded-lg break-words">
                    النقاط = (عدد المقالات × 10) + (المشاهدات × 0.01) + (التفاعلات × 2) + (التعليقات × 3)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
