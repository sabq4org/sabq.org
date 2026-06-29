import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { GcMatchCard } from "./GcMatchCard";
import type { GcOverview } from "./gcTypes";

export function GcSaudiSpotlight({ saudi }: { saudi: GcOverview["saudi"] | undefined }) {
  if (!saudi?.team) return null;
  const fixtures = (saudi.fixtures ?? []).slice(0, 6);

  return (
    <section dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.45 }}
        className="overflow-hidden rounded-3xl border border-emerald-300/40 bg-gradient-to-bl from-emerald-600 via-emerald-700 to-green-800 shadow-xl"
      >
        <div className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-8">
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-2xl bg-white p-3 shadow-lg ring-1 ring-white/30">
            {saudi.team.logo ? (
              <img src={saudi.team.logo} alt={saudi.team.name} className="h-full w-full object-contain" />
            ) : null}
          </div>
          <div className="flex-1 text-center sm:text-right">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-amber-200">
              <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
              المنتخب المضيف
            </span>
            <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">{saudi.team.name}</h2>
            <p className="mt-1 text-sm text-emerald-50/80">
              {saudi.group
                ? `ضمن ${saudi.group}`
                : "يقود حلم الخليج على أرضه وبين جماهيره"}
            </p>
          </div>
        </div>

        {fixtures.length > 0 && (
          <div className="border-t border-white/10 bg-black/10 p-4 sm:p-6">
            <h3 className="mb-3 text-sm font-bold text-emerald-50/90">مباريات الأخضر</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {fixtures.map((f) => (
                <GcMatchCard key={f.id} fixture={f} />
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </section>
  );
}
