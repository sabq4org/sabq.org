import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, LayoutGrid, Minus } from "lucide-react";
import { SAUDI_TEAM_ID, type GcGroup } from "./gcTypes";

function GroupTable({ group }: { group: GcGroup }) {
  const started = group.rows.some((r) => r.played > 0);
  const isLive = group.rows.some((r) => r.live);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between bg-gradient-to-l from-sky-700 to-sky-950 px-4 py-2.5">
        <h3 className="text-sm font-black text-white">{group.name || "مجموعة"}</h3>
        {isLive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#DE2B3D]/90 px-2 py-0.5 text-[10px] font-bold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            مباشر
          </span>
        ) : !started ? (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-sky-50">
            لم تبدأ
          </span>
        ) : null}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] text-muted-foreground">
            <th className="px-3 py-2 text-right font-semibold">المنتخب</th>
            <th className="px-1.5 py-2 text-center font-semibold">لعب</th>
            <th className="px-1.5 py-2 text-center font-semibold">+/-</th>
            <th className="px-1.5 py-2 text-center font-semibold">نقاط</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => {
            const isSaudi = row.team.id === SAUDI_TEAM_ID;
            const qualifying = started && row.rank <= 2;
            return (
              <tr
                key={row.team.id}
                className={`border-b border-border/60 last:border-0 ${
                  row.live
                    ? "bg-sky-500/[0.06]"
                    : isSaudi
                      ? "bg-emerald-50/70 dark:bg-emerald-950/20"
                      : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-0.5 shrink-0 ${
                        qualifying ? "text-teal-700 dark:text-teal-300" : "text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${
                          qualifying ? "bg-teal-600 text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {row.rank}
                      </span>
                      {row.live && (row.liveDelta ?? 0) > 0 && (
                        <ArrowUp className="h-3 w-3 text-teal-600" aria-label={`صعد ${row.liveDelta} مركزًا`} />
                      )}
                      {row.live && (row.liveDelta ?? 0) < 0 && (
                        <ArrowDown className="h-3 w-3 text-rose-500" aria-label={`هبط ${Math.abs(row.liveDelta ?? 0)} مركزًا`} />
                      )}
                      {row.live && (row.liveDelta ?? 0) === 0 && (
                        <Minus className="h-3 w-3 text-muted-foreground/50" aria-label="ثابت لحظيًا" />
                      )}
                    </span>
                    <div className="h-5 w-5 shrink-0 rounded-full bg-white p-0.5 ring-1 ring-black/5">
                      {row.team.logo ? (
                        <img src={row.team.logo} alt={row.team.name} className="h-full w-full object-contain" loading="lazy" />
                      ) : null}
                    </div>
                    <span className={`truncate ${isSaudi ? "font-extrabold text-emerald-700 dark:text-emerald-300" : "font-semibold"}`}>
                      {row.team.name}
                    </span>
                    {row.live && (
                      <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-[#DE2B3D]/10 px-1.5 py-0.5 text-[9px] font-black text-[#DE2B3D] dark:text-red-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#DE2B3D] animate-pulse" />
                        مباشر
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-1.5 py-2.5 text-center tabular-nums text-muted-foreground">{row.played}</td>
                <td className="px-1.5 py-2.5 text-center tabular-nums text-muted-foreground" dir="ltr">
                  {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
                </td>
                <td className="px-1.5 py-2.5 text-center font-black tabular-nums text-foreground">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GcGroups({ groups }: { groups: GcGroup[] }) {
  if (!groups || groups.length === 0) return null;
  const isLive = groups.some((g) => g.rows.some((r) => r.live));

  return (
    <section id="gc-groups" dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <LayoutGrid className="h-6 w-6 text-sky-600 dark:text-sky-400" />
        <h2 className="text-2xl font-black text-foreground">المجموعات والترتيب</h2>
        {isLive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#DE2B3D]/10 px-2 py-0.5 text-[11px] font-bold text-[#DE2B3D] dark:text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-[#DE2B3D] animate-pulse" />
            تحديث لحظي
          </span>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g, idx) => (
          <motion.div
            key={g.name || idx}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.35, delay: Math.min(idx * 0.05, 0.3) }}
          >
            <GroupTable group={g} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
