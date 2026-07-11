import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ListOrdered, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { WcGroup, WcQualifyStatus, WcStandingRow } from "./wcTypes";

interface StandingsSectionProps {
  groups: WcGroup[] | undefined;
  isLoading: boolean;
}

const FORM_COLOR: Record<string, string> = {
  W: "bg-emerald-500",
  D: "bg-zinc-400",
  L: "bg-red-500",
};

// شارات حالة التأهّل (تُحسب خادميًّا من المباريات المتبقّية)
const QUALIFY_META: Record<WcQualifyStatus, { dot: string; bar: string; label: string }> = {
  qualified: { dot: "bg-emerald-500", bar: "border-emerald-500 bg-emerald-500/[0.08]", label: "تأهّل" },
  contention: { dot: "bg-amber-500", bar: "border-amber-500 bg-amber-500/[0.06]", label: "في الصراع" },
  eliminated: { dot: "bg-red-500", bar: "border-red-400/60", label: "خارج" },
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
  const meta = row.qualifyStatus ? QUALIFY_META[row.qualifyStatus] : null;
  // حالة التأهّل تتقدّم على تلوين المركز؛ وعند انتهاء دور المجموعات نعود للمركز.
  const highlight = meta
    ? `border-r-2 ${meta.bar}`
    : row.rank <= 2
      ? "bg-emerald-500/[0.08] border-r-2 border-emerald-500"
      : row.rank === 3
        ? "bg-amber-500/[0.08] border-r-2 border-amber-500"
        : "border-r-2 border-transparent";
  const dim = row.qualifyStatus === "eliminated" ? "opacity-60" : "";
  return (
    <div className={`grid grid-cols-[1.25rem_1fr_2rem_2.5rem_2rem] items-center gap-1 rounded-md px-2 py-1.5 text-sm ${highlight} ${dim} ${row.live ? "bg-emerald-500/[0.06]" : ""}`}>
      <span className="inline-flex items-center justify-center gap-0.5 text-xs text-muted-foreground tabular-nums">
        {row.rank}
        {row.live && (row.liveDelta ?? 0) > 0 && <ArrowUp className="h-3 w-3 text-emerald-500" aria-label={`صعد ${row.liveDelta} مركزًا`} />}
        {row.live && (row.liveDelta ?? 0) < 0 && <ArrowDown className="h-3 w-3 text-rose-500" aria-label={`هبط ${Math.abs(row.liveDelta ?? 0)} مركزًا`} />}
        {row.live && (row.liveDelta ?? 0) === 0 && <Minus className="h-3 w-3 text-muted-foreground/50" aria-label="ثابت لحظيًا" />}
      </span>
      <div className="flex items-center gap-2 min-w-0">
        <Link
          href={`/world-cup/team/${row.team.id}`}
          className="flex items-center gap-2 min-w-0 rounded hover-elevate active-elevate-2 px-1 -mx-1 transition-all"
        >
          <img src={row.team.logo} alt={row.team.name} className="h-[18px] w-[18px] object-contain shrink-0" loading="lazy" />
          <span className="truncate font-semibold">{row.team.name}</span>
        </Link>
        {row.live && (
          <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-black text-red-600 dark:text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            مباشر
          </span>
        )}
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
  const hasStatus = (groups ?? []).some((g) => g.rows.some((r) => r.qualifyStatus));
  const isLive = (groups ?? []).some((g) => g.rows.some((r) => r.live));
  return (
    <section dir="rtl" className="py-10 bg-muted/30" id="standings">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <ListOrdered className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">ترتيب المجموعات</h2>
                {isLive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                    </span>
                    تحديث لحظي
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                يتأهل الأول والثاني من كل مجموعة مباشرة، ومعهما أفضل 8 منتخبات من أصحاب المركز الثالث
              </p>
            </div>
          </div>
          {hasStatus && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {(["qualified", "contention", "eliminated"] as WcQualifyStatus[]).map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-3.5 rounded-sm ${QUALIFY_META[s].dot}`} />
                  {QUALIFY_META[s].label}
                </span>
              ))}
            </div>
          )}
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
