import { Crown, Trophy } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { LeaderRow, LeaderboardViewer } from "./predictionsTypes";

/** سقف الخادم لعدد الصفوف المعروضة (parseLeaderboardLimit في المسار). */
const SERVER_LIMIT_CAP = 500;

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
  /** العدد الكلي للمشاركين المؤهّلين — لإظهار «عرض المزيد» وعداد المشاركين. */
  total?: number;
  /** صف الزائر ورتبته الحقيقية — يُثبَّت أسفل القائمة متى كان خارجها. */
  viewer?: LeaderboardViewer | null;
  viewerName?: string;
  viewerAvatar?: string | null;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export function PredictionsLeaderboard({
  leaders,
  currentUserId,
  isLoading,
  total,
  viewer,
  viewerName,
  viewerAvatar,
  onLoadMore,
  loadingMore,
}: Props) {
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

  const viewerInList = !!currentUserId && leaders.some((l) => l.userId === currentUserId);
  const canLoadMore =
    !!onLoadMore && typeof total === "number" && leaders.length < Math.min(total, SERVER_LIMIT_CAP);

  return (
    <div className="space-y-2">
      {typeof total === "number" && total > 0 && (
        <p className="px-1 text-[11px] text-muted-foreground">
          {formatNumber(total)} مشاركًا في المسابقة
        </p>
      )}
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
                {formatNumber(row.correctCount)} إصابة دقيقة · {formatNumber(row.playedCount)} مباراة
              </p>
            </div>
            <div className="shrink-0 text-left">
              <span className="text-base font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatNumber(row.totalPoints)}
              </span>
              <span className="mr-1 text-[11px] text-muted-foreground">نقطة</span>
            </div>
          </div>
        );
      })}

      {/* صف الزائر المثبَّت — رتبته الحقيقية وهو خارج الصفحة المعروضة */}
      {viewer && currentUserId && !viewerInList && (
        <div className="border-t border-dashed border-border pt-2">
          <div
            className="flex items-center gap-3 rounded-xl bg-emerald-500/10 px-3 py-2.5 ring-1 ring-emerald-500/40"
            data-testid="wc-leader-viewer"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-black tabular-nums text-muted-foreground">
              {viewer.rank}
            </div>
            <Avatar name={viewerName || "أنت"} avatar={viewerAvatar ?? null} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {viewerName || "أنت"}
                <span className="mr-1 text-[11px] font-normal text-emerald-600 dark:text-emerald-400"> (أنت)</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatNumber(viewer.correctCount)} إصابة دقيقة · {formatNumber(viewer.playedCount)} مباراة
              </p>
            </div>
            <div className="shrink-0 text-left">
              <span className="text-base font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatNumber(viewer.totalPoints)}
              </span>
              <span className="mr-1 text-[11px] text-muted-foreground">نقطة</span>
            </div>
          </div>
        </div>
      )}

      {canLoadMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full rounded-xl border border-border py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted disabled:opacity-60"
          data-testid="wc-leaders-load-more"
        >
          {loadingMore
            ? "جارٍ التحميل…"
            : `عرض المزيد (${formatNumber(leaders.length)} من ${formatNumber(total!)})`}
        </button>
      )}
    </div>
  );
}
