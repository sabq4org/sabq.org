import { Clock, Trophy, X } from "lucide-react";
import { formatKickoffDay } from "../wcTypes";
import { formatNumber } from "@/lib/format";
import type { MyPredictionRow } from "./predictionsTypes";

function MiniTeam({ name, logo }: { name: string | null; logo: string | null }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {logo && <img src={logo} alt={name ?? ""} className="h-5 w-5 rounded-full object-contain bg-white ring-1 ring-border" loading="lazy" />}
      <span className="truncate text-xs font-semibold">{name ?? "—"}</span>
    </div>
  );
}

interface Props {
  predictions: MyPredictionRow[];
  isLoading: boolean;
}

export function MyPredictionsList({ predictions, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-12 text-center">
        <Trophy className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">لم تضع أي توقّع بعد — ابدأ من تبويب «مباريات اليوم».</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {predictions.map((p) => {
        const settled = p.matchStatus === "settled";
        const isWin = settled && p.status === "correct";
        return (
          <div
            key={p.fixtureId}
            className={`rounded-xl px-3.5 py-3 ${isWin ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "bg-card border border-card-border"}`}
            data-testid={`wc-my-pred-${p.fixtureId}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="grid min-w-0 flex-1 gap-1">
                <MiniTeam name={p.homeTeamName} logo={p.homeTeamLogo} />
                <MiniTeam name={p.awayTeamName} logo={p.awayTeamLogo} />
              </div>

              {/* توقّعي مقابل النتيجة */}
              <div className="flex items-center gap-3 text-center shrink-0">
                <div>
                  <p className="text-[10px] text-muted-foreground">توقّعي</p>
                  <p className="text-lg font-black tabular-nums" dir="ltr">{p.predHome} - {p.predAway}</p>
                </div>
                {settled && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">النتيجة</p>
                    <p className="text-lg font-black tabular-nums" dir="ltr">{p.finalHome} - {p.finalAway}</p>
                    {/* خروج المغلوب: «1-1» وحدها مضلِّلة — نوضّح من تأهّل بالترجيح. */}
                    {p.finalPenHome != null && p.finalPenAway != null && p.finalPenHome !== p.finalPenAway && (
                      <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400" dir="rtl">
                        ترجيح{" "}
                        <span dir="ltr">{Math.max(p.finalPenHome, p.finalPenAway)}-{Math.min(p.finalPenHome, p.finalPenAway)}</span>
                        {" · "}
                        {(p.finalPenHome > p.finalPenAway ? p.homeTeamName : p.awayTeamName) ?? ""}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* الحالة */}
              <div className="shrink-0 w-20 text-left">
                {settled ? (
                  isWin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-black text-white">
                      <Trophy className="h-3 w-3" /> +{formatNumber(p.pointsAwarded)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                      <X className="h-3.5 w-3.5" /> لم تُصب
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" /> قيد الانتظار
                  </span>
                )}
              </div>
            </div>

            {p.kickoffAt && (
              <p className="mt-1.5 text-[10px] text-muted-foreground">{formatKickoffDay(p.kickoffAt)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
