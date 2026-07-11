import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { GcMatchCard } from "./GcMatchCard";
import type { GcFixture } from "./gcTypes";

/**
 * «الطريق إلى اللقب» — نصفا النهائي جنبًا إلى جنب والنهائي بارزًا تحتهما.
 * قبل حسم المتأهلَين تظهر الخانات بأسمائها المؤقتة (أول المجموعة…).
 */

export function GcKnockoutSection({
  fixtures,
  onOpenMatch,
}: {
  fixtures: GcFixture[];
  onOpenMatch?: (fixtureId: number) => void;
}) {
  const semis = fixtures
    .filter((f) => (f.roundEn ?? "").toLowerCase().includes("semi"))
    .sort((a, b) => a.timestamp - b.timestamp);
  const final = fixtures.find(
    (f) => (f.roundEn ?? "").trim().startsWith("Final")
  );
  if (semis.length === 0 && !final) return null;

  return (
    <section id="gc-knockout" dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Trophy className="h-6 w-6 text-amber-500" />
        <h2 className="text-2xl font-black text-foreground">الطريق إلى اللقب</h2>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="mx-auto max-w-3xl space-y-4"
      >
        {semis.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-bold text-muted-foreground">نصف النهائي</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {semis.map((f) => (
                <GcMatchCard key={f.id} fixture={f} onOpen={onOpenMatch} />
              ))}
            </div>
          </div>
        )}

        {final && (
          <div className="sm:px-14">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-amber-600 dark:text-amber-400">
              <Trophy className="h-4 w-4" />
              النهائي — {final.venue?.name ?? ""}
            </p>
            <div className="rounded-3xl bg-gradient-to-bl from-amber-100/60 via-transparent to-emerald-100/40 p-1 dark:from-amber-500/15 dark:to-emerald-500/10">
              <GcMatchCard fixture={final} onOpen={onOpenMatch} />
            </div>
          </div>
        )}
      </motion.div>
    </section>
  );
}
