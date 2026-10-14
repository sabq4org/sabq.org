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
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  HeartPulse,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  Brain,
  Sparkles,
  ExternalLink,
  BarChart3,
  Layers,
  FileText,
  Smile,
  Meh,
  Frown,
  Calendar,
} from "lucide-react";
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

interface SentimentInsightsData {
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

function MiniStack({
  positive,
  neutral,
  negative,
  total,
  heightClass = "h-2.5",
}: {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  heightClass?: string;
}) {
  if (total <= 0) return null;
  const posPct = (positive / total) * 100;
  const neuPct = (neutral / total) * 100;
  const negPct = (negative / total) * 100;
  return (
    <div
      className={`flex ${heightClass} w-full min-w-24 overflow-hidden rounded-full bg-muted`}
      dir="rtl"
    >
      {posPct > 0 && (
        <div
          className="transition-all duration-300"
          style={{ width: `${posPct}%`, background: SENTIMENT_COLORS.positive }}
          title={`إيجابي: ${Math.round(posPct)}%`}
        />
      )}
      {neuPct > 0 && (
        <div
          className="transition-all duration-300"
          style={{ width: `${neuPct}%`, background: SENTIMENT_COLORS.neutral }}
          title={`محايد: ${Math.round(neuPct)}%`}
        />
      )}
      {negPct > 0 && (
        <div
          className="transition-all duration-300"
          style={{ width: `${negPct}%`, background: SENTIMENT_COLORS.negative }}
          title={`سلبي: ${Math.round(negPct)}%`}
        />
      )}
    </div>
  );
}

function DominantPill({
  positive,
  neutral,
  negative,
  total,
}: {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}) {
  if (total <= 0) return null;
  const shares = [
    {
      key: "positive",
      value: positive,
      label: "إيجابي",
      cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400",
    },
    {
      key: "neutral",
      value: neutral,
      label: "محايد",
      cls: "bg-slate-500/10 text-slate-700 border-slate-500/20 dark:text-slate-300",
    },
    {
      key: "negative",
      value: negative,
      label: "سلبي",
      cls: "bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-400",
    },
  ].sort((a, b) => b.value - a.value);
  const top = shares[0];
  return (
    <Badge
      variant="outline"
      className={`shrink-0 px-2 py-0.5 text-xs font-semibold tabular-nums ${top.cls}`}
    >
      {top.label} {Math.round((top.value / total) * 100)}%
    </Badge>
  );
}

export default function SentimentInsights() {
  const [days, setDays] = useState(7);

  const {
    data: dataRaw,
    isLoading,
    isError,
    refetch,
  } = useQuery<SentimentInsightsData>({
    queryKey: [`/api/moderation/sentiment-insights?days=${days}`],
  });
  const data = dataRaw ?? null;

  const totalAnalyzed = data?.totals?.analyzed ?? 0;
  const totalPositive = data?.totals?.positive ?? 0;
  const totalNeutral = data?.totals?.neutral ?? 0;
  const totalNegative = data?.totals?.negative ?? 0;
  const netIndex = data?.totals?.netIndex ?? 0;
  const prevNetIndex = data?.totals?.prevNetIndex ?? null;

  const netDelta = prevNetIndex != null ? netIndex - prevNetIndex : null;

  const positivePct = totalAnalyzed > 0 ? Math.round((totalPositive / totalAnalyzed) * 100) : 0;
  const neutralPct = totalAnalyzed > 0 ? Math.round((totalNeutral / totalAnalyzed) * 100) : 0;
  const negativePct = totalAnalyzed > 0 ? Math.round((totalNegative / totalAnalyzed) * 100) : 0;

  const dailyList = Array.isArray(data?.daily) ? data.daily : [];
  const articlesList = Array.isArray(data?.articles) ? data.articles : [];
  const categoriesList = Array.isArray(data?.categories) ? data.categories : [];
  const alertsList = Array.isArray(data?.alerts) ? data.alerts : [];

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={HeartPulse}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span>نبض الجمهور — المشاعر التحريرية</span>
              <Badge
                variant="secondary"
                className="gap-1 border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                <Sparkles className="h-3 w-3" />
                تحليل ذكي
              </Badge>
            </span>
          }
          description="كيف يتفاعل القراء مع المحتوى؟ تحليل مشاعر التعليقات حسب المقال والقسم والفترة الزمنية"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* Segmented Period Filter */}
              <div className="flex items-center gap-1 rounded-xl border border-border/70 bg-muted/60 p-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.days}
                    type="button"
                    onClick={() => setDays(p.days)}
                    data-testid={`period-${p.days}`}
                    className={`no-min-touch-size rounded-lg px-3 py-1 text-xs font-semibold transition-all sm:text-sm ${
                      days === p.days
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => void refetch()}
                title="تحديث البيانات"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>

              <Link href="/dashboard/ai-moderation">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Brain className="h-4 w-4 text-primary" />
                  <span>الرقابة الذكية</span>
                </Button>
              </Link>
            </div>
          }
        />

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          </div>
        ) : isError || !data ? (
          <Card
            className="border-destructive/40 bg-destructive/5"
            data-testid="sentiment-load-error"
          >
            <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-foreground">تعذّر تحميل نبض الجمهور</p>
                  <p className="text-sm text-muted-foreground">
                    تحقق من صلاحية إشراف التعليقات ثم أعد المحاولة.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => void refetch()}
                data-testid="button-retry-sentiment"
              >
                <RefreshCw className="h-4 w-4" />
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Top KPI & Sentiment Breakdown Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {/* 1. Net Sentiment Index */}
              <Card className="col-span-2 border-border/70 bg-card shadow-xs sm:col-span-1">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        مؤشر المشاعر الصافي
                      </p>
                      <div
                        className="mt-1.5 text-2xl font-bold tabular-nums sm:text-3xl"
                        style={{
                          color:
                            netIndex >= 0 ? SENTIMENT_COLORS.positive : SENTIMENT_COLORS.negative,
                        }}
                      >
                        {netIndex > 0 ? `+${netIndex}` : netIndex}
                      </div>
                    </div>
                    <div
                      className={`rounded-lg p-2.5 ${
                        netIndex >= 0
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {netIndex >= 0 ? (
                        <TrendingUp className="h-5 w-5" />
                      ) : (
                        <TrendingDown className="h-5 w-5" />
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground">
                    <span>(إيجابي − سلبي) ÷ الكل</span>
                    {netDelta != null && netDelta !== 0 && (
                      <Badge
                        variant="outline"
                        className={`gap-0.5 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                          netDelta > 0
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {netDelta > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {Math.abs(netDelta)} عن السابق
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 2. Total Analyzed */}
              <Card className="border-border/70 bg-card shadow-xs">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">تعليقات محللة</p>
                      <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
                        {totalAnalyzed}
                      </div>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                      <BarChart3 className="h-5 w-5" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    خلال آخر {days === 1 ? "24 ساعة" : `${days} أيام`} (
                    {Math.max(0, Math.round(totalAnalyzed / Math.max(1, days)))} يومياً)
                  </p>
                </CardContent>
              </Card>

              {/* 3. Positive Breakdown Card */}
              <Card className="border-border/70 bg-card shadow-xs transition-all hover:border-emerald-500/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">إيجابي</p>
                      <div
                        className="mt-1.5 text-2xl font-bold tabular-nums sm:text-3xl"
                        style={{ color: SENTIMENT_COLORS.positive }}
                      >
                        {positivePct}%
                      </div>
                    </div>
                    <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
                      <Smile className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{totalPositive} تعليقاً</span>
                      <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                        نبرة مؤيدة
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${positivePct}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 4. Neutral Breakdown Card */}
              <Card className="border-border/70 bg-card shadow-xs transition-all hover:border-slate-500/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">محايد</p>
                      <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-600 dark:text-slate-300 sm:text-3xl">
                        {neutralPct}%
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-500/10 p-2.5 text-slate-600 dark:text-slate-400">
                      <Meh className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{totalNeutral} تعليقاً</span>
                      <span className="font-medium tabular-nums">نبرة متوازنة</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-slate-400 transition-all"
                        style={{ width: `${neutralPct}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 5. Negative Breakdown Card */}
              <Card className="border-border/70 bg-card shadow-xs transition-all hover:border-rose-500/30">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">سلبي</p>
                      <div
                        className="mt-1.5 text-2xl font-bold tabular-nums sm:text-3xl"
                        style={{ color: SENTIMENT_COLORS.negative }}
                      >
                        {negativePct}%
                      </div>
                    </div>
                    <div className="rounded-lg bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
                      <Frown className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{totalNegative} تعليقاً</span>
                      <span className="font-medium tabular-nums text-rose-600 dark:text-rose-400">
                        نبرة ناقدة
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-rose-500 transition-all"
                        style={{ width: `${negativePct}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Overall Audience Sentiment Bar Strip */}
            {totalAnalyzed > 0 && (
              <Card className="border-border/70 bg-card shadow-xs">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      توزيع المشاعر الكلي خلال الفترة
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      مقارنة مباشرة بين التفاعلات الإيجابية والمحايدة والسلبية على كافة المقالات
                    </p>
                  </div>
                  <div className="w-full space-y-2 sm:max-w-md">
                    <MiniStack
                      positive={totalPositive}
                      neutral={totalNeutral}
                      negative={totalNegative}
                      total={totalAnalyzed}
                      heightClass="h-3"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        إيجابي {positivePct}% ({totalPositive})
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-400">
                        <span className="h-2 w-2 rounded-full bg-slate-400" />
                        محايد {neutralPct}% ({totalNeutral})
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-rose-700 dark:text-rose-400">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        سلبي {negativePct}% ({totalNegative})
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Editorial Shift Alerts */}
            {alertsList.length > 0 && (
              <div className="space-y-2">
                {alertsList.map((alert, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm shadow-2xs ${
                      alert.severity === "warning"
                        ? "border-amber-300/80 bg-amber-50/90 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                        : "border-border bg-muted/40 text-foreground"
                    }`}
                    data-testid={`sentiment-alert-${i}`}
                  >
                    <AlertTriangle
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        alert.severity === "warning"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-primary"
                      }`}
                    />
                    <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{alert.message}</span>
                      <Badge
                        variant="outline"
                        className="px-2 py-0.5 text-[11px] font-semibold"
                      >
                        {alert.severity === "warning" ? "تنبيه تحريري" : "مؤشر"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Daily Sentiment Trend Chart */}
            <Card className="border-border/70 bg-card shadow-xs">
              <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-bold">
                    <Calendar className="h-4 w-4 text-primary" />
                    اتجاه المشاعر اليومي
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    تطور حجم التعليقات المحللة وتصنيفها يوماً بيوم
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-emerald-700 dark:text-emerald-400"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: SENTIMENT_COLORS.positive }}
                    />
                    إيجابي
                  </Badge>
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-slate-500/20 bg-slate-500/10 px-2.5 py-0.5 text-slate-700 dark:text-slate-300"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: SENTIMENT_COLORS.neutral }}
                    />
                    محايد
                  </Badge>
                  <Badge
                    variant="outline"
                    className="gap-1.5 border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-rose-700 dark:text-rose-400"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: SENTIMENT_COLORS.negative }}
                    />
                    سلبي
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {dailyList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <BarChart3 className="mb-2 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                      لا توجد تعليقات محللة في هذه الفترة
                    </p>
                  </div>
                ) : (
                  <div className="h-64 w-full sm:h-72" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={dailyList}
                        margin={{ top: 8, left: 0, right: 0, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="hsl(var(--border))"
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(d: string) => d.slice(5)}
                          reversed
                        />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
                        <Tooltip
                          contentStyle={{
                            direction: "rtl",
                            fontSize: 12,
                            borderRadius: "8px",
                          }}
                          formatter={(value: number, name: string) => [
                            value,
                            name === "positive"
                              ? "إيجابي"
                              : name === "neutral"
                                ? "محايد"
                                : "سلبي",
                          ]}
                        />
                        <Bar dataKey="negative" stackId="s" fill={SENTIMENT_COLORS.negative} />
                        <Bar dataKey="neutral" stackId="s" fill={SENTIMENT_COLORS.neutral} />
                        <Bar
                          dataKey="positive"
                          stackId="s"
                          fill={SENTIMENT_COLORS.positive}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Articles & Categories Breakdown Grid */}
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Articles Needing Editorial Attention */}
              <Card className="border-border/70 bg-card shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base font-bold">
                      <FileText className="h-4 w-4 text-rose-500" />
                      مقالات تستحق انتباه التحرير
                    </CardTitle>
                    <Badge variant="secondary" className="px-2 py-0.5 text-xs tabular-nums">
                      {articlesList.length} مقال
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    الأعلى سلبيةً أولاً — قد تحتاج متابعة أو توضيحاً تحريرياً
                  </p>
                </CardHeader>
                <CardContent>
                  {articlesList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <MessageSquare className="mb-2 h-9 w-9 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        لا توجد مقالات بثلاثة تعليقات محللة أو أكثر في الفترة المحددة
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {articlesList.map((a, idx) => {
                        const posPct = a.total > 0 ? Math.round((a.positive / a.total) * 100) : 0;
                        const neuPct = a.total > 0 ? Math.round((a.neutral / a.total) * 100) : 0;
                        const negPct = a.total > 0 ? Math.round((a.negative / a.total) * 100) : 0;

                        return (
                          <div
                            key={a.articleId}
                            className="rounded-xl border border-border/60 bg-muted/20 p-3.5 transition-colors hover:border-border hover:bg-muted/40"
                            data-testid={`article-row-${a.articleId}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold tabular-nums text-muted-foreground">
                                  {idx + 1}
                                </span>
                                <a
                                  href={
                                    a.slug
                                      ? `/article/${a.slug}`
                                      : `/admin/articles/${a.articleId}`
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="no-min-touch-size group flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-primary"
                                >
                                  <span className="line-clamp-1 group-hover:underline">
                                    {a.title}
                                  </span>
                                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
                                </a>
                              </div>
                              <DominantPill
                                positive={a.positive}
                                neutral={a.neutral}
                                negative={a.negative}
                                total={a.total}
                              />
                            </div>

                            <div className="mt-2.5 space-y-2">
                              <MiniStack
                                positive={a.positive}
                                neutral={a.neutral}
                                negative={a.negative}
                                total={a.total}
                              />
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                <div className="flex flex-wrap items-center gap-3 tabular-nums">
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    إيجابي {posPct}% ({a.positive})
                                  </span>
                                  <span>
                                    محايد {neuPct}% ({a.neutral})
                                  </span>
                                  <span className="font-medium text-rose-600 dark:text-rose-400">
                                    سلبي {negPct}% ({a.negative})
                                  </span>
                                </div>
                                <span className="inline-flex items-center gap-1 font-medium tabular-nums">
                                  <MessageSquare className="h-3 w-3" />
                                  {a.total} تعليق
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Category / Topic Sentiment Breakdown */}
              <Card className="border-border/70 bg-card shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base font-bold">
                      <Layers className="h-4 w-4 text-primary" />
                      المشاعر حسب القسم والموضوع
                    </CardTitle>
                    <Badge variant="secondary" className="px-2 py-0.5 text-xs tabular-nums">
                      {categoriesList.length} أقسام
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    مقارنة نبرة تفاعل الجمهور بين التصنيفات والأبواب التحريرية المختلفة
                  </p>
                </CardHeader>
                <CardContent>
                  {categoriesList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <Layers className="mb-2 h-9 w-9 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        لا توجد بيانات أقسام في الفترة المحددة
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {categoriesList.map((c) => {
                        const posPct = c.total > 0 ? Math.round((c.positive / c.total) * 100) : 0;
                        const neuPct = c.total > 0 ? Math.round((c.neutral / c.total) * 100) : 0;
                        const negPct = c.total > 0 ? Math.round((c.negative / c.total) * 100) : 0;

                        return (
                          <div
                            key={c.name}
                            className="rounded-xl border border-border/60 bg-muted/20 p-3.5 transition-colors hover:border-border hover:bg-muted/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {c.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <DominantPill
                                  positive={c.positive}
                                  neutral={c.neutral}
                                  negative={c.negative}
                                  total={c.total}
                                />
                                <Badge
                                  variant="outline"
                                  className="px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
                                >
                                  {c.total} تعليق
                                </Badge>
                              </div>
                            </div>

                            <div className="mt-2.5 space-y-2">
                              <MiniStack
                                positive={c.positive}
                                neutral={c.neutral}
                                negative={c.negative}
                                total={c.total}
                              />
                              <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums text-muted-foreground">
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  إيجابي {posPct}% ({c.positive})
                                </span>
                                <span>
                                  محايد {neuPct}% ({c.neutral})
                                </span>
                                <span className="text-rose-600 dark:text-rose-400">
                                  سلبي {negPct}% ({c.negative})
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
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
