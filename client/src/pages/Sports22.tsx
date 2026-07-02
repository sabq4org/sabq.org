/**
 * سبق الرياضية 2.0 — هَب البطولات الموحّد (/sports22).
 *
 * بوابة بطولات تقودها إعدادات الداشبورد (سجلّ sports_tournaments):
 *  - دوري روشن أساس دائم (anchor) يتصدّر الهب ببوابة موسّعة.
 *  - البطولات الموسمية (كأس الملك، السوبر، آسيا، خليجي...) تظهر وتختفي
 *    حسب حالتها من الداشبورد — بدون deploy.
 *  - شريط «مباشر الآن» يجمع كل المباريات الجارية عبر كل البطولات.
 *  - قسم البث العالمي + الأخبار الرياضية.
 *
 * الهوية: دليل SABQ Brand Guidelines v1.0 — الأزرق يقود (#4CBCFD)، الرمادي
 * يخدم، والبياض يتنفّس. Alexandria للعناوين، Plex Mono للأرقام، زوايا 10/16/24.
 * كل البيانات عبر /api/sports/* القائمة خلف كاش SWR — لا نداء مزوّد جديد.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  Clock,
  Crown,
  Flame,
  Radio,
  Star,
  Target,
  Trophy,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Skeleton } from "@/components/ui/skeleton";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import type { ArticleWithDetails } from "@shared/schema";
import {
  MatchDialog,
  timeAgo,
  type SpFixture,
  type SpLiveItem,
  type SpScorer,
  type SpStandingRow,
  type SpTeam,
} from "./SportsHub";
import { BRAND_CSS, RisingBars, SectionHead, useBrandFonts } from "./SportsBrand";

// ============================================================
// الأنواع — مطابقة لـ GET /api/sports/tournaments (سجلّ البطولات)
// ============================================================
interface HubTournament {
  slug: string;
  name: string;
  shortName: string | null;
  logo: string | null;
  kind: "anchor" | "seasonal";
  status: "upcoming" | "active" | "finished";
  featured: boolean;
  sortOrder: number;
  season: number | null;
  startDate: string | null;
  endDate: string | null;
  theme: { primary?: string; accent?: string; dark?: string } | null;
  features: {
    predictions?: boolean;
    bracket?: boolean;
    scorers?: boolean;
    standings?: boolean;
    teams?: boolean;
    news?: boolean;
    entryPath?: string;
  } | null;
  apiFootballLeagueId: number | null;
}

const STATUS_LABEL: Record<HubTournament["status"], string> = {
  upcoming: "تنطلق قريبًا",
  active: "جارية الآن",
  finished: "انتهت",
};

// مسار دخول البطولة: جزيرة قائمة (entryPath) أو القالب الموحّد الجديد.
const entryOf = (t: HubTournament) =>
  t.features?.entryPath || `/sports22/competition/${t.slug}`;

// التقويم الميلادي والأرقام اللاتينية في كل التواريخ (نمط البوابة الرياضية).
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
const fmtDay = (ts: number) => dayFmt.format(new Date(ts * 1000));
const fmtTime = (ts: number) => timeFmt.format(new Date(ts * 1000));

const imgOf = (a: ArticleWithDetails) =>
  getCacheBustedImageUrl(a.imageUrl || a.thumbnailUrl, a.updatedAt);
const articleTime = (a: ArticleWithDetails) =>
  new Date(a.publishedAt || (a as any).createdAt || 0).getTime();

function liveMinute(f: SpFixture): string {
  if (f.status.code === "HT") return "الراحة";
  const e = f.status.elapsed;
  if (e == null) return f.status.label;
  return f.status.extra ? `${e}+${f.status.extra}'` : `${e}'`;
}

// ============================================================
// الغلاف — كحلي حبر بأسلوب أغلفة الدليل، مع تنقّل مرقّم.
// ============================================================
const coverDateFmt = new Intl.DateTimeFormat("ar", {
  calendar: "gregory",
  numberingSystem: "latn",
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Riyadh",
});

function Masthead22({
  liveCount,
  tournamentCount,
  onJump,
}: {
  liveCount: number;
  tournamentCount: number;
  onJump: (id: string) => void;
}) {
  const today = useMemo(() => coverDateFmt.format(new Date()), []);
  const nav = [
    { id: "s22-tournaments", num: "٠١", label: "البطولات" },
    { id: "s22-live", num: "٠٢", label: "البث المباشر" },
    { id: "s22-news", num: "٠٣", label: "الأخبار" },
  ];
  return (
    <header className="sbq-ink relative overflow-hidden">
      <RisingBars
        className="absolute -bottom-8 left-4 opacity-[0.13] sm:left-10"
        bars={[60, 100, 148, 200, 120, 168]}
        width={26}
        gap={10}
      />
      <div className="relative mx-auto max-w-[1200px] px-5 pb-0 pt-9 sm:px-8 sm:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span dir="ltr" className="sbq-mono text-[12px] tracking-[2px] text-[#4CBCFD]">
            SABQ SPORT — TOURNAMENTS HUB
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {liveCount > 0 && (
              <button
                type="button"
                onClick={() => onJump("s22-live-now")}
                className="inline-flex items-center gap-2 rounded-full bg-[#DD5C5C] px-4 py-1.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                data-testid="s22-live-chip"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> {liveCount} مباشر
                الآن
              </button>
            )}
            <span className="text-[12px] text-[#5A7186]">
              {today} · الرياض <span dir="ltr" className="sbq-mono">GMT+3</span>
            </span>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-6 sm:mt-10">
          <div className="max-w-xl">
            <div className="mb-3 text-[14px] font-semibold text-[#4CBCFD]">سبق الرياضية</div>
            <h1 className="sbq-display text-[44px] font-extrabold leading-none text-white sm:text-6xl">
              هَب البطولات
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-[#8CA3B5] sm:text-[17px]">
              دوري روشن أساسٌ دائم، والبطولات الموسمية تنضمّ في موسمها — مباريات وترتيب
              وهدّافون وبثّ مباشر، من بوابة واحدة.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 pb-1">
            <span dir="ltr" className="sbq-mono text-[13px] text-[#5A7186]">
              {liveCount > 0 && <span className="text-[#DD5C5C]">{liveCount} LIVE · </span>}
              {tournamentCount} TOURNAMENTS
            </span>
          </div>
        </div>

        <nav className="mt-8 flex flex-wrap gap-x-7 gap-y-2 border-t border-white/10 py-4 text-[13.5px] sm:mt-10">
          {nav.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onJump(n.id)}
              className="group inline-flex items-center gap-1.5 text-[#CFE0EC] transition-colors hover:text-white"
            >
              <span className="sbq-mono text-[12px] text-[#4CBCFD]">{n.num}</span> {n.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

// ============================================================
// شريط «مباشر الآن» — كل المباريات الجارية عبر كل البطولات.
// ============================================================
function TeamScoreRow({ team, goal }: { team: SpTeam; goal: number | null }) {
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
      <span className="sbq-mono shrink-0 text-base font-bold text-foreground">{goal ?? 0}</span>
    </div>
  );
}

function LiveNowStrip({ items, onOpen }: { items: SpLiveItem[]; onOpen: (id: number) => void }) {
  if (items.length === 0) return null;
  return (
    <div id="s22-live-now" className="scroll-mt-16 border-b border-border bg-destructive/[0.05]">
      <div className="mx-auto max-w-[1200px] px-5 py-3.5 sm:px-8">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-destructive">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> مباشر الآن
          </span>
          <span className="sbq-mono text-[11px] font-bold text-muted-foreground">
            {items.length} مباراة
          </span>
        </div>
        <div className="scrollbar-hide flex gap-2.5 overflow-x-auto pb-1">
          {items.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpen(f.id)}
              className="sbq-card-hover w-[212px] shrink-0 rounded-2xl border border-border bg-card p-3 text-right"
              data-testid={`s22-live-${f.id}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="max-w-[120px] truncate text-[10px] font-bold text-muted-foreground">
                  {f.competition}
                </span>
                <span className="sbq-mono inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-destructive">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />{" "}
                  {liveMinute(f)}
                </span>
              </div>
              <TeamScoreRow team={f.home} goal={f.goals.home} />
              <TeamScoreRow team={f.away} goal={f.goals.away} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// صفوف المباريات داخل بوابة البطولة.
// ============================================================
function GateMatchRow({ f, onOpen }: { f: SpFixture; onOpen: (id: number) => void }) {
  const finished = f.status.finished;
  return (
    <button
      type="button"
      onClick={() => onOpen(f.id)}
      className="flex w-full items-center gap-3 rounded-[10px] border border-border bg-card px-3 py-2.5 text-right transition-colors hover:border-[#4CBCFD]/50"
      data-testid={`s22-match-${f.id}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-2">
          {f.home.logo && <img src={f.home.logo} alt="" className="h-[18px] w-[18px] shrink-0 object-contain" loading="lazy" />}
          <span className="truncate text-[13px] font-semibold text-foreground">{f.home.name}</span>
        </span>
        <span className="flex min-w-0 items-center gap-2">
          {f.away.logo && <img src={f.away.logo} alt="" className="h-[18px] w-[18px] shrink-0 object-contain" loading="lazy" />}
          <span className="truncate text-[13px] font-semibold text-foreground">{f.away.name}</span>
        </span>
      </div>
      {finished ? (
        <div className="sbq-mono flex shrink-0 flex-col items-center text-[15px] font-bold leading-tight text-foreground">
          <span>{f.goals.home ?? 0}</span>
          <span>{f.goals.away ?? 0}</span>
        </div>
      ) : f.status.live ? (
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="sbq-mono text-[11px] font-bold text-destructive">{liveMinute(f)}</span>
          <span className="sbq-mono text-[15px] font-bold text-foreground">
            {f.goals.home ?? 0} - {f.goals.away ?? 0}
          </span>
        </div>
      ) : (
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="sbq-mono text-[11px] text-muted-foreground">{fmtDay(f.timestamp)}</span>
          <span className="sbq-mono text-[12px] font-bold text-accent-foreground">
            {fmtTime(f.timestamp)}
          </span>
        </div>
      )}
    </button>
  );
}

// ============================================================
// بوابة البطولة — بطاقة لكل بطولة مرئية: هوية + مباريات قادمة + آخر النتائج
// + مؤشر سريع (متصدّر/هدّاف) + زر دخول البطولة.
// ============================================================
interface MatchesResp {
  configured: boolean;
  live: SpFixture[];
  today: SpFixture[];
  upcoming: SpFixture[];
  results: SpFixture[];
}

function TournamentGate({
  t,
  onOpen,
}: {
  t: HubTournament;
  onOpen: (id: number) => void;
}) {
  const isAnchor = t.kind === "anchor";
  const accent = t.theme?.primary || "#4CBCFD";

  // بيانات المباريات — فقط للبطولات المسجّلة لدى API-Football (slug معروف للخدمة).
  const canFetch = t.apiFootballLeagueId != null;
  const { data: matchesData } = useQuery<MatchesResp>({
    queryKey: [`/api/sports/${t.slug}/matches`],
    enabled: canFetch,
    staleTime: 60_000,
    retry: false,
  });

  const { data: standingsData } = useQuery<{ standings: SpStandingRow[] }>({
    queryKey: [`/api/sports/${t.slug}/standings`],
    enabled: canFetch && Boolean(t.features?.standings),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data: scorersData } = useQuery<{ scorers: SpScorer[] }>({
    queryKey: [`/api/sports/${t.slug}/scorers`],
    enabled: canFetch && Boolean(t.features?.scorers),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const live = matchesData?.live ?? [];
  const upcoming = useMemo(() => {
    const todayNotStarted = (matchesData?.today ?? []).filter((f) => !f.status.finished);
    return [...todayNotStarted, ...(matchesData?.upcoming ?? [])].slice(0, isAnchor ? 5 : 3);
  }, [matchesData, isAnchor]);
  const results = (matchesData?.results ?? []).slice(0, isAnchor ? 3 : 2);
  const leader = standingsData?.standings?.[0];
  const topScorer = scorersData?.scorers?.[0];

  return (
    <article
      className={`sbq-card-hover relative overflow-hidden rounded-[24px] border border-border bg-card ${
        isAnchor ? "lg:col-span-2" : ""
      }`}
      data-testid={`s22-gate-${t.slug}`}
    >
      {/* لمسة هوية البطولة — خط علوي بلون البطولة (الأزرق افتراضًا) */}
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />

      <div className="p-5 sm:p-6">
        {/* ترويسة البطولة */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {t.logo ? (
              <img src={t.logo} alt="" className="h-10 w-10 shrink-0 object-contain" loading="lazy" />
            ) : (
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `${accent}1c` }}
              >
                <Trophy className="h-5 w-5" style={{ color: accent }} strokeWidth={1.8} />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="sbq-display truncate text-lg font-bold text-foreground sm:text-xl">
                {t.name}
              </h3>
              <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                {isAnchor && (
                  <span className="inline-flex items-center gap-1 font-bold text-accent-foreground">
                    <Star className="h-3 w-3 fill-current" /> الأساس الدائم
                  </span>
                )}
                {t.season && <span className="sbq-mono" dir="ltr">{t.season}/{(t.season + 1) % 100}</span>}
                <span
                  className={
                    live.length > 0
                      ? "font-bold text-destructive"
                      : t.status === "active"
                        ? "font-bold text-emerald-600 dark:text-emerald-400"
                        : ""
                  }
                >
                  {live.length > 0 ? "مباراة جارية الآن" : STATUS_LABEL[t.status]}
                </span>
              </div>
            </div>
          </div>
          <Link
            href={entryOf(t)}
            className="sbq-action inline-flex shrink-0 items-center gap-1 rounded-[10px] px-4 py-2 text-[13px] font-bold"
            data-testid={`s22-enter-${t.slug}`}
          >
            دخول البطولة <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
          </Link>
        </div>

        {/* مؤشرات سريعة: المتصدّر / الهدّاف */}
        {(leader || topScorer) && (
          <div className={`mb-4 grid gap-2.5 ${leader && topScorer ? "sm:grid-cols-2" : ""}`}>
            {leader && (
              <div className="flex items-center gap-2.5 rounded-[10px] bg-secondary px-3 py-2.5">
                <Crown className="h-4 w-4 shrink-0 text-accent-foreground" strokeWidth={1.8} />
                <span className="text-[11px] text-muted-foreground">المتصدّر</span>
                {leader.team.logo && (
                  <img src={leader.team.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />
                )}
                <span className="truncate text-[13px] font-bold text-foreground">
                  {leader.team.name}
                </span>
                <span className="sbq-mono mr-auto shrink-0 text-[12px] font-bold text-accent-foreground">
                  {leader.points} ن
                </span>
              </div>
            )}
            {topScorer && (
              <div className="flex items-center gap-2.5 rounded-[10px] bg-secondary px-3 py-2.5">
                <Target className="h-4 w-4 shrink-0 text-accent-foreground" strokeWidth={1.8} />
                <span className="text-[11px] text-muted-foreground">الهدّاف</span>
                <span className="truncate text-[13px] font-bold text-foreground">
                  {topScorer.name}
                </span>
                <span className="sbq-mono mr-auto shrink-0 text-[12px] font-bold text-accent-foreground">
                  {topScorer.goals} هدفًا
                </span>
              </div>
            )}
          </div>
        )}

        {/* المباريات: جارية ثم قادمة + آخر النتائج */}
        {canFetch && (live.length > 0 || upcoming.length > 0 || results.length > 0) ? (
          <div className={`grid gap-4 ${isAnchor ? "lg:grid-cols-2" : ""}`}>
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.8} /> المباريات القادمة
              </div>
              <div className="space-y-1.5">
                {live.map((f) => (
                  <GateMatchRow key={f.id} f={f} onOpen={onOpen} />
                ))}
                {upcoming.map((f) => (
                  <GateMatchRow key={f.id} f={f} onOpen={onOpen} />
                ))}
                {live.length === 0 && upcoming.length === 0 && (
                  <p className="rounded-[10px] bg-secondary px-3 py-3 text-center text-[12px] text-muted-foreground">
                    لا مباريات مجدولة حاليًا
                  </p>
                )}
              </div>
            </div>
            {results.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" strokeWidth={1.8} /> آخر النتائج
                </div>
                <div className="space-y-1.5">
                  {results.map((f) => (
                    <GateMatchRow key={f.id} f={f} onOpen={onOpen} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          !canFetch && (
            <p className="rounded-[10px] bg-secondary px-3 py-3 text-center text-[13px] text-muted-foreground">
              التغطية الكاملة داخل صفحة البطولة
            </p>
          )
        )}
      </div>
    </article>
  );
}

// ============================================================
// البث العالمي — أبرز مباريات اليوم عالميًا + رابط /sports/live.
// ============================================================
function GlobalLiveSection({
  today,
  onOpen,
}: {
  today: SpLiveItem[];
  onOpen: (id: number) => void;
}) {
  const shown = today.slice(0, 8);
  return (
    <section id="s22-live" className="scroll-mt-16 bg-secondary/60">
      <div className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
        <SectionHead
          en="02 — WORLD LIVE"
          title="البث المباشر العالمي"
          subtitle="أبرز مباريات اليوم في الدوريات العالمية — والبث الكامل بالدول والقنوات."
          action={
            <Link
              href="/sports/live"
              className="sbq-action inline-flex items-center gap-1.5 rounded-[10px] px-5 py-2.5 text-[13.5px] font-bold"
              data-testid="s22-live-all"
            >
              <Radio className="h-4 w-4" strokeWidth={1.8} /> شاشة البث الكاملة
            </Link>
          }
        />
        {shown.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            لا مباريات عالمية اليوم — تابع شاشة البث لجدول الأسبوع.
          </p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {shown.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onOpen(f.id)}
                className="sbq-card-hover rounded-2xl border border-border bg-card p-3 text-right"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="max-w-[130px] truncate text-[10px] font-bold text-muted-foreground">
                    {f.competition}
                  </span>
                  {f.status.live ? (
                    <span className="sbq-mono inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-destructive">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />{" "}
                      {liveMinute(f)}
                    </span>
                  ) : (
                    <span className="sbq-mono shrink-0 text-[11px] text-muted-foreground">
                      {f.status.finished ? "انتهت" : fmtTime(f.timestamp)}
                    </span>
                  )}
                </div>
                <TeamScoreRow team={f.home} goal={f.goals.home} />
                <TeamScoreRow team={f.away} goal={f.goals.away} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// الأخبار الرياضية — hero + شبكة (نفس مصدر القسم الحالي، لا كسر له).
// ============================================================
function NewsSection({ articles }: { articles: ArticleWithDetails[] }) {
  if (articles.length === 0) return null;
  const [hero, ...rest] = articles;
  const grid = rest.slice(0, 6);
  const heroImg = imgOf(hero);
  return (
    <section id="s22-news" className="scroll-mt-16">
      <div className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
        <SectionHead
          en="03 — NEWS"
          title="الأخبار الرياضية"
          subtitle="آخر التغطيات التحريرية من قسم الرياضة."
        />
        <div className="grid gap-5 lg:grid-cols-5">
          <Link
            href={`/article/${hero.englishSlug || hero.slug}`}
            className="group relative block h-[300px] overflow-hidden rounded-[24px] border border-border bg-card lg:col-span-3 lg:h-[420px]"
          >
            {heroImg && (
              <>
                <div className="absolute inset-0">
                  <OptimizedImage
                    src={heroImg}
                    alt={hero.title}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    wrapperClassName="w-full h-full"
                    objectPosition={getObjectPosition(hero)}
                  />
                </div>
                <div className="sbq-hero-overlay absolute inset-0" />
              </>
            )}
            <div className="absolute inset-x-0 bottom-0 p-6">
              <div className="mb-3 flex items-center gap-2.5">
                {hero.newsType === "breaking" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#DD5C5C] px-3 py-1 text-[11px] font-bold text-white">
                    <Flame className="h-3 w-3" strokeWidth={1.8} /> عاجل
                  </span>
                ) : (
                  <span className="sbq-action inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold">
                    <Trophy className="h-3 w-3" strokeWidth={1.8} /> الأبرز
                  </span>
                )}
                <span className="sbq-mono flex items-center gap-1 text-[11px] text-white/75">
                  <Clock className="h-3 w-3" strokeWidth={1.8} />
                  {timeAgo(hero.publishedAt)}
                </span>
              </div>
              <h3 className="sbq-display text-xl font-bold leading-snug text-white line-clamp-3 sm:text-3xl">
                {hero.title}
              </h3>
            </div>
          </Link>
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-1">
            {grid.slice(0, 4).map((a) => (
              <Link
                key={a.id}
                href={`/article/${a.englishSlug || a.slug}`}
                className="sbq-card-hover group flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
              >
                {imgOf(a) && (
                  <div className="h-[72px] w-[104px] shrink-0 overflow-hidden rounded-[10px]">
                    <OptimizedImage
                      src={imgOf(a)!}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      wrapperClassName="w-full h-full"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="text-[13.5px] font-bold leading-relaxed text-foreground line-clamp-2 transition-colors group-hover:text-accent-foreground">
                    {a.title}
                  </h4>
                  <span className="sbq-mono mt-1.5 block text-[10.5px] text-muted-foreground">
                    {timeAgo(a.publishedAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// الصفحة
// ============================================================
export default function Sports22() {
  useBrandFonts();
  useCanonical("https://sabq.org/sports22");
  const [openMatch, setOpenMatch] = useState<number | null>(null);

  const { data: tournamentsData, isLoading: tournamentsLoading } = useQuery<{
    tournaments: HubTournament[];
  }>({
    queryKey: ["/api/sports/tournaments"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const tournaments = tournamentsData?.tournaments ?? [];

  const { data: liveData } = useQuery<{ live: SpLiveItem[] }>({
    queryKey: ["/api/sports/live"],
    refetchInterval: 7_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const liveItems = liveData?.live ?? [];

  const { data: todayData } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today"],
    staleTime: 60_000,
    refetchInterval: (q) =>
      (q.state.data as any)?.today?.some((f: SpLiveItem) => f.status.live) ? 30_000 : 120_000,
    refetchIntervalInBackground: false,
  });
  const todayItems = todayData?.today ?? [];

  const { data: newsRaw } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/categories", "sports", "articles"],
  });
  const news = useMemo(() => {
    const list = Array.isArray(newsRaw) ? newsRaw : [];
    return [...list].sort((a, b) => articleTime(b) - articleTime(a));
  }, [newsRaw]);

  const onJump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="sbq-sport min-h-screen bg-background" dir="rtl">
      <style>{BRAND_CSS}</style>
      <Header />
      <Masthead22
        liveCount={liveItems.length}
        tournamentCount={tournaments.length}
        onJump={onJump}
      />
      <LiveNowStrip items={liveItems} onOpen={setOpenMatch} />

      <main>
        {/* ٠١ — بوابات البطولات */}
        <section id="s22-tournaments" className="scroll-mt-16">
          <div className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
            <SectionHead
              en="01 — TOURNAMENTS"
              title="البطولات"
              subtitle="روشن أولًا دائمًا — والبطولات الموسمية تظهر تلقائيًا في موسمها."
            />
            {tournamentsLoading ? (
              <div className="grid gap-5 lg:grid-cols-2">
                <Skeleton className="h-72 rounded-[24px] lg:col-span-2" />
                <Skeleton className="h-64 rounded-[24px]" />
                <Skeleton className="h-64 rounded-[24px]" />
              </div>
            ) : tournaments.length === 0 ? (
              <p className="rounded-2xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
                لا بطولات مفعّلة حاليًا.
              </p>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {tournaments.map((t) => (
                  <TournamentGate key={t.slug} t={t} onOpen={setOpenMatch} />
                ))}
              </div>
            )}
          </div>
        </section>

        <GlobalLiveSection today={todayItems} onOpen={setOpenMatch} />
        <NewsSection articles={news} />
      </main>

      <Footer />
      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
    </div>
  );
}
