/**
 * وحدة «إنفاق السعوديين هذا الأسبوع» — تقرير نقاط البيع كوحدة تفاعلية لا خبرًا واحدًا:
 * مؤشرات، أرقام الأسبوع (عناوين صحفية)، القطاعات بثلاثة مقاييس، توزيع المدن ببحث وترتيب،
 * الصاعدون/الهابطون، ومسار 4 أسابيع. تُغذّى من /api/economy/weekly-story.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChangeChip } from "./ChangeChip";
import { Sparkline } from "./Sparkline";
import { fmtCount, fmtPct, fmtSar, trimNum } from "./format";
import type { WeeklySpendingStory } from "./types";

type SectorMetric = "value" | "count" | "change";
type CitySort = "value" | "change" | "avg";

const SHARE_COLORS = ["hsl(var(--primary))", "hsl(var(--primary) / 0.8)", "hsl(var(--primary) / 0.62)", "hsl(var(--primary) / 0.46)", "hsl(var(--primary) / 0.34)", "hsl(var(--primary) / 0.24)"];

function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) {
  return (
    <div className="inline-flex rounded-md border border-border overflow-hidden text-xs bg-card" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          className={cn("px-3 py-1.5 transition-colors", value === o.id ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:bg-accent")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SectionHead({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
      <div>
        <h3 className="text-base sm:text-lg font-bold text-foreground">{title}</h3>
        {desc && <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function WeeklySpendingModule({ className }: { className?: string }) {
  const { data, isLoading } = useQuery<WeeklySpendingStory | null>({ queryKey: ["/api/economy/weekly-story"], staleTime: 5 * 60_000 });
  const [metric, setMetric] = useState<SectorMetric>("value");
  const [citySort, setCitySort] = useState<CitySort>("value");
  const [q, setQ] = useState("");
  const [selectedSector, setSelectedSector] = useState<string | null>(null);

  const cities = useMemo(() => {
    if (!data) return [];
    const key = (c: WeeklySpendingStory["cities"][number]) => (citySort === "value" ? c.value : citySort === "change" ? c.changePct : c.avgTicket);
    let rows = [...data.cities].sort((a, b) => key(b) - key(a));
    const needle = q.trim();
    if (needle) rows = rows.filter((c) => c.ar.includes(needle) || c.en.toLowerCase().includes(needle.toLowerCase()));
    return rows;
  }, [data, citySort, q]);

  if (isLoading) return <Skeleton className={cn("h-72 w-full rounded-xl", className)} />;
  if (!data) return null;

  const leaves = data.sectors.filter((s) => !s.isGroup);
  const sectorVal = (s: (typeof data.sectors)[number]) => (metric === "value" ? s.value : metric === "count" ? s.count : s.changePct);
  const sectorMax = Math.max(...leaves.map((s) => Math.abs(sectorVal(s))), 1);
  const cityMax = Math.max(...cities.map((c) => Math.abs(citySort === "value" ? c.value : citySort === "change" ? c.changePct : c.avgTicket)), 1);
  const selected = selectedSector ? data.sectors.find((s) => s.en === selectedSector) : null;
  // الزمن في RTL يجري من اليمين إلى اليسار: الأقدم يمينًا — فنعكس الترتيب بدل reversed
  const trend = (selected ?? { series: data.totals.series }).series.map((v, i) => ({ w: data.weeks[i] ?? `الأسبوع ${i + 1}`, v })).reverse();
  const kpiUp = (k: WeeklySpendingStory["kpis"][number]) => (k.changePct ?? 0) >= 0;

  return (
    <section className={cn("space-y-8", className)} aria-label="إنفاق السعوديين هذا الأسبوع" data-testid="economy-weekly-module">
      {/* العنوان الرئيسي */}
      <div className="rounded-xl border border-card-border bg-card p-4 sm:p-5">
        <div className="text-[11px] font-semibold text-primary tracking-wide">إنفاق الأسبوع · نقاط البيع</div>
        <h2 className="mt-1 w-full text-xl sm:text-2xl font-bold leading-snug text-foreground">{data.lead.headline}</h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-prose">{data.lead.intro}</p>
        <div className="mt-3 text-[11px] text-muted-foreground">الأسبوع {data.weekLabelAr} · المصدر: البنك المركزي السعودي — تقرير عمليات نقاط البيع الأسبوعي</div>
      </div>

      {/* المؤشرات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.kpis.map((k) => (
          <div key={k.key} className="relative rounded-lg border border-card-border bg-card p-3.5 overflow-hidden">
            <div className="text-[11px] text-muted-foreground">{k.labelAr}</div>
            <div className="mt-0.5 text-xl sm:text-2xl font-bold tabular-nums leading-tight">
              {k.key === "total" ? fmtSar(k.value) : k.key === "count" ? fmtCount(k.value) : k.key === "avgTicket" ? trimNum(k.value, 1) : <span dir="ltr">{k.value > 0 ? "+" : ""}{trimNum(k.value, 1)}%</span>}
              {k.key !== "vs4w" && <span className="text-xs font-medium text-muted-foreground mr-1">{k.unitAr}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              {k.changePct !== null && <ChangeChip value={k.changePct} />}
              {k.noteAr && <span className="truncate">{k.noteAr}</span>}
            </div>
            {k.key !== "vs4w" && (
              <Sparkline values={k.series} className={cn("absolute left-2 bottom-2 hidden sm:block", kpiUp(k) ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")} />
            )}
          </div>
        ))}
      </div>

      {/* أرقام الأسبوع */}
      <div>
        <SectionHead title="أرقام الأسبوع" desc="قصص يستخرجها النظام من الجدولين تلقائيًا — كل بطاقة عنوان خبر جاهز." />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.stories.slice(0, 6).map((s) => (
            <article key={s.key} className={cn("rounded-lg border border-card-border bg-card p-3.5 border-t-[3px]", s.tone === "up" ? "border-t-emerald-500" : s.tone === "down" ? "border-t-red-500" : "border-t-primary")}>
              <div className="text-[11px] text-muted-foreground">{s.cardTitle}</div>
              <h4 className="mt-1 font-bold leading-snug text-[15px] [text-wrap:balance]">{s.headline}</h4>
              <div className={cn("mt-1.5 text-lg font-bold tabular-nums", s.tone === "up" ? "text-emerald-700 dark:text-emerald-300" : s.tone === "down" ? "text-red-700 dark:text-red-300" : "text-foreground")} dir="ltr">{s.figure}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.detailAr}</div>
            </article>
          ))}
        </div>
      </div>

      {/* القطاعات */}
      <div>
        <SectionHead title="أين ذهب الإنفاق؟ — القطاعات" desc="القطاعات الرئيسية بخط داكن وفروعها تحتها. اضغط أي قطاع لرؤية مساره في أربعة أسابيع.">
          <Seg value={metric} onChange={setMetric} label="مقياس القطاعات" options={[{ id: "value", label: "قيمة الإنفاق" }, { id: "count", label: "عدد العمليات" }, { id: "change", label: "التغير الأسبوعي" }]} />
        </SectionHead>
        <div className="rounded-xl border border-card-border bg-card p-3 sm:p-4">
          <ul className="space-y-1">
            {data.sectors.map((s) => {
              const v = sectorVal(s);
              const w = s.isGroup ? 0 : (Math.abs(v) / sectorMax) * 100;
              const label = metric === "value" ? fmtSar(s.value) : metric === "count" ? fmtCount(s.count) : `${v > 0 ? "+" : ""}${trimNum(v, 1)}%`;
              return (
                <li key={s.en}>
                  <button type="button" onClick={() => !s.isGroup && setSelectedSector(s.en === selectedSector ? null : s.en)} disabled={s.isGroup}
                    className={cn("w-full rounded-md px-2 py-1.5 text-right text-[13px] flex flex-col gap-1 sm:grid sm:grid-cols-[190px_1fr_92px_72px] sm:items-center sm:gap-x-3", !s.isGroup && "hover:bg-accent/60", selectedSector === s.en && "bg-accent")}
                    title={`${s.ar}: ${fmtSar(s.value)} ريال · ${fmtCount(s.count)} عملية`}>
                    {/* الهاتف: الاسم يمينًا والشارة يسارًا، ثم الشريط، ثم القيمة — الحاسوب: أربعة أعمدة */}
                    <span className="flex items-center justify-between gap-2 sm:contents">
                      <span className={cn("truncate", s.isGroup ? "font-bold" : s.group ? "text-muted-foreground pr-3" : "")}>{s.group ? "↳ " : ""}{s.ar}</span>
                      <span className="sm:hidden">{!s.isGroup && <ChangeChip value={s.changePct} />}</span>
                    </span>
                    <span className="block w-full h-2.5 sm:h-3.5 rounded bg-muted overflow-hidden" aria-hidden="true" dir="rtl">
                      {!s.isGroup && <span className={cn("block h-full rounded-l transition-[width] duration-500 motion-reduce:transition-none", metric === "change" ? (v >= 0 ? "bg-emerald-500" : "bg-red-500") : "bg-primary")} style={{ width: `${w}%` }} />}
                    </span>
                    <span className="text-[11px] sm:text-xs text-muted-foreground tabular-nums text-right sm:text-left">{s.isGroup ? "" : label}</span>
                    <span className="hidden sm:block">{!s.isGroup && <ChangeChip value={s.changePct} />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 border-t border-border pt-3">
            <div className="text-xs text-muted-foreground mb-1">{selected ? `مسار «${selected.ar}» عبر أربعة أسابيع (ريال)` : "إجمالي الإنفاق الأسبوعي عبر أربعة أسابيع (ريال)"}</div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 16, right: 44, left: 44, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="2 4" />
                  <XAxis dataKey="w" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, direction: "rtl" }} formatter={(v) => [`${fmtSar(Number(v))} ريال`, "الإنفاق"]} />
                  <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#wkFill)" dot={{ r: 3, fill: "hsl(var(--card))", strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} label={{ position: "top", fontSize: 10, fill: "hsl(var(--foreground))", formatter: (v: number) => fmtSar(v) }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* توزيع المدن */}
      <div>
        <SectionHead title="توزيع المدن" desc={`حصة كل مدينة من إجمالي الإنفاق، ثم كل المدن الـ${data.cities.length} مرتبة. ابحث عن مدينتك.`}>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن مدينة…" aria-label="بحث عن مدينة" className="h-8 w-44 text-xs" />
            <Seg value={citySort} onChange={setCitySort} label="ترتيب المدن" options={[{ id: "value", label: "الأكبر إنفاقًا" }, { id: "change", label: "الأعلى نموًا" }, { id: "avg", label: "أعلى متوسط عملية" }]} />
          </div>
        </SectionHead>
        <div className="rounded-xl border border-card-border bg-card p-3 sm:p-4">
          <div className="flex h-8 rounded-md overflow-hidden gap-0.5 bg-muted" role="img" aria-label="حصص المدن الست الكبرى من الإنفاق">
            {data.citiesShareTop.map((c, i) => (
              <div key={c.ar} style={{ flex: c.share, background: SHARE_COLORS[i] }} className={cn("flex items-center justify-center text-[11px] font-semibold whitespace-nowrap overflow-hidden", i < 2 ? "text-primary-foreground" : "text-foreground")} title={`${c.ar} ${fmtPct(c.share)}`}>
                {c.share > 6 ? `${c.ar} ${trimNum(c.share, 0)}%` : ""}
              </div>
            ))}
            <div style={{ flex: data.otherCitiesShare }} className="flex items-center justify-center text-[11px] text-muted-foreground whitespace-nowrap">بقية المدن {trimNum(data.otherCitiesShare, 0)}%</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            {data.citiesShareTop.map((c, i) => (
              <span key={c.ar}><i className="inline-block w-2.5 h-2.5 rounded-sm ml-1 align-[-1px]" style={{ background: SHARE_COLORS[i] }} />{c.ar} {fmtPct(c.share)}</span>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {cities.length === 0 && <div className="col-span-full text-sm text-muted-foreground py-4 text-center">لا نتائج</div>}
            {cities.map((c) => {
              const v = citySort === "value" ? c.value : citySort === "change" ? c.changePct : c.avgTicket;
              return (
                <div key={c.en} className="rounded-md border border-border bg-background p-2.5" title={`${c.ar}: ${fmtPct(c.share, 2)} من الإنفاق · ${fmtSar(c.value)} ريال · ${fmtCount(c.count)} عملية`}>
                  <div className="text-[13px] font-semibold truncate">{c.ar}</div>
                  <div className="my-1.5 h-1.5 rounded bg-muted overflow-hidden"><i className={cn("block h-full", citySort === "change" ? (v >= 0 ? "bg-emerald-500" : "bg-red-500") : "bg-primary")} style={{ width: `${(Math.abs(v) / cityMax) * 100}%` }} /></div>
                  <div className="flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                    <span className="truncate tabular-nums">{citySort === "avg" ? `${trimNum(c.avgTicket, 0)} ريال/عملية` : fmtSar(c.value)}</span>
                    <ChangeChip value={c.changePct} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {[{ t: "المدن الصاعدة هذا الأسبوع", rows: data.risers }, { t: "المدن الهابطة هذا الأسبوع", rows: data.fallers }].map((b) => (
            <div key={b.t} className="rounded-lg border border-card-border bg-card p-3">
              <h4 className="text-sm font-bold mb-1">{b.t}</h4>
              <ol className="text-[13px]">
                {b.rows.map((r) => (
                  <li key={r.ar} className="flex items-center justify-between py-1 border-b border-dashed border-border last:border-0"><span>{r.ar}</span><ChangeChip value={r.changePct} /></li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
