/**
 * البوابة الرياضية /sports — بهوية موقع سبق الرسمية (فاتحة، متطابقة مع بقية الموقع).
 *
 * لغة التصميم نفسها المستخدمة في صفحة البطولة /sports/competition/:slug:
 *  - أسطح فاتحة (bg-background / bg-card / bg-muted)، حدود border-border، زوايا 2xl.
 *  - الأزرق الأساسي (text-primary / bg-primary) للتمييز، الكهرماني للأبطال، الأخضر
 *    للإيجابي، والأحمر للمباشر — بدون أسطح كحلية غامقة أو خطوط/موتيفات خاصة.
 *  - المكوّنات الثقيلة (MatchHub، الترتيب، الهدّافون، الحوار...) يُعاد استخدامها من
 *    SportsHub وتلبس ثيم الموقع الافتراضي مباشرة (كما في صفحة البطولة).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  CalendarDays,
  Star,
  Clock,
  Flame,
  Goal,
  Radio,
  ChevronLeft,
  ArrowLeftRight,
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
  COMP_CATEGORY_LABELS,
  COMP_CATEGORY_ORDER,
  COMP_STATUS_LABELS,
  COMP_STATUS_RANK,
  CompetitionSummaryCard,
  PillTabs,
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
  type SpTeam,
  type SpStandingRow,
  type SpScorer,
  type SpAssister,
  type SpCardLeader,
  type SpCompetition,
  type SpCompetitionCategory,
  type SpSummary,
  type SpShort,
} from "./SportsHub";

const imgOf = (a: ArticleWithDetails) => getCacheBustedImageUrl(a.imageUrl || a.thumbnailUrl, a.updatedAt);
// زمن الخبر للترتيب — نعتمد النشر ثم الإنشاء حتى لا يتصدّر خبر قديم مثبّت يدويًا (displayOrder).
const articleTime = (a: ArticleWithDetails) => new Date(a.publishedAt || (a as any).createdAt || 0).getTime();
const byRecency = (a: ArticleWithDetails, b: ArticleWithDetails) => articleTime(b) - articleTime(a);
const DEFAULT_COMPETITION_SLUG = "kings-cup";
const FALLBACK_COMPETITION_SLUG = "pro-league";

// البطولات التي يحقّ لها تصدّر «الغلاف الذكي» (الهيرو): السعودية كلها (عبر الفئة)
// + الكبرى عالميًا/قاريًا/أوروبيًا + كؤوس الخليج. غيرها (الدوريات العربية والدرجات
// الدنيا) يبقى حاضرًا في نبض المباشر ولوحة النتائج بترتيب أهمية — لكن لا يتصدّر
// البوابة أبدًا، فلا تطغى مباراة ثانوية على الواجهة.
const SPOTLIGHT_MARQUEE_SLUGS = new Set([
  "world-cup", "club-world-cup", "afc-champions-league",
  "champions-league", "europa-league",
  "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1",
  "gulf-cup", "gulf-club-champions",
]);
// تُثبّت أعلى ترتيب الأهمية اللحظي (فوق السعودي).
const LIVE_PINNED_SLUGS = ["world-cup", "gulf-cup"];

function competitionStartTs(c: SpCompetition): number {
  if (!c.start) return Number.POSITIVE_INFINITY;
  const ts = new Date(c.start).getTime();
  return Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY;
}

function competitionSeasonLabel(c: SpCompetition, firstFixtureTs?: number | null): string {
  const anchor = firstFixtureTs
    ? new Date(firstFixtureTs * 1000)
    : c.start
      ? new Date(c.start)
      : null;
  if (anchor && Number.isFinite(anchor.getTime())) {
    const year = anchor.getFullYear();
    const month = anchor.getMonth() + 1;
    const startYear = month >= 7 ? year : year - 1;
    return `${startYear}/${startYear + 1}`;
  }
  return c.season != null ? `${c.season}/${c.season + 1}` : "";
}

function competitionRank(c: SpCompetition, selectedSlug: string): number {
  if (c.slug === selectedSlug) return -10;
  if (c.slug === DEFAULT_COMPETITION_SLUG) return -5;
  if (c.status === "ongoing") return 0;
  if (c.status === "upcoming") return 1;
  if (c.status === "unknown") return 2;
  return 3;
}

function sortCompetitionsForPortal(rows: SpCompetition[], selectedSlug: string): SpCompetition[] {
  return rows
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ra = competitionRank(a.c, selectedSlug);
      const rb = competitionRank(b.c, selectedSlug);
      if (ra !== rb) return ra - rb;
      const sa = competitionStartTs(a.c);
      const sb = competitionStartTs(b.c);
      if (sa !== sb) return sa - sb;
      const statusA = COMP_STATUS_RANK[a.c.status ?? "unknown"];
      const statusB = COMP_STATUS_RANK[b.c.status ?? "unknown"];
      if (statusA !== statusB) return statusA - statusB;
      return a.i - b.i;
    })
    .map(({ c }) => c);
}

// ترويسة قسم بأسلوب /sabq-ai: عنوان مركزي بين فاصلين خطيّين + وصف + رابط اختياري تحته.
function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <h2 className="whitespace-nowrap text-xl font-extrabold text-foreground sm:text-2xl">{title}</h2>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

// شريط «على الهواء» — عبارات وصفية رياضية تتحرّك أفقيًا (نفس بلاط /sabq-ai).
const TICKER_ITEMS: { tag: string; text: string }[] = [
  { tag: "بطولات", text: "المونديال وآسيا والخليج ودوري روشن وكأس الملك — كلها في مكان واحد" },
  { tag: "مباشر", text: "نتائج المباريات لحظة بلحظة فور وقوع الحدث" },
  { tag: "ترتيب", text: "جداول الترتيب والهدّافون تتحدّث تلقائيًا" },
  { tag: "توقّعات", text: "توقّع النتائج ونافِس الجمهور على القمّة" },
  { tag: "انتقالات", text: "مَن وصل ومَن غادر في دوري روشن — موجز الصفقات" },
];

function SportsTicker() {
  return (
    <div className="flex items-center overflow-hidden border-b border-[#123047] bg-[#0E2233]" aria-hidden="true">
      <span className="relative z-10 shrink-0 bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
        على الهواء
      </span>
      {/* غلاف overflow-hidden مستقل حتى لا ينزلق الحزام فوق التسمية */}
      <div className="flex-1 overflow-hidden">
        <div className="sports-belt flex whitespace-nowrap">
          {[0, 1].map((half) => (
            <div key={half} className="flex shrink-0">
              {TICKER_ITEMS.map((item, i) => (
                <span key={i} className="inline-flex items-center gap-2 py-2 pe-12 text-[13px] text-slate-300">
                  <b className="font-bold text-primary">{item.tag}</b>
                  {item.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .sports-belt { animation: sports-belt 55s linear infinite; }
        @keyframes sports-belt { from { transform: translateX(0); } to { transform: translateX(50%); } }
        @media (prefers-reduced-motion: reduce) { .sports-belt { animation: none; } }
      `}</style>
    </div>
  );
}

const moreLink = (href: string, label = "المزيد") => (
  <Link href={href} className="inline-flex items-center gap-1 text-sm font-bold text-primary transition-opacity hover:opacity-80">
    {label} <ChevronLeft className="h-4 w-4" strokeWidth={2} />
  </Link>
);

// ============================================================
// ترويسة البوابة — بطاقة فاتحة بهوية الموقع (مثل ترويسة صفحة البطولة):
// أيقونة بخلفية زرقاء خفيفة، عنوان، وصف، شارة مباشر، وتنقّل سريع بوسوم فاتحة.
// ============================================================
const coverDateFmt = new Intl.DateTimeFormat("ar", {
  calendar: "gregory",
  numberingSystem: "latn",
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Riyadh",
});

function SportsHero({
  liveCount,
  todayCount,
  compCount,
  nav,
  onJump,
}: {
  liveCount: number;
  todayCount: number;
  compCount: number;
  nav: { id: string; label: string }[];
  onJump: (id: string) => void;
}) {
  const today = useMemo(() => coverDateFmt.format(new Date()), []);
  return (
    <section className="border-b border-border bg-card px-4 pt-14 pb-10 text-center sm:pt-16 sm:pb-12" data-testid="sports-hero">
      <span className="mb-5 inline-block rounded-full border border-primary/20 bg-primary/10 px-5 py-1.5 text-xs font-bold text-primary md:text-[13px]">
        البوابة الرياضية — كل الملاعب في شاشة واحدة
      </span>
      <h1 className="mx-auto max-w-3xl text-balance text-3xl font-extrabold leading-[1.4] text-foreground md:text-5xl">
        من أرض الملعب إلى شاشتك…
        <br />
        <span className="text-primary">لحظة بلحظة</span>
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground md:text-lg">
        أخبار ونتائج مباشرة وترتيب وأرقام كل البطولات — من المونديال إلى دوري روشن، في مكان واحد.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {liveCount > 0 && (
          <button
            type="button"
            onClick={() => onJump("live-pulse")}
            className="inline-flex items-center gap-2 rounded-full bg-red-500 px-4 py-1.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
            data-testid="hero-live-chip"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> {liveCount} مباشر الآن
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          {today} · <span className="tabular-nums">{todayCount}</span> اليوم · <span className="tabular-nums">{compCount}</span> بطولة
        </span>
      </div>

      {nav.length > 0 && (
        <nav className="mt-6 flex flex-wrap justify-center gap-2">
          {nav.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onJump(n.id)}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3.5 py-1.5 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {n.label}
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}

// ============================================================
// نبض المباشر — شريط أفقي يظهر فقط حين توجد مباريات جارية عبر كل بطولاتنا.
// بطاقات فاتحة بحدود 1px، دقيقة لحظية، والأحمر للحيّ فقط.
// ============================================================
function liveMinute(f: SpLiveItem): string {
  if (f.status.code === "HT") return "الراحة";
  const e = f.status.elapsed;
  if (e == null) return f.status.label;
  return f.status.extra ? `${e}+${f.status.extra}'` : `${e}'`;
}

function PulseTeamRow({ team, goal }: { team: SpTeam; goal: number | null }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="flex min-w-0 items-center gap-2">
        {team.logo ? (
          <img src={team.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <span className="truncate text-[13px] font-bold text-foreground">{team.name}</span>
      </span>
      <span className="shrink-0 text-base font-black tabular-nums text-foreground">{goal ?? 0}</span>
    </div>
  );
}

function LivePulse({ items, onOpen }: { items: SpLiveItem[]; onOpen: (id: number) => void }) {
  if (items.length === 0) return null;
  return (
    <div id="live-pulse" className="scroll-mt-16 border-b border-border bg-red-500/[0.04]">
      <div className="mx-auto max-w-[1200px] px-4 py-3.5 sm:px-6">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-black text-red-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> مباشر الآن
          </span>
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{items.length} مباراة</span>
        </div>
        <div className="scrollbar-hide flex gap-2.5 overflow-x-auto pb-1">
          {items.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpen(f.id)}
              className="w-[212px] shrink-0 rounded-2xl border border-border bg-card p-3 text-right transition-colors hover:border-primary/40"
              data-testid={`pulse-match-${f.id}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="max-w-[120px] truncate text-[10px] font-bold text-muted-foreground">{f.competition}</span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold tabular-nums text-red-500">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> {liveMinute(f)}
                </span>
              </div>
              <PulseTeamRow team={f.home} goal={f.goals.home} />
              <PulseTeamRow team={f.away} goal={f.goals.away} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// خبر الـHero الكبير — صورة بتظليل أسفل خفيف لقراءة العنوان، وسم دائري.
// ============================================================
function HeroFeature({ article }: { article: ArticleWithDetails }) {
  const img = imgOf(article);
  return (
    <Link
      href={`/article/${article.englishSlug || article.slug}`}
      className="group relative block h-[320px] overflow-hidden rounded-2xl border border-border bg-card sm:h-[400px] lg:h-[460px]"
    >
      {img ? (
        <>
          <div className="absolute inset-0">
            <OptimizedImage
              src={img}
              alt={article.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              wrapperClassName="w-full h-full"
              objectPosition={getObjectPosition(article)}
              priority
              fetchPriority="high"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-muted">
          <Trophy className="h-16 w-16 text-muted-foreground/30" strokeWidth={1.5} />
        </div>
      )}
      <div className={`absolute inset-x-0 bottom-0 p-6 sm:p-8 ${img ? "" : "top-0 flex flex-col justify-end"}`}>
        <div className="mb-3 flex items-center gap-2.5">
          {article.newsType === "breaking" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-3 py-1 text-[11px] font-bold text-white">
              <Flame className="h-3 w-3" strokeWidth={1.8} /> عاجل
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-white">
              <Trophy className="h-3 w-3" strokeWidth={1.8} /> الخبر الأبرز
            </span>
          )}
          <span className={`flex items-center gap-1 text-[11px] tabular-nums ${img ? "text-white/80" : "text-muted-foreground"}`}>
            <Clock className="h-3 w-3" strokeWidth={1.8} />{timeAgo(article.publishedAt)}
          </span>
        </div>
        <h2 className={`text-2xl font-black leading-snug line-clamp-3 sm:text-4xl ${img ? "text-white" : "text-foreground transition-colors group-hover:text-primary"}`}>
          {article.title}
        </h2>
        {article.excerpt && (
          <p className={`mt-3 hidden max-w-2xl text-sm leading-relaxed line-clamp-2 sm:block ${img ? "text-white/85" : "text-muted-foreground"}`}>
            {article.excerpt}
          </p>
        )}
      </div>
    </Link>
  );
}

// ============================================================
// لوحة نتائج اليوم — بطاقة فاتحة بترويسة رمادية خفيفة وأرقام tabular.
// ============================================================
function ScoreboardCard({ items, onOpen }: { items: SpLiveItem[]; onOpen: (id: number) => void }) {
  const liveCount = items.filter((f) => f.status.live).length;
  const orderToday = (rows: SpLiveItem[]) =>
    [...rows].sort((a, b) => {
      if (a.status.live !== b.status.live) return a.status.live ? -1 : 1;
      if (a.status.finished !== b.status.finished) return a.status.finished ? 1 : -1;
      if (a.status.finished && b.status.finished) return b.timestamp - a.timestamp;
      return a.timestamp - b.timestamp;
    });
  const worldCup = orderToday(items.filter((f) => f.competitionSlug === "world-cup"));
  const others = orderToday(items.filter((f) => f.competitionSlug !== "world-cup"));
  const worldCupShown = worldCup.slice(0, 4);
  const othersShown = others.slice(0, worldCupShown.length > 0 ? 3 : 5);
  const groups = [
    { key: "world-cup", title: "كأس العالم", items: worldCupShown },
    { key: "others", title: "بطولات أخرى", items: othersShown },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/60 px-4 py-3.5">
        <span className="flex items-center gap-2 text-sm font-black text-foreground">
          {liveCount > 0 ? (
            <Radio className="h-4 w-4 text-red-500" strokeWidth={1.8} />
          ) : (
            <CalendarDays className="h-4 w-4 text-primary" strokeWidth={1.8} />
          )}
          {liveCount > 0 ? "مباشر الآن" : "مباريات اليوم"}
        </span>
        {liveCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tabular-nums text-red-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> {liveCount}
          </span>
        ) : items.length > 0 ? (
          <span className="text-[12px] tabular-nums text-muted-foreground">{items.length}</span>
        ) : null}
      </div>

      {groups.length > 0 ? (
        <div className="scrollbar-hide max-h-[480px] space-y-3 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group.key} className="grid gap-2">
              <div className="flex items-center justify-between px-1 text-[11px] font-bold text-foreground">
                <span>{group.title}</span>
                <span className="tabular-nums text-muted-foreground">{group.items.length}</span>
              </div>
              {group.items.map((f) => <TodayCompactRow key={f.id} f={f} onOpen={onOpen} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid place-items-center gap-1 p-8 text-center text-sm text-muted-foreground">
          <CalendarDays className="h-6 w-6 opacity-40" strokeWidth={1.8} />
          لا مباريات اليوم — تابع الجولة القادمة من مركز المباريات.
        </div>
      )}

      <Link
        href="/sports/matches"
        className="flex items-center justify-center gap-1 border-t border-border py-3 text-xs font-bold text-primary transition-colors hover:bg-muted/60"
      >
        كل مباريات اليوم <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
      </Link>
    </div>
  );
}

// ============================================================
// بطاقة خبر بهوية الموقع: صورة أعلى، وسم دائري، عنوان، وطابع زمني.
// ============================================================
function NewsCard({ article }: { article: ArticleWithDetails }) {
  const img = imgOf(article);
  const breaking = article.newsType === "breaking";
  return (
    <Link
      href={`/article/${article.englishSlug || article.slug}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="aspect-[16/10] overflow-hidden bg-muted">
        {img ? (
          <OptimizedImage
            src={img}
            alt={article.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            wrapperClassName="w-full h-full"
            objectPosition={getObjectPosition(article)}
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <Trophy className="h-9 w-9 text-muted-foreground/30" strokeWidth={1.5} />
          </div>
        )}
      </div>
      <div className="p-4">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${breaking ? "bg-red-500 text-white" : "bg-primary/10 text-primary"}`}>
          {breaking ? "عاجل" : "رياضة"}
        </span>
        <h3 className="mt-2.5 text-[15px] font-bold leading-relaxed text-foreground line-clamp-2 transition-colors group-hover:text-primary">
          {article.title}
        </h3>
        <div className="mt-2.5 text-[11px] tabular-nums text-muted-foreground">{timeAgo(article.publishedAt)}</div>
      </div>
    </Link>
  );
}

// شريط متابعاتي — وسوم دائرية بحدود 1px، يظهر للمستخدم المتابِع فقط.
function FollowsStrip({ todayMatches, onOpen }: { todayMatches: SpLiveItem[]; onOpen: (id: number) => void }) {
  const { isAuthed, follows } = useSportsFollows();
  const teamFollows = follows.filter((f) => f.kind === "team");
  if (!isAuthed || teamFollows.length === 0) return null;
  const matchOf = (refId: string) => todayMatches.find((m) => String(m.home.id) === refId || String(m.away.id) === refId);

  return (
    <div className="scrollbar-hide mb-6 flex items-center gap-2 overflow-x-auto">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" strokeWidth={1.8} /> فِرقي
      </span>
      {teamFollows.map((f) => {
        const m = matchOf(f.refId);
        const live = m?.status.live ?? false;
        const inner = (
          <>
            {f.refLogo ? <img src={f.refLogo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" /> : <span className="h-5 w-5 shrink-0 rounded-full bg-muted" />}
            <span className="whitespace-nowrap text-sm font-bold text-foreground">{f.refName}</span>
            {live && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums text-red-500">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                {m!.status.elapsed != null ? `${m!.status.elapsed}'` : "مباشر"}
              </span>
            )}
            {!live && m?.status.finished && (
              <span className="text-[10px] font-bold tabular-nums text-muted-foreground" dir="ltr">{m.goals.home ?? 0}-{m.goals.away ?? 0}</span>
            )}
          </>
        );
        return m ? (
          <button key={f.id} type="button" onClick={() => onOpen(m.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 transition-colors ${live ? "border-red-400/40 bg-red-500/5" : "border-border bg-card hover:border-primary/40"}`}>
            {inner}
          </button>
        ) : (
          <Link key={f.id} href={`/sports/team/${f.refId}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 transition-colors hover:border-primary/40">
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

// ============================================================
// نظرة الموسم — جاهزية ما قبل الموسم / العطلة (بطاقة فاتحة، كهرماني/أزرق).
// ============================================================
type SpSeasonOutlook = {
  phase: "in-season" | "pre-season" | "off-season" | "unknown";
  season: number;
  status: string;
  start: string | null;
  end: string | null;
  champion: { id: number; name: string; logo: string } | null;
  nextSeason: number | null;
  nextSeasonStart: string | null;
  firstKickoff: number | null;
  daysUntilKickoff: number | null;
  openers: SpFixture[];
};

// إرث النسخة السابقة — البطل + الهدّاف، من GET /api/sports/:slug/history.
type CompHistory = {
  previousSeason: number | null;
  champion: { id: number; name: string; logo: string } | null;
  topScorer: { id: number; name: string; photo: string; team: { id: number; name: string; logo: string }; goals: number } | null;
};

const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
const outlookDateFmt = new Intl.DateTimeFormat("ar", {
  calendar: "gregory",
  numberingSystem: "latn",
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Riyadh",
});

function SeasonOutlookBanner({ outlook, history }: { outlook: SpSeasonOutlook; history: CompHistory | null }) {
  if (outlook.phase === "in-season" || outlook.phase === "unknown") return null;
  const kickoff = outlook.firstKickoff ? outlookDateFmt.format(new Date(outlook.firstKickoff)) : null;

  if (outlook.phase === "off-season") {
    return (
      <div className="mb-6 rounded-2xl border border-amber-400/30 bg-gradient-to-l from-amber-400/10 to-transparent p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="shrink-0 rounded-2xl bg-amber-400/15 p-3"><Trophy className="h-7 w-7 text-amber-500" strokeWidth={1.8} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold tabular-nums text-amber-600 dark:text-amber-400">انتهى موسم {seasonLabel(outlook.season)}</div>
            {outlook.champion ? (
              <div className="mt-1 flex items-center gap-2">
                {outlook.champion.logo && <img src={outlook.champion.logo} alt="" className="h-8 w-8 shrink-0 object-contain" />}
                <span className="truncate text-lg font-black text-foreground sm:text-xl">{outlook.champion.name} <span className="text-amber-500">بطلاً 🏆</span></span>
              </div>
            ) : (
              <div className="mt-1 text-lg font-black text-foreground">في انتظار الموسم الجديد</div>
            )}
            <p className="mt-1.5 text-sm text-muted-foreground">الموسم الجديد قريبًا — يظهر الجدول والعدّ التنازلي والترتيب هنا فور إعلان المواعيد.</p>
          </div>
        </div>
      </div>
    );
  }

  // ما قبل الموسم — عدّ تنازلي + إرث الموسم الماضي (البطل + الهدّاف). لا نكرّر
  // افتتاحيات الجولة الأولى هنا لأنها تظهر كاملةً في «مركز المباريات» أسفله.
  const hasLegacy = Boolean(history?.champion || history?.topScorer);
  return (
    <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/[0.04] p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="shrink-0 rounded-2xl bg-primary/10 px-5 py-2.5 text-center">
          <div className="text-3xl font-black leading-none tabular-nums text-primary sm:text-4xl">{outlook.daysUntilKickoff ?? "—"}</div>
          <div className="mt-1 text-[10px] font-bold text-primary/80">يومًا</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary">
            <Flame className="h-3.5 w-3.5" strokeWidth={1.8} /> ينطلق موسم {outlook.nextSeason ? seasonLabel(outlook.nextSeason) : ""}
          </div>
          <h3 className="mt-1 text-lg font-black text-foreground sm:text-xl">العدّ التنازلي بدأ</h3>
          {kickoff && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" strokeWidth={1.8} /> أولى المباريات {kickoff}</p>
          )}
        </div>
      </div>
      {hasLegacy && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {history!.champion && (
            <div className="flex items-center gap-3 rounded-xl bg-amber-400/[0.06] px-3 py-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center">
                {history!.champion.logo ? (
                  <img src={history!.champion.logo} alt="" className="h-10 w-10 object-contain" loading="lazy" />
                ) : (
                  <Trophy className="h-6 w-6 text-amber-500" strokeWidth={1.8} />
                )}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-amber-600/80 dark:text-amber-400/80">
                  حامل اللقب{history!.previousSeason ? ` · ${history!.previousSeason}` : ""}
                </div>
                <div className="truncate text-sm font-black text-foreground">{history!.champion.name}</div>
              </div>
            </div>
          )}
          {history!.topScorer && (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-400/[0.06] px-3 py-2.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center">
                {history!.topScorer.photo ? (
                  <img src={history!.topScorer.photo} alt="" className="h-10 w-10 rounded-full object-cover" loading="lazy" />
                ) : (
                  <Goal className="h-6 w-6 text-emerald-500" strokeWidth={1.8} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold text-emerald-600/80 dark:text-emerald-400/80">هدّاف الموسم الماضي</div>
                <div className="truncate text-sm font-black text-foreground">
                  {history!.topScorer.name}
                  <span className="mr-1.5 text-xs font-bold tabular-nums text-muted-foreground">{history!.topScorer.goals} هدفًا</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// بانر مركز الانتقالات — بطاقة فاتحة بتدرّج أزرق خفيف.
// ============================================================
function TransfersBanner() {
  return (
    <Link
      href="/sports/transfers"
      className="group relative block overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-l from-primary/[0.06] to-transparent p-5 sm:p-6"
      data-testid="transfers-banner"
    >
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10">
          <ArrowLeftRight className="h-7 w-7 text-primary" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-black text-foreground sm:text-2xl">مركز الانتقالات</div>
          <div className="mt-1 text-sm text-muted-foreground">مَن وصل ومَن غادر في دوري روشن — موجز الصفقات بالنوع والمبلغ عند توفّره</div>
        </div>
        <ChevronLeft className="h-6 w-6 shrink-0 text-primary transition-transform group-hover:-translate-x-1" strokeWidth={1.8} />
      </div>
    </Link>
  );
}

// ============================================================
// الغلاف الذكي — «حالة واحدة تحكم الشاشة»: مباراة مباشرة تتصدّر بلوحة نتيجة،
// وإلا أقرب مباراة مهمّة بعدّاد؛ وإلا لا شيء (يتصدّر الخبر). بطاقات فاتحة.
// ============================================================
const spotTimeFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: true });
const spotDayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long" });
const spotDayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });

function SpotTeam({ name, logo }: { name: string; logo: string | null | undefined }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      {logo ? (
        <img src={logo} alt="" className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16" loading="lazy" />
      ) : (
        <span className="h-14 w-14 shrink-0 rounded-full bg-muted sm:h-16 sm:w-16" />
      )}
      <span className="line-clamp-2 text-center text-sm font-bold text-foreground sm:text-base">{name}</span>
    </div>
  );
}

function SmartSpotlight({
  live,
  summaries,
  onOpen,
}: {
  live: SpLiveItem[];
  summaries: SpSummary[];
  onOpen: (id: number) => void;
}) {
  const now = Date.now();
  const topLive = live[0] ?? null;

  // أقرب مباراة قادمة عبر كل البطولات (خلال 72 ساعة) — من موجز البطولات.
  const nextUp = !topLive
    ? summaries
        .filter((c) => c.status !== "finished" && c.nextMatch && c.nextMatch.timestamp * 1000 > now)
        .map((c) => ({ comp: c, m: c.nextMatch! }))
        .filter(({ m }) => m.timestamp * 1000 - now <= 72 * 3_600_000)
        .sort((a, b) => a.m.timestamp - b.m.timestamp)[0] ?? null
    : null;

  if (!topLive && !nextUp) return null;

  if (topLive) {
    return (
      <button
        type="button"
        onClick={() => onOpen(topLive.id)}
        className="block w-full overflow-hidden rounded-2xl border border-red-400/30 bg-gradient-to-l from-red-500/[0.08] to-transparent p-6 text-right transition-colors hover:border-red-400/50 sm:p-8"
        data-testid="smart-spotlight-live"
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 text-[12px] font-bold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> مباشر الآن
          </span>
          <span className="text-[12px] font-bold text-muted-foreground">{topLive.competition}</span>
        </div>
        <div className="flex items-center justify-between gap-3 sm:gap-6">
          <SpotTeam name={topLive.home.name} logo={topLive.home.logo} />
          <div className="flex shrink-0 flex-col items-center gap-1">
            <div className="text-4xl font-black leading-none tabular-nums text-foreground sm:text-5xl" dir="ltr">
              {topLive.goals.home ?? 0} - {topLive.goals.away ?? 0}
            </div>
            <span className="inline-flex items-center gap-1 text-[12px] font-bold tabular-nums text-red-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> {liveMinute(topLive)}
            </span>
          </div>
          <SpotTeam name={topLive.away.name} logo={topLive.away.logo} />
        </div>
      </button>
    );
  }

  // أقرب مباراة قادمة — عدّاد تشويقي + معاينة الفريقين.
  const { comp, m } = nextUp!;
  const days = Math.floor((m.timestamp * 1000 - now) / 86_400_000);
  const hours = Math.floor(((m.timestamp * 1000 - now) % 86_400_000) / 3_600_000);
  const isToday = spotDayKey.format(new Date(m.timestamp * 1000)) === spotDayKey.format(new Date());
  const whenLabel = isToday
    ? `اليوم · ${spotTimeFmt.format(new Date(m.timestamp * 1000))}`
    : `${spotDayFmt.format(new Date(m.timestamp * 1000))} · ${spotTimeFmt.format(new Date(m.timestamp * 1000))}`;
  const countdown = days > 0 ? `بعد ${days} يوم${hours > 0 ? ` و${hours} ساعة` : ""}` : hours > 0 ? `بعد ${hours} ساعة` : "قريبًا";

  return (
    <button
      type="button"
      onClick={() => onOpen(m.id)}
      className="block w-full overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.04] p-6 text-right transition-colors hover:border-primary/40 sm:p-8"
      data-testid="smart-spotlight-upcoming"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[12px] font-bold text-primary">
          <Flame className="h-3.5 w-3.5" strokeWidth={1.8} /> المباراة الأبرز قادمة
        </span>
        <span className="text-[12px] font-bold text-muted-foreground">{comp.name}</span>
      </div>
      <div className="flex items-center justify-between gap-3 sm:gap-6">
        <SpotTeam name={m.home.name} logo={m.home.logo} />
        <div className="flex shrink-0 flex-col items-center gap-1.5">
          <span className="text-[13px] font-bold text-primary">{countdown}</span>
          <span className="text-2xl font-bold text-muted-foreground/50">×</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">{whenLabel}</span>
        </div>
        <SpotTeam name={m.away.name} logo={m.away.logo} />
      </div>
    </button>
  );
}

// ============================================================
// الصفحة
// ============================================================
export default function SportsDashboard() {
  const { user } = useAuth();
  const [compSlug, setCompSlug] = useState(DEFAULT_COMPETITION_SLUG);
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  const [scorersTab, setScorersTab] = useState<"scorers" | "assists" | "cards">("scorers");

  useEffect(() => { document.title = "الرياضة | سبق"; }, []);
  useCanonical("https://sabq.org/sports");

  const { data: newsRaw, isLoading: newsLoading } = useQuery<ArticleWithDetails[]>({ queryKey: ["/api/categories", "sports", "articles"] });
  const news = Array.isArray(newsRaw) ? newsRaw : [];

  const { data: category } = useQuery<Category>({ queryKey: ["/api/categories/slug", "sports"] });
  const sportsCatId = (category as any)?.id;

  const { data: compsData } = useQuery<{ competitions: SpCompetition[] }>({ queryKey: ["/api/sports/competitions"], staleTime: 60 * 60_000 });
  const competitions = Array.isArray(compsData?.competitions) ? compsData.competitions : [];
  const comp = competitions.find((c) => c.slug === compSlug);
  const hasStandings = comp?.hasStandings ?? compSlug === "pro-league";
  const hasScorers = comp?.hasScorers ?? compSlug === "pro-league";

  useEffect(() => {
    if (competitions.length === 0 || competitions.some((c) => c.slug === compSlug)) return;
    const fallback =
      competitions.find((c) => c.slug === DEFAULT_COMPETITION_SLUG) ??
      competitions.find((c) => c.slug === FALLBACK_COMPETITION_SLUG) ??
      competitions[0];
    if (fallback) setCompSlug(fallback.slug);
  }, [competitions, compSlug]);

  const catOf = (c: SpCompetition): SpCompetitionCategory => c.category ?? "saudi";
  const activeCat: SpCompetitionCategory = comp ? catOf(comp) : "saudi";
  const presentCats = COMP_CATEGORY_ORDER.filter((cat) => competitions.some((c) => catOf(c) === cat));
  const compsInActiveCat = sortCompetitionsForPortal(
    competitions.filter((c) => catOf(c) === activeCat),
    compSlug,
  );

  const { data: matchesData } = useQuery<{ configured: boolean; live: SpFixture[]; today: SpFixture[]; upcoming: SpFixture[]; results: SpFixture[] }>({
    queryKey: [`/api/sports/${compSlug}/matches`],
    // مباراة جارية في البطولة → 8ث (نتيجة لحظية)؛ غير ذلك → 30ث
    refetchInterval: (query) =>
      (query.state.data?.live ?? []).some((f) => f.status.live) ? 8_000 : 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const matchesConfigured = matchesData?.configured ?? true;

  // نظرة الموسم: تكشف العطلة/ما قبل الموسم لإظهار البطل والعدّ التنازلي تلقائيًا.
  const { data: outlookData } = useQuery<{ outlook: SpSeasonOutlook | null }>({
    queryKey: [`/api/sports/${compSlug}/outlook`],
    staleTime: 10 * 60_000,
  });
  const outlook = outlookData?.outlook ?? null;

  // إرث النسخة السابقة للبطولة المختارة — يغذّي بطاقة «العدّ التنازلي» بدل تكرار
  // افتتاحيات الجولة الأولى (الظاهرة في مركز المباريات أدناه).
  const { data: historyData } = useQuery<{ history: CompHistory }>({
    queryKey: [`/api/sports/${compSlug}/history`],
    staleTime: 6 * 60 * 60_000,
  });
  const compHistory = historyData?.history ?? null;

  const matches = {
    live: Array.isArray(matchesData?.live) ? matchesData!.live : [],
    today: Array.isArray(matchesData?.today) ? matchesData!.today : [],
    upcoming: Array.isArray(matchesData?.upcoming) ? matchesData!.upcoming : [],
    results: Array.isArray(matchesData?.results) ? matchesData!.results : [],
  };
  const firstKnownFixtureTs = [...matches.live, ...matches.today, ...matches.upcoming, ...matches.results]
    .map((f) => f.timestamp)
    .filter((ts) => Number.isFinite(ts))
    .sort((a, b) => a - b)[0] ?? null;

  const { data: todayData } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today"],
    // يوجد مباشر اليوم → 10ث؛ غير ذلك → 30ث
    refetchInterval: (query) =>
      (query.state.data?.today ?? []).some((f) => f.status.live) ? 10_000 : 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const todayMatches = Array.isArray(todayData?.today) ? todayData!.today : [];
  const liveCount = todayMatches.filter((f) => f.status.live).length;

  // نبض المباشر: نداء مخصّص أسرع (7ث) لكل المباريات الجارية عبر بطولاتنا —
  // هنا تظهر النتيجة/الدقيقة اللحظية من TheSports فور توفّرها في الإنتاج.
  const { data: liveData } = useQuery<{ live: SpLiveItem[] }>({
    queryKey: ["/api/sports/live"], refetchInterval: 7_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  });
  const liveMatches = (Array.isArray(liveData?.live) ? liveData!.live : []).filter((f) => f.status.live);

  // موجز البطولات: لقطة موحّدة لكل بطولة تغذّي رفّ «موجز البطولات». تُحدَّث كل
  // 30ث فقط عند وجود مباراة جارية في أي بطولة (وإلا تبقى على كاش SWR الطويل).
  const { data: summaryData } = useQuery<{ configured: boolean; competitions: SpSummary[] }>({
    queryKey: ["/api/sports/summary"],
    staleTime: 2 * 60_000,
    refetchInterval: (query) =>
      (query.state.data?.competitions ?? []).some((c) => c.liveCount > 0) ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const summaries = Array.isArray(summaryData?.competitions) ? summaryData!.competitions : [];
  // ترتيب داخل الفئة: الجارية (لا سيّما ذات المباشر/مباريات اليوم) أولًا ثم
  // القادمة ثم المنتهية.
  const summaryStatusRank = (c: SpSummary) =>
    c.liveCount > 0 ? -2 : c.todayCount > 0 ? -1 : COMP_STATUS_RANK[c.status ?? "unknown"];
  // الفئات الحاضرة فعلًا (سعودي → خليجي → عربي → أوروبي → عالمي).
  const presentSummaryCats = COMP_CATEGORY_ORDER.filter((cat) => summaries.some((c) => c.category === cat));
  // الفئة المختارة: نبدأ بالفئة التي فيها مباشر/اليوم، وإلا أول فئة حاضرة.
  const [summaryCat, setSummaryCat] = useState<SpCompetitionCategory | null>(null);
  useEffect(() => {
    if (presentSummaryCats.length === 0) { if (summaryCat !== null) setSummaryCat(null); return; }
    if (summaryCat && presentSummaryCats.includes(summaryCat)) return;
    const hot = presentSummaryCats.find((cat) => summaries.some((c) => c.category === cat && (c.liveCount > 0 || c.todayCount > 0)));
    setSummaryCat(hot ?? presentSummaryCats[0]);
  }, [presentSummaryCats.join(","), summaries.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const activeSummaryRows = summaries
    .filter((c) => c.category === summaryCat)
    .sort((a, b) => summaryStatusRank(a) - summaryStatusRank(b) || a.name.localeCompare(b.name, "ar"));

  // ترتيب المباشر بالأهمية (السعودي/المثبّتة أولًا ثم الفئات الأهم)، وتحديد ما
  // يحقّ له تصدّر الغلاف الذكي — فلا تطغى مباراة من دوري ثانوي على الواجهة.
  const compCatBySlug = new Map(competitions.map((c) => [c.slug, catOf(c)]));
  const liveImportance = (f: SpLiveItem): number => {
    const slug = f.competitionSlug ?? "";
    if (LIVE_PINNED_SLUGS.includes(slug)) return 0;
    const cat = compCatBySlug.get(slug);
    const idx = cat ? COMP_CATEGORY_ORDER.indexOf(cat) : -1;
    return idx >= 0 ? idx + 1 : 99;
  };
  const rankedLive = [...liveMatches].sort((a, b) => liveImportance(a) - liveImportance(b) || a.timestamp - b.timestamp);
  const isMarquee = (slug: string, cat: SpCompetitionCategory | undefined) =>
    cat === "saudi" || SPOTLIGHT_MARQUEE_SLUGS.has(slug);
  const spotlightLive = rankedLive.filter((f) => isMarquee(f.competitionSlug ?? "", compCatBySlug.get(f.competitionSlug ?? "")));
  const spotlightSummaries = summaries.filter((c) => isMarquee(c.slug, c.category));

  const { data: standingsData } = useQuery<{ standings: SpStandingRow[] }>({
    queryKey: [`/api/sports/${compSlug}/standings`],
    staleTime: 5 * 60_000,
    enabled: hasStandings,
    // ترتيب مبدئي لحظي مفعّل (صفّ live) → 8ث ليتحرّك الجدول مع المباراة
    refetchInterval: (query) =>
      (query.state.data?.standings ?? []).some((r) => r.live) ? 8_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];

  const { data: scorersData } = useQuery<{ scorers: SpScorer[] }>({ queryKey: [`/api/sports/${compSlug}/scorers`], staleTime: 10 * 60_000, enabled: hasScorers });
  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];

  const { data: assistsData } = useQuery<{ assists: SpAssister[] }>({ queryKey: [`/api/sports/${compSlug}/assists`], staleTime: 10 * 60_000, enabled: hasScorers });
  const assisters = Array.isArray(assistsData?.assists) ? assistsData.assists : [];

  const { data: cardsData } = useQuery<{ yellow: SpCardLeader[]; red: SpCardLeader[] }>({ queryKey: [`/api/sports/${compSlug}/cards`], staleTime: 10 * 60_000, enabled: hasScorers && scorersTab === "cards" });
  const yellowLeaders = Array.isArray(cardsData?.yellow) ? cardsData.yellow : [];
  const redLeaders = Array.isArray(cardsData?.red) ? cardsData.red : [];

  const { data: shortsByCat } = useQuery<{ shorts: SpShort[] }>({ queryKey: ["/api/shorts", { categoryId: sportsCatId, limit: 12 }], enabled: !!sportsCatId, staleTime: 10 * 60_000 });
  const { data: shortsFeatured } = useQuery<{ shorts: SpShort[] }>({ queryKey: ["/api/shorts/featured", { limit: 12 }], staleTime: 10 * 60_000 });
  const catShorts = Array.isArray(shortsByCat?.shorts) ? shortsByCat.shorts : [];
  const featShorts = Array.isArray(shortsFeatured?.shorts) ? shortsFeatured.shorts : [];
  const videos = (catShorts.length > 0 ? catShorts : featShorts).slice(0, 8);

  // نرتّب بالأحدث: «الخبر الأبرز» يجب أن يكون أحدث خبر فعلاً لا أقدم خبر مثبّت.
  const sortedNews = [...news].sort(byRecency);
  const featured = sortedNews[0];
  const latest = sortedNews.slice(1, 9);
  // معرض الصور يأخذ ما تبقّى بعد الخبر الأبرز + شبكة الأحدث (منعًا لتكرار نفس
  // المقال في الهيرو والشبكة والمعرض)، مقتصرًا على ما يملك صورة.
  const galleryArticles = sortedNews.slice(9).filter((a) => a.imageUrl || a.thumbnailUrl);

  // عدّاد المباشر الشامل: نبض /api/sports/live يغطي كل بطولاتنا (بما فيها
  // العالمية)، ومباريات اليوم احتياط ريثما يصل أول ردّ من نداء النبض.
  const liveNow = liveMatches.length || liveCount;

  const scrollTo = (id: string) =>
    (document.getElementById(id) ?? document.getElementById("matches"))?.scrollIntoView({ behavior: "smooth", block: "start" });

  // التنقّل السريع في الترويسة — حسب الأقسام المتاحة فعلًا.
  const heroNav = [
    { id: "tournaments", label: "البطولات", show: presentSummaryCats.length > 0 },
    { id: "news", label: "الأخبار", show: true },
    { id: "matches", label: "المباريات", show: true },
    { id: "standings", label: "الترتيب", show: hasStandings },
    { id: "scorers", label: "الهدّافون", show: hasScorers },
    { id: "leaderboard", label: "التوقّعات", show: true },
    { id: "media", label: "الوسائط", show: galleryArticles.length > 0 || videos.length > 0 },
  ]
    .filter((n) => n.show)
    .map((n) => ({ id: n.id, label: n.label }));

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        {/* ===== ترويسة البوابة — عبارة كبيرة في المنتصف بأسلوب /sabq-ai ===== */}
        <SportsHero
          liveCount={liveNow}
          todayCount={todayMatches.length}
          compCount={competitions.length}
          nav={heroNav}
          onJump={scrollTo}
        />

        {/* ===== شريط «على الهواء» المتحرك ===== */}
        <SportsTicker />

        {/* ===== نبض المباشر — يظهر فقط حين توجد مباريات جارية (مرتّبة بالأهمية) ===== */}
        <LivePulse items={rankedLive} onOpen={setOpenMatch} />

        {/* ===== ٠١ موجز البطولات: فلاتر فئة + شبكة بطاقات موحّدة ===== */}
        {presentSummaryCats.length > 0 && (
          <section id="tournaments" className="mx-auto max-w-[1200px] scroll-mt-16 px-4 pt-8 sm:px-6 sm:pt-10">
            <SectionTitle
              title="موجز البطولات"
              subtitle="كل البطولات في نظرة — ادخل أي بطولة لكل تفاصيلها"
              action={moreLink("/sports/matches", "كل المباريات")}
            />
            {presentSummaryCats.length > 1 && (
              <div className="scrollbar-hide mb-5 flex gap-2 overflow-x-auto pb-1">
                {presentSummaryCats.map((cat) => {
                  const count = summaries.filter((c) => c.category === cat).length;
                  const liveInCat = summaries.some((c) => c.category === cat && c.liveCount > 0);
                  const active = summaryCat === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSummaryCat(cat)}
                      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors ${active ? "bg-primary text-white" : "border border-border bg-card text-muted-foreground hover:border-primary/40"}`}
                      data-testid={`summary-cat-${cat}`}
                    >
                      {liveInCat && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
                      {COMP_CATEGORY_LABELS[cat]}
                      <span className={`text-[11px] tabular-nums ${active ? "text-white/80" : "text-muted-foreground"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeSummaryRows.map((c) => (
                <CompetitionSummaryCard key={c.slug} summary={c} />
              ))}
            </div>
          </section>
        )}

        {/* ===== ٠٢ الأخبار: الغلاف الذكي، خبر بارز + لوحة نتائج، ثم شبكة الأحدث ===== */}
        <section id="news" className="mx-auto max-w-[1200px] scroll-mt-16 px-4 pt-8 sm:px-6 sm:pt-10">
          <FollowsStrip todayMatches={todayMatches} onOpen={setOpenMatch} />

          {/* الغلاف الذكي — يتصدّر فقط بمباراة كبرى (سعودي/عالمي/أوروبي كبير/خليجي) */}
          <div className="mb-6 empty:mb-0">
            <SmartSpotlight live={spotlightLive} summaries={spotlightSummaries} onOpen={setOpenMatch} />
          </div>

          {newsLoading ? (
            <div className="grid gap-5 lg:grid-cols-3">
              <Skeleton className="min-h-[300px] rounded-2xl lg:col-span-2 lg:min-h-[460px]" />
              <Skeleton className="min-h-[300px] rounded-2xl lg:min-h-[460px]" />
            </div>
          ) : news.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center text-muted-foreground">
              بانتظار أول الأخبار الرياضية — تظهر هنا فور نشرها.
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
              <div className="lg:col-span-2">{featured && <HeroFeature article={featured} />}</div>
              <ScoreboardCard items={todayMatches} onOpen={setOpenMatch} />
            </div>
          )}

          {/* شبكة أحدث الأخبار */}
          {latest.length > 0 && (
            <div className="mt-12">
              <SectionTitle
                title="أحدث الأخبار"
                subtitle="آخر مستجدّات الرياضة لحظة بلحظة"
                action={moreLink("/category/sports", "كل الأخبار")}
              />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
                {latest.map((a) => <NewsCard key={a.id} article={a} />)}
              </div>
            </div>
          )}
        </section>

        {/* ===== ٠٣ + ٠٤: مركز المباريات والترتيب — باندة فاتحة ===== */}
        <section className="mt-14 border-y border-border bg-muted/40 sm:mt-16">
          <div className="mx-auto max-w-[1200px] space-y-14 px-4 py-12 sm:px-6 sm:py-16">
            <div id="matches" className="scroll-mt-16">
              <SectionTitle
                title="مركز المباريات"
                subtitle="مباشر · اليوم · قادمة · النتائج"
                action={moreLink("/sports/matches", "مباريات اليوم")}
              />
              {competitions.length > 0 && (
                <div className="mb-5 space-y-2.5">
                  {presentCats.length > 1 && (
                    <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                      {presentCats.map((cat) => (
                        <button key={cat}
                          onClick={() => {
                            const first = sortCompetitionsForPortal(
                              competitions.filter((c) => catOf(c) === cat),
                              DEFAULT_COMPETITION_SLUG,
                            )[0];
                            if (first) setCompSlug(first.slug);
                          }}
                          className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${activeCat === cat ? "bg-primary text-white" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}>
                          {COMP_CATEGORY_LABELS[cat]}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-2">
                    {compsInActiveCat.map((c) => (
                      <button key={c.slug} onClick={() => setCompSlug(c.slug)}
                        title={c.status ? COMP_STATUS_LABELS[c.status] : undefined}
                        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors sm:px-4 sm:py-2 sm:text-sm ${compSlug === c.slug ? "bg-primary text-white" : "border border-border bg-card text-muted-foreground hover:border-primary/40"} ${c.status === "finished" && compSlug !== c.slug ? "opacity-60" : ""}`}>
                        {c.status === "ongoing" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {comp && (comp.logo || comp.season || (comp.status && comp.status !== "unknown")) && (
                <div className="mb-5 flex items-center gap-3 px-1">
                  {comp.logo && <img src={comp.logo} alt="" className="h-10 w-10 shrink-0 object-contain" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-black text-foreground">{comp.name}</span>
                      {comp.status && comp.status !== "unknown" && comp.status !== "ongoing" && (
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          comp.status === "upcoming" ? "bg-amber-400/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
                        }`}>
                          {COMP_STATUS_LABELS[comp.status]}
                        </span>
                      )}
                    </div>
                    {comp.season && <div className="text-xs tabular-nums text-muted-foreground">موسم {competitionSeasonLabel(comp, firstKnownFixtureTs)}</div>}
                  </div>
                </div>
              )}
              {outlook && <SeasonOutlookBanner outlook={outlook} history={compHistory} />}
              <MatchHub key={compSlug} data={matches} configured={matchesConfigured} compSlug={compSlug} onOpen={setOpenMatch} />
            </div>

            {hasStandings && (
              <div id="standings" className="scroll-mt-16">
                <SectionTitle title="جدول الترتيب" subtitle="فرز وتصفية مباشرة" />
                {standings.length ? <StandingsTable rows={standings} /> : (
                  <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">
                    بانتظار انطلاق البطولة — يظهر جدول الترتيب هنا مع بداية الجولة الأولى.
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="mx-auto max-w-[1200px] space-y-14 px-4 py-12 sm:px-6 sm:py-16">
          {/* ٠٥ الهدّافون / صنّاع الأهداف / البطاقات */}
          {hasScorers && (
            <section id="scorers" className="scroll-mt-16">
              <SectionTitle
                title={scorersTab === "scorers" ? "منصّة الهدّافين" : scorersTab === "assists" ? "منصّة صنّاع الأهداف" : "متصدّرو البطاقات"}
                subtitle={scorersTab === "scorers" ? "الأكثر تهديفًا في البطولة" : scorersTab === "assists" ? "الأكثر صناعةً للأهداف" : "الأكثر حصولًا على الإنذارات"}
                action={
                  <PillTabs layoutId="dash-scorers-tab" active={scorersTab} onChange={(k) => setScorersTab(k as "scorers" | "assists" | "cards")}
                    tabs={[{ key: "scorers", label: "هدّافون" }, { key: "assists", label: "صنّاع الأهداف" }, { key: "cards", label: "البطاقات" }]} />
                }
              />
              {scorersTab === "scorers" ? (
                scorers.length ? <PodiumCard entries={scorers.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.goals, secondary: s.assists }))} primaryLabel="عدد الأهداف" secondaryLabel="الصناعة" /> : (
                  <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">بانتظار تسجيل أول الأهداف — يظهر ترتيب الهدّافين هنا مع انطلاق المنافسة.</div>
                )
              ) : scorersTab === "assists" ? (
                assisters.length ? <PodiumCard entries={assisters.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.assists, secondary: s.goals }))} primaryLabel="عدد الصناعات" secondaryLabel="الأهداف" /> : (
                  <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">بانتظار أولى الصناعات — يظهر ترتيب صنّاع الأهداف هنا مع انطلاق المنافسة.</div>
                )
              ) : (
                yellowLeaders.length ? <CardLeaders leaders={yellowLeaders} red={redLeaders} /> : (
                  <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">لا تتوفّر بيانات البطاقات لهذه البطولة بعد.</div>
                )
              )}
            </section>
          )}

          {/* مركز الانتقالات — بانر فاتح */}
          <section id="transfers" className="scroll-mt-16">
            <TransfersBanner />
          </section>

          {/* ٠٦ لوحة المتصدّرين (المجتمع) */}
          <section id="leaderboard" className="scroll-mt-16">
            <SectionTitle title="لوحة المتصدّرين" subtitle="توقّع النتائج ونافِس الجمهور" />
            <LeaderboardBoard />
          </section>

          {/* الوسائط: صور + فيديو */}
          {(galleryArticles.length > 0 || videos.length > 0) && (
            <section id="media" className="scroll-mt-16 space-y-14">
              {galleryArticles.length > 0 && (
                <div>
                  <SectionTitle title="معرض الرياضة" subtitle="أبرز اللقطات بالصورة" />
                  <ImageGallery articles={galleryArticles} />
                </div>
              )}
              {videos.length > 0 && (
                <div>
                  <SectionTitle
                    title="فيديو وملخّصات"
                    subtitle="شاهد أحدث المقاطع"
                    action={moreLink("/shorts", "كل الفيديوهات")}
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {videos.map((v, i) => <VideoReel key={v.id} short={v} index={i} />)}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}
