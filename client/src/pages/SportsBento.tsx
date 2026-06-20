/**
 * البوابة الرياضية — تجربة لوحة Bento على /sports4
 *
 * توزيع إبداعي مختلف عن /sports2 (عمود واحد) و /sports3 (عمودان):
 * شبكة غير متماثلة ببطاقات بأحجام متفاوتة (نمط Apple/Linear). البطاقة
 * الأبرز (مباراة مباشرة الآن — وإلا الخبر الأبرز) تحتلّ ربع الشاشة،
 * وتتوزّع باقي البيانات في بلاطات متداخلة يعيد كلٌّ منها استخدام مكوّن
 * موجود في SportsHub (لا تكرار منطق العرض — تكرار طبقة الجلب فقط).
 *
 * RTL، متوافق مع الوضع الداكن، ومتجاوب (شبكة bento على الديسكتوب ← عمودان على الجوال).
 */
import { useEffect, useState } from "react";
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
  Hand,
  Square,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArticleWithDetails, Category } from "@shared/schema";
import {
  ACCENT,
  COMP_CATEGORY_LABELS,
  COMP_CATEGORY_ORDER,
  SectionHeader,
  moreLink,
  PillTabs,
  FeaturedCard,
  NewsCard,
  MatchHub,
  TitleRace,
  StandingsTable,
  PodiumCard,
  CardLeaders,
  LeaderboardBoard,
  ImageGallery,
  VideoReel,
  MatchDialog,
  TodayCompactRow,
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

// تبويبات القفز السريع (نفس IDs المستخدمة في sports2/sports3 لاتساق التجربة).
const SECTIONS = [
  { id: "matches", label: "المباريات", icon: CalendarDays },
  { id: "standings", label: "الترتيب", icon: ListOrdered },
  { id: "scorers", label: "الهدّافون", icon: Goal },
  { id: "leaderboard", label: "المتصدّرون", icon: Target },
  { id: "gallery", label: "صور", icon: Images },
  { id: "videos", label: "فيديو", icon: PlayCircle },
];

// ============================================================
// مكوّنات Bento الخاصة بهذه الصفحة (صغيرة، تعيد استخدام بيانات SportsHub)
// ============================================================

// بطاقة HERO: مباراة مباشرة الآن إن وُجدت — وإلا الخبر الأبرز.
// تتبدّل ديناميكيًا حسب الوضع الرياضي الفعلي (لمسة لا توجد في sports2/sports3).
function HeroSlot({ liveMatch, featured, onOpen }: {
  liveMatch?: SpLiveItem; featured?: ArticleWithDetails; onOpen: (id: number) => void;
}) {
  // الأفضلية الأولى: مباراة مباشرة — بطاقة داكنة بلمسة حمراء نابضة.
  if (liveMatch) {
    const { home, away, goals, status } = liveMatch;
    return (
      <button
        onClick={() => onOpen(liveMatch.id)}
        className="group relative w-full h-full overflow-hidden rounded-2xl text-right p-5 sm:p-6
                   bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900
                   border border-slate-700/50 hover-elevate transition-all"
      >
        {/* شارة «مباشر» نابضة */}
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 text-red-400 px-2.5 py-1 text-[11px] font-black">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            مباشر الآن
          </span>
          <span className="text-[11px] font-bold text-slate-400 truncate">{liveMatch.competition}</span>
        </div>
        <div className="flex items-center justify-center gap-3 sm:gap-5">
          {/* المضيف */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            {home.logo ? (
              <img src={home.logo} alt="" className="w-12 h-12 sm:w-16 sm:h-16 object-contain" loading="lazy" />
            ) : (
              <span className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white/10" />
            )}
            <span className="text-white text-sm font-bold text-center line-clamp-2 leading-tight">{home.name}</span>
          </div>
          {/* النتيجة */}
          <div className="text-center shrink-0">
            <div className="text-4xl sm:text-5xl font-black text-white tabular-nums tracking-tighter" dir="ltr">
              {goals.home ?? 0}<span className="mx-1.5 text-slate-500">-</span>{goals.away ?? 0}
            </div>
            <div className="mt-1 text-xs font-black text-red-400 tabular-nums">
              {status.elapsed != null ? `${status.elapsed}'` : "مباشر"}
            </div>
          </div>
          {/* الضيف */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            {away.logo ? (
              <img src={away.logo} alt="" className="w-12 h-12 sm:w-16 sm:h-16 object-contain" loading="lazy" />
            ) : (
              <span className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white/10" />
            )}
            <span className="text-white text-sm font-bold text-center line-clamp-2 leading-tight">{away.name}</span>
          </div>
        </div>
      </button>
    );
  }

  // الأفضلية الثانية: الخبر الأبرز — إعادة استخدام FeaturedCard الكبيرة.
  if (featured) return <FeaturedCard article={featured} large />;

  // لا بيانات: هيكل تحميل.
  return <Skeleton className="w-full h-full rounded-2xl" />;
}

// شريط مباريات اليوم الأفقي المكثّف — يعيد TodayCompactRow الموجود.
function TodayStrip({ items, onOpen }: { items: SpLiveItem[]; onOpen: (id: number) => void }) {
  if (items.length === 0) return null;
  const liveCount = items.filter((f) => f.status.live).length;
  return (
    <Card className="p-4 h-full overflow-hidden flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
        <span className="flex items-center gap-1.5 text-sm font-black text-foreground">
          <CalendarDays className={`w-4 h-4 ${ACCENT}`} />
          مباريات اليوم
          <span className="text-xs font-medium text-muted-foreground">({items.length})</span>
        </span>
        {liveCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {liveCount} مباشر
          </span>
        )}
      </div>
      <div className="grid gap-2 overflow-y-auto scrollbar-hide pr-1 min-h-0">
        {items.map((f) => <TodayCompactRow key={f.id} f={f} onOpen={onOpen} />)}
      </div>
    </Card>
  );
}

// ============================================================
// الصفحة
// ============================================================
export default function SportsBento() {
  const { user } = useAuth();
  const [compSlug, setCompSlug] = useState("pro-league");
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  const [scorersTab, setScorersTab] = useState<"scorers" | "assists" | "cards">("scorers");

  useEffect(() => { document.title = "الرياضة | سبق"; }, []);
  useCanonical("https://sabq.org/sports4");

  // ---- جلب البيانات (نسخة مطابقة لبنية SportsHub — نفس المفاتيح) ----
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
  const compsInActiveCat = competitions.filter((c) => catOf(c) === activeCat);

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

  const { data: todayData } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today"], refetchInterval: 30_000, refetchIntervalInBackground: false,
  });
  const todayMatches = Array.isArray(todayData?.today) ? todayData!.today : [];
  const liveCount = todayMatches.filter((f) => f.status.live).length;
  // أول مباراة مباشرة الآن — مرشّحة لبطاقة HERO.
  const liveNow = todayMatches.find((f) => f.status.live);

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
  const videos = (catShorts.length > 0 ? catShorts : featShorts).slice(0, 4);

  // نرتّب بالأحدث: «الخبر الأبرز» يجب أن يكون أحدث خبر فعلاً لا أقدم خبر مثبّت يدويًا (displayOrder).
  const sortedNews = [...news].sort((a, b) =>
    new Date(b.publishedAt || (b as any).createdAt || 0).getTime() -
    new Date(a.publishedAt || (a as any).createdAt || 0).getTime()
  );
  const featured = sortedNews[0];
  const grid = sortedNews.slice(1, 9);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        {/* ===== ترويسة مدمجة ===== */}
        <div className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:py-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-accent-blue/30 shrink-0">
                  <Trophy className={`w-5 h-5 ${ACCENT}`} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground tracking-wide uppercase">قسم · سبق سبورت</span>
                  <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-none">الرياضة</h1>
                </div>
              </div>
              {liveCount > 0 && (
                <button
                  onClick={() => scrollTo("matches")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold border border-red-500/20 hover:bg-red-500/15 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {liveCount} مباشر الآن
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ===== تنقّل الأقسام — sticky ===== */}
        <nav className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-3 text-sm font-bold text-muted-foreground hover:text-foreground border-b-2 border-transparent hover:border-primary transition-colors"
                  >
                    <Icon className="w-4 h-4" />{s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* ===== الشبكة ===== */}
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

          {/* ===== الصف العلوي: Bento (HERO + سباق اللقب + مباريات اليوم) ===== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[180px] lg:auto-rows-[200px] grid-flow-dense">
            {/* HERO — مباراة مباشرة وإلا الخبر الأبرز (البلاطة الأكبر) */}
            <section className="col-span-2 lg:row-span-2 scroll-mt-20">
              <div className="h-full">
                {newsLoading && !liveNow ? <Skeleton className="w-full h-full rounded-2xl" /> : (
                  <HeroSlot liveMatch={liveNow} featured={featured} onOpen={setOpenMatch} />
                )}
              </div>
            </section>

            {/* سباق اللقب */}
            {standings.length > 0 && (
              <section className="col-span-2 scroll-mt-20">
                <TitleRace rows={standings} />
              </section>
            )}

            {/* مباريات اليوم (شريط عمودي داخل بلاطة) */}
            {todayMatches.length > 0 && (
              <section className="col-span-2 scroll-mt-20 min-h-[200px]">
                <TodayStrip items={todayMatches} onOpen={setOpenMatch} />
              </section>
            )}
          </div>

          {/* ===== مركز المباريات الكامل (عرض كامل — يحتاج مساحة) ===== */}
          <section id="matches" className="scroll-mt-20">
            <SectionHeader title="مركز المباريات" subtitle="مباشر · اليوم · قادمة · النتائج" icon={<CalendarDays className={`w-5 h-5 ${ACCENT}`} />} />
            {competitions.length > 0 && (
              <div className="space-y-2 mb-5">
                {presentCats.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {presentCats.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          const first = competitions.find((c) => catOf(c) === cat);
                          if (first) setCompSlug(first.slug);
                        }}
                        className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${activeCat === cat ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                      >
                        {COMP_CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {compsInActiveCat.map((c) => (
                    <button key={c.slug} onClick={() => setCompSlug(c.slug)}
                      className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${compSlug === c.slug ? "bg-primary text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-primary/40"}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {comp && (comp.logo || comp.season) && (
              <div className="flex items-center gap-3 mb-5 px-1">
                {comp.logo && <img src={comp.logo} alt="" className="w-10 h-10 object-contain shrink-0" />}
                <div className="min-w-0">
                  <div className="font-black text-foreground truncate">{comp.name}</div>
                  {comp.season && <div className="text-xs text-muted-foreground tabular-nums">موسم {comp.season}</div>}
                </div>
              </div>
            )}
            <MatchHub key={compSlug} data={matches} configured={matchesConfigured} compSlug={compSlug} onOpen={setOpenMatch} />
          </section>

          {/* ===== صف البيانات الكامل: الترتيب + الهدّافون ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* الترتيب — أغلب العرض */}
            {hasStandings && (
              <section id="standings" className="lg:col-span-2 scroll-mt-20">
                <SectionHeader title="جدول الترتيب" subtitle="فرز وتصفية مباشرة" icon={<ListOrdered className={`w-5 h-5 ${ACCENT}`} />} />
                {standings.length ? <StandingsTable rows={standings} /> : (
                  <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار انطلاق البطولة — يظهر جدول الترتيب هنا مع بداية الجولة الأولى.</div>
                )}
              </section>
            )}

            {/* الهدّافون / صنّاع / بطاقات */}
            {hasScorers && (
              <section id="scorers" className="scroll-mt-20">
                <SectionHeader
                  title={scorersTab === "scorers" ? "منصّة الهدّافين" : scorersTab === "assists" ? "منصّة صنّاع الأهداف" : "متصدّرو البطاقات"}
                  subtitle={scorersTab === "scorers" ? "الأكثر تهديفًا" : scorersTab === "assists" ? "الأكثر صناعةً" : "الأكثر إنذارًا"}
                  icon={scorersTab === "scorers" ? <Goal className={`w-5 h-5 ${ACCENT}`} /> : scorersTab === "assists" ? <Hand className={`w-5 h-5 ${ACCENT}`} /> : <Square className="w-5 h-5 text-amber-500" />}
                  action={
                    <PillTabs
                      layoutId="bento-scorers-tab"
                      active={scorersTab}
                      onChange={(k) => setScorersTab(k as "scorers" | "assists" | "cards")}
                      tabs={[
                        { key: "scorers", label: "هدّافون" },
                        { key: "assists", label: "صنّاع" },
                        { key: "cards", label: "بطاقات" },
                      ]}
                    />
                  }
                />
                {scorersTab === "scorers" ? (
                  scorers.length ? <PodiumCard
                    entries={scorers.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.goals, secondary: s.assists }))}
                    primaryLabel="الأهداف"
                    secondaryLabel="الصناعة"
                  /> : (
                    <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار تسجيل أول الأهداف.</div>
                  )
                ) : scorersTab === "assists" ? (
                  assisters.length ? <PodiumCard
                    entries={assisters.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.assists, secondary: s.goals }))}
                    primaryLabel="الصناعات"
                    secondaryLabel="الأهداف"
                  /> : (
                    <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار أولى الصناعات.</div>
                  )
                ) : (
                  yellowLeaders.length ? <CardLeaders leaders={yellowLeaders} /> : (
                    <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">لا تتوفّر بيانات البطاقات بعد.</div>
                  )
                )}
              </section>
            )}
          </div>

          {/* ===== المتصدّرون + الأخبار جنباً إلى جنب ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* لوحة المتصدّرين */}
            <section id="leaderboard" className="lg:col-span-1 scroll-mt-20">
              <SectionHeader title="لوحة المتصدّرين" subtitle="تنافس بالتوقّع" icon={<Target className={`w-5 h-5 ${ACCENT}`} />} />
              <LeaderboardBoard />
            </section>

            {/* الأخبار */}
            <section className="lg:col-span-2 scroll-mt-20">
              <SectionHeader title="أبرز الأخبار" subtitle="آخر المستجدّات" icon={<Newspaper className={`w-5 h-5 ${ACCENT}`} />}
                action={moreLink("/category/sports", "كل الأخبار")} />
              {newsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[16/10] rounded-2xl" />)}
                </div>
              ) : news.length === 0 ? (
                <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار أول الأخبار الرياضية.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {grid.map((a, i) => <NewsCard key={a.id} article={a} index={i} />)}
                </div>
              )}
            </section>
          </div>

          {/* ===== الصور + الفيديو ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {news.length > 0 && (
              <section id="gallery" className="scroll-mt-20">
                <SectionHeader title="معرض الرياضة" subtitle="أبرز اللقطات" icon={<Images className={`w-5 h-5 ${ACCENT}`} />} />
                <ImageGallery articles={news} />
              </section>
            )}
            {videos.length > 0 && (
              <section id="videos" className="scroll-mt-20">
                <SectionHeader title="فيديو وملخّصات" subtitle="شاهد الأحدث" icon={<PlayCircle className={`w-5 h-5 ${ACCENT}`} />}
                  action={moreLink("/shorts", "كل الفيديوهات")} />
                <div className="grid grid-cols-2 gap-3">
                  {videos.map((v, i) => <VideoReel key={v.id} short={v} index={i} />)}
                </div>
              </section>
            )}
          </div>

          {/* رابط ختامي */}
          <div className="pt-2 text-center">
            <Link href="/category/sports" className={`inline-flex items-center gap-1.5 text-sm font-bold ${ACCENT} hover:underline`}>
              تصفّح كل الأخبار الرياضية ←
            </Link>
          </div>
        </div>
      </main>

      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}
