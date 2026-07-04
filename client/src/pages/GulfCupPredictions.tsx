import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { Award, Coins, Crown, Flame, Sparkles, Target, Trophy, Users } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/format";
import { formatKickoffDay, riyadhDayKey, todayRiyadhKey } from "@/components/gulfcup/gcTypes";
import { GcPredictionMatchCard } from "@/components/gulfcup/predictions/GcPredictionMatchCard";
import { GcPredictionsLeaderboard } from "@/components/gulfcup/predictions/GcPredictionsLeaderboard";
import { GcMyPredictionsList } from "@/components/gulfcup/predictions/GcMyPredictionsList";
import { GcLongPredictions } from "@/components/gulfcup/predictions/GcLongPredictions";
import { GcBadges } from "@/components/gulfcup/predictions/GcBadges";
import { GcWinCelebration, type GcWin } from "@/components/gulfcup/predictions/GcWinCelebration";
import type {
  GcLeaderboardResponse,
  GcMeStats,
  GcMyPredictionRow,
  GcPredictableMatch,
} from "@/components/gulfcup/predictions/gcPredictionTypes";

type Tab = "today" | "mine" | "leaders" | "long" | "badges";

const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "المباريات" },
  { key: "mine", label: "توقّعاتي" },
  { key: "leaders", label: "المتصدّرون" },
  { key: "long", label: "البطل والهدّاف" },
  { key: "badges", label: "الإنجازات" },
];

const SEEN_WINS_KEY = "gc-seen-wins";

function loadSeenWins(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(SEEN_WINS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export default function GulfCupPredictions() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("today");
  const [celebration, setCelebration] = useState<GcWin | null>(null);

  useEffect(() => {
    document.title = "توقّعات خليجي 27 — توقّع وتقاسم بركة الولاء | سبق";
  }, []);

  const { data: todayData, isLoading: todayLoading } = useQuery<{
    matches: GcPredictableMatch[];
    me: GcMeStats | null;
    jackpot: number;
  }>({
    queryKey: ["/api/gulf-cup/predictions/today"],
    refetchInterval: (query) => {
      const matches = query.state.data?.matches ?? [];
      const hot = matches.some((m) => m.fixture.status.live || (m.locked && m.settlement?.status !== "settled"));
      return hot ? 10_000 : 30_000;
    },
    refetchIntervalInBackground: false,
  });

  const { data: mineData, isLoading: mineLoading } = useQuery<{ predictions: GcMyPredictionRow[] }>({
    queryKey: ["/api/gulf-cup/predictions/mine"],
    enabled: isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // «عرض المزيد» يرفع limit تدريجيًا (سقف الخادم 500) — keepPreviousData يمنع
  // وميض الهيكل العظمي أثناء جلب الدفعة الأكبر.
  const [leaderLimit, setLeaderLimit] = useState(100);
  const {
    data: leaderData,
    isLoading: leaderLoading,
    isFetching: leaderFetching,
  } = useQuery<GcLeaderboardResponse>({
    queryKey: ["/api/gulf-cup/predictions/leaderboard", { limit: leaderLimit }],
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const matches = Array.isArray(todayData?.matches) ? todayData.matches : [];
  const me = todayData?.me ?? null;
  const jackpot = todayData?.jackpot ?? 0;
  const myPredictions = Array.isArray(mineData?.predictions) ? mineData.predictions : [];
  const leaders = Array.isArray(leaderData?.leaders) ? leaderData.leaders : [];
  const leaderboardViewer = leaderData?.viewer ?? null;
  // صفّي في القائمة المعروضة، وإلا صف viewer من الخادم (رتبتي الحقيقية ولو بعد الـ100)
  const myRank = user
    ? (leaders.find((l) => l.userId === user.id) ?? leaderboardViewer ?? undefined)
    : undefined;

  // كشف الفوز: أول إصابة مُسوّاة لم تُعرض بعد → احتفاء.
  const firstUnseenWin = useMemo<GcWin | null>(() => {
    if (!isAuthenticated) return null;
    const seen = loadSeenWins();
    const win = myPredictions.find(
      (p) => p.matchStatus === "settled" && p.status === "correct" && p.pointsAwarded > 0 && !seen.has(p.fixtureId),
    );
    if (!win || win.tier === "none") return null;
    return {
      fixtureId: win.fixtureId,
      points: win.pointsAwarded,
      tier: win.tier,
      homeName: win.homeTeamName,
      awayName: win.awayTeamName,
      predHome: win.predHome,
      predAway: win.predAway,
      finalHome: win.finalHome,
      finalAway: win.finalAway,
    };
  }, [myPredictions, isAuthenticated]);

  useEffect(() => {
    if (firstUnseenWin && !celebration) setCelebration(firstUnseenWin);
  }, [firstUnseenWin, celebration]);

  const dismissCelebration = () => {
    if (celebration) {
      const seen = loadSeenWins();
      seen.add(celebration.fixtureId);
      try {
        localStorage.setItem(SEEN_WINS_KEY, JSON.stringify(Array.from(seen)));
      } catch {
        /* ignore */
      }
    }
    setCelebration(null);
  };

  const submitMutation = useMutation({
    mutationFn: (vars: { fixtureId: number; predHome: number; predAway: number }) =>
      apiRequest("/api/gulf-cup/predictions", { method: "POST", body: JSON.stringify(vars) }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّعك ✅", description: "بالتوفيق! نصيبك من البركة يُحتسب فور انتهاء المباراة." });
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-cup/predictions/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-cup/predictions/mine"] });
    },
    onError: (err: any) => {
      toast({ title: "تعذّر حفظ التوقّع", description: err?.message || "حاول مرة أخرى", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-cup/predictions/today"] });
    },
  });

  const goLogin = () => {
    window.location.href = "/login";
  };

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      {celebration && <GcWinCelebration win={celebration} onClose={dismissCelebration} />}

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-bl from-green-700 via-green-800 to-emerald-900 text-white">
          <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_20%_30%,white_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative mx-auto max-w-4xl px-4 py-10 sm:py-12">
            <div className="flex items-center gap-2 text-green-100">
              <Trophy className="h-5 w-5" />
              <span className="text-sm font-bold">كأس الخليج العربي 27 · السعودية</span>
            </div>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">توقّعات خليجي 27</h1>
            <p className="mt-2 max-w-xl text-green-50/90">
              توقّع نتيجة كل مباراة وتقاسم <strong>بركة 1000 نقطة ولاء</strong> مع المصيبين — كلّما قلّ عددهم زاد نصيبك.
              يرشدك توقّع سبق الذكي وإجماع الجمهور، والنتيجة الدقيقة تأخذ النصيب الأكبر.
            </p>

            {/* الجائزة المتراكمة */}
            {jackpot > 0 && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-4 py-1.5 ring-1 ring-amber-300/40">
                <Coins className="h-4 w-4 text-amber-300" />
                <span className="text-sm font-bold text-amber-100">
                  جائزة متراكمة: <span className="tabular-nums">{formatNumber(jackpot)}</span> نقطة تُضاف للمباراة القادمة!
                </span>
              </div>
            )}

            {isAuthenticated ? (
              <div className="mt-5 inline-flex flex-wrap items-center gap-4 rounded-2xl bg-white/15 px-4 py-2.5 backdrop-blur">
                <Stat value={formatNumber(me?.points ?? myRank?.totalPoints ?? 0)} label="نقاطي" />
                <Divider />
                <Stat value={formatNumber(me?.correct ?? myRank?.correctCount ?? 0)} label="نتيجة صحيحة" />
                <Divider />
                <Stat value={formatNumber(me?.exact ?? myRank?.exactCount ?? 0)} label="مطابقة دقيقة" />
                {(me?.currentStreak ?? 0) >= 1 && (
                  <>
                    <Divider />
                    <div className="text-center">
                      <p className="inline-flex items-center gap-1 text-xl font-black tabular-nums">
                        <Flame className="h-4 w-4 text-orange-300" /> {formatNumber(me!.currentStreak)}
                      </p>
                      <p className="text-[11px] text-green-100">سلسلة حالية</p>
                    </div>
                  </>
                )}
                {myRank && (
                  <>
                    <Divider />
                    <Stat value={`#${formatNumber(myRank.rank)}`} label="ترتيبي" />
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={goLogin}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-green-800 transition hover:bg-green-50"
              >
                <Sparkles className="h-4 w-4" /> سجّل دخولك وابدأ التوقّع
              </button>
            )}
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-4 py-6">
          <ScoringExplainer />

          <div className="mb-5 flex w-full gap-1 overflow-x-auto rounded-full bg-muted p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${
                  tab === t.key ? "bg-green-700 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`gc-pred-tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "today" && (
            <TodayTab
              matches={matches}
              isLoading={todayLoading}
              isAuthenticated={isAuthenticated}
              submittingFixtureId={submitMutation.isPending ? submitMutation.variables?.fixtureId : undefined}
              onSubmit={(fixtureId, predHome, predAway) => submitMutation.mutate({ fixtureId, predHome, predAway })}
              onRequireLogin={goLogin}
            />
          )}

          {tab === "mine" &&
            (isAuthenticated ? (
              <GcMyPredictionsList predictions={myPredictions} isLoading={mineLoading} />
            ) : (
              <SignInPrompt onLogin={goLogin} />
            ))}

          {tab === "leaders" && (
            <GcPredictionsLeaderboard
              leaders={leaders}
              currentUserId={user?.id}
              isLoading={leaderLoading}
              total={leaderData?.total}
              viewer={leaderboardViewer}
              viewerName={[user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name}
              viewerAvatar={user?.profileImageUrl ?? null}
              onLoadMore={() => setLeaderLimit((l) => Math.min(l + 100, 500))}
              loadingMore={leaderFetching && !leaderLoading}
            />
          )}

          {tab === "long" && <GcLongPredictions isAuthenticated={isAuthenticated} onRequireLogin={goLogin} />}

          {tab === "badges" && <GcBadges earned={me?.badges ?? []} />}
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="text-[11px] text-green-100">{label}</p>
    </div>
  );
}

function Divider() {
  return <div className="h-8 w-px bg-white/25" />;
}

/** شرح آلية البركة المتدرّجة — يميّز المسابقة ويوضّح حماية النتيجة المقلوبة. */
function ScoringExplainer() {
  const items = [
    { icon: <Coins className="h-4 w-4" />, title: "بركة 1000", text: "كل مباراة تُموّل ببركة 1000 نقطة تُقتسم بين المصيبين" },
    { icon: <Target className="h-4 w-4" />, title: "طبقات 50/30/20", text: "دقيقة 500 · فارق صحيح 300 · نتيجة صحيحة 200" },
    { icon: <Users className="h-4 w-4" />, title: "كلّما قلّوا زدت", text: "كلّما قلّ عدد المصيبين في طبقتك زاد نصيبك منها" },
    { icon: <Crown className="h-4 w-4" />, title: "جائزة متراكمة", text: "إن لم يُصب أحد طبقةً تراكمت نقاطها للمباراة التالية" },
  ];
  return (
    <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.title} className="rounded-xl border border-amber-500/15 bg-amber-500/[0.04] p-3">
          <div className="mb-1 flex items-center gap-1.5 font-black text-green-800 dark:text-green-300">
            {it.icon}
            <span className="text-sm">{it.title}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{it.text}</p>
        </div>
      ))}
    </div>
  );
}

function TodayTab({
  matches,
  isLoading,
  isAuthenticated,
  submittingFixtureId,
  onSubmit,
  onRequireLogin,
}: {
  matches: GcPredictableMatch[];
  isLoading: boolean;
  isAuthenticated: boolean;
  submittingFixtureId?: number;
  onSubmit: (fixtureId: number, predHome: number, predAway: number) => void;
  onRequireLogin: () => void;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-96 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-14 text-center">
        <Award className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-bold">لا مباريات متاحة للتوقّع الآن</p>
        <p className="mt-1 text-sm text-muted-foreground">
          تنطلق خليجي 27 في السعودية — تُفتح المباريات للتوقّع هنا فور اقتراب موعدها.
        </p>
      </div>
    );
  }

  const todayKey = todayRiyadhKey();
  const tomorrowKey = new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const groups: { key: string; label: string; items: GcPredictableMatch[] }[] = [];
  for (const m of matches) {
    const key = riyadhDayKey(m.fixture.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(m);
    else {
      const rel = key === todayKey ? "اليوم · " : key === tomorrowKey ? "غدًا · " : "";
      groups.push({ key, label: rel + formatKickoffDay(m.fixture.date), items: [m] });
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="mb-2.5 flex items-center gap-2 text-sm font-black text-green-800 dark:text-green-300">
            <span className="h-4 w-1 rounded-full bg-green-600" />
            {g.label}
            <span className="text-xs font-normal text-muted-foreground">({formatNumber(g.items.length)})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.items.map((m) => (
              <GcPredictionMatchCard
                key={m.fixture.id}
                match={m}
                isAuthenticated={isAuthenticated}
                isSubmitting={submittingFixtureId === m.fixture.id}
                onSubmit={onSubmit}
                onRequireLogin={onRequireLogin}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SignInPrompt({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border py-14 text-center">
      <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
      <p className="font-bold">سجّل دخولك لعرض توقّعاتك</p>
      <button
        onClick={onLogin}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-green-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-green-800"
      >
        تسجيل الدخول
      </button>
    </div>
  );
}
