import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { apiUrl } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowUpDown,
  BadgeCheck,
  Briefcase,
  Clock,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Newspaper,
  RefreshCcw,
  Search,
  ShieldAlert,
  ThumbsUp,
  Users,
  X,
} from "lucide-react";
import { VerificationChips, VerificationSummary } from "@/components/account/VerificationChips";
import { cn } from "@/lib/utils";
import { MediaLicenseAdminActions } from "@/components/MediaLicenseAdminActions";

type ReporterSummary = {
  id: string;
  name: string;
  email: string | null;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  profileImageUrl: string | null;
  jobTitle: string | null;
  city: string | null;
  lastLoginAt: string | null;
  mediaLicense: {
    hasLicense: boolean;
    expired: boolean;
    expiringSoon: boolean;
    needsCorrection: boolean;
    pendingReview: boolean;
    adminNote: string | null;
    number: string | null;
    submittedAt: string | null;
    expiresAt: string | null;
    hasFile: boolean;
  };
};

type ReporterArticlesResponse = {
  reporter: { id: string; name: string; profileImageUrl: string | null } | null;
  articles: Array<{
    id: string;
    title: string;
    slug: string | null;
    status: string;
    reviewStatus: string | null;
    publishedAt: string | null;
    scheduledAt: string | null;
    createdAt: string | null;
    views: number;
    likes: number;
    comments: number;
  }>;
  totals?: {
    totalArticles?: number;
    totalViews?: number;
    totalLikes?: number;
    totalComments?: number;
  };
  pagination?: { page: number; limit: number; total: number };
};

type LicenseFilter =
  | "all"
  | "licensed"
  | "expired"
  | "missing"
  | "needs_correction"
  | "pending_review";

type SortByOption = "license" | "last_login" | "name";

function formatDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), withTime ? "EEEE d MMMM yyyy — h:mm a" : "d/M/yyyy", {
      locale: ar,
    });
  } catch {
    return "—";
  }
}

function ReporterArticleStatusBadge({
  status,
  reviewStatus,
}: {
  status: string;
  reviewStatus: string | null;
}) {
  if (status === "published") {
    return (
      <Badge className="border border-emerald-500/25 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 text-xs">
        منشورة
      </Badge>
    );
  }
  if (status === "scheduled") {
    return (
      <Badge className="border border-blue-500/25 bg-blue-500/15 text-blue-800 dark:text-blue-300 px-2.5 py-0.5 text-xs">
        مجدولة
      </Badge>
    );
  }
  if (reviewStatus === "pending_review") {
    return (
      <Badge className="border border-amber-500/25 bg-amber-500/15 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 text-xs">
        بانتظار المراجعة
      </Badge>
    );
  }
  if (reviewStatus === "needs_changes") {
    return (
      <Badge className="border border-orange-500/25 bg-orange-500/15 text-orange-800 dark:text-orange-300 px-2.5 py-0.5 text-xs">
        تحتاج تعديلات
      </Badge>
    );
  }
  if (reviewStatus === "rejected") {
    return (
      <Badge className="border border-red-500/25 bg-red-500/15 text-red-800 dark:text-red-300 px-2.5 py-0.5 text-xs">
        مرفوضة
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="px-2.5 py-0.5 text-xs">
      مسودة
    </Badge>
  );
}

export default function ReportersPage() {
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortByOption>("license");
  const [search, setSearch] = useState("");
  const [selectedReporterId, setSelectedReporterId] = useState<string | null>(null);

  const {
    data: reportersData,
    isLoading,
    isFetching,
    isError: reportersError,
    error: reportersErrorDetail,
    refetch: refetchReporters,
  } = useQuery<{ reporters: ReporterSummary[] }>({
    queryKey: ["/api/admin/reporters"],
  });

  const reporters = Array.isArray(reportersData?.reporters) ? reportersData.reporters : [];

  const { data: reporterArticles, isLoading: articlesLoading } =
    useQuery<ReporterArticlesResponse>({
      queryKey: [`/api/admin/reporters/${selectedReporterId}/articles`],
      enabled: Boolean(selectedReporterId),
    });

  const reporterArticlesList = Array.isArray(reporterArticles?.articles)
    ? reporterArticles.articles
    : [];

  const kpis = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const licensed = reporters.filter((r) => r.mediaLicense?.hasLicense).length;
    const expiredLicense = reporters.filter((r) => r.mediaLicense?.expired).length;
    const expiringSoon = reporters.filter((r) => r.mediaLicense?.expiringSoon).length;
    const needsCorrection = reporters.filter((r) => r.mediaLicense?.needsCorrection).length;
    const pendingReview = reporters.filter((r) => r.mediaLicense?.pendingReview).length;
    const missingLicense = reporters.filter(
      (r) =>
        !r.mediaLicense?.hasLicense &&
        !r.mediaLicense?.expired &&
        !r.mediaLicense?.needsCorrection &&
        !r.mediaLicense?.pendingReview,
    ).length;
    const activeWeek = reporters.filter((r) => {
      const lastLogin = r.lastLoginAt ? new Date(r.lastLoginAt).getTime() : 0;
      return lastLogin >= weekAgo;
    }).length;
    const licensedPct =
      reporters.length > 0 ? Math.round((licensed / reporters.length) * 100) : 0;

    return {
      total: reporters.length,
      licensed,
      licensedPct,
      expiredLicense,
      expiringSoon,
      needsCorrection,
      pendingReview,
      missingLicense,
      activeWeek,
    };
  }, [reporters]);

  const availableCities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reporters) {
      const city = r.city?.trim();
      if (city) {
        counts.set(city, (counts.get(city) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"))
      .map(([city, count]) => ({ city, count }));
  }, [reporters]);

  const filteredReporters = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = reporters.filter((r) => {
      if (licenseFilter === "licensed" && !r.mediaLicense?.hasLicense) return false;
      if (
        licenseFilter === "expired" &&
        !r.mediaLicense?.expired &&
        !r.mediaLicense?.expiringSoon
      )
        return false;
      if (licenseFilter === "needs_correction" && !r.mediaLicense?.needsCorrection)
        return false;
      if (licenseFilter === "pending_review" && !r.mediaLicense?.pendingReview)
        return false;
      if (
        licenseFilter === "missing" &&
        (r.mediaLicense?.hasLicense ||
          r.mediaLicense?.expired ||
          r.mediaLicense?.needsCorrection ||
          r.mediaLicense?.pendingReview)
      )
        return false;
      if (cityFilter !== "all" && (r.city?.trim() || "") !== cityFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.email?.toLowerCase().includes(q) ?? false) ||
        (r.city?.toLowerCase().includes(q) ?? false) ||
        (r.mediaLicense?.number?.toLowerCase().includes(q) ?? false)
      );
    });

    const licenseRank = (r: ReporterSummary) => {
      if (r.mediaLicense?.pendingReview) return 0;
      if (r.mediaLicense?.expired) return 1;
      if (r.mediaLicense?.needsCorrection) return 2;
      if (r.mediaLicense?.expiringSoon) return 3;
      if (!r.mediaLicense?.hasLicense) return 4;
      return 5;
    };
    const expiresMs = (r: ReporterSummary) => {
      const raw = r.mediaLicense?.expiresAt;
      if (!raw) return Number.POSITIVE_INFINITY;
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };
    const lastLoginMs = (r: ReporterSummary) => {
      if (!r.lastLoginAt) return 0;
      const t = new Date(r.lastLoginAt).getTime();
      return Number.isNaN(t) ? 0 : t;
    };

    return filtered.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name, "ar");
      }
      if (sortBy === "last_login") {
        const diff = lastLoginMs(b) - lastLoginMs(a);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, "ar");
      }
      const rankDiff = licenseRank(a) - licenseRank(b);
      if (rankDiff !== 0) return rankDiff;
      const expDiff = expiresMs(a) - expiresMs(b);
      if (expDiff !== 0) return expDiff;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [reporters, licenseFilter, cityFilter, sortBy, search]);

  const hasActiveFilters =
    licenseFilter !== "all" || cityFilter !== "all" || Boolean(search.trim());

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-4 pb-12 sm:px-6 space-y-6"
      >
        <div dir="rtl" className="space-y-6">
          <DashboardPageHeader
            icon={Mic}
            title="إدارة المراسلين والتراخيص الإعلامية"
            description="متابعة التراخيص المهنية للمراسلين الميدانيين، التوزيع الجغرافي بالمدن، ونشاط الدخول الأخير"
            titleTestId="text-reporters-title"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="rounded-xl border-primary/25 bg-primary/5 px-3 py-1 text-xs font-semibold tabular-nums text-foreground"
                >
                  {kpis.total.toLocaleString("en-US")} مراسل ·{" "}
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {kpis.activeWeek.toLocaleString("en-US")} نشطون هذا الأسبوع
                  </span>
                </Badge>
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLicenseFilter("all");
                      setCityFilter("all");
                      setSearch("");
                    }}
                    className="no-min-touch-size h-9 gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>مسح الفلاتر</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchReporters()}
                  disabled={isFetching}
                  className="no-min-touch-size h-9 gap-1.5 rounded-xl border-border/80 text-xs font-medium"
                >
                  <RefreshCcw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                  <span>تحديث القائمة</span>
                </Button>
              </div>
            }
          />

          {reportersError ? (
            <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-destructive">
                  تعذر جلب قائمة المراسلين
                  {reportersErrorDetail instanceof Error && reportersErrorDetail.message
                    ? `: ${reportersErrorDetail.message}`
                    : ""}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="no-min-touch-size rounded-xl"
                  onClick={() => void refetchReporters()}
                >
                  إعادة المحاولة
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* شريط المؤشرات الرئيسية (4 بطاقات KPI تفاعلية) */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {/* 1. إجمالي المراسلين */}
            <Card
              className={cn(
                "cursor-pointer rounded-2xl border-border/80 bg-gradient-to-br from-primary/[0.06] via-card to-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                licenseFilter === "all" && "ring-2 ring-primary/40",
              )}
              onClick={() => setLicenseFilter("all")}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    إجمالي المراسلين
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 transition-transform group-hover:scale-105">
                    <Users className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-foreground">
                  {kpis.total.toLocaleString("en-US")}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <span>نشطون آخر ٧ أيام</span>
                  <span className="font-bold tabular-nums text-foreground">
                    {kpis.activeWeek.toLocaleString("en-US")}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 2. مرخّصون سارون */}
            <Card
              className={cn(
                "cursor-pointer rounded-2xl border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.07] via-card to-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                licenseFilter === "licensed" && "ring-2 ring-emerald-500/50",
              )}
              onClick={() => setLicenseFilter("licensed")}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    مرخّصون سارون
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-transform group-hover:scale-105">
                    <BadgeCheck className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300">
                  {kpis.licensed.toLocaleString("en-US")}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <span>نسبة التغطية النظامية</span>
                  <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {kpis.licensedPct}% من الإجمالي
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 3. بانتظار المراجعة / التصحيح */}
            <Card
              className={cn(
                "cursor-pointer rounded-2xl border-sky-500/25 bg-gradient-to-br from-sky-500/[0.07] via-card to-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                (licenseFilter === "pending_review" || licenseFilter === "needs_correction") &&
                  "ring-2 ring-sky-500/50",
              )}
              onClick={() =>
                setLicenseFilter(
                  kpis.pendingReview > 0 || licenseFilter === "needs_correction"
                    ? "pending_review"
                    : "needs_correction",
                )
              }
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    بانتظار المراجعة / التصحيح
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 transition-transform group-hover:scale-105">
                    <FileCheck2 className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-sky-700 dark:text-sky-300">
                  {(kpis.pendingReview + kpis.needsCorrection).toLocaleString("en-US")}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLicenseFilter("pending_review");
                    }}
                    className="no-min-touch-size font-medium text-sky-700 hover:underline dark:text-sky-300"
                  >
                    مراجعة: <b className="tabular-nums">{kpis.pendingReview}</b>
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLicenseFilter("needs_correction");
                    }}
                    className="no-min-touch-size font-medium text-amber-600 hover:underline dark:text-amber-400"
                  >
                    يحتاج تصحيحاً: <b className="tabular-nums">{kpis.needsCorrection}</b>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* 4. منتهي أو غير مرفوع */}
            <Card
              className={cn(
                "cursor-pointer rounded-2xl border-rose-500/25 bg-gradient-to-br from-rose-500/[0.07] via-card to-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                (licenseFilter === "expired" || licenseFilter === "missing") &&
                  "ring-2 ring-rose-500/50",
              )}
              onClick={() =>
                setLicenseFilter(
                  kpis.expiredLicense + kpis.expiringSoon > 0 && licenseFilter !== "expired"
                    ? "expired"
                    : "missing",
                )
              }
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    منتهي أو غير مرفوع
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-transform group-hover:scale-105">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-rose-600 dark:text-rose-400">
                  {(
                    kpis.expiredLicense +
                    kpis.expiringSoon +
                    kpis.missingLicense
                  ).toLocaleString("en-US")}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLicenseFilter("expired");
                    }}
                    className="no-min-touch-size font-medium text-rose-600 hover:underline dark:text-rose-400"
                  >
                    منتهٍ / جدّد:{" "}
                    <b className="tabular-nums">{kpis.expiredLicense + kpis.expiringSoon}</b>
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLicenseFilter("missing");
                    }}
                    className="no-min-touch-size font-medium text-amber-600 hover:underline dark:text-amber-400"
                  >
                    بدون ترخيص: <b className="tabular-nums">{kpis.missingLicense}</b>
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* دليل المراسلين (بطاقات متجاوبة على الجوال، جدول منظم على الديسكتوب) */}
          <Card className="rounded-2xl border-border/80 shadow-xs overflow-hidden">
            <CardHeader className="space-y-3.5 border-b border-border/60 bg-card pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-bold sm:text-lg">
                    <span>دليل المراسلين</span>
                    <Badge
                      variant="outline"
                      className="py-0.5 text-xs font-bold tabular-nums text-muted-foreground"
                    >
                      {filteredReporters.length.toLocaleString("en-US")}
                    </Badge>
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    مراجعة واعتماد التراخيص الإعلامية، التوزيع الجغرافي، واستعراض أخبار كل مراسل
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {/* حقل البحث */}
                  <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="بحث بالاسم أو البريد أو المدينة أو رقم الترخيص"
                      className="h-9 rounded-xl pr-9 pl-8 text-xs"
                      data-testid="input-reporters-search"
                    />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        title="مسح البحث"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* فلتر المدينة */}
                  {availableCities.length > 0 && (
                    <Select value={cityFilter} onValueChange={setCityFilter}>
                      <SelectTrigger className="h-9 w-full sm:w-40 rounded-xl text-xs">
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <SelectValue placeholder="كل المدن" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل المدن ({reporters.length})</SelectItem>
                        {availableCities.map(({ city, count }) => (
                          <SelectItem key={city} value={city}>
                            {city} ({count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* ترتيب القائمة */}
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortByOption)}>
                    <SelectTrigger className="h-9 w-full sm:w-44 rounded-xl text-xs">
                      <div className="flex items-center gap-1.5 truncate">
                        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <SelectValue placeholder="الترتيب" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="license">أولوية المراجعة والترخيص</SelectItem>
                      <SelectItem value="last_login">الأحدث دخولاً</SelectItem>
                      <SelectItem value="name">الاسم (أبجدياً)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <VerificationSummary users={reporters} />

              {/* شريط فلاتر حالة الترخيص المهني */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="ml-1 text-xs font-semibold text-muted-foreground">
                  الترخيص:
                </span>
                {(
                  [
                    { id: "all" as const, label: "الكل" },
                    { id: "licensed" as const, label: `ساري (${kpis.licensed})` },
                    {
                      id: "pending_review" as const,
                      label: `تحت المراجعة (${kpis.pendingReview})`,
                    },
                    {
                      id: "expired" as const,
                      label: `منتهٍ/جدّد (${kpis.expiredLicense + kpis.expiringSoon})`,
                    },
                    {
                      id: "needs_correction" as const,
                      label: `يحتاج تصحيحاً (${kpis.needsCorrection})`,
                    },
                    { id: "missing" as const, label: `بدون ترخيص (${kpis.missingLicense})` },
                  ] as const
                ).map((tab) => (
                  <Button
                    key={tab.id}
                    size="sm"
                    variant={licenseFilter === tab.id ? "default" : "outline"}
                    onClick={() => setLicenseFilter(tab.id)}
                    className="no-min-touch-size h-8 rounded-xl px-3 text-xs font-semibold"
                    data-testid={`filter-license-${tab.id}`}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">جاري تحميل بيانات المراسلين…</p>
                </div>
              ) : filteredReporters.length === 0 ? (
                <div className="space-y-2 py-14 text-center text-sm text-muted-foreground">
                  <p>
                    {reporters.length === 0
                      ? "لا يوجد مراسلون"
                      : "لا يوجد مراسلون مطابقون للفلتر أو البحث"}
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="no-min-touch-size rounded-xl text-xs"
                      onClick={() => {
                        setLicenseFilter("all");
                        setCityFilter("all");
                        setSearch("");
                      }}
                    >
                      إعادة ضبط الفلاتر
                    </Button>
                  )}
                </div>
              ) : (
                <div className="md:overflow-x-auto">
                  <table className="block w-full text-sm md:table">
                    <thead className="hidden md:table-header-group">
                      <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                        <th className="px-4 py-3 text-right font-bold">المراسل</th>
                        <th className="px-4 py-3 text-right font-bold">الترخيص المهني</th>
                        <th className="px-4 py-3 text-right font-bold">المدينة</th>
                        <th className="px-4 py-3 text-right font-bold">آخر دخول</th>
                        <th className="px-4 py-3 text-right font-bold">الأخبار</th>
                      </tr>
                    </thead>
                    <tbody className="block space-y-3 p-3 md:table-row-group md:space-y-0 md:p-0">
                      {filteredReporters.map((reporter) => {
                        const license = reporter.mediaLicense;
                        const isSelected = selectedReporterId === reporter.id;

                        return (
                          <tr
                            key={reporter.id}
                            className={cn(
                              "block rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-colors last:border-0 md:table-row md:rounded-none md:border-0 md:border-b md:p-0 md:shadow-none md:hover:bg-muted/30",
                              isSelected && "border-primary/40 bg-primary/5",
                            )}
                          >
                            {/* 1. المراسل */}
                            <td className="block border-b border-border/50 pb-3 md:table-cell md:border-0 md:px-4 md:py-3.5">
                              <div className="flex items-start justify-between gap-3 md:justify-start">
                                <div className="flex min-w-0 items-center gap-3">
                                  <Avatar className="h-10 w-10 shrink-0 ring-2 ring-border/60">
                                    <AvatarImage src={reporter.profileImageUrl ?? undefined} />
                                    <AvatarFallback className="bg-primary/10 font-bold text-primary">
                                      {reporter.name.charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="whitespace-nowrap font-bold text-foreground">
                                        {reporter.name}
                                      </span>
                                      {reporter.jobTitle && (
                                        <Badge
                                          variant="secondary"
                                          className="gap-1 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                        >
                                          <Briefcase className="h-2.5 w-2.5 opacity-70" />
                                          {reporter.jobTitle}
                                        </Badge>
                                      )}
                                    </div>
                                    <div
                                      className="truncate text-xs text-muted-foreground"
                                      dir={reporter.email ? "ltr" : "rtl"}
                                    >
                                      {reporter.email || reporter.jobTitle || "مراسل"}
                                    </div>
                                    <div className="pt-0.5">
                                      <VerificationChips user={reporter} idForTest={reporter.id} />
                                    </div>
                                  </div>
                                </div>

                                {reporter.city && (
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 gap-1 border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium md:hidden"
                                  >
                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                    {reporter.city}
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* 2. الترخيص المهني */}
                            <td className="block border-b border-border/40 py-2.5 align-middle md:table-cell md:border-0 md:px-4 md:py-3.5">
                              <div className="flex items-center justify-between gap-2 md:block">
                                <span className="text-xs font-semibold text-muted-foreground md:hidden">
                                  الترخيص المهني:
                                </span>
                                <div className="flex max-w-[14rem] flex-col items-end gap-1 md:items-start">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {license?.pendingReview ? (
                                      <Badge
                                        className="gap-1 border-0 bg-sky-100 text-sky-950 hover:bg-sky-100 dark:bg-sky-900/40 dark:text-sky-100"
                                        title="أعاد رفع الملف — اطّلع ثم اعتمد أو ارفض"
                                        data-testid={`badge-pending-review-${reporter.id}`}
                                      >
                                        تحت المراجعة
                                      </Badge>
                                    ) : license?.needsCorrection ? (
                                      <Badge
                                        className="gap-1 border-0 bg-amber-100 text-amber-950 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100"
                                        title={
                                          license.adminNote || "مطلوب إعادة رفع ملف الترخيص"
                                        }
                                        data-testid={`badge-needs-correction-${reporter.id}`}
                                      >
                                        يحتاج تصحيحاً
                                      </Badge>
                                    ) : license?.hasLicense || license?.expired ? (
                                      license.expired ? (
                                        <Badge className="gap-1 border-0 bg-rose-100 text-rose-900 hover:bg-rose-100 dark:bg-rose-900/40 dark:text-rose-200">
                                          منتهٍ
                                        </Badge>
                                      ) : license.expiringSoon ? (
                                        <Badge
                                          className="gap-1 border-0 bg-red-600 text-white hover:bg-red-600"
                                          title="أقل من شهرين — يجب التجديد للاستمرار"
                                        >
                                          جدّد الترخيص
                                        </Badge>
                                      ) : (
                                        <Badge className="gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                          <BadgeCheck className="h-3 w-3" />
                                          مرخّص
                                        </Badge>
                                      )
                                    ) : (
                                      <Badge className="gap-1 border-0 bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200">
                                        غير مرخّص
                                      </Badge>
                                    )}
                                    {license?.hasFile && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="no-min-touch-size h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                                        title="عرض ملف الترخيص"
                                        onClick={() =>
                                          window.open(
                                            apiUrl(
                                              `/api/admin/reporters/${reporter.id}/media-license-file`,
                                            ),
                                            "_blank",
                                            "noopener",
                                          )
                                        }
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    <MediaLicenseAdminActions
                                      personName={reporter.name}
                                      invalidateQueryKey={["/api/admin/reporters"]}
                                      correctionEndpoint={`/api/admin/reporters/${reporter.id}/media-license-correction`}
                                      approveEndpoint={`/api/admin/reporters/${reporter.id}/media-license-approve`}
                                      rejectEndpoint={`/api/admin/reporters/${reporter.id}/media-license-reject`}
                                      existingNote={license?.adminNote}
                                      needsCorrection={license?.needsCorrection}
                                      pendingReview={license?.pendingReview}
                                      hasFile={license?.hasFile}
                                      testIdPrefix={reporter.id}
                                    />
                                  </div>
                                  {(license?.hasLicense ||
                                    license?.expired ||
                                    license?.needsCorrection ||
                                    license?.pendingReview) && (
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                      <div
                                        className={cn(
                                          "text-[11px] tabular-nums leading-none",
                                          !license?.expiresAt ||
                                            license?.expiringSoon ||
                                            license?.expired
                                            ? "font-semibold text-red-700 dark:text-red-300"
                                            : "text-muted-foreground",
                                        )}
                                      >
                                        {license?.expiresAt
                                          ? `حتى ${format(new Date(license.expiresAt), "d/M/yyyy", { locale: ar })}`
                                          : "بلا تاريخ انتهاء"}
                                      </div>
                                      {license?.number && (
                                        <div
                                          className="truncate text-[11px] tabular-nums leading-none text-muted-foreground"
                                          dir="ltr"
                                          title={license.number}
                                        >
                                          {license.number}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 3. المدينة */}
                            <td className="hidden px-4 py-3.5 text-sm md:table-cell">
                              {reporter.city ? (
                                <span className="inline-flex items-center gap-1.5 text-foreground">
                                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                                  {reporter.city}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>

                            {/* 4. آخر دخول */}
                            <td className="block border-b border-border/40 py-2 text-xs text-muted-foreground whitespace-nowrap md:table-cell md:border-0 md:px-4 md:py-3.5">
                              <div className="flex items-center justify-between gap-2 md:justify-start">
                                <span className="font-semibold md:hidden">آخر دخول:</span>
                                <span className="inline-flex items-center gap-1 tabular-nums">
                                  <Clock className="h-3 w-3 opacity-60" />
                                  {reporter.lastLoginAt
                                    ? formatDate(reporter.lastLoginAt, false)
                                    : "—"}
                                </span>
                              </div>
                            </td>

                            {/* 5. استعراض أخبار المراسل */}
                            <td className="block pt-2 md:table-cell md:px-4 md:py-3.5">
                              <div className="flex items-center justify-between gap-2 md:justify-start">
                                <span className="text-xs font-semibold text-muted-foreground md:hidden">
                                  سجل الأخبار:
                                </span>
                                <Button
                                  type="button"
                                  variant={isSelected ? "default" : "outline"}
                                  size="sm"
                                  onClick={() =>
                                    setSelectedReporterId(isSelected ? null : reporter.id)
                                  }
                                  className="no-min-touch-size h-8 gap-1.5 rounded-xl px-2.5 text-xs font-semibold"
                                  data-testid={`button-reporter-articles-${reporter.id}`}
                                >
                                  <Newspaper className="h-3.5 w-3.5" />
                                  <span>{isSelected ? "إخفاء الأخبار" : "عرض الأخبار"}</span>
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* بطاقة استعراض أخبار المراسل المحدد */}
          {selectedReporterId && (
            <Card className="overflow-hidden rounded-2xl border-primary/30 shadow-md animate-in fade-in duration-200">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 bg-primary/5 pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <Newspaper className="h-4 w-4 text-primary" />
                  <span>
                    أخبار {reporterArticles?.reporter?.name ?? "المراسل"}
                    {reporterArticles && (
                      <span className="font-normal tabular-nums text-muted-foreground">
                        {" "}
                        ({(reporterArticles.totals?.totalArticles ?? 0).toLocaleString("en-US")})
                      </span>
                    )}
                  </span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="no-min-touch-size h-8 w-8 rounded-xl"
                  onClick={() => setSelectedReporterId(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {articlesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {reporterArticles && (
                      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Eye className="h-4 w-4 text-primary" />
                          <b className="tabular-nums text-foreground">
                            {(reporterArticles.totals?.totalViews ?? 0).toLocaleString("en-US")}
                          </b>{" "}
                          مشاهدة
                        </span>
                        <span className="flex items-center gap-1.5">
                          <ThumbsUp className="h-4 w-4 text-emerald-600" />
                          <b className="tabular-nums text-foreground">
                            {(reporterArticles.totals?.totalLikes ?? 0).toLocaleString("en-US")}
                          </b>{" "}
                          إعجاباً
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="h-4 w-4 text-sky-600" />
                          <b className="tabular-nums text-foreground">
                            {(reporterArticles.totals?.totalComments ?? 0).toLocaleString("en-US")}
                          </b>{" "}
                          تعليقاً
                        </span>
                      </div>
                    )}
                    {reporterArticlesList.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        لا توجد أخبار مسجلة لهذا المراسل
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[680px] text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                              <th className="px-4 py-3 text-right font-bold">العنوان</th>
                              <th className="px-4 py-3 text-right font-bold">الحالة</th>
                              <th className="px-4 py-3 text-right font-bold">التاريخ</th>
                              <th className="px-4 py-3 text-right font-bold">المشاهدات</th>
                              <th className="px-4 py-3 text-right font-bold">الإعجابات</th>
                              <th className="px-4 py-3 text-right font-bold">التعليقات</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reporterArticlesList.map((a) => (
                              <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="max-w-[320px] px-4 py-3">
                                  {a.status === "published" && a.slug ? (
                                    <a
                                      href={`/article/${a.slug}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="no-min-touch-size inline-flex max-w-full items-center gap-1 font-semibold text-foreground hover:text-primary hover:underline"
                                      title={a.title}
                                    >
                                      <span className="truncate">{a.title}</span>
                                      <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                                    </a>
                                  ) : (
                                    <span className="block truncate font-medium" title={a.title}>
                                      {a.title}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <ReporterArticleStatusBadge
                                    status={a.status}
                                    reviewStatus={a.reviewStatus}
                                  />
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                                  {formatDate(a.publishedAt ?? a.scheduledAt ?? a.createdAt)}
                                </td>
                                <td className="px-4 py-3 font-medium tabular-nums">
                                  {(a.views ?? 0).toLocaleString("en-US")}
                                </td>
                                <td className="px-4 py-3 tabular-nums">
                                  {(a.likes ?? 0).toLocaleString("en-US")}
                                </td>
                                <td className="px-4 py-3 tabular-nums">
                                  {(a.comments ?? 0).toLocaleString("en-US")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}

