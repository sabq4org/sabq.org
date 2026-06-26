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
  CalendarDays,
  ChevronLeft,
  Crown,
  Flame,
  Goal,
  Handshake,
  ShieldHalf,
  Square,
  Trophy,
  Users,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SportsNewsBlock } from "@/components/sports/SportsNewsBlock";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { formatNumber } from "@/lib/format";
import {
  CardLeaders,
  MatchDialog,
  MatchHub,
  PodiumCard,
  StandingsTable,
  TitleRace,
  type SpAssister,
  type SpCardLeader,
  type SpCompetition,
  type SpFixture,
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

// نظرة الموسم — تكشف المرحلة (جارٍ/ما قبل/عطلة) وبطل الموسم المنتهي والعدّ التنازلي
// للموسم القادم. تُستهلَك من /api/sports/pro-league/outlook (لا API جديد).
interface OutlookFixture {
  id: number;
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
}

interface SeasonOutlook {
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
  openers: OutlookFixture[];
}

// ---------- مساعدات ----------

const seasonLabel = (s: number | null | undefined): string => (s == null ? "" : `${s}/${s + 1}`);

// تاريخ انطلاق الموسم القادم (بلا توقيت) — لبانر العدّ التنازلي.
const outlookDateFmt = new Intl.DateTimeFormat("ar", {
  calendar: "gregory",
  numberingSystem: "latn",
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Riyadh",
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
  outlook,
  leader,
  runnerUp,
  topScorer,
}: {
  comp: SpCompetition | undefined;
  history: CompHistory | null;
  outlook: SeasonOutlook | null;
  leader: SpStandingRow | undefined;
  runnerUp: SpStandingRow | undefined;
  topScorer: SpScorer | undefined;
}) {
  // الموسم المنتهي (عطلة أو ما قبل الموسم الجديد): البطل من /outlook (متصدّر الجدول
  // النهائي) لا من /history (الذي يعطي بطل الموسم الأسبق فيظهر مربكًا بعد الختام).
  const seasonOver = outlook?.phase === "off-season" || outlook?.phase === "pre-season";
  const champion = seasonOver ? outlook?.champion ?? null : null;
  const seasonYear = outlook?.season ?? comp?.season ?? null;
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
              {seasonOver
                ? `ختام موسم ${seasonYear != null ? seasonLabel(seasonYear) : ""} — الترتيب النهائي، الهدّافون، والأرقام الكاملة في مكان واحد.`
                : "نخبة الكرة السعودية في مكان واحد — الترتيب، الهدّافون، البطاقات، والأندية، تتحدّث لحظة بلحظة."}
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

        {/* شريط الأبطال — يتكيّف حسب المرحلة:
            - الموسم منتهٍ: بطل الموسم + الوصيف + هدّاف الموسم.
            - الموسم جارٍ: حامل اللقب (الموسم الأسبق) + المتصدّر الحالي + الهدّاف. */}
        <div className="mt-9 grid gap-3 sm:grid-cols-3">
          {seasonOver && champion ? (
            <>
              <HeroStat
                icon={<Crown className="h-5 w-5" style={{ color: GOLD }} fill="currentColor" />}
                eyebrow={`بطل الدوري${seasonYear != null ? ` · موسم ${seasonLabel(seasonYear)}` : ""}`}
                logo={champion.logo}
                title={champion.name}
                gold
              />
              {runnerUp && (
                <HeroStat
                  icon={<Trophy className="h-5 w-5 text-white/80" />}
                  eyebrow="الوصيف"
                  logo={runnerUp.team.logo}
                  title={runnerUp.team.name}
                  meta={`${formatNumber(runnerUp.points)} نقطة`}
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
            </>
          ) : (
            <>
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
            </>
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

// ---------- بانر الموسم (عطلة / عدّ تنازلي للموسم الجديد) ----------

function RoshnSeasonBanner({ outlook, onOpen }: { outlook: SeasonOutlook; onOpen: (id: number) => void }) {
  if (outlook.phase === "in-season" || outlook.phase === "unknown") return null;
  const kickoffLabel = outlook.firstKickoff ? outlookDateFmt.format(new Date(outlook.firstKickoff)) : null;

  // ما قبل الموسم — العدّ التنازلي + افتتاحيات الجولة الأولى (أعلى قيمة قرب أغسطس).
  if (outlook.phase === "pre-season") {
    return (
      <section
        dir="rtl"
        className="rounded-3xl border p-5 sm:p-6"
        style={{ borderColor: `${GOLD}44`, background: `linear-gradient(105deg, ${GOLD}14, transparent 70%)` }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="shrink-0 rounded-2xl border px-5 py-2.5 text-center"
            style={{ borderColor: `${GOLD}40`, background: `${GOLD}1a` }}
          >
            <div className="text-3xl font-black leading-none tabular-nums sm:text-4xl" style={{ color: GOLD }}>
              {outlook.daysUntilKickoff ?? "—"}
            </div>
            <div className="mt-1 text-[10px] font-bold text-muted-foreground">يومًا</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>
              <Flame className="h-3.5 w-3.5" /> ينطلق موسم {outlook.nextSeason != null ? seasonLabel(outlook.nextSeason) : ""}
            </div>
            <h3 className="mt-1 text-lg font-black text-foreground sm:text-xl">العدّ التنازلي بدأ</h3>
            {kickoffLabel && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="h-4 w-4" /> أولى المباريات {kickoffLabel}
              </p>
            )}
          </div>
        </div>
        {outlook.openers.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {outlook.openers.slice(0, 6).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onOpen(f.id)}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 transition hover:border-emerald-700/40"
                data-testid={`roshn-opener-${f.id}`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {f.home.logo && <img src={f.home.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
                  <span className="truncate text-xs font-bold">{f.home.name}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">×</span>
                <span className="flex min-w-0 items-center justify-end gap-1.5">
                  <span className="truncate text-xs font-bold">{f.away.name}</span>
                  {f.away.logo && <img src={f.away.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  // عطلة — الموسم انتهى ولا جدول جديد بعد؛ شريط هادئ يؤكّد قرب الموسم الجديد.
  return (
    <section dir="rtl" className="rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="shrink-0 rounded-2xl p-3" style={{ background: `${GOLD}1f` }}>
          <Trophy className="h-7 w-7" style={{ color: GOLD }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            انتهى موسم {seasonLabel(outlook.season)}
          </div>
          <div className="mt-1 text-lg font-black text-foreground sm:text-xl">
            {outlook.nextSeason != null ? `الاستعداد لموسم ${seasonLabel(outlook.nextSeason)}` : "في انتظار الموسم الجديد"}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            ينطلق الموسم الجديد في أغسطس — يظهر الجدول والعدّ التنازلي وأولى المباريات هنا فور إعلان المواعيد.
          </p>
        </div>
      </div>
    </section>
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

// ---------- مركز المباريات (مباشر/اليوم/قادمة/النتائج + تصفّح الجولات) ----------

function MatchCenterPane({ onOpen }: { onOpen: (id: number) => void }) {
  const { data } = useQuery<{ configured: boolean; live: SpFixture[]; today: SpFixture[]; upcoming: SpFixture[]; results: SpFixture[] }>({
    queryKey: [`/api/sports/${SLUG}/matches`],
    staleTime: 60_000,
    refetchInterval: (q) => ((q.state.data?.live ?? []).length > 0 ? 15_000 : false),
  });
  const configured = data?.configured ?? true;
  const buckets = {
    live: Array.isArray(data?.live) ? data!.live : [],
    today: Array.isArray(data?.today) ? data!.today : [],
    upcoming: Array.isArray(data?.upcoming) ? data!.upcoming : [],
    results: Array.isArray(data?.results) ? data!.results : [],
  };

  return (
    <section>
      <SectionHead icon={<Trophy className="h-4 w-4" />} title="مركز المباريات" hint="مباشر · اليوم · قادمة · النتائج · الجولات" />
      <MatchHub data={buckets} configured={configured} compSlug={SLUG} onOpen={onOpen} />
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

// ---------- أرقام الموسم القياسية (محسوبة من الترتيب — بلا نقطة جديدة) ----------

function SeasonRecordsCard({ rows }: { rows: SpStandingRow[] }) {
  if (rows.length < 2) return null;
  const pick = (score: (r: SpStandingRow) => number) =>
    rows.reduce((best, r) => (score(r) > score(best) ? r : best), rows[0]);
  const bestAttack = pick((r) => r.goalsFor);
  const bestDefense = pick((r) => -r.goalsAgainst);
  const mostWins = pick((r) => r.win);
  const bestDiff = pick((r) => r.goalsDiff);

  const records: { label: string; team: SpStandingRow["team"]; value: string }[] = [
    { label: "أفضل هجوم", team: bestAttack.team, value: `${formatNumber(bestAttack.goalsFor)} هدف` },
    { label: "أفضل دفاع", team: bestDefense.team, value: `${formatNumber(bestDefense.goalsAgainst)} عليه` },
    { label: "أكثر فوزًا", team: mostWins.team, value: `${formatNumber(mostWins.win)} فوز` },
    { label: "أفضل فارق", team: bestDiff.team, value: `${bestDiff.goalsDiff > 0 ? "+" : ""}${formatNumber(bestDiff.goalsDiff)}` },
  ];

  return (
    <section>
      <SectionHead icon={<Goal className="h-4 w-4" />} title="أرقام الموسم" hint="أبرز القياسات في جدول الدوري" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {records.map((rec) => (
          <Link
            key={rec.label}
            href={`/sports/team/${rec.team.id}`}
            className="group flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: PETROL }}>{rec.label}</span>
            <span className="flex items-center gap-2">
              {rec.team.logo && <img src={rec.team.logo} alt="" className="h-8 w-8 shrink-0 object-contain" loading="lazy" />}
              <span className="line-clamp-1 text-sm font-black text-foreground">{rec.team.name}</span>
            </span>
            <span className="text-xs font-bold tabular-nums text-muted-foreground">{rec.value}</span>
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

  const { data: outlookData } = useQuery<{ outlook: SeasonOutlook | null }>({
    queryKey: [`/api/sports/${SLUG}/outlook`],
    staleTime: 30 * 60_000,
  });
  const outlook = outlookData?.outlook ?? null;

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
        <RoshnHero
          comp={comp}
          history={history}
          outlook={outlook}
          leader={standings[0]}
          runnerUp={standings[1]}
          topScorer={scorers[0]}
        />

        <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
          {outlook && <RoshnSeasonBanner outlook={outlook} onOpen={setOpenMatch} />}
          <MatchCenterPane onOpen={setOpenMatch} />

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

          {/* أرقام الموسم القياسية — محسوبة من الترتيب */}
          {standings.length > 0 && <SeasonRecordsCard rows={standings} />}

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

          {/* أخبار الدوري — تتدهور بسلاسة إن لم توجد مطابقات */}
          <SportsNewsBlock query="دوري روشن" title="أخبار دوري روشن" />

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
