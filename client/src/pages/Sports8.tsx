/**
 * البوابة الرياضية — نسخة الشباب على /sports8
 *
 * فلسفة التصميم: «حيّ أولًا» (live-first) وإيقاع شبابي. تعتمد بالكامل على نفس
 * مزوّدات البيانات واشتراكاتنا اللحظية (TheSports للنتيجة اللحظية + API-Football
 * للأسماء/الجداول) عبر نقاط /api/sports/* — لا اشتراكات جديدة ولا أي تغيير backend.
 *
 * ما الجديد مقارنةً بـ /sports (لوحة سبق النظيفة):
 *  1) «نبض المباشر» — شريط أفقي حيّ لمباريات العالم الجارية الآن مع الدقيقة
 *     اللحظية ونبضة حمراء، يُحدَّث كل 20ث (نتيجة TheSports اللحظية).
 *  2) «تحدّى الجمهور» — بطاقة gamification بارزة: نقاطك، إصاباتك التامّة،
 *     ترتيبك على لوحة المتصدّرين، واختيار سريع لمباريات اليوم لتوقّعها.
 *  3) «فِرقي» — متابعاتك مع حالتها اللحظية.
 *  4) مركز المباريات + الترتيب + الهدّافون + لوحة المتصدّرين + فيديو شورتس.
 *
 * يعيد استخدام مكوّنات SportsHub الثقيلة بالكامل (MatchHub, StandingsTable,
 * PodiumCard, CardLeaders, LeaderboardBoard, MatchDialog, NewsCard, VideoReel...).
 * RTL + داكن + متجاوب.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  Newspaper,
  CalendarDays,
  ListOrdered,
  Goal,
  Images,
  PlayCircle,
  Target,
  Star,
  Hand,
  Square,
  Clock,
  Radio,
  ChevronLeft,
  Zap,
  Crown,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArticleWithDetails, Category } from "@shared/schema";
import {
  ACCENT,
  COMP_CATEGORY_LABELS,
  COMP_CATEGORY_ORDER,
  COMP_STATUS_LABELS,
  COMP_STATUS_RANK,
  SectionHeader,
  moreLink,
  PillTabs,
  NewsCard,
  MatchHub,
  StandingsTable,
  PodiumCard,
  CardLeaders,
  LeaderboardBoard,
  ImageGallery,
  VideoReel,
  MatchDialog,
  useSportsFollows,
  type SpFixture,
  type SpLiveItem,
  type SpStandingRow,
  type SpScorer,
  type SpAssister,
  type SpCardLeader,
  type SpCompetition,
  type SpCompetitionCategory,
  type SpShort,
} from "./SportsHub";

const articleTime = (a: ArticleWithDetails) =>
  new Date(a.publishedAt || (a as any).createdAt || 0).getTime();
const byRecency = (a: ArticleWithDetails, b: ArticleWithDetails) =>
  articleTime(b) - articleTime(a);

const nowSec = () => Math.floor(Date.now() / 1000);

// ============================================================
// نبض المباشر — شريط أفقي لمباريات العالم الجارية الآن (نتيجة لحظية).
// إن لم توجد مباريات حيّة يعرض أقرب مباريات اليوم القادمة.
// ============================================================
function LivePulseChip({ f, onOpen }: { f: SpLiveItem; onOpen: (id: number) => void }) {
  const live = f.status.live;
  const finished = f.status.finished;
  const minute = f.status.elapsed != null ? `${f.status.elapsed}'` : f.status.label;
  const ko = new Date(f.timestamp * 1000).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  return (
    <button
      type="button"
      onClick={() => onOpen(f.id)}
      className={`group relative shrink-0 w-[200px] snap-start text-right rounded-2xl border p-3 transition-all hover:-translate-y-0.5 ${
        live
          ? "border-red-500/40 bg-red-500/5 hover:border-red-500/70"
          : "border-white/15 bg-white/5 hover:border-white/30"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-white/70 truncate max-w-[120px]">{f.competition}</span>
        {live ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-300">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            {minute}
          </span>
        ) : finished ? (
          <span className="text-[10px] font-bold text-white/50">انتهت</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white/60">
            <Clock className="w-3 h-3" /> {ko}
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        <TeamScoreRow name={f.home.name} logo={f.home.logo} goals={f.goals.home} live={live || finished} />
        <TeamScoreRow name={f.away.name} logo={f.away.logo} goals={f.goals.away} live={live || finished} />
      </div>
    </button>
  );
}

function TeamScoreRow({ name, logo, goals, live }: { name: string; logo: string; goals: number | null; live: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {logo ? <img src={logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" /> : <span className="w-5 h-5 rounded-full bg-white/10 shrink-0" />}
      <span className="text-xs font-bold text-white truncate flex-1">{name}</span>
      <span className="text-sm font-black tabular-nums text-white" dir="ltr">{live ? goals ?? 0 : "-"}</span>
    </div>
  );
}

function LivePulseRail({ items, onOpen }: { items: SpLiveItem[]; onOpen: (id: number) => void }) {
  const order = (rows: SpLiveItem[]) =>
    [...rows].sort((a, b) => {
      if (a.status.live !== b.status.live) return a.status.live ? -1 : 1;
      if (a.status.finished !== b.status.finished) return a.status.finished ? 1 : -1;
      return a.timestamp - b.timestamp;
    });
  const shown = order(items).slice(0, 14);
  if (shown.length === 0) {
    return (
      <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-6 text-center text-sm text-white/70">
        لا مباريات الآن — تابع مركز المباريات للجولة القادمة.
      </div>
    );
  }
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide snap-x pb-1">
      {shown.map((f) => <LivePulseChip key={f.id} f={f} onOpen={onOpen} />)}
    </div>
  );
}

// ============================================================
// تحدّى الجمهور — بطاقة gamification: نقاطك + ترتيبك + توقّع سريع.
// ============================================================
interface MyStats { totalPoints: number; predictions: number; exact: number; correct: number; }
interface LbEntry { userId: string; rank: number; }

function PredictChallenge({ upcoming, onOpen }: { upcoming: SpLiveItem[]; onOpen: (id: number) => void }) {
  const { user } = useAuth();
  const authed = !!user;

  const { data: meData } = useQuery<{ stats: MyStats }>({
    queryKey: ["/api/sports/predictions/me"],
    enabled: authed,
    staleTime: 60_000,
  });
  const stats = meData?.stats;

  const { data: lbData } = useQuery<{ leaderboard: LbEntry[] }>({
    queryKey: ["/api/sports/leaderboard", { period: "all" }],
    staleTime: 60_000,
  });
  const myRank = useMemo(() => {
    if (!authed || !lbData?.leaderboard) return null;
    return lbData.leaderboard.find((e) => String(e.userId) === String((user as any)?.id))?.rank ?? null;
  }, [authed, lbData, user]);

  const picks = upcoming.slice(0, 4);
  const accuracy = stats && stats.predictions > 0 ? Math.round((stats.correct / stats.predictions) * 100) : null;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-card">
      <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border">
        <span className="flex items-center gap-2 text-base font-black text-foreground">
          <span className="grid place-items-center w-8 h-8 rounded-xl bg-primary/15">
            <Target className={`w-4 h-4 ${ACCENT}`} />
          </span>
          تحدّى الجمهور
        </span>
        <Link href="/sports8#leaderboard" className={`inline-flex items-center gap-1 text-xs font-bold ${ACCENT} hover:underline`}>
          لوحة المتصدّرين <ChevronLeft className="w-3.5 h-3.5" />
        </Link>
      </div>

      {authed ? (
        <div className="grid grid-cols-3 gap-px bg-border">
          <Stat icon={<Sparkles className="w-4 h-4" />} value={stats?.totalPoints ?? 0} label="نقطة" />
          <Stat icon={<Crown className="w-4 h-4 text-amber-500" />} value={myRank ? `#${myRank}` : "—"} label="ترتيبك" />
          <Stat icon={<TrendingUp className="w-4 h-4" />} value={accuracy != null ? `${accuracy}%` : "—"} label="الدقّة" />
        </div>
      ) : (
        <div className="px-5 py-4 text-sm text-muted-foreground bg-muted/30">
          <Link href="/login" className={`font-bold ${ACCENT} hover:underline`}>سجّل دخولك</Link> لتوقّع النتائج وتجمع النقاط وتنافس على لوحة المتصدّرين.
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-3 text-xs font-black text-foreground">
          <Zap className={`w-4 h-4 ${ACCENT}`} /> توقّع مباريات اليوم
        </div>
        {picks.length > 0 ? (
          <div className="grid gap-2">
            {picks.map((f) => {
              const ko = new Date(f.timestamp * 1000).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
              return (
                <button key={f.id} type="button" onClick={() => onOpen(f.id)}
                  className="group flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-right transition-colors hover:border-primary/50">
                  <span className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
                    <span className="text-xs font-bold text-foreground truncate">{f.home.name}</span>
                    {f.home.logo && <img src={f.home.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold text-muted-foreground tabular-nums px-1.5">{ko}</span>
                  <span className="flex items-center gap-1.5 min-w-0 flex-1">
                    {f.away.logo && <img src={f.away.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
                    <span className="text-xs font-bold text-foreground truncate">{f.away.name}</span>
                  </span>
                  <span className={`shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-black ${ACCENT} group-hover:bg-primary group-hover:text-white transition-colors`}>
                    <Target className="w-3 h-3" /> توقّع
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            لا مباريات قابلة للتوقّع اليوم — عُد قبل انطلاق الجولة القادمة.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 bg-card py-4">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xl font-black text-foreground tabular-nums leading-none">{value}</span>
      <span className="text-[10px] font-bold text-muted-foreground">{label}</span>
    </div>
  );
}

// ============================================================
// فِرقي — متابعاتك مع حالتها اللحظية (يظهر للمستخدم المتابِع فقط).
// ============================================================
function FollowsStrip({ todayMatches, onOpen }: { todayMatches: SpLiveItem[]; onOpen: (id: number) => void }) {
  const { isAuthed, follows } = useSportsFollows();
  const teamFollows = follows.filter((f) => f.kind === "team");
  if (!isAuthed || teamFollows.length === 0) return null;
  const matchOf = (refId: string) => todayMatches.find((m) => String(m.home.id) === refId || String(m.away.id) === refId);
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-white/80">
        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> فِرقي
      </span>
      {teamFollows.map((f) => {
        const m = matchOf(f.refId);
        const live = m?.status.live ?? false;
        const inner = (
          <>
            {f.refLogo ? <img src={f.refLogo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" /> : <span className="w-5 h-5 rounded-full bg-white/15 shrink-0" />}
            <span className="text-sm font-bold whitespace-nowrap text-white">{f.refName}</span>
            {live && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-300">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                {m!.status.elapsed != null ? `${m!.status.elapsed}'` : "مباشر"}
              </span>
            )}
            {!live && m?.status.finished && (
              <span className="text-[10px] font-black tabular-nums text-white/70" dir="ltr">{m.goals.home ?? 0}-{m.goals.away ?? 0}</span>
            )}
          </>
        );
        return m ? (
          <button key={f.id} type="button" onClick={() => onOpen(m.id)}
            className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${live ? "border-red-400/50 bg-red-500/10" : "border-white/20 bg-white/5 hover:border-white/40"}`}>
            {inner}
          </button>
        ) : (
          <Link key={f.id} href={`/sports/team/${f.refId}`}
            className="shrink-0 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 hover:border-white/40 transition-colors">
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

// ============================================================
// الصفحة
// ============================================================
export default function Sports8() {
  const { user } = useAuth();
  const [compSlug, setCompSlug] = useState("pro-league");
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  const [scorersTab, setScorersTab] = useState<"scorers" | "assists" | "cards">("scorers");

  useEffect(() => { document.title = "سبق سبورت · الشباب | سبق"; }, []);
  useCanonical("https://sabq.org/sports8");

  const { data: newsRaw, isLoading: newsLoading } = useQuery<ArticleWithDetails[]>({ queryKey: ["/api/categories", "sports", "articles"] });
  const news = Array.isArray(newsRaw) ? newsRaw : [];

  const { data: category } = useQuery<Category>({ queryKey: ["/api/categories/slug", "sports"] });
  const sportsCatId = (category as any)?.id;

  const { data: compsData } = useQuery<{ competitions: SpCompetition[] }>({ queryKey: ["/api/sports/competitions"], staleTime: 60 * 60_000 });
  const competitions = Array.isArray(compsData?.competitions) ? compsData.competitions : [];
  const comp = competitions.find((c) => c.slug === compSlug);
  const hasStandings = comp?.hasStandings ?? compSlug === "pro-league";
  const hasScorers = comp?.hasScorers ?? compSlug === "pro-league";

  const catOf = (c: SpCompetition): SpCompetitionCategory => c.category ?? "saudi";
  const activeCat: SpCompetitionCategory = comp ? catOf(comp) : "saudi";
  const presentCats = COMP_CATEGORY_ORDER.filter((cat) => competitions.some((c) => catOf(c) === cat));
  const compsInActiveCat = competitions
    .filter((c) => catOf(c) === activeCat)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ra = COMP_STATUS_RANK[a.c.status ?? "unknown"];
      const rb = COMP_STATUS_RANK[b.c.status ?? "unknown"];
      return ra !== rb ? ra - rb : a.i - b.i;
    })
    .map(({ c }) => c);

  const { data: matchesData } = useQuery<{ configured: boolean; live: SpFixture[]; today: SpFixture[]; upcoming: SpFixture[]; results: SpFixture[] }>({
    queryKey: [`/api/sports/${compSlug}/matches`], refetchInterval: 30_000, refetchIntervalInBackground: false,
  });
  const matchesConfigured = matchesData?.configured ?? true;
  const matches = {
    live: Array.isArray(matchesData?.live) ? matchesData!.live : [],
    today: Array.isArray(matchesData?.today) ? matchesData!.today : [],
    upcoming: Array.isArray(matchesData?.upcoming) ? matchesData!.upcoming : [],
    results: Array.isArray(matchesData?.results) ? matchesData!.results : [],
  };

  // نتيجة لحظية: نحدّث أسرع (20ث) لأن «نبض المباشر» محور هذه النسخة.
  const { data: todayData } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today"], refetchInterval: 20_000, refetchIntervalInBackground: false,
  });
  const todayMatches = Array.isArray(todayData?.today) ? todayData!.today : [];
  const liveCount = todayMatches.filter((f) => f.status.live).length;
  const upcomingToday = todayMatches
    .filter((f) => !f.status.live && !f.status.finished && f.timestamp > nowSec())
    .sort((a, b) => a.timestamp - b.timestamp);

  const { data: standingsData } = useQuery<{ standings: SpStandingRow[] }>({ queryKey: [`/api/sports/${compSlug}/standings`], staleTime: 5 * 60_000, enabled: hasStandings });
  const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];

  const { data: scorersData } = useQuery<{ scorers: SpScorer[] }>({ queryKey: [`/api/sports/${compSlug}/scorers`], staleTime: 10 * 60_000, enabled: hasScorers });
  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];

  const { data: assistsData } = useQuery<{ assists: SpAssister[] }>({ queryKey: [`/api/sports/${compSlug}/assists`], staleTime: 10 * 60_000, enabled: hasScorers });
  const assisters = Array.isArray(assistsData?.assists) ? assistsData.assists : [];

  const { data: cardsData } = useQuery<{ yellow: SpCardLeader[]; red: SpCardLeader[] }>({ queryKey: [`/api/sports/${compSlug}/cards`], staleTime: 10 * 60_000, enabled: hasScorers && scorersTab === "cards" });
  const yellowLeaders = Array.isArray(cardsData?.yellow) ? cardsData.yellow : [];

  const { data: shortsByCat } = useQuery<{ shorts: SpShort[] }>({ queryKey: ["/api/shorts", { categoryId: sportsCatId, limit: 12 }], enabled: !!sportsCatId, staleTime: 10 * 60_000 });
  const { data: shortsFeatured } = useQuery<{ shorts: SpShort[] }>({ queryKey: ["/api/shorts/featured", { limit: 12 }], staleTime: 10 * 60_000 });
  const catShorts = Array.isArray(shortsByCat?.shorts) ? shortsByCat.shorts : [];
  const featShorts = Array.isArray(shortsFeatured?.shorts) ? shortsFeatured.shorts : [];
  const videos = (catShorts.length > 0 ? catShorts : featShorts).slice(0, 8);

  const sortedNews = [...news].sort(byRecency);
  const latest = sortedNews.slice(0, 8);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        {/* ===== هيرو حيوي: نبض المباشر ===== */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary via-emerald-700 to-teal-800 text-white">
          <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full bg-emerald-300/10 blur-3xl pointer-events-none" />
          <div className="relative max-w-7xl mx-auto px-4 pt-7 pb-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="grid place-items-center w-11 h-11 rounded-2xl bg-white/15 backdrop-blur shrink-0">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-wide uppercase text-white/80">
                    <Sparkles className="w-3 h-3" /> سبق سبورت · نسخة الشباب
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-none">نبض الملاعب لحظة بلحظة</h1>
                </div>
              </div>
              {liveCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-black shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> {liveCount} مباشر الآن
                </span>
              )}
            </div>

            <div className="mt-5">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-black text-white/90">
                {liveCount > 0 ? <Radio className="w-4 h-4 text-red-300" /> : <CalendarDays className="w-4 h-4" />}
                {liveCount > 0 ? "نبض المباشر" : "مباريات اليوم"}
              </div>
              <LivePulseRail items={todayMatches} onOpen={setOpenMatch} />
            </div>

            <div className="mt-4">
              <FollowsStrip todayMatches={todayMatches} onOpen={setOpenMatch} />
            </div>
          </div>
        </section>

        {/* ===== تحدّى الجمهور + أحدث الأخبار ===== */}
        <section className="max-w-7xl mx-auto px-4 pt-8">
          <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
            <div className="lg:col-span-1">
              <PredictChallenge upcoming={upcomingToday} onOpen={setOpenMatch} />
            </div>
            <div className="lg:col-span-2">
              <SectionHeader title="أحدث الأخبار" subtitle="آخر مستجدّات الرياضة" icon={<Newspaper className={`w-5 h-5 ${ACCENT}`} />} action={moreLink("/category/sports", "كل الأخبار")} />
              {newsLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-2xl" />)}
                </div>
              ) : latest.length > 0 ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {latest.map((a, i) => <NewsCard key={a.id} article={a} index={i} />)}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-16 bg-card rounded-3xl border border-dashed border-border">بانتظار أول الأخبار الرياضية — تظهر هنا فور نشرها.</div>
              )}
            </div>
          </div>
        </section>

        {/* ===== مركز المباريات + الترتيب ===== */}
        <section className="mt-12 sm:mt-16 bg-muted/40 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 py-12 space-y-14">
            <div id="matches" className="scroll-mt-16">
              <SectionHeader title="مركز المباريات" subtitle="مباشر · اليوم · قادمة · النتائج" icon={<CalendarDays className={`w-5 h-5 ${ACCENT}`} />} action={moreLink("/sports/matches", "مباريات اليوم")} />
              {competitions.length > 0 && (
                <div className="space-y-2 mb-5">
                  {presentCats.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {presentCats.map((cat) => (
                        <button key={cat}
                          onClick={() => { const first = competitions.find((c) => catOf(c) === cat); if (first) setCompSlug(first.slug); }}
                          className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${activeCat === cat ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>
                          {COMP_CATEGORY_LABELS[cat]}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {compsInActiveCat.map((c) => (
                      <button key={c.slug} onClick={() => setCompSlug(c.slug)}
                        title={c.status ? COMP_STATUS_LABELS[c.status] : undefined}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${compSlug === c.slug ? "bg-primary text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-primary/40"} ${c.status === "finished" && compSlug !== c.slug ? "opacity-60" : ""}`}>
                        {c.status === "ongoing" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <MatchHub key={compSlug} data={matches} configured={matchesConfigured} compSlug={compSlug} onOpen={setOpenMatch} />
            </div>

            {hasStandings && (
              <div id="standings" className="scroll-mt-16">
                <SectionHeader title="جدول الترتيب" subtitle="فرز وتصفية مباشرة" icon={<ListOrdered className={`w-5 h-5 ${ACCENT}`} />} />
                {standings.length ? <StandingsTable rows={standings} /> : (
                  <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار انطلاق البطولة — يظهر جدول الترتيب هنا مع بداية الجولة الأولى.</div>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 py-12 space-y-14">
          {/* الهدّافون / صنّاع الأهداف / البطاقات */}
          {hasScorers && (
            <section id="scorers" className="scroll-mt-16">
              <SectionHeader
                title={scorersTab === "scorers" ? "منصّة الهدّافين" : scorersTab === "assists" ? "منصّة صنّاع الأهداف" : "متصدّرو البطاقات"}
                subtitle={scorersTab === "scorers" ? "الأكثر تهديفًا في البطولة" : scorersTab === "assists" ? "الأكثر صناعةً للأهداف" : "الأكثر حصولًا على الإنذارات"}
                icon={scorersTab === "scorers" ? <Goal className={`w-5 h-5 ${ACCENT}`} /> : scorersTab === "assists" ? <Hand className={`w-5 h-5 ${ACCENT}`} /> : <Square className="w-5 h-5 text-amber-500" />}
                action={
                  <PillTabs layoutId="sports8-scorers-tab" active={scorersTab} onChange={(k) => setScorersTab(k as "scorers" | "assists" | "cards")}
                    tabs={[{ key: "scorers", label: "هدّافون" }, { key: "assists", label: "صنّاع الأهداف" }, { key: "cards", label: "البطاقات" }]} />
                }
              />
              {scorersTab === "scorers" ? (
                scorers.length ? <PodiumCard entries={scorers.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.goals, secondary: s.assists }))} primaryLabel="عدد الأهداف" secondaryLabel="الصناعة" /> : (
                  <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار تسجيل أول الأهداف — يظهر ترتيب الهدّافين هنا مع انطلاق المنافسة.</div>
                )
              ) : scorersTab === "assists" ? (
                assisters.length ? <PodiumCard entries={assisters.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.assists, secondary: s.goals }))} primaryLabel="عدد الصناعات" secondaryLabel="الأهداف" /> : (
                  <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار أولى الصناعات — يظهر ترتيب صنّاع الأهداف هنا مع انطلاق المنافسة.</div>
                )
              ) : (
                yellowLeaders.length ? <CardLeaders leaders={yellowLeaders} /> : (
                  <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">لا تتوفّر بيانات البطاقات لهذه البطولة بعد.</div>
                )
              )}
            </section>
          )}

          {/* لوحة المتصدّرين (المجتمع) */}
          <section id="leaderboard" className="scroll-mt-24">
            <SectionHeader title="لوحة المتصدّرين" subtitle="توقّع النتائج ونافِس الجمهور" icon={<Crown className="w-5 h-5 text-amber-500" />} />
            <LeaderboardBoard />
          </section>

          {/* صور + فيديو */}
          {news.length > 0 && (
            <section id="gallery" className="scroll-mt-16">
              <SectionHeader title="معرض الرياضة" subtitle="أبرز اللقطات بالصورة" icon={<Images className={`w-5 h-5 ${ACCENT}`} />} />
              <ImageGallery articles={news} />
            </section>
          )}

          {videos.length > 0 && (
            <section id="videos" className="scroll-mt-16">
              <SectionHeader title="فيديو وملخّصات" subtitle="شاهد أحدث المقاطع" icon={<PlayCircle className={`w-5 h-5 ${ACCENT}`} />} action={moreLink("/shorts", "كل الفيديوهات")} />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {videos.map((v, i) => <VideoReel key={v.id} short={v} index={i} />)}
              </div>
            </section>
          )}
        </div>
      </main>

      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}
