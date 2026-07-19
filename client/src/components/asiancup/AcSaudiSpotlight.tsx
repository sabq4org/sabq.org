import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { AcMatchCard } from "./AcMatchCard";
import type { AcOverview } from "./acTypes";

/**
 * تركيز المنتخب المضيف — ترويسة خفيفة + بطاقات مباريات على خلفية الصفحة
 * (بدون صندوق أخضر ثقيل يبتلع بطاقات المباريات).
 */
export function AcSaudiSpotlight({
  saudi,
  onOpenMatch,
}: {
  saudi: AcOverview["saudi"] | undefined;
  onOpenMatch: (id: number) => void;
}) {
  if (!saudi?.team) return null;
  const fixtures = (saudi.fixtures ?? []).slice(0, 6);

  return (
    <section dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.45 }}
      >
        <div className="mb-5 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white p-2 shadow-md ring-1 ring-border dark:bg-card">
            {saudi.team.logo ? (
              <img src={saudi.team.logo} alt={saudi.team.name} className="h-full w-full object-contain" />
            ) : null}
          </div>
          <div className="text-center sm:text-right">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                {saudi.team.name}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                <Star className="h-3 w-3 fill-current" />
                المنتخب المضيف
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {saudi.group
                ? `مباريات الأخضر · ضمن ${saudi.group}`
                : "يقود الحلم الآسيوي على أرضه وبين جماهيره"}
            </p>
          </div>
        </div>

        {fixtures.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fixtures.map((f) => (
              <AcMatchCard key={f.id} fixture={f} onOpen={onOpenMatch} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            ستظهر مباريات الأخضر هنا بمجرّد اعتماد الجدول
          </p>
        )}
      </motion.div>
    </section>
  );
}
