import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Trophy, Flame, ChevronLeft } from "lucide-react";
import { tierProgress } from "@shared/loyalty";
import { useAuth } from "@/hooks/useAuth";
import { formatNumber } from "@/lib/format";

type Summary = {
  points: { lifetimePoints: number; rankLevel: number; currentRank: string } | null;
  weekPoints: number;
  streakDays: number;
};

// Compact horizontal strip embedded above the "رحلتك المعرفية" block.
// Shows: tier dot + name, week points (positive number), streak (if ≥3),
// and a progress bar toward the next tier. Clicks through to
// /dashboard/loyalty for the full view. Hidden for signed-out users.
export function LoyaltyStrip() {
  const { user } = useAuth();
  const { data } = useQuery<Summary>({
    queryKey: ["/api/loyalty/summary"],
    enabled: !!user,
  });

  if (!user || !data) return null;

  const lifetime = data.points?.lifetimePoints ?? 0;
  const { current, next, pointsToNext } = tierProgress(lifetime);
  const progressPct = next
    ? Math.min(100, ((lifetime - current.minLifetimePoints) / (next.minLifetimePoints - current.minLifetimePoints)) * 100)
    : 100;

  return (
    <Link
      href="/dashboard/loyalty"
      className="group block rounded-lg border bg-card hover:bg-accent/40 transition-colors px-3 py-2.5 mb-3"
      data-testid="loyalty-strip"
      dir="rtl"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
          style={{ backgroundColor: `${current.color}1f`, color: current.color }}
        >
          <Trophy className="h-3.5 w-3.5" />
        </div>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="font-semibold" style={{ color: current.color }}>
            {current.nameAr}
          </span>
          {data.weekPoints > 0 && (
            <span className="text-muted-foreground text-xs">
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                +{formatNumber(data.weekPoints)}
              </span>{" "}
              هذا الأسبوع
            </span>
          )}
          {data.streakDays >= 3 && (
            <span className="hidden sm:inline-flex items-center gap-0.5 text-xs text-orange-600 dark:text-orange-400">
              <Flame className="h-3 w-3" />
              {data.streakDays}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 hidden md:block">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden max-w-xs ml-auto">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundColor: current.color }}
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground shrink-0 flex items-center gap-0.5">
          {next ? (
            <>
              <span className="hidden sm:inline">{formatNumber(pointsToNext)} لـ {next.nameAr}</span>
              <span className="sm:hidden">{formatNumber(pointsToNext)}</span>
            </>
          ) : (
            <span>أعلى مستوى</span>
          )}
          <ChevronLeft className="h-3 w-3 group-hover:translate-x-[-2px] transition-transform" />
        </div>
      </div>
    </Link>
  );
}
