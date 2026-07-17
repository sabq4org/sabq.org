import { Trophy, Sparkles } from "lucide-react";
import { computeTier, type LoyaltyTier } from "@shared/loyalty";

type Props = {
  userName: string;
  userId: string;
  lifetimePoints: number;
  memberSince?: string | Date | null;
  /** Override the computed tier. Used by the membership-since-Phase-1
   *  grandfather rule on the rare row where currentRank text already
   *  reflects a higher level than lifetimePoints alone would compute. */
  rankLevel?: number;
};

// Visual membership card. Rendered on the profile page as the
// loyalty centerpiece, and reused inside the /loyalty
// hero. Each tier gets its own gradient + accent so a "سفير سبق"
// card reads dramatically different from a "القارئ الجديد" one.
// Designed at credit-card aspect ratio (1.586:1) so we can later
// reuse it for an Apple Wallet pass image without re-cropping.
export function LoyaltyCard({ userName, userId, lifetimePoints, memberSince, rankLevel }: Props) {
  const computed = computeTier(lifetimePoints);
  const tier: LoyaltyTier = rankLevel
    ? ({ ...computed, level: rankLevel as LoyaltyTier["level"] } as LoyaltyTier)
    : computed;

  const memberId = userId.replace(/[^a-z0-9]/gi, "").slice(-10).toUpperCase().padStart(10, "0");
  const memberSinceLabel = memberSince
    ? new Date(memberSince).toLocaleDateString("ar-EG", { year: "numeric", month: "long" })
    : null;

  return (
    <div
      className="relative aspect-[1.586/1] w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
      style={{
        background: gradientFor(tier),
        color: contrastTextFor(tier),
      }}
      dir="rtl"
      data-testid="loyalty-card"
    >
      {/* Decorative shine + sabq watermark */}
      <div className="absolute inset-0 opacity-[0.07] pointer-events-none">
        <div
          className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%]"
          style={{
            background:
              "repeating-linear-gradient(45deg, transparent, transparent 18px, currentColor 18px, currentColor 19px)",
          }}
        />
      </div>
      <div className="absolute inset-y-0 left-0 w-1/2 opacity-20 pointer-events-none">
        <div className="absolute inset-0" style={{ background: "radial-gradient(circle at top left, currentColor 0%, transparent 60%)" }} />
      </div>

      {/* Top row: tier name + trophy */}
      <div className="absolute top-5 right-5 left-5 flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] opacity-70 font-medium">سبق · LOYALTY</div>
          <div className="mt-1 text-xl font-extrabold leading-tight">{tier.nameAr}</div>
          <div className="text-[11px] opacity-70">{tier.nameEn}</div>
        </div>
        <div
          className="flex items-center justify-center w-12 h-12 rounded-full"
          style={{ backgroundColor: "rgba(255,255,255,0.18)", backdropFilter: "blur(4px)" }}
        >
          <Trophy className="h-6 w-6" />
        </div>
      </div>

      {/* Lifetime points (centerpiece) */}
      <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 text-center">
        <div className="text-[11px] opacity-70 uppercase tracking-widest">Lifetime Points</div>
        <div className="text-4xl sm:text-5xl font-black tracking-tight tabular-nums mt-0.5">
          {lifetimePoints.toLocaleString("en-US")}
        </div>
        <div className="text-[10px] opacity-60 mt-0.5 inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          المستوى {tier.level} من 5
        </div>
      </div>

      {/* Bottom: user name + ID */}
      <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] opacity-60 uppercase tracking-[0.18em]">حامل البطاقة</div>
          <div className="text-base font-bold truncate leading-tight" data-testid="loyalty-card-name">
            {userName}
          </div>
          {memberSinceLabel && (
            <div className="text-[10px] opacity-60 mt-0.5">عضو منذ {memberSinceLabel}</div>
          )}
        </div>
        <div className="text-left shrink-0">
          <div className="text-[10px] opacity-60 uppercase tracking-[0.18em]">رقم العضوية</div>
          <div className="text-xs font-mono tracking-widest font-semibold">{memberId}</div>
        </div>
      </div>
    </div>
  );
}

// Per-tier gradient. Each one builds on the tier accent color from
// shared/loyalty.ts but adds a second tone so the card has depth.
function gradientFor(tier: LoyaltyTier): string {
  switch (tier.level) {
    case 1:
      return "linear-gradient(135deg, #6B7280 0%, #1F2937 100%)";
    case 2:
      return "linear-gradient(135deg, #2563EB 0%, #1E3A8A 100%)";
    case 3:
      return "linear-gradient(135deg, #F59E0B 0%, #B45309 60%, #78350F 100%)";
    case 4:
      return "linear-gradient(135deg, #A78BFA 0%, #6D28D9 100%)";
    case 5:
      return "linear-gradient(135deg, #7C3AED 0%, #4C1D95 50%, #1E1B4B 100%)";
    default:
      return "linear-gradient(135deg, #6B7280 0%, #1F2937 100%)";
  }
}

function contrastTextFor(_tier: LoyaltyTier): string {
  // White reads well on all five gradients — they're all deep enough.
  return "#FFFFFF";
}
