/**
 * «سجلّ البطولة» لكأس الملك — مرآة GcHistorySection في هب خليجي 27:
 * جدار الألقاب + شريط زمني للنسخ (الأحدث أولًا) بخلفية داكنة فاخرة.
 * الفرق الجوهري: البيانات حقيقية من المزوّد (/api/kings-cup/record —
 * نهائيات المواسم المتاحة لدى API-Football) لا قائمة مكتوبة يدويًّا،
 * لذا يُعرض المدى بأمانة «منذ نسخة {أقدم موسم متاح}».
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Crown, Landmark } from "lucide-react";
import { kcSeasonLabel, type KcRecord } from "./kcTypes";

export function KcHistorySection() {
  const { data } = useQuery<KcRecord>({
    queryKey: ["/api/kings-cup/record"],
    staleTime: 60 * 60_000,
  });

  const titles = Array.isArray(data?.titles) ? data.titles : [];
  const editions = Array.isArray(data?.editions) ? data.editions : [];
  if (titles.length === 0 && editions.length === 0) return null;

  const holder = editions.find((e) => e.champion) ?? null;

  return (
    <section id="kc-history" dir="rtl" className="relative overflow-hidden py-12">
      {/* خلفية داكنة تميّز قسم التاريخ — نفس أرضية الهيرو الليلية */}
      <div className="absolute inset-0 bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828]" />
      <div className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />

      <div className="relative container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2">
          <Landmark className="h-6 w-6 text-amber-300" />
          <h2 className="text-2xl font-black text-white">سجلّ البطولة</h2>
          {data?.sinceSeason != null && (
            <span className="text-sm text-emerald-100/60">منذ نسخة {kcSeasonLabel(data.sinceSeason)}</span>
          )}
        </div>

        {/* حامل اللقب — بطل أحدث نسخة محسومة */}
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
              <p className="text-[11px] font-bold text-amber-300/90">
                حامل اللقب — نسخة {kcSeasonLabel(holder.season)}
              </p>
              <p className="text-xl font-black text-white truncate">{holder.champion.name}</p>
              {holder.runnerUp && (
                <p className="text-[11px] text-emerald-100/70">
                  على حساب {holder.runnerUp.name}
                  {holder.score && (
                    <>
                      {" "}
                      <span dir="ltr" className="font-black text-amber-300 tabular-nums">{holder.score}</span>
                    </>
                  )}
                  {holder.penalties && (
                    <>
                      {" "}(بركلات الترجيح <span dir="ltr" className="font-black tabular-nums">{holder.penalties}</span>)
                    </>
                  )}
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* جدار الألقاب */}
        {titles.length > 0 && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {titles.map((row, i) => (
              <motion.div
                key={row.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.35) }}
                className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10"
              >
                <div className="h-10 w-10 shrink-0 rounded-full bg-white p-1">
                  {row.logo ? (
                    <img src={row.logo} alt={row.name} className="h-full w-full object-contain" loading="lazy" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{row.name}</p>
                  <p className="text-[11px] text-emerald-100/70">
                    <span className="font-black text-amber-300 tabular-nums">{row.titles}</span>{" "}
                    {row.titles === 1 ? "لقب" : row.titles === 2 ? "لقبان" : "ألقاب"}
                    {` · آخرها ${kcSeasonLabel(row.lastSeason)}`}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* النسخ — شبكة ملتفّة بلا تمرير أفقي (طلب المالك) */}
        {editions.length > 0 && (
          <div dir="rtl">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {editions.map((e) => (
                <div key={e.season} className="rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/10">
                  <p className="text-[11px] font-bold text-emerald-100/60">نسخة {kcSeasonLabel(e.season)}</p>
                  {e.champion && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-7 w-7 shrink-0 rounded-full bg-white p-0.5">
                        {e.champion.logo ? (
                          <img src={e.champion.logo} alt="" className="h-full w-full object-contain" loading="lazy" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">{e.champion.name}</p>
                        {e.score && (
                          <p className="text-[10px] text-emerald-100/60 tabular-nums" dir="ltr">
                            {e.score}
                            {e.penalties ? ` (${e.penalties} ر.ت)` : ""}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {e.runnerUp && (
                    <p className="mt-1 truncate text-[10px] text-emerald-100/50">الوصيف: {e.runnerUp.name}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-3 text-[10px] text-emerald-100/40">
          السجل من بيانات مزوّد البطولة للمواسم المتاحة — البطولة أُطلقت عام 1957 ولها تاريخ أعرق من المدى المعروض.
        </p>
      </div>
    </section>
  );
}
