import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  BadgeCheck,
  Briefcase,
  CalendarClock,
  Clock,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  PenTool,
  RefreshCcw,
  Search,
  ThumbsUp,
  Users,
  X,
} from "lucide-react";
import { VerificationChips, VerificationSummary } from "@/components/account/VerificationChips";
import { cn } from "@/lib/utils";
import { MediaLicenseAdminActions } from "@/components/MediaLicenseAdminActions";
import { OPINION_WRITERS_PER_DAY_CAP } from "@shared/opinionWriterConstants";

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

type WriterSummary = {
  id: string;
  name: string;
  email: string | null;
  emailVerified?: boolean;
  phoneNumber?: string | null;
  phoneVerified?: boolean;
  profileImageUrl: string | null;
  jobTitle: string | null;
  gender: string | null;
  schedule: { weekday: number; publishTime: string; active: boolean; notes: string | null } | null;
  publishedCount: number;
  pendingCount: number;
  totalViews: number;
  lastArticle: { id: string; title: string; slug: string | null; publishedAt: string } | null;
  nextScheduled: { id: string; title: string; scheduledAt: string } | null;
  nextSlot: string | null;
  commitment: "ok" | "due_soon" | "late" | "awaiting_first" | "unassigned";
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

type LicenseFilter =
  | "all"
  | "licensed"
  | "expired"
  | "missing"
  | "needs_correction"
  | "pending_review";

type CommitmentFilter = "all" | WriterSummary["commitment"];

type WriterArticlesResponse = {
  writer: { id: string; name: string; profileImageUrl: string | null } | null;
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
  totals: { totalArticles: number; totalViews: number; totalLikes: number; totalComments: number };
  pagination: { page: number; limit: number; total: number };
};

const COMMITMENT_BADGE: Record<
  WriterSummary["commitment"],
  { label: string; labelF?: string; className: string }
> = {
  ok: {
    label: "ملتزم",
    labelF: "ملتزمة",
    className:
      "border border-emerald-500/25 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 text-xs font-semibold",
  },
  due_soon: {
    label: "موعده قريب ولم يرسل",
    labelF: "موعدها قريب ولم ترسل",
    className:
      "border border-amber-500/25 bg-amber-500/15 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 text-xs font-semibold",
  },
  late: {
    label: "متأخر عن موعده",
    labelF: "متأخرة عن موعدها",
    className:
      "border border-red-500/25 bg-red-500/15 text-red-800 dark:text-red-300 px-2.5 py-0.5 text-xs font-semibold",
  },
  awaiting_first: {
    label: "بانتظار أول مقالة",
    className: "border border-border/70 bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium",
  },
  unassigned: {
    label: "بلا يوم محدد",
    className: "border border-border/70 bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium",
  },
};

function formatDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), withTime ? "EEEE d MMMM yyyy — h:mm a" : "EEEE d MMMM yyyy", {
      locale: ar,
    });
  } catch {
    return "—";
  }
}

function ArticleStatusBadge({ status, reviewStatus }: { status: string; reviewStatus: string | null }) {
  if (status === "published")
    return (
      <Badge className="border border-emerald-500/25 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 px-2.5 py-0.5 text-xs">
        منشورة
      </Badge>
    );
  if (status === "scheduled")
    return (
      <Badge className="border border-blue-500/25 bg-blue-500/15 text-blue-800 dark:text-blue-300 px-2.5 py-0.5 text-xs">
        مجدولة
      </Badge>
    );
  if (reviewStatus === "pending_review")
    return (
      <Badge className="border border-amber-500/25 bg-amber-500/15 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 text-xs">
        بانتظار المراجعة
      </Badge>
    );
  if (reviewStatus === "needs_changes")
    return (
      <Badge className="border border-orange-500/25 bg-orange-500/15 text-orange-800 dark:text-orange-300 px-2.5 py-0.5 text-xs">
        تحتاج تعديلات
      </Badge>
    );
  if (reviewStatus === "rejected")
    return (
      <Badge className="border border-red-500/25 bg-red-500/15 text-red-800 dark:text-red-300 px-2.5 py-0.5 text-xs">
        مرفوضة
      </Badge>
    );
  return (
    <Badge variant="outline" className="px-2.5 py-0.5 text-xs">
      مسودة
    </Badge>
  );
}

export default function OpinionWritersPage() {
  const { toast } = useToast();
  const [selectedWriterId, setSelectedWriterId] = useState<string | null>(null);
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>("all");
  const [commitmentFilter, setCommitmentFilter] = useState<CommitmentFilter>("all");
  const [search, setSearch] = useState("");

  const {
    data: writersData,
    isLoading,
    isFetching,
    isError: writersError,
    error: writersErrorDetail,
    refetch: refetchWriters,
  } = useQuery<{ writers: WriterSummary[] }>({
    queryKey: ["/api/admin/opinion-writers"],
  });
  const writers = Array.isArray(writersData?.writers)
    ? writersData.writers
    : Array.isArray(writersData)
      ? (writersData as unknown as WriterSummary[])
      : [];

  const { data: writerArticles, isLoading: articlesLoading } = useQuery<WriterArticlesResponse>({
    queryKey: [`/api/admin/opinion-writers/${selectedWriterId}/articles`],
    enabled: Boolean(selectedWriterId),
  });
  const writerArticlesList = Array.isArray(writerArticles?.articles)
    ? writerArticles.articles
    : [];

  const scheduleMutation = useMutation({
    mutationFn: async ({
      writerId,
      weekday,
      publishTime,
      active,
    }: {
      writerId: string;
      weekday: number;
      publishTime?: string;
      active?: boolean;
    }) =>
      apiRequest(`/api/admin/opinion-writers/${writerId}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekday, publishTime, active }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/opinion-writers"] });
      toast({ title: "تم حفظ يوم النشر" });
    },
    onError: (error: Error) => {
      toast({
        title: "تعذر حفظ يوم النشر",
        description: error.message || undefined,
        variant: "destructive",
      });
    },
  });

  const todayWeekday = new Date().getDay();

  const kpis = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;
    const licensed = writers.filter((w) => w.mediaLicense?.hasLicense).length;
    const expiredLicense = writers.filter((w) => w.mediaLicense?.expired).length;
    const needsCorrection = writers.filter((w) => w.mediaLicense?.needsCorrection).length;
    const pendingReview = writers.filter((w) => w.mediaLicense?.pendingReview).length;
    const missingLicense = writers.filter(
      (w) =>
        !w.mediaLicense?.hasLicense &&
        !w.mediaLicense?.expired &&
        !w.mediaLicense?.needsCorrection &&
        !w.mediaLicense?.pendingReview,
    ).length;
    return {
      total: writers.length,
      publishedThisWeek: writers.filter(
        (w) => w.lastArticle && new Date(w.lastArticle.publishedAt).getTime() >= weekAgo,
      ).length,
      dueSoon: writers.filter((w) => w.commitment === "due_soon").length,
      late: writers.filter((w) => w.commitment === "late").length,
      chosePublishDay: writers.filter((w) => w.schedule?.active).length,
      inactiveTwoMonths: writers.filter(
        (w) =>
          !w.lastArticle || new Date(w.lastArticle.publishedAt).getTime() < twoMonthsAgo,
      ).length,
      licensed,
      expiredLicense,
      needsCorrection,
      pendingReview,
      missingLicense,
    };
  }, [writers]);

  const filteredWriters = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = writers.filter((w) => {
      if (licenseFilter === "licensed" && !w.mediaLicense?.hasLicense) return false;
      if (licenseFilter === "expired" && !w.mediaLicense?.expired) return false;
      if (licenseFilter === "needs_correction" && !w.mediaLicense?.needsCorrection)
        return false;
      if (licenseFilter === "pending_review" && !w.mediaLicense?.pendingReview)
        return false;
      if (
        licenseFilter === "missing" &&
        (w.mediaLicense?.hasLicense ||
          w.mediaLicense?.expired ||
          w.mediaLicense?.needsCorrection ||
          w.mediaLicense?.pendingReview)
      )
        return false;
      if (commitmentFilter !== "all" && w.commitment !== commitmentFilter) return false;
      if (!q) return true;
      return (
        w.name.toLowerCase().includes(q) ||
        (w.email?.toLowerCase().includes(q) ?? false) ||
        (w.jobTitle?.toLowerCase().includes(q) ?? false) ||
        (w.mediaLicense?.number?.toLowerCase().includes(q) ?? false)
      );
    });

    // الأولوية: تحت المراجعة → منتهٍ → يحتاج تصحيحاً → جدّد → بدون → ساري
    const licenseRank = (w: WriterSummary) => {
      if (w.mediaLicense?.pendingReview) return 0;
      if (w.mediaLicense?.expired) return 1;
      if (w.mediaLicense?.needsCorrection) return 2;
      if (w.mediaLicense?.expiringSoon) return 3;
      if (!w.mediaLicense?.hasLicense) return 4;
      return 5;
    };
    const expiresMs = (w: WriterSummary) => {
      const raw = w.mediaLicense?.expiresAt;
      if (!raw) return Number.POSITIVE_INFINITY;
      const t = new Date(raw).getTime();
      return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
    };

    return filtered.sort((a, b) => {
      const rankDiff = licenseRank(a) - licenseRank(b);
      if (rankDiff !== 0) return rankDiff;
      const expDiff = expiresMs(a) - expiresMs(b);
      if (expDiff !== 0) return expDiff;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [writers, licenseFilter, commitmentFilter, search]);

  const byWeekday = useMemo(() => {
    const map: WriterSummary[][] = Array.from({ length: 7 }, () => []);
    for (const w of writers) {
      if (w.schedule?.active && w.schedule.weekday >= 0 && w.schedule.weekday < 7) {
        map[w.schedule.weekday].push(w);
      }
    }
    return map;
  }, [writers]);

  const handleDayChange = (writer: WriterSummary, value: string) => {
    if (value === "none") {
      if (writer.schedule) {
        scheduleMutation.mutate({
          writerId: writer.id,
          weekday: writer.schedule.weekday,
          active: false,
        });
      }
      return;
    }
    scheduleMutation.mutate({
      writerId: writer.id,
      weekday: parseInt(value, 10),
      publishTime: writer.schedule?.publishTime ?? "06:00",
      active: true,
    });
  };

  const handleTimeChange = (writer: WriterSummary, publishTime: string) => {
    if (!writer.schedule?.active || !publishTime) return;
    if (publishTime === writer.schedule.publishTime) return;
    scheduleMutation.mutate({
      writerId: writer.id,
      weekday: writer.schedule.weekday,
      publishTime,
      active: true,
    });
  };

  const hasActiveFilters =
    licenseFilter !== "all" || commitmentFilter !== "all" || Boolean(search.trim());

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1400px]"
        contentClassName="px-4 pb-12 sm:px-6 space-y-6"
      >
        <div dir="rtl" className="space-y-6">
          <DashboardPageHeader
            icon={PenTool}
            title="كتّاب الرأي"
            description="إدارة التراخيص المهنية، جدول النشر الأسبوعي، مؤشرات الالتزام، وإحصائيات مقالات كتّاب الرأي"
            titleTestId="text-opinion-writers-title"
            className="p-4 sm:p-5"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLicenseFilter("all");
                      setCommitmentFilter("all");
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
                  onClick={() => void refetchWriters()}
                  disabled={isFetching}
                  className="no-min-touch-size h-9 gap-1.5 rounded-xl border-border/80 text-xs font-medium"
                >
                  <RefreshCcw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                  <span>تحديث القائمة</span>
                </Button>
              </div>
            }
          />

          {writersError ? (
            <Card className="rounded-2xl border-destructive/40 bg-destructive/5">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-sm text-destructive">
                  تعذر جلب قائمة الكتّاب
                  {writersErrorDetail instanceof Error && writersErrorDetail.message
                    ? `: ${writersErrorDetail.message}`
                    : ""}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="no-min-touch-size rounded-xl"
                  onClick={() => void refetchWriters()}
                >
                  إعادة المحاولة
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* شريط المؤشرات الرئيسية (4 بطاقات KPI واضحة مع تفاصيل فرعية شاملة) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. إجمالي الكتّاب ونشاط الأسبوع */}
            <Card
              className="cursor-pointer rounded-2xl border-border/80 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group"
              onClick={() => {
                setLicenseFilter("all");
                setCommitmentFilter("all");
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    كاتباً نشطاً
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 transition-transform group-hover:scale-105">
                    <Users className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-foreground">
                  {kpis.total}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <span>نشروا خلال آخر ٧ أيام</span>
                  <span className="font-bold tabular-nums text-foreground">
                    {kpis.publishedThisWeek}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 2. التراخيص المهنية السارية وحالاتها */}
            <Card
              className="cursor-pointer rounded-2xl border-emerald-500/25 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group"
              onClick={() => setLicenseFilter("licensed")}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    ترخيص ساري
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-transform group-hover:scale-105">
                    <BadgeCheck className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300">
                  {kpis.licensed}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLicenseFilter("expired");
                    }}
                    className="no-min-touch-size hover:underline text-rose-600 dark:text-rose-400 font-medium"
                  >
                    ترخيص منتهٍ: <b className="tabular-nums">{kpis.expiredLicense}</b>
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLicenseFilter("missing");
                    }}
                    className="no-min-touch-size hover:underline text-amber-600 dark:text-amber-400 font-medium"
                  >
                    بدون ترخيص بعد: <b className="tabular-nums">{kpis.missingLicense}</b>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* 3. جدول النشر الأسبوعي */}
            <Card
              className="cursor-pointer rounded-2xl border-primary/25 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group"
              onClick={() => setCommitmentFilter("ok")}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    اختاروا يوم النشر
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20 transition-transform group-hover:scale-105">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-primary">
                  {kpis.chosePublishDay}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCommitmentFilter("due_soon");
                    }}
                    className="no-min-touch-size hover:underline text-amber-600 dark:text-amber-400 font-medium"
                  >
                    موعدهم قريب ولم يرسلوا
                  </button>
                  <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {kpis.dueSoon}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 4. متابعة الالتزام والانقطاع */}
            <Card
              className="cursor-pointer rounded-2xl border-red-500/25 bg-card/95 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group"
              onClick={() => setCommitmentFilter("late")}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    متأخرون عن مواعيدهم
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 transition-transform group-hover:scale-105">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-red-600 dark:text-red-400">
                  {kpis.late}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <span>بلا نشاط أكثر من شهرين</span>
                  <span className="font-bold tabular-nums text-foreground">
                    {kpis.inactiveTwoMonths}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Weekly distribution — stacked on mobile, 7-column grid on md+ */}
          <Card className="rounded-2xl border-border/80 shadow-sm overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  <span>توزيع الكتّاب على أيام الأسبوع</span>
                </CardTitle>
                <Badge variant="outline" className="py-0.5 text-xs font-medium text-muted-foreground">
                  الحد الأقصى: {OPINION_WRITERS_PER_DAY_CAP} كتّاب لكل يوم
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {/* Mobile: one day per row, full names, wrap chips */}
              <div className="space-y-2.5 md:hidden">
                {WEEKDAYS.map((day, i) => {
                  const writersForDay = byWeekday[i];
                  const isToday = i === todayWeekday;
                  const isFull = writersForDay.length >= OPINION_WRITERS_PER_DAY_CAP;
                  return (
                    <div
                      key={day}
                      className={cn(
                        "rounded-xl border p-3 transition-colors",
                        isFull
                          ? "border-amber-300/70 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/30"
                          : isToday
                            ? "border-primary/35 bg-primary/5"
                            : "border-border bg-muted/30",
                      )}
                      data-testid={`weekday-mobile-${i}`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div
                          className={cn(
                            "text-sm font-bold",
                            isFull
                              ? "text-amber-800 dark:text-amber-300"
                              : isToday
                                ? "text-primary"
                                : "text-foreground",
                          )}
                        >
                          {day}
                          {isToday && !isFull && (
                            <span className="ms-1.5 text-xs font-semibold text-primary">(اليوم)</span>
                          )}
                        </div>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "py-0.5 text-[11px] font-semibold",
                            isFull && "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200",
                          )}
                        >
                          {writersForDay.length} من {OPINION_WRITERS_PER_DAY_CAP} كتّاب
                        </Badge>
                      </div>
                      {isFull && (
                        <p
                          className="mb-2 text-xs font-semibold text-amber-800 dark:text-amber-300"
                          data-testid={`weekday-full-mobile-${i}`}
                        >
                          غير متاح للنشر — اكتمل العدد
                        </p>
                      )}
                      {writersForDay.length === 0 ? (
                        <p className="text-xs italic text-muted-foreground">شاغر</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {writersForDay.map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() =>
                                setSelectedWriterId(selectedWriterId === w.id ? null : w.id)
                              }
                              className={cn(
                                "no-min-touch-size rounded-lg border px-2.5 py-1 text-xs leading-snug transition-colors",
                                selectedWriterId === w.id
                                  ? "border-primary bg-primary/10 text-primary font-semibold"
                                  : "border-border bg-card text-foreground hover:border-primary/40"
                              )}
                            >
                              {w.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop / tablet: 7-column board */}
              <div className="hidden grid-cols-7 gap-2.5 md:grid">
                {WEEKDAYS.map((day, i) => {
                  const count = byWeekday[i].length;
                  const isFull = count >= OPINION_WRITERS_PER_DAY_CAP;
                  const isToday = i === todayWeekday;
                  return (
                    <div
                      key={day}
                      className={cn(
                        "rounded-xl border p-2.5 transition-colors",
                        isFull
                          ? "border-amber-300/70 bg-amber-50/90 dark:border-amber-800/50 dark:bg-amber-950/30"
                          : isToday
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/60 bg-muted/20",
                      )}
                      data-testid={`weekday-desktop-${i}`}
                    >
                      <div
                        className={cn(
                          "mb-1.5 flex items-center justify-between border-b-2 pb-1.5 text-xs font-bold",
                          isFull
                            ? "border-amber-400 text-amber-800 dark:text-amber-300"
                            : isToday
                              ? "border-primary text-primary"
                              : "border-border text-foreground",
                        )}
                      >
                        <span>
                          {day}
                          {isToday && !isFull && " (اليوم)"}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "mb-2 text-[11px] font-semibold leading-snug",
                          isFull ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground",
                        )}
                      >
                        {count} من {OPINION_WRITERS_PER_DAY_CAP} كتّاب
                      </div>
                      {isFull && (
                        <p
                          className="mb-2 text-[10px] font-semibold leading-snug text-amber-800 dark:text-amber-300"
                          data-testid={`weekday-full-desktop-${i}`}
                        >
                          غير متاح للنشر
                        </p>
                      )}
                      {count === 0 ? (
                        <div className="py-3 text-center text-xs italic text-muted-foreground">
                          شاغر
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {byWeekday[i].map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() =>
                                setSelectedWriterId(selectedWriterId === w.id ? null : w.id)
                              }
                              className={cn(
                                "no-min-touch-size block w-full text-right truncate rounded-lg border px-2 py-1 text-xs transition-colors",
                                selectedWriterId === w.id
                                  ? "border-primary bg-primary/15 text-primary font-semibold"
                                  : "border-border/60 bg-card hover:border-primary/40 text-foreground"
                              )}
                              title={w.name}
                            >
                              {w.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Writers directory (responsive cards on mobile, structured table on desktop) */}
          <Card className="rounded-2xl border-border/80 shadow-sm overflow-hidden">
            <CardHeader className="space-y-3.5 pb-4 border-b border-border/60 bg-card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                    <span>جدول الكتّاب</span>
                    <Badge variant="outline" className="py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
                      {filteredWriters.length.toLocaleString("en-US")}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    إدارة التراخيص، تحديد يوم ووقت النشر الأسبوعي، واستعراض مقالات كل كاتب
                  </p>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث بالاسم، التخصص، البريد، أو الترخيص..."
                    className="pr-9 pl-8 h-9 text-xs rounded-xl"
                    data-testid="input-writers-search"
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
              </div>

              <VerificationSummary users={writers} />

              {/* شريط فلاتر حالة الترخيص المهني + الالتزام */}
              <div className="flex flex-col gap-2.5 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground ml-1">الترخيص:</span>
                  {(
                    [
                      { id: "all" as const, label: "الكل" },
                      { id: "licensed" as const, label: `ساري (${kpis.licensed})` },
                      {
                        id: "pending_review" as const,
                        label: `تحت المراجعة (${kpis.pendingReview})`,
                      },
                      { id: "expired" as const, label: `منتهٍ (${kpis.expiredLicense})` },
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

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground ml-1">الالتزام:</span>
                  {(
                    [
                      { id: "all" as const, label: "كل الحالات" },
                      { id: "ok" as const, label: "ملتزم" },
                      { id: "due_soon" as const, label: `موعده قريب (${kpis.dueSoon})` },
                      { id: "late" as const, label: `متأخر (${kpis.late})` },
                      { id: "unassigned" as const, label: "بلا يوم محدد" },
                    ] as const
                  ).map((pill) => {
                    const active = commitmentFilter === pill.id;
                    return (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setCommitmentFilter(pill.id)}
                        className={cn(
                          "no-min-touch-size inline-flex items-center rounded-xl border px-2.5 py-1 text-xs font-semibold transition-all",
                          active
                            ? "border-primary bg-primary/15 text-primary shadow-xs"
                            : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">جاري تحميل بيانات كتّاب الرأي…</p>
                </div>
              ) : writersError ? (
                <div className="py-12 text-center text-sm text-destructive">
                  فشل تحميل البيانات — استخدم «إعادة المحاولة» أعلاه
                </div>
              ) : filteredWriters.length === 0 ? (
                <div className="py-14 text-center text-muted-foreground text-sm space-y-2">
                  <p>{writers.length === 0 ? "لا يوجد كتّاب رأي بعد" : "لا نتائج مطابقة للفلتر أو البحث"}</p>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="no-min-touch-size rounded-xl text-xs"
                      onClick={() => {
                        setLicenseFilter("all");
                        setCommitmentFilter("all");
                        setSearch("");
                      }}
                    >
                      إعادة ضبط الفلاتر
                    </Button>
                  )}
                </div>
              ) : (
                <div className="md:overflow-x-auto">
                  <table className="block md:table w-full text-sm">
                    <thead className="hidden md:table-header-group">
                      <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                        <th className="text-right font-bold px-4 py-3">الكاتب والتخصص</th>
                        <th className="text-right font-bold px-4 py-3">الترخيص المهني</th>
                        <th className="text-right font-bold px-4 py-3">اليوم المخصص</th>
                        <th className="text-right font-bold px-4 py-3">وقت النشر</th>
                        <th className="text-right font-bold px-4 py-3">المقالات المنشورة</th>
                        <th className="text-right font-bold px-4 py-3">آخر مقالة</th>
                        <th className="text-right font-bold px-4 py-3">الحالة</th>
                        <th className="text-right font-bold px-4 py-3">المشاهدات</th>
                      </tr>
                    </thead>
                    <tbody className="block md:table-row-group p-3 md:p-0 space-y-3 md:space-y-0">
                      {filteredWriters.map((writer) => {
                        const badge = COMMITMENT_BADGE[writer.commitment] ?? COMMITMENT_BADGE.unassigned;
                        const badgeLabel =
                          writer.gender === "female" && badge.labelF ? badge.labelF : badge.label;
                        const license = writer.mediaLicense;
                        const specialization =
                          writer.jobTitle ||
                          (writer.gender === "female" ? "كاتبة رأي" : "كاتب رأي");

                        return (
                          <tr
                            key={writer.id}
                            className={cn(
                              "block md:table-row rounded-2xl border border-border/80 bg-card p-4 shadow-xs transition-colors md:rounded-none md:border-0 md:border-b md:p-0 md:shadow-none md:hover:bg-muted/30 last:border-0",
                              selectedWriterId === writer.id && "bg-primary/5 border-primary/40"
                            )}
                          >
                            {/* 1. الكاتب والصورة والتخصص */}
                            <td className="block md:table-cell pb-3 md:pb-3 md:px-4 md:py-3.5 border-b border-border/50 md:border-0">
                              <div className="flex items-start justify-between gap-3 md:justify-start">
                                <div className="flex items-center gap-3 min-w-0">
                                  <Avatar className="h-11 w-11 md:h-10 md:w-10 ring-2 ring-border/60 shrink-0">
                                    <AvatarImage src={writer.profileImageUrl ?? undefined} />
                                    <AvatarFallback className="font-bold bg-primary/10 text-primary">
                                      {writer.name.charAt(0)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-foreground whitespace-nowrap">
                                        {writer.name}
                                      </span>
                                      <Badge
                                        variant="secondary"
                                        className="px-2 py-0.5 text-[10px] font-medium gap-1 text-muted-foreground"
                                      >
                                        <Briefcase className="h-2.5 w-2.5 opacity-70" />
                                        {specialization}
                                      </Badge>
                                    </div>
                                    {writer.email && (
                                      <div className="text-xs text-muted-foreground truncate" dir="ltr">
                                        {writer.email}
                                      </div>
                                    )}
                                    <div className="pt-0.5">
                                      <VerificationChips user={writer} idForTest={writer.id} />
                                    </div>
                                  </div>
                                </div>

                                {/* شارة اليوم الأسبوعي السريعة على الجوال */}
                                {writer.schedule?.active && (
                                  <Badge
                                    variant="outline"
                                    className="md:hidden shrink-0 border-primary/30 bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-semibold"
                                  >
                                    {WEEKDAYS[writer.schedule.weekday]} · {writer.schedule.publishTime}
                                  </Badge>
                                )}
                              </div>
                            </td>

                            {/* 2. الترخيص المهني */}
                            <td className="block md:table-cell py-2.5 md:px-4 md:py-3.5 align-middle border-b border-border/40 md:border-0">
                              <div className="flex items-center justify-between gap-2 md:block">
                                <span className="text-xs font-semibold text-muted-foreground md:hidden">
                                  الترخيص المهني:
                                </span>
                                <div className="flex max-w-[14rem] flex-col items-end md:items-start gap-1">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {license?.pendingReview ? (
                                      <Badge
                                        className="gap-1 border-0 bg-sky-100 text-sky-950 hover:bg-sky-100 dark:bg-sky-900/40 dark:text-sky-100 px-2.5 py-0.5"
                                        title="أعاد رفع الملف — اطّلع ثم اعتمد أو ارفض"
                                        data-testid={`badge-pending-review-${writer.id}`}
                                      >
                                        تحت المراجعة
                                      </Badge>
                                    ) : license?.needsCorrection ? (
                                      <Badge
                                        className="gap-1 border-0 bg-amber-100 text-amber-950 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-100 px-2.5 py-0.5"
                                        title={license.adminNote || "مطلوب إعادة رفع ملف الترخيص"}
                                        data-testid={`badge-needs-correction-${writer.id}`}
                                      >
                                        يحتاج تصحيحاً
                                      </Badge>
                                    ) : license?.hasLicense || license?.expired ? (
                                      license.expired ? (
                                        <Badge
                                          className="gap-1 border-0 bg-rose-100 text-rose-900 hover:bg-rose-100 dark:bg-rose-900/40 dark:text-rose-200 px-2.5 py-0.5"
                                          data-testid={`badge-expired-license-${writer.id}`}
                                        >
                                          منتهٍ
                                        </Badge>
                                      ) : license.expiringSoon ? (
                                        <Badge
                                          className="gap-1 border-0 bg-red-600 text-white hover:bg-red-600 px-2.5 py-0.5"
                                          title="أقل من شهرين — يجب التجديد للاستمرار"
                                          data-testid={`badge-expiring-license-${writer.id}`}
                                        >
                                          جدّد الترخيص
                                        </Badge>
                                      ) : (
                                        <Badge className="gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-2.5 py-0.5">
                                          <BadgeCheck className="h-3 w-3" />
                                          مرخّص
                                        </Badge>
                                      )
                                    ) : (
                                      <Badge
                                        className="gap-1 border-0 bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200 px-2.5 py-0.5"
                                        data-testid={`badge-unlicensed-${writer.id}`}
                                      >
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
                                              `/api/admin/opinion-writers/${writer.id}/media-license-file`,
                                            ),
                                            "_blank",
                                            "noopener",
                                          )
                                        }
                                        data-testid={`button-view-license-${writer.id}`}
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    <MediaLicenseAdminActions
                                      personName={writer.name}
                                      invalidateQueryKey={["/api/admin/opinion-writers"]}
                                      correctionEndpoint={`/api/admin/opinion-writers/${writer.id}/media-license-correction`}
                                      approveEndpoint={`/api/admin/opinion-writers/${writer.id}/media-license-approve`}
                                      rejectEndpoint={`/api/admin/opinion-writers/${writer.id}/media-license-reject`}
                                      existingNote={license?.adminNote}
                                      needsCorrection={license?.needsCorrection}
                                      pendingReview={license?.pendingReview}
                                      hasFile={license?.hasFile}
                                      testIdPrefix={writer.id}
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
                                          className="truncate text-[11px] tabular-nums text-muted-foreground leading-none"
                                          dir="ltr"
                                          title={license.number}
                                        >
                                          #{license.number}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 3. اليوم المخصص */}
                            <td className="block md:table-cell py-2 md:px-4 md:py-3.5">
                              <div className="flex items-center justify-between gap-2 md:block">
                                <span className="text-xs font-semibold text-muted-foreground md:hidden">
                                  اليوم المخصص:
                                </span>
                                <Select
                                  value={
                                    writer.schedule?.active
                                      ? String(writer.schedule.weekday)
                                      : "none"
                                  }
                                  onValueChange={(v) => handleDayChange(writer, v)}
                                  disabled={scheduleMutation.isPending}
                                >
                                  <SelectTrigger className="w-[140px] md:w-[130px] h-9 rounded-xl text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">بدون يوم</SelectItem>
                                    {WEEKDAYS.map((day, i) => {
                                      const count = byWeekday[i].length;
                                      const isCurrent =
                                        writer.schedule?.active && writer.schedule.weekday === i;
                                      const isFull =
                                        count >= OPINION_WRITERS_PER_DAY_CAP && !isCurrent;
                                      return (
                                        <SelectItem key={i} value={String(i)} disabled={isFull}>
                                          {day} — {count} من {OPINION_WRITERS_PER_DAY_CAP} كتّاب
                                          {isFull ? " (غير متاح)" : ""}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                            </td>

                            {/* 4. وقت النشر */}
                            <td className="block md:table-cell py-2 md:px-4 md:py-3.5 border-b border-border/40 md:border-0">
                              <div className="flex items-center justify-between gap-2 md:block">
                                <span className="text-xs font-semibold text-muted-foreground md:hidden">
                                  وقت النشر:
                                </span>
                                <Input
                                  type="time"
                                  className="w-[140px] md:w-[110px] h-9 rounded-xl text-xs"
                                  defaultValue={writer.schedule?.publishTime ?? "06:00"}
                                  disabled={!writer.schedule?.active || scheduleMutation.isPending}
                                  onBlur={(e) => handleTimeChange(writer, e.target.value)}
                                />
                              </div>
                            </td>

                            {/* 5. المقالات المنشورة */}
                            <td className="block md:table-cell py-2 md:px-4 md:py-3.5">
                              <div className="flex items-center justify-between gap-2 md:block">
                                <span className="text-xs font-semibold text-muted-foreground md:hidden">
                                  المقالات:
                                </span>
                                <div>
                                  <Button
                                    variant="ghost"
                                    className="no-min-touch-size h-auto px-2 py-1 font-extrabold tabular-nums text-primary underline underline-offset-4 hover:text-primary/80 hover:bg-primary/10 rounded-lg"
                                    onClick={() =>
                                      setSelectedWriterId(
                                        selectedWriterId === writer.id ? null : writer.id,
                                      )
                                    }
                                  >
                                    {writer.publishedCount} مقالة
                                  </Button>
                                  {writer.pendingCount > 0 && (
                                    <div className="mt-0.5">
                                      <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25 px-2 py-0.5 text-[10px] font-semibold">
                                        {writer.pendingCount} بانتظار المراجعة
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 6. آخر مقالة */}
                            <td className="block md:table-cell py-2 md:px-4 md:py-3.5 md:max-w-[220px]">
                              <div className="flex items-start justify-between gap-2 md:block">
                                <span className="text-xs font-semibold text-muted-foreground md:hidden shrink-0">
                                  آخر مقالة:
                                </span>
                                {writer.lastArticle ? (
                                  <div className="min-w-0 text-left md:text-right">
                                    <div
                                      className="font-medium text-xs text-foreground truncate max-w-[220px]"
                                      title={writer.lastArticle.title}
                                    >
                                      {writer.lastArticle.title}
                                    </div>
                                    <div className="text-[11px] text-muted-foreground flex items-center justify-end md:justify-start gap-1 mt-0.5">
                                      <Clock className="h-3 w-3 opacity-60 shrink-0" />
                                      <span>{formatDate(writer.lastArticle.publishedAt, false)}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs">لا يوجد</span>
                                )}
                              </div>
                            </td>

                            {/* 7. الحالة والالتزام */}
                            <td className="block md:table-cell py-2 md:px-4 md:py-3.5">
                              <div className="flex items-center justify-between gap-2 md:block">
                                <span className="text-xs font-semibold text-muted-foreground md:hidden">
                                  الالتزام:
                                </span>
                                <div className="text-left md:text-right">
                                  <Badge className={badge.className}>{badgeLabel}</Badge>
                                  {writer.nextScheduled && (
                                    <div className="text-[11px] text-muted-foreground mt-1">
                                      مجدولة: {formatDate(writer.nextScheduled.scheduledAt, false)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 8. المشاهدات */}
                            <td className="block md:table-cell pt-2 md:px-4 md:py-3.5 tabular-nums font-semibold">
                              <div className="flex items-center justify-between gap-2 md:justify-start">
                                <span className="text-xs font-semibold text-muted-foreground md:hidden">
                                  إجمالي المشاهدات:
                                </span>
                                <span className="inline-flex items-center gap-1 text-foreground">
                                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                  {writer.totalViews.toLocaleString("en-US")}
                                </span>
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

          {/* Writer articles drill-down */}
          {selectedWriterId && (
            <Card className="rounded-2xl border-primary/30 shadow-md overflow-hidden animate-in fade-in duration-200">
              <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 border-b border-border/60 bg-primary/5">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>
                    مقالات {writerArticles?.writer?.name ?? "الكاتب"}
                    {writerArticles && (
                      <span className="text-muted-foreground font-normal tabular-nums">
                        {" "}
                        ({writerArticles.totals?.totalArticles ?? 0})
                      </span>
                    )}
                  </span>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="no-min-touch-size h-8 w-8 rounded-xl"
                  onClick={() => setSelectedWriterId(null)}
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
                    {writerArticles && (
                      <div className="flex flex-wrap gap-x-6 gap-y-2 px-4 py-3 border-b bg-muted/20 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Eye className="h-4 w-4 text-primary" />
                          <b className="text-foreground tabular-nums">
                            {(writerArticles.totals?.totalViews ?? 0).toLocaleString("en-US")}
                          </b>{" "}
                          مشاهدة
                        </span>
                        <span className="flex items-center gap-1.5">
                          <ThumbsUp className="h-4 w-4 text-emerald-600" />
                          <b className="text-foreground tabular-nums">
                            {(writerArticles.totals?.totalLikes ?? 0).toLocaleString("en-US")}
                          </b>{" "}
                          إعجاباً
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="h-4 w-4 text-sky-600" />
                          <b className="text-foreground tabular-nums">
                            {(writerArticles.totals?.totalComments ?? 0).toLocaleString("en-US")}
                          </b>{" "}
                          تعليقاً
                        </span>
                      </div>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[680px]">
                        <thead>
                          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                            <th className="text-right font-bold px-4 py-3">العنوان</th>
                            <th className="text-right font-bold px-4 py-3">الحالة</th>
                            <th className="text-right font-bold px-4 py-3">التاريخ</th>
                            <th className="text-right font-bold px-4 py-3">المشاهدات</th>
                            <th className="text-right font-bold px-4 py-3">الإعجابات</th>
                            <th className="text-right font-bold px-4 py-3">التعليقات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {writerArticlesList.map((a) => (
                            <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                              <td className="px-4 py-3 max-w-[320px]">
                                {a.status === "published" && a.slug ? (
                                  <a
                                    href={`/opinion/${a.slug}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="no-min-touch-size font-semibold text-foreground hover:text-primary hover:underline inline-flex items-center gap-1 max-w-full"
                                    title={a.title}
                                  >
                                    <span className="truncate">{a.title}</span>
                                    <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
                                  </a>
                                ) : (
                                  <span className="font-medium truncate block" title={a.title}>
                                    {a.title}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <ArticleStatusBadge status={a.status} reviewStatus={a.reviewStatus} />
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(a.publishedAt ?? a.scheduledAt ?? a.createdAt)}
                              </td>
                              <td className="px-4 py-3 tabular-nums font-medium">
                                {a.views.toLocaleString("en-US")}
                              </td>
                              <td className="px-4 py-3 tabular-nums">
                                {a.likes.toLocaleString("en-US")}
                              </td>
                              <td className="px-4 py-3 tabular-nums">
                                {a.comments.toLocaleString("en-US")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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

