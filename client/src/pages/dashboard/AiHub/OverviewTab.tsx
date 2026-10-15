// AI Hub — Overview tab: live provider strip, KPI tiles with sparklines,
// daily-cost chart with burn-rate projection, provider donut, top features,
// and the recent incidents feed.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownLeft, ArrowUpLeft, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ACCENT,
  formatInt,
  formatMs,
  formatTokens,
  formatUsd,
  HEALTH_META,
  PROJECTION,
  providerColor,
  providerName,
  STATUS_META,
  useIsDark,
  type DistributionPayload,
  type LogRow,
  type OverviewStats,
  type SeriesPoint,
} from "./shared";

const PERIODS = [
  { days: 30, label: "30 يومًا" },
  { days: 60, label: "60 يومًا" },
  { days: 90, label: "90 يومًا" },
];

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
        up
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      {up ? <ArrowUpLeft className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
      {Math.abs(pct).toFixed(0)}% عن أمس
    </span>
  );
}

function Sparkline({ data, dataKey, color }: { data: Array<Record<string, unknown>>; dataKey: string; color: string }) {
  if (data.length < 2) return null;
  return (
    <div className="h-9 mt-2 -mx-1" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  spark,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  spark?: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4 pb-3">
        <div className="text-xs font-semibold text-muted-foreground mb-1.5">{label}</div>
        <div className="text-2xl font-extrabold tabular-nums" dir="ltr" style={{ textAlign: "right" }}>
          {value}
        </div>
        {sub && <div className="mt-1.5">{sub}</div>}
        {spark}
      </CardContent>
    </Card>
  );
}

export default function OverviewTab() {
  const isDark = useIsDark();
  const [days, setDays] = useState(30);

  const { data: overview, isPending, isFetching, isError, refetch } = useQuery<OverviewStats>({
    queryKey: ["/api/admin/ai-hub/overview"],
    refetchInterval: 30_000,
  });
  const { data: seriesRaw } = useQuery<SeriesPoint[]>({
    queryKey: [`/api/admin/ai-hub/series?days=${days}`],
  });
  const { data: distribution } = useQuery<DistributionPayload>({
    queryKey: ["/api/admin/ai-hub/distribution?days=30"],
  });
  const { data: incidentsRaw } = useQuery<LogRow[]>({
    queryKey: ["/api/admin/ai-hub/incidents"],
    refetchInterval: 60_000,
  });

  const series = Array.isArray(seriesRaw) ? seriesRaw : [];
  const incidents = Array.isArray(incidentsRaw) ? incidentsRaw : [];
  const providerDist = Array.isArray(distribution?.providers) ? distribution!.providers : [];
  const topFeatures = Array.isArray(distribution?.features) ? distribution!.features : [];

  const accent = isDark ? ACCENT.dark : ACCENT.light;
  const projectionColor = isDark ? PROJECTION.dark : PROJECTION.light;

  // Daily-cost chart + flat dashed projection at the current average daily burn.
  const chartData = useMemo(() => {
    if (!series.length) return [];
    const avgDaily =
      overview && new Date().getDate() > 0 ? overview.month.costUsd / new Date().getDate() : null;
    const points: Array<{ date: string; actual?: number; projected?: number }> = series.map((p) => ({
      date: p.date,
      actual: p.costUsd,
    }));
    if (avgDaily !== null && points.length > 0) {
      points[points.length - 1].projected = points[points.length - 1].actual;
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let d = now.getDate() + 1; d <= daysInMonth; d++) {
        const dt = new Date(now.getFullYear(), now.getMonth(), d);
        points.push({ date: dt.toISOString().slice(0, 10), projected: avgDaily });
      }
    }
    return points;
  }, [series, overview]);

  const sparkData = series.slice(-14).map((p) => ({ c: p.costUsd, r: p.requests }));
  const totalDist = providerDist.reduce((sum, p) => sum + p.costUsd, 0);
  const maxFeatureCost = topFeatures[0]?.costUsd || 1;
  const budgetPct =
    overview?.month.budgetUsd && overview.month.budgetUsd > 0
      ? Math.min((overview.month.costUsd / overview.month.budgetUsd) * 100, 100)
      : null;

  if (!overview && !isPending) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="py-10 text-center space-y-3" role="alert">
          <p className="font-semibold">تعذر تحميل بيانات مركز الذكاء الاصطناعي</p>
          <p className="text-sm text-muted-foreground">لم تصل بيانات النظرة العامة. أعد المحاولة، وإذا استمرت المشكلة فتواصل مع مسؤول النظام.</p>
          <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? "جارٍ إعادة المحاولة…" : "إعادة المحاولة"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!overview) {
    return (
      <div className="space-y-4" data-testid="ai-hub-overview-loading">
        <Skeleton className="h-14 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm">
          <span>تعذر تحديث البيانات؛ المعروض هو آخر بيانات تم تحميلها.</span>
          <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>إعادة المحاولة</Button>
        </div>
      )}
      {/* Provider status strip */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3.5 flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold text-muted-foreground ms-1">حالة المزودين</span>
          {Object.entries(overview.providers).map(([key, p]) => {
            const meta = HEALTH_META[p.status] ?? HEALTH_META.healthy;
            return (
              <Badge key={key} variant="outline" className={`gap-1.5 px-3 py-1.5 rounded-full font-semibold ${meta.className}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: providerColor(key, isDark) }} />
                {providerName(key)} · {meta.label}
                {p.p95LatencyMs > 0 && (
                  <span className="opacity-70 tabular-nums" dir="ltr">
                    p95 {formatMs(p.p95LatencyMs)}
                  </span>
                )}
              </Badge>
            );
          })}
          <span className="text-[11px] text-muted-foreground me-1 ms-auto">يتحدث تلقائيًا كل 30 ثانية</span>
        </CardContent>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="تكلفة اليوم"
          value={formatUsd(overview.today.costUsd)}
          sub={<DeltaBadge current={overview.today.costUsd} previous={overview.yesterdaySameWindow.costUsd} />}
          spark={<Sparkline data={sparkData} dataKey="c" color="#059669" />}
        />
        <KpiCard
          label="تكلفة الشهر"
          value={formatUsd(overview.month.costUsd)}
          sub={
            budgetPct !== null ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                {budgetPct.toFixed(0)}% من ميزانية {formatUsd(overview.month.budgetUsd!)}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">لا توجد ميزانية محددة</span>
            )
          }
          spark={<Sparkline data={sparkData} dataKey="c" color={accent} />}
        />
        <KpiCard
          label="طلبات اليوم"
          value={formatInt(overview.today.requests)}
          sub={<DeltaBadge current={overview.today.requests} previous={overview.yesterdaySameWindow.requests} />}
          spark={<Sparkline data={sparkData} dataKey="r" color={accent} />}
        />
        <KpiCard
          label="معدل النجاح (24س)"
          value={`${overview.last24h.successRate.toFixed(1)}%`}
          sub={
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {formatInt(overview.last24h.fallback)} تحويل · {formatInt(overview.last24h.failed)} فشل
            </span>
          }
        />
        <KpiCard
          label="زمن الاستجابة (24س)"
          value={
            <>
              {formatMs(overview.last24h.p50LatencyMs)} <span className="text-sm font-semibold text-muted-foreground">p50</span>
            </>
          }
          sub={
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <Timer className="w-3 h-3" />
              p95: {formatMs(overview.last24h.p95LatencyMs)}
            </span>
          }
        />
      </div>

      {/* Cost chart + provider donut */}
      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">التكلفة اليومية</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                الخط المتقطع: متوسط الحرق اليومي حتى نهاية الشهر — التوقّع الإجمالي{" "}
                <b style={{ color: projectionColor }}>{formatUsd(overview.month.projectedCostUsd)}</b>
              </p>
            </div>
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => setDays(p.days)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                    days === p.days ? "bg-background shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="aihub-cost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#ffffff14" : "#00000010"} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: isDark ? "#94a3b8" : "#6b7280" }}
                    tickFormatter={(v: string) => format(new Date(v), "d MMM", { locale: ar })}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: isDark ? "#94a3b8" : "#6b7280" }}
                    tickFormatter={(v: number) => `$${v}`}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{
                      background: isDark ? "#1e293b" : "#111827",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 12,
                      direction: "rtl",
                    }}
                    labelStyle={{ color: "#9ca3af" }}
                    itemStyle={{ color: "#fff" }}
                    labelFormatter={(v: string) => format(new Date(v), "EEEE d MMMM", { locale: ar })}
                    formatter={(value: number, name: string) => [
                      formatUsd(value),
                      name === "actual" ? "التكلفة الفعلية" : "المتوقع",
                    ]}
                  />
                  <Area type="monotone" dataKey="actual" stroke={accent} strokeWidth={2.2} fill="url(#aihub-cost)" isAnimationActive={false} />
                  <Line
                    type="monotone"
                    dataKey="projected"
                    stroke={projectionColor}
                    strokeWidth={2}
                    strokeDasharray="6 5"
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: accent }} />
                التكلفة الفعلية
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: projectionColor }} />
                التوقّع
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-0">
            <CardTitle className="text-base">التوزيع حسب المزود</CardTitle>
            <p className="text-xs text-muted-foreground">تكلفة آخر 30 يومًا</p>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="flex items-center gap-4">
              <div className="w-[130px] h-[130px] relative shrink-0" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={providerDist.length ? providerDist : [{ provider: "none", costUsd: 1 }]}
                      dataKey="costUsd"
                      nameKey="provider"
                      innerRadius={42}
                      outerRadius={60}
                      paddingAngle={2}
                      isAnimationActive={false}
                      stroke="transparent"
                    >
                      {(providerDist.length ? providerDist : [{ provider: "none", costUsd: 1 }]).map((entry) => (
                        <Cell
                          key={entry.provider}
                          fill={entry.provider === "none" ? (isDark ? "#334155" : "#e5e7eb") : providerColor(entry.provider, isDark)}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: isDark ? "#1e293b" : "#111827", border: "none", borderRadius: 8, fontSize: 12 }}
                      itemStyle={{ color: "#fff" }}
                      formatter={(value: number, name: string) => [formatUsd(value), providerName(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-extrabold tabular-nums">{formatUsd(totalDist)}</span>
                  <span className="text-[10px] text-muted-foreground">آخر 30 يومًا</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {providerDist.map((p) => (
                  <div key={p.provider} className="flex items-center gap-2 text-xs">
                    <i className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: providerColor(p.provider, isDark) }} />
                    <span className="font-medium">{providerName(p.provider)}</span>
                    <span className="ms-auto font-bold tabular-nums">
                      {totalDist > 0 ? `${((p.costUsd / totalDist) * 100).toFixed(0)}%` : "—"}
                    </span>
                    <span className="text-muted-foreground tabular-nums w-14 text-left" dir="ltr">
                      {formatUsd(p.costUsd)}
                    </span>
                  </div>
                ))}
                {providerDist.length === 0 && <p className="text-xs text-muted-foreground">لا بيانات بعد — تتجمع مع أول استدعاء</p>}
              </div>
            </div>

            <div className="border-t mt-4 pt-3.5">
              <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                <span>استهلاك التوكنز اليوم</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-muted/60 rounded-xl px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">إدخال</div>
                  <div className="font-extrabold tabular-nums">{formatTokens(overview.today.inputTokens)}</div>
                </div>
                <div className="bg-muted/60 rounded-xl px-3 py-2">
                  <div className="text-[10px] text-muted-foreground">إخراج</div>
                  <div className="font-extrabold tabular-nums">{formatTokens(overview.today.outputTokens)}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top features + incidents */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">أعلى 10 ميزات استهلاكًا</CardTitle>
            <p className="text-xs text-muted-foreground">تكلفة آخر 30 يومًا بالدولار</p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {topFeatures.map((f) => (
              <div key={f.featureKey} className="grid grid-cols-[140px_1fr_56px] items-center gap-2.5 text-xs">
                <span className="truncate font-medium" title={f.displayName}>
                  {f.displayName}
                </span>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden" dir="ltr">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max((f.costUsd / maxFeatureCost) * 100, 2)}%`,
                      background: `linear-gradient(90deg, ${accent}99, ${accent})`,
                    }}
                  />
                </div>
                <span className="font-bold tabular-nums text-left" dir="ltr">
                  {formatUsd(f.costUsd)}
                </span>
              </div>
            ))}
            {topFeatures.length === 0 && <p className="text-xs text-muted-foreground py-4">لا بيانات استهلاك بعد</p>}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">آخر الحوادث والتحويلات</CardTitle>
            <p className="text-xs text-muted-foreground">استدعاءات لم تُخدم من نموذجها الأساسي</p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right text-xs">الوقت</TableHead>
                  <TableHead className="text-right text-xs">الحالة</TableHead>
                  <TableHead className="text-right text-xs">الميزة</TableHead>
                  <TableHead className="text-right text-xs">النموذج</TableHead>
                  <TableHead className="text-right text-xs">الخطأ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.slice(0, 8).map((row) => {
                  const meta = STATUS_META[row.status] ?? STATUS_META.failed;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs whitespace-nowrap tabular-nums">
                        {format(new Date(row.createdAt), "d MMM HH:mm", { locale: ar })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{row.featureKey}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        <span dir="ltr">{row.provider}/{row.modelId}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span dir="ltr">{row.errorCode ?? "—"}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {incidents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">
                      لا حوادث — كل الاستدعاءات تُخدم من نماذجها الأساسية ✓
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground text-center pt-1">
        التجميع اليومي 03:20 فجرًا · السجل الخام يُحتفظ به 90 يومًا ثم يُجمَّع
      </p>
    </div>
  );
}
