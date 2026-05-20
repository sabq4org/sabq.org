import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Coins, Flame, Trophy, ChevronLeft } from "lucide-react";
import {
  LOYALTY_TIERS,
  type LoyaltyTier,
  tierProgress,
} from "@shared/loyalty";
import { formatNumber } from "@/lib/format";

type Summary = {
  points: {
    totalPoints: number;
    currentRank: string;
    rankLevel: number;
    lifetimePoints: number;
  } | null;
  weekPoints: number;
  monthPoints: number;
  streakDays: number;
};

// Profile-page Loyalty Block. Reads /api/loyalty/summary (Phase 2
// endpoint) and renders: tier badge + progress bar to next tier +
// week/month/lifetime triplet + streak chip + "redeem" CTA. The tier
// table comes from shared/loyalty.ts so the labels here cannot drift
// from what the server/migration consider authoritative.
export function LoyaltyBlock() {
  const { data, isLoading } = useQuery<Summary>({
    queryKey: ["/api/loyalty/summary"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const lifetime = data?.points?.lifetimePoints ?? 0;
  const { current, next, pointsToNext } = tierProgress(lifetime);
  const progressPct = next
    ? Math.min(100, ((lifetime - current.minLifetimePoints) / (next.minLifetimePoints - current.minLifetimePoints)) * 100)
    : 100;

  return (
    <Card className="overflow-hidden border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          برنامج الولاء
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <TierBadge tier={current} />
          {data && data.streakDays >= 3 && (
            <div className="ml-auto flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400">
              <Flame className="h-3.5 w-3.5" />
              {formatNumber(data.streakDays)} يوم متتالٍ
            </div>
          )}
        </div>

        <div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundColor: current.color }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {next ? (
              <>
                <span className="font-medium text-foreground">
                  {formatNumber(pointsToNext)}
                </span>{" "}
                نقطة للوصول إلى{" "}
                <span className="font-medium" style={{ color: next.color }}>
                  {next.nameAr}
                </span>
              </>
            ) : (
              <>وصلت إلى أعلى مستوى. شكراً لانتمائك لمجتمع سبق ✨</>
            )}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center pt-1">
          <PointsCell label="هذا الأسبوع" value={data?.weekPoints ?? 0} accent />
          <PointsCell label="هذا الشهر" value={data?.monthPoints ?? 0} />
          <PointsCell label="إجمالي" value={lifetime} />
        </div>

        <Button asChild variant="outline" className="w-full justify-between" data-testid="button-loyalty-account">
          <Link href="/dashboard/loyalty">
            <span className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              نقاطي والمكافآت
            </span>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function TierBadge({ tier }: { tier: LoyaltyTier }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
      style={{
        backgroundColor: `${tier.color}1a`,
        color: tier.color,
        border: `1px solid ${tier.color}40`,
      }}
      data-testid={`tier-badge-l${tier.level}`}
    >
      <Trophy className="h-3.5 w-3.5" />
      {tier.nameAr}
    </div>
  );
}

function PointsCell({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-md bg-background/40 dark:bg-background/20 py-2">
      <div className={`text-base font-bold ${accent ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {value > 0 ? `+${formatNumber(value)}` : formatNumber(value)}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

// Compact tier pill — used in comments and anywhere the writer's name
// shows up so loyalty status is socially visible.
export function TierPill({ level }: { level: number }) {
  const tier = LOYALTY_TIERS.find((t) => t.level === level);
  if (!tier || tier.level === 1) return null; // hide for newcomers
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none"
      style={{
        backgroundColor: `${tier.color}1f`,
        color: tier.color,
      }}
      title={tier.nameAr}
      data-testid={`tier-pill-l${level}`}
    >
      {tier.nameAr}
    </span>
  );
}
