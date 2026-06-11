import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SAUDI_TEAM_ID, type WcSquad, type WcTeam } from "./wcTypes";

/** المنتخبات الـ48 — والضغط على أي منتخب يفتح قائمته الكاملة */

const POSITION_SECTIONS = [
  { en: "Goalkeeper", label: "حراسة المرمى" },
  { en: "Defender", label: "الدفاع" },
  { en: "Midfielder", label: "الوسط" },
  { en: "Attacker", label: "الهجوم" },
];

function TeamSquadDialog({ team, onClose }: { team: WcTeam | null; onClose: () => void }) {
  const { data: squad, isLoading } = useQuery<WcSquad>({
    queryKey: [`/api/world-cup/squad/${team?.id}`],
    enabled: team != null,
    staleTime: 60 * 60 * 1000,
  });

  return (
    <Dialog open={team != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {team && (
              <>
                <span className="h-10 w-10 rounded-full bg-white ring-1 ring-border p-1 shrink-0">
                  <img src={team.logo} alt={team.name} className="h-full w-full object-contain" />
                </span>
                قائمة منتخب {team.name}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* تمرير أصلي — react-remove-scroll في نافذة Radix يحجب ScrollArea على اللمس */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain pe-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {isLoading && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && (!squad || squad.players.length === 0) && (
            <p className="text-center text-sm text-muted-foreground py-8">
              القائمة الرسمية لم تُعلن بعد
            </p>
          )}

          {squad && squad.players.length > 0 && (
            <div className="space-y-4 py-1">
              {POSITION_SECTIONS.map((section) => {
                const players = squad.players.filter((p) => p.positionEn === section.en);
                if (players.length === 0) return null;
                return (
                  <div key={section.en}>
                    <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2">
                      {section.label}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {players.map((player) => (
                        <div
                          key={player.id || `${player.name}-${player.number}`}
                          className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-2.5 py-1.5"
                        >
                          <div className="h-9 w-9 rounded-full overflow-hidden bg-muted shrink-0">
                            {player.photo && (
                              <img src={player.photo} alt={player.name} className="h-full w-full object-cover" loading="lazy" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold truncate">{player.name}</p>
                            {player.age != null && (
                              <p className="text-[10px] text-muted-foreground">{player.age} سنة</p>
                            )}
                          </div>
                          <span className="text-sm font-black text-muted-foreground tabular-nums shrink-0">
                            {player.number ?? "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TeamsSection() {
  const [openTeam, setOpenTeam] = useState<WcTeam | null>(null);
  const { data, isLoading } = useQuery<{ teams: WcTeam[] }>({
    queryKey: ["/api/world-cup/teams"],
    staleTime: 60 * 60 * 1000,
  });
  const teams = Array.isArray(data?.teams) ? data.teams : [];

  return (
    <section dir="rtl" className="py-10 bg-muted/30" id="teams">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">المنتخبات</h2>
            <p className="text-sm text-muted-foreground">48 منتخبًا — اضغط على أي منتخب لعرض قائمته الكاملة</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
            {Array.from({ length: 16 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35 }}
            className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5"
          >
            {teams.map((team) => {
              const isSaudi = team.id === SAUDI_TEAM_ID;
              return (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setOpenTeam(team)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl bg-card px-2 py-3 hover-elevate active-elevate-2 transition-all dark:border dark:border-card-border ${
                    isSaudi ? "ring-2 ring-emerald-500" : ""
                  }`}
                  data-testid={`wc-team-${team.id}`}
                >
                  <span className="h-9 w-9 rounded-full bg-white ring-1 ring-border p-1">
                    <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
                  </span>
                  <span className="text-[11px] font-bold text-center leading-tight line-clamp-1">{team.name}</span>
                  {isSaudi && (
                    <Badge className="bg-emerald-500 text-white border-0 text-[9px] px-1.5 py-0">الأخضر</Badge>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </div>

      <TeamSquadDialog team={openTeam} onClose={() => setOpenTeam(null)} />
    </section>
  );
}
