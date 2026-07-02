import { useQuery } from "@tanstack/react-query";
import { GitBranch } from "lucide-react";
import { KcMatchCard } from "./KcMatchCard";
import type { KcBracket as KcBracketData } from "./kcTypes";

export function KcBracket({ onOpenMatch }: { onOpenMatch: (id: number) => void }) {
  const { data, isLoading } = useQuery<KcBracketData>({
    queryKey: ["/api/kings-cup/bracket"],
    refetchInterval: (query) =>
      (query.state.data?.rounds ?? []).some((r) => r.matches.some((m) => m.status.live))
        ? 15_000
        : 5 * 60_000,
    refetchIntervalInBackground: false,
  });

  const rounds = Array.isArray(data?.rounds) ? data.rounds : [];
  if (!isLoading && rounds.length === 0) return null;

  return (
    <section id="kc-bracket" className="bg-muted/30 border-y border-border">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 mb-5">
          <GitBranch className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-black">الأدوار الإقصائية</h2>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">جارٍ تحميل الشجرة الإقصائية…</p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-3 snap-x">
            {rounds.map((round) => (
              <div key={round.round} className="min-w-[280px] w-[280px] shrink-0 snap-start space-y-3">
                <div className="text-center">
                  <span className="inline-block rounded-full bg-emerald-600/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold px-3 py-1">
                    {round.round}
                  </span>
                </div>
                {round.matches.map((m) => (
                  <KcMatchCard key={m.id} fixture={m} onOpen={onOpenMatch} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
