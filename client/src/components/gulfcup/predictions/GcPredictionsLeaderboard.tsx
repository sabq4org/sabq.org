import { Crown, Medal, Trophy } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { GcLeaderRow } from "./gcPredictionTypes";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-5 w-5 text-amber-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-slate-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
  return <span className="grid h-5 w-5 place-items-center text-xs font-black tabular-nums text-muted-foreground">{rank}</span>;
}

export function GcPredictionsLeaderboard({
  leaders,
  currentUserId,
  isLoading,
}: {
  leaders: GcLeaderRow[];
  currentUserId?: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (leaders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-14 text-center">
        <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-bold">لا متصدّرين بعد</p>
        <p className="mt-1 text-sm text-muted-foreground">تظهر اللوحة فور تسوية أول مباراة — كن أول من يتصدّر.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {leaders.map((l) => {
        const me = l.userId === currentUserId;
        return (
          <div
            key={l.userId}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              me
                ? "border-amber-400/60 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-950/30"
                : "border-border bg-card"
            }`}
            data-testid={`gc-leader-${l.rank}`}
          >
            <div className="flex w-6 shrink-0 justify-center">
              <RankBadge rank={l.rank} />
            </div>
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border">
              {l.avatar ? (
                <img src={l.avatar} alt={l.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="grid h-full w-full place-items-center text-xs font-black text-muted-foreground">
                  {l.name.slice(0, 1)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {l.name}
                {me && <span className="mr-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400"> (أنت)</span>}
              </p>
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>دقّة {l.accuracy}%</span>
                <span>🎯 {formatNumber(l.exactCount)} مطابقة</span>
              </p>
            </div>
            <div className="shrink-0 text-left">
              <p className="text-base font-black tabular-nums text-amber-700 dark:text-amber-300">
                {formatNumber(l.totalPoints)}
              </p>
              <p className="text-[10px] text-muted-foreground">نقطة</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
