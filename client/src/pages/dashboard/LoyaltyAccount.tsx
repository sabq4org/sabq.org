import { useQuery, useMutation } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Trophy, Coins, Flame, Star, History, Gift, Lock } from "lucide-react";
import {
  LOYALTY_TIERS,
  tierProgress,
  type LoyaltyTier,
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

type HistoryEvent = {
  id: string;
  action: string;
  points: number;
  source: string | null;
  createdAt: string;
  metadata?: { articleId?: string; commentId?: string; duration?: number; extraInfo?: string };
};

type Reward = {
  id: string;
  nameAr: string;
  description: string | null;
  imageUrl: string | null;
  pointsCost: number;
  rewardType: string;
  remainingStock: number | null;
};

const ACTION_LABEL_AR: Record<string, string> = {
  READ: "قراءة مقال",
  READ_DEEP: "قراءة متعمّقة",
  LIKE: "إعجاب بمقال",
  COMMENT: "تعليق",
  SHARE: "مشاركة",
  NOTIFICATION_OPEN: "فتح إشعار",
  DAILY_LOGIN: "دخول يومي",
  ADMIN_ADJUSTMENT: "تعديل من الإدارة",
};

export default function LoyaltyAccount() {
  const { toast } = useToast();
  const { data: summary, isLoading: loadingSummary } = useQuery<Summary>({
    queryKey: ["/api/loyalty/summary"],
  });
  const { data: history } = useQuery<HistoryEvent[]>({
    queryKey: ["/api/loyalty/history?limit=20"],
  });
  const { data: rewards } = useQuery<Reward[]>({
    queryKey: ["/api/loyalty/rewards"],
  });

  const redeemMutation = useMutation({
    mutationFn: async (rewardId: string) =>
      apiRequest(`/api/loyalty/rewards/${rewardId}/redeem`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "تم الاستبدال", description: "تم خصم النقاط وحفظ الجائزة في سجلّك" });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty/history?limit=20"] });
    },
    onError: (e: any) => {
      toast({ title: "تعذّر الاستبدال", description: e?.message ?? "حاول لاحقاً", variant: "destructive" });
    },
  });

  const lifetime = summary?.points?.lifetimePoints ?? 0;
  const { current, next, pointsToNext } = tierProgress(lifetime);
  const progressPct = next
    ? Math.min(100, ((lifetime - current.minLifetimePoints) / (next.minLifetimePoints - current.minLifetimePoints)) * 100)
    : 100;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-5xl px-4 py-8" dir="rtl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            نقاطي والمكافآت
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            تابع نقاطك ومستواك واستبدل المزايا التي وصلت إليها
          </p>
        </div>

        {/* ─── Tier hero card ─── */}
        <Card className="mb-6 overflow-hidden border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-br from-amber-500/10 to-orange-500/5">
          <CardContent className="p-6">
            {loadingSummary ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="flex flex-col md:flex-row md:items-center gap-6">
                <div
                  className="flex items-center justify-center w-24 h-24 rounded-full shrink-0"
                  style={{
                    backgroundColor: `${current.color}1f`,
                    border: `2px solid ${current.color}`,
                  }}
                >
                  <Trophy className="h-12 w-12" style={{ color: current.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-1">مستواك الحالي</div>
                  <div className="text-2xl font-bold" style={{ color: current.color }}>
                    {current.nameAr}
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full transition-all duration-500"
                      style={{ width: `${progressPct}%`, backgroundColor: current.color }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {next ? (
                      <>
                        {formatNumber(pointsToNext)} نقطة للوصول إلى{" "}
                        <span style={{ color: next.color }} className="font-medium">
                          {next.nameAr}
                        </span>
                      </>
                    ) : (
                      "وصلت إلى أعلى مستوى — شكراً لانتمائك."
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center md:border-r md:pr-6 dark:md:border-zinc-800">
                  <StatCell icon={<Coins className="h-4 w-4" />} label="هذا الأسبوع" value={summary?.weekPoints ?? 0} highlight />
                  <StatCell icon={<Star className="h-4 w-4" />} label="هذا الشهر" value={summary?.monthPoints ?? 0} />
                  <StatCell icon={<Flame className="h-4 w-4" />} label="streak" value={summary?.streakDays ?? 0} suffix="يوم" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          {/* ─── Tier ladder ─── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">المستويات الخمسة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {LOYALTY_TIERS.map((tier) => (
                <TierRow key={tier.level} tier={tier} currentLevel={current.level} lifetime={lifetime} />
              ))}
            </CardContent>
          </Card>

          {/* ─── Recent history ─── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                سجلّ النقاط
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!history || history.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  لم تكسب نقاطاً بعد — اقرأ مقالاً لتبدأ.
                </p>
              ) : (
                <ul className="space-y-2">
                  {history.slice(0, 12).map((evt) => (
                    <li key={evt.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                      <div className="flex flex-col">
                        <span className="font-medium">{ACTION_LABEL_AR[evt.action] ?? evt.action}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(evt.createdAt).toLocaleDateString("ar-EG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <Badge variant={evt.points >= 0 ? "secondary" : "destructive"}>
                        {evt.points >= 0 ? "+" : ""}
                        {evt.points}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── Rewards catalog ─── */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4" />
              استبدل نقاطك
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!rewards || rewards.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                لا توجد مكافآت متاحة حالياً. سنُضيف مكافآت قريباً.
              </p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {rewards.map((r) => {
                  const canAfford = (summary?.points?.totalPoints ?? 0) >= r.pointsCost;
                  return (
                    <div key={r.id} className="rounded-lg border p-4 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-amber-500" />
                        <span className="font-medium text-sm">{r.nameAr}</span>
                      </div>
                      {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <Badge variant="secondary">{formatNumber(r.pointsCost)} نقطة</Badge>
                        <Button
                          size="sm"
                          variant={canAfford ? "default" : "outline"}
                          disabled={!canAfford || redeemMutation.isPending}
                          onClick={() => redeemMutation.mutate(r.id)}
                        >
                          {canAfford ? "استبدل" : (<><Lock className="h-3 w-3 ml-1" /> نقاط غير كافية</>)}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCell({ icon, label, value, suffix, highlight }: { icon: React.ReactNode; label: string; value: number; suffix?: string; highlight?: boolean }) {
  return (
    <div>
      <div className={`text-xs flex items-center justify-center gap-1 ${highlight ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
        {icon}
        {label}
      </div>
      <div className={`text-xl font-bold mt-1 ${highlight ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {formatNumber(value)}
        {suffix && <span className="text-xs text-muted-foreground mr-1 font-normal">{suffix}</span>}
      </div>
    </div>
  );
}

function TierRow({ tier, currentLevel, lifetime }: { tier: LoyaltyTier; currentLevel: number; lifetime: number }) {
  const isCurrent = tier.level === currentLevel;
  const isLocked = tier.level > currentLevel;
  const reached = !isLocked;
  return (
    <div
      className={`flex items-center gap-3 rounded-md p-2.5 ${isCurrent ? "bg-muted" : ""}`}
      style={isCurrent ? { border: `1px solid ${tier.color}40` } : undefined}
    >
      <div
        className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
        style={{
          backgroundColor: reached ? `${tier.color}1f` : "transparent",
          color: reached ? tier.color : "#9CA3AF",
          border: `1px solid ${reached ? tier.color : "#9CA3AF"}40`,
        }}
      >
        {isLocked ? <Lock className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: reached ? tier.color : undefined }}>
          {tier.nameAr}
        </div>
        <div className="text-[11px] text-muted-foreground">
          يبدأ من {formatNumber(tier.minLifetimePoints)} نقطة
        </div>
      </div>
      {isCurrent && (
        <Badge variant="secondary" className="text-[10px]">مستواك الآن</Badge>
      )}
    </div>
  );
}
