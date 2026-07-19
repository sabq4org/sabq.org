import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Target, Handshake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GcScorer, GcScorersBoard } from "./gcTypes";

/**
 * «الهدّافون وصنّاع اللعب» — منصة تتويج للثلاثة الأوائل + جدول للبقية،
 * وعمود جانبي لصنّاع الأهداف. قبل توفر أرقام 2026 لدى المزوّد تُعرض
 * أرقام خليجي 26 موسومة صراحةً. يختفي القسم كليًا عند غياب البيانات.
 */

function PodiumCard({ scorer, place }: { scorer: GcScorer; place: 1 | 2 | 3 }) {
  const ring =
    place === 1
      ? "ring-sky-400 bg-sky-50/80 dark:bg-sky-950/20"
      : place === 2
        ? "ring-slate-300 bg-slate-50/80 dark:bg-slate-900/40"
        : "ring-teal-300 bg-teal-50/60 dark:bg-teal-950/20";
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
  return (
    <div
      className={`relative flex flex-col items-center rounded-2xl px-3 pb-3 ring-2 ${ring} ${
        place === 1 ? "pt-5 sm:-mt-2" : "pt-4"
      }`}
    >
      <span className="absolute -top-3 text-xl drop-shadow">{medal}</span>
      <div className="h-14 w-14 overflow-hidden rounded-full bg-white ring-2 ring-white shadow">
        {scorer.photo ? (
          <img src={scorer.photo} alt={scorer.name} className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
      <p className="mt-2 max-w-[8rem] truncate text-sm font-black text-foreground">{scorer.name}</p>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {scorer.team.logo && (
          <img src={scorer.team.logo} alt="" className="h-3.5 w-3.5 object-contain" loading="lazy" />
        )}
        <span className="truncate max-w-[6rem]">{scorer.team.name}</span>
      </p>
      <p className="mt-1.5 text-2xl font-black tabular-nums text-sky-600 dark:text-sky-400">
        {scorer.goals}
      </p>
      <p className="text-[10px] text-muted-foreground">هدفًا</p>
    </div>
  );
}

export function GcScorersSection() {
  const { data } = useQuery<GcScorersBoard>({
    queryKey: ["/api/gulf-cup/scorers"],
    staleTime: 5 * 60_000,
  });

  // صفوف الأصفار ضجيج بصري (تظهر في أرقام الأرشيف) — نعرض المُنتِجين فقط،
  // وإن خلت قائمة الصنّاع بالكامل يختفي عمودها ويتمدّد الهدّافون.
  const scorers = (Array.isArray(data?.scorers) ? data.scorers : []).filter((s) => s.goals > 0);
  const assists = (Array.isArray(data?.assists) ? data.assists : []).filter((s) => s.assists > 0);
  if (scorers.length === 0 && assists.length === 0) return null;

  const podium = scorers.slice(0, 3);
  const rest = scorers.slice(3, 11);

  return (
    <section id="gc-scorers" dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Target className="h-6 w-6 text-sky-600 dark:text-sky-400" />
        <h2 className="text-2xl font-black text-foreground">الهدّافون وصنّاع اللعب</h2>
        {data && !data.isCurrent && (
          <Badge variant="outline" className="border-sky-400/50 text-sky-700 dark:text-sky-300">
            أرقام خليجي 26 — إلى حين انطلاق البطولة
          </Badge>
        )}
      </div>

      <div className={assists.length > 0 ? "grid gap-6 lg:grid-cols-[1fr_300px]" : ""}>
        {/* الهدّافون: منصة + جدول */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          {podium.length > 0 && (
            <div className="mx-auto mb-4 grid max-w-lg grid-cols-3 items-end gap-3">
              {/* الترتيب البصري: الثاني — الأول (مرتفع) — الثالث */}
              {podium[1] && <PodiumCard scorer={podium[1]} place={2} />}
              {podium[0] && <PodiumCard scorer={podium[0]} place={1} />}
              {podium[2] && <PodiumCard scorer={podium[2]} place={3} />}
            </div>
          )}

          {rest.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {rest.map((s) => (
                <li
                  key={`${s.id}-${s.rank}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2"
                >
                  <span className="w-5 text-center text-sm font-black tabular-nums text-muted-foreground">
                    {s.rank}
                  </span>
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted">
                    {s.photo ? (
                      <img src={s.photo} alt={s.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground">{s.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{s.team.name}</p>
                  </div>
                  <span className="text-lg font-black tabular-nums text-sky-600 dark:text-sky-400">
                    {s.goals}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>

        {/* صنّاع الأهداف */}
        {assists.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.08 }}
          >
            <div className="rounded-2xl border border-border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-black text-foreground">
                <Handshake className="h-4 w-4 text-sky-500" />
                صنّاع الأهداف
              </h3>
              <ul className="space-y-2.5">
                {assists.slice(0, 8).map((s) => (
                  <li key={`${s.id}-${s.rank}`} className="flex items-center gap-2.5">
                    <span className="w-4 text-center text-xs font-black tabular-nums text-muted-foreground">
                      {s.rank}
                    </span>
                    <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted">
                      {s.photo ? (
                        <img src={s.photo} alt={s.name} className="h-full w-full object-cover" loading="lazy" />
                      ) : null}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                      {s.name}
                    </span>
                    <span className="text-sm font-black tabular-nums text-sky-600 dark:text-sky-400">
                      {s.assists}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
