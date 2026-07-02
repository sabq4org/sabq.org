import { Link } from "wouter";
import { Shield } from "lucide-react";
import type { KcTeam } from "./kcTypes";

export function KcTeams({ teams, isLoading }: { teams: KcTeam[]; isLoading: boolean }) {
  if (!isLoading && teams.length === 0) return null;

  return (
    <section id="kc-teams" className="bg-muted/30 border-y border-border">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 mb-5">
          <Shield className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-black">الأندية المشاركة</h2>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">جارٍ تحميل الأندية…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {teams.map((t) => (
              <Link key={t.id} href={`/kings-cup/team/${t.id}`}>
                <a
                  data-testid={`kc-team-${t.id}`}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 hover-elevate active-elevate-2 transition-all"
                >
                  <span className="h-14 w-14 rounded-full bg-white p-1.5 ring-1 ring-border shadow-sm">
                    <img src={t.logo} alt={t.name} className="h-full w-full object-contain" loading="lazy" />
                  </span>
                  <span className="text-xs font-bold text-center truncate w-full">{t.name}</span>
                </a>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
