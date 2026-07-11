import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Gem } from "lucide-react";
import type { GcStarPlayer } from "./gcTypes";

/**
 * «نجوم البطولة» — أغلى اللاعبين بالقيمة السوقية (TheSports). يختفي القسم
 * كليًا قبل توفر بيانات الموسم لدى المزوّد (استجابة فارغة).
 */

function formatValue(value: number, currency: string): string {
  const cur = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency ? `${currency} ` : "";
  if (value >= 1_000_000) return `${cur}${(value / 1_000_000).toFixed(1)}م`;
  if (value >= 1_000) return `${cur}${Math.round(value / 1_000)} ألف`;
  return `${cur}${value}`;
}

export function GcStarsSection() {
  const { data } = useQuery<{ stars: GcStarPlayer[] }>({
    queryKey: ["/api/gulf-cup/stars"],
    staleTime: 30 * 60_000,
  });
  const stars = Array.isArray(data?.stars) ? data.stars : [];
  if (stars.length === 0) return null;

  return (
    <section id="gc-stars" dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Gem className="h-6 w-6 text-emerald-500" />
        <h2 className="text-2xl font-black text-foreground">نجوم البطولة</h2>
        <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-sm font-bold text-amber-600 dark:text-amber-400">
          الأغلى قيمة
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stars.slice(0, 9).map((s, idx) => (
          <motion.div
            key={`${s.name}-${s.rank}`}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.3) }}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-sm font-black tabular-nums text-muted-foreground">
              {s.rank}
            </span>
            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-muted">
              {s.photo ? <img src={s.photo} alt={s.name} className="h-full w-full object-cover" loading="lazy" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-foreground">{s.name}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {s.team?.logo ? <img src={s.team.logo} alt="" className="h-3.5 w-3.5 object-contain" loading="lazy" /> : null}
                <span className="truncate">{s.team?.name ?? ""}</span>
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-gradient-to-b from-[#F5D46B]/25 to-[#E7A93C]/15 px-2.5 py-1 text-xs font-black text-[#96700F] dark:text-amber-300 tabular-nums">
              {formatValue(s.marketValue, s.currency)}
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
