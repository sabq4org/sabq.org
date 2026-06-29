import { motion } from "framer-motion";
import { Building2, MapPin } from "lucide-react";
import type { GcOverview } from "./gcTypes";

export function GcHostShowcase({ overview }: { overview: GcOverview | undefined }) {
  const venues = overview?.venues ?? [];
  if (venues.length === 0) return null;

  return (
    <section dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Building2 className="h-6 w-6 text-emerald-500" />
        <h2 className="text-2xl font-black text-foreground">ملاعب الاستضافة</h2>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
          {venues.length}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {venues.map((v, idx) => (
          <motion.div
            key={`${v.name}|${v.city}`}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.3) }}
            className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-foreground">{v.name}</p>
              {v.city && <p className="truncate text-sm text-muted-foreground">{v.city}</p>}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
