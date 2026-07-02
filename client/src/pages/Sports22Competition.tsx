/**
 * قالب البطولة الموحّد — /sports22/competition/:slug (Sabq Sports 2.0).
 *
 * قالب واحد يخدم كل البطولات حسب `features` من سجلّ البطولات:
 *  - Hero بهوية البطولة (لون theme فوق هوية سبق) + الحالة/الموسم/العدّاد.
 *  - المباريات: مباشر/اليوم/قادمة/نتائج + متصفّح الجولات (MatchHub الموجود)،
 *    ومركز المباراة الكامل عبر MatchDialog (تشكيلات/أحداث/إحصاءات/H2H/قنوات).
 *  - الترتيب للدوريات (StandingsTable + TitleRace) أو «مسار الأدوار» للكؤوس
 *    (تجميع المباريات حسب الجولة — تعميم خفيف بدل شجرة المونديال المتخصّصة).
 *  - الفرق: شبكة فرق البطولة → صفحات الفرق القائمة (/sports/team/:id).
 *  - الهدّافون وصنّاع الأهداف (PodiumCard الموجود).
 *  - أخبار البطولة: مقالات قسم الرياضة المطابقة لاسم البطولة.
 *
 * الظهور يحكمه الداشبورد: بطولة مخفيّة/غير معروفة → تحويل للهب (/sports22)،
 * وجزيرة قائمة (entryPath مثل آسيا/خليجي/المونديال) → تحويل لصفحتها.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Shield, Trophy } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Skeleton } from "@/components/ui/skeleton";
import { getCacheBustedImageUrl } from "@/lib/imageUtils";
import type { ArticleWithDetails } from "@shared/schema";
import {
  MatchDialog,
  MatchHub,
  PodiumCard,
  StandingsTable,
  TitleRace,
  timeAgo,
  type SpAssister,
  type SpFixture,
  type SpScorer,
  type SpStandingRow,
} from "./SportsHub";
import { BRAND_CSS, RisingBars, SectionHead, useBrandFonts } from "./SportsBrand";

interface HubTournament {
  slug: string;
  name: string;
  shortName: string | null;
  logo: string | null;
  kind: "anchor" | "seasonal";
  status: "upcoming" | "active" | "finished";
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

interface MatchesResp {
  configured: boolean;
  live: SpFixture[];
  today: SpFixture[];
  upcoming: SpFixture[];
  results: SpFixture[];
}

const STATUS_LABEL: Record<HubTournament["status"], string> = {
  upcoming: "تنطلق قريبًا",
  active: "جارية الآن",
  finished: "انتهت",
};

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

const imgOf = (a: ArticleWithDetails) =>
  getCacheBustedImageUrl(a.imageUrl || a.thumbnailUrl, a.updatedAt);

// ============================================================
// مسار الأدوار (للكؤوس) — تجميع مباريات البطولة حسب الجولة، تُقرأ من
// الأقدم للأحدث، وكل مباراة تفتح مركزها الكامل.
// ============================================================
function KnockoutPath({
  fixtures,
  onOpen,
}: {
  fixtures: SpFixture[];
  onOpen: (id: number) => void;
}) {
  const rounds = useMemo(() => {
    const map = new Map<string, SpFixture[]>();
    for (const f of fixtures) {
      const key = f.round || "أخرى";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries())
      .map(([round, list]) => ({
        round,
        list: [...list].sort((a, b) => a.timestamp - b.timestamp),
        first: Math.min(...list.map((f) => f.timestamp)),
      }))
      .sort((a, b) => a.first - b.first);
  }, [fixtures]);

  if (rounds.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">
        مسار الأدوار يظهر فور اعتماد جدول البطولة.
      </div>
    );
  }

  return (
    <div className="scrollbar-hide flex gap-4 overflow-x-auto pb-2">
      {rounds.map((r) => (
        <div key={r.round} className="w-[280px] shrink-0">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="sbq-mono text-[11px] font-bold text-accent-foreground">
              {r.list.length}
            </span>
            <h4 className="truncate text-[13.5px] font-bold text-foreground">{r.round}</h4>
          </div>
          <div className="space-y-2">
            {r.list.map((f) => {
              const decided = f.status.finished;
              const homeWin = Boolean(
                decided &&
                  ((f.goals.home ?? 0) > (f.goals.away ?? 0) ||
                    (f.penalties && (f.penalties.home ?? 0) > (f.penalties.away ?? 0))),
              );
              const awayWin = Boolean(
                decided &&
                  ((f.goals.away ?? 0) > (f.goals.home ?? 0) ||
                    (f.penalties && (f.penalties.away ?? 0) > (f.penalties.home ?? 0))),
              );
              const row = (team: SpFixture["home"], goals: number | null, win: boolean | null) => (
                <div className="flex items-center justify-between gap-2 py-0.5">
                  <span className="flex min-w-0 items-center gap-2">
                    {team.logo && (
                      <img src={team.logo} alt="" className="h-[18px] w-[18px] shrink-0 object-contain" loading="lazy" />
                    )}
                    <span
                      className={`truncate text-[13px] ${
                        win ? "font-extrabold text-foreground" : decided ? "text-muted-foreground" : "font-semibold text-foreground"
                      }`}
                    >
                      {team.name}
                    </span>
                  </span>
                  <span className="sbq-mono shrink-0 text-[14px] font-bold text-foreground">
                    {decided || f.status.live ? goals ?? 0 : ""}
                  </span>
                </div>
              );
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onOpen(f.id)}
                  className="w-full rounded-[10px] border border-border bg-card px-3 py-2.5 text-right transition-colors hover:border-[#4CBCFD]/50"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="sbq-mono text-[10.5px] text-muted-foreground">
                      {dayFmt.format(new Date(f.timestamp * 1000))}
                    </span>
                    {f.status.live ? (
                      <span className="sbq-mono inline-flex items-center gap-1 text-[10.5px] font-bold text-destructive">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" /> مباشر
                      </span>
                    ) : (
                      <span className="sbq-mono text-[10.5px] text-muted-foreground">
                        {decided ? "انتهت" : timeFmt.format(new Date(f.timestamp * 1000))}
                      </span>
                    )}
                  </div>
                  {row(f.home, f.goals.home, homeWin)}
                  {row(f.away, f.goals.away, awayWin)}
                  {f.penalties && (f.penalties.home != null || f.penalties.away != null) && (
                    <div className="sbq-mono mt-1 text-[10.5px] text-muted-foreground">
                      ركلات الترجيح {f.penalties.home ?? 0} - {f.penalties.away ?? 0}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// فرق البطولة — من الترتيب إن وُجد، وإلا تُشتق من مباريات البطولة.
// ============================================================
function TeamsGrid({
  standings,
  fixtures,
}: {
  standings: SpStandingRow[];
  fixtures: SpFixture[];
}) {
  const teams = useMemo(() => {
    if (standings.length > 0)
      return standings.map((r) => ({ id: r.team.id, name: r.team.name, logo: r.team.logo }));
    const map = new Map<number, { id: number; name: string; logo: string }>();
    for (const f of fixtures) {
      for (const t of [f.home, f.away]) {
        if (t.id && !map.has(t.id)) map.set(t.id, { id: t.id, name: t.name, logo: t.logo });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [standings, fixtures]);

  if (teams.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">
        قائمة الفرق تظهر فور اعتماد المشاركين.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {teams.map((t) => (
        <Link
          key={t.id}
          href={`/sports/team/${t.id}`}
          className="sbq-card-hover group flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-5 text-center"
          data-testid={`s22-team-${t.id}`}
        >
          {t.logo ? (
            <img src={t.logo} alt="" className="h-12 w-12 object-contain" loading="lazy" />
          ) : (
            <Shield className="h-12 w-12 text-muted-foreground" strokeWidth={1.2} />
          )}
          <span className="text-[13px] font-bold leading-snug text-foreground transition-colors group-hover:text-accent-foreground">
            {t.name}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ============================================================
// أخبار البطولة — مقالات قسم الرياضة المطابقة لاسم/اسم البطولة المختصر.
// ============================================================
function TournamentNews({ t }: { t: HubTournament }) {
  const { data: newsRaw } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/categories", "sports", "articles"],
  });
  const items = useMemo(() => {
    const list = Array.isArray(newsRaw) ? newsRaw : [];
    const needles = [t.shortName, t.name]
      .filter(Boolean)
      .map((s) => String(s).replace(/^(كأس|دوري|بطولة)\s+/, ""));
    return list
      .filter((a) => needles.some((n) => n && (a.title?.includes(n) || (a as any).excerpt?.includes?.(n))))
      .slice(0, 6);
  }, [newsRaw, t]);

  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8">
      <SectionHead en="NEWS" title={`أخبار ${t.shortName || t.name}`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a) => (
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
    </section>
  );
}

// ============================================================
// الصفحة
// ============================================================
export default function Sports22Competition() {
  useBrandFonts();
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "pro-league";
  const [, navigate] = useLocation();
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  useCanonical(`https://sabq.org/sports22/competition/${slug}`);

  const { data: tournamentsData, isLoading: tLoading } = useQuery<{
    tournaments: HubTournament[];
  }>({
    queryKey: ["/api/sports/tournaments"],
    staleTime: 30_000,
  });
  const t = tournamentsData?.tournaments?.find((x) => x.slug === slug) ?? null;

  // بطولة مخفية/غير معروفة → الهب. جزيرة قائمة → صفحتها الحالية.
  useEffect(() => {
    if (tLoading) return;
    if (!t) {
      navigate("/sports22", { replace: true });
      return;
    }
    if (t.features?.entryPath) navigate(t.features.entryPath, { replace: true });
  }, [tLoading, t, navigate]);

  const features = t?.features ?? {};
  const isLeague = Boolean(features.standings);
  const accent = t?.theme?.primary || "#4CBCFD";

  const { data: matchesData } = useQuery<MatchesResp>({
    queryKey: [`/api/sports/${slug}/matches`],
    enabled: Boolean(t) && !t?.features?.entryPath,
    staleTime: 60_000,
    refetchInterval: (q) =>
      (q.state.data as any)?.live?.length > 0 ? 15_000 : 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const { data: standingsData } = useQuery<{ standings: SpStandingRow[] }>({
    queryKey: [`/api/sports/${slug}/standings`],
    enabled: Boolean(t) && isLeague,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const { data: scorersData } = useQuery<{ scorers: SpScorer[] }>({
    queryKey: [`/api/sports/${slug}/scorers`],
    enabled: Boolean(t) && Boolean(features.scorers),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const { data: assistsData } = useQuery<{ assists: SpAssister[] }>({
    queryKey: [`/api/sports/${slug}/assists`],
    enabled: Boolean(t) && Boolean(features.scorers),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const allFixtures = useMemo(() => {
    if (!matchesData) return [] as SpFixture[];
    return [
      ...matchesData.live,
      ...matchesData.today,
      ...matchesData.upcoming,
      ...matchesData.results,
    ];
  }, [matchesData]);

  const standings = standingsData?.standings ?? [];
  const scorers = scorersData?.scorers ?? [];
  const assists = assistsData?.assists ?? [];
  const liveCount = matchesData?.live.length ?? 0;

  const nextMatch = useMemo(() => {
    const now = Date.now() / 1000;
    return [...(matchesData?.today ?? []), ...(matchesData?.upcoming ?? [])]
      .filter((f) => !f.status.finished && !f.status.live && f.timestamp > now)
      .sort((a, b) => a.timestamp - b.timestamp)[0];
  }, [matchesData]);

  if (tLoading || !t || t.features?.entryPath) {
    return (
      <div className="sbq-sport min-h-screen bg-background" dir="rtl">
        <style>{BRAND_CSS}</style>
        <Header />
        <div className="mx-auto max-w-[1200px] space-y-5 px-5 py-10 sm:px-8">
          <Skeleton className="h-56 rounded-[24px]" />
          <Skeleton className="h-80 rounded-[24px]" />
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="sbq-sport min-h-screen bg-background" dir="rtl">
      <style>{BRAND_CSS}</style>
      <Header />

      {/* Hero بهوية البطولة */}
      <header className="sbq-ink relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
        <RisingBars
          className="absolute -bottom-8 left-4 opacity-[0.13] sm:left-10"
          bars={[60, 100, 148, 200, 120]}
          width={24}
          gap={9}
        />
        <div className="relative mx-auto max-w-[1200px] px-5 py-10 sm:px-8 sm:py-14">
          <nav className="mb-6 flex items-center gap-2 text-[12.5px] text-[#8CA3B5]">
            <Link href="/sports22" className="transition-colors hover:text-white">
              هَب البطولات
            </Link>
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="text-[#CFE0EC]">{t.shortName || t.name}</span>
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex min-w-0 items-center gap-4">
              {t.logo ? (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white p-2 sm:h-20 sm:w-20">
                  <img src={t.logo} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl sm:h-20 sm:w-20"
                  style={{ background: `${accent}26` }}
                >
                  <Trophy className="h-8 w-8" style={{ color: accent }} strokeWidth={1.6} />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="sbq-display text-3xl font-extrabold leading-tight text-white sm:text-5xl">
                  {t.name}
                </h1>
                <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[13px] text-[#8CA3B5]">
                  {t.season && (
                    <span className="sbq-mono" dir="ltr">
                      {t.season}/{(t.season + 1) % 100}
                    </span>
                  )}
                  <span
                    className={
                      liveCount > 0
                        ? "inline-flex items-center gap-1.5 font-bold text-[#DD5C5C]"
                        : "text-[#CFE0EC]"
                    }
                  >
                    {liveCount > 0 && (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#DD5C5C]" />
                    )}
                    {liveCount > 0 ? `${liveCount} مباراة جارية الآن` : STATUS_LABEL[t.status]}
                  </span>
                </div>
              </div>
            </div>
            {nextMatch && (
              <button
                type="button"
                onClick={() => setOpenMatch(nextMatch.id)}
                className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3.5 text-right transition-colors hover:bg-white/10"
                data-testid="s22-next-match"
              >
                <div className="mb-1.5 text-[11px] font-bold text-[#4CBCFD]">المباراة القادمة</div>
                <div className="flex items-center gap-2 text-[13.5px] font-bold text-white">
                  {nextMatch.home.logo && (
                    <img src={nextMatch.home.logo} alt="" className="h-5 w-5 object-contain" />
                  )}
                  <span className="max-w-[110px] truncate">{nextMatch.home.name}</span>
                  <span className="sbq-mono text-[#5A7186]">×</span>
                  <span className="max-w-[110px] truncate">{nextMatch.away.name}</span>
                  {nextMatch.away.logo && (
                    <img src={nextMatch.away.logo} alt="" className="h-5 w-5 object-contain" />
                  )}
                </div>
                <div className="sbq-mono mt-1.5 text-[11.5px] text-[#8CA3B5]">
                  {dayFmt.format(new Date(nextMatch.timestamp * 1000))} ·{" "}
                  {timeFmt.format(new Date(nextMatch.timestamp * 1000))}
                </div>
              </button>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* المباريات */}
        <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8">
          <SectionHead
            en="MATCHES"
            title="المباريات"
            subtitle="مباشر واليوم والقادمة والنتائج — وكل مباراة تفتح مركزها الكامل."
          />
          <MatchHub
            data={{
              live: matchesData?.live ?? [],
              today: matchesData?.today ?? [],
              upcoming: matchesData?.upcoming ?? [],
              results: matchesData?.results ?? [],
            }}
            configured={matchesData?.configured ?? false}
            compSlug={slug}
            onOpen={setOpenMatch}
          />
        </section>

        {/* الترتيب أو مسار الأدوار */}
        {isLeague ? (
          <section className="bg-secondary/60">
            <div className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8">
              <SectionHead en="STANDINGS" title="الترتيب" />
              {standings.length > 0 ? (
                <>
                  <TitleRace rows={standings} />
                  <StandingsTable rows={standings} />
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">
                  جدول الترتيب يظهر مع انطلاق الموسم.
                </div>
              )}
            </div>
          </section>
        ) : (
          Boolean(features.bracket) && (
            <section className="bg-secondary/60">
              <div className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8">
                <SectionHead
                  en="KNOCKOUT PATH"
                  title="مسار الأدوار"
                  subtitle="مباريات البطولة دورًا بدور حتى النهائي."
                />
                <KnockoutPath fixtures={allFixtures} onOpen={setOpenMatch} />
              </div>
            </section>
          )
        )}

        {/* الفرق */}
        {Boolean(features.teams) && (
          <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8">
            <SectionHead
              en="TEAMS"
              title="الفرق"
              subtitle="ادخل صفحة الفريق: التشكيلة، الإصابات، الانتقالات، والإحصاءات."
            />
            <TeamsGrid standings={standings} fixtures={allFixtures} />
          </section>
        )}

        {/* الهدّافون وصنّاع الأهداف */}
        {Boolean(features.scorers) && (scorers.length > 0 || assists.length > 0) && (
          <section className="bg-secondary/60">
            <div className="mx-auto max-w-[1200px] space-y-10 px-5 py-12 sm:px-8">
              {scorers.length > 0 && (
                <div>
                  <SectionHead en="TOP SCORERS" title="الهدّافون" />
                  <PodiumCard
                    entries={scorers.map((s) => ({
                      rank: s.rank,
                      id: s.id,
                      name: s.name,
                      photo: s.photo,
                      team: { name: s.team.name, logo: s.team.logo },
                      primary: s.goals,
                      secondary: s.assists,
                    }))}
                    primaryLabel="الأهداف"
                    secondaryLabel="صناعة"
                  />
                </div>
              )}
              {assists.length > 0 && (
                <div>
                  <SectionHead en="TOP ASSISTS" title="صنّاع الأهداف" />
                  <PodiumCard
                    entries={assists.map((s) => ({
                      rank: s.rank,
                      id: s.id,
                      name: s.name,
                      photo: s.photo,
                      team: { name: s.team.name, logo: s.team.logo },
                      primary: s.assists,
                      secondary: s.goals,
                    }))}
                    primaryLabel="صناعة الأهداف"
                    secondaryLabel="أهداف"
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* أخبار البطولة */}
        {Boolean(features.news ?? true) && <TournamentNews t={t} />}
      </main>

      <Footer />
      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
    </div>
  );
}
