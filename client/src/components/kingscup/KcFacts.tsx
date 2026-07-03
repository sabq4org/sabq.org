/**
 * شريط حقائق كأس الملك — نفس شريط حقائق المونديال (TournamentFacts):
 * بطاقات صغيرة بأيقونة + وسم + قيمة على شريط رمادي فاصل تحت الهيرو.
 * يختفي بالكامل إن لم تتوفر أي حقيقة (أفضل جهد — لا حالة فارغة مزعجة).
 */
import { useQuery } from "@tanstack/react-query";
import { Award, Trophy } from "lucide-react";
import type { KcHistory } from "./kcTypes";

function FactCard({
  icon,
  label,
  children,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
        {icon}
      </div>
      <div className="min-w-0 text-right">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover-elevate active-elevate-2 transition-all"
      >
        {inner}
      </button>
    );
  }
  return <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">{inner}</div>;
}

export function KcFacts({ onOpenPlayer }: { onOpenPlayer?: (id: number) => void }) {
  const { data } = useQuery<KcHistory>({
    queryKey: ["/api/kings-cup/history"],
    staleTime: 60 * 60_000,
  });

  if (!data?.champion && !data?.topScorer) return null;

  return (
    <section dir="rtl" className="border-b border-border/60 bg-muted/20 py-5">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.champion && (
            <FactCard
              icon={<Trophy className="h-5 w-5" />}
              label={`حامل اللقب${data.previousSeason ? ` (${data.previousSeason})` : ""}`}
            >
              <span className="inline-flex items-center gap-1.5 font-bold">
                <img src={data.champion.logo} alt={data.champion.name} className="h-5 w-5 object-contain shrink-0" loading="lazy" />
                {data.champion.name}
              </span>
            </FactCard>
          )}
          {data.topScorer && (
            <FactCard
              icon={<Award className="h-5 w-5" />}
              label="هدّاف النسخة السابقة"
              onClick={
                data.topScorer.id > 0 && onOpenPlayer
                  ? () => data.topScorer && onOpenPlayer(data.topScorer.id)
                  : undefined
              }
            >
              <span className="inline-flex items-center gap-1.5 font-bold">
                {data.topScorer.photo && (
                  <img src={data.topScorer.photo} alt={data.topScorer.name} className="h-5 w-5 rounded-full object-cover shrink-0" loading="lazy" />
                )}
                {data.topScorer.name}
                <span className="text-xs font-normal text-muted-foreground">({data.topScorer.goals} أهداف)</span>
              </span>
            </FactCard>
          )}
        </div>
      </div>
    </section>
  );
}
