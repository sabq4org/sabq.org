import { Crown, Medal, Target, Trophy } from "lucide-react";
import { formatNumber } from "@/lib/format";
import type { AcLeaderRow, AcLeaderboardViewer } from "./acPredictionTypes";

/** سقف الخادم لعدد الصفوف المعروضة (parseLeaderboardLimit في المسار). */
const SERVER_LIMIT_CAP = 500;

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="h-5 w-5 text-amber-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-slate-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-700" />;
  return <span className="grid h-5 w-5 place-items-center text-xs font-black tabular-nums text-muted-foreground">{rank}</span>;
}

export function AcPredictionsLeaderboard({
  leaders,
  currentUserId,
  isLoading,
  total,
  viewer,
  viewerName,
  viewerAvatar,
  onLoadMore,
  loadingMore,
}: {
  leaders: AcLeaderRow[];
  currentUserId?: string;
  isLoading: boolean;
  /** العدد الكلي للمشاركين المؤهّلين — لإظهار «عرض المزيد» وعداد المشاركين. */
  total?: number;
  /** صف الزائر ورتبته الحقيقية — يُثبَّت أسفل القائمة متى كان خارجها. */
  viewer?: AcLeaderboardViewer | null;
  viewerName?: string;
  viewerAvatar?: string | null;
  onLoadMore?: () => void;
  loadingMore?: boolean;
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
      {leaders.map((l) => {
        const me = l.userId === currentUserId;
        return (
          <div
            key={l.userId}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              me
                ? "border-emerald-400/60 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-950/30"
                : "border-border bg-card"
            }`}
            data-testid={`ac-leader-${l.rank}`}
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
                {me && <span className="mr-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"> (أنت)</span>}
              </p>
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>دقّة {l.accuracy}%</span>
                <span className="inline-flex items-center gap-0.5">
                  <Target className="h-3 w-3" /> {formatNumber(l.exactCount)} مطابقة
                </span>
              </p>
            </div>
            <div className="shrink-0 text-left">
              <p className="text-base font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatNumber(l.totalPoints)}
              </p>
              <p className="text-[10px] text-muted-foreground">نقطة</p>
            </div>
          </div>
        );
      })}

      {/* صف الزائر المثبَّت — رتبته الحقيقية وهو خارج الصفحة المعروضة */}
      {viewer && currentUserId && !viewerInList && (
        <div className="border-t border-dashed border-border pt-2">
          <div
            className="flex items-center gap-3 rounded-xl border border-emerald-400/60 bg-emerald-50/70 px-3 py-2.5 dark:border-emerald-500/40 dark:bg-emerald-950/30"
            data-testid="ac-leader-viewer"
          >
            <div className="flex w-6 shrink-0 justify-center">
              <span className="grid h-5 w-5 place-items-center text-xs font-black tabular-nums text-muted-foreground">
                {viewer.rank}
              </span>
            </div>
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border">
              {viewerAvatar ? (
                <img src={viewerAvatar} alt={viewerName || "أنت"} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="grid h-full w-full place-items-center text-xs font-black text-muted-foreground">
                  {(viewerName || "أ").slice(0, 1)}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {viewerName || "أنت"}
                <span className="mr-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"> (أنت)</span>
              </p>
              <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>دقّة {viewer.accuracy}%</span>
                <span className="inline-flex items-center gap-0.5">
                  <Target className="h-3 w-3" /> {formatNumber(viewer.exactCount)} مطابقة
                </span>
              </p>
            </div>
            <div className="shrink-0 text-left">
              <p className="text-base font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                {formatNumber(viewer.totalPoints)}
              </p>
              <p className="text-[10px] text-muted-foreground">نقطة</p>
            </div>
          </div>
        </div>
      )}

      {canLoadMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full rounded-xl border border-border py-2.5 text-sm font-bold text-muted-foreground transition hover:bg-muted disabled:opacity-60"
          data-testid="ac-leaders-load-more"
        >
          {loadingMore
            ? "جارٍ التحميل…"
            : `عرض المزيد (${formatNumber(leaders.length)} من ${formatNumber(total!)})`}
        </button>
      )}
    </div>
  );
}
