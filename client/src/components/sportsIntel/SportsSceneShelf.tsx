/**
 * رفّ «المشهد الآن» — يعرض لقطات الذكاء الرياضي (global) التي يولّدها المحرّك من
 * المباريات الحيّة/اليوم مرتّبةً بالأهمية. يستهلك /api/sports/intel/scene ويُحدَّث
 * دورياً. يختفي بسلاسة إن لم يكن المحرّك مهيّأً أو لا لقطات — لا يُفرغ التصميم.
 */
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ChevronLeft } from "lucide-react";
import type { IntelInsight, SceneResponse } from "./types";

function SceneCard({ card, onOpenMatch }: { card: IntelInsight; onOpenMatch?: (id: number) => void }) {
  const fixtureId = card.entities?.fixtureId;
  const clickable = typeof fixtureId === "number" && !!onOpenMatch;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={() => clickable && onOpenMatch!(fixtureId!)}
      data-testid={`scene-card-${card.id}`}
      className={`flex w-[280px] shrink-0 flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-right transition-colors ${clickable ? "cursor-pointer hover:border-primary/40" : "cursor-default"}`}
    >
      <h4 className="line-clamp-2 text-sm font-extrabold leading-snug text-foreground">{card.headline}</h4>
      <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{card.body}</p>
      {clickable && (
        <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-bold text-primary">
          تفاصيل المباراة
          <ChevronLeft className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}

export function SportsSceneShelf({ onOpenMatch }: { onOpenMatch?: (id: number) => void }) {
  const { data } = useQuery<SceneResponse>({
    queryKey: ["/api/sports/intel/scene"],
    refetchInterval: 90_000,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });

  if (!data?.configured) return null;
  const cards = Array.isArray(data.cards) ? data.cards : [];
  if (cards.length === 0 && !data.summary) return null;

  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-8 sm:px-6 sm:pt-10">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-l from-primary/[0.06] to-transparent p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="flex flex-col">
            <h3 className="text-base font-extrabold text-foreground sm:text-lg">المشهد الآن</h3>
            <span className="text-[11px] font-bold text-primary/70">قراءة ذكية للمشهد الرياضي — من سبق</span>
          </div>
        </div>

        {data.summary?.body && (
          <p className="mb-4 rounded-xl bg-card/70 p-3 text-sm font-medium leading-relaxed text-foreground">
            {data.summary.body}
          </p>
        )}

        {cards.length > 0 && (
          <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-1">
            {cards.map((c) => (
              <SceneCard key={c.id} card={c} onOpenMatch={onOpenMatch} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
