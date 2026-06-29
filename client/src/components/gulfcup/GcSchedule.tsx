import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GcMatchCard } from "./GcMatchCard";
import { groupFixturesByDay, type GcFixture } from "./gcTypes";

export function GcSchedule({
  fixtures,
  isLoading,
}: {
  fixtures: GcFixture[];
  isLoading: boolean;
}) {
  const rounds = useMemo(() => {
    const set: string[] = [];
    for (const f of fixtures) if (f.round && !set.includes(f.round)) set.push(f.round);
    return set;
  }, [fixtures]);

  const [activeRound, setActiveRound] = useState<string | null>(null);
  const filtered = activeRound ? fixtures.filter((f) => f.round === activeRound) : fixtures;
  const days = useMemo(() => groupFixturesByDay(filtered), [filtered]);

  return (
    <section id="gc-schedule" dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex items-center gap-2">
        <CalendarDays className="h-6 w-6 text-emerald-500" />
        <h2 className="text-2xl font-black text-foreground">جدول المباريات</h2>
      </div>

      {rounds.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveRound(null)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
              activeRound === null
                ? "bg-emerald-500 text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            الكل
          </button>
          {rounds.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setActiveRound(r)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                activeRound === r
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
          سيظهر جدول المباريات هنا بمجرّد اعتماده رسميًّا.
        </p>
      ) : (
        <div className="space-y-8">
          {days.map((day, idx) => (
            <motion.div
              key={day.key}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.3) }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <h3 className="text-sm font-bold text-foreground">{day.label}</h3>
                <span className="text-xs text-muted-foreground">({day.items.length})</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {day.items.map((f) => (
                  <GcMatchCard key={f.id} fixture={f} />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
