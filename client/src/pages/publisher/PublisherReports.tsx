import { useState, type ComponentType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CalendarDays, Clock, Eye, FileBarChart, FileText, Printer, TrendingUp } from "lucide-react";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { UsualComparison, type VsUsual } from "@/components/publisher/ArticleInsights";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { PublisherPageHeader } from "@/components/publisher/PublisherPageHeader";
import { PublisherPrintReport, type PrintReportArticle } from "@/components/publisher/PublisherPrintReport";
import { cn } from "@/lib/utils";
import { formatDateShort, formatNumber } from "@/lib/format";

interface MonthlyReport {
  month: string;
  agencyName: string;
  totals: { published: number; views: number };
  previous: { published: number; views: number };
  categories: Array<{ name: string; published: number; views: number; usualMedian: number | null }>;
  topArticles: Array<{
    id: string;
    title: string;
    views: number | null;
    publishedAt: string | null;
    categoryName: string | null;
    vsUsual: VsUsual | null;
  }>;
  articles?: PrintReportArticle[];
  authors: Array<{ name: string; published: number; views: number }>;
  availableMonths: string[];
  generatedAt: string;
}

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("ar-SA-u-ca-gregory", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const shortMonth = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("ar-SA-u-ca-gregory", { month: "short", timeZone: "UTC" });

function ReportTile({
  title,
  icon: Icon,
  iconClass,
  value,
  hint,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card className="group relative overflow-hidden border-border/60 shadow-sm">
      <div aria-hidden className="pointer-events-none absolute -start-6 -top-6 h-24 w-24 rounded-full bg-primary/[0.06]" />
      <CardContent className="relative space-y-1 p-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {title}
          <span className={cn("rounded-xl p-2", iconClass)}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="text-3xl font-bold tracking-tight tabular-nums">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  if (before <= 0) return null;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return <span className="text-xs text-muted-foreground">مثل الشهر السابق</span>;
  return (
    <span className={change > 0 ? "text-xs font-medium text-emerald-700 dark:text-emerald-300" : "text-xs text-red-700 dark:text-red-300"}>
      {change > 0 ? "▲" : "▼"} <bdi className="tabular-nums">{formatNumber(Math.abs(change))}%</bdi>
      <span className="text-muted-foreground"> عن الشهر السابق</span>
    </span>
  );
}

/**
 * التقرير الشهري للوكالة بصفحة طباعة نظيفة. الحفظ PDF يتم من نافذة
 * الطباعة في المتصفح، فلا حاجة لخدمة توليد ملفات.
 */
export default function PublisherReports() {
  usePublisherAccess();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    // مطلع الشهر يعرض الشهر المنقضي افتراضيًا: الحالي بالكاد بدأ
    if (now.getUTCDate() <= 5) {
      const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      return prev.toISOString().slice(0, 7);
    }
    return currentMonth();
  });

  const { data, isLoading } = useQuery<MonthlyReport>({
    queryKey: ["/api/publisher/portal/reports/monthly", { month }],
  });

  const months = Array.from(new Set([currentMonth(), month, ...(Array.isArray(data?.availableMonths) ? data!.availableMonths : [])]))
    .sort()
    .reverse();
  const categories = Array.isArray(data?.categories) ? data!.categories : [];
  const topArticles = Array.isArray(data?.topArticles) ? data!.topArticles : [];
  const authors = Array.isArray(data?.authors) ? data!.authors : [];
  const maxCategory = Math.max(1, ...categories.map((c) => c.published));
  const inProgress = (data?.month ?? month) === currentMonth();
  const reportMonth = data?.month ?? month;
  const [ry, rm] = reportMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(ry, rm, 0)).getUTCDate();
  const countedDays = inProgress ? new Date().getUTCDate() : daysInMonth;

  // آخر 6 أشهر حتى الشهر المختار، من سلسلة لوحة التحكم نفسها
  const { data: overview } = useQuery<{
    monthlyPublishing?: Array<{ month: string; published: number; views: number }>;
    publisher?: { contactPerson?: string | null; logoUrl?: string | null };
    activeCredit?: { packageName?: string | null; isUnlimited?: boolean; remainingCredits?: number; expiryDate?: string | null } | null;
  }>({
    queryKey: ["/api/publisher/portal/overview"],
  });
  const series = Array.isArray(overview?.monthlyPublishing) ? overview!.monthlyPublishing : [];
  const trend = series.filter((m) => m.month <= reportMonth).slice(-6);
  const trendMax = Math.max(1, ...trend.map((m) => m.published));
  const credit = overview?.activeCredit;
  const packageLine = credit
    ? [
        credit.packageName,
        credit.isUnlimited ? null : `المتبقي ${formatNumber(credit.remainingCredits ?? 0)}`,
        credit.expiryDate ? `حتى ${formatDateShort(new Date(new Date(credit.expiryDate).getTime() - 1))}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <PublisherLayout>
      {data ? (
        <PublisherPrintReport
          data={{
            month: data.month,
            monthLabel: monthLabel(data.month),
            agencyName: data.agencyName,
            agencyLogoUrl: overview?.publisher?.logoUrl ?? null,
            contactPerson: overview?.publisher?.contactPerson ?? null,
            packageLine,
            generatedAt: String(data.generatedAt),
            inProgress,
            countedDays,
            daysInMonth,
            totals: data.totals,
            previous: data.previous,
            trend: trend.map((m) => ({ month: m.month, label: shortMonth(m.month), published: m.published })),
            categories,
            authors,
            topArticles,
            articles: Array.isArray(data.articles) ? data.articles : topArticles,
          }}
        />
      ) : null}
      <div className="w-full space-y-6" dir="rtl">
        <div className="no-print">
          <PublisherPageHeader
            icon={FileBarChart}
            eyebrow="التقارير الشهرية"
            title={`تقرير ${monthLabel(data?.month ?? month)}`}
            description="جاهز للطباعة والحفظ PDF وإرساله لإدارتكم."
            actions={
              <>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-[170px] rounded-xl shadow-sm" data-testid="select-report-month">
                    <CalendarDays className="ml-1 h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>
                        {monthLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" className="gap-2 rounded-xl shadow-sm" onClick={() => void document.fonts.ready.then(() => window.print())} data-testid="button-print-report">
                  <Printer className="h-4 w-4" />
                  طباعة / PDF
                </Button>
              </>
            }
          />
        </div>

        {isLoading || !data ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : (
          <>
            <div className="no-print grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ReportTile
                title="أخبار منشورة"
                icon={FileText}
                iconClass="bg-sky-500/10 text-sky-600 dark:text-sky-300"
                value={formatNumber(data.totals.published)}
                hint={<Delta now={data.totals.published} before={data.previous.published} />}
              />
              <ReportTile
                title="قراءات أخبار الشهر"
                icon={Eye}
                iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                value={formatNumber(data.totals.views)}
                hint={<Delta now={data.totals.views} before={data.previous.views} />}
              />
              <ReportTile
                title="متوسط قراءات الخبر"
                icon={TrendingUp}
                iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-300"
                value={data.totals.published ? formatNumber(Math.round(data.totals.views / data.totals.published)) : "—"}
                hint={<span>لكل خبر منشور في الشهر</span>}
              />
              <ReportTile
                title="أيام الشهر المحسوبة"
                icon={Clock}
                iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-300"
                value={`${countedDays} / ${daysInMonth}`}
                hint={<span>{inProgress ? "الشهر لم يكتمل بعد" : "شهر كامل"}</span>}
              />
            </div>

            <section
              id="publisher-report"
              className="space-y-6 rounded-xl border border-border/60 bg-card p-5 shadow-sm sm:p-6"
              data-testid="publisher-report"
            >
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    <FileBarChart className="h-3.5 w-3.5" />
                    صحيفة سبق · تقرير الوكالة
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                    {data.agencyName} · {monthLabel(data.month)}
                  </h2>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    inProgress
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  أُعدّ في {formatDateShort(data.generatedAt)}
                  {inProgress ? " · الشهر جارٍ" : ""}
                </span>
              </header>

              {trend.length > 1 ? (
                <div className="space-y-2" data-testid="report-trend">
                  <h3 className="text-sm font-semibold">آخر {formatNumber(trend.length)} أشهر</h3>
                  <div className="flex h-32 items-end gap-2" aria-label="عدد الأخبار المنشورة شهريًا">
                    {trend.map((m) => (
                      <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                        <span className="text-[11px] font-semibold tabular-nums">{formatNumber(m.published)}</span>
                        <span
                          className={cn("w-full max-w-[40px] rounded-t-md", m.month === data.month ? "bg-primary" : "bg-primary/30")}
                          style={{ height: `${Math.max(3, (m.published / trendMax) * 100)}%` }}
                        />
                        <span className="truncate text-[11px] text-muted-foreground">{shortMonth(m.month)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {data.totals.published === 0 ? (
                <p className="rounded-xl border border-dashed py-10 text-center text-muted-foreground">
                  لا توجد أخبار منشورة في هذا الشهر.
                </p>
              ) : (
                <>
                  <div className={cn("grid gap-6", authors.length > 1 && "lg:grid-cols-2")}>
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold">حسب القسم</h3>
                      <div className="space-y-2.5">
                        {categories.map((c) => (
                          <div key={c.name} className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5 text-sm sm:grid-cols-[90px_minmax(0,1fr)_150px]">
                            <span className="truncate font-medium">{c.name}</span>
                            <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${(c.published / maxCategory) * 100}%` }} />
                            </span>
                            <span className="col-start-2 text-xs tabular-nums text-muted-foreground sm:col-start-auto">
                              {formatNumber(c.published)} خبر · {formatNumber(c.views)} قراءة
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {authors.length > 1 ? (
                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold">حسب عضو الفريق</h3>
                        <ul className="divide-y divide-border/60 rounded-xl border border-border/60 text-sm">
                          {authors.map((a) => (
                            <li key={a.name} className="flex items-center justify-between gap-3 px-3 py-2">
                              <span className="truncate">{a.name}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {formatNumber(a.published)} خبر · {formatNumber(a.views)} قراءة
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">الأعلى قراءة</h3>
                    <ol className="divide-y divide-border/60">
                      {topArticles.map((a, i) => (
                        <li
                          key={a.id}
                          className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-3 sm:grid-cols-[28px_minmax(0,1fr)_90px_130px]"
                        >
                          <span className="font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                          <div className="min-w-0">
                            <Link href={`/dashboard/publisher/articles/${a.id}/report`} className="font-medium leading-relaxed hover:underline">
                              {a.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {[a.categoryName, a.publishedAt ? formatDateShort(a.publishedAt) : null].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <span className="col-start-2 font-semibold tabular-nums sm:col-start-auto">{formatNumber(a.views ?? 0)}</span>
                          <span className="col-start-2 sm:col-start-auto">
                            <UsualComparison value={a.vsUsual} />
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              )}

              <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
                القراءات هي مجموع قراءات الأخبار المنشورة في الشهر حتى تاريخ إعداد التقرير. «المعتاد» هو وسيط قراءات أخبار سبق في
                القسم نفسه خلال آخر 90 يومًا.
              </p>
            </section>
          </>
        )}
      </div>
    </PublisherLayout>
  );
}
