/**
 * صفحة توقّعات كأس خادم الحرمين الشريفين — نفس بنية صفحة توقّعات المونديال
 * (WorldCupPredictions): بانر بطل بتدرّج أخضر وشرائح نقاطي، تبويبات حبوب
 * (المباريات / البطل والهدّاف / توقّعاتي / المتصدّرون)، وبطاقات توقّع
 * بعدّادات أهداف. التخزين على نظام sports_pool الموحّد (/api/sports/*).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Target, Trophy, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { formatNumber } from "@/lib/format";
import {
  formatKickoffDay,
  riyadhDayKey,
  todayRiyadhKey,
  type KcFixture,
} from "@/components/kingscup/kcTypes";
import { KcPredictionMatchCard } from "@/components/kingscup/predictions/KcPredictionMatchCard";
import { KcMyPredictions } from "@/components/kingscup/predictions/KcMyPredictions";
import { KcPredictionsLeaderboard } from "@/components/kingscup/predictions/KcPredictionsLeaderboard";
import { KcLongPredictions } from "@/components/kingscup/predictions/KcLongPredictions";
import {
  KC_COMPETITION_SLUG,
  type KcLeaderRow,
  type KcLongData,
  type KcPredictionStats,
  type KcSavedPrediction,
} from "@/components/kingscup/predictions/kcPredictionsTypes";

type Tab = "matches" | "tournament" | "mine" | "leaders";
const TAB_VALUES: Tab[] = ["matches", "tournament", "mine", "leaders"];

const MINE_KEY = ["/api/sports/predictions/me"];

export default function KingsCupPredictions() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  // يتيح الربط المباشر بتبويب محدّد، مثل ?tab=tournament
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(tabParam && TAB_VALUES.includes(tabParam) ? tabParam : "matches");

  useEffect(() => {
    document.title = "توقّعات كأس الملك — توقّع واربح النقاط | سبق";
  }, []);

  const { data: fixturesData, isLoading: fixturesLoading } = useQuery<{ fixtures: KcFixture[] }>({
    queryKey: ["/api/kings-cup/fixtures"],
    refetchInterval: (query) =>
      (query.state.data?.fixtures ?? []).some((f) => f.status.live) ? 15_000 : 60_000,
    refetchIntervalInBackground: false,
  });

  // توقّعاتي + ملخّص نقاطي — جلبة واحدة تُغذّي بطاقات المباريات وتبويب «توقّعاتي»
  const { data: mineData, isLoading: mineLoading } = useQuery<{
    predictions: KcSavedPrediction[];
    stats: KcPredictionStats;
  }>({
    queryKey: MINE_KEY,
    queryFn: getQueryFn({ on401: "returnNull", silent: true }),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const { data: leaderData, isLoading: leaderLoading } = useQuery<{ leaderboard: KcLeaderRow[] }>({
    queryKey: ["/api/sports/leaderboard"],
    staleTime: 60_000,
  });

  // توقّعات البطولة طويلة المدى — التبويب يظهر فقط متى توفّرت الميزة من الخادم
  // (فشل الجلب ⇒ نُخفي التبويب) — نفس سلوك صفحة توقّعات المونديال.
  const { data: longData } = useQuery<KcLongData>({
    queryKey: [`/api/sports/predictions/long?comp=${KC_COMPETITION_SLUG}`],
    retry: false,
    staleTime: 60_000,
  });
  const longAvailable = !!longData;

  const fixtures = Array.isArray(fixturesData?.fixtures) ? fixturesData.fixtures : [];
  const openFixtures = useMemo(
    () => fixtures.filter((f) => !f.status.finished).sort((a, b) => a.timestamp - b.timestamp),
    [fixtures],
  );
  const allMine = Array.isArray(mineData?.predictions) ? mineData.predictions : [];
  // توقّعاتي في هذه البطولة فقط — النظام موحّد لكل البطولات
  const myKcPredictions = useMemo(
    () => allMine.filter((p) => p.competitionSlug === KC_COMPETITION_SLUG),
    [allMine],
  );
  const myByFixture = useMemo(() => {
    const m = new Map<number, KcSavedPrediction>();
    for (const p of myKcPredictions) m.set(p.fixtureId, p);
    return m;
  }, [myKcPredictions]);

  const stats = mineData?.stats;
  const leaders = Array.isArray(leaderData?.leaderboard) ? leaderData.leaderboard : [];
  const myRank = user ? leaders.find((l) => l.userId === user.id) : undefined;

  const submitMutation = useMutation({
    mutationFn: (vars: { fixture: KcFixture; predHome: number; predAway: number }) =>
      apiRequest(`/api/sports/match/${vars.fixture.id}/predict`, {
        method: "POST",
        body: JSON.stringify({
          predHome: vars.predHome,
          predAway: vars.predAway,
          kickoffTs: vars.fixture.timestamp,
          competitionSlug: KC_COMPETITION_SLUG,
          homeId: vars.fixture.home.id,
          awayId: vars.fixture.away.id,
          homeName: vars.fixture.home.name,
          awayName: vars.fixture.away.name,
          homeLogo: vars.fixture.home.logo,
          awayLogo: vars.fixture.away.logo,
        }),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّعك ✅", description: "بالتوفيق! النقاط تُحتسب فور انتهاء المباراة." });
      queryClient.invalidateQueries({ queryKey: MINE_KEY });
    },
    onError: (err: any) => {
      toast({
        title: "تعذّر حفظ التوقّع",
        description: err?.message || "قد تكون المباراة انطلقت — حاول مرة أخرى",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: MINE_KEY });
    },
  });

  const goLogin = () => {
    window.location.href = "/login";
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "matches", label: "المباريات" },
    ...(longAvailable ? ([{ key: "tournament", label: "البطل والهدّاف" }] as const) : []),
    { key: "mine", label: "توقّعاتي" },
    { key: "leaders", label: "المتصدّرون" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        {/* بانر البطل */}
        <section className="relative overflow-hidden bg-gradient-to-bl from-emerald-600 via-emerald-700 to-emerald-800 text-white">
          <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_20%_30%,white_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative mx-auto max-w-4xl px-4 py-10 sm:py-12">
            <div className="flex items-center gap-2 text-emerald-100">
              <Trophy className="h-5 w-5 text-amber-300" />
              <span className="text-sm font-bold">كأس خادم الحرمين الشريفين</span>
            </div>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">توقّعات كأس الملك</h1>
            <p className="mt-2 max-w-xl text-emerald-50/90">
              توقّع النتيجة بالأهداف قبل صافرة البداية — النتيجة الدقيقة تمنحك
              <span className="font-black"> 3 نقاط</span> والاتجاه الصحيح
              <span className="font-black"> نقطة</span>، وتوقّع البطل والهدّاف يربحك آلاف النقاط.
            </p>

            {isAuthenticated ? (
              <div className="mt-5 inline-flex items-center gap-4 rounded-2xl bg-white/15 px-4 py-2.5 backdrop-blur">
                <div className="text-center">
                  <p className="text-xl font-black tabular-nums">{formatNumber(stats?.totalPoints ?? 0)}</p>
                  <p className="text-[11px] text-emerald-100">نقاط التوقّعات</p>
                </div>
                <div className="h-8 w-px bg-white/25" />
                <div className="text-center">
                  <p className="text-xl font-black tabular-nums">{formatNumber(stats?.exact ?? 0)}</p>
                  <p className="text-[11px] text-emerald-100">نتيجة دقيقة</p>
                </div>
                {myRank && (
                  <>
                    <div className="h-8 w-px bg-white/25" />
                    <div className="text-center">
                      <p className="text-xl font-black tabular-nums">#{formatNumber(myRank.rank)}</p>
                      <p className="text-[11px] text-emerald-100">ترتيبك</p>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={goLogin}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50"
              >
                <Sparkles className="h-4 w-4" /> سجّل دخولك وابدأ التوقّع
              </button>
            )}
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-4 py-6">
          {/* التبويبات */}
          <div className="mb-5 inline-flex w-full gap-1 rounded-full bg-muted p-1 sm:w-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition sm:flex-none ${
                  tab === t.key
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`kc-pred-tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* المحتوى */}
          {tab === "matches" && (
            <MatchesTab
              fixtures={openFixtures}
              myByFixture={myByFixture}
              isLoading={fixturesLoading}
              isAuthenticated={isAuthenticated}
              submittingFixtureId={submitMutation.isPending ? submitMutation.variables?.fixture.id : undefined}
              onSubmit={(fixture, predHome, predAway) => submitMutation.mutate({ fixture, predHome, predAway })}
              onRequireLogin={goLogin}
            />
          )}

          {tab === "tournament" && (
            <KcLongPredictions isAuthenticated={isAuthenticated} onRequireLogin={goLogin} />
          )}

          {tab === "mine" &&
            (isAuthenticated ? (
              <KcMyPredictions predictions={myKcPredictions} isLoading={mineLoading} />
            ) : (
              <SignInPrompt onLogin={goLogin} />
            ))}

          {tab === "leaders" && (
            <KcPredictionsLeaderboard leaders={leaders} currentUserId={user?.id} isLoading={leaderLoading} />
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

function MatchesTab({
  fixtures,
  myByFixture,
  isLoading,
  isAuthenticated,
  submittingFixtureId,
  onSubmit,
  onRequireLogin,
}: {
  fixtures: KcFixture[];
  myByFixture: Map<number, KcSavedPrediction>;
  isLoading: boolean;
  isAuthenticated: boolean;
  submittingFixtureId?: number;
  onSubmit: (fixture: KcFixture, predHome: number, predAway: number) => void;
  onRequireLogin: () => void;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (fixtures.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-14 text-center">
        <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-bold">لا مباريات متاحة للتوقّع حاليًا</p>
        <p className="mt-1 text-sm text-muted-foreground">عُد قريبًا — المباريات تُفتح للتوقّع هنا فور جدولتها.</p>
      </div>
    );
  }

  // تجميع حسب اليوم مع وسم نسبي اليوم/غدًا — نفس تبويب مباريات المونديال
  const todayKey = todayRiyadhKey();
  const tomorrowKey = new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const groups: { key: string; label: string; items: KcFixture[] }[] = [];
  for (const f of fixtures) {
    const key = riyadhDayKey(f.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(f);
    else {
      const rel = key === todayKey ? "اليوم · " : key === tomorrowKey ? "غدًا · " : "";
      groups.push({ key, label: rel + formatKickoffDay(f.date), items: [f] });
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="mb-2.5 flex items-center gap-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
            <span className="h-4 w-1 rounded-full bg-emerald-500" />
            {g.label}
            <span className="text-xs font-normal text-muted-foreground">({formatNumber(g.items.length)})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.items.map((f) => (
              <KcPredictionMatchCard
                key={f.id}
                fixture={f}
                myPrediction={myByFixture.get(f.id) ?? null}
                isAuthenticated={isAuthenticated}
                isSubmitting={submittingFixtureId === f.id}
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
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
      >
        تسجيل الدخول
      </button>
    </div>
  );
}
