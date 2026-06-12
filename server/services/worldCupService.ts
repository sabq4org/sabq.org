/**
 * خدمة كأس العالم 2026 — عميل API-Football (v3.football.api-sports.io).
 *
 * كل الاستجابات تُعرَّب هنا (منتخبات/ملاعب/جولات/حالات/أحداث) قبل وصولها
 * للواجهة، وكل نقطة بيانات خلف كاش SWR بحيث يخدم آلاف الزوار من طلب واحد
 * للمزود. التوقيت يُطلب من المزود مباشرة بتوقيت الرياض.
 */
import { withSWR, CACHE_TTL } from "../memoryCache";
import {
  SAUDI_TEAM_ID,
  WC_FINISHED_STATUSES,
  WC_LIVE_STATUSES,
  WC_STATUS_AR,
  localizeEvent,
  localizeGroup,
  localizeRound,
  localizeTeamName,
  localizeVenue,
} from "./worldCupNames";
import { resolveNames } from "./worldCupNameTranslator";

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE_ID = 1; // World Cup
const SEASON = 2026;
const TIMEZONE = "Asia/Riyadh";

// إيقاعات تحديث أقصر من CACHE_TTL العام — البيانات الحية تتغير بالثواني
const LIVE_TTL = 15 * 1000;
const FIXTURES_TTL = 60 * 1000;
const MATCH_DETAIL_LIVE_TTL = 20 * 1000;
// المزود ينشر التشكيلات قبل الانطلاق بـ 20–40 دقيقة — كاش 5 دقائق يؤخرها حتى الصافرة
const MATCH_DETAIL_PREKICKOFF_TTL = 60 * 1000;
const PREKICKOFF_WINDOW_MS = 75 * 60 * 1000;

export function isWorldCupConfigured(): boolean {
  return Boolean((process.env.APIFOOTBALL_KEY || "").trim());
}

async function apiGet(path: string, params: Record<string, string | number>): Promise<any[]> {
  const apiKey = (process.env.APIFOOTBALL_KEY || "").trim();
  if (!apiKey) throw new Error("APIFOOTBALL_KEY is not set");

  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const response = await fetch(url, {
    headers: { "x-apisports-key": apiKey },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`[WorldCup] API-Football HTTP ${response.status} for ${path}`);
  }

  const data: any = await response.json();
  const errors = data?.errors;
  if (errors && !Array.isArray(errors) && Object.keys(errors).length > 0) {
    throw new Error(`[WorldCup] API-Football error for ${path}: ${JSON.stringify(errors)}`);
  }
  return Array.isArray(data?.response) ? data.response : [];
}

// ---------- DTOs المُعرَّبة التي تستهلكها الواجهة ----------

export interface WcTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
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
}

function localizeTeam(raw: any): WcTeam {
  return {
    id: raw?.id ?? 0,
    name: localizeTeamName(raw?.id, raw?.name ?? ""),
    logo: raw?.logo ?? "",
    winner: raw?.winner ?? null,
  };
}

function localizeFixture(item: any): WcFixture {
  const fx = item.fixture ?? {};
  const statusCode: string = fx.status?.short ?? "TBD";
  const hasPenalties =
    item.score?.penalty?.home != null || item.score?.penalty?.away != null;
  return {
    id: fx.id,
    date: fx.date,
    timestamp: fx.timestamp,
    status: {
      code: statusCode,
      label: WC_STATUS_AR[statusCode] ?? statusCode,
      elapsed: fx.status?.elapsed ?? null,
      extra: fx.status?.extra ?? null,
      live: WC_LIVE_STATUSES.has(statusCode),
      finished: WC_FINISHED_STATUSES.has(statusCode),
    },
    round: localizeRound(item.league?.round ?? ""),
    roundEn: item.league?.round ?? "",
    venue: localizeVenue(fx.venue?.name, fx.venue?.city),
    home: localizeTeam(item.teams?.home),
    away: localizeTeam(item.teams?.away),
    goals: { home: item.goals?.home ?? null, away: item.goals?.away ?? null },
    penalties: hasPenalties
      ? { home: item.score?.penalty?.home ?? null, away: item.score?.penalty?.away ?? null }
      : null,
  };
}

// ---------- نقاط البيانات المكشوفة للراوتر ----------

export async function getFixtures(): Promise<WcFixture[]> {
  return withSWR("wc:fixtures", FIXTURES_TTL, FIXTURES_TTL * 2, async () => {
    const rows = await apiGet("fixtures", {
      league: LEAGUE_ID,
      season: SEASON,
      timezone: TIMEZONE,
    });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
}

export async function getLiveFixtures(): Promise<WcFixture[]> {
  return withSWR("wc:live", LIVE_TTL, LIVE_TTL * 2, async () => {
    const rows = await apiGet("fixtures", {
      league: LEAGUE_ID,
      season: SEASON,
      live: "all",
      timezone: TIMEZONE,
    });
    return rows.map(localizeFixture).sort((a, b) => a.timestamp - b.timestamp);
  });
}

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
}

export interface WcGroup {
  group: string;
  groupEn: string;
  rows: WcStandingRow[];
}

export async function getStandings(): Promise<WcGroup[]> {
  return withSWR("wc:standings", CACHE_TTL.MEDIUM, CACHE_TTL.MEDIUM * 2, async () => {
    const rows = await apiGet("standings", { league: LEAGUE_ID, season: SEASON });
    const tables: any[][] = rows[0]?.league?.standings ?? [];
    // المزود يسمي المجموعات "Group A" قبل البطولة و"Group Stage - Group A" بعد
    // أول إعادة حساب، وجدول أفضل الثوالث يأتي باسم "Group Stage" بلا حرف — نستبعده
    const groupLetter = (table: any[]): string | null =>
      (table[0]?.group ?? "").match(/Group\s+([A-L])\s*$/i)?.[1]?.toUpperCase() ?? null;
    return tables
      .filter((table) => groupLetter(table) !== null)
      .sort((a, b) => groupLetter(a)!.localeCompare(groupLetter(b)!))
      .map((table) => ({
        group: localizeGroup(table[0]?.group ?? ""),
        groupEn: `Group ${groupLetter(table)}`,
        rows: table.map((row: any): WcStandingRow => ({
          rank: row.rank,
          team: localizeTeam(row.team),
          played: row.all?.played ?? 0,
          win: row.all?.win ?? 0,
          draw: row.all?.draw ?? 0,
          lose: row.all?.lose ?? 0,
          goalsFor: row.all?.goals?.for ?? 0,
          goalsAgainst: row.all?.goals?.against ?? 0,
          goalsDiff: row.goalsDiff ?? 0,
          points: row.points ?? 0,
          form: row.form ?? null,
        })),
      }));
  });
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

export async function getTopScorers(): Promise<WcScorer[]> {
  const provider = await withSWR("wc:scorers", CACHE_TTL.LONG, CACHE_TTL.LONG * 2, async () => {
    const rows = await apiGet("players/topscorers", { league: LEAGUE_ID, season: SEASON });
    const top = rows.slice(0, 10);
    const tr = await resolveNames(top.map((row: any) => row.player?.name));
    return top.map((row: any, index: number): WcScorer => {
      const stats = row.statistics?.[0] ?? {};
      return {
        rank: index + 1,
        id: row.player?.id ?? 0,
        name: tr(row.player?.name),
        photo: row.player?.photo ?? "",
        team: localizeTeam(stats.team),
        goals: stats.goals?.total ?? 0,
        assists: stats.goals?.assists ?? 0,
        penalties: stats.penalty?.scored ?? 0,
        minutes: stats.games?.minutes ?? 0,
        matches: stats.games?.appearences ?? 0,
      };
    });
  });
  if ((provider ?? []).length > 0) return provider;
  // لوحة المزود لم تصدر بعد — نجمعها من أحداث المباريات
  return (await aggregateRacesFromEvents()).scorers;
}

export interface WcPrediction {
  home: number;
  draw: number;
  away: number;
  advice: string | null;
}

// ---------- المنتخبات والقوائم ----------

const POSITION_AR: Record<string, string> = {
  Goalkeeper: "حارس مرمى",
  Defender: "مدافع",
  Midfielder: "لاعب وسط",
  Attacker: "مهاجم",
  G: "حارس مرمى",
  D: "مدافع",
  M: "لاعب وسط",
  F: "مهاجم",
};

const POSITION_ORDER: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Attacker: 3 };

const SQUAD_TTL = 6 * 60 * 60 * 1000; // القوائم شبه ثابتة أثناء البطولة

export async function getTeams(): Promise<WcTeam[]> {
  return withSWR("wc:teams", SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("teams", { league: LEAGUE_ID, season: SEASON });
    const teams = rows.map((row: any) => localizeTeam(row.team));
    // الأخضر أولًا ثم ترتيب أبجدي عربي
    return teams.sort((a, b) => {
      if (a.id === SAUDI_TEAM_ID) return -1;
      if (b.id === SAUDI_TEAM_ID) return 1;
      return a.name.localeCompare(b.name, "ar");
    });
  });
}

export interface WcSquadPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string;
  positionEn: string;
  age: number | null;
  photo: string;
}

export interface WcSquad {
  team: WcTeam;
  players: WcSquadPlayer[];
}

export async function getSquad(teamId: number): Promise<WcSquad | null> {
  return withSWR(`wc:squad:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("players/squads", { team: teamId });
    const entry = rows[0];
    if (!entry) return null;
    const tr = await resolveNames((entry.players ?? []).map((p: any) => p.name));
    const players: WcSquadPlayer[] = (entry.players ?? [])
      .map((p: any): WcSquadPlayer => ({
        id: p.id ?? 0,
        name: tr(p.name),
        number: p.number ?? null,
        position: POSITION_AR[p.position] ?? p.position ?? "",
        positionEn: p.position ?? "",
        age: p.age ?? null,
        photo: p.photo ?? "",
      }))
      .sort(
        (a: WcSquadPlayer, b: WcSquadPlayer) =>
          (POSITION_ORDER[a.positionEn] ?? 9) - (POSITION_ORDER[b.positionEn] ?? 9) ||
          (a.number ?? 99) - (b.number ?? 99)
      );
    return { team: localizeTeam(entry.team), players };
  });
}

// ---------- بطاقة اللاعب الشاملة ----------
// تجمع كل ما يوفره المزود عن اللاعب: الملف الشخصي + المسيرة + الألقاب +
// أرقام البطولة + حالة الإصابة. كل نداء يفشل بمعزل عن الآخرين —
// البطاقة تُبنى مما توفر.

const PLAYER_CARD_TTL = 60 * 60 * 1000; // الملف شبه ثابت؛ أرقام البطولة تتجدد كل ساعة

const TROPHY_PLACE_AR: Record<string, string> = {
  Winner: "بطل",
  "2nd Place": "وصيف",
  "3rd Place": "المركز الثالث",
};

// أسماء البطولات قصيرة وعامة عند المزود ("Saudi League" + country تفصلها عن
// غيرها) — ترجمة معنوية ثابتة؛ غير المعروف يبقى كما هو بدل تشويهه بنقل صوتي
const COMPETITION_AR: Record<string, string> = {
  "World Cup": "كأس العالم",
  "Club World Cup": "كأس العالم للأندية",
  "FIFA Club World Cup": "كأس العالم للأندية",
  "FIFA Intercontinental Cup": "كأس إنتركونتيننتال",
  "Euro Championship": "كأس أمم أوروبا",
  "Copa America": "كوبا أمريكا",
  "Africa Cup of Nations": "كأس الأمم الأفريقية",
  "Asian Cup": "كأس آسيا",
  "Gold Cup": "الكأس الذهبية (كونكاكاف)",
  "Gulf Cup": "كأس الخليج",
  "Arab Cup": "كأس العرب",
  "Olympics Men": "أولمبياد",
  "Confederations Cup": "كأس القارات",
  "UEFA Champions League": "دوري أبطال أوروبا",
  "Champions League": "دوري الأبطال",
  "AFC Champions League": "دوري أبطال آسيا",
  "CAF Champions League": "دوري أبطال أفريقيا",
  "Copa Libertadores": "كأس ليبرتادوريس",
  "UEFA Europa League": "الدوري الأوروبي",
  "Europa League": "الدوري الأوروبي",
  "UEFA Super Cup": "كأس السوبر الأوروبي",
  "UEFA Nations League": "دوري الأمم الأوروبية",
  "Saudi League": "الدوري السعودي",
  "Pro League": "دوري المحترفين",
  "Premier League": "الدوري الممتاز",
  "First Division": "دوري الدرجة الأولى",
  "Second Division": "دوري الدرجة الثانية",
  "Super Cup": "كأس السوبر",
  "King Cup": "كأس الملك",
  "King's Cup": "كأس الملك",
  "Crown Prince Cup": "كأس ولي العهد",
  "La Liga": "الدوري الإسباني",
  "Serie A": "الدوري الإيطالي",
  Bundesliga: "الدوري الألماني",
  "Ligue 1": "الدوري الفرنسي",
  Eredivisie: "الدوري الهولندي",
  "Primeira Liga": "الدوري البرتغالي",
  "Major League Soccer": "الدوري الأمريكي",
  "FA Cup": "كأس الاتحاد الإنجليزي",
  "League Cup": "كأس الرابطة الإنجليزية",
  "Community Shield": "الدرع الخيرية",
  "Copa del Rey": "كأس ملك إسبانيا",
  "Coppa Italia": "كأس إيطاليا",
  "DFB Pokal": "كأس ألمانيا",
  "Coupe de France": "كأس فرنسا",
  "Trophée des Champions": "كأس الأبطال الفرنسي",
  "Arab Club Champions Cup": "كأس العرب للأندية الأبطال",
  "AFC U23 Asian Cup": "كأس آسيا تحت 23 عامًا",
  "U20 World Cup": "كأس العالم للشباب",
  "U17 World Cup": "كأس العالم للناشئين",
  Friendlies: "مباريات ودية",
};

// دول الألقاب وبلد الميلاد — المنتخبات الـ48 وأشهر دول الكرة؛ "World" تأتي
// مع البطولات الدولية. غير المعروف يبقى كما هو.
const COUNTRY_AR: Record<string, string> = {
  "Saudi Arabia": "السعودية",
  World: "العالم",
  Asia: "آسيا",
  Africa: "أفريقيا",
  Europe: "أوروبا",
  "South America": "أمريكا الجنوبية",
  "North America": "أمريكا الشمالية",
  England: "إنجلترا",
  Spain: "إسبانيا",
  Italy: "إيطاليا",
  Germany: "ألمانيا",
  France: "فرنسا",
  Portugal: "البرتغال",
  Netherlands: "هولندا",
  Belgium: "بلجيكا",
  Brazil: "البرازيل",
  Argentina: "الأرجنتين",
  Morocco: "المغرب",
  Tunisia: "تونس",
  Algeria: "الجزائر",
  Egypt: "مصر",
  Qatar: "قطر",
  "United Arab Emirates": "الإمارات",
  Kuwait: "الكويت",
  Bahrain: "البحرين",
  Oman: "عُمان",
  Jordan: "الأردن",
  Iraq: "العراق",
  Lebanon: "لبنان",
  Turkey: "تركيا",
  Türkiye: "تركيا",
  USA: "الولايات المتحدة",
  Mexico: "المكسيك",
  Canada: "كندا",
  Japan: "اليابان",
  "South Korea": "كوريا الجنوبية",
  "Korea Republic": "كوريا الجنوبية",
  Australia: "أستراليا",
  Iran: "إيران",
  Uzbekistan: "أوزبكستان",
  Croatia: "كرواتيا",
  Switzerland: "سويسرا",
  Austria: "النمسا",
  Scotland: "اسكتلندا",
  Wales: "ويلز",
  Ireland: "أيرلندا",
  Norway: "النرويج",
  Sweden: "السويد",
  Denmark: "الدنمارك",
  Poland: "بولندا",
  Greece: "اليونان",
  Russia: "روسيا",
  Ukraine: "أوكرانيا",
  Senegal: "السنغال",
  Ghana: "غانا",
  Nigeria: "نيجيريا",
  Cameroon: "الكاميرون",
  "Ivory Coast": "ساحل العاج",
  "South Africa": "جنوب أفريقيا",
  "Cape Verde": "الرأس الأخضر",
  Uruguay: "أوروغواي",
  Colombia: "كولومبيا",
  Ecuador: "الإكوادور",
  Paraguay: "باراغواي",
  Panama: "بنما",
  "Costa Rica": "كوستاريكا",
  Haiti: "هايتي",
  Curacao: "كوراساو",
  "New Zealand": "نيوزيلندا",
};

const localizeCompetition = (name: string): string => COMPETITION_AR[name] ?? name;
const localizeCountry = (name: string): string => COUNTRY_AR[name] ?? name;

/** "188" أو "188 cm" → 188 */
const parseMetric = (value: unknown): number | null => {
  const n = parseInt(String(value ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

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
  /** الاسم الرسمي الكامل — null عندما لا يضيف شيئًا على الاسم المعروض */
  fullName: string | null;
  photo: string;
  position: string;
  positionEn: string;
  number: number | null;
  age: number | null;
  birthDate: string | null;
  /** "الرياض، السعودية" — المدينة بالنقل الصوتي والدولة من الخريطة الثابتة */
  birthPlace: string | null;
  height: number | null;
  weight: number | null;
  career: WcPlayerCareerStop[];
  trophies: WcPlayerTrophy[];
  /** أرقام اللاعب التراكمية في مونديال 2026 — null قبل اعتماد المزود لها */
  stats: WcPlayerTournamentStats | null;
  injury: { reason: string } | null;
}

export async function getPlayerCard(playerId: number): Promise<WcPlayerCard | null> {
  return withSWR(`wc:player:${playerId}`, PLAYER_CARD_TTL, PLAYER_CARD_TTL * 2, async () => {
    const [profileRows, careerRows, trophyRows, statsRows, injuryRows] = await Promise.all([
      apiGet("players/profiles", { player: playerId }),
      apiGet("players/teams", { player: playerId }).catch(() => [] as any[]),
      apiGet("trophies", { player: playerId }).catch(() => [] as any[]),
      apiGet("players", { id: playerId, season: SEASON, league: LEAGUE_ID }).catch(() => [] as any[]),
      apiGet("injuries", { player: playerId, season: SEASON }).catch(() => [] as any[]),
    ]);

    const p = profileRows[0]?.player;
    if (!p?.id) return null;

    // كل ما يحتاج نقلًا صوتيًا (أشخاص/أندية/مدن) في دفعة تعريب واحدة
    const officialFull = [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
    const tr = await resolveNames([
      p.name,
      officialFull,
      p.birth?.place,
      ...careerRows.map((row: any) => row.team?.name),
    ]);

    const career: WcPlayerCareerStop[] = careerRows
      .map((row: any): WcPlayerCareerStop => {
        const teamId = row.team?.id ?? 0;
        // المنتخبات الـ48 من قاموسها الثابت؛ الأندية بالنقل الصوتي
        const ntName = localizeTeamName(teamId, "");
        return {
          teamId,
          team: ntName || tr(row.team?.name),
          logo: row.team?.logo ?? "",
          seasons: ((row.seasons ?? []) as number[]).filter((s) => Number.isFinite(s)).sort((a, b) => a - b),
        };
      })
      .filter((stop: WcPlayerCareerStop) => stop.team)
      .sort(
        (a: WcPlayerCareerStop, b: WcPlayerCareerStop) =>
          (b.seasons[b.seasons.length - 1] ?? 0) - (a.seasons[a.seasons.length - 1] ?? 0)
      );

    const seenTrophies = new Set<string>();
    const trophies: WcPlayerTrophy[] = trophyRows
      .filter((row: any) => row?.league && row?.season)
      .filter((row: any) => {
        const key = `${row.league}|${row.country}|${row.season}|${row.place}`;
        if (seenTrophies.has(key)) return false;
        seenTrophies.add(key);
        return true;
      })
      .map((row: any): WcPlayerTrophy => ({
        competition: localizeCompetition(row.league),
        country: localizeCountry(row.country ?? ""),
        season: String(row.season),
        place: TROPHY_PLACE_AR[row.place] ?? row.place ?? "",
        winner: row.place === "Winner",
      }))
      .sort((a: WcPlayerTrophy, b: WcPlayerTrophy) => b.season.localeCompare(a.season));

    const st = statsRows[0]?.statistics?.[0];
    const matches = st?.games?.appearences ?? 0;
    const stats: WcPlayerTournamentStats | null =
      st && matches > 0
        ? {
            matches,
            lineups: st.games?.lineups ?? 0,
            minutes: st.games?.minutes ?? 0,
            rating: Number.isFinite(parseFloat(st.games?.rating ?? "")) ? parseFloat(st.games.rating) : null,
            goals: st.goals?.total ?? 0,
            assists: st.goals?.assists ?? 0,
            shots: st.shots?.total ?? 0,
            shotsOn: st.shots?.on ?? 0,
            passes: st.passes?.total ?? 0,
            keyPasses: st.passes?.key ?? 0,
            dribblesAttempts: st.dribbles?.attempts ?? 0,
            dribblesSuccess: st.dribbles?.success ?? 0,
            tackles: st.tackles?.total ?? 0,
            yellow: st.cards?.yellow ?? 0,
            red: (st.cards?.red ?? 0) + (st.cards?.yellowred ?? 0),
            saves: st.goals?.saves ?? 0,
            conceded: st.goals?.conceded ?? 0,
            penaltiesScored: st.penalty?.scored ?? 0,
            penaltiesMissed: st.penalty?.missed ?? 0,
          }
        : null;

    // أحدث سجل إصابة في موسم البطولة — أفضل جهد، والسبب يبقى إنجليزيًا
    // عند المزود فلا نعرضه إلا معرّبًا في الواجهة عبر شارة عامة
    const injuryReason: string | null = injuryRows[0]?.player?.reason ?? null;

    const displayName = tr(p.name);
    const translatedFull = officialFull ? tr(officialFull) : "";

    return {
      id: p.id,
      name: displayName,
      fullName: translatedFull && translatedFull !== displayName ? translatedFull : null,
      photo: p.photo ?? "",
      position: POSITION_AR[p.position] ?? p.position ?? "",
      positionEn: p.position ?? "",
      number: p.number ?? null,
      age: p.age ?? null,
      birthDate: p.birth?.date ?? null,
      birthPlace:
        [tr(p.birth?.place), localizeCountry(p.birth?.country ?? "")].filter(Boolean).join("، ") || null,
      height: parseMetric(p.height),
      weight: parseMetric(p.weight),
      career,
      trophies,
      stats,
      injury: injuryReason ? { reason: injuryReason } : null,
    };
  });
}

// ---------- المواجهات التاريخية ----------

export async function getHeadToHead(teamA: number, teamB: number): Promise<WcFixture[]> {
  const key = [teamA, teamB].sort((a, b) => a - b).join("-");
  return withSWR(`wc:h2h:${key}`, CACHE_TTL.VERY_LONG, CACHE_TTL.VERY_LONG * 2, async () => {
    const rows = await apiGet("fixtures/headtohead", { h2h: `${teamA}-${teamB}`, timezone: TIMEZONE });
    return rows
      .map(localizeFixture)
      .filter((f) => f.status.finished)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);
  });
}

const parsePercent = (value: unknown): number => {
  const n = parseInt(String(value ?? "").replace("%", ""), 10);
  return Number.isFinite(n) ? n : 0;
};

export async function getPrediction(fixtureId: number): Promise<WcPrediction | null> {
  return withSWR(`wc:prediction:${fixtureId}`, CACHE_TTL.VERY_LONG, CACHE_TTL.VERY_LONG * 2, async () => {
    const rows = await apiGet("predictions", { fixture: fixtureId });
    const p = rows[0]?.predictions;
    if (!p) return null;
    return {
      home: parsePercent(p.percent?.home),
      draw: parsePercent(p.percent?.draw),
      away: parsePercent(p.percent?.away),
      advice: null, // نص النصيحة يأتي إنجليزيًا من المزود — النِّسَب تكفي للواجهة
    };
  });
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

function mapLeader(row: any, index: number, tr: (n: string | null | undefined) => string): WcLeader {
  const stats = row.statistics?.[0] ?? {};
  return {
    rank: index + 1,
    id: row.player?.id ?? 0,
    name: tr(row.player?.name),
    photo: row.player?.photo ?? "",
    team: localizeTeam(stats.team),
    goals: stats.goals?.total ?? 0,
    assists: stats.goals?.assists ?? 0,
    yellow: stats.cards?.yellow ?? 0,
    red: (stats.cards?.red ?? 0) + (stats.cards?.yellowred ?? 0),
    minutes: stats.games?.minutes ?? 0,
    matches: stats.games?.appearences ?? 0,
  };
}

// ---------- تجميع السباقات من الأحداث ----------
// لوحات اللاعبين المجمعة تُعتمد عند المزود بفاصل بعد المباريات، بينما الأحداث
// لحظية وبين أيدينا — فنجمع الهدافين/الصناعة/البطاقات بأنفسنا ريثما تصدر لوحاته
// (لوحة المزود أكمل: دقائق اللعب والصور وعدد المباريات — تحل محل التجميع فور صدورها).

interface WcRaceTally {
  playerId: number | null;
  name: string;
  team: WcTeam;
  photo: string;
  goals: number;
  penalties: number;
  assists: number;
  yellow: number;
  red: number;
}

interface WcRacesFromEvents {
  scorers: WcScorer[];
  assists: WcLeader[];
  cards: WcLeader[];
}

async function aggregateRacesFromEvents(): Promise<WcRacesFromEvents> {
  return withSWR<WcRacesFromEvents>("wc:racesFromEvents", 30 * 1000, 60 * 1000, async () => {
    const started = (await getFixtures()).filter((f) => f.status.live || f.status.finished);
    const teamById = new Map<number, WcTeam>();
    for (const f of started) {
      teamById.set(f.home.id, f.home);
      teamById.set(f.away.id, f.away);
    }

    const tallies = new Map<string, WcRaceTally>();
    const bump = (
      name: string | null,
      playerId: number | null,
      teamId: number,
      apply: (t: WcRaceTally) => void
    ) => {
      const team = teamById.get(teamId);
      if (!name || !team) return;
      const key = `${teamId}:${name}`;
      let tally = tallies.get(key);
      if (!tally) {
        // صور المزود تتبع معرف اللاعب مباشرة
        const photo = playerId ? `https://media.api-sports.io/football/players/${playerId}.png` : "";
        tally = { playerId, name, team, photo, goals: 0, penalties: 0, assists: 0, yellow: 0, red: 0 };
        tallies.set(key, tally);
      } else if (!tally.photo && playerId) {
        tally.playerId = playerId;
        tally.photo = `https://media.api-sports.io/football/players/${playerId}.png`;
      }
      apply(tally);
    };

    const details = await Promise.all(started.map((f) => getMatchDetail(f.id).catch(() => null)));
    for (const detail of details) {
      for (const ev of detail?.events ?? []) {
        if (ev.type === "goal" && ev.detail !== "Own Goal") {
          // الهدف العكسي لا يدخل سباق الهداف، وركلة الجزاء الضائعة نوع مستقل أصلًا
          bump(ev.player, ev.playerId, ev.teamId, (t) => {
            t.goals += 1;
            if (ev.detail === "Penalty") t.penalties += 1;
          });
          if (ev.assist) bump(ev.assist, ev.assistId, ev.teamId, (t) => { t.assists += 1; });
        } else if (ev.type === "yellow-card") {
          bump(ev.player, ev.playerId, ev.teamId, (t) => {
            t.yellow += 1;
            if (ev.detail === "Second Yellow card") t.red += 1; // طرد بإنذارين
          });
        } else if (ev.type === "red-card") {
          bump(ev.player, ev.playerId, ev.teamId, (t) => { t.red += 1; });
        }
      }
    }

    const all = [...tallies.values()];
    const toLeader = (t: WcRaceTally, index: number): WcLeader => ({
      rank: index + 1,
      id: t.playerId ?? 0,
      name: t.name,
      photo: t.photo,
      team: t.team,
      goals: t.goals,
      assists: t.assists,
      yellow: t.yellow,
      red: t.red,
      minutes: 0,
      matches: 0,
    });
    return {
      scorers: all
        .filter((t) => t.goals > 0)
        .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
        .slice(0, 10)
        .map((t, i): WcScorer => ({
          rank: i + 1,
          id: t.playerId ?? 0,
          name: t.name,
          photo: t.photo,
          team: t.team,
          goals: t.goals,
          assists: t.assists,
          penalties: t.penalties,
          minutes: 0,
          matches: 0,
        })),
      assists: all
        .filter((t) => t.assists > 0)
        .sort((a, b) => b.assists - a.assists || b.goals - a.goals)
        .slice(0, 10)
        .map(toLeader),
      cards: all
        .filter((t) => t.yellow + t.red > 0)
        .sort((a, b) => b.yellow - a.yellow || b.red - a.red)
        .slice(0, 10)
        .map(toLeader),
    };
  });
}

export async function getTopAssists(): Promise<WcLeader[]> {
  const provider = await withSWR("wc:assists", CACHE_TTL.LONG, CACHE_TTL.LONG * 2, async () => {
    const rows = (await apiGet("players/topassists", { league: LEAGUE_ID, season: SEASON })).slice(0, 10);
    const tr = await resolveNames(rows.map((row: any) => row.player?.name));
    return rows.map((row: any, i: number) => mapLeader(row, i, tr));
  });
  if ((provider ?? []).length > 0) return provider;
  return (await aggregateRacesFromEvents()).assists;
}

export async function getTopCards(): Promise<WcLeader[]> {
  const provider = await withSWR("wc:cards", CACHE_TTL.LONG, CACHE_TTL.LONG * 2, async () => {
    const rows = (await apiGet("players/topyellowcards", { league: LEAGUE_ID, season: SEASON })).slice(0, 10);
    const tr = await resolveNames(rows.map((row: any) => row.player?.name));
    return rows.map((row: any, i: number) => mapLeader(row, i, tr));
  });
  if ((provider ?? []).length > 0) return provider;
  return (await aggregateRacesFromEvents()).cards;
}

export interface WcMatchEvent {
  minute: number;
  extraMinute: number | null;
  teamId: number;
  type: string;
  label: string;
  /** تفصيل المزود الخام (Own Goal / Penalty / Second Yellow card) — يلزم تجميع السباقات */
  detail: string;
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

export interface WcStatistic {
  key: string;
  label: string;
  home: string;
  away: string;
}

const STAT_AR: Record<string, string> = {
  "Ball Possession": "الاستحواذ",
  "Total Shots": "التسديدات",
  "Shots on Goal": "تسديدات على المرمى",
  "Shots off Goal": "تسديدات خارج المرمى",
  "Blocked Shots": "تسديدات مصدودة",
  "Corner Kicks": "الركنيات",
  Offsides: "التسلل",
  Fouls: "الأخطاء",
  "Yellow Cards": "البطاقات الصفراء",
  "Red Cards": "البطاقات الحمراء",
  "Goalkeeper Saves": "تصديات الحارس",
  "Total passes": "التمريرات",
  "Passes accurate": "تمريرات صحيحة",
  "Passes %": "دقة التمرير",
  "expected_goals": "الأهداف المتوقعة (xG)",
};

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

export async function getMatchDetail(fixtureId: number): Promise<WcMatchDetail | null> {
  // مباراة حية تُحدَّث كل 20 ثانية، وقبيل الانطلاق كل دقيقة (لالتقاط التشكيلات فور نشرها)،
  // والمنتهية/البعيدة كل 5 دقائق
  const known = (await getFixtures()).find((f) => f.id === fixtureId);
  let ttl = CACHE_TTL.MEDIUM;
  if (known?.status.live) {
    ttl = MATCH_DETAIL_LIVE_TTL;
  } else if (known && !known.status.finished) {
    const msToKickoff = new Date(known.date).getTime() - Date.now();
    if (msToKickoff < PREKICKOFF_WINDOW_MS) ttl = MATCH_DETAIL_PREKICKOFF_TTL;
  }

  const detail = await withSWR(`wc:match:${fixtureId}`, ttl, ttl * 2, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return null;

    // اجمع كل أسماء اللاعبين في هذه المباراة (أحداث + تشكيلات + تقييمات)
    // وعرّبها دفعة واحدة — استدعاء AI واحد فقط للأسماء الجديدة، ثم كاش للأبد
    const rawNames: (string | null | undefined)[] = [];
    for (const ev of item.events ?? []) {
      rawNames.push(ev.player?.name, ev.assist?.name);
    }
    for (const lineup of item.lineups ?? []) {
      for (const p of lineup.startXI ?? []) rawNames.push(p.player?.name);
      for (const p of lineup.substitutes ?? []) rawNames.push(p.player?.name);
    }
    for (const teamBlock of item.players ?? []) {
      for (const p of teamBlock.players ?? []) rawNames.push(p.player?.name);
    }
    const tr = await resolveNames(rawNames);

    const events: WcMatchEvent[] = (item.events ?? []).map((ev: any) => {
      const localized = localizeEvent(ev.type ?? "", ev.detail ?? "");
      return {
        minute: ev.time?.elapsed ?? 0,
        extraMinute: ev.time?.extra ?? null,
        teamId: ev.team?.id ?? 0,
        type: localized.type,
        label: localized.label,
        detail: ev.detail ?? "",
        player: tr(ev.player?.name),
        playerId: ev.player?.id ?? null,
        assist: ev.assist?.name ? tr(ev.assist.name) : null,
        assistId: ev.assist?.id ?? null,
      };
    });

    const lineups: WcLineup[] = (item.lineups ?? []).map((lineup: any): WcLineup => {
      const mapPlayer = (p: any): WcLineupPlayer => ({
        id: p.player?.id ?? 0,
        name: tr(p.player?.name),
        number: p.player?.number ?? null,
        position: p.player?.pos ?? null,
        grid: p.player?.grid ?? null,
      });
      return {
        teamId: lineup.team?.id ?? 0,
        teamName: localizeTeamName(lineup.team?.id, lineup.team?.name ?? ""),
        formation: lineup.formation ?? null,
        coach: lineup.coach?.name ?? "",
        startXI: (lineup.startXI ?? []).map(mapPlayer),
        substitutes: (lineup.substitutes ?? []).map(mapPlayer),
      };
    });

    // تقييمات اللاعبين — يرسلها المزود ضمن نفس الرد بعد انطلاق المباراة
    const ratings: WcPlayerRating[] = (item.players ?? [])
      .flatMap((teamBlock: any) =>
        (teamBlock.players ?? []).map((p: any): WcPlayerRating | null => {
          const st = p.statistics?.[0] ?? {};
          const rating = parseFloat(st.games?.rating ?? "");
          if (!Number.isFinite(rating)) return null;
          return {
            id: p.player?.id ?? 0,
            name: tr(p.player?.name),
            photo: p.player?.photo ?? "",
            teamId: teamBlock.team?.id ?? 0,
            number: st.games?.number ?? null,
            position: POSITION_AR[st.games?.position] ?? st.games?.position ?? "",
            rating,
            minutes: st.games?.minutes ?? 0,
            goals: st.goals?.total ?? 0,
            assists: st.goals?.assists ?? 0,
            captain: st.games?.captain ?? false,
          };
        })
      )
      .filter(Boolean)
      .sort((a: WcPlayerRating, b: WcPlayerRating) => b.rating - a.rating);

    const homeStats = (item.statistics ?? []).find((s: any) => s.team?.id === item.teams?.home?.id);
    const awayStats = (item.statistics ?? []).find((s: any) => s.team?.id === item.teams?.away?.id);
    const statistics: WcStatistic[] = (homeStats?.statistics ?? [])
      .filter((stat: any) => STAT_AR[stat.type])
      .map((stat: any): WcStatistic => {
        const awayValue = (awayStats?.statistics ?? []).find((s: any) => s.type === stat.type)?.value;
        return {
          key: stat.type,
          label: STAT_AR[stat.type],
          home: String(stat.value ?? 0),
          away: String(awayValue ?? 0),
        };
      });

    return { fixture: localizeFixture(item), events, lineups, statistics, ratings };
  });

  if (!detail) return null;

  // التوقعات تُجلب لأي مباراة لم تنته (كاش ساعة لكل مباراة)
  let prediction: WcPrediction | null = null;
  if (!detail.fixture.status.finished) {
    try {
      prediction = await getPrediction(fixtureId);
    } catch (error) {
      console.warn(`[WorldCup] prediction failed for fixture ${fixtureId}:`, error);
    }
  }

  // سجل المواجهات — كاشه المستقل طويل فلا يكلف نداءً مع كل تحديث حي
  let headToHead: WcFixture[] = [];
  try {
    headToHead = await getHeadToHead(detail.fixture.home.id, detail.fixture.away.id);
  } catch (error) {
    console.warn(`[WorldCup] h2h failed for fixture ${fixtureId}:`, error);
  }

  const manOfTheMatch =
    detail.fixture.status.finished && detail.ratings.length > 0 ? detail.ratings[0] : null;

  return { ...detail, prediction, headToHead, manOfTheMatch };
}

// ---------- نظرة عامة مُجمَّعة للصفحة الرئيسية للقسم ----------

/** وزن "نجومية" المنتخب لاختيار مباراة اليوم — الأخضر دائمًا أولًا */
const STAR_WEIGHT: Record<number, number> = {
  [SAUDI_TEAM_ID]: 100,
  26: 12, // الأرجنتين
  2: 12, // فرنسا
  6: 12, // البرازيل
  9: 10, // إسبانيا
  10: 10, // إنجلترا
  25: 10, // ألمانيا
  27: 10, // البرتغال
  1118: 8, // هولندا
  16: 6, // المكسيك (مضيف)
  2384: 6, // الولايات المتحدة (مضيف)
  5529: 6, // كندا (مضيف)
  31: 6, // المغرب
  12: 5, // اليابان
  777: 5, // تركيا
  3: 5, // كرواتيا
};

const starWeight = (fixture: WcFixture): number =>
  (STAR_WEIGHT[fixture.home.id] ?? 1) + (STAR_WEIGHT[fixture.away.id] ?? 1);

export interface WcOverview {
  live: WcFixture[];
  today: WcFixture[];
  matchOfTheDay: { fixture: WcFixture; prediction: WcPrediction | null } | null;
  saudi: {
    next: WcFixture | null;
    fixtures: WcFixture[];
    group: WcGroup | null;
  };
  updatedAt: string;
}

export async function getOverview(): Promise<WcOverview> {
  const [fixtures, live] = await Promise.all([getFixtures(), getLiveFixtures()]);

  // "اليوم" بتوقيت الرياض — تواريخ المزود تصل أصلًا بإزاحة +03:00
  const riyadhToday = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = fixtures.filter((f) => (f.date ?? "").slice(0, 10) === riyadhToday);

  const upcoming = fixtures.filter((f) => !f.status.finished && !f.status.live);
  const motdPool = live.length > 0 ? live : today.filter((f) => !f.status.finished);
  // المفاضلة بالنجومية داخل أقرب يوم لعب فقط — مباراة الافتتاح غدًا
  // لا يجوز أن تتجاوزها مباراة أبرز بعد ثلاثة أيام
  const nextDayKey = (upcoming[0]?.date ?? "").slice(0, 10);
  const nextDayMatches = upcoming.filter((f) => (f.date ?? "").slice(0, 10) === nextDayKey);
  const fallbackPool = motdPool.length > 0 ? motdPool : nextDayMatches;
  // الأقرب زمنيًا أولًا — مباراة الفجر لا تتجاوزها مباراة المساء مهما علت
  // نجوميتها؛ النجومية كاسر تعادل للمباريات المتزامنة (ختام المجموعات)
  const motdFixture = [...fallbackPool].sort(
    (a, b) => a.timestamp - b.timestamp || starWeight(b) - starWeight(a)
  )[0] ?? null;

  let motdPrediction: WcPrediction | null = null;
  if (motdFixture && !motdFixture.status.finished) {
    try {
      motdPrediction = await getPrediction(motdFixture.id);
    } catch (error) {
      console.warn("[WorldCup] match-of-the-day prediction failed:", error);
    }
  }

  const saudiFixtures = fixtures.filter(
    (f) => f.home.id === SAUDI_TEAM_ID || f.away.id === SAUDI_TEAM_ID
  );
  const saudiNext = saudiFixtures.find((f) => !f.status.finished) ?? null;

  let saudiGroup: WcGroup | null = null;
  try {
    const groups = await getStandings();
    saudiGroup =
      groups.find((g) => g.rows.some((row) => row.team.id === SAUDI_TEAM_ID)) ?? null;
  } catch (error) {
    console.warn("[WorldCup] standings unavailable for overview:", error);
  }

  return {
    live,
    today,
    matchOfTheDay: motdFixture ? { fixture: motdFixture, prediction: motdPrediction } : null,
    saudi: { next: saudiNext, fixtures: saudiFixtures, group: saudiGroup },
    updatedAt: new Date().toISOString(),
  };
}
