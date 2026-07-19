/**
 * شريط حقائق البطولة — حامل اللقب + الأكثر تتويجًا + الدول المضيفة.
 * بيانات TheSports عبر /api/world-cup/facts. يختفي بالكامل إن لم تتوفر أي حقيقة
 * (أفضل جهد — لا حالة فارغة مزعجة).
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Crown, MapPin, Trophy } from "lucide-react";
import type { WcCompetitionFacts, WcTeam } from "./wcTypes";

function TeamChip({ team }: { team: WcTeam }) {
  const inner = (
    <span className="inline-flex items-center gap-1.5 font-bold">
      <img src={team.logo} alt={team.name} className="h-5 w-5 object-contain shrink-0" loading="lazy" />
      {team.name}
    </span>
  );
  return team.id > 0 ? (
    <Link href={`/world-cup/team/${team.id}`} className="rounded hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function FactCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

export function TournamentFacts() {
  const { data } = useQuery<WcCompetitionFacts>({
    queryKey: ["/api/world-cup/facts"],
    staleTime: 60 * 60 * 1000,
  });

  if (!data) return null;
  const { defendingChampion, defendingChampionTitles, mostTitles, host } = data;
  if (!defendingChampion && !mostTitles && !host) return null;

  return (
    <section dir="rtl" className="border-b border-border/60 bg-muted/20 py-5">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {defendingChampion && (
            <FactCard icon={<Trophy className="h-5 w-5" />} label="حامل اللقب">
              <span className="flex items-center gap-2 flex-wrap">
                <TeamChip team={defendingChampion} />
                {defendingChampionTitles != null && (
                  <span className="text-xs text-muted-foreground">({defendingChampionTitles} ألقاب)</span>
                )}
              </span>
            </FactCard>
          )}
          {mostTitles && mostTitles.teams.length > 0 && (
            <FactCard icon={<Crown className="h-5 w-5" />} label="الأكثر تتويجًا">
              <span className="flex items-center gap-2 flex-wrap">
                {mostTitles.teams.map((t) => (
                  <TeamChip key={t.id} team={t} />
                ))}
                <span className="text-xs text-muted-foreground">({mostTitles.count} ألقاب)</span>
              </span>
            </FactCard>
          )}
          {host && (
            <FactCard icon={<MapPin className="h-5 w-5" />} label="الاستضافة">
              <span className="font-bold">{host}</span>
            </FactCard>
          )}
        </div>
      </div>
    </section>
  );
}
