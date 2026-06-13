import { Crown, Trophy } from "lucide-react";
import type { LeaderRow } from "./predictionsTypes";

const RANK_STYLES: Record<number, string> = {
  1: "bg-amber-400 text-amber-950",
  2: "bg-slate-300 text-slate-800",
  3: "bg-orange-400 text-orange-950",
};

function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  if (avatar) {
    return <img src={avatar} alt={name} className="h-9 w-9 rounded-full object-cover ring-1 ring-border" loading="lazy" />;
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-700 dark:text-emerald-300">
      {name.charAt(0) || "؟"}
    </div>
  );
}

interface Props {
  leaders: LeaderRow[];
  currentUserId?: string;
  isLoading: boolean;
}

export function PredictionsLeaderboard({ leaders, currentUserId, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (leaders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-12 text-center">
        <Trophy className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">لا متصدّرين بعد — كن أول من يربح نقاط التوقّعات!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {leaders.map((row) => {
        const isMe = row.userId === currentUserId;
        return (
          <div
            key={row.userId}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
              isMe
                ? "bg-emerald-500/10 ring-1 ring-emerald-500/40"
                : "bg-card hover-elevate"
            }`}
            data-testid={`wc-leader-${row.rank}`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black tabular-nums ${
                RANK_STYLES[row.rank] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {row.rank <= 3 ? <Crown className="h-4 w-4" /> : row.rank}
            </div>
            <Avatar name={row.name} avatar={row.avatar} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {row.name}
                {isMe && <span className="mr-1 text-[11px] font-normal text-emerald-600 dark:text-emerald-400"> (أنت)</span>}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {row.correctCount.toLocaleString("ar-SA")} إصابة دقيقة · {row.playedCount.toLocaleString("ar-SA")} مباراة
              </p>
            </div>
            <div className="shrink-0 text-left">
              <span className="text-base font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                {row.totalPoints.toLocaleString("ar-SA")}
              </span>
              <span className="mr-1 text-[11px] text-muted-foreground">نقطة</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
