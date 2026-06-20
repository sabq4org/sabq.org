/**
 * البوابة الرياضية — تجربة مركز مباشر على /sports5
 *
 * هدف الصفحة: تحويل صفحة الرياضة من قائمة محتوى إلى "غرفة متابعة" يومية:
 * خبر/مباراة في الواجهة، شريط مباريات سريع، موجز تحريري، ثم مركز المباريات
 * والبيانات الحية. تستخدم نفس مصادر بيانات /sports2-/sports4 بدون Backend جديد.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronLeft,
  Flame,
  Goal,
  Images,
  ListOrdered,
  Newspaper,
  PlayCircle,
  Radio,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import type { ArticleWithDetails, Category } from "@shared/schema";
import {
  ACCENT,
  COMP_CATEGORY_LABELS,
  COMP_CATEGORY_ORDER,
  CardLeaders,
  ImageGallery,
  LeaderboardBoard,
  MatchDialog,
  MatchHub,
  NewsCard,
  PillTabs,
  PodiumCard,
  SectionHeader,
  StandingsTable,
  TodayCompactRow,
  VideoReel,
  moreLink,
  timeAgo,
  useSportsFollows,
  type SpAssister,
  type SpCardLeader,
  type SpCompetition,
  type SpCompetitionCategory,
  type SpFixture,
  type SpLiveItem,
  type SpScorer,
  type SpShort,
  type SpStandingRow,
} from "./SportsHub";

const imgOf = (article: ArticleWithDetails) =>
  getCacheBustedImageUrl(article.imageUrl || article.thumbnailUrl, article.updatedAt);

const articleTime = (article: ArticleWithDetails) =>
  new Date(article.publishedAt || (article as any).createdAt || 0).getTime();

const byRecency = (a: ArticleWithDetails, b: ArticleWithDetails) => articleTime(b) - articleTime(a);

const articleHref = (article: ArticleWithDetails) => `/article/${article.englishSlug || article.slug}`;

const SECTIONS = [
  { id: "pulse", label: "الموجز", icon: Activity },
  { id: "matches", label: "المباريات", icon: CalendarDays },
  { id: "standings", label: "الترتيب", icon: ListOrdered },
  { id: "scorers", label: "الأرقام", icon: Goal },
  { id: "leaderboard", label: "التوقعات", icon: Target },
  { id: "media", label: "الوسائط", icon: PlayCircle },
];

function HeroArticle({ article }: { article: ArticleWithDetails }) {
  const image = imgOf(article);

  return (
    <Link
      href={articleHref(article)}
      className="group relative block min-h-[430px] overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 text-white shadow-2xl shadow-slate-950/20"
    >
      {image ? (
        <>
          <OptimizedImage
            src={image}
            alt={article.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            wrapperClassName="absolute inset-0"
            objectPosition={getObjectPosition(article)}
            priority
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-950/15" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(14,165,233,0.35),transparent_35%),linear-gradient(135deg,#020617,#0f172a)]" />
      )}

      <div className="relative z-10 flex min-h-[430px] flex-col justify-between p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-black backdrop-blur">
            <Newspaper className="h-3.5 w-3.5" />
            الخبر الرئيسي
          </span>
          {article.newsType === "breaking" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-black">
              <Flame className="h-3.5 w-3.5" />
              عاجل
            </span>
          )}
        </div>

        <div>
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-xs font-bold text-white/80 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-sky-300" />
            اختيار سبق الرياضي
          </div>
          <h1 className="max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-5xl">
            {article.title}
          </h1>
          {article.excerpt && (
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/80 sm:text-base line-clamp-2">
              {article.excerpt}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs font-bold text-white/75">
            <span>{timeAgo(article.publishedAt)}</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span className="inline-flex items-center gap-1">
              اقرأ التغطية
              <ChevronLeft className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function HeroMatch({ match, onOpen }: { match: SpLiveItem; onOpen: (id: number) => void }) {
  const { home, away, goals, status } = match;

  return (
    <button
      type="button"
      onClick={() => onOpen(match.id)}
      className="group relative min-h-[430px] w-full overflow-hidden rounded-[2rem] border border-red-400/20 bg-slate-950 p-5 text-right text-white shadow-2xl shadow-red-950/10 transition-transform hover:-translate-y-0.5 sm:p-8"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(239,68,68,0.35),transparent_32%),radial-gradient(circle_at_80%_80%,rgba(14,165,233,0.28),transparent_36%),linear-gradient(135deg,#020617,#0f172a)]" />
      <div className="absolute inset-x-8 top-20 h-28 rounded-full bg-white/5 blur-3xl" />

      <div className="relative z-10 flex min-h-[370px] flex-col justify-between">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-black text-red-200 ring-1 ring-red-400/25">
            <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
            مباشر الآن
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/75">
            {match.competition}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <div className="flex min-w-0 flex-col items-center gap-3">
            {home.logo ? (
              <img src={home.logo} alt="" className="h-16 w-16 object-contain sm:h-24 sm:w-24" loading="lazy" />
            ) : (
              <span className="h-16 w-16 rounded-full bg-white/10 sm:h-24 sm:w-24" />
            )}
            <span className="line-clamp-2 text-center text-sm font-black sm:text-lg">{home.name}</span>
          </div>

          <div className="text-center">
            <div className="text-5xl font-black tracking-tighter sm:text-7xl" dir="ltr">
              {goals.home ?? 0}
              <span className="mx-2 text-white/30">-</span>
              {goals.away ?? 0}
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-black">
              <Radio className="h-3.5 w-3.5" />
              {status.elapsed != null ? `${status.elapsed}'` : "مباشر"}
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-center gap-3">
            {away.logo ? (
              <img src={away.logo} alt="" className="h-16 w-16 object-contain sm:h-24 sm:w-24" loading="lazy" />
            ) : (
              <span className="h-16 w-16 rounded-full bg-white/10 sm:h-24 sm:w-24" />
            )}
            <span className="line-clamp-2 text-center text-sm font-black sm:text-lg">{away.name}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/10 p-3 text-xs font-bold text-white/75 backdrop-blur">
          <span>{match.round || "تفاصيل المباراة"}</span>
          <span className="inline-flex items-center gap-1 text-white">
            افتح المركز الحي
            <ChevronLeft className="h-4 w-4" />
          </span>
        </div>
      </div>
    </button>
  );
}

function TodayDesk({ items, onOpen }: { items: SpLiveItem[]; onOpen: (id: number) => void }) {
  const liveCount = items.filter((item) => item.status.live).length;
  const visible = items.slice(0, 6);

  return (
    <Card className="h-full overflow-hidden rounded-[2rem] border-border/70 bg-card/95">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <CalendarDays className={`h-4 w-4 ${ACCENT}`} />
          <span className="text-sm font-black text-foreground">مباريات اليوم</span>
        </div>
        {liveCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-black text-red-600 dark:text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            {liveCount} مباشر
          </span>
        ) : (
          <span className="text-[11px] font-bold text-muted-foreground tabular-nums">{items.length}</span>
        )}
      </div>

      {visible.length > 0 ? (
        <div className="grid max-h-[420px] gap-2 overflow-y-auto p-3 scrollbar-hide">
          {visible.map((item) => (
            <TodayCompactRow key={item.id} f={item} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="grid place-items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
          <ShieldCheck className="h-8 w-8 opacity-40" />
          لا توجد مباريات اليوم. تابع الجولة القادمة من مركز المباريات.
        </div>
      )}
    </Card>
  );
}

function FollowsBar({ todayMatches, onOpen }: { todayMatches: SpLiveItem[]; onOpen: (id: number) => void }) {
  const { isAuthed, follows } = useSportsFollows();
  const teams = follows.filter((follow) => follow.kind === "team");

  if (!isAuthed || teams.length === 0) return null;

  const matchOf = (refId: string) =>
    todayMatches.find((match) => String(match.home.id) === refId || String(match.away.id) === refId);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-600 dark:text-amber-300">
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        فريقي أولاً
      </span>
      {teams.map((team) => {
        const match = matchOf(team.refId);
        const live = match?.status.live ?? false;
        const content = (
          <>
            {team.refLogo ? (
              <img src={team.refLogo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />
            ) : (
              <span className="h-5 w-5 shrink-0 rounded-full bg-muted" />
            )}
            <span className="whitespace-nowrap text-sm font-black text-foreground">{team.refName}</span>
            {live && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black text-red-500">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                مباشر
              </span>
            )}
          </>
        );

        return match ? (
          <button
            key={team.id}
            type="button"
            onClick={() => onOpen(match.id)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-red-500/25 bg-red-500/5 px-3 py-2 transition-colors hover:bg-red-500/10"
          >
            {content}
          </button>
        ) : (
          <Link
            key={team.id}
            href={`/sports2/team/${team.refId}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 transition-colors hover:border-primary/40"
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}

function PulseCard({ article, index }: { article: ArticleWithDetails; index: number }) {
  return (
    <Link
      href={articleHref(article)}
      className="group grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary tabular-nums">
        {index + 1}
      </span>
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
          {article.newsType === "breaking" ? (
            <span className="inline-flex items-center gap-1 text-red-500">
              <Flame className="h-3 w-3" />
              عاجل
            </span>
          ) : (
            <span>تحديث</span>
          )}
          <span>{timeAgo(article.publishedAt)}</span>
        </div>
        <h3 className="line-clamp-2 text-sm font-black leading-6 text-foreground group-hover:text-primary">
          {article.title}
        </h3>
      </div>
    </Link>
  );
}

function BriefingPanel({ articles, liveCount, matchesCount }: {
  articles: ArticleWithDetails[];
  liveCount: number;
  matchesCount: number;
}) {
  const breaking = articles.filter((article) => article.newsType === "breaking").slice(0, 2);
  const briefs = breaking.length > 0 ? breaking : articles.slice(0, 2);

  return (
    <Card className="rounded-[2rem] p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary">
            <Zap className="h-3.5 w-3.5" />
            موجز سريع
          </div>
          <h2 className="mt-2 text-xl font-black text-foreground">ما الذي يستحق انتباهك؟</h2>
        </div>
        <Bell className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-muted/50 p-4">
          <div className="text-3xl font-black text-foreground tabular-nums">{liveCount}</div>
          <div className="mt-1 text-xs font-bold text-muted-foreground">مباريات مباشرة الآن</div>
        </div>
        <div className="rounded-2xl bg-muted/50 p-4">
          <div className="text-3xl font-black text-foreground tabular-nums">{matchesCount}</div>
          <div className="mt-1 text-xs font-bold text-muted-foreground">مباريات في روزنامة اليوم</div>
        </div>
        <Link href="/category/sports" className="rounded-2xl bg-primary p-4 text-white transition-transform hover:-translate-y-0.5">
          <div className="text-sm font-black">كل أخبار الرياضة</div>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-white/85">
            افتح القسم
            <ChevronLeft className="h-4 w-4" />
          </div>
        </Link>
      </div>

      {briefs.length > 0 && (
        <div className="mt-4 grid gap-2">
          {briefs.map((article, index) => (
            <PulseCard key={article.id} article={article} index={index} />
          ))}
        </div>
      )}
    </Card>
  );
}

function CompetitionPicker({
  activeCat,
  catOf,
  comp,
  compSlug,
  competitions,
  compsInActiveCat,
  presentCats,
  setCompSlug,
}: {
  activeCat: SpCompetitionCategory;
  catOf: (competition: SpCompetition) => SpCompetitionCategory;
  comp?: SpCompetition;
  compSlug: string;
  competitions: SpCompetition[];
  compsInActiveCat: SpCompetition[];
  presentCats: SpCompetitionCategory[];
  setCompSlug: (slug: string) => void;
}) {
  if (competitions.length === 0) return null;

  return (
    <div className="mb-5 space-y-3">
      {presentCats.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {presentCats.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => {
                const first = competitions.find((competition) => catOf(competition) === category);
                if (first) setCompSlug(first.slug);
              }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-black transition-colors ${
                activeCat === category
                  ? "bg-foreground text-background"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {COMP_CATEGORY_LABELS[category]}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {compsInActiveCat.map((competition) => (
          <button
            key={competition.slug}
            type="button"
            onClick={() => setCompSlug(competition.slug)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition-colors ${
              compSlug === competition.slug
                ? "bg-primary text-white shadow-sm"
                : "border border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {competition.logo && <img src={competition.logo} alt="" className="h-5 w-5 object-contain" loading="lazy" />}
            {competition.name}
          </button>
        ))}
      </div>

      {comp && (comp.logo || comp.season) && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
          {comp.logo && <img src={comp.logo} alt="" className="h-10 w-10 shrink-0 object-contain" loading="lazy" />}
          <div className="min-w-0">
            <div className="truncate font-black text-foreground">{comp.name}</div>
            {comp.season && <div className="text-xs text-muted-foreground tabular-nums">موسم {comp.season}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function NumbersPanel({
  assisters,
  scorers,
  scorersTab,
  setScorersTab,
  yellowLeaders,
}: {
  assisters: SpAssister[];
  scorers: SpScorer[];
  scorersTab: "scorers" | "assists" | "cards";
  setScorersTab: (tab: "scorers" | "assists" | "cards") => void;
  yellowLeaders: SpCardLeader[];
}) {
  return (
    <section id="scorers" className="scroll-mt-24">
      <SectionHeader
        title={scorersTab === "scorers" ? "نجوم الأرقام" : scorersTab === "assists" ? "صنّاع اللعب" : "الانضباط والبطاقات"}
        subtitle="هدّافون، صنّاع، وبطاقات في لوحة واحدة"
        icon={scorersTab === "cards" ? <Square className="h-5 w-5 text-amber-500" /> : <BarChart3 className={`h-5 w-5 ${ACCENT}`} />}
        action={
          <PillTabs
            layoutId="sports5-numbers-tab"
            active={scorersTab}
            onChange={(key) => setScorersTab(key as "scorers" | "assists" | "cards")}
            tabs={[
              { key: "scorers", label: "هدّافون" },
              { key: "assists", label: "صنّاع" },
              { key: "cards", label: "بطاقات" },
            ]}
          />
        }
      />

      {scorersTab === "scorers" ? (
        scorers.length > 0 ? (
          <PodiumCard
            entries={scorers.map((scorer) => ({
              rank: scorer.rank,
              id: scorer.id,
              name: scorer.name,
              photo: scorer.photo,
              team: scorer.team,
              primary: scorer.goals,
              secondary: scorer.assists,
            }))}
            primaryLabel="الأهداف"
            secondaryLabel="الصناعة"
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">
            بانتظار تسجيل أول الأهداف.
          </div>
        )
      ) : scorersTab === "assists" ? (
        assisters.length > 0 ? (
          <PodiumCard
            entries={assisters.map((assister) => ({
              rank: assister.rank,
              id: assister.id,
              name: assister.name,
              photo: assister.photo,
              team: assister.team,
              primary: assister.assists,
              secondary: assister.goals,
            }))}
            primaryLabel="الصناعات"
            secondaryLabel="الأهداف"
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">
            بانتظار أولى الصناعات.
          </div>
        )
      ) : yellowLeaders.length > 0 ? (
        <CardLeaders leaders={yellowLeaders} />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">
          لا تتوفر بيانات البطاقات بعد.
        </div>
      )}
    </section>
  );
}

export default function SportsLiveCenter() {
  const { user } = useAuth();
  const [compSlug, setCompSlug] = useState("pro-league");
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  const [scorersTab, setScorersTab] = useState<"scorers" | "assists" | "cards">("scorers");

  useEffect(() => {
    document.title = "مركز الرياضة | سبق";
  }, []);
  useCanonical("https://sabq.org/sports5");

  const { data: newsRaw, isLoading: newsLoading } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/categories", "sports", "articles"],
  });
  const news = Array.isArray(newsRaw) ? newsRaw : [];

  const { data: category } = useQuery<Category>({
    queryKey: ["/api/categories/slug", "sports"],
  });
  const sportsCatId = (category as any)?.id;

  const { data: compsData } = useQuery<{ competitions: SpCompetition[] }>({
    queryKey: ["/api/sports/competitions"],
    staleTime: 60 * 60_000,
  });
  const competitions = Array.isArray(compsData?.competitions) ? compsData.competitions : [];
  const comp = competitions.find((competition) => competition.slug === compSlug);
  const hasStandings = comp?.hasStandings ?? compSlug === "pro-league";
  const hasScorers = comp?.hasScorers ?? compSlug === "pro-league";

  const catOf = (competition: SpCompetition): SpCompetitionCategory => competition.category ?? "saudi";
  const activeCat: SpCompetitionCategory = comp ? catOf(comp) : "saudi";
  const presentCats = COMP_CATEGORY_ORDER.filter((categoryKey) =>
    competitions.some((competition) => catOf(competition) === categoryKey)
  );
  const compsInActiveCat = competitions.filter((competition) => catOf(competition) === activeCat);

  const { data: matchesData } = useQuery<{
    configured: boolean;
    live: SpFixture[];
    today: SpFixture[];
    upcoming: SpFixture[];
    results: SpFixture[];
  }>({
    queryKey: [`/api/sports/${compSlug}/matches`],
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const matchesConfigured = matchesData?.configured ?? true;
  const matches = {
    live: Array.isArray(matchesData?.live) ? matchesData.live : [],
    today: Array.isArray(matchesData?.today) ? matchesData.today : [],
    upcoming: Array.isArray(matchesData?.upcoming) ? matchesData.upcoming : [],
    results: Array.isArray(matchesData?.results) ? matchesData.results : [],
  };

  const { data: todayData } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today"],
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const todayMatches = Array.isArray(todayData?.today) ? todayData.today : [];
  const liveCount = todayMatches.filter((match) => match.status.live).length;
  const liveNow = todayMatches.find((match) => match.status.live);

  const { data: standingsData } = useQuery<{ standings: SpStandingRow[] }>({
    queryKey: [`/api/sports/${compSlug}/standings`],
    staleTime: 5 * 60_000,
    enabled: hasStandings,
  });
  const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];

  const { data: scorersData } = useQuery<{ scorers: SpScorer[] }>({
    queryKey: [`/api/sports/${compSlug}/scorers`],
    staleTime: 10 * 60_000,
    enabled: hasScorers,
  });
  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];

  const { data: assistsData } = useQuery<{ assists: SpAssister[] }>({
    queryKey: [`/api/sports/${compSlug}/assists`],
    staleTime: 10 * 60_000,
    enabled: hasScorers,
  });
  const assisters = Array.isArray(assistsData?.assists) ? assistsData.assists : [];

  const { data: cardsData } = useQuery<{ yellow: SpCardLeader[]; red: SpCardLeader[] }>({
    queryKey: [`/api/sports/${compSlug}/cards`],
    staleTime: 10 * 60_000,
    enabled: hasScorers && scorersTab === "cards",
  });
  const yellowLeaders = Array.isArray(cardsData?.yellow) ? cardsData.yellow : [];

  const { data: shortsByCat } = useQuery<{ shorts: SpShort[] }>({
    queryKey: ["/api/shorts", { categoryId: sportsCatId, limit: 12 }],
    enabled: !!sportsCatId,
    staleTime: 10 * 60_000,
  });
  const { data: shortsFeatured } = useQuery<{ shorts: SpShort[] }>({
    queryKey: ["/api/shorts/featured", { limit: 12 }],
    staleTime: 10 * 60_000,
  });
  const catShorts = Array.isArray(shortsByCat?.shorts) ? shortsByCat.shorts : [];
  const featShorts = Array.isArray(shortsFeatured?.shorts) ? shortsFeatured.shorts : [];
  const videos = (catShorts.length > 0 ? catShorts : featShorts).slice(0, 6);

  const sortedNews = useMemo(() => [...news].sort(byRecency), [news]);
  const featured = sortedNews[0];
  const pulse = sortedNews.slice(1, 7);
  const gridNews = sortedNews.slice(7, 13);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        <div className="border-b border-border bg-card">
          <div className="mx-auto max-w-7xl px-4 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10">
                  <Trophy className={`h-6 w-6 ${ACCENT}`} />
                </div>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                    سبق سبورت · تجربة /sports5
                  </div>
                  <h1 className="text-2xl font-black leading-tight text-foreground sm:text-3xl">
                    مركز الرياضة المباشر
                  </h1>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {liveCount > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollTo("matches")}
                    className="inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-black text-red-600 transition-colors hover:bg-red-500/15 dark:text-red-400"
                  >
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    {liveCount} مباشر الآن
                  </button>
                )}
                <Link
                  href="/category/sports"
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-2 text-xs font-black text-foreground transition-colors hover:border-primary/40"
                >
                  كل أخبار الرياضة
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="mt-4">
              <FollowsBar todayMatches={todayMatches} onOpen={setOpenMatch} />
            </div>
          </div>
        </div>

        <nav className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-4">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => scrollTo(section.id)}
                    className="inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-3 text-sm font-black text-muted-foreground transition-colors hover:border-primary hover:text-foreground sm:px-4"
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            {newsLoading && !liveNow ? (
              <Skeleton className="min-h-[430px] rounded-[2rem]" />
            ) : liveNow ? (
              <HeroMatch match={liveNow} onOpen={setOpenMatch} />
            ) : featured ? (
              <HeroArticle article={featured} />
            ) : (
              <div className="grid min-h-[430px] place-items-center rounded-[2rem] border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
                بانتظار أول خبر رياضي ليظهر في الواجهة.
              </div>
            )}

            <TodayDesk items={todayMatches} onOpen={setOpenMatch} />
          </section>

          <section id="pulse" className="mt-8 grid gap-5 scroll-mt-24 lg:grid-cols-[360px_minmax(0,1fr)]">
            <BriefingPanel articles={sortedNews} liveCount={liveCount} matchesCount={todayMatches.length} />

            <Card className="rounded-[2rem] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-black text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    خط المتابعة
                  </div>
                  <h2 className="mt-2 text-xl font-black text-foreground">آخر الأخبار لحظة بلحظة</h2>
                </div>
                {moreLink("/category/sports", "المزيد")}
              </div>

              {newsLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[0, 1, 2, 3].map((item) => (
                    <Skeleton key={item} className="h-20 rounded-2xl" />
                  ))}
                </div>
              ) : pulse.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {pulse.map((article, index) => (
                    <PulseCard key={article.id} article={article} index={index} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
                  لا توجد أخبار إضافية حالياً.
                </div>
              )}
            </Card>
          </section>
        </div>

        <section id="matches" className="scroll-mt-24 border-y border-border bg-muted/35">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:py-12">
            <SectionHeader
              title="مركز المباريات"
              subtitle="مباشر، اليوم، القادمة، والنتائج في واجهة واحدة"
              icon={<CalendarDays className={`h-5 w-5 ${ACCENT}`} />}
            />
            <CompetitionPicker
              activeCat={activeCat}
              catOf={catOf}
              comp={comp}
              compSlug={compSlug}
              competitions={competitions}
              compsInActiveCat={compsInActiveCat}
              presentCats={presentCats}
              setCompSlug={setCompSlug}
            />
            <MatchHub key={compSlug} data={matches} configured={matchesConfigured} compSlug={compSlug} onOpen={setOpenMatch} />
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 py-10 sm:py-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
            {hasStandings && (
              <section id="standings" className="scroll-mt-24">
                <SectionHeader
                  title="جدول الترتيب"
                  subtitle="قراءة سريعة لمشهد البطولة"
                  icon={<ListOrdered className={`h-5 w-5 ${ACCENT}`} />}
                />
                {standings.length > 0 ? (
                  <StandingsTable rows={standings} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">
                    بانتظار انطلاق البطولة — يظهر جدول الترتيب هنا مع بداية الجولة الأولى.
                  </div>
                )}
              </section>
            )}

            {hasScorers && (
              <NumbersPanel
                assisters={assisters}
                scorers={scorers}
                scorersTab={scorersTab}
                setScorersTab={setScorersTab}
                yellowLeaders={yellowLeaders}
              />
            )}
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
            <section id="leaderboard" className="scroll-mt-24">
              <SectionHeader
                title="تحدّي التوقعات"
                subtitle="لوحة المتصدرين للقراء"
                icon={<Target className={`h-5 w-5 ${ACCENT}`} />}
              />
              <LeaderboardBoard />
            </section>

            <section className="scroll-mt-24">
              <SectionHeader
                title="أبرز الأخبار"
                subtitle="مختارات إضافية من القسم الرياضي"
                icon={<Newspaper className={`h-5 w-5 ${ACCENT}`} />}
                action={moreLink("/category/sports", "كل الأخبار")}
              />
              {newsLoading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {[0, 1, 2, 3, 4, 5].map((item) => (
                    <Skeleton key={item} className="aspect-[16/10] rounded-2xl" />
                  ))}
                </div>
              ) : gridNews.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {gridNews.map((article, index) => (
                    <NewsCard key={article.id} article={article} index={index} />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">
                  لا توجد مختارات إضافية حالياً.
                </div>
              )}
            </section>
          </div>

          <section id="media" className="mt-10 scroll-mt-24">
            <div className="grid gap-8 lg:grid-cols-2">
              {news.length > 0 && (
                <div>
                  <SectionHeader
                    title="معرض اللقطات"
                    subtitle="صور وأحداث من آخر التغطيات"
                    icon={<Images className={`h-5 w-5 ${ACCENT}`} />}
                  />
                  <ImageGallery articles={news} />
                </div>
              )}

              {videos.length > 0 && (
                <div>
                  <SectionHeader
                    title="فيديو وملخصات"
                    subtitle="المقاطع الأحدث من سبق"
                    icon={<PlayCircle className={`h-5 w-5 ${ACCENT}`} />}
                    action={moreLink("/shorts", "كل الفيديوهات")}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    {videos.map((short, index) => (
                      <VideoReel key={short.id} short={short} index={index} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}
