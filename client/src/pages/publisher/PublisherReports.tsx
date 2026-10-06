import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { FileBarChart, Printer } from "lucide-react";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { UsualComparison, type VsUsual } from "@/components/publisher/ArticleInsights";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

function Delta({ now, before }: { now: number; before: number }) {
  if (before <= 0) return null;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return <span className="text-xs text-muted-foreground">مثل الشهر السابق</span>;
  return (
    <span className={change > 0 ? "text-xs font-medium text-emerald-700 dark:text-emerald-300" : "text-xs text-muted-foreground"}>
      {change > 0 ? "+" : ""}
      {formatNumber(change)}% عن الشهر السابق
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

  return (
    <PublisherLayout>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #publisher-report, #publisher-report * { visibility: visible !important; }
        #publisher-report { position: absolute; inset: 0; margin: 0; border: 0; box-shadow: none; }
        .no-print { display: none !important; }
      }`}</style>
      <div className="w-full space-y-6" dir="rtl">
        <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              التقارير الشهرية
            </h1>
            <p className="mt-1 text-muted-foreground">ما نشرتموه في سبق كل شهر، وكيف قُرئ، جاهز للطباعة والحفظ PDF.</p>
          </div>
          <div className="flex gap-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[180px]" data-testid="select-report-month">
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
            <Button variant="outline" className="gap-2" onClick={() => window.print()} data-testid="button-print-report">
              <Printer className="h-4 w-4" />
              طباعة / PDF
            </Button>
          </div>
        </div>

        {isLoading || !data ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : (
          <section
            id="publisher-report"
            className="space-y-6 rounded-2xl border bg-card p-6 shadow-sm"
            data-testid="publisher-report"
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <FileBarChart className="h-3.5 w-3.5" />
                  صحيفة سبق · تقرير الوكالة
                </p>
                <h2 className="mt-1 text-2xl font-bold">
                  {data.agencyName} · {monthLabel(data.month)}
                </h2>
                {inProgress ? <p className="text-xs text-muted-foreground">الشهر لم يكتمل بعد، والأرقام حتى اليوم.</p> : null}
              </div>
              <p className="text-xs text-muted-foreground">أُعد في {formatDateShort(data.generatedAt)}</p>
            </header>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">أخبار منشورة</p>
                <p className="text-3xl font-bold tabular-nums">{formatNumber(data.totals.published)}</p>
                <Delta now={data.totals.published} before={data.previous.published} />
              </div>
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">قراءات أخبار الشهر</p>
                <p className="text-3xl font-bold tabular-nums">{formatNumber(data.totals.views)}</p>
                <Delta now={data.totals.views} before={data.previous.views} />
              </div>
              <div className="rounded-xl bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">متوسط قراءات الخبر</p>
                <p className="text-3xl font-bold tabular-nums">
                  {data.totals.published ? formatNumber(Math.round(data.totals.views / data.totals.published)) : "—"}
                </p>
              </div>
            </div>

            {data.totals.published === 0 ? (
              <p className="rounded-xl border border-dashed py-10 text-center text-muted-foreground">
                لا توجد أخبار منشورة في هذا الشهر.
              </p>
            ) : (
              <>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="font-semibold">حسب القسم</h3>
                    <div className="space-y-2">
                      {categories.map((c) => (
                        <div key={c.name} className="grid grid-cols-[90px_1fr_auto] items-center gap-2 text-sm">
                          <span className="truncate">{c.name}</span>
                          <span className="h-2.5 rounded bg-primary/80" style={{ width: `${(c.published / maxCategory) * 100}%` }} />
                          <span className="tabular-nums text-muted-foreground">
                            {formatNumber(c.published)} · {formatNumber(c.views)} قراءة
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {authors.length > 1 ? (
                    <div className="space-y-3">
                      <h3 className="font-semibold">حسب عضو الفريق</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">العضو</TableHead>
                            <TableHead className="text-right">أخبار</TableHead>
                            <TableHead className="text-right">قراءات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {authors.map((a) => (
                            <TableRow key={a.name}>
                              <TableCell>{a.name}</TableCell>
                              <TableCell className="tabular-nums">{formatNumber(a.published)}</TableCell>
                              <TableCell className="tabular-nums">{formatNumber(a.views)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold">الأعلى قراءة</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8 text-right">#</TableHead>
                        <TableHead className="text-right">الخبر</TableHead>
                        <TableHead className="text-right">القراءات</TableHead>
                        <TableHead className="text-right">مقارنة بالمعتاد</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topArticles.map((a, i) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <Link href={`/dashboard/publisher/articles/${a.id}/report`} className="font-medium hover:underline">
                              {a.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {[a.categoryName, a.publishedAt ? formatDateShort(a.publishedAt) : null].filter(Boolean).join(" · ")}
                            </p>
                          </TableCell>
                          <TableCell className="tabular-nums">{formatNumber(a.views ?? 0)}</TableCell>
                          <TableCell>
                            <UsualComparison value={a.vsUsual} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}

            <p className="border-t pt-3 text-xs text-muted-foreground">
              القراءات هي مجموع قراءات الأخبار المنشورة في الشهر حتى تاريخ إعداد التقرير. «المعتاد» هو وسيط قراءات أخبار سبق في
              القسم نفسه خلال آخر 90 يومًا.
            </p>
          </section>
        )}
      </div>
    </PublisherLayout>
  );
}
