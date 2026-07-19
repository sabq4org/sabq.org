/**
 * موجز البطولات الموحّد — يغذّي رفّ «موجز البطولات» في البوابة الرياضية /sports.
 *
 * يجمّع لكل بطولة لقطة خفيفة تُلخّصها في بطاقة واحدة حسب حالتها:
 *   - جارية  → المتصدّر + الهدّاف الأول + مباريات اليوم/الجولة + المباراة القادمة.
 *   - قادمة  → عدّاد بدء الموسم + حامل اللقب (النسخة السابقة) + الافتتاحية.
 *   - منتهية → بطل + هدّاف الموسم المنتهي نفسه (لا الموسم الذي قبله).
 *
 * لا يفتح أي نداء جديد للمزوّد: يعيد استخدام دوال saudiLeagueService المخزّنة
 * (getFixtures / getStandings / getTopScorers / getCompetitionHistory) كلها خلف
 * كاش SWR، ويلفّ التجميع كاملًا في withSWR إضافي فيُحسب مرّة واحدة ويخدم الجميع.
 * ملتزم بـ ADR-001 (لا db) — كل الوصول عبر الخدمة.
 */
import pLimit from "p-limit";
import { withSWR } from "../memoryCache";
import {
  SAUDI_COMPETITIONS,
  getCompetitionHistory,
  getFixtures,
  getStandings,
  getTopScorers,
  listCompetitionsWithMeta,
  type CompetitionCategory,
  type CompetitionStatus,
  type SaudiCompetition,
  type SplFixture,
} from "./saudiLeagueService";

const RIYADH_TZ = "Asia/Riyadh";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: RIYADH_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const riyadhDayKey = (ts: number): string => dayKeyFmt.format(new Date(ts * 1000));

interface SummaryTeam {
  name: string;
  logo: string;
}

interface SummaryNextMatch {
  id: number;
  timestamp: number;
  round: string | null;
  home: SummaryTeam;
  away: SummaryTeam;
}

export interface SpCompetitionSummary {
  slug: string;
  name: string;
  category: CompetitionCategory;
  type: "league" | "cup";
  logo: string | null;
  season: number | null;
  status: CompetitionStatus;
  hasStandings: boolean;
  hasScorers: boolean;
  /** متصدّر الترتيب (للبطولات الجارية ذات الجدول). */
  leader: { id: number; name: string; logo: string; points: number } | null;
  /** الهدّاف الأول (جارية) أو هدّاف الموسم المنتهي (منتهية). */
  topScorer: { id: number; name: string; goals: number } | null;
  /** حامل اللقب/البطل (قادمة أو منتهية). */
  champion: { id: number; name: string; logo: string } | null;
  /** أيام متبقّية حتى انطلاق الموسم (قادمة فقط). */
  daysUntilKickoff: number | null;
  /** عدد المباريات الجارية الآن في البطولة. */
  liveCount: number;
  /** عدد مباريات اليوم في البطولة. */
  todayCount: number;
  /** اسم الجولة الحالية/القادمة. */
  matchday: string | null;
  /** أقرب مباراة (جارية أو قادمة) — لفتح نافذة المباراة مباشرة. */
  nextMatch: SummaryNextMatch | null;
}

const teamOf = (t: SplFixture["home"]): SummaryTeam => ({ name: t.name, logo: t.logo });
const toNextMatch = (f: SplFixture): SummaryNextMatch => ({
  id: f.id,
  timestamp: f.timestamp,
  round: f.round || null,
  home: teamOf(f.home),
  away: teamOf(f.away),
});

/** يبني لقطة بطولة واحدة حسب حالتها، بأقل عدد نداءات (كلها مخزّنة + أفضل جهد). */
async function summarizeCompetition(
  comp: SaudiCompetition,
  meta: { logo: string | null; season: number | null; status: CompetitionStatus },
): Promise<SpCompetitionSummary> {
  const now = Date.now();
  const base: SpCompetitionSummary = {
    slug: comp.slug,
    name: comp.name,
    category: comp.category,
    type: comp.type,
    logo: meta.logo,
    season: meta.season,
    status: meta.status,
    hasStandings: comp.hasStandings,
    hasScorers: comp.hasScorers,
    leader: null,
    topScorer: null,
    champion: null,
    daysUntilKickoff: null,
    liveCount: 0,
    todayCount: 0,
    matchday: null,
    nextMatch: null,
  };

  // منتهية: البطل والهدّاف من **الموسم المنتهي نفسه** (meta.season) لا الموسم الذي قبله.
  // نجلب البطل والهدّاف عبر نداءين مستقلّين مخزّنين بمفتاح موسمي منفصل، فلا يُفسد
  // فشلٌ مؤقّت (حدّ المزوّد) في أحدهما نتيجة الآخر ولا يُكاش «ناقصًا» طويلًا:
  //   - الدوريات: البطل = متصدّر جدول الموسم المنتهي (getStandings بموسم صريح).
  //   - الكؤوس (لا جدول): البطل = فائز نهائي الموسم المنتهي (getCompetitionHistory بموسم صريح).
  //   - الهدّاف: أول قائمة هدّافي الموسم المنتهي (getTopScorers بموسم صريح).
  if (meta.status === "finished") {
    const [standings, scorers] = await Promise.all([
      comp.hasStandings ? getStandings(comp, meta.season ?? undefined).catch(() => []) : Promise.resolve([]),
      comp.hasScorers ? getTopScorers(comp, meta.season ?? undefined).catch(() => []) : Promise.resolve([]),
    ]);
    const top = standings[0];
    if (top) {
      base.champion = { id: top.team.id, name: top.team.name, logo: top.team.logo };
    } else if (!comp.hasStandings) {
      const history = await getCompetitionHistory(comp, meta.season ?? undefined).catch(() => null);
      if (history?.champion) base.champion = history.champion;
    }
    const scorer = scorers[0];
    if (scorer) base.topScorer = { id: scorer.id, name: scorer.name, goals: scorer.goals };
    return base;
  }

  // جارية/قادمة/غير معروفة: نحتاج الجدول لاستخراج المباشر/اليوم/القادم.
  const fixtures = await getFixtures(comp).catch(() => [] as SplFixture[]);
  const todayKey = riyadhDayKey(Math.floor(now / 1000));
  const live = fixtures.filter((f) => f.status.live);
  const today = fixtures.filter((f) => !f.status.live && riyadhDayKey(f.timestamp) === todayKey);
  const upcoming = fixtures
    .filter((f) => !f.status.finished && !f.status.live && f.timestamp * 1000 >= now - 3 * 3_600_000)
    .sort((a, b) => a.timestamp - b.timestamp);

  base.liveCount = live.length;
  base.todayCount = today.length + live.length;

  const anchor = live[0] ?? today[0] ?? upcoming[0] ?? null;
  if (anchor) {
    base.nextMatch = toNextMatch(anchor);
    base.matchday = anchor.round || null;
  }

  if (meta.status === "upcoming") {
    const next = upcoming[0] ?? null;
    if (next) base.daysUntilKickoff = Math.max(0, Math.ceil((next.timestamp * 1000 - now) / 86_400_000));
    // حامل اللقب من النسخة السابقة يُثري بطاقة البطولة القادمة.
    const history = await getCompetitionHistory(comp).catch(() => null);
    if (history?.champion) base.champion = history.champion;
    return base;
  }

  // جارية/غير معروفة: المتصدّر + الهدّاف الأول (أفضل جهد، حسب دعم البطولة).
  const [standings, scorers] = await Promise.all([
    comp.hasStandings ? getStandings(comp).catch(() => []) : Promise.resolve([]),
    comp.hasScorers ? getTopScorers(comp).catch(() => []) : Promise.resolve([]),
  ]);
  const top = standings[0];
  if (top) base.leader = { id: top.team.id, name: top.team.name, logo: top.team.logo, points: top.points };
  const scorer = scorers[0];
  if (scorer) base.topScorer = { id: scorer.id, name: scorer.name, goals: scorer.goals };

  return base;
}

/**
 * موجز كل البطولات في لقطة واحدة. مخزَّن SWR (دقيقتان طازج / خمس بائت) فيُحسب
 * مرّة ويخدم الجميع، وبتوازٍ محدود (بطولتان) تحت حدّ المزوّد أثناء الإقلاع البارد.
 */
export async function getSportsSummary(): Promise<SpCompetitionSummary[]> {
  return withSWR("spl:summary:v3", 2 * 60_000, 5 * 60_000, async () => {
    const metaList = await listCompetitionsWithMeta();
    const metaBySlug = new Map(metaList.map((m) => [m.slug, m]));
    const limit = pLimit(2);
    const rows = await Promise.all(
      SAUDI_COMPETITIONS.map((comp) =>
        limit(() =>
          summarizeCompetition(comp, {
            logo: metaBySlug.get(comp.slug)?.logo ?? null,
            season: metaBySlug.get(comp.slug)?.season ?? null,
            status: metaBySlug.get(comp.slug)?.status ?? "unknown",
          }).catch(() => null),
        ),
      ),
    );
    return rows.filter((r): r is SpCompetitionSummary => r !== null);
  });
}
