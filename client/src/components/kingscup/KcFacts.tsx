import { useQuery } from "@tanstack/react-query";
import { Award, Trophy } from "lucide-react";
import type { KcHistory } from "./kcTypes";

export function KcFacts({ onOpenPlayer }: { onOpenPlayer?: (id: number) => void }) {
  const { data } = useQuery<KcHistory>({
    queryKey: ["/api/kings-cup/history"],
    staleTime: 60 * 60_000,
  });

  if (!data?.champion && !data?.topScorer) return null;

  return (
    <section className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {data.champion && (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <span className="h-14 w-14 rounded-full bg-white p-1.5 ring-1 ring-amber-300/50 shrink-0">
              <img src={data.champion.logo} alt={data.champion.name} className="h-full w-full object-contain" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5 text-amber-500" /> حامل اللقب
                {data.previousSeason ? ` (${data.previousSeason})` : ""}
              </p>
              <p className="text-lg font-black truncate">{data.champion.name}</p>
            </div>
          </div>
        )}
        {data.topScorer && (
          <button
            type="button"
            onClick={() => data.topScorer && data.topScorer.id > 0 && onOpenPlayer?.(data.topScorer.id)}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-right hover-elevate active-elevate-2"
          >
            {data.topScorer.photo ? (
              <img src={data.topScorer.photo} alt={data.topScorer.name} className="h-14 w-14 rounded-full object-cover bg-muted shrink-0" />
            ) : (
              <span className="h-14 w-14 rounded-full bg-muted shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Award className="h-3.5 w-3.5 text-emerald-500" /> هدّاف النسخة السابقة
              </p>
              <p className="text-lg font-black truncate">{data.topScorer.name}</p>
              <p className="text-xs text-muted-foreground">{data.topScorer.goals} أهداف</p>
            </div>
          </button>
        )}
      </div>
    </section>
  );
}
