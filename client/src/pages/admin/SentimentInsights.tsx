/**
 * لوحة المشاعر التحريرية — نبض الجمهور
 *
 * تعرض لرئاسة التحرير كيف يتفاعل القراء مع المحتوى: مؤشر المشاعر الصافي،
 * الاتجاه اليومي، المقالات الأعلى سلبيةً (تستحق متابعة تحريرية)، توزيع
 * الأقسام، وتنبيهات التحولات المفاجئة. تتغذى من عمود current_sentiment
 * الذي يملؤه خط الرقابة الذكية الموحّد.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { HeartPulse, TrendingUp, TrendingDown, AlertTriangle, MessageSquare } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

const SENTIMENT_COLORS = {
  positive: "#16a34a",
  neutral: "#94a3b8",
  negative: "#e11d48",
};

interface SentimentInsights {
  period: { days: number; from: string; to: string };
  totals: {
    analyzed: number;
    positive: number;
    neutral: number;
    negative: number;
    netIndex: number;
    prevNetIndex: number | null;
  };
  daily: { date: string; positive: number; neutral: number; negative: number }[];
  articles: {
    articleId: string;
    title: string;
    slug: string | null;
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    negativeShare: number;
  }[];
  categories: {
    name: string;
    total: number;
    positive: number;
    neutral: number;
    negative: number;
  }[];
  alerts: { message: string; severity: "warning" | "info" }[];
}

const PERIODS = [
  { days: 1, label: "اليوم" },
  { days: 7, label: "7 أيام" },
  { days: 30, label: "30 يوماً" },
  { days: 90, label: "90 يوماً" },
];

function MiniStack({ positive, neutral, negative, total }: { positive: number; neutral: number; negative: number; total: number }) {
  if (total === 0) return null;
  return (
    <div className="flex h-2 w-full min-w-24 overflow-hidden rounded-full bg-muted" dir="rtl">
      <div style={{ width: `${(positive / total) * 100}%`, background: SENTIMENT_COLORS.positive }} />
      <div style={{ width: `${(neutral / total) * 100}%`, background: SENTIMENT_COLORS.neutral }} />
      <div style={{ width: `${(negative / total) * 100}%`, background: SENTIMENT_COLORS.negative }} />
    </div>
  );
}

function DominantPill({ positive, neutral, negative, total }: { positive: number; neutral: number; negative: number; total: number }) {
  if (total === 0) return null;
  const shares = [
    { key: "positive", value: positive, label: "إيجابي", cls: "bg-green-500/10 text-green-600 dark:text-green-400" },
    { key: "neutral", value: neutral, label: "محايد", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
    { key: "negative", value: negative, label: "سلبي", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  ].sort((a, b) => b.value - a.value);
  const top = shares[0];
  return (
    <Badge variant="secondary" className={`border-0 ${top.cls}`}>
      {top.label} {Math.round((top.value / total) * 100)}%
    </Badge>
  );
}

export default function SentimentInsights() {
  const [days, setDays] = useState(7);

  const { data: dataRaw, isLoading } = useQuery<SentimentInsights>({
    queryKey: [`/api/moderation/sentiment-insights?days=${days}`],
  });
  const data = dataRaw ?? null;

  const netDelta =
    data && data.totals.prevNetIndex != null ? data.totals.netIndex - data.totals.prevNetIndex : null;

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <DashboardPageHeader
          icon={HeartPulse}
          title="نبض الجمهور — المشاعر التحريرية"
          description="كيف يتفاعل القراء مع المحتوى؟ تحليل مشاعر التعليقات حسب المقال والقسم والفترة"
          actions={
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <Button
                  key={p.days}
                  size="sm"
                  variant={days === p.days ? "default" : "outline"}
                  onClick={() => setDays(p.days)}
                  data-testid={`period-${p.days}`}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          }
        />

        {isLoading || !data ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : (
          <>
            {/* بطاقات الملخص */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-border/70 bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">مؤشر المشاعر الصافي</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="text-2xl font-bold tabular-nums"
                    style={{ color: data.totals.netIndex >= 0 ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative }}
                  >
                    {data.totals.netIndex > 0 ? `+${data.totals.netIndex}` : data.totals.netIndex}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    (إيجابي − سلبي) ÷ الكل × 100
                    {netDelta != null && netDelta !== 0 && (
                      <span
                        className="flex items-center gap-0.5 font-semibold"
                        style={{ color: netDelta > 0 ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative }}
                      >
                        {netDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {Math.abs(netDelta)} عن الفترة السابقة
                      </span>
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">تعليقات محللة</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">{data.totals.analyzed}</div>
                  <p className="mt-1 text-xs text-muted-foreground">خلال الفترة المحددة</p>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">إيجابي</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums" style={{ color: SENTIMENT_COLORS.positive }}>
                    {data.totals.analyzed ? Math.round((data.totals.positive / data.totals.analyzed) * 100) : 0}%
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{data.totals.positive} تعليقاً</p>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">سلبي</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums" style={{ color: SENTIMENT_COLORS.negative }}>
                    {data.totals.analyzed ? Math.round((data.totals.negative / data.totals.analyzed) * 100) : 0}%
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{data.totals.negative} تعليقاً</p>
                </CardContent>
              </Card>
            </div>

            {/* تنبيهات التحولات */}
            {data.alerts.length > 0 && (
              <div className="space-y-2">
                {data.alerts.map((alert, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                      alert.severity === "warning"
                        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                        : "border-border bg-muted/40"
                    }`}
                    data-testid={`sentiment-alert-${i}`}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{alert.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* الاتجاه اليومي */}
            <Card className="border-border/70 bg-card">
              <CardHeader>
                <CardTitle className="text-base">اتجاه المشاعر اليومي</CardTitle>
              </CardHeader>
              <CardContent>
                {data.daily.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">لا توجد تعليقات محللة في هذه الفترة</p>
                ) : (
                  <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.daily} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(d: string) => d.slice(5)}
                          reversed
                        />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} />
                        <Tooltip
                          contentStyle={{ direction: "rtl", fontSize: 12 }}
                          formatter={(value: number, name: string) => [
                            value,
                            name === "positive" ? "إيجابي" : name === "neutral" ? "محايد" : "سلبي",
                          ]}
                        />
                        <Bar dataKey="negative" stackId="s" fill={SENTIMENT_COLORS.negative} />
                        <Bar dataKey="neutral" stackId="s" fill={SENTIMENT_COLORS.neutral} />
                        <Bar dataKey="positive" stackId="s" fill={SENTIMENT_COLORS.positive} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: SENTIMENT_COLORS.positive }} />إيجابي</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: SENTIMENT_COLORS.neutral }} />محايد</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: SENTIMENT_COLORS.negative }} />سلبي</span>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* مقالات تستحق الانتباه */}
              <Card className="border-border/70 bg-card">
                <CardHeader>
                  <CardTitle className="text-base">مقالات تستحق انتباه التحرير</CardTitle>
                  <p className="text-xs text-muted-foreground">الأعلى سلبيةً أولاً — قد تحتاج متابعة أو رداً تحريرياً</p>
                </CardHeader>
                <CardContent>
                  {data.articles.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      لا توجد مقالات بثلاثة تعليقات محللة أو أكثر في الفترة
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {data.articles.map((a) => (
                        <div key={a.articleId} className="flex items-center gap-3" data-testid={`article-row-${a.articleId}`}>
                          <div className="min-w-0 flex-1">
                            <a
                              href={a.slug ? `/article/${a.slug}` : `/admin/articles/${a.articleId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate text-sm hover:text-primary hover:underline"
                            >
                              {a.title}
                            </a>
                            <div className="mt-1 flex items-center gap-2">
                              <MiniStack positive={a.positive} neutral={a.neutral} negative={a.negative} total={a.total} />
                              <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                                <MessageSquare className="h-3 w-3" />
                                {a.total}
                              </span>
                            </div>
                          </div>
                          <DominantPill positive={a.positive} neutral={a.neutral} negative={a.negative} total={a.total} />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* المشاعر حسب القسم */}
              <Card className="border-border/70 bg-card">
                <CardHeader>
                  <CardTitle className="text-base">المشاعر حسب القسم</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.categories.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">لا توجد بيانات أقسام في الفترة</p>
                  ) : (
                    <div className="space-y-3">
                      {data.categories.map((c) => (
                        <div key={c.name} className="grid grid-cols-[80px_1fr_44px] items-center gap-3 text-sm">
                          <span className="truncate">{c.name}</span>
                          <MiniStack positive={c.positive} neutral={c.neutral} negative={c.negative} total={c.total} />
                          <span className="text-left text-xs tabular-nums text-muted-foreground">{c.total}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
