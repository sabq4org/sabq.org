/**
 * شريط حقائق كأس آسيا — حامل اللقب + الأكثر تتويجًا + المضيف.
 * بيانات TheSports عبر /api/asian-cup/facts. يختفي بالكامل إن لم تتوفر أي
 * حقيقة (أفضل جهد — لا حالة فارغة مزعجة). مرآة TournamentFacts المونديالية.
 */
import { useQuery } from "@tanstack/react-query";
import { Crown, MapPin, Trophy } from "lucide-react";

interface AcCompetitionFacts {
  available: boolean;
  titleHolder: { name: string; titles: number | null } | null;
  mostTitles: { names: string[]; titles: number | null } | null;
  host: string | null;
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
        <div className="text-sm font-bold">{children}</div>
      </div>
    </div>
  );
}

export function AcFacts() {
  const { data } = useQuery<AcCompetitionFacts>({
    queryKey: ["/api/asian-cup/facts"],
    staleTime: 60 * 60 * 1000,
  });

  if (!data?.available) return null;
  const { titleHolder, mostTitles, host } = data;

  return (
    <section dir="rtl" className="border-b border-border/60 bg-muted/20 py-5">
      <div className="max-w-5xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {titleHolder && (
          <FactCard icon={<Trophy className="h-4 w-4" />} label="حامل اللقب">
            {titleHolder.name}
            {titleHolder.titles ? (
              <span className="text-xs text-muted-foreground font-normal"> · {titleHolder.titles} ألقاب</span>
            ) : null}
          </FactCard>
        )}
        {mostTitles && (
          <FactCard icon={<Crown className="h-4 w-4" />} label="الأكثر تتويجًا">
            {mostTitles.names.join("، ")}
            {mostTitles.titles ? (
              <span className="text-xs text-muted-foreground font-normal"> · {mostTitles.titles} ألقاب</span>
            ) : null}
          </FactCard>
        )}
        {host && (
          <FactCard icon={<MapPin className="h-4 w-4" />} label="الدولة المضيفة">
            {host}
          </FactCard>
        )}
      </div>
    </section>
  );
}
