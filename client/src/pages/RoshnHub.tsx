/**
 * هب دوري روشن السعودي — /roshn
 *
 * تجربة الدخول الرئيسية للبطولات السعودية: دوري روشن هو الواجهة، بهوية بصرية
 * هادئة فاخرة (بترولي عميق + كريمي + ذهبي مقتصد — لا ألوان صاخبة). صفحة واحدة
 * متدفّقة تجمع كل شيء: حامل اللقب، الجولة الحالية، الترتيب، الهدّافون وصنّاع
 * الأهداف، البطاقات (صفراء/حمراء)، الأندية، وروابط بقية البطولات السعودية.
 *
 * تستهلك نقاط /api/sports/* القائمة بالكامل (لا اعتماد خلفي جديد):
 *   /competitions · /pro-league/{history,rounds,round,standings,scorers,assists,cards}
 * وتعيد استخدام مكوّنات البوابة (StandingsTable/PodiumCard/CardLeaders/MatchDialog).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Crown,
  Goal,
  Handshake,
  ShieldHalf,
  Square,
  Trophy,
  Users,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { formatNumber } from "@/lib/format";
import {
  CardLeaders,
  MatchDialog,
  PodiumCard,
  StandingsTable,
  TitleRace,
  type SpAssister,
  type SpCardLeader,
  type SpCompetition,
  type SpScorer,
  type SpStandingRow,
} from "./SportsHub";

const SLUG = "pro-league";

// لوحة الهوية الهادئة (بترولية/كريمية/ذهبية مقتصدة) — تُستخدم في الهيرو والشارات
// الجديدة فقط؛ بقية المقاطع تستعمل رموز السمة (background/card) لتوافق الوضع الليلي.
const INK = "#0E1B26"; // فحمي مزرقّ عميق
const PETROL = "#0C463F"; // بترولي
const PETROL_DEEP = "#072E29";
const GOLD = "#C2A14D"; // ذهبي مقتصد

// ---------- أنواع محلّية ----------

interface CompHistory {
  previousSeason: number | null;
  champion: { id: number; name: string; logo: string } | null;
  topScorer: { id: number; name: string; photo: string; team: { id: number; name: string; logo: string }; goals: number } | null;
}

interface RoundFixture {
  id: number;
  date: string;
  timestamp: number;
  status: { code: string; label: string; elapsed: number | null; live: boolean; finished: boolean };
  round: string;
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
  goals: { home: number | null; away: number | null };
}

// ---------- مساعدات ----------

const seasonLabel = (s: number | null | undefined): string => (s == null ? "" : `${s}/${s + 1}`);

const kickoff = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  weekday: "short",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});

// بقية البطولات السعودية — روابط لصفحة البطولة العامة الموجودة.
const OTHER_SAUDI: { slug: string; name: string }[] = [
  { slug: "kings-cup", name: "كأس خادم الحرمين" },
  { slug: "super-cup", name: "كأس السوبر السعودي" },
  { slug: "division-1", name: "دوري يلو (الدرجة الأولى)" },
  { slug: "womens-league", name: "الدوري الممتاز للسيدات" },
];

// ---------- الهيرو + شارة حامل اللقب ----------

function RoshnHero({
  comp,
  history,
  leader,
  topScorer,
}: {
  comp: SpCompetition | undefined;
  history: CompHistory | null;
  leader: SpStandingRow | undefined;
  topScorer: SpScorer | undefined;
}) {
  return (
    <section
      dir="rtl"
      className="relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${INK} 0%, ${PETROL_DEEP} 55%, ${PETROL} 100%)` }}
    >
      {/* نسيج هندسي خفيف */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: `radial-gradient(circle at 18% 28%, ${GOLD} 1px, transparent 1px)`, backgroundSize: "26px 26px" }}
      />
      <div className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full blur-3xl" style={{ background: `${PETROL}66` }} />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-80 w-80 rounded-full blur-3xl" style={{ background: `${GOLD}22` }} />

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <Link href="/sports" className="mb-6 inline-flex items-center gap-1 text-xs font-bold text-white/55 transition hover:text-white">
          <ChevronLeft className="h-4 w-4" /> البوابة الرياضية
        </Link>

        <div className="flex flex-col items-start gap-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wide" style={{ borderColor: `${GOLD}55`, color: GOLD }}>
              <ShieldHalf className="h-3.5 w-3.5" /> الدوري السعودي للمحترفين
            </div>
            <h1 className="text-4xl font-black leading-[1.05] text-white sm:text-6xl">
              دوري <span style={{ color: GOLD }}>روشن</span>
            </h1>
            <p className="mt-3 max-w-md text-sm text-white/70 sm:text-base">
              نخبة الكرة السعودية في مكان واحد — الترتيب، الهدّافون، البطاقات، والأندية، تتحدّث لحظة بلحظة.
            </p>
            {comp?.season != null && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white/85 backdrop-blur">
                موسم {seasonLabel(comp.season)}
              </div>
            )}
          </div>

          {comp?.logo && (
            <div className="shrink-0 rounded-3xl bg-white/95 p-4 shadow-2xl ring-1 ring-white/30">
              <img src={comp.logo} alt={comp.name} className="h-24 w-24 object-contain sm:h-28 sm:w-28" />
            </div>
          )}
        </div>

        {/* شريط: حامل اللقب + المتصدّر + الهدّاف */}
        <div className="mt-9 grid gap-3 sm:grid-cols-3">
          {history?.champion && (
            <HeroStat
              icon={<Crown className="h-5 w-5" style={{ color: GOLD }} fill="currentColor" />}
              eyebrow={`حامل اللقب${history.previousSeason ? ` · ${seasonLabel(history.previousSeason)}` : ""}`}
              logo={history.champion.logo}
              title={history.champion.name}
              gold
            />
          )}
          {leader && (
            <HeroStat
              icon={<Trophy className="h-5 w-5 text-white/80" />}
              eyebrow="متصدّر الموسم الحالي"
              logo={leader.team.logo}
              title={leader.team.name}
              meta={`${formatNumber(leader.points)} نقطة`}
            />
          )}
          {topScorer && (
            <HeroStat
              icon={<Goal className="h-5 w-5 text-white/80" />}
              eyebrow="هدّاف الموسم"
              photo={topScorer.photo}
              title={topScorer.name}
              meta={`${formatNumber(topScorer.goals)} هدف`}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  icon,
  eyebrow,
  title,
  meta,
  logo,
  photo,
  gold,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  meta?: string;
  logo?: string;
  photo?: string;
  gold?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border p-3.5 backdrop-blur"
      style={{ borderColor: gold ? `${GOLD}40` : "#ffffff1f", background: gold ? `${GOLD}14` : "#ffffff0d" }}
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/95 ring-1 ring-white/40">
        {logo ? (
          <img src={logo} alt="" className="h-9 w-9 object-contain" loading="lazy" />
        ) : photo ? (
          <img src={photo} alt="" className="h-11 w-11 rounded-xl object-cover" loading="lazy" />
        ) : (
          icon
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: gold ? GOLD : "#ffffffb3" }}>
          {!logo && !photo ? null : icon}
          {eyebrow}
        </div>
        <div className="truncate text-base font-black text-white">{title}</div>
        {meta && <div className="text-xs font-bold text-white/65 tabular-nums">{meta}</div>}
      </div>
    </div>
  );
}

// ---------- عنوان مقطع ----------

function SectionHead({ icon, title, hint, href }: { icon: React.ReactNode; title: string; hint?: string; href?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${PETROL}14`, color: PETROL }}>
          {icon}
        </span>
        <div>
          <h2 className="text-lg font-black text-foreground">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {href && (
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
          الكل <ChevronLeft className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

// ---------- الجولة الحالية ----------

function RoundResultCard({ fx, onOpen }: { fx: RoundFixture; onOpen: (id: number) => void }) {
  const started = fx.status.live || fx.status.finished;
  const Side = ({ t, align }: { t: RoundFixture["home"]; align: "start" | "end" }) => (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === "end" ? "flex-row-reverse" : ""}`}>
      <span className="h-7 w-7 shrink-0 rounded-full bg-white p-0.5 ring-1 ring-border">
        {t.logo ? <img src={t.logo} alt={t.name} className="h-full w-full object-contain" loading="lazy" /> : null}
      </span>
      <span className="truncate text-sm font-bold">{t.name}</span>
    </div>
  );
  return (
    <button
      type="button"
      onClick={() => onOpen(fx.id)}
      className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-right transition hover:border-emerald-700/40 hover:shadow-sm"
      data-testid={`roshn-round-${fx.id}`}
    >
      <Side t={fx.home} align="start" />
      <div className="shrink-0 px-1 text-center" dir="ltr">
        {started ? (
          <span className="rounded-md bg-muted px-2 py-0.5 text-sm font-black tabular-nums">
            {fx.goals.home ?? 0} - {fx.goals.away ?? 0}
          </span>
        ) : (
          <span className="block text-[10px] font-semibold leading-tight text-muted-foreground">
            {kickoff.format(new Date(fx.date))}
          </span>
        )}
        {fx.status.live && (
          <span className="mt-0.5 block text-[9px] font-black text-red-600 dark:text-red-400">
            ● {fx.status.elapsed != null ? `${fx.status.elapsed}'` : "مباشر"}
          </span>
        )}
      </div>
      <Side t={fx.away} align="end" />
    </button>
  );
}

function CurrentRoundPane({ onOpen }: { onOpen: (id: number) => void }) {
  const { data: roundsData } = useQuery<{ rounds: { key: string; label: string }[]; current: string | null }>({
    queryKey: [`/api/sports/${SLUG}/rounds`],
    staleTime: 5 * 60_000,
  });
  const current = roundsData?.current ?? null;
  const label = roundsData?.rounds?.find((r) => r.key === current)?.label ?? "الجولة الحالية";

  const { data, isLoading } = useQuery<{ fixtures: RoundFixture[] }>({
    // مفتاح بكائن وسائط → دالة الجلب الافتراضية تبني ?name=... عبر apiUrl (لا fetch خام).
    queryKey: [`/api/sports/${SLUG}/round`, { name: current ?? "" }],
    enabled: Boolean(current),
    staleTime: 60_000,
    refetchInterval: (q) => ((q.state.data?.fixtures ?? []).some((f) => f.status.live) ? 15_000 : false),
  });

  const fixtures = Array.isArray(data?.fixtures) ? data!.fixtures : [];
  if (!current || (!isLoading && fixtures.length === 0)) return null;

  return (
    <section>
      <SectionHead icon={<Trophy className="h-4 w-4" />} title={label} hint="مباريات الجولة الجارية" />
      {isLoading ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {fixtures.map((fx) => (
            <RoundResultCard key={fx.id} fx={fx} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- الأندية ----------

function ClubsGrid({ rows }: { rows: SpStandingRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <SectionHead icon={<ShieldHalf className="h-4 w-4" />} title="أندية الدوري" hint={`${formatNumber(rows.length)} ناديًا`} />
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
        {rows.map((r) => (
          <Link
            key={r.team.id}
            href={`/sports/team/${r.team.id}`}
            className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 text-center transition hover:-translate-y-0.5 hover:shadow-md"
            data-testid={`roshn-club-${r.team.id}`}
          >
            <span className="grid h-14 w-14 place-items-center">
              {r.team.logo ? (
                <img src={r.team.logo} alt={r.team.name} className="h-12 w-12 object-contain transition group-hover:scale-105" loading="lazy" />
              ) : (
                <ShieldHalf className="h-9 w-9 text-muted-foreground/40" />
              )}
            </span>
            <span className="line-clamp-1 text-[11px] font-bold text-foreground">{r.team.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ---------- الصفحة ----------

export default function RoshnHub() {
  const { user } = useAuth();
  const [openMatch, setOpenMatch] = useState<number | null>(null);

  useEffect(() => {
    document.title = "دوري روشن السعودي — الترتيب والهدّافون والأندية | سبق";
  }, []);
  useCanonical("https://sabq.org/roshn");

  const { data: compsData } = useQuery<{ competitions: SpCompetition[] }>({
    queryKey: ["/api/sports/competitions"],
    staleTime: 60 * 60_000,
  });
  const comp = useMemo(
    () => (Array.isArray(compsData?.competitions) ? compsData.competitions : []).find((c) => c.slug === SLUG),
    [compsData],
  );

  const { data: historyData } = useQuery<{ history: CompHistory }>({
    queryKey: [`/api/sports/${SLUG}/history`],
    staleTime: 6 * 60 * 60_000,
  });
  const history = historyData?.history ?? null;

  const { data: standingsData, isLoading: standingsLoading } = useQuery<{ standings: SpStandingRow[] }>({
    queryKey: [`/api/sports/${SLUG}/standings`],
    staleTime: 120_000,
    refetchInterval: (q) => ((q.state.data?.standings ?? []).some((r) => r.live) ? 8_000 : false),
  });
  const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];

  const { data: scorersData } = useQuery<{ scorers: SpScorer[] }>({
    queryKey: [`/api/sports/${SLUG}/scorers`],
    staleTime: 300_000,
  });
  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];

  const { data: assistsData } = useQuery<{ assists: SpAssister[] }>({
    queryKey: [`/api/sports/${SLUG}/assists`],
    staleTime: 300_000,
  });
  const assists = Array.isArray(assistsData?.assists) ? assistsData.assists : [];

  const { data: cardsData } = useQuery<{ yellow: SpCardLeader[]; red: SpCardLeader[] }>({
    queryKey: [`/api/sports/${SLUG}/cards`],
    staleTime: 300_000,
  });
  const yellow = Array.isArray(cardsData?.yellow) ? cardsData.yellow : [];
  const red = Array.isArray(cardsData?.red) ? cardsData.red : [];

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        <RoshnHero comp={comp} history={history} leader={standings[0]} topScorer={scorers[0]} />

        <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
          <CurrentRoundPane onOpen={setOpenMatch} />

          {/* الترتيب */}
          <section>
            <SectionHead icon={<Trophy className="h-4 w-4" />} title="ترتيب الدوري" hint="سباق اللقب والمراكز" />
            {standingsLoading ? (
              <div className="h-72 animate-pulse rounded-2xl bg-muted/60" />
            ) : standings.length > 0 ? (
              <div className="space-y-5">
                <TitleRace rows={standings} />
                <StandingsTable rows={standings} />
              </div>
            ) : (
              <Empty />
            )}
          </section>

          {/* الهدّافون + صنّاع الأهداف */}
          {scorers.length > 0 && (
            <section>
              <SectionHead icon={<Goal className="h-4 w-4" />} title="الهدّافون" hint="ترتيب الهدّافين" />
              <PodiumCard
                entries={scorers.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.goals, secondary: s.assists }))}
                primaryLabel="عدد الأهداف"
                secondaryLabel="الصناعة"
              />
            </section>
          )}

          {assists.length > 0 && (
            <section>
              <SectionHead icon={<Handshake className="h-4 w-4" />} title="صنّاع الأهداف" hint="أكثر اللاعبين تمريرًا حاسمًا" />
              <PodiumCard
                entries={assists.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.assists, secondary: s.goals }))}
                primaryLabel="عدد الصناعات"
                secondaryLabel="الأهداف"
              />
            </section>
          )}

          {/* البطاقات */}
          {yellow.length > 0 && (
            <section>
              <SectionHead icon={<Square className="h-4 w-4" />} title="البطاقات" hint="الصفراء والحمراء" />
              <CardLeaders leaders={yellow} red={red} />
            </section>
          )}

          {/* الأندية */}
          <ClubsGrid rows={standings} />

          {/* بطولات سعودية أخرى */}
          <section>
            <SectionHead icon={<Users className="h-4 w-4" />} title="بطولات سعودية أخرى" />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {OTHER_SAUDI.map((c) => (
                <Link
                  key={c.slug}
                  href={`/sports/competition/${c.slug}`}
                  className="rounded-2xl border border-border bg-card px-4 py-3.5 text-center text-sm font-bold text-foreground transition hover:-translate-y-0.5 hover:shadow-md"
                  data-testid={`roshn-other-${c.slug}`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>

      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
      ستظهر بيانات دوري روشن هنا فور توفّرها.
    </div>
  );
}
