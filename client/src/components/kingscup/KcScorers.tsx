import { Goal } from "lucide-react";
import type { KcScorer } from "./kcTypes";

export function KcScorers({
  scorers,
  isLoading,
  onOpenPlayer,
}: {
  scorers: KcScorer[];
  isLoading: boolean;
  onOpenPlayer: (id: number) => void;
}) {
  if (!isLoading && scorers.length === 0) return null;

  return (
    <section id="kc-scorers" className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-2 mb-5">
        <Goal className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-black">الهدّافون</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">جارٍ تحميل قائمة الهدّافين…</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {scorers.map((s) => (
            <button
              key={`${s.id}-${s.rank}`}
              type="button"
              onClick={() => s.id > 0 && onOpenPlayer(s.id)}
              data-testid={`kc-scorer-${s.id}`}
              className="w-full flex items-center gap-3 p-3 hover-elevate active-elevate-2 text-right"
            >
              <span className="w-6 text-center text-sm font-black text-muted-foreground tabular-nums">
                {s.rank}
              </span>
              {s.photo ? (
                <img src={s.photo} alt={s.name} className="h-10 w-10 rounded-full object-cover bg-muted" loading="lazy" />
              ) : (
                <span className="h-10 w-10 rounded-full bg-muted" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{s.name}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {s.team?.logo && <img src={s.team.logo} alt="" className="h-4 w-4 object-contain" />}
                  <span className="truncate">{s.team?.name}</span>
                </div>
              </div>
              <div className="text-left shrink-0">
                <span className="text-lg font-black text-emerald-600 tabular-nums">{s.goals}</span>
                <span className="text-[11px] text-muted-foreground block">هدف</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
