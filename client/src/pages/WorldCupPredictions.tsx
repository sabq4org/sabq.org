import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trophy, Target, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatKickoffDay, riyadhDayKey, todayRiyadhKey } from "@/components/worldcup/wcTypes";
import { PredictionMatchCard } from "@/components/worldcup/predictions/PredictionMatchCard";
import { PredictionsLeaderboard } from "@/components/worldcup/predictions/PredictionsLeaderboard";
import { MyPredictionsList } from "@/components/worldcup/predictions/MyPredictionsList";
import type {
  PredictableMatch,
  LeaderRow,
  MyPredictionRow,
} from "@/components/worldcup/predictions/predictionsTypes";

type Tab = "today" | "mine" | "leaders";

const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "المباريات" },
  { key: "mine", label: "توقّعاتي" },
  { key: "leaders", label: "المتصدّرون" },
];

export default function WorldCupPredictions() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => {
    document.title = "توقّعات المونديال — توقّع واربح نقاط الولاء | سبق";
  }, []);

  // مباريات اليوم — استطلاع سريع (10ث) متى كانت هناك مباراة جارية/بانتظار الاحتساب
  const { data: todayData, isLoading: todayLoading } = useQuery<{ matches: PredictableMatch[] }>({
    queryKey: ["/api/world-cup/predictions/today"],
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
    queryKey: ["/api/world-cup/predictions/mine"],
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const { data: leaderData, isLoading: leaderLoading } = useQuery<{ leaders: LeaderRow[] }>({
    queryKey: ["/api/world-cup/predictions/leaderboard"],
    staleTime: 60_000,
  });

  const matches = Array.isArray(todayData?.matches) ? todayData.matches : [];
  const myPredictions = Array.isArray(mineData?.predictions) ? mineData.predictions : [];
  const leaders = Array.isArray(leaderData?.leaders) ? leaderData.leaders : [];
  const myRank = user ? leaders.find((l) => l.userId === user.id) : undefined;

  const submitMutation = useMutation({
    mutationFn: (vars: { fixtureId: number; predHome: number; predAway: number }) =>
      apiRequest("/api/world-cup/predictions", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّعك ✅", description: "بالتوفيق! النتيجة تظهر فور انتهاء المباراة." });
      queryClient.invalidateQueries({ queryKey: ["/api/world-cup/predictions/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/world-cup/predictions/mine"] });
    },
    onError: (err: any) => {
      toast({
        title: "تعذّر حفظ التوقّع",
        description: err?.message || "حاول مرة أخرى",
        variant: "destructive",
      });
      // إن أُغلقت المباراة بين الجلب والإرسال، حدّث القائمة لتعكس القفل
      queryClient.invalidateQueries({ queryKey: ["/api/world-cup/predictions/today"] });
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
              <Trophy className="h-5 w-5" />
              <span className="text-sm font-bold">مونديال 2026</span>
            </div>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">توقّعات المونديال</h1>
            <p className="mt-2 max-w-xl text-emerald-50/90">
              توقّع النتيجة الدقيقة بالأهداف قبل صافرة البداية. من يصيب النتيجة يربح من جائزة الـ
              <span className="font-black"> 500 نقطة</span> ولاء لكل مباراة — وتُقسَّم بين كل المصيبين.
            </p>

            {isAuthenticated ? (
              <div className="mt-5 inline-flex items-center gap-4 rounded-2xl bg-white/15 px-4 py-2.5 backdrop-blur">
                <div className="text-center">
                  <p className="text-xl font-black tabular-nums">{(myRank?.totalPoints ?? 0).toLocaleString("ar-SA")}</p>
                  <p className="text-[11px] text-emerald-100">نقاط التوقّعات</p>
                </div>
                <div className="h-8 w-px bg-white/25" />
                <div className="text-center">
                  <p className="text-xl font-black tabular-nums">{(myRank?.correctCount ?? 0).toLocaleString("ar-SA")}</p>
                  <p className="text-[11px] text-emerald-100">إصابة دقيقة</p>
                </div>
                {myRank && (
                  <>
                    <div className="h-8 w-px bg-white/25" />
                    <div className="text-center">
                      <p className="text-xl font-black tabular-nums">#{myRank.rank.toLocaleString("ar-SA")}</p>
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
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition sm:flex-none ${
                  tab === t.key
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`wc-pred-tab-${t.key}`}
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
              <MyPredictionsList predictions={myPredictions} isLoading={mineLoading} />
            ) : (
              <SignInPrompt onLogin={goLogin} />
            ))}

          {tab === "leaders" && (
            <PredictionsLeaderboard leaders={leaders} currentUserId={user?.id} isLoading={leaderLoading} />
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
        <p className="mt-1 text-sm text-muted-foreground">عُد قريبًا — تُفتح مباريات اليوم والغد للتوقّع هنا فور جدولتها.</p>
      </div>
    );
  }

  // تجميع حسب اليوم (المباريات تصل مرتّبة زمنيًا من الخادم) مع وسم نسبي اليوم/غدًا
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
            <span className="text-xs font-normal text-muted-foreground">({g.items.length.toLocaleString("ar-SA")})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.items.map((m) => (
              <PredictionMatchCard
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
