import { Check, Clock, Flame, Sparkles, Target, Trophy, X } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { formatKickoffDay } from "../acTypes";
import type { AcMyPredictionRow } from "./acPredictionTypes";

function Crest({ name, logo }: { name: string; logo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="h-5 w-5 shrink-0 rounded-full bg-white p-px ring-1 ring-border">
        {logo ? <img src={logo} alt={name} className="h-full w-full object-contain" loading="lazy" /> : null}
      </span>
      <span className="truncate text-xs font-bold">{name}</span>
    </span>
  );
}

export function AcMyPredictionsList({
  predictions,
  isLoading,
}: {
  predictions: AcMyPredictionRow[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-14 text-center">
        <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-bold">لم تتوقّع بعد</p>
        <p className="mt-1 text-sm text-muted-foreground">ابدأ من تبويب «المباريات» — توقّعاتك وسجلّ نقاطك يظهران هنا.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {predictions.map((p) => {
        const settled = p.matchStatus === "settled";
        const isWin = settled && p.outcomeHit;
        return (
          <div
            key={p.fixtureId}
            className={`rounded-xl border px-3 py-2.5 ${
              isWin ? "border-emerald-400/50 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-950/20" : "border-border bg-card"
            }`}
            data-testid={`ac-my-pred-${p.fixtureId}`}
          >
            <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-muted-foreground">
              <span>{p.kickoffAt ? formatKickoffDay(p.kickoffAt) : ""}</span>
              {settled ? (
                isWin ? (
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" /> +{formatNumber(p.pointsAwarded)} نقطة
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <X className="h-3 w-3" /> لم تُصب
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> بانتظار
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <Crest name={p.homeTeamName} logo={p.homeTeamLogo} />
                <span className="shrink-0 text-xs font-black tabular-nums text-muted-foreground" dir="ltr">
                  {p.predAway} - {p.predHome}
                </span>
                <Crest name={p.awayTeamName} logo={p.awayTeamLogo} />
              </div>
              {settled && p.finalHome != null && (
                <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums" dir="ltr">
                  النتيجة {p.finalAway}-{p.finalHome}
                </span>
              )}
            </div>

            {isWin && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {p.exactHit && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[9.5px] font-bold text-white">
                    <Target className="h-2.5 w-2.5" /> مطابقة
                  </span>
                )}
                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9.5px] font-bold text-emerald-700 dark:text-emerald-300">
                  <Sparkles className="h-2.5 w-2.5" /> ×{(p.boldnessMult / 100).toFixed(2)}
                </span>
                {p.streakMult > 100 && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-2 py-0.5 text-[9.5px] font-bold text-orange-600 dark:text-orange-400">
                    <Flame className="h-2.5 w-2.5" /> ×{(p.streakMult / 100).toFixed(2)}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
