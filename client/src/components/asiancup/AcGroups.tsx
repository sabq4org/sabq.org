import { motion } from "framer-motion";
import { LayoutGrid } from "lucide-react";
import { SAUDI_TEAM_ID, type AcGroup } from "./acTypes";

function GroupTable({ group }: { group: AcGroup }) {
  const started = group.rows.some((r) => r.played > 0);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between bg-gradient-to-l from-emerald-600 to-emerald-700 px-4 py-2.5">
        <h3 className="text-sm font-black text-white">{group.name || "مجموعة"}</h3>
        {!started && (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold text-emerald-50">
            لم تبدأ
          </span>
        )}
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
                  isSaudi ? "bg-emerald-50/70 dark:bg-emerald-950/20" : ""
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold ${
                        qualifying ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.rank}
                    </span>
                    <div className="h-5 w-5 shrink-0 rounded-full bg-white p-0.5 ring-1 ring-black/5">
                      {row.team.logo ? (
                        <img src={row.team.logo} alt={row.team.name} className="h-full w-full object-contain" loading="lazy" />
                      ) : null}
                    </div>
                    <span className={`truncate ${isSaudi ? "font-extrabold text-emerald-700 dark:text-emerald-300" : "font-semibold"}`}>
                      {row.team.name}
                    </span>
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

export function AcGroups({ groups }: { groups: AcGroup[] }) {
  if (!groups || groups.length === 0) return null;

  return (
    <section id="ac-groups" dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex items-center gap-2">
        <LayoutGrid className="h-6 w-6 text-emerald-500" />
        <h2 className="text-2xl font-black text-foreground">المجموعات والترتيب</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
