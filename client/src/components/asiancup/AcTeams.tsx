import { motion } from "framer-motion";
import { Star, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { SAUDI_TEAM_ID, type AcTeam } from "./acTypes";

export function AcTeams({ teams, isLoading }: { teams: AcTeam[]; isLoading: boolean }) {
  return (
    <section id="ac-teams" dir="rtl" className="container max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex items-center gap-2">
        <Users className="h-6 w-6 text-emerald-500" />
        <h2 className="text-2xl font-black text-foreground">المنتخبات المتأهّلة</h2>
        {!!teams.length && (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
            {teams.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
          ستظهر المنتخبات المتأهّلة هنا فور اكتمال التصفيات والقرعة.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {teams.map((team, idx) => {
            const isHost = team.id === SAUDI_TEAM_ID;
            return (
              <Link key={team.id} href={`/asian-cup/team/${team.id}`}>
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: Math.min(idx * 0.02, 0.4) }}
                className={`group relative flex flex-col items-center gap-2 rounded-2xl border p-4 transition-shadow hover:shadow-md ${
                  isHost
                    ? "border-emerald-400/60 bg-gradient-to-b from-emerald-50 to-card dark:from-emerald-950/30"
                    : "border-border bg-card"
                }`}
              >
                {isHost && (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    <Star className="h-2.5 w-2.5 fill-white" />
                    مضيف
                  </span>
                )}
                <div className="h-14 w-14 rounded-full bg-white p-1.5 ring-1 ring-black/5 transition-transform group-hover:scale-110">
                  {team.logo ? (
                    <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
                  ) : null}
                </div>
                <span className="text-center text-xs font-bold text-foreground">{team.name}</span>
              </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
