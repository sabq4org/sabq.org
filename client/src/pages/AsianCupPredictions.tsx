import { useEffect, useState } from "react";
import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { Bot, Flame, Sparkles, Target, Trophy } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/format";
import { formatKickoffDay, riyadhDayKey, todayRiyadhKey } from "@/components/asiancup/acTypes";
import { AcPredictionMatchCard } from "@/components/asiancup/predictions/AcPredictionMatchCard";
import { AcPredictionsLeaderboard } from "@/components/asiancup/predictions/AcPredictionsLeaderboard";
import { AcMyPredictionsList } from "@/components/asiancup/predictions/AcMyPredictionsList";
import type {
  AcLeaderboardResponse,
  AcMeStats,
  AcMyPredictionRow,
  AcPredictableMatch,
} from "@/components/asiancup/predictions/acPredictionTypes";

type Tab = "today" | "mine" | "leaders";

const TABS: { key: Tab; label: string }[] = [
  { key: "today", label: "المباريات" },
  { key: "mine", label: "توقّعاتي" },
  { key: "leaders", label: "المتصدّرون" },
];

export default function AsianCupPredictions() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => {
    document.title = "توقّعات كأس آسيا الذكية — توقّع واربح نقاط الولاء | سبق";
  }, []);

  const { data: todayData, isLoading: todayLoading } = useQuery<{ matches: AcPredictableMatch[]; me: AcMeStats | null }>({
    queryKey: ["/api/asian-cup/predictions/today"],
    refetchInterval: (query) => {
      const matches = query.state.data?.matches ?? [];
      const hot = matches.some(
        (m) => m.fixture.status.live || (m.locked && m.settlement?.status !== "settled"),
      );
      return hot ? 10_000 : 30_000;
    },
    refetchIntervalInBackground: false,
  });

  const { data: mineData, isLoading: mineLoading } = useQuery<{ predictions: AcMyPredictionRow[] }>({
    queryKey: ["/api/asian-cup/predictions/mine"],
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  // «عرض المزيد» يرفع limit تدريجيًا (سقف الخادم 500) — keepPreviousData يمنع
  // وميض الهيكل العظمي أثناء جلب الدفعة الأكبر.
  const [leaderLimit, setLeaderLimit] = useState(100);
  const {
    data: leaderData,
    isLoading: leaderLoading,
    isFetching: leaderFetching,
  } = useQuery<AcLeaderboardResponse>({
    queryKey: ["/api/asian-cup/predictions/leaderboard", { limit: leaderLimit }],
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const matches = Array.isArray(todayData?.matches) ? todayData.matches : [];
  const me = todayData?.me ?? null;
  const myPredictions = Array.isArray(mineData?.predictions) ? mineData.predictions : [];
  const leaders = Array.isArray(leaderData?.leaders) ? leaderData.leaders : [];
  const leaderboardViewer = leaderData?.viewer ?? null;
  // صفّي في القائمة المعروضة، وإلا صف viewer من الخادم (رتبتي الحقيقية ولو بعد الـ100)
  const myRank = user
    ? (leaders.find((l) => l.userId === user.id) ?? leaderboardViewer ?? undefined)
    : undefined;

  const submitMutation = useMutation({
    mutationFn: (vars: { fixtureId: number; predHome: number; predAway: number }) =>
      apiRequest("/api/asian-cup/predictions", { method: "POST", body: JSON.stringify(vars) }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّعك ✅", description: "بالتوفيق! النقاط تُحتسب فور انتهاء المباراة." });
      queryClient.invalidateQueries({ queryKey: ["/api/asian-cup/predictions/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/asian-cup/predictions/mine"] });
    },
    onError: (err: any) => {
      toast({ title: "تعذّر حفظ التوقّع", description: err?.message || "حاول مرة أخرى", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/asian-cup/predictions/today"] });
    },
  });

  const goLogin = () => {
    window.location.href = "/login";
  };

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        {/* بانر البطل */}
        <section className="relative overflow-hidden bg-gradient-to-bl from-emerald-600 via-emerald-700 to-emerald-800 text-white">
          <div className="absolute inset-0 opacity-10 [background-image:radial-gradient(circle_at_20%_30%,white_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative mx-auto max-w-4xl px-4 py-10 sm:py-12">
            <div className="flex items-center gap-2 text-emerald-100">
              <Trophy className="h-5 w-5" />
              <span className="text-sm font-bold">كأس آسيا 2027 · السعودية</span>
            </div>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">توقّعات كأس آسيا الذكية</h1>
            <p className="mt-2 max-w-xl text-emerald-50/90">
              توقّع نتيجة كل مباراة، واكسب نقاطًا أكثر كلّما كان توقّعك الصحيح أجرأ. يساعدك توقّع سبق
              الذكي وإجماع الجمهور — والإصابات المتتالية تُضاعِف رصيدك.
            </p>

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
                      <p className="text-[11px] text-emerald-100">سلسلة حالية</p>
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
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-50"
              >
                <Sparkles className="h-4 w-4" /> سجّل دخولك وابدأ التوقّع
              </button>
            )}
          </div>
        </section>

        <div className="mx-auto max-w-4xl px-4 py-6">
          {/* شرح آلية النقاط */}
          <ScoringExplainer />

          {/* التبويبات */}
          <div className="mb-5 inline-flex w-full gap-1 rounded-full bg-muted p-1 sm:w-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition sm:flex-none ${
                  tab === t.key ? "bg-emerald-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`ac-pred-tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "today" && (
            <TodayTab
              matches={matches}
              currentStreak={me?.currentStreak ?? 0}
              isLoading={todayLoading}
              isAuthenticated={isAuthenticated}
              submittingFixtureId={submitMutation.isPending ? submitMutation.variables?.fixtureId : undefined}
              onSubmit={(fixtureId, predHome, predAway) => submitMutation.mutate({ fixtureId, predHome, predAway })}
              onRequireLogin={goLogin}
            />
          )}

          {tab === "mine" &&
            (isAuthenticated ? (
              <AcMyPredictionsList predictions={myPredictions} isLoading={mineLoading} />
            ) : (
              <SignInPrompt onLogin={goLogin} />
            ))}

          {tab === "leaders" && (
            <AcPredictionsLeaderboard
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-xl font-black tabular-nums">{value}</p>
      <p className="text-[11px] text-emerald-100">{label}</p>
    </div>
  );
}

function Divider() {
  return <div className="h-8 w-px bg-white/25" />;
}

/** شرح مختصر لآلية الاحتساب المبتكرة — يميّز هذه المسابقة عن توقّع النتيجة الجاف. */
function ScoringExplainer() {
  const items = [
    { icon: <Target className="h-4 w-4" />, title: "طبقات", text: "نتيجة صحيحة 10 · فارق صحيح +8 · مطابقة تامّة +12" },
    { icon: <Sparkles className="h-4 w-4" />, title: "الجرأة", text: "كلّما قلّ احتمال نتيجتك الصحيحة، تضاعفت نقاطك (حتى ×3)" },
    { icon: <Flame className="h-4 w-4" />, title: "السلسلة", text: "3 إصابات متتالية ×1.1 · 5 ×1.25 · 7+ ×1.5" },
    { icon: <Bot className="h-4 w-4" />, title: "المساعد", text: "احتمالات النموذج + إجماع الجمهور يرشدانك قبل التوقّع" },
  ];
  return (
    <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.title} className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
          <div className="mb-1 flex items-center gap-1.5 font-black text-emerald-700 dark:text-emerald-300">
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
  currentStreak,
  isLoading,
  isAuthenticated,
  submittingFixtureId,
  onSubmit,
  onRequireLogin,
}: {
  matches: AcPredictableMatch[];
  currentStreak: number;
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
          <div key={i} className="h-80 animate-pulse rounded-xl bg-muted/60" />
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
          تنطلق كأس آسيا في يناير 2027 — تُفتح مباريات اليوم والغد للتوقّع هنا فور جدولتها.
        </p>
      </div>
    );
  }

  const todayKey = todayRiyadhKey();
  const tomorrowKey = new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const groups: { key: string; label: string; items: AcPredictableMatch[] }[] = [];
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
              <AcPredictionMatchCard
                key={m.fixture.id}
                match={m}
                currentStreak={currentStreak}
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
