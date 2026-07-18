import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  { label: string; accent: string; chip: string; bar: string }
> = {
  draft: {
    label: "مسودة",
    accent: "bg-muted-foreground/40",
    chip: "bg-muted text-muted-foreground border-transparent",
    bar: "bg-muted-foreground/50",
  },
  active: {
    label: "نشط",
    accent: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    bar: "bg-emerald-500",
  },
  closed: {
    label: "مغلق",
    accent: "bg-slate-400",
    chip: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20",
    bar: "bg-slate-400",
  },
};

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
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 leading-none">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

export default function Surveys() {
  const { data: surveysRaw, isLoading } = useQuery({ queryKey: ["/api/surveys"] });
  const surveys: SurveyListItem[] = Array.isArray(surveysRaw) ? surveysRaw : [];
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
    if (statusFilter === "all") return surveys;
    return surveys.filter((s) => s.status === statusFilter);
  }, [surveys, statusFilter]);

  const filterTabs: Array<{ id: StatusFilter; label: string; count: number }> = [
    { id: "all", label: "الكل", count: stats.total },
    { id: "active", label: "نشط", count: stats.active },
    { id: "draft", label: "مسودة", count: stats.draft },
    { id: "closed", label: "مغلق", count: stats.closed },
  ];

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1400px]"
        contentClassName="px-4 pb-16 sm:px-6"
      >
        <DashboardPageHeader
          icon={ClipboardList}
          title="استطلاعات الرأي"
          description="روابط شخصية لكل مدعو — أسئلة قصيرة وتحليل للإجابات"
          titleTestId="text-surveys-title"
          actions={
            <Link href="/dashboard/surveys/new">
              <Button className="h-10 gap-2 px-4" data-testid="button-new-survey">
                <Plus className="h-4 w-4" />
                استطلاع جديد
              </Button>
            </Link>
          }
        />

        {/* شريط ملخص مضغوط — بدون بطاقات فارغة */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "إجمالي الاستطلاعات", value: stats.total },
            { label: "نشطة الآن", value: stats.active },
            { label: "إجمالي الإجابات", value: stats.responses },
            { label: "نسبة الاستجابة", value: `${stats.responseRate}٪` },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border bg-card px-3.5 py-3"
            >
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                {isLoading ? "—" : item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 rounded-xl border bg-muted/30 p-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors tabular-nums",
                  statusFilter === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`filter-surveys-${tab.id}`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            يعرض {filtered.length} من {stats.total}
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <Skeleton key={index} className="h-[188px] w-full rounded-2xl" />
            ))}
          </div>
        ) : surveys.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-12 text-center">
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
          <div className="rounded-2xl border bg-muted/20 px-6 py-10 text-center text-sm text-muted-foreground">
            لا توجد استطلاعات في هذا التبويب
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                  className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary/35 hover:bg-muted/20"
                >
                  <span
                    aria-hidden
                    className={cn("absolute inset-y-0 end-0 w-1", meta.accent)}
                  />

                  <div className="flex flex-1 flex-col gap-3 p-4 pe-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="line-clamp-2 text-base font-semibold leading-snug">
                        {survey.title}
                      </h2>
                      <span
                        className={cn(
                          "shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                          meta.chip,
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>

                    {survey.purpose ? (
                      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {survey.purpose}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground/70">بدون هدف مكتوب</p>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <MetricCell icon={FileQuestion} label="أسئلة" value={questionsCount} />
                      <MetricCell
                        icon={Users}
                        label="مدعوون"
                        value={survey.status === "draft" ? "—" : invitedCount}
                      />
                      <MetricCell
                        icon={CheckCircle2}
                        label="إجابات"
                        value={survey.status === "draft" ? "—" : completedCount}
                      />
                    </div>

                    {survey.status !== "draft" ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>نسبة الإكمال</span>
                          <span className="font-medium tabular-nums text-foreground">
                            {completionRate}٪
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
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Send className="h-3.5 w-3.5" />
                        جاهز للتحرير ثم الإرسال
                      </div>
                    )}
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-px border-t bg-border/60">
                    {survey.status !== "draft" ? (
                      <Link
                        href={`/dashboard/surveys/${survey.id}/results`}
                        className="flex items-center justify-center gap-1.5 bg-card px-3 py-2.5 text-xs font-medium transition-colors hover:bg-muted/60"
                      >
                        <BarChart3 className="h-3.5 w-3.5 text-primary" />
                        النتائج
                      </Link>
                    ) : (
                      <div className="flex items-center justify-center bg-card px-3 py-2.5 text-xs text-muted-foreground">
                        لم يُرسل بعد
                      </div>
                    )}
                    <Link
                      href={`/dashboard/surveys/${survey.id}/edit`}
                      className="flex items-center justify-center gap-1.5 bg-card px-3 py-2.5 text-xs font-medium transition-colors hover:bg-muted/60"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      {survey.status === "draft" ? "تحرير وإرسال" : "الإعدادات"}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </DashboardPageShell>
    </DashboardLayout>
  );
}
