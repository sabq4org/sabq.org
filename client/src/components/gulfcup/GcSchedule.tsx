import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ChevronDown, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GcMatchCard } from "./GcMatchCard";
import { groupFixturesByDay, type GcFixture } from "./gcTypes";

export function GcSchedule({
  fixtures,
  isLoading,
  onOpenMatch,
}: {
  fixtures: GcFixture[];
  isLoading: boolean;
  onOpenMatch?: (fixtureId: number) => void;
}) {
  const rounds = useMemo(() => {
    const set: string[] = [];
    for (const f of fixtures) if (f.round && !set.includes(f.round)) set.push(f.round);
    return set;
  }, [fixtures]);

  const [activeRound, setActiveRound] = useState<string | null>(null);
  const filtered = activeRound ? fixtures.filter((f) => f.round === activeRound) : fixtures;
  // المباريات الجارية والقادمة تتصدّر الجدول، والمنتهية تنتقل إلى قسم مطويّ بعدها
  // (الأحدث أولًا) حتى لا تزاحم ما يهمّ الزائر الآن.
  const upcomingDays = useMemo(
    () => groupFixturesByDay(filtered.filter((f) => !f.status.finished)),
    [filtered],
  );
  const finishedDays = useMemo(
    () => groupFixturesByDay(filtered.filter((f) => f.status.finished)).reverse(),
    [filtered],
  );
  const finishedCount = finishedDays.reduce((n, d) => n + d.items.length, 0);
  const [showFinished, setShowFinished] = useState(false);
  // إن لم يبقَ شيء قادم (نهاية البطولة أو جولة مكتملة) تُعرض النتائج مباشرة.
  const finishedOpen = showFinished || upcomingDays.length === 0;

  const renderDays = (days: ReturnType<typeof groupFixturesByDay>) => (
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
              <GcMatchCard key={f.id} fixture={f} onOpen={onOpenMatch} />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );

  return (
    <section id="gc-schedule" dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 scroll-mt-[calc(var(--public-header-height,4rem)+3.75rem)] md:scroll-mt-[calc(var(--public-header-height,4rem)+6.5rem)]">
      <div className="mb-6 flex items-center gap-2">
        <CalendarDays className="h-6 w-6 text-sky-600 dark:text-sky-400" />
        <h2 className="text-2xl font-black text-foreground">جدول المباريات</h2>
      </div>

      {rounds.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveRound(null)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
              activeRound === null
                ? "bg-sky-500 text-white"
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
                  ? "bg-sky-500 text-white"
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
      ) : upcomingDays.length === 0 && finishedDays.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
          سيظهر جدول المباريات هنا بمجرّد اعتماده رسميًّا.
        </p>
      ) : (
        <div className="space-y-8">
          {upcomingDays.length > 0 && renderDays(upcomingDays)}

          {finishedCount > 0 && (
            <div className={upcomingDays.length > 0 ? "border-t border-border pt-6" : undefined}>
              {upcomingDays.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowFinished((v) => !v)}
                  aria-expanded={finishedOpen}
                  aria-controls="gc-finished-matches"
                  className="mb-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-start transition-colors hover:bg-muted/70"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                    <span className="text-base font-bold text-foreground">المباريات المنتهية</span>
                    <span className="text-xs text-muted-foreground">({finishedCount})</span>
                  </span>
                  <span className="flex items-center gap-1 text-sm font-bold text-sky-600 dark:text-sky-400">
                    {finishedOpen ? "إخفاء النتائج" : "عرض النتائج"}
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${finishedOpen ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>
              ) : (
                <div className="mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-base font-bold text-foreground">المباريات المنتهية</h3>
                  <span className="text-xs text-muted-foreground">({finishedCount})</span>
                </div>
              )}
              {finishedOpen && <div id="gc-finished-matches">{renderDays(finishedDays)}</div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
