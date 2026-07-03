/**
 * أنواع قسم كأس العالم 2026 — مرآة لما يرسله /api/world-cup/* (مُعرَّب من الخادم)
 * + مساعدات التوقيت/التجميع المشتركة بين مكونات القسم.
 */

export interface WcTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
  /** ترتيب فيفا للمنتخب (TheSports) — في قائمة المنتخبات فقط، اختياري */
  fifaRank?: number | null;
}

/** الزخم الهجومي عبر الزمن (من trends) — /api/world-cup/momentum/:id */
export interface WcMomentumPoint {
  label: string;
  minute: number;
  home: number;
  away: number; // سالبة (تُرسم أسفل الصفر)
  net: number;
}

export interface WcMomentum {
  available: boolean;
  live: boolean;
  possession: { home: number; away: number } | null;
  points: WcMomentumPoint[];
}

/** مؤشّر الضغط لحظة بلحظة (Pressure Index) — /api/world-cup/pressure/:id */
export interface WcPressurePoint {
  label: string;
  minute: number;
  home: number;
  away: number; // سالبة (تُرسم أسفل الصفر)
  net: number;
}

export interface WcPressure {
  available: boolean;
  live: boolean;
  latest: { side: "home" | "away" | "even"; value: number } | null;
  points: WcPressurePoint[];
}

/** التوقعات الاحتمالية (Predictions) — /api/world-cup/forecast/:id */
export interface WcOverUnderLine {
  line: number;
  over: number;
  under: number;
}

export interface WcCorrectScore {
  score: string; // "2-0" (المضيف-الضيف)
  prob: number;
}

export interface WcForecast {
  available: boolean;
  fulltime: { home: number; draw: number; away: number } | null;
  btts: { yes: number; no: number } | null;
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number } | null;
  goals: WcOverUnderLine[];
  correctScores: WcCorrectScore[];
}

/** معطيات المباراة (إحصائيات + طقس + غيابات) — /api/world-cup/match-facts/:id */
export interface WcWeather {
  type: "actual" | "forecast";
  temp: number | null;
  description: string;
  icon: string;
  humidity: string;
}

export interface WcAbsentee {
  name: string;
  location: "home" | "away";
  reason: string;
}

export interface WcEventDetail {
  minute: number;
  location: "home" | "away";
  klass: "goal" | "card" | "var";
  detail: string; // مُعرَّب
  player: string;
}

export interface WcMatchFacts {
  available: boolean;
  statistics: WcStatistic[]; // متوافق مع StatRow
  weather: WcWeather | null;
  absentees: WcAbsentee[];
  eventDetails: WcEventDetail[];
  halftime: { home: number; away: number } | null;
}

/** الأهداف المتوقعة (xG) — /api/world-cup/xg/:id */
export interface WcXgPlayer {
  name: string;
  location: "home" | "away";
  xg: number;
}

export interface WcXg {
  available: boolean;
  home: { xg: number; xgot: number };
  away: { xg: number; xgot: number };
  topPlayers: WcXgPlayer[];
}

/** التعليق المباشر المترجم (من commentaries) — /api/world-cup/commentary/:id */
export interface WcCommentaryItem {
  minute: number;
  extraMinute: number | null;
  goal: boolean;
  important: boolean;
  textAr: string;
  textEn: string;
  order: number;
}

export interface WcCommentary {
  available: boolean;
  live: boolean;
  items: WcCommentaryItem[];
}

export interface WcFixture {
  id: number;
  date: string;
  timestamp: number;
  status: {
    code: string;
    label: string;
    elapsed: number | null;
    extra: number | null;
    live: boolean;
    finished: boolean;
  };
  round: string;
  roundEn: string;
  venue: { name: string; city: string };
  home: WcTeam;
  away: WcTeam;
  goals: { home: number | null; away: number | null };
  penalties: { home: number | null; away: number | null } | null;
  matchNo?: number;
  homeCode?: string;
  awayCode?: string;
}

export type WcQualifyStatus = "qualified" | "eliminated" | "contention";

export interface WcStandingRow {
  rank: number;
  team: WcTeam;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  form: string | null;
  // حالة التأهّل للمركزين الأوّلين (تُحسب خادميًّا) — null حين ينتهي دور المجموعات
  qualifyStatus?: WcQualifyStatus | null;
  // true إذا حُدِّث الصفّ لحظيًّا من TheSports
  live?: boolean;
}

export interface WcGroup {
  group: string;
  groupEn: string;
  rows: WcStandingRow[];
}

export interface WcScorer {
  rank: number;
  /** معرّف اللاعب عند المزود — يفتح بطاقة اللاعب؛ 0 = غير معروف */
  id: number;
  name: string;
  photo: string;
  team: WcTeam;
  goals: number;
  assists: number;
  penalties: number;
  minutes: number;
  matches: number;
}

export interface WcPrediction {
  home: number;
  draw: number;
  away: number;
  advice: string | null;
}

export interface WcMatchEvent {
  minute: number;
  extraMinute: number | null;
  teamId: number;
  type: string;
  label: string;
  player: string;
  playerId: number | null;
  assist: string | null;
  assistId: number | null;
}

export interface WcLineupPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string | null;
  grid: string | null;
}

export interface WcLineup {
  teamId: number;
  teamName: string;
  formation: string | null;
  coach: string;
  startXI: WcLineupPlayer[];
  substitutes: WcLineupPlayer[];
}

// التشكيلة المتوقعة قبل المباراة (SportMonks expectedLineups)
export interface WcExpectedLineupPlayer {
  name: string;
  jersey: number | null;
  slot: number | null;
  grid: string | null;
  row: number | null;
}

export interface WcExpectedLineupSide {
  formation: string | null;
  starters: WcExpectedLineupPlayer[];
  bench: WcExpectedLineupPlayer[];
}

export interface WcExpectedLineups {
  available: boolean;
  home: WcExpectedLineupSide | null;
  away: WcExpectedLineupSide | null;
}

export interface WcStatistic {
  key: string;
  label: string;
  home: string;
  away: string;
}

export interface WcPlayerRating {
  id: number;
  name: string;
  photo: string;
  teamId: number;
  number: number | null;
  position: string;
  rating: number;
  minutes: number;
  goals: number;
  assists: number;
  captain: boolean;
}

export interface WcMatchDetail {
  fixture: WcFixture;
  events: WcMatchEvent[];
  lineups: WcLineup[];
  statistics: WcStatistic[];
  prediction: WcPrediction | null;
  ratings: WcPlayerRating[];
  manOfTheMatch: WcPlayerRating | null;
  headToHead: WcFixture[];
}

export interface WcLeader {
  rank: number;
  /** معرّف اللاعب عند المزود — يفتح بطاقة اللاعب؛ 0 = غير معروف */
  id: number;
  name: string;
  photo: string;
  team: WcTeam;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  minutes: number;
  matches: number;
}

export interface WcSquadPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string;
  positionEn: string;
  age: number | null;
  photo: string;
  /** القيمة السوقية (TheSports) — null إن تعذّر الربط */
  marketValue: number | null;
  marketValueCurrency: string;
}

/** القيمة السوقية وتاريخها للاعب — /api/world-cup/player/:id/market */
export interface WcPlayerMarket {
  available: boolean;
  marketValue: number | null;
  currency: string;
  history: { time: number; value: number }[];
}

export interface WcSquad {
  team: WcTeam;
  players: WcSquadPlayer[];
}

export interface WcTeamExtra {
  marketValue: number | null;
  marketValueCurrency: string;
  foundation: number | null;
  squadSize: number | null;
}

/** تصنيف فيفا للمنتخب — إثراء TheSports */
export interface WcFifaRank {
  rank: number;
  points: number | null;
  /** عدد المراكز المتغيّرة (موجب = صعد ▲، سالب = نزل ▼) — null إن تعذّر */
  change: number | null;
}

/** إصابة/غياب لاعب — إثراء TheSports */
export interface WcInjury {
  player: string;
  reason: string | null;
  status: string | null;
  until: string | null;
}

/** قناة بثّ مباراة — إثراء TheSports */
export interface WcTvChannel {
  name: string;
  country: string | null;
  url: string | null;
  logo: string | null;
}

/** بند إحصائي للموسم — إثراء TheSports (season/recent/team/stat) */
export interface WcSeasonStatItem {
  label: string;
  value: number;
  percent?: boolean;
}

/** إحصاء المنتخب في البطولة — إثراء TheSports */
export interface WcTeamSeasonStats {
  available: boolean;
  matches: number;
  items: WcSeasonStatItem[];
}

/** سطر إحصاء/تقييم لاعب في مباراة — إثراء TheSports (match/player_stats/detail) */
export interface WcPlayerStatLine {
  name: string;
  rating: number | null;
  starter: boolean;
  minutes: number;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
}

/** تقييمات لاعبي المباراة (مضيف/ضيف) — إثراء TheSports */
export interface WcMatchPlayerStats {
  available: boolean;
  home: { team: WcTeam; players: WcPlayerStatLine[] } | null;
  away: { team: WcTeam; players: WcPlayerStatLine[] } | null;
}

/** المدرّب (صورة/خطة/عمر/جنسية) من TheSports */
export interface WcCoachInfo {
  name: string;
  photo: string;
  formation: string | null;
  age: number | null;
  nationality: string | null;
}

/** ملعب المنتخب (اسم/سعة/مدينة/دولة) من TheSports */
export interface WcVenueInfo {
  name: string;
  capacity: number | null;
  city: string;
  country: string | null;
}

export interface WcTeamProfile {
  team: WcTeam;
  isSaudi: boolean;
  coach: string | null;
  group: WcGroup | null;
  fixtures: WcFixture[];
  squad: WcSquadPlayer[];
  extra?: WcTeamExtra | null;
  fifaRank?: WcFifaRank | null;
  injuries?: WcInjury[];
  seasonStats?: WcTeamSeasonStats;
  coachInfo?: WcCoachInfo | null;
  venue?: WcVenueInfo | null;
}

/** حقائق البطولة — /api/world-cup/facts */
export interface WcCompetitionFacts {
  defendingChampion: WcTeam | null;
  defendingChampionTitles: number | null;
  mostTitles: { teams: WcTeam[]; count: number } | null;
  host: string | null;
}

/** تنسيق القيمة السوقية بالعربية المختصرة (مليار/مليون) مع رمز العملة */
export function formatMarketValue(value: number | null, currency = "€"): string | null {
  if (value == null || value <= 0) return null;
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")} مليار ${currency}`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")} مليون ${currency}`;
  return `${value.toLocaleString("en-US")} ${currency}`;
}

export interface WcPlayerCareerStop {
  teamId: number;
  team: string;
  logo: string;
  seasons: number[];
}

export interface WcPlayerTrophy {
  competition: string;
  country: string;
  season: string;
  place: string;
  winner: boolean;
}

export interface WcPlayerTournamentStats {
  matches: number;
  lineups: number;
  minutes: number;
  rating: number | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOn: number;
  passes: number;
  keyPasses: number;
  dribblesAttempts: number;
  dribblesSuccess: number;
  tackles: number;
  yellow: number;
  red: number;
  saves: number;
  conceded: number;
  penaltiesScored: number;
  penaltiesMissed: number;
}

export interface WcPlayerCard {
  id: number;
  name: string;
  fullName: string | null;
  photo: string;
  position: string;
  positionEn: string;
  number: number | null;
  age: number | null;
  birthDate: string | null;
  birthPlace: string | null;
  height: number | null;
  weight: number | null;
  career: WcPlayerCareerStop[];
  trophies: WcPlayerTrophy[];
  stats: WcPlayerTournamentStats | null;
  injury: { reason: string } | null;
}

/** بطل البطولة — يظهر في بلوك الواجهة بدل مربع المباراة بعد حسم النهائي */
export interface WcChampion {
  team: WcTeam;
  runnerUp: WcTeam | null;
  /** نتيجة النهائي بترتيب «الفائز أولًا» (W-L) — نفس اتفاقية الترجيح الموحّدة */
  score: string | null;
  /** نتيجة ركلات الترجيح بترتيب «الفائز أولًا» — null إن حُسم النهائي دونها */
  penalties: string | null;
  decidedAt: string | null;
  source: "auto" | "manual";
}

export interface WcOverview {
  live: WcFixture[];
  today: WcFixture[];
  matchOfTheDay: { fixture: WcFixture; prediction: WcPrediction | null } | null;
  // المباريات القادمة المتزامنة مع المميّزة (نفس وقت الانطلاق) — قد تكون في يوم
  // تقويمي تالٍ فلا تظهر في today؛ تُستخدم لعرض بطاقات Hero متجاورة.
  matchOfDayPeers?: WcFixture[];
  // توقعات النتيجة مفهرسة بمعرّف المباراة — لكل مباراة تُعرض كبطاقة Hero
  predictions?: Record<number, WcPrediction>;
  saudi: {
    next: WcFixture | null;
    fixtures: WcFixture[];
    group: WcGroup | null;
  };
  /** بطل البطولة بعد حسم النهائي (أو المعيَّن يدويًا من اللوحة) */
  champion?: WcChampion | null;
  /** true عندما أُطفئ البلوك من لوحة التحكم — القسم كله يختفي */
  hidden?: boolean;
  updatedAt: string;
}

export const SAUDI_TEAM_ID = 23;

// ميلادي + أرقام لاتينية + توقيت الرياض — التواريخ تصل من الخادم بإزاحة +03:00 أصلًا
const AR_LOCALE = "ar-SA-u-ca-gregory-nu-latn";
const RIYADH = "Asia/Riyadh";

const timeFmt = new Intl.DateTimeFormat(AR_LOCALE, {
  timeZone: RIYADH,
  hour: "numeric",
  minute: "2-digit",
});

const dayFmt = new Intl.DateTimeFormat(AR_LOCALE, {
  timeZone: RIYADH,
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function formatKickoffTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function formatKickoffDay(iso: string): string {
  return dayFmt.format(new Date(iso));
}

/** مفتاح اليوم بتوقيت الرياض (التواريخ تصل بإزاحة +03:00 فالقصّ المباشر صحيح) */
export function riyadhDayKey(iso: string): string {
  return (iso ?? "").slice(0, 10);
}

export function todayRiyadhKey(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface WcDayGroup {
  key: string;
  label: string;
  items: WcFixture[];
}

export function groupFixturesByDay(fixtures: WcFixture[]): WcDayGroup[] {
  const groups: WcDayGroup[] = [];
  for (const fixture of fixtures) {
    const key = riyadhDayKey(fixture.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(fixture);
    } else {
      groups.push({ key, label: formatKickoffDay(fixture.date), items: [fixture] });
    }
  }
  return groups;
}

export interface WcCountdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

/** دقيقة اللعب مع الوقت بدل الضائع: 90+8' بدل 90' المجمدة */
export function elapsedLabel(status: WcFixture["status"]): string {
  if (status.elapsed == null) return status.label;
  return status.extra ? `${status.elapsed}+${status.extra}'` : `${status.elapsed}'`;
}

export function countdownTo(timestamp: number): WcCountdown {
  const total = Math.max(0, timestamp * 1000 - Date.now());
  return {
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total % 86_400_000) / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1000),
    total,
  };
}

/**
 * نتيجة ركلات الترجيح مع تحديد الفائز. النتيجة مرتّبة دائمًا «الفائز أولًا»
 * (winnerScore > loserScore) كي لا تنقلب بصريًّا بحسب اتجاه العرض (RTL/LTR).
 * المصدر موثوق: penalties.home يخصّ المضيف وpenalties.away يخصّ الضيف (نفس
 * ربط الأهداف). تُرجع null إن لم تُحسم المباراة بالترجيح. لا نعتمد على علم
 * `team.winner` الخام لأن المزوّد قد يتركه فارغًا في مباريات الترجيح.
 */
export interface WcPenaltyOutcome {
  winnerSide: "home" | "away";
  winnerName: string;
  winnerScore: number;
  loserScore: number;
}

/** الحد الأدنى البنيوي لحساب الترجيح — يقبل مباريات المونديال وكأس الملك معًا */
export interface PenaltyFixtureLike {
  penalties?: { home: number | null; away: number | null } | null;
  home: { name: string };
  away: { name: string };
}

export function penaltyOutcome(fixture: PenaltyFixtureLike): WcPenaltyOutcome | null {
  const pen = fixture.penalties;
  if (!pen || pen.home == null || pen.away == null || pen.home === pen.away) return null;
  const homeWon = pen.home > pen.away;
  return {
    winnerSide: homeWon ? "home" : "away",
    winnerName: homeWon ? fixture.home.name : fixture.away.name,
    winnerScore: homeWon ? pen.home : pen.away,
    loserScore: homeWon ? pen.away : pen.home,
  };
}
