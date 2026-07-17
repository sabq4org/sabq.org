/**
 * محفظة ولاء العضو — /dashboard/loyalty
 * تجربة موجّهة للعضو: رصيد، تقدّم، ماذا أفعل الآن، سجل، استبدال.
 * لا نعرض معادل الريال هنا (قرار منتج).
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BookOpen,
  Coins,
  Flame,
  Gift,
  Heart,
  History,
  Lock,
  LogIn,
  MessageCircle,
  Share2,
  Sparkles,
  Trophy,
  ChevronLeft,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  LOYALTY_ACTION_POINTS,
  LOYALTY_TIERS,
  tierProgress,
  type LoyaltyTier,
} from "@shared/loyalty";
import { formatNumber } from "@/lib/format";
import { LoyaltyCard } from "@/components/loyalty/LoyaltyCard";

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
  LIKE: "إعجاب",
  COMMENT: "تعليق",
  SHARE: "مشاركة",
  NOTIFICATION_OPEN: "فتح إشعار",
  DAILY_LOGIN: "دخول يومي",
  PROFILE_COMPLETE: "إكمال الملف",
  EMAIL_VERIFIED: "توثيق الإيميل",
  WC_PREDICTION_WIN: "فوز بتوقّع",
  WC_LONG_PREDICTION_WIN: "توقّع طويل المدى",
  PREDICTION_WIN: "فوز بتوقّع",
  ADMIN_ADJUSTMENT: "تعديل من الإدارة",
};

const EARN_GUIDE = [
  { icon: LogIn, title: "دخول يومي", pts: LOYALTY_ACTION_POINTS.DAILY_LOGIN, href: "/" },
  { icon: BookOpen, title: "قراءة مقال", pts: LOYALTY_ACTION_POINTS.READ, href: "/" },
  { icon: Sparkles, title: "قراءة عميقة", pts: LOYALTY_ACTION_POINTS.READ_DEEP, href: "/" },
  { icon: Share2, title: "مشاركة", pts: LOYALTY_ACTION_POINTS.SHARE, href: "/" },
  { icon: MessageCircle, title: "تعليق", pts: LOYALTY_ACTION_POINTS.COMMENT, href: "/" },
  { icon: Heart, title: "إعجاب", pts: LOYALTY_ACTION_POINTS.LIKE, href: "/" },
] as const;

function formatEventWhen(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

/** يجمع أحداث نفس اليوم ونفس النوع لتقليل التكرار البصري */
function collapseHistory(events: HistoryEvent[]) {
  const map = new Map<
    string,
    { action: string; count: number; points: number; lastAt: string }
  >();
  for (const evt of events) {
    const key = `${dayKey(evt.createdAt)}:${evt.action}`;
    const prev = map.get(key);
    if (prev) {
      prev.count += 1;
      prev.points += evt.points;
      if (new Date(evt.createdAt) > new Date(prev.lastAt)) prev.lastAt = evt.createdAt;
    } else {
      map.set(key, {
        action: evt.action,
        count: 1,
        points: evt.points,
        lastAt: evt.createdAt,
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
  );
}

export default function LoyaltyAccount() {
  const { toast } = useToast();
  const { user } = useAuth();

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
    onError: (e: { message?: string }) => {
      toast({
        title: "تعذّر الاستبدال",
        description: e?.message ?? "حاول لاحقاً",
        variant: "destructive",
      });
    },
  });

  const balance = summary?.points?.totalPoints ?? 0;
  const lifetime = summary?.points?.lifetimePoints ?? 0;
  const rankLevel = summary?.points?.rankLevel;
  const { current, next, pointsToNext } = tierProgress(lifetime);
  const progressPct = next
    ? Math.min(
        100,
        ((lifetime - current.minLifetimePoints) /
          (next.minLifetimePoints - current.minLifetimePoints)) *
          100,
      )
    : 100;

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    "عضو سبق";

  const nextActionHint = !summary?.streakDays
    ? "ابدأ سلسلة أيامك — ادخل غدًا واقرأ خبرًا"
    : next
      ? `باقي ${formatNumber(pointsToNext)} نقطة لتصل إلى «${next.nameAr}»`
      : "أنت في أعلى مستوى — استمر في القراءة";

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        {/* Hero شخصي */}
        <section className="border-b border-border bg-gradient-to-b from-primary/8 via-background to-background">
          <div className="mx-auto max-w-5xl px-4 pt-8 pb-10 md:pt-12 md:pb-14">
            <p className="text-xs md:text-sm font-bold text-primary mb-2">محفظة الولاء</p>
            <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight mb-2">
              {loadingSummary ? "…" : `مرحبًا ${displayName.split(" ")[0]}`}
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-xl mb-8">
              هنا نقاطك ومستواك — وكل ما تفعله في سبق يقوّي عضويتك.
            </p>

            {loadingSummary ? (
              <div className="grid md:grid-cols-[1fr_280px] gap-6">
                <Skeleton className="h-40 w-full rounded-2xl" />
                <Skeleton className="h-40 w-full rounded-2xl hidden md:block" />
              </div>
            ) : (
              <div className="grid md:grid-cols-[1.2fr_1fr] gap-6 items-stretch">
                {/* الرصيد */}
                <div className="rounded-2xl border border-border bg-card p-5 md:p-7 flex flex-col justify-between min-h-[200px]">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${current.color}22`, color: current.color }}
                      >
                        <Trophy className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="font-extrabold text-lg" style={{ color: current.color }}>
                        {current.nameAr}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">رصيدك الحالي</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl md:text-5xl font-extrabold tabular-nums tracking-tight">
                        {formatNumber(balance)}
                      </span>
                      <span className="text-muted-foreground font-medium">نقطة</span>
                    </div>
                  </div>

                  <div className="mt-6">
                    {next ? (
                      <>
                        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                          <span>إلى {next.nameAr}</span>
                          <span className="tabular-nums">{formatNumber(pointsToNext)} نقطة</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full transition-all duration-700 rounded-full"
                            style={{ width: `${progressPct}%`, backgroundColor: current.color }}
                          />
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">وصلت لأعلى مستوى — شكرًا لانتمائك.</p>
                    )}
                    <p className="text-sm text-foreground/80 mt-3 font-medium">{nextActionHint}</p>
                  </div>
                </div>

                {/* بطاقة العضوية */}
                <div className="flex flex-col gap-3">
                  {user?.id ? (
                    <LoyaltyCard
                      userName={displayName}
                      userId={user.id}
                      lifetimePoints={lifetime}
                      rankLevel={rankLevel}
                    />
                  ) : (
                    <Skeleton className="aspect-[1.586/1] w-full rounded-2xl" />
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <MiniStat
                      icon={<Coins className="h-3.5 w-3.5" />}
                      label="هذا الأسبوع"
                      value={summary?.weekPoints ?? 0}
                      accent
                    />
                    <MiniStat
                      icon={<Sparkles className="h-3.5 w-3.5" />}
                      label="هذا الشهر"
                      value={summary?.monthPoints ?? 0}
                    />
                    <MiniStat
                      icon={<Flame className="h-3.5 w-3.5" />}
                      label="سلسلة"
                      value={summary?.streakDays ?? 0}
                      suffix="يوم"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ماذا أفعل الآن */}
        <section className="mx-auto max-w-5xl px-4 py-10 md:py-12">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div>
              <h2 className="text-lg md:text-2xl font-extrabold">اكسب نقاط الآن</h2>
              <p className="text-sm text-muted-foreground mt-1">أفعال بسيطة… كل واحدة تضيف لرصيدك</p>
            </div>
            <Button asChild variant="default" className="font-bold">
              <Link href="/">
                ابدأ القراءة
                <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
            {EARN_GUIDE.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="rounded-xl border border-border bg-card p-3.5 md:p-4 hover:border-primary transition-colors group"
              >
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15">
                  <item.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <div className="text-sm font-extrabold">{item.title}</div>
                <div className="text-primary font-extrabold tabular-nums mt-1">
                  +{formatNumber(item.pts)}{" "}
                  <span className="text-xs font-medium text-muted-foreground">نقطة</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* المستويات + السجل — عمودان متوازنان */}
        <section className="bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-5xl px-4 py-10 md:py-12">
            <div className="grid md:grid-cols-2 gap-4 md:gap-5 md:items-stretch">
              {/* المستويات */}
              <div className="rounded-2xl border border-border bg-card flex flex-col min-h-[320px] md:min-h-0">
                <div className="px-4 md:px-5 pt-4 md:pt-5 pb-3 border-b border-border">
                  <h2 className="text-base md:text-lg font-extrabold">مستويات العضوية</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    عمر نقاطك:{" "}
                    <b className="text-foreground tabular-nums font-bold">
                      {formatNumber(lifetime)}
                    </b>
                  </p>
                </div>
                <ol className="flex-1 flex flex-col justify-between p-2 md:p-3 gap-0.5">
                  {LOYALTY_TIERS.map((tier) => (
                    <TierRow
                      key={tier.level}
                      tier={tier}
                      currentLevel={current.level}
                    />
                  ))}
                </ol>
              </div>

              {/* السجل */}
              <div className="rounded-2xl border border-border bg-card flex flex-col min-h-[320px] md:min-h-0">
                <div className="px-4 md:px-5 pt-4 md:pt-5 pb-3 border-b border-border flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base md:text-lg font-extrabold flex items-center gap-2">
                      <History className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                      آخر ما كسبته
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      مجمّع حسب اليوم والنوع
                    </p>
                  </div>
                  {summary?.weekPoints != null && summary.weekPoints > 0 && (
                    <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 rounded-full px-2.5 py-1 tabular-nums shrink-0">
                      +{formatNumber(summary.weekPoints)} هذا الأسبوع
                    </span>
                  )}
                </div>

                {!history || history.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <BookOpen className="h-7 w-7 text-muted-foreground mb-2" aria-hidden="true" />
                    <p className="text-sm font-bold mb-1">ما زالت المحفظة هادئة</p>
                    <p className="text-xs text-muted-foreground mb-3">اقرأ مقالًا لتبدأ السجل</p>
                    <Button asChild size="sm" className="font-bold">
                      <Link href="/">تصفّح الأخبار</Link>
                    </Button>
                  </div>
                ) : (
                  <>
                    <ul className="flex-1 overflow-y-auto max-h-[280px] md:max-h-none divide-y divide-border">
                      {collapseHistory(Array.isArray(history) ? history : [])
                        .slice(0, 6)
                        .map((row) => (
                          <li
                            key={`${row.action}-${row.lastAt}`}
                            className="flex items-center justify-between gap-3 px-4 md:px-5 py-2.5 text-sm"
                          >
                            <div className="min-w-0">
                              <div className="font-bold truncate">
                                {ACTION_LABEL_AR[row.action] ?? row.action}
                                {row.count > 1 && (
                                  <span className="text-muted-foreground font-medium text-xs mr-1.5">
                                    ×{formatNumber(row.count)}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                                {formatEventWhen(row.lastAt)}
                              </div>
                            </div>
                            <span
                              className={`shrink-0 font-extrabold tabular-nums ${
                                row.points >= 0 ? "text-primary" : "text-destructive"
                              }`}
                            >
                              {row.points >= 0 ? "+" : ""}
                              {formatNumber(row.points)}
                            </span>
                          </li>
                        ))}
                    </ul>
                    <div className="px-4 md:px-5 py-3 border-t border-border mt-auto">
                      <p className="text-[11px] text-muted-foreground text-center">
                        يُعرض ملخص آخر النشاط — التفاصيل الكاملة قريبًا
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* الاستبدال */}
        <section className="mx-auto max-w-5xl px-4 py-10 md:py-14">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg md:text-2xl font-extrabold">استبدل نقاطك</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-6 max-w-lg">
            المكافآت المتاحة لحسابك — نضيف المزيد مع شركائنا قريبًا.
          </p>

          {!rewards || rewards.length === 0 ? (
            <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/5 to-amber-500/5 p-8 md:p-10 text-center">
              <Gift className="h-10 w-10 text-primary mx-auto mb-3" aria-hidden="true" />
              <p className="font-extrabold text-base md:text-lg mb-2">الاستبدال قادم بقوة</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-5">
                اجمع نقاطك من القراءة والتفاعل — وعندما تفتح المكافآت، رصيدك جاهز.
              </p>
              <Button asChild className="font-bold">
                <Link href="/">واصل القراءة واكسب</Link>
              </Button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {rewards.map((r) => {
                const canAfford = balance >= r.pointsCost;
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2"
                  >
                    <div className="font-extrabold text-sm md:text-base">{r.nameAr}</div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                        {r.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-2 pt-2 mt-auto border-t border-border">
                      <span className="text-sm font-extrabold text-primary tabular-nums">
                        {formatNumber(r.pointsCost)} نقطة
                      </span>
                      <Button
                        size="sm"
                        className="font-bold"
                        variant={canAfford ? "default" : "outline"}
                        disabled={!canAfford || redeemMutation.isPending}
                        onClick={() => redeemMutation.mutate(r.id)}
                      >
                        {canAfford ? (
                          "استبدل"
                        ) : (
                          <>
                            <Lock className="h-3.5 w-3.5 ml-1" aria-hidden="true" />
                            غير كافية
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  suffix,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-2 py-2.5 text-center">
      <div
        className={`text-[10px] flex items-center justify-center gap-1 mb-0.5 ${
          accent ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
        }`}
      >
        {icon}
        {label}
      </div>
      <div
        className={`text-base font-extrabold tabular-nums ${
          accent ? "text-amber-600 dark:text-amber-400" : ""
        }`}
      >
        {formatNumber(value)}
        {suffix && (
          <span className="text-[10px] font-medium text-muted-foreground mr-0.5">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function TierRow({ tier, currentLevel }: { tier: LoyaltyTier; currentLevel: number }) {
  const isCurrent = tier.level === currentLevel;
  const isLocked = tier.level > currentLevel;
  const reached = !isLocked;
  return (
    <li
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 border ${
        isCurrent ? "bg-primary/5 border-primary/35" : "border-transparent"
      }`}
    >
      <div
        className="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
        style={{
          backgroundColor: reached ? `${tier.color}1f` : "transparent",
          color: reached ? tier.color : undefined,
          border: `1px solid ${reached ? tier.color : "hsl(var(--border))"}`,
        }}
      >
        {isLocked ? (
          <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        ) : (
          <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div
            className="text-[13px] font-extrabold truncate leading-tight"
            style={{ color: reached ? tier.color : undefined }}
          >
            {tier.nameAr}
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {formatNumber(tier.minLifetimePoints)}+
          </div>
        </div>
        {isCurrent && (
          <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5 shrink-0">
            مستواك
          </span>
        )}
      </div>
    </li>
  );
}
