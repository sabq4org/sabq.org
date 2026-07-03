import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Crown, Landmark } from "lucide-react";
import type { GcHistory } from "./gcTypes";

/**
 * «سجلّ البطولة» — 26 نسخة من التاريخ الخليجي: جدار الألقاب لكل منتخب
 * + شريط زمني أفقي للنسخ (الأحدث أولًا) مع حامل اللقب بارزًا. البيانات
 * ثابتة محليًّا في الخادم (/api/gulf-cup/history) فالكاش طويل.
 */

export function GcHistorySection() {
  const { data } = useQuery<GcHistory>({
    queryKey: ["/api/gulf-cup/history"],
    staleTime: 60 * 60_000,
  });

  const titles = Array.isArray(data?.titles) ? data.titles : [];
  const editions = Array.isArray(data?.editions) ? data.editions : [];
  if (titles.length === 0 && editions.length === 0) return null;

  // حامل اللقب = بطل أحدث نسخة منتهية
  const holder = editions.find((e) => !e.upcoming && e.champion);

  return (
    <section id="gc-history" dir="rtl" className="relative overflow-hidden py-12">
      {/* خلفية داكنة فاخرة تميّز قسم التاريخ عن باقي الصفحة */}
      <div className="absolute inset-0 bg-gradient-to-bl from-[#02160f] via-[#04392a] to-[#021a12]" />
      <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />

      <div className="relative container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2">
          <Landmark className="h-6 w-6 text-amber-300" />
          <h2 className="text-2xl font-black text-white">سجلّ البطولة</h2>
          <span className="text-sm text-emerald-100/60">منذ 1970</span>
        </div>

        {/* حامل اللقب */}
        {holder?.champion && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="mb-6 flex items-center gap-4 rounded-3xl border border-amber-300/30 bg-white/[0.06] p-4 backdrop-blur-sm sm:p-5"
          >
            <div className="relative h-16 w-16 shrink-0 rounded-full bg-white p-1.5 ring-2 ring-amber-300/70 shadow-lg">
              {holder.champion.logo ? (
                <img
                  src={holder.champion.logo}
                  alt={holder.champion.name}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              ) : null}
              <Crown className="absolute -top-2 -left-1 h-5 w-5 text-amber-300 drop-shadow" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-amber-300/90">حامل اللقب — {holder.title}</p>
              <p className="text-xl font-black text-white truncate">{holder.champion.name}</p>
              <p className="text-[11px] text-emerald-100/70">
                {holder.hostCity ? `${holder.hostCity} · ` : ""}
                {holder.year}
                {holder.runnerUp ? ` — على حساب ${holder.runnerUp.name}` : ""}
                {holder.finalNote ? ` (${holder.finalNote})` : ""}
              </p>
            </div>
          </motion.div>
        )}

        {/* جدار الألقاب */}
        {titles.length > 0 && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {titles.map((row, i) => (
              <motion.div
                key={row.team.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.35) }}
                className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"
              >
                <div className="h-10 w-10 shrink-0 rounded-full bg-white p-1">
                  {row.team.logo ? (
                    <img src={row.team.logo} alt={row.team.name} className="h-full w-full object-contain" loading="lazy" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{row.team.name}</p>
                  <p className="text-[11px] text-emerald-100/70">
                    <span className="font-black text-amber-300 tabular-nums">{row.titles}</span>{" "}
                    {row.titles === 1 ? "لقب" : row.titles === 2 ? "لقبان" : "ألقاب"}
                    {row.lastTitleYear ? ` · آخرها ${row.lastTitleYear}` : ""}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* الشريط الزمني للنسخ */}
        {editions.length > 0 && (
          <div className="-mx-4 overflow-x-auto px-4 pb-2" dir="rtl">
            <div className="flex w-max gap-3">
              {editions.map((e) => (
                <div
                  key={e.edition}
                  className={`w-44 shrink-0 rounded-2xl p-3 ring-1 ${
                    e.upcoming
                      ? "bg-amber-400/10 ring-amber-300/40"
                      : "bg-white/[0.05] ring-white/10"
                  }`}
                >
                  <p className="text-[11px] font-bold text-emerald-100/60">
                    {e.title} · {e.year}
                  </p>
                  {e.upcoming ? (
                    <p className="mt-1.5 text-sm font-black text-amber-300">
                      على أرض {e.hostCity ?? e.host.name} 🇸🇦
                    </p>
                  ) : e.champion ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-7 w-7 shrink-0 rounded-full bg-white p-0.5">
                        {e.champion.logo ? (
                          <img src={e.champion.logo} alt="" className="h-full w-full object-contain" loading="lazy" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">{e.champion.name}</p>
                        {e.finalNote && (
                          <p className="text-[10px] text-emerald-100/60 tabular-nums" dir="ltr">
                            {e.finalNote}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                  <p className="mt-1 truncate text-[10px] text-emerald-100/50">
                    الاستضافة: {e.hostCity ?? e.host.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
