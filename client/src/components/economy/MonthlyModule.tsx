/**
 * وحدة «السعوديون في شهر» — النشرة الإحصائية الشهرية للقارئ العادي:
 * بطاقات بعناوين صحفية مع رسم 13 شهرًا لكل بطاقة، ومؤشرات دائمة تتراكم شهرًا بعد شهر.
 * تُغذّى من /api/economy/monthly-story.
 */
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtCount, fmtSar, isFresh, trimNum } from "./format";
import { NewBadge } from "./NewBadge";
import type { MonthlyCard, MonthlyStory, SeriesPoint } from "./types";

const MONTHS_SHORT = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];
function periodLabel(p: string): string {
  const q = p.match(/^(\d{4})-Q([1-4])$/);
  if (q) return `ر${q[2]} ${q[1].slice(2)}`;
  const [y, m] = p.split("-");
  return `${MONTHS_SHORT[Number(m) - 1] ?? m} ${y.slice(2)}`;
}
function fmtUnit(v: number, unit: MonthlyCard["unit"]): string {
  if (unit === "sar") return `${fmtSar(v)} ريال`;
  if (unit === "count") return v < 1e6 ? Math.round(v).toLocaleString("en-US") : fmtCount(v);
  if (unit === "pct") return `${trimNum(v, 1)}%`;
  return trimNum(v, 1);
}

function MiniArea({ series, unit, color = "hsl(var(--primary))", height = 96 }: { series: SeriesPoint[]; unit: MonthlyCard["unit"]; color?: string; height?: number }) {
  if (!series || series.length < 2) return null;
  // RTL: الأقدم يمينًا
  const data = [...series].reverse().map((p) => ({ p: periodLabel(p.period), v: p.value }));
  const id = `mfill-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div style={{ height }} className="mt-2 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient>
          </defs>
          <XAxis dataKey="p" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11, direction: "rtl" }} formatter={(v) => [fmtUnit(Number(v), unit), ""]} />
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyCardView({ c, compact = false }: { c: MonthlyCard; compact?: boolean }) {
  const tone = c.tone === "up" ? "text-emerald-700 dark:text-emerald-300" : c.tone === "down" ? "text-red-700 dark:text-red-300" : "text-foreground";
  const stroke = c.tone === "up" ? "#1a7f56" : c.tone === "down" ? "#d24a26" : "hsl(var(--primary))";
  return (
    <article className={cn("rounded-xl border border-card-border bg-card p-4 border-t-[3px]", c.tone === "up" ? "border-t-emerald-500" : c.tone === "down" ? "border-t-red-500" : "border-t-primary")} data-testid={`economy-monthly-card-${c.key}`}>
      <div className="text-[11px] text-muted-foreground">{c.cardTitle}</div>
      <h4 className={cn("mt-1 font-bold leading-snug", compact ? "text-[14px]" : "text-[15px] sm:text-base")}>{c.headline}</h4>
      <div className={cn("mt-2 font-extrabold tabular-nums", compact ? "text-xl" : "text-2xl", tone)}>{c.figure}</div>
      <div className="mt-1 text-xs text-muted-foreground">{c.detailAr}</div>
      {!compact && c.series?.length > 1 && (
        <>
          <MiniArea series={c.series} unit={c.unit} color={stroke} />
          <div className="mt-1 text-[10px] text-muted-foreground">{c.seriesLabelAr}</div>
        </>
      )}
    </article>
  );
}

export function MonthlyModule({ className }: { className?: string }) {
  const { data, isLoading } = useQuery<MonthlyStory | null>({ queryKey: ["/api/economy/monthly-story"], staleTime: 10 * 60_000 });
  if (isLoading) return <Skeleton className={cn("h-72 w-full rounded-xl", className)} />;
  if (!data) return null;

  return (
    <section className={cn("space-y-6", className)} aria-label={`السعوديون في ${data.monthLabelAr}`} data-testid="economy-monthly-module">
      <div className="rounded-xl border border-card-border bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-primary tracking-wide">
          السعوديون في {data.monthLabelAr} · النشرة الإحصائية الشهرية{isFresh(data.ingestedAt) && <NewBadge label="نشرة جديدة" />}
        </div>
        <h2 className="mt-1 w-full text-xl sm:text-2xl font-bold leading-snug text-foreground">{data.lead.headline}</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-prose">{data.lead.intro}</p>
        <div className="mt-3 text-[11px] text-muted-foreground">المصدر: البنك المركزي السعودي — النشرة الإحصائية الشهرية، {data.monthLabelAr}</div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.cards.map((c) => <MonthlyCardView key={c.key} c={c} />)}
      </div>

      {data.trackers?.length > 0 && (
        <div>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold">مؤشرات تتراكم شهرًا بعد شهر</h3>
              <p className="text-xs text-muted-foreground mt-0.5">آخر 13 شهرًا — تُحدَّث تلقائيًا مع كل نشرة.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.trackers.map((t) => {
              const last = t.series.at(-1);
              return (
                <div key={t.key} className="rounded-xl border border-card-border bg-card p-3.5">
                  <div className="text-[11px] text-muted-foreground">{t.titleAr}</div>
                  <div className="mt-0.5 text-lg font-bold tabular-nums">{last ? fmtUnit(last.value, t.unit) : "—"}</div>
                  <MiniArea series={t.series} unit={t.unit} height={80} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
