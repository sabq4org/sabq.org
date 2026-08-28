/**
 * شريط «الاقتصاد بالأرقام»: المؤشرات الخمسة + أسعار الصرف + إنفاق الأسبوع.
 * كل بطاقة تفتح لوحة الرسم التاريخي. يُستخدم في رأس قسم الاقتصاد وبلوك الرئيسية.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChangeChip } from "./ChangeChip";
import { fmtDateAr, fmtMonthAr, fmtRate, fmtSar, trimNum } from "./format";
import type { EconomySnapshot, FxRate, SnapshotIndicator } from "./types";
import { IndicatorDrawer, type DrawerTarget } from "./IndicatorDrawer";

interface TickerCard {
  id: string;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  change?: number | null;
  changeSuffix?: string;
  changeDigits?: number;
  flash?: boolean;
  target?: DrawerTarget;
}

const INDICATOR_ORDER: SnapshotIndicator["key"][] = ["inflation", "m3Growth", "gdp", "repo", "reverseRepo"];

function indicatorSub(i: SnapshotIndicator): string {
  if (i.cadence === "decision") return i.asOf ? `منذ ${fmtDateAr(i.asOf, false)}` : "";
  if (i.cadence === "quarterly") {
    const q = i.quarter?.match(/Q\s*(\d)/i)?.[1];
    return q ? `الربع ${q} · ${i.year ?? ""}`.trim() : fmtMonthAr(i.asOf);
  }
  return fmtMonthAr(i.asOf);
}

function indicatorChange(i: SnapshotIndicator): number | null {
  if (i.previousValue === null || i.previousValue === undefined) return null;
  return i.value - i.previousValue; // فرق بالنقاط المئوية
}

export function buildTickerCards(snap: EconomySnapshot, opts: { fxCodes?: string[]; compact?: boolean; flashKey?: string | null } = {}): TickerCard[] {
  const cards: TickerCard[] = [];
  // الترتيب من الأسرع تغيّرًا إلى الأبطأ: الأسبوعي → اليومي (الصرف) → الشهري/الربعي → قرارات الفائدة
  if (snap.weekly) {
    cards.push({
      id: "weekly",
      label: "إنفاق الأسبوع",
      value: fmtSar(snap.weekly.totalValue),
      unit: "ريال",
      sub: `نقاط البيع · ${snap.weekly.weekLabelAr}`,
      change: snap.weekly.totalChangePct,
      flash: opts.flashKey === "pos_weekly",
      target: { kind: "weekly", key: "weekly", titleAr: "إجمالي الإنفاق الأسبوعي عبر نقاط البيع", unit: "ريال" },
    });
  }
  const fxCodes = opts.fxCodes ?? ["USD", "EUR", "GBP"];
  for (const code of fxCodes) {
    const f: FxRate | undefined = snap.fx.find((x) => x.code === code);
    if (!f) continue;
    cards.push({
      id: `fx:${code}`,
      label: `${f.nameAr}`,
      value: fmtRate(f.rate),
      unit: "ريال",
      sub: fmtDateAr(f.date, false),
      change: f.changePct,
      changeDigits: 2,
      flash: opts.flashKey === "fx",
      target: { kind: "fx", key: code, titleAr: `${f.nameAr} مقابل الريال`, unit: "ريال" },
    });
  }
  const byKey = new Map(snap.indicators.map((i) => [i.key, i]));
  for (const key of INDICATOR_ORDER) {
    const i = byKey.get(key);
    if (!i) continue;
    if (opts.compact && (key === "reverseRepo" || key === "m3Growth")) continue; // البلوك المضغوط = 6 بطاقات بالضبط
    const delta = indicatorChange(i);
    cards.push({
      id: `ind:${key}`,
      label: i.shortAr,
      value: trimNum(i.value, 2),
      unit: "%",
      sub: indicatorSub(i),
      change: delta,
      changeSuffix: delta !== null ? " نقطة" : undefined,
      flash: opts.flashKey === key,
      target: { kind: "indicator", key: i.key, titleAr: i.titleAr, unit: "%" },
    });
  }
  return cards;
}

export function EconomyTicker({ snapshot, compact = false, flashKey, className, layout = "grid" }: { snapshot: EconomySnapshot; compact?: boolean; flashKey?: string | null; className?: string; layout?: "grid" | "scroll" }) {
  const [open, setOpen] = useState<DrawerTarget | null>(null);
  const cards = buildTickerCards(snapshot, { compact, flashKey, fxCodes: compact ? ["USD", "EUR"] : ["USD", "EUR", "GBP", "EGP", "INR"] });
  // شبكة بلا شريط تمرير: 2 على الهاتف، 3 على اللوحي، 6 على الحاسوب (البلوك المضغوط = 6 بطاقات بالضبط)
  if (!cards.length) return null;
  return (
    <>
      <div className={cn(layout === "grid" ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6" : "flex gap-2.5 overflow-x-auto pb-1 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)} role="list" aria-label="الاقتصاد بالأرقام">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            role="listitem"
            onClick={() => c.target && setOpen(c.target)}
            className={cn(
              "snap-start shrink-0 min-w-0 rounded-lg border border-card-border bg-card px-3.5 py-2.5 text-right transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              c.flash && "ring-2 ring-primary/70 animate-pulse motion-reduce:animate-none",
            )}
            data-testid={`economy-ticker-${c.id}`}
          >
            <div className="text-[11px] text-muted-foreground leading-4">{c.label}</div>
            <div className="mt-0.5 flex items-baseline gap-1 tabular-nums">
              <span className="text-xl font-bold leading-tight text-foreground">{c.value}</span>
              {c.unit && <span className="text-[11px] text-muted-foreground">{c.unit}</span>}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground truncate">{c.sub}</span>
              <ChangeChip value={c.change ?? null} suffix={c.changeSuffix} digits={c.changeDigits ?? 1} hideEmpty />
            </div>
          </button>
        ))}
      </div>
      <IndicatorDrawer target={open} onClose={() => setOpen(null)} snapshot={snapshot} />
    </>
  );
}
