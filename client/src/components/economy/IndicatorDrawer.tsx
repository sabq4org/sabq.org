/**
 * لوحة جانبية بالرسم التاريخي لمؤشر/عملة/إنفاق أسبوعي — تُفتح من بطاقة الشريط.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtDateAr, fmtRate, fmtSar, trimNum } from "./format";
import type { EconomySnapshot } from "./types";

export interface DrawerTarget {
  kind: "indicator" | "fx" | "weekly";
  key: string;
  titleAr: string;
  unit: string;
}

interface Point { date: string; value: number; label?: string }

const RANGES = [
  { id: "3m", label: "3 أشهر", days: 92 },
  { id: "1y", label: "سنة", days: 366 },
  { id: "3y", label: "3 سنوات", days: 1100 },
  { id: "all", label: "الكل", days: 36500 },
] as const;

function stepSeries(points: Point[]): Point[] {
  // المؤشرات ذات القرارات (الريبو) خط درجي: نضيف نقطة "اليوم" بآخر قيمة ليمتد الخط
  if (!points.length) return points;
  const last = points[points.length - 1];
  const today = new Date().toISOString().slice(0, 10);
  return last.date < today ? [...points, { date: today, value: last.value }] : points;
}

export function IndicatorDrawer({ target, onClose, snapshot }: { target: DrawerTarget | null; onClose: () => void; snapshot: EconomySnapshot }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("1y");
  const days = RANGES.find((r) => r.id === range)?.days ?? 366;

  const seriesQ = useQuery<{ points: Point[] }>({
    queryKey: ["/api/economy/series", target?.key ?? ""],
    enabled: target?.kind === "indicator",
    staleTime: 60 * 60_000,
  });
  const fxQ = useQuery<{ points: { date: string; rate: number }[] }>({
    queryKey: ["/api/economy/fx", target?.key ?? "", "history", { days: Math.min(days, 3650) }],
    enabled: target?.kind === "fx",
    staleTime: 30 * 60_000,
  });

  const points = useMemo<Point[]>(() => {
    if (!target) return [];
    if (target.kind === "indicator") return stepSeries(seriesQ.data?.points ?? []);
    if (target.kind === "fx") return (fxQ.data?.points ?? []).map((p) => ({ date: p.date, value: p.rate }));
    const w = snapshot.weekly;
    if (!w) return [];
    const k = w.kpis.find((x) => x.key === "total");
    return (k?.series ?? []).map((v, i) => ({ date: `الأسبوع ${i + 1}`, value: v }));
  }, [target, seriesQ.data, fxQ.data, snapshot.weekly]);

  const shown = useMemo(() => {
    if (!target || target.kind === "weekly") return points;
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
    const f = points.filter((p) => p.date >= cutoff);
    return f.length >= 2 ? f : points.slice(-2);
  }, [points, days, target]);

  const loading = target?.kind === "indicator" ? seriesQ.isLoading : target?.kind === "fx" ? fxQ.isLoading : false;
  const fmtVal = (v: number) => (target?.kind === "weekly" ? `${fmtSar(v)} ريال` : target?.kind === "fx" ? `${fmtRate(v)} ريال` : `${trimNum(v, 2)}%`);
  const last = shown[shown.length - 1], first = shown[0];
  const stepType = target?.kind === "indicator" && (target.key === "repo" || target.key === "reverseRepo") ? "stepAfter" : "monotone";

  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
        {target && (
          <>
            <SheetHeader className="text-right">
              <SheetTitle className="text-lg">{target.titleAr}</SheetTitle>
              <SheetDescription>المصدر: البنك المركزي السعودي · الرسم يُحدَّث آليًا</SheetDescription>
            </SheetHeader>

            {last && (
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <div className="text-3xl font-bold tabular-nums">{fmtVal(last.value)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{target.kind === "weekly" ? "آخر أسبوع" : `آخر بيان ${fmtDateAr(last.date)}`}</div>
                </div>
                {first && first !== last && (
                  <div className="text-xs text-muted-foreground text-left" dir="ltr">
                    {fmtVal(first.value)} → {fmtVal(last.value)}
                  </div>
                )}
              </div>
            )}

            {target.kind !== "weekly" && (
              <div className="mt-3 inline-flex rounded-md border border-border overflow-hidden text-xs" role="group" aria-label="المدى الزمني">
                {RANGES.map((r) => (
                  <button key={r.id} type="button" onClick={() => setRange(r.id)} aria-pressed={range === r.id}
                    className={cn("px-3 py-1.5 transition-colors", range === r.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent")}>
                    {r.label}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 h-64">
              {loading ? (
                <Skeleton className="h-full w-full rounded-md" />
              ) : shown.length < 2 ? (
                <div className="h-full grid place-items-center text-sm text-muted-foreground">لا تتوفر سلسلة كافية للرسم</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={shown} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="econFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="2 4" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(d: string) => (d.startsWith("الأسبوع") ? d : fmtDateAr(d, false))} minTickGap={28} axisLine={false} tickLine={false} reversed />
                    <YAxis orientation="right" width={52} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} domain={["auto", "auto"]} axisLine={false} tickLine={false} tickFormatter={(v: number) => (target.kind === "weekly" ? `${trimNum(v / 1e9, 1)}B` : trimNum(v, 2))} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, direction: "rtl" }}
                      labelFormatter={(d) => (String(d).startsWith("الأسبوع") ? String(d) : fmtDateAr(String(d)))}
                      formatter={(v) => [fmtVal(Number(v)), target.titleAr]}
                    />
                    <Area type={stepType} dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#econFill)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {target.kind === "indicator" && shown.length > 1 && (
              <ul className="mt-4 divide-y divide-border text-sm max-h-56 overflow-y-auto rounded-md border border-border">
                {[...(seriesQ.data?.points ?? [])].reverse().slice(0, 12).map((p, i) => (
                  <li key={`${p.date}-${i}`} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-muted-foreground text-xs">{p.label || fmtDateAr(p.date)}</span>
                    <span className="tabular-nums font-semibold">{fmtVal(p.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
