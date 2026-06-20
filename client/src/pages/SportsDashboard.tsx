/**
 * البوابة الرياضية — تجربة توزيع جديدة على /sports3
 *
 * هيكل مختلف عن /sports2: «Bento Hero» في الأعلى (خبر بارز كبير + لوحة نتائج اليوم
 * بجواره مباشرةً)، يليه شريط أخبار مكثّف، ثم بانده ملوّنة لمركز المباريات + الترتيب،
 * فالهدّافون والمتصدّرون، ثم صور وفيديو. الهدف: شخصية رياضية واضحة وإيقاع بصري
 * بدل التكدّس العمودي الموحّد.
 *
 * يعيد استخدام مكوّنات SportsHub الثقيلة (الجدول، الهدّافون، حوار المباراة، الفيديو...)،
 * مع ترويسة Hero مخصّصة هنا للتحكّم بحالة «بلا صورة». RTL + داكن + متجاوب.
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
  Star,
  Hand,
  Square,
  Clock,
  Flame,
  Radio,
  ChevronLeft,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Skeleton } from "@/components/ui/skeleton";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
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
  TodayCompactRow,
  timeAgo,
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

const imgOf = (a: ArticleWithDetails) => getCacheBustedImageUrl(a.imageUrl || a.thumbnailUrl, a.updatedAt);
// زمن الخبر للترتيب — نعتمد النشر ثم الإنشاء حتى لا يتصدّر خبر قديم مثبّت يدويًا (displayOrder).
const articleTime = (a: ArticleWithDetails) => new Date(a.publishedAt || (a as any).createdAt || 0).getTime();
const byRecency = (a: ArticleWithDetails, b: ArticleWithDetails) => articleTime(b) - articleTime(a);

// ============================================================
// خبر الـ Hero الكبير — يملأ المساحة بأناقة سواء بصورة أو بدونها.
// ============================================================
function HeroFeature({ article }: { article: ArticleWithDetails }) {
  const img = imgOf(article);
  return (
    <Link
      href={`/article/${article.englishSlug || article.slug}`}
      className="group relative block overflow-hidden rounded-3xl border border-border bg-card h-[320px] sm:h-[400px] lg:h-[460px]"
    >
      {img ? (
        <>
          <div className="absolute inset-0">
            <OptimizedImage
              src={img}
              alt={article.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              wrapperClassName="w-full h-full"
              objectPosition={getObjectPosition(article)}
              priority
              fetchPriority="high"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
        </>
      ) : (
        <Trophy className="absolute -top-8 -left-8 w-56 h-56 text-primary/10 pointer-events-none" />
      )}
      <div className={`absolute inset-x-0 bottom-0 p-6 sm:p-8 ${img ? "" : "top-0 flex flex-col justify-end"}`}>
        <div className="flex items-center gap-2 mb-3">
          {article.newsType === "breaking" ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive-foreground bg-destructive rounded-full px-2.5 py-1">
              <Flame className="w-3 h-3" /> عاجل
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-primary rounded-full px-2.5 py-1">
              <Trophy className="w-3 h-3" /> الخبر الأبرز
            </span>
          )}
          <span className={`text-[11px] flex items-center gap-1 ${img ? "text-white/80" : "text-muted-foreground"}`}>
            <Clock className="w-3 h-3" />{timeAgo(article.publishedAt)}
          </span>
        </div>
        <h2 className={`font-black leading-tight text-2xl sm:text-4xl line-clamp-3 ${img ? "text-white" : "text-foreground group-hover:text-primary transition-colors"}`}>
          {article.title}
        </h2>
        {article.excerpt && (
          <p className={`mt-3 text-sm line-clamp-2 max-w-2xl hidden sm:block ${img ? "text-white/85" : "text-muted-foreground"}`}>
            {article.excerpt}
          </p>
        )}
      </div>
    </Link>
  );
}

// ============================================================
// لوحة نتائج اليوم — العنصر المميّز في الـ Hero (مباشر/اليوم بارز).
// ============================================================
function ScoreboardCard({ items, onOpen }: {
  items: SpLiveItem[]; onOpen: (id: number) => void;
}) {
  const liveCount = items.filter((f) => f.status.live).length;
  const list = items.slice(0, 5);

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-border bg-gradient-to-l from-primary/10 to-transparent">
        <span className="flex items-center gap-2 text-sm font-black text-foreground">
          {liveCount > 0 ? <Radio className="w-4 h-4 text-red-500" /> : <CalendarDays className={`w-4 h-4 ${ACCENT}`} />}
          {liveCount > 0 ? "مباشر الآن" : "مباريات اليوم"}
        </span>
        {liveCount > 0 ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {liveCount}
          </span>
        ) : items.length > 0 ? (
          <span className="text-[11px] font-bold text-muted-foreground tabular-nums">{items.length}</span>
        ) : null}
      </div>

      {list.length > 0 ? (
        <div className="grid gap-2 p-3 overflow-y-auto scrollbar-hide max-h-[480px]">
          {list.map((f) => <TodayCompactRow key={f.id} f={f} onOpen={onOpen} />)}
        </div>
      ) : (
        <div className="grid place-items-center gap-1 p-8 text-center text-sm text-muted-foreground">
          <CalendarDays className="w-6 h-6 opacity-40" />
          لا مباريات اليوم — تابع الجولة القادمة من مركز المباريات.
        </div>
      )}

      <Link href="/sports3/matches" className={`flex items-center justify-center gap-1 border-t border-border py-2.5 text-xs font-bold ${ACCENT} hover:bg-muted/50 transition-colors`}>
        كل مباريات اليوم <ChevronLeft className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

// شريط متابعاتي — رفيع، أفقي، يظهر للمستخدم المتابِع فقط.
function FollowsStrip({ todayMatches, onOpen }: { todayMatches: SpLiveItem[]; onOpen: (id: number) => void }) {
  const { isAuthed, follows } = useSportsFollows();
  const teamFollows = follows.filter((f) => f.kind === "team");
  if (!isAuthed || teamFollows.length === 0) return null;
  const matchOf = (refId: string) => todayMatches.find((m) => String(m.home.id) === refId || String(m.away.id) === refId);

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-2">
      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> فِرقي
      </span>
      {teamFollows.map((f) => {
        const m = matchOf(f.refId);
        const live = m?.status.live ?? false;
        const inner = (
          <>
            {f.refLogo ? <img src={f.refLogo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" /> : <span className="w-5 h-5 rounded-full bg-muted shrink-0" />}
            <span className="text-sm font-bold whitespace-nowrap text-foreground">{f.refName}</span>
            {live && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {m!.status.elapsed != null ? `${m!.status.elapsed}'` : "مباشر"}
              </span>
            )}
            {!live && m?.status.finished && (
              <span className="text-[10px] font-black tabular-nums text-muted-foreground" dir="ltr">{m.goals.home ?? 0}-{m.goals.away ?? 0}</span>
            )}
          </>
        );
        return m ? (
          <button key={f.id} type="button" onClick={() => onOpen(m.id)}
            className={`shrink-0 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors ${live ? "border-red-500/40 bg-red-500/5" : "border-border bg-background hover:border-primary/40"}`}>
            {inner}
          </button>
        ) : (
          <Link key={f.id} href={`/sports2/team/${f.refId}`}
            className="shrink-0 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 hover:border-primary/40 transition-colors">
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
export default function SportsDashboard() {
  const { user } = useAuth();
  const [compSlug, setCompSlug] = useState("pro-league");
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  const [scorersTab, setScorersTab] = useState<"scorers" | "assists" | "cards">("scorers");

  useEffect(() => { document.title = "الرياضة | سبق"; }, []);
  useCanonical("https://sabq.org/sports3");

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
  // داخل الفئة: الجارية أولًا، ثم القادمة، ثم المنتهية (مع الحفاظ على الترتيب الأصلي عند التعادل).
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

  const { data: todayData } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today"], refetchInterval: 30_000, refetchIntervalInBackground: false,
  });
  const todayMatches = Array.isArray(todayData?.today) ? todayData!.today : [];
  const liveCount = todayMatches.filter((f) => f.status.live).length;

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

  // نرتّب بالأحدث: «الخبر الأبرز» يجب أن يكون أحدث خبر فعلاً لا أقدم خبر مثبّت.
  const sortedNews = [...news].sort(byRecency);
  const featured = sortedNews[0];
  const latest = sortedNews.slice(1, 9);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        {/* ===== ترويسة + تنقّل لاصق ===== */}
        <div className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 pt-5 pb-1">
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
                <button onClick={() => scrollTo("matches")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold border border-red-500/20 hover:bg-red-500/15 transition-colors">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {liveCount} مباشر الآن
                </button>
              )}
            </div>
            <FollowsStrip todayMatches={todayMatches} onOpen={setOpenMatch} />
          </div>
        </div>

        {/* ===== Bento Hero: خبر بارز + لوحة نتائج ===== */}
        <section id="news" className="scroll-mt-16 max-w-7xl mx-auto px-4 pt-6 sm:pt-8">
          {newsLoading ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="lg:col-span-2 min-h-[300px] lg:min-h-[460px] rounded-3xl" />
              <Skeleton className="min-h-[300px] lg:min-h-[460px] rounded-3xl" />
            </div>
          ) : news.length === 0 ? (
            <div className="text-center text-muted-foreground py-16 bg-card rounded-3xl border border-dashed border-border">بانتظار أول الأخبار الرياضية — تظهر هنا فور نشرها.</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
              <div className="lg:col-span-2">{featured && <HeroFeature article={featured} />}</div>
              <ScoreboardCard items={todayMatches} onOpen={setOpenMatch} />
            </div>
          )}

          {/* شريط أحدث الأخبار */}
          {latest.length > 0 && (
            <div className="mt-10">
              <SectionHeader title="أحدث الأخبار" subtitle="آخر مستجدّات الرياضة" icon={<Newspaper className={`w-5 h-5 ${ACCENT}`} />} action={moreLink("/category/sports", "كل الأخبار")} />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {latest.map((a, i) => <NewsCard key={a.id} article={a} index={i} />)}
              </div>
            </div>
          )}
        </section>

        {/* ===== باندة: مركز المباريات + الترتيب (خلفية مميّزة لإيقاع بصري) ===== */}
        <section className="mt-12 sm:mt-16 bg-muted/40 border-y border-border">
          <div className="max-w-7xl mx-auto px-4 py-12 space-y-14">
            <div id="matches" className="scroll-mt-16">
              <SectionHeader title="مركز المباريات" subtitle="مباشر · اليوم · قادمة · النتائج" icon={<CalendarDays className={`w-5 h-5 ${ACCENT}`} />} action={moreLink("/sports3/matches", "مباريات اليوم")} />
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
                        className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${compSlug === c.slug ? "bg-primary text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-primary/40"} ${c.status === "finished" && compSlug !== c.slug ? "opacity-60" : ""}`}>
                        {c.status === "ongoing" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {comp && (comp.logo || comp.season || (comp.status && comp.status !== "unknown")) && (
                <div className="flex items-center gap-3 mb-5 px-1">
                  {comp.logo && <img src={comp.logo} alt="" className="w-10 h-10 object-contain shrink-0" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-foreground truncate">{comp.name}</span>
                      {comp.status && comp.status !== "unknown" && (
                        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          comp.status === "ongoing" ? "bg-green-500/15 text-green-600 dark:text-green-400"
                          : comp.status === "upcoming" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"
                        }`}>
                          {comp.status === "ongoing" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                          {COMP_STATUS_LABELS[comp.status]}
                        </span>
                      )}
                    </div>
                    {comp.season && <div className="text-xs text-muted-foreground tabular-nums">موسم {comp.season}</div>}
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
                  <PillTabs layoutId="dash-scorers-tab" active={scorersTab} onChange={(k) => setScorersTab(k as "scorers" | "assists" | "cards")}
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
          <section id="leaderboard" className="scroll-mt-16">
            <SectionHeader title="لوحة المتصدّرين" subtitle="توقّع النتائج ونافِس الجمهور" icon={<Target className={`w-5 h-5 ${ACCENT}`} />} />
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
