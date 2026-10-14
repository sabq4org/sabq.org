import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ClipboardList,
  PenLine,
  Plus,
  Send,
  Users,
  CheckCircle2,
  FileQuestion,
  Search,
  Share2,
  Copy,
  Check,
  Code2,
  Link2,
  Calendar,
  TrendingUp,
  RefreshCw,
  X,
} from "lucide-react";

type SurveyStatus = "draft" | "active" | "closed";

type SurveyListItem = {
  id: string;
  title: string;
  purpose: string | null;
  status: SurveyStatus;
  sentAt: string | null;
  createdAt: string;
  invitedCount: number;
  completedCount: number;
  questionsCount: number;
};

type StatusFilter = "all" | SurveyStatus;

const STATUS_META: Record<
  SurveyStatus,
  { label: string; accent: string; chip: string; bar: string; dot: string }
> = {
  draft: {
    label: "مسودة",
    accent: "bg-amber-500/70",
    chip: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
  },
  active: {
    label: "نشط",
    accent: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
  },
  closed: {
    label: "مغلق",
    accent: "bg-slate-400",
    chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25",
    bar: "bg-slate-400",
    dot: "bg-slate-400",
  },
};

function formatShortDate(date: string | null | undefined): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function MetricCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border/50 bg-muted/40 px-2.5 py-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground shadow-2xs">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 leading-none">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export default function Surveys() {
  const { toast } = useToast();
  const {
    data: surveysRaw,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({ queryKey: ["/api/surveys"] });
  const surveys: SurveyListItem[] = Array.isArray(surveysRaw) ? surveysRaw : [];
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [shareSurvey, setShareSurvey] = useState<SurveyListItem | null>(null);
  const [copiedField, setCopiedField] = useState<"link" | "embed" | null>(null);

  useEffect(() => {
    document.title = "استطلاعات الرأي - لوحة التحكم";
  }, []);

  const stats = useMemo(() => {
    let active = 0;
    let draft = 0;
    let closed = 0;
    let responses = 0;
    let invited = 0;
    for (const s of surveys) {
      if (s.status === "active") active += 1;
      else if (s.status === "draft") draft += 1;
      else if (s.status === "closed") closed += 1;
      responses += Number(s.completedCount) || 0;
      invited += Number(s.invitedCount) || 0;
    }
    return {
      total: surveys.length,
      active,
      draft,
      closed,
      responses,
      invited,
      responseRate: invited > 0 ? Math.round((responses / invited) * 100) : 0,
    };
  }, [surveys]);

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return surveys.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!query) return true;
      const inTitle = (s.title ?? "").toLowerCase().includes(query);
      const inPurpose = (s.purpose ?? "").toLowerCase().includes(query);
      return inTitle || inPurpose;
    });
  }, [surveys, statusFilter, searchTerm]);

  const filterTabs: Array<{
    id: StatusFilter;
    label: string;
    count: number;
    dot?: string;
  }> = [
    { id: "all", label: "الكل", count: stats.total },
    {
      id: "active",
      label: "نشط",
      count: stats.active,
      dot: STATUS_META.active.dot,
    },
    {
      id: "draft",
      label: "مسودة",
      count: stats.draft,
      dot: STATUS_META.draft.dot,
    },
    {
      id: "closed",
      label: "مغلق",
      count: stats.closed,
      dot: STATUS_META.closed.dot,
    },
  ];

  const handleCopyText = async (text: string, type: "link" | "embed") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(type);
      toast({
        title: type === "link" ? "تم نسخ الرابط" : "تم نسخ كود التضمين",
        description:
          type === "link"
            ? "يمكنك مشاركة رابط الاستطلاع الآن"
            : "ألصق كود التضمين في الصفحة أو المقال المطلوب",
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast({
        title: "تعذر النسخ",
        description: "يرجى نسخ النص يدوياً",
        variant: "destructive",
      });
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "https://sabq.org";
  const shareUrl = shareSurvey
    ? `${origin}/dashboard/surveys/${shareSurvey.id}/${shareSurvey.status === "draft" ? "edit" : "results"}`
    : "";
  const editorUrl = shareSurvey ? `${origin}/dashboard/surveys/${shareSurvey.id}/edit` : "";

  const { data: invitationsRaw, isLoading: invitationsLoading } = useQuery<
    {
      id: string;
      userId: string | null;
      name: string;
      email: string | null;
      emailStatus: string | null;
      notifiedAt: string | null;
      openedAt: string | null;
      completedAt: string | null;
    }[]
  >({
    queryKey: [`/api/surveys/${shareSurvey?.id}/invitations`],
    enabled: Boolean(shareSurvey?.id),
  });
  const invitations = Array.isArray(invitationsRaw) ? invitationsRaw : [];

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1400px]"
        contentClassName="px-4 pb-16 sm:px-6"
      >
        <DashboardPageHeader
          icon={ClipboardList}
          title="استطلاعات الرأي"
          description="إدارة الاستبيانات التحريرية وروابط المدعوين — أسئلة مرنة وتحليل فوري للنتائج"
          titleTestId="text-surveys-title"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="no-min-touch-size h-10 gap-1.5 px-3 text-xs"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-refresh-surveys"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                تحديث
              </Button>
              <Link href="/dashboard/surveys/new">
                <Button className="h-10 gap-2 px-4" data-testid="button-new-survey">
                  <Plus className="h-4 w-4" />
                  استطلاع جديد
                </Button>
              </Link>
            </div>
          }
        />

        {/* شريط مؤشرات الأداء — 4 بطاقات KPI مع أيقونات واضحة */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            {
              id: "total",
              label: "إجمالي الاستطلاعات",
              subtitle: `${stats.draft.toLocaleString("en-US")} مسودة · ${stats.closed.toLocaleString("en-US")} مغلق`,
              value: stats.total.toLocaleString("en-US"),
              icon: ClipboardList,
              iconWrap: "bg-primary/10 text-primary",
              testId: "card-total-surveys",
            },
            {
              id: "active",
              label: "نشطة الآن",
              subtitle: "تستقبل إجابات المشاركين",
              value: stats.active.toLocaleString("en-US"),
              icon: Send,
              iconWrap: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
              tone: "text-emerald-700 dark:text-emerald-300",
              testId: "card-active-surveys",
            },
            {
              id: "responses",
              label: "إجمالي الإجابات",
              subtitle: `من أصل ${stats.invited.toLocaleString("en-US")} دعوة مرسلة`,
              value: stats.responses.toLocaleString("en-US"),
              icon: CheckCircle2,
              iconWrap: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
              tone: "text-sky-700 dark:text-sky-300",
              testId: "card-total-responses",
            },
            {
              id: "rate",
              label: "نسبة الاستجابة",
              subtitle: "معدل إكمال الدعوات",
              value: `${stats.responseRate}٪`,
              icon: TrendingUp,
              iconWrap: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
              tone: "text-violet-700 dark:text-violet-300",
              testId: "card-response-rate",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                data-testid={item.testId}
                className="flex flex-col justify-between rounded-2xl border bg-card p-3.5 sm:p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-muted-foreground">
                      {item.label}
                    </p>
                    <p
                      className={cn(
                        "mt-1.5 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl",
                        item.tone,
                      )}
                    >
                      {isLoading ? "—" : item.value}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      item.iconWrap,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="mt-2 truncate text-[11px] text-muted-foreground/80">
                  {item.subtitle}
                </p>
              </div>
            );
          })}
        </div>

        {/* شريط البحث والفلاتر السريعة */}
        <div
          className="flex flex-col gap-3 rounded-2xl border bg-card p-3.5 sm:p-4 lg:flex-row lg:items-center lg:justify-between"
          data-testid="surveys-filters-bar"
        >
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/40 p-1">
            {filterTabs.map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={cn(
                    "no-min-touch-size inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all tabular-nums",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`filter-surveys-${tab.id}`}
                >
                  {tab.dot && <span className={cn("h-1.5 w-1.5 rounded-full", tab.dot)} />}
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px]",
                      active ? "bg-muted font-semibold" : "bg-background/60",
                    )}
                  >
                    {tab.count.toLocaleString("en-US")}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2.5 lg:max-w-md">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بعنوان الاستطلاع أو الهدف..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pr-9 pl-8 text-xs sm:text-sm"
                data-testid="input-search-surveys"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="مسح البحث"
                  className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
              يعرض {filtered.length.toLocaleString("en-US")} من{" "}
              {stats.total.toLocaleString("en-US")}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <Skeleton key={index} className="h-[220px] w-full rounded-2xl" />
            ))}
          </div>
        ) : surveys.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-14 text-center">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-semibold">لا توجد استطلاعات بعد</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              أنشئ استطلاعاً بأسئلة قصيرة، أرسل رابطاً شخصياً لكل مدعو، وتابع التحليل من مكان واحد.
            </p>
            <Link href="/dashboard/surveys/new">
              <Button className="mt-5 h-10 gap-2 px-4">
                <Plus className="h-4 w-4" />
                إنشاء أول استطلاع
              </Button>
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center">
            <Search className="mx-auto mb-2.5 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">لا توجد استطلاعات مطابقة للبحث أو التبويب الحالي</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="no-min-touch-size mt-3 h-8 text-xs"
              onClick={() => {
                setStatusFilter("all");
                setSearchTerm("");
              }}
            >
              إعادة ضبط الفلاتر
            </Button>
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((survey) => {
              const meta = STATUS_META[survey.status] ?? STATUS_META.draft;
              const questionsCount = Number(survey.questionsCount) || 0;
              const invitedCount = Number(survey.invitedCount) || 0;
              const completedCount = Number(survey.completedCount) || 0;
              const completionRate =
                invitedCount > 0 ? Math.round((completedCount / invitedCount) * 100) : 0;

              return (
                <article
                  key={survey.id}
                  data-testid={`survey-row-${survey.id}`}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-2xs transition-all hover:border-primary/35 hover:shadow-sm"
                >
                  <span
                    aria-hidden
                    className={cn("absolute inset-y-0 end-0 w-1", meta.accent)}
                  />

                  <div className="flex flex-1 flex-col gap-3.5 p-4 pe-5">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 space-y-1">
                        <h2 className="line-clamp-2 text-base font-bold leading-snug text-foreground">
                          {survey.title}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1 tabular-nums">
                            <Calendar className="h-3 w-3" />
                            أُنشئ: {formatShortDate(survey.createdAt)}
                          </span>
                          {survey.sentAt && (
                            <>
                              <span className="opacity-40">·</span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                أُرسل: {formatShortDate(survey.sentAt)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <span
                        data-testid={`badge-survey-status-${survey.id}`}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                          meta.chip,
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                        {meta.label}
                      </span>
                    </div>

                    {survey.purpose ? (
                      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {survey.purpose}
                      </p>
                    ) : (
                      <p className="text-xs italic text-muted-foreground/60">
                        بدون وصف أو هدف مكتوب
                      </p>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <MetricCell
                        icon={FileQuestion}
                        label="الأسئلة"
                        value={questionsCount.toLocaleString("en-US")}
                      />
                      <MetricCell
                        icon={Users}
                        label="المدعوون"
                        value={
                          survey.status === "draft"
                            ? "—"
                            : invitedCount.toLocaleString("en-US")
                        }
                      />
                      <MetricCell
                        icon={CheckCircle2}
                        label="الإجابات"
                        value={
                          survey.status === "draft"
                            ? "—"
                            : completedCount.toLocaleString("en-US")
                        }
                      />
                    </div>

                    {survey.status !== "draft" ? (
                      <div className="mt-auto space-y-1.5 pt-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>نسبة الإكمال والاستجابة</span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {completionRate}٪ ({completedCount.toLocaleString("en-US")}/
                            {invitedCount.toLocaleString("en-US")})
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn("h-full rounded-full transition-all", meta.bar)}
                            style={{ width: `${Math.min(completionRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-auto flex items-center gap-1.5 rounded-lg bg-amber-500/8 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                        <Send className="h-3.5 w-3.5 shrink-0" />
                        <span>مسودة جاهزة لإضافة الأسئلة وإرسال الدعوات</span>
                      </div>
                    )}
                  </div>

                  {/* شريط الإجراءات السريعة: النتائج · تحرير · مشاركة وتضمين */}
                  <div className="mt-auto grid grid-cols-3 gap-px border-t bg-border/60">
                    {survey.status !== "draft" ? (
                      <Link
                        href={`/dashboard/surveys/${survey.id}/results`}
                        data-testid={`link-survey-results-${survey.id}`}
                        className="no-min-touch-size flex items-center justify-center gap-1.5 bg-card px-2.5 py-2.5 text-xs font-medium transition-colors hover:bg-muted/60"
                      >
                        <BarChart3 className="h-3.5 w-3.5 text-primary" />
                        <span>النتائج</span>
                      </Link>
                    ) : (
                      <div className="flex items-center justify-center gap-1 bg-card px-2.5 py-2.5 text-[11px] text-muted-foreground/70">
                        <BarChart3 className="h-3.5 w-3.5 opacity-50" />
                        <span>بلا نتائج</span>
                      </div>
                    )}

                    <Link
                      href={`/dashboard/surveys/${survey.id}/edit`}
                      data-testid={`link-survey-edit-${survey.id}`}
                      className="no-min-touch-size flex items-center justify-center gap-1.5 bg-card px-2.5 py-2.5 text-xs font-medium transition-colors hover:bg-muted/60"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      <span>{survey.status === "draft" ? "تحرير وإرسال" : "تحرير"}</span>
                    </Link>

                     <button
                      type="button"
                      onClick={() => setShareSurvey(survey)}
                      data-testid={`button-share-survey-${survey.id}`}
                      className="no-min-touch-size flex items-center justify-center gap-1.5 bg-card px-2.5 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      <span>الدعوات والروابط</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* نافذة الدعوات والروابط الإدارية */}
        <Dialog
          open={!!shareSurvey}
          onOpenChange={(open) => {
            if (!open) {
              setShareSurvey(null);
              setCopiedField(null);
            }
          }}
        >
          <DialogContent className="max-w-lg" dir="rtl" data-testid="dialog-share-survey">
            <DialogHeader className="text-right">
              <DialogTitle className="flex items-center justify-end gap-2">
                <span>روابط الاستطلاع وحالة الدعوات</span>
                <Share2 className="h-5 w-5 text-primary" />
              </DialogTitle>
              <DialogDescription className="text-right">
                {shareSurvey?.title} — يتم إرسال رابط شخصي فريد لكل مدعو عبر البريد والإشعارات عند الإرسال
              </DialogDescription>
            </DialogHeader>

            {shareSurvey && (
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {shareSurvey.status === "draft"
                      ? "رابط تحرير وإرسال الاستطلاع"
                      : "رابط صفحة النتائج والتحليل"}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      dir="ltr"
                      value={shareUrl}
                      className="h-9 font-mono text-xs"
                      data-testid="input-survey-share-url"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="no-min-touch-size h-9 shrink-0 gap-1.5 px-3 text-xs"
                      onClick={() => handleCopyText(shareUrl, "link")}
                      data-testid="button-copy-survey-url"
                    >
                      {copiedField === "link" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedField === "link" ? "تم النسخ" : "نسخ الرابط"}
                    </Button>
                  </div>
                </div>

                {shareSurvey.status !== "draft" && (
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                      رابط إعدادات الاستطلاع والجمهور
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        dir="ltr"
                        value={editorUrl}
                        className="h-9 font-mono text-xs"
                        data-testid="text-survey-embed-code"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="no-min-touch-size h-9 shrink-0 gap-1.5 px-3 text-xs"
                        onClick={() => handleCopyText(editorUrl, "embed")}
                        data-testid="button-copy-survey-embed"
                      >
                        {copiedField === "embed" ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedField === "embed" ? "تم النسخ" : "نسخ الرابط"}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      قائمة المدعوين وحالة الاستجابة
                    </span>
                    <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                      {invitations.length.toLocaleString("en-US")} مدعو
                    </span>
                  </div>

                  {invitationsLoading ? (
                    <Skeleton className="h-20 w-full rounded-xl" />
                  ) : invitations.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                      لم تُرسل دعوات شخصية لهذا الاستطلاع بعد. افتح صفحة التحرير لاختيار الجمهور والإرسال.
                    </div>
                  ) : (
                    <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-xl border bg-muted/20 p-2">
                      {invitations.slice(0, 20).map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{inv.name}</p>
                            {inv.email && (
                              <p className="truncate font-mono text-[10px] text-muted-foreground" dir="ltr">
                                {inv.email}
                              </p>
                            )}
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                              inv.completedAt
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : inv.openedAt
                                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                  : "bg-slate-500/10 text-slate-600 dark:text-slate-300",
                            )}
                          >
                            {inv.completedAt ? "أكمل الاستطلاع" : inv.openedAt ? "فتح الرابط" : "أُرسل"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <Link
                    href={`/dashboard/surveys/${shareSurvey.id}/edit`}
                    onClick={() => setShareSurvey(null)}
                    className="no-min-touch-size inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <Users className="h-3.5 w-3.5" />
                    إدارة الجمهور وإرسال الدعوات
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="no-min-touch-size h-8 text-xs"
                    onClick={() => setShareSurvey(null)}
                  >
                    إغلاق
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DashboardPageShell>
    </DashboardLayout>
  );
}

