/**
 * خدمة «كأس خادم الحرمين الشريفين» (King's Cup) — بطولة إقصائية للأندية السعودية
 * (API-Football league 504). طبقة رقيقة فوق saudiLeagueService (الذي يعرّب أندية
 * الدوري السعودي عبر saudiLeagueNames ويخزّن كل نقطة بيانات خلف كاش SWR)، تُعيد
 * تشكيلها في نقاط `/api/kings-cup/*` بنفس تجربة قسم كأس العالم: مباريات، شجرة
 * إقصائية، هدّافون، صنّاع، بطاقات، أندية، صفحة نادٍ، بطاقة لاعب، مركز مباراة،
 * ونظرة عامة (مباراة اليوم + البطل) لبانر الصفحة الرئيسية.
 *
 * لا جداول قاعدة بيانات جديدة — البيانات حيّة من المزوّد؛ التوقّعات تُعاد
 * استخدامها من نظام sports_pool الموحّد (كأس الملك مدعوم فيه أصلًا).
 */
import {
  getCompetition,
  getFixtures as splGetFixtures,
  getLiveFixtures as splGetLiveFixtures,
  overlayLiveFixturesForComp,
  overlayLiveMatchDetail,
  getTopScorers as splGetTopScorers,
  getTopAssists as splGetTopAssists,
  getTopYellowCards as splGetTopYellowCards,
  getTopRedCards as splGetTopRedCards,
  getSquad as splGetSquad,
  getTeamProfile as splGetTeamProfile,
  getPlayerCard as splGetPlayerCard,
  getPlayerForm as splGetPlayerForm,
  getPlayerMarketValue as splGetPlayerMarketValue,
  getMatchDetail as splGetMatchDetail,
  getMatchTvChannels as splGetMatchTvChannels,
  getMatchPlayerRatings as splGetMatchPlayerRatings,
  getFixturePrediction as splGetFixturePrediction,
  getCompetitionHistory as splGetCompetitionHistory,
  getCupChampionsRecord as splGetCupChampionsRecord,
  isSaudiLeagueConfigured,
  type SaudiCompetition,
  type SplFixture,
  type SplScorer,
  type SplTeam,
} from "./saudiLeagueService";
import {
  detectCupChampion,
  manualCupChampion,
  type CupChampion,
  type CupFixtureLike,
} from "./cupChampion";

export const KINGS_CUP_SLUG = "kings-cup";

/** المفتاح متاح؟ (نفس مفتاح APIFOOTBALL_KEY للبطولات الأخرى) */
export function isKingsCupConfigured(): boolean {
  return isSaudiLeagueConfigured();
}

/** موسم البطولة — KC_SEASON يتقدّم، وإلا يحلّه المزوّد ديناميكيًّا (current). */
function kcSeason(): number | undefined {
  const raw = Number((process.env.KC_SEASON || "").trim());
  return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

function comp(): SaudiCompetition {
  const c = getCompetition(KINGS_CUP_SLUG);
  if (!c) throw new Error("[KingsCup] competition kings-cup not registered");
  return c;
}

// ---------- المباريات ----------

/** كل مباريات البطولة، مُركّبة بأحدث نتيجة لحظية، مرتّبة زمنيًّا. */
export async function getKcFixtures(): Promise<SplFixture[]> {
  const fixtures = await splGetFixtures(comp(), kcSeason());
  return overlayLiveFixturesForComp(fixtures, KINGS_CUP_SLUG);
}

export async function getKcLiveFixtures(): Promise<SplFixture[]> {
  const live = await splGetLiveFixtures(comp());
  return overlayLiveFixturesForComp(live, KINGS_CUP_SLUG);
}

// ---------- الأندية المشاركة (مشتقّة من المباريات) ----------
// بطولة الكأس لا تملك جدول ترتيب، ولا نقطة teams مخصّصة في الطبقة الموحّدة —
// نشتقّ الأندية المشاركة من مبارياتها (اسم معرَّب + شعار جاهزان في localizeTeam).

const BIG_CLUB_IDS = new Set<number>([2932, 2939, 2938, 2929]); // الهلال، النصر، الاتحاد، الأهلي

export async function getKcTeams(): Promise<SplTeam[]> {
  const fixtures = await getKcFixtures();
  const byId = new Map<number, SplTeam>();
  for (const fx of fixtures) {
    for (const t of [fx.home, fx.away]) {
      if (t?.id && !byId.has(t.id)) byId.set(t.id, { ...t, winner: null });
    }
  }
  return [...byId.values()].sort((a, b) => {
    const aBig = BIG_CLUB_IDS.has(a.id) ? 0 : 1;
    const bBig = BIG_CLUB_IDS.has(b.id) ? 0 : 1;
    return aBig - bBig || a.name.localeCompare(b.name, "ar");
  });
}

// ---------- الشجرة الإقصائية ----------
// نبنيها من المباريات نفسها (مصدر متّسق مُركّب بأحدث نتيجة). البطولة إقصائية
// بالكامل (لا مجموعات) فنصنّف كل مباراة حسب دورها المعرَّب ونرتّب الأدوار.

const KC_ROUND_ORDER: string[] = [
  "دور الـ64",
  "دور الـ32",
  "دور الـ16",
  "ربع النهائي",
  "نصف النهائي",
  "تحديد المركز الثالث",
  "النهائي",
];

export interface KcBracketRound {
  round: string;
  matches: SplFixture[];
}

export interface KcBracket {
  rounds: KcBracketRound[];
}

export async function getKcBracket(): Promise<KcBracket> {
  const fixtures = await getKcFixtures();
  const byRound = new Map<string, SplFixture[]>();
  for (const fx of fixtures) {
    const r = (fx.round ?? "").trim();
    if (!r) continue;
    // نكتفي بالأدوار الإقصائية المعروفة (الكأس لا دوري له، لكن نحمي من أي جولة غريبة)
    if (!KC_ROUND_ORDER.includes(r) && !r.startsWith("دور الـ")) continue;
    const arr = byRound.get(r) ?? [];
    arr.push(fx);
    byRound.set(r, arr);
  }
  const order = (r: string) => {
    const i = KC_ROUND_ORDER.indexOf(r);
    if (i >= 0) return i;
    const m = r.match(/دور الـ(\d+)/); // دور الـ128 مثلًا
    return m ? -Number(m[1]) : 99;
  };
  const rounds: KcBracketRound[] = [...byRound.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([round, matches]) => ({
      round,
      matches: matches.sort((a, b) => a.timestamp - b.timestamp),
    }));
  return { rounds };
}

// ---------- الهدّافون / الصنّاع / البطاقات ----------

export async function getKcScorers(): Promise<SplScorer[]> {
  return splGetTopScorers(comp(), kcSeason());
}

export async function getKcAssists() {
  return splGetTopAssists(comp(), kcSeason());
}

export async function getKcYellowCards() {
  return splGetTopYellowCards(comp(), kcSeason());
}

export async function getKcRedCards() {
  return splGetTopRedCards(comp(), kcSeason());
}

// ---------- الأندية واللاعبون والمباريات (تفويض مباشر) ----------

export async function getKcSquad(teamId: number) {
  return splGetSquad(teamId);
}

export async function getKcTeamProfile(teamId: number) {
  return splGetTeamProfile(teamId, { withExtras: true });
}

export async function getKcPlayerCard(playerId: number) {
  return splGetPlayerCard(playerId);
}

export async function getKcPlayerForm(playerId: number) {
  return splGetPlayerForm(playerId);
}

export async function getKcPlayerMarket(playerId: number) {
  return splGetPlayerMarketValue(playerId);
}

export async function getKcMatchDetail(fixtureId: number) {
  const detail = await splGetMatchDetail(fixtureId);
  if (!detail) return null;
  return overlayLiveMatchDetail(detail);
}

export async function getKcMatchTv(fixtureId: number) {
  return splGetMatchTvChannels(fixtureId);
}

export async function getKcMatchRatings(fixtureId: number) {
  return splGetMatchPlayerRatings(fixtureId);
}

export async function getKcFixturePrediction(fixtureId: number) {
  return splGetFixturePrediction(fixtureId);
}

/** حقائق البطولة (حاملو اللقب السابقون + الهدّافون التاريخيون). */
export async function getKcHistory() {
  return splGetCompetitionHistory(comp());
}

/** سجل الأبطال متعدد المواسم (أبطال ووصفاء ونتائج النهائيات + جدار الألقاب). */
export async function getKcChampionsRecord() {
  return splGetCupChampionsRecord(comp());
}

// ---------- البطل ----------
// نُحوّل SplFixture إلى CupFixtureLike بإضافة roundEn من الدور المعرَّب حتى
// يلتقط detectCupChampion النهائي (وحده، لا «تحديد المركز الثالث»).

function toCupFixture(fx: SplFixture): CupFixtureLike {
  const roundEn =
    fx.round === "النهائي" ? "Final" : fx.round === "تحديد المركز الثالث" ? "3rd Place Final" : "";
  return {
    date: fx.date,
    roundEn,
    status: { finished: fx.status.finished },
    home: { id: fx.home.id, name: fx.home.name, logo: fx.home.logo, winner: fx.home.winner },
    away: { id: fx.away.id, name: fx.away.name, logo: fx.away.logo, winner: fx.away.winner },
    goals: { home: fx.goals.home, away: fx.goals.away },
    penalties: fx.penalties ?? null,
  };
}

export function detectKcChampion(fixtures: SplFixture[]): CupChampion | null {
  return detectCupChampion(fixtures.map(toCupFixture));
}

export function manualKcChampion(fixtures: SplFixture[], teamId: number): CupChampion | null {
  return manualCupChampion(fixtures.map(toCupFixture), teamId);
}

// ---------- نظرة عامة (لبانر الرئيسية + رأس صفحة القسم) ----------

export interface KcOverview {
  blockHidden: boolean;
  live: SplFixture[];
  today: SplFixture[];
  nextMatch: SplFixture | null;
  matchOfTheDay: { fixture: SplFixture; prediction: unknown | null } | null;
  started: boolean;
  champion: CupChampion | null;
  updatedAt: string;
}

export async function getKcOverview(): Promise<Omit<KcOverview, "blockHidden">> {
  const [fixtures, live] = await Promise.all([getKcFixtures(), getKcLiveFixtures()]);

  const riyadhToday = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = fixtures.filter((f) => (f.date ?? "").slice(0, 10) === riyadhToday);
  const upcoming = fixtures.filter((f) => !f.status.finished && !f.status.live);

  // المباراة المميّزة: أول حيّة، وإلا أقرب مباراة اليوم لم تنته، وإلا أقرب قادمة
  const motdFixture =
    live[0] ??
    today.find((f) => !f.status.finished) ??
    upcoming[0] ??
    null;

  let prediction: unknown | null = null;
  if (motdFixture && !motdFixture.status.finished) {
    prediction = await splGetFixturePrediction(motdFixture.id).catch(() => null);
  }

  const started = fixtures.some((f) => f.status.live || f.status.finished);

  return {
    live,
    today,
    nextMatch: motdFixture,
    matchOfTheDay: motdFixture ? { fixture: motdFixture, prediction } : null,
    started,
    champion: detectKcChampion(fixtures),
    updatedAt: new Date().toISOString(),
  };
}
