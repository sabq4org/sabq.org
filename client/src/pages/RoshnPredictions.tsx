/**
 * صفحة توقّعات دوري روشن — نسخة صفحة توقّعات المونديال (WorldCupPredictions)
 * بمحرّكها نفسه على /api/rsl/predictions/*: بانر بطل بشرائح نقاطي، تبويبات
 * حبوب (المباريات / توقّع البطل / توقّعاتي / المتصدّرون)، بطاقات توقّع
 * بعدّادات أهداف وجائزة 500 نقطة تُقسَّم بين مصيبي النتيجة الدقيقة.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Trophy, Target, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatKickoffDay, riyadhDayKey, todayRiyadhKey } from "@/components/rsl/rslTypes";
import { formatNumber } from "@/lib/format";
import { RslPredictionMatchCard } from "@/components/rsl/predictions/RslPredictionMatchCard";
import { RslPredictionsLeaderboard } from "@/components/rsl/predictions/RslPredictionsLeaderboard";
import { RslMyPredictions } from "@/components/rsl/predictions/RslMyPredictions";
import { RslLongPredictions } from "@/components/rsl/predictions/RslLongPredictions";
import type {
  PredictableMatch,
  LeaderboardResponse,
  MyPredictionRow,
  RslLongData,
} from "@/components/rsl/predictions/rslPredictionsTypes";

type Tab = "today" | "mine" | "leaders" | "tournament";
const TAB_VALUES: Tab[] = ["today", "mine", "leaders", "tournament"];

export default function RoshnPredictions() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  // يتيح الربط المباشر بتبويب محدّد، مثل ?tab=tournament من هيرو ما قبل الموسم
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(tabParam && TAB_VALUES.includes(tabParam) ? tabParam : "today");

  useEffect(() => {
    document.title = "توقّعات دوري روشن — توقّع واربح نقاط الولاء | سبق";
  }, []);

  // مباريات اليوم/الغد — استطلاع سريع متى كانت هناك مباراة جارية/بانتظار الاحتساب
  const { data: todayData, isLoading: todayLoading } = useQuery<{ matches: PredictableMatch[] }>({
    queryKey: ["/api/rsl/predictions/today"],
    retry: false,
    refetchInterval: (query) => {
      const matches = query.state.data?.matches ?? [];
      const hot = matches.some(
        (m) => m.fixture.status.live || (m.locked && m.settlement?.status !== "settled"),
      );
      return hot ? 10_000 : 30_000;
    },
    refetchIntervalInBackground: false,
  });

  const { data: mineData, isLoading: mineLoading } = useQuery<{ predictions: MyPredictionRow[] }>({
    queryKey: ["/api/rsl/predictions/mine"],
    enabled: isAuthenticated,
    retry: false,
    staleTime: 30_000,
  });

  // «عرض المزيد» يرفع limit تدريجيًا (سقف الخادم 500) — keepPreviousData يمنع
  // وميض الهيكل العظمي أثناء جلب الدفعة الأكبر.
  const [leaderLimit, setLeaderLimit] = useState(100);
  const {
    data: leaderData,
    isLoading: leaderLoading,
    isFetching: leaderFetching,
  } = useQuery<LeaderboardResponse>({
    queryKey: ["/api/rsl/predictions/leaderboard", { limit: leaderLimit }],
    retry: false,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  // توقّعات الموسم طويلة المدى — التبويب يظهر فقط متى فعّل الخادم المسابقة
  // (503 قبل RSL_PREDICTIONS_ENABLED ⇒ نُخفي التبويب) — نفس سلوك المونديال.
  const { data: longData } = useQuery<RslLongData>({
    queryKey: ["/api/rsl/predictions/long"],
    retry: false,
    staleTime: 60_000,
  });
  const longAvailable = !!longData;

  const tabs: { key: Tab; label: string }[] = [
    { key: "today", label: "المباريات" },
    ...(longAvailable ? ([{ key: "tournament", label: "توقّع البطل" }] as const) : []),
    { key: "mine", label: "توقّعاتي" },
    { key: "leaders", label: "المتصدّرون" },
  ];

  const matches = Array.isArray(todayData?.matches) ? todayData.matches : [];
  const myPredictions = Array.isArray(mineData?.predictions) ? mineData.predictions : [];
  const leaders = Array.isArray(leaderData?.leaders) ? leaderData.leaders : [];
  const leaderboardViewer = leaderData?.viewer ?? null;
  // صفّي في القائمة المعروضة، وإلا صف viewer من الخادم (رتبتي الحقيقية ولو بعد الـ100)
  const myRank = user
    ? (leaders.find((l) => l.userId === user.id) ?? leaderboardViewer ?? undefined)
    : undefined;

  const submitMutation = useMutation({
    mutationFn: (vars: { fixtureId: number; predHome: number; predAway: number }) =>
      apiRequest("/api/rsl/predictions", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّعك ✅", description: "بالتوفيق! النتيجة تظهر فور انتهاء المباراة." });
      queryClient.invalidateQueries({ queryKey: ["/api/rsl/predictions/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rsl/predictions/mine"] });
    },
    onError: (err: any) => {
      toast({
        title: "تعذّر حفظ التوقّع",
        description: err?.message || "حاول مرة أخرى",
        variant: "destructive",
      });
      // إن أُغلقت المباراة بين الجلب والإرسال، حدّث القائمة لتعكس القفل
      queryClient.invalidateQueries({ queryKey: ["/api/rsl/predictions/today"] });
    },
  });

  const goLogin = () => {
    window.location.href = "/login";
  };

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
              <Trophy className="h-5 w-5 text-sky-300" />
              <span className="text-sm font-bold">دوري روشن السعودي</span>
            </div>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">توقّعات دوري روشن</h1>
            <p className="mt-2 max-w-xl text-emerald-50/90">
              توقّع النتيجة الدقيقة بالأهداف قبل صافرة البداية. من يصيب النتيجة يربح من جائزة الـ
              <span className="font-black"> 500 نقطة</span> ولاء لكل مباراة — وتُقسَّم بين كل المصيبين،
              وبطل الموسم بجائزة <span className="font-black">10,000 نقطة</span> بوزن المبادر.
            </p>

            {isAuthenticated ? (
              <div className="mt-5 inline-flex items-center gap-4 rounded-2xl bg-white/15 px-4 py-2.5 backdrop-blur">
                <div className="text-center">
                  <p className="text-xl font-black tabular-nums">{formatNumber(myRank?.totalPoints ?? 0)}</p>
                  <p className="text-[11px] text-emerald-100">نقاط التوقّعات</p>
                </div>
                <div className="h-8 w-px bg-white/25" />
                <div className="text-center">
                  <p className="text-xl font-black tabular-nums">{formatNumber(myRank?.correctCount ?? 0)}</p>
                  <p className="text-[11px] text-emerald-100">إصابة دقيقة</p>
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
                data-testid={`rsl-pred-tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* المحتوى */}
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
              <RslMyPredictions predictions={myPredictions} isLoading={mineLoading} />
            ) : (
              <SignInPrompt onLogin={goLogin} />
            ))}

          {tab === "tournament" && (
            <RslLongPredictions isAuthenticated={isAuthenticated} onRequireLogin={goLogin} />
          )}

          {tab === "leaders" && (
            <RslPredictionsLeaderboard
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
        </div>
      </main>

      <Footer />
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
  matches: PredictableMatch[];
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
          <div key={i} className="h-56 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-14 text-center">
        <Target className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-bold">لا مباريات اليوم أو غدًا</p>
        <p className="mt-1 text-sm text-muted-foreground">
          تُفتح مباريات كل جولة للتوقّع هنا قبل يومها — وحتى ذلك الحين توقّع البطل من تبويب «توقّع البطل».
        </p>
      </div>
    );
  }

  // تجميع حسب اليوم مع وسم نسبي اليوم/غدًا — نفس تبويب المونديال
  const todayKey = todayRiyadhKey();
  const tomorrowKey = new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const groups: { key: string; label: string; items: PredictableMatch[] }[] = [];
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
          <h2 className="mb-2.5 flex items-center gap-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
            <span className="h-4 w-1 rounded-full bg-emerald-500" />
            {g.label}
            <span className="text-xs font-normal text-muted-foreground">({formatNumber(g.items.length)})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.items.map((m) => (
              <RslPredictionMatchCard
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
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
      >
        تسجيل الدخول
      </button>
    </div>
  );
}
