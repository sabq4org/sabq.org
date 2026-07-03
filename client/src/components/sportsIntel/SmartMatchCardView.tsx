/**
 * بطاقة المباراة الذكية — تُعرض داخل نافذة المباراة عبر كل البطولات. تستهلك
 * /api/sports/intel/match/:id: عنوان + قراءة (قبل/أثناء/بعد) + نقاط مؤرَّضة،
 * والتوقّع المفسّر إن كانت المباراة مرتقبة. تختفي بسلاسة إن لا محتوى.
 */
import { useQuery } from "@tanstack/react-query";
import { Sparkles, TrendingUp } from "lucide-react";
import type { MatchIntelResponse } from "./types";

const PHASE_LABEL: Record<string, string> = {
  pre: "قبل المباراة",
  live: "قراءة لحظية",
  post: "بعد المباراة",
};

export function SmartMatchCardView({ fixtureId }: { fixtureId: number }) {
  const { data, isLoading } = useQuery<MatchIntelResponse>({
    queryKey: [`/api/sports/intel/match/${fixtureId}`],
    enabled: Number.isFinite(fixtureId),
    refetchInterval: (q) => (q.state.data?.card?.phase === "live" ? 90_000 : false),
    staleTime: 60_000,
  });

  if (!data?.configured) return null;
  const card = data.card;
  const prediction = data.prediction;
  if (isLoading && !card && !prediction) return null;
  if (!card && !prediction) return null;

  return (
    <div className="space-y-3">
      {card && (
        <div className="rounded-2xl border border-primary/15 bg-gradient-to-l from-primary/[0.06] to-transparent p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-extrabold text-primary/80">تحليل سبق الذكي</span>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
              {PHASE_LABEL[card.phase] ?? ""}
            </span>
          </div>
          <h4 className="mb-1.5 text-sm font-extrabold leading-snug text-foreground">{card.headline}</h4>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{card.body}</p>
          {card.bullets.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {card.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {prediction && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-xs font-extrabold text-foreground">{prediction.headline}</span>
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">{prediction.body}</p>
          {prediction.probabilities && (
            <div className="mt-3 flex overflow-hidden rounded-lg text-center text-[11px] font-bold text-white">
              <div className="bg-primary py-1" style={{ width: `${prediction.probabilities.home}%` }}>
                {prediction.probabilities.home}%
              </div>
              <div className="bg-muted-foreground/60 py-1 text-white" style={{ width: `${prediction.probabilities.draw}%` }}>
                {prediction.probabilities.draw}%
              </div>
              <div className="bg-amber-500 py-1" style={{ width: `${prediction.probabilities.away}%` }}>
                {prediction.probabilities.away}%
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
