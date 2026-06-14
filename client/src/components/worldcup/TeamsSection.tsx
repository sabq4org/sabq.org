import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SAUDI_TEAM_ID, type WcTeam } from "./wcTypes";

/** المنتخبات الـ48 — والضغط على أي منتخب يفتح صفحته المتكاملة */

export function TeamsSection() {
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
            <p className="text-sm text-muted-foreground">48 منتخبًا — اضغط على أي منتخب لفتح صفحته</p>
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
                <Link
                  key={team.id}
                  href={`/world-cup/team/${team.id}`}
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
                </Link>
              );
            })}
          </motion.div>
        )}
      </div>
    </section>
  );
}
