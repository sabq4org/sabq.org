import { motion } from "framer-motion";
import { ListOrdered } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { WcGroup, WcStandingRow } from "./wcTypes";

interface StandingsSectionProps {
  groups: WcGroup[] | undefined;
  isLoading: boolean;
}

const FORM_COLOR: Record<string, string> = {
  W: "bg-emerald-500",
  D: "bg-zinc-400",
  L: "bg-red-500",
};

function FormDots({ form }: { form: string | null }) {
  if (!form) return null;
  return (
    <span className="flex gap-0.5" dir="ltr" title="آخر النتائج">
      {form.slice(-5).split("").map((char, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${FORM_COLOR[char] ?? "bg-muted"}`} />
      ))}
    </span>
  );
}

function StandingRowItem({ row }: { row: WcStandingRow }) {
  const highlight =
    row.rank <= 2
      ? "bg-emerald-500/[0.08] border-r-2 border-emerald-500"
      : row.rank === 3
        ? "bg-amber-500/[0.08] border-r-2 border-amber-500"
        : "border-r-2 border-transparent";
  return (
    <div className={`grid grid-cols-[1.25rem_1fr_2rem_2.5rem_2rem] items-center gap-1 rounded-md px-2 py-1.5 text-sm ${highlight}`}>
      <span className="text-center text-xs text-muted-foreground tabular-nums">{row.rank}</span>
      <div className="flex items-center gap-2 min-w-0">
        <img src={row.team.logo} alt={row.team.name} className="h-4.5 w-4.5 h-[18px] w-[18px] object-contain shrink-0" loading="lazy" />
        <span className="truncate font-semibold">{row.team.name}</span>
        <FormDots form={row.form} />
      </div>
      <span className="text-center text-xs text-muted-foreground tabular-nums">{row.played}</span>
      <span className="text-center text-xs text-muted-foreground tabular-nums" dir="ltr">
        {row.goalsDiff > 0 ? `+${row.goalsDiff}` : row.goalsDiff}
      </span>
      <span className="text-center font-black tabular-nums">{row.points}</span>
    </div>
  );
}

export function StandingsSection({ groups, isLoading }: StandingsSectionProps) {
  return (
    <section dir="rtl" className="py-10 bg-muted/30" id="standings">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <ListOrdered className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">ترتيب المجموعات</h2>
            <p className="text-sm text-muted-foreground">
              يتأهل الأول والثاني من كل مجموعة مباشرة، ومعهما أفضل 8 منتخبات من أصحاب المركز الثالث
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && (!groups || groups.length === 0) && (
          <p className="text-center text-sm text-muted-foreground py-10">
            جداول الترتيب تظهر هنا فور انطلاق البطولة
          </p>
        )}

        {!isLoading && groups && groups.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {groups.map((group, index) => (
              <motion.div
                key={group.groupEn}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: Math.min(index * 0.04, 0.25), duration: 0.3 }}
              >
                <Card className="border-0 dark:border dark:border-card-border h-full">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-extrabold text-emerald-700 dark:text-emerald-300">{group.group}</h3>
                      <div className="grid grid-cols-[2rem_2.5rem_2rem] gap-1 text-[10px] text-muted-foreground">
                        <span className="text-center">لعب</span>
                        <span className="text-center">فارق</span>
                        <span className="text-center">نقاط</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {group.rows.map((row) => (
                        <StandingRowItem key={row.team.id} row={row} />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
