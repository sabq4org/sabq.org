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
  WC_PLAYER_AR,
  localizeEvent,
  localizeGroup,
  localizeRound,
  localizeTeamName,
  localizeVenue,
} from "./worldCupNames";
import { resolveNames } from "./worldCupNameTranslator";
import {
  WC_COMPETITION_ID,
  getTsTeamExtra,
  getTsCoach,
  getTsVenue,
  getTsCompetitionExtra,
  getTsCompetitionMatchPairs,
  getTsLiveStandings,
  getTsFifaRanking,
  getTsTeamInjuries,
  getTsMatchTv,
  getTsMatchTeamStats,
  getTsMatchTrend,
  getTsLineup,
  getTsTeamSquad,
  getTsPlayerMarketHistory,
  getTsSeasonTeamStats,
  getTsMatchPlayerStats,
  resolveTsNames,
  TS_I18N_TYPE,
  type TsTeamStatSide,
  type TsLineup,
  type TsLineupPlayer,
} from "./theSportsService";
import { type WcMomentum, type WcPressure } from "./sportmonksService";
import pLimit from "p-limit";
import { buildBracketModel, mergeFullKnockoutSchedule, type WcBracketModel } from "./wc2026Bracket";

const API_BASE = "https://v3.football.api-sports.io";

// تجميع سباقات الهدّافين يحتاج أحداث كل المباريات الجارية/المنتهية دفعةً واحدة.
// بلا حدّ تزامن كان Promise.all يطلق طلبًا (أو ثلاثة) لكل مباراة في نفس اللحظة،
// فيُغرق حصة المزود ويُشعل rate-limit بعد كل إعادة تشغيل (كاش بارد). نحدّه بـ 4.
const MATCH_FETCH_CONCURRENCY = 4;
const LEAGUE_ID = 1; // World Cup
const SEASON = 2026;
const TIMEZONE = "Asia/Riyadh";

// إيقاعات تحديث أقصر من CACHE_TTL العام — البيانات الحية تتغير بالثواني.
// 8ث (كان 15): قائمة المباريات الجارية تُلتقط أسرع (بدء/انتهاء) لتطابق إيقاع
// النتيجة اللحظية المُركّبة فوقها. النتيجة نفسها تأتي من TheSports (5ث)/SportMonks
// (دفعة 4ث) في الطبقة، فلا يحدّها هذا الكاش.
const LIVE_TTL = 8 * 1000;
// 30ث (كان 60): يلتقط cron أخبار المونديال لحظة FT أبكر بعد صافرة النهاية،
// فيقلّص تأخّر نشر تقرير ما بعد المباراة. البيانات الحية تتغيّر بالثواني.
const FIXTURES_TTL = 30 * 1000;
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
  /** ترتيب فيفا للمنتخب (TheSports) — يُملأ في قائمة المنتخبات فقط، اختياري */
  fifaRank?: number | null;
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
  /** رقم المباراة الرسمي (73–104) — الأدوار الإقصائية فقط */
  matchNo?: number;
  /** رمز خانة FIFA للمضيف عندما لم يُحسم المنتخب بعد (W74، 2A، …) */
  homeCode?: string;
  /** رمز خانة FIFA للضيف عندما لم يُحسم المنتخب بعد */
  awayCode?: string;
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

export async function getFixtures(
  opts: { forceFresh?: boolean } = {}
): Promise<WcFixture[]> {
  return withSWR(
    "wc:fixtures",
    FIXTURES_TTL,
    FIXTURES_TTL * 2,
    async () => {
      const rows = await apiGet("fixtures", {
        league: LEAGUE_ID,
        season: SEASON,
        timezone: TIMEZONE,
      });
      const apiFixtures = rows.map(localizeFixture);
      return mergeFullKnockoutSchedule(apiFixtures).sort((a, b) => a.timestamp - b.timestamp);
    },
    opts.forceFresh ?? false
  );
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

/**
 * هوية المباراة الخام (أسماء إنجليزية + توقيت UTC + الحالة) — يحتاجها
 * sportmonksService لمطابقة المباراة عند مزوّد آخر بمعرّفات مختلفة.
 * منفصلة عن DTOs المُعرَّبة لأن المطابقة تحتاج الاسم الإنجليزي لا العربي.
 */
export interface WcFixtureIdentity {
  kickoffIso: string; // ISO مع الإزاحة (نشتق منه يوم UTC)
  homeNameEn: string;
  awayNameEn: string;
  live: boolean;
  finished: boolean;
}

export async function getFixtureIdentity(fixtureId: number): Promise<WcFixtureIdentity | null> {
  return withSWR(`wc:identity:${fixtureId}`, CACHE_TTL.LONG, CACHE_TTL.LONG * 2, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return null;
    const code: string = item.fixture?.status?.short ?? "TBD";
    return {
      kickoffIso: item.fixture?.date ?? "",
      homeNameEn: item.teams?.home?.name ?? "",
      awayNameEn: item.teams?.away?.name ?? "",
      live: WC_LIVE_STATUSES.has(code),
      finished: WC_FINISHED_STATUSES.has(code),
    };
  });
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
  // حالة التأهّل للمركزين الأوّلين داخل المجموعة (تُحسب من المباريات المتبقّية).
  // null = دور المجموعات منتهٍ/غير متاح. أفضل الثوالث لا يُحسب هنا.
  qualifyStatus?: WcQualifyStatus | null;
  // true إذا حُدِّث هذا الصفّ لحظيًّا من TheSports (أسرع من تحديث API-Football).
  live?: boolean;
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
    const groupLetter = (group: string): string | null =>
      (group ?? "").match(/Group\s+([A-L])\s*$/i)?.[1]?.toUpperCase() ?? null;

    // المزود يكرّر صفوف المنتخبات داخل الجدول الواحد (أحيانًا مرتين بنفس القيم) عند
    // انتقال المرحلة، وقد يُرسل جدولين للحرف نفسه ("Group A" و"Group Stage - Group A").
    // نوحّد الكل حسب الحرف ثم نُزيل التكرار حسب معرّف المنتخب مُبقين أحدث صف (الأكثر
    // مباريات)، فتظهر كل مجموعة بأربعة منتخبات لا ثمانية.
    const byLetter = new Map<string, Map<number, any>>();
    for (const table of tables) {
      const letter = groupLetter(table[0]?.group ?? "");
      if (!letter) continue;
      let teams = byLetter.get(letter);
      if (!teams) {
        teams = new Map();
        byLetter.set(letter, teams);
      }
      for (const row of table) {
        const id = row.team?.id ?? 0;
        if (!id) continue;
        const prev = teams.get(id);
        if (!prev || (row.all?.played ?? 0) > (prev.all?.played ?? 0)) teams.set(id, row);
      }
    }

    return [...byLetter.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, teams]) => ({
        group: localizeGroup(`Group ${letter}`),
        groupEn: `Group ${letter}`,
        rows: [...teams.values()]
          // ترتيب المزود الرسمي (rank) يراعي المواجهات المباشرة؛ النقاط والفارق احتياط
          .sort(
            (a, b) =>
              (a.rank ?? 99) - (b.rank ?? 99) ||
              (b.points ?? 0) - (a.points ?? 0) ||
              (b.goalsDiff ?? 0) - (a.goalsDiff ?? 0)
          )
          .map((row: any): WcStandingRow => ({
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

// ---------- حالة التأهّل (تُحسب من الترتيب + المباريات المتبقّية) ----------
// نُعدّد كل احتمالات نتائج مباريات المجموعة المتبقّية (3^n: فوز مضيف/تعادل/فوز ضيف)
// ونحكم لكل منتخب بالنقاط فقط (دون افتراض فارق أهداف) حكمًا تحفّظيًّا:
//   • متأهّل: في كل سيناريو لا يسبقه أو يساويه في النقاط أكثر من منتخب واحد.
//   • خارج:   في كل سيناريو يسبقه منتخبان على الأقل في النقاط (يستحيل بلوغ المركزين).
//   • غير ذلك: «في الصراع».
// نقتصر على المركزين الأوّلين داخل المجموعة (محدّد ودقيق)؛ سباق «أفضل الثوالث» عبر
// المجموعات لا يُحسب هنا. كسر التعادل عند التساوي يُعامَل ضد المنتخب (تحفّظًا) فلا
// نُعلن تأهّلًا أو إقصاءً إلا حين يكون مؤكّدًا رياضيًّا.
interface RemainingMatch {
  homeId: number;
  awayId: number;
}

function computeGroupQualification(
  rows: WcStandingRow[],
  remaining: RemainingMatch[],
): Map<number, WcQualifyStatus> {
  const ids = rows.map((r) => r.team.id).filter((id) => id > 0);
  const basePoints = new Map(rows.map((r) => [r.team.id, r.points] as const));
  const result = new Map<number, WcQualifyStatus>();
  // حدّ أمان: لن تتجاوز مباريات المجموعة المتبقّية 6 فعليًّا (3^6=729).
  if (ids.length === 0 || remaining.length > 12) {
    for (const id of ids) result.set(id, "contention");
    return result;
  }
  const stillQualified = new Map<number, boolean>(ids.map((id) => [id, true]));
  const stillEliminated = new Map<number, boolean>(ids.map((id) => [id, true]));
  const total = 3 ** remaining.length;
  for (let mask = 0; mask < total; mask++) {
    const pts = new Map(basePoints);
    let m = mask;
    for (const match of remaining) {
      const o = m % 3; // 0=فوز المضيف، 1=تعادل، 2=فوز الضيف
      m = Math.floor(m / 3);
      if (o === 0) pts.set(match.homeId, (pts.get(match.homeId) ?? 0) + 3);
      else if (o === 1) {
        pts.set(match.homeId, (pts.get(match.homeId) ?? 0) + 1);
        pts.set(match.awayId, (pts.get(match.awayId) ?? 0) + 1);
      } else pts.set(match.awayId, (pts.get(match.awayId) ?? 0) + 3);
    }
    for (const id of ids) {
      const p = pts.get(id) ?? 0;
      let geq = 0; // منتخبات نقاطها ≥ نقاطه (قد تسبقه بكسر التعادل)
      let gt = 0; // منتخبات نقاطها > نقاطه (تسبقه يقينًا)
      for (const other of ids) {
        if (other === id) continue;
        const op = pts.get(other) ?? 0;
        if (op >= p) geq++;
        if (op > p) gt++;
      }
      if (geq > 1) stillQualified.set(id, false);
      if (gt < 2) stillEliminated.set(id, false);
    }
  }
  for (const id of ids) {
    result.set(
      id,
      stillQualified.get(id) ? "qualified" : stillEliminated.get(id) ? "eliminated" : "contention",
    );
  }
  return result;
}

// صفّ ترتيب مُصفّر لمنتخب (نقطة انطلاق الحساب من المباريات).
function blankStandingRow(team: WcTeam, form: string | null): WcStandingRow {
  return {
    rank: 0,
    team,
    played: 0,
    win: 0,
    draw: 0,
    lose: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalsDiff: 0,
    points: 0,
    form,
    live: false,
  };
}

// تطبيق نتيجة مباراة واحدة على صفّ منتخب.
function accumulateMatch(row: WcStandingRow, scored: number, conceded: number, live: boolean): void {
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalsDiff = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) {
    row.win += 1;
    row.points += 3;
  } else if (scored === conceded) {
    row.draw += 1;
    row.points += 1;
  } else {
    row.lose += 1;
  }
  if (live) row.live = true;
}

// فرز وترقيم محلّي (1..N): نقاط ← فارق ← له ← الاسم. لا نثق بترتيب المزوّد لأنه
// متأخّر/مختلط (شوهد بفجوات 1,2,4,5 وبخلط مصادر).
function rankGroupRows(rows: WcStandingRow[]): WcStandingRow[] {
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsDiff - a.goalsDiff ||
      b.goalsFor - a.goalsFor ||
      a.team.name.localeCompare(b.team.name, "ar"),
  );
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

/**
 * يبني جدول كل مجموعة من المباريات نفسها (مصدر واحد متّسق) بدل الوثوق بنقطة
 * standings لدى المزوّد (المتأخّرة/المختلطة). المنتهية تُحتسب نهائيًّا؛ الجارية
 * تُطبَّق مبدئيًّا (provisional) وتُعلَّم live فيتحرّك الجدول مع كل هدف ولا تختفي
 * النتيجة لحظة الصافرة (تتحوّل من «جارية» إلى «منتهية» في نفس المصدر).
 *
 * حالة التأهّل تُحسب من النتائج **المؤكّدة فقط** (المنتهية) + المباريات المتبقّية
 * (تشمل الجارية) كي لا نُعلن تأهّلًا/إقصاءً بناءً على نتيجة لم تُحسم بعد.
 *
 * البنية (أعضاء كل مجموعة + أسماء/شعارات) من baseGroups؛ والأرقام كلها من fixtures.
 */
export function buildGroupStandings(baseGroups: WcGroup[], fixtures: WcFixture[]): WcGroup[] {
  return baseGroups.map((g) => {
    const ids = new Set(g.rows.map((r) => r.team.id));
    const display = new Map<number, WcStandingRow>();
    const confirmed = new Map<number, WcStandingRow>();
    for (const r of g.rows) {
      display.set(r.team.id, blankStandingRow(r.team, r.form ?? null));
      confirmed.set(r.team.id, blankStandingRow(r.team, r.form ?? null));
    }

    const remaining: RemainingMatch[] = [];
    for (const f of fixtures) {
      if (!ids.has(f.home.id) || !ids.has(f.away.id)) continue; // داخل المجموعة فقط
      const gh = f.goals.home;
      const ga = f.goals.away;
      const hasScore = gh != null && ga != null;
      if (f.status.finished && hasScore) {
        accumulateMatch(display.get(f.home.id)!, gh!, ga!, false);
        accumulateMatch(display.get(f.away.id)!, ga!, gh!, false);
        accumulateMatch(confirmed.get(f.home.id)!, gh!, ga!, false);
        accumulateMatch(confirmed.get(f.away.id)!, ga!, gh!, false);
      } else if (f.status.live && hasScore) {
        // جارية: ترتيب مبدئي على العرض فقط، وتبقى ضمن «المتبقّية» للتأهّل.
        accumulateMatch(display.get(f.home.id)!, gh!, ga!, true);
        accumulateMatch(display.get(f.away.id)!, ga!, gh!, true);
        remaining.push({ homeId: f.home.id, awayId: f.away.id });
      } else if (!f.status.finished) {
        remaining.push({ homeId: f.home.id, awayId: f.away.id }); // مقرّرة لم تبدأ
      }
    }

    const rows = rankGroupRows([...display.values()]);
    const status =
      remaining.length > 0
        ? computeGroupQualification([...confirmed.values()], remaining)
        : null;
    return {
      ...g,
      rows: rows.map((r) => ({ ...r, qualifyStatus: status ? status.get(r.team.id) ?? null : null })),
    };
  });
}

/** الترتيب مع حالة التأهّل — يُحسب من المباريات (المنتهية نهائيّة، الجارية مبدئية). */
export async function getStandingsWithQualification(): Promise<WcGroup[]> {
  const [baseGroups, fixtures] = await Promise.all([
    getStandings(),
    getFixtures().catch(() => [] as WcFixture[]),
  ]);
  return buildGroupStandings(baseGroups, fixtures);
}

// ---------- شجرة الأدوار الإقصائية (Bracket) ----------

// ترتيب أدوار خروج المغلوب لمونديال 2026 (48 منتخبًا → يبدأ بدور الـ32). مباراة
// المركز الثالث تُعرض قبل النهائي في الواجهة لكنها دور منفصل عن مسار البطل.
const KNOCKOUT_ROUND_ORDER = [
  "Round of 32",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "3rd Place Final",
  "Final",
] as const;

export interface WcBracketRound {
  /** اسم الدور معرَّبًا */
  round: string;
  roundEn: string;
  matches: WcFixture[];
}

export interface WcBracket {
  /** مصدر البنية: API-Football حاليًّا (TheSports لاحقًا كإثراء) */
  source: "api-football" | "thesports";
  rounds: WcBracketRound[];
  /** شجرة خروج المغلوب الرسمية (FIFA 73–104) مع ترقية الفائزين ووسوم المصادر. */
  tree: WcBracketModel;
}

/**
 * يبني شجرة الأدوار الإقصائية من مباريات البطولة (API-Football). نُصنّف كل مباراة
 * حسب اسم دورها (`roundEn`) إلى أحد أدوار خروج المغلوب المعروفة، ونُسقط مباريات
 * دور المجموعات. المزوّد قد يُذيّل اسم الدور برقم ("Round of 16 - 1") فنطابق
 * بالبادئة. دالة نقية ليُمرّر إليها المستدعي مباريات مُركّبة بأحدث نتيجة لحظية.
 */
export function buildBracket(fixtures: WcFixture[]): WcBracket {
  const byRound = new Map<string, WcFixture[]>();
  for (const fx of fixtures) {
    const r = (fx.roundEn ?? "").trim();
    if (!r) continue;
    const canon = KNOCKOUT_ROUND_ORDER.find((o) => r === o || r.startsWith(o));
    if (!canon) continue;
    const arr = byRound.get(canon) ?? [];
    arr.push(fx);
    byRound.set(canon, arr);
  }
  const rounds: WcBracketRound[] = [];
  for (const o of KNOCKOUT_ROUND_ORDER) {
    const matches = byRound.get(o);
    if (!matches || matches.length === 0) continue;
    matches.sort((a, b) => a.timestamp - b.timestamp);
    rounds.push({ round: localizeRound(o), roundEn: o, matches });
  }
  return { source: "api-football", rounds, tree: buildBracketModel(fixtures) };
}

/** شجرة الأدوار الإقصائية — يجلب المباريات ثم يبنيها (بدون تركيب لحظي). */
export async function getBracket(): Promise<WcBracket> {
  const fixtures = await getFixtures().catch(() => [] as WcFixture[]);
  return buildBracket(fixtures);
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
    // المجموع الكامل لكل صفوف المزود قبل الاقتطاع — يُقارَن بمجموع لوحة الأحداث
    const total = rows.reduce((sum: number, row: any) => sum + (row.statistics?.[0]?.goals?.total ?? 0), 0);
    const top = rows.slice(0, 10);
    const tr = await resolveNames(top.map((row: any) => row.player?.name));
    const board = top.map((row: any, index: number): WcScorer => {
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
    return { board, total };
  });
  const events = await aggregateRacesFromEvents();
  return freshestBoard(provider.board, provider.total, events.scorers, events.totals.goals);
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

/**
 * قائمة المنتخبات مُثراة بترتيب فيفا (TheSports) عبر الجسر — أفضل جهد: غياب
 * TheSports → القائمة كما هي بلا ترتيب. لا نلوّث كاش `getTeams` الطويل لأن الترتيب
 * (خريطة منفصلة مكاشة) يتغيّر شهريًّا والقائمة موسميًّا.
 */
export async function getTeamsRanked(): Promise<WcTeam[]> {
  const teams = await getTeams();
  try {
    const [bridge, ranking] = await Promise.all([getWcTeamBridge(), getTsFifaRanking()]);
    if (ranking.size === 0) return teams;
    return teams.map((t) => {
      const uuid = bridge.get(t.id);
      const r = uuid ? ranking.get(uuid) : null;
      return r ? { ...t, fifaRank: r.rank } : t;
    });
  } catch {
    return teams;
  }
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

export interface WcSquad {
  team: WcTeam;
  players: WcSquadPlayer[];
}

export async function getSquad(teamId: number): Promise<WcSquad | null> {
  return withSWR(`wc:squad:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("players/squads", { team: teamId });
    const entry = rows[0];
    if (!entry) return null;
    const raw: any[] = entry.players ?? [];
    const tr = await resolveNames(raw.map((p: any) => p.name));
    // القيمة السوقية عبر جسر TheSports (الاسم الإنجليزي + الرقم) — أفضل جهد
    const market = await getWcSquadMarket(
      teamId,
      raw.map((p: any) => ({ id: p.id ?? 0, enName: p.name ?? "", number: p.number ?? null })),
    ).catch(() => new Map<number, WcPlayerMarketInfo>());
    const players: WcSquadPlayer[] = raw
      .map((p: any): WcSquadPlayer => {
        const mv = market.get(p.id ?? 0);
        return {
          id: p.id ?? 0,
          name: tr(p.name),
          number: p.number ?? null,
          position: POSITION_AR[p.position] ?? p.position ?? "",
          positionEn: p.position ?? "",
          age: p.age ?? null,
          photo: p.photo ?? "",
          marketValue: mv?.marketValue ?? null,
          marketValueCurrency: mv?.currency ?? "€",
        };
      })
      .sort(
        (a: WcSquadPlayer, b: WcSquadPlayer) =>
          (POSITION_ORDER[a.positionEn] ?? 9) - (POSITION_ORDER[b.positionEn] ?? 9) ||
          (a.number ?? 99) - (b.number ?? 99)
      );
    return { team: localizeTeam(entry.team), players };
  });
}

// المدرّب الحالي للمنتخب — المزود يُعيد كل من درّبه عبر التاريخ، والحالي
// هو من «فريقه الحالي» = هذا المنتخب. الاسم بنقل صوتي كبقية القسم.
export async function getCoach(teamId: number): Promise<string | null> {
  return withSWR(`wc:coach:${teamId}`, SQUAD_TTL, SQUAD_TTL * 2, async () => {
    const rows = await apiGet("coachs", { team: teamId });
    const current = rows.find((r: any) => r.team?.id === teamId) ?? rows[0];
    const raw: string | undefined = current?.name;
    if (!raw) return null;
    const tr = await resolveNames([raw]);
    return tr(raw);
  });
}

// ---------- جسر الربط مع TheSports + بيانات إثرائية ----------
// نربط معرّف المنتخب لدى API-Football بمعرّف TheSports (uuid) **دون أسماء**:
// نطابق كل مباراة لدينا (لها home.id/away.id ووقت بداية) بمباراة TheSports
// (لها home_team_id/away_team_id ووقت) عبر تطابق وقت البداية. التطابق الفريد فقط
// (مباراة واحدة بنفس التوقيت ±دقيقتين) يُعتمد، فينكشف زوجا المعرّفين معًا. نصوّت
// عبر كل مباريات المنتخب فيغلب المعرّف الصحيح حتى لو اختلف ترتيب المضيف/الضيف
// أحيانًا. أفضل جهد: غياب TheSports → خريطة فارغة → لا إثراء (لا عطل).
const WC_BRIDGE_TTL = 6 * 60 * 60 * 1000;
let wcTeamBridge: { at: number; map: Map<number, string> } | null = null;

export async function getWcTeamBridge(): Promise<Map<number, string>> {
  if (wcTeamBridge && Date.now() - wcTeamBridge.at < WC_BRIDGE_TTL) return wcTeamBridge.map;
  const map = new Map<number, string>();
  try {
    const comp = await getTsCompetitionExtra(WC_COMPETITION_ID);
    const [fixtures, pairs] = await Promise.all([
      getFixtures(),
      getTsCompetitionMatchPairs(WC_COMPETITION_ID, comp?.curSeasonId ?? null),
    ]);
    if (pairs.length > 0) {
      const votes = new Map<number, Map<string, number>>();
      const vote = (apiId: number, uuid: string) => {
        if (!apiId || !uuid) return;
        const m = votes.get(apiId) ?? new Map<string, number>();
        m.set(uuid, (m.get(uuid) ?? 0) + 1);
        votes.set(apiId, m);
      };
      for (const fx of fixtures) {
        if (!fx.home.id || !fx.away.id || !fx.timestamp) continue;
        const hits = pairs.filter((p) => Math.abs(p.time - fx.timestamp) <= 120);
        if (hits.length !== 1) continue; // تطابق فريد فقط → اتجاه آمن
        vote(fx.home.id, hits[0].home);
        vote(fx.away.id, hits[0].away);
      }
      for (const [apiId, m] of votes) {
        let best = "";
        let bestN = 0;
        for (const [uuid, n] of m) if (n > bestN) ((best = uuid), (bestN = n));
        if (best) map.set(apiId, best);
      }
    }
  } catch (error) {
    console.warn("[WorldCup] TheSports team bridge failed:", error);
  }
  wcTeamBridge = { at: Date.now(), map };
  return map;
}

export interface WcTeamExtra {
  marketValue: number | null;
  marketValueCurrency: string;
  foundation: number | null;
  squadSize: number | null;
}

/** بيانات إثرائية لمنتخب (قيمة سوقية/تأسيس/حجم القائمة) من TheSports — null إن تعذّر الربط. */
export async function getWcTeamExtra(teamId: number): Promise<WcTeamExtra | null> {
  const bridge = await getWcTeamBridge();
  const uuid = bridge.get(teamId);
  if (!uuid) return null;
  const x = await getTsTeamExtra(uuid);
  if (!x) return null;
  if (x.marketValue == null && x.foundation == null && x.totalPlayers == null) return null;
  return {
    marketValue: x.marketValue,
    marketValueCurrency: x.marketValueCurrency,
    foundation: x.foundation,
    squadSize: x.totalPlayers,
  };
}

// ---------- معلومات أساسية: المدرّب + الملعب (TheSports BASIC INFO) ----------
// معرّفا المدرّب/الملعب يأتيان من `team/additional/list` (نفس النداء المُكاش للقيمة
// السوقية) فلا نداء إضافي للجلب. ثم نحلّ كلًّا عبر `coach/list`/`venue/list?uuid=`.
// التعريب: اسم المدرّب/الملعب لاتيني عند المزوّد (لا i18n لهما) — نمرّره كما هو؛
// الجنسية/دولة الملعب نُعرّبها عبر i18n type 2 (country) أفضل جهد. كله best‑effort.

export interface WcCoachInfo {
  name: string;
  /** صورة المدرّب — "" إن غابت */
  photo: string;
  /** الخطة المفضّلة مثل "4-3-3" — null إن غابت */
  formation: string | null;
  age: number | null;
  /** جنسية المدرّب بالعربية إن توفّرت عبر i18n — null إن تعذّر */
  nationality: string | null;
}

export interface WcVenueInfo {
  name: string;
  capacity: number | null;
  city: string;
  /** دولة الملعب بالعربية إن توفّرت عبر i18n، وإلا الإنجليزية، وإلا null */
  country: string | null;
}

export interface WcTeamBasics {
  coach: WcCoachInfo | null;
  venue: WcVenueInfo | null;
}

/**
 * المدرّب (صورة/خطة/عمر/جنسية) وملعب المنتخب من TheSports عبر الجسر — كلاهما
 * مشتقّ من `team/additional/list` المُكاش. أفضل جهد: تعذّر الجسر/الجلب → null لكلٍّ.
 */
export async function getWcTeamBasics(teamId: number): Promise<WcTeamBasics> {
  const empty: WcTeamBasics = { coach: null, venue: null };
  const bridge = await getWcTeamBridge();
  const uuid = bridge.get(teamId);
  if (!uuid) return empty;
  const x = await getTsTeamExtra(uuid).catch(() => null);
  if (!x) return empty;

  const [tsCoach, tsVenue] = await Promise.all([
    x.coachId ? getTsCoach(x.coachId).catch(() => null) : Promise.resolve(null),
    x.venueId ? getTsVenue(x.venueId).catch(() => null) : Promise.resolve(null),
  ]);

  // تعريب الدول (جنسية المدرّب + دولة الملعب) عبر i18n type 2 — نداء مجمّع واحد.
  const countryIds = [tsCoach?.countryId, tsVenue?.countryId].filter((c): c is string => !!c);
  const countryAr =
    countryIds.length > 0
      ? await resolveTsNames(TS_I18N_TYPE.country, countryIds).catch(
          () => (_: string | null | undefined) => null as string | null,
        )
      : (_: string | null | undefined) => null as string | null;

  const coach: WcCoachInfo | null = tsCoach
    ? {
        name: tsCoach.name,
        photo: tsCoach.logo,
        formation: tsCoach.preferredFormation,
        age: tsCoach.age,
        nationality: countryAr(tsCoach.countryId),
      }
    : null;

  const venue: WcVenueInfo | null = tsVenue
    ? {
        name: tsVenue.name,
        capacity: tsVenue.capacity,
        city: tsVenue.city,
        country: countryAr(tsVenue.countryId) ?? tsVenue.country,
      }
    : null;

  return { coach, venue };
}

export interface WcFifaRank {
  rank: number;
  points: number | null;
  /** عدد المراكز المتغيّرة منذ التحديث السابق (موجب = صعد ▲) — null إن تعذّر */
  change: number | null;
}

/** تصنيف فيفا لمنتخب عبر الجسر (معرّف API-Football → uuid → ترتيب TheSports) — null إن تعذّر. */
export async function getWcTeamFifaRank(teamId: number): Promise<WcFifaRank | null> {
  const [bridge, ranking] = await Promise.all([getWcTeamBridge(), getTsFifaRanking()]);
  const uuid = bridge.get(teamId);
  if (!uuid) return null;
  const r = ranking.get(uuid);
  if (!r) return null;
  return { rank: r.rank, points: r.points, change: r.change };
}

// ---------- إحصاء المنتخب في البطولة (season/recent/team/stat عبر TheSports) ----------

export interface WcSeasonStatItem {
  label: string;
  value: number;
  /** القيمة نسبة مئوية (تُعرض مع %) */
  percent?: boolean;
}

export interface WcTeamSeasonStats {
  available: boolean;
  /** عدد مباريات المنتخب في البطولة حتى الآن */
  matches: number;
  items: WcSeasonStatItem[];
}

// كاش مشترك لإحصاء **كل** المنتخبات للموسم — نداء واحد (`season/recent/team/stat`)
// يخدم كل صفحات المنتخبات بدل نداء لكل منتخب.
const WC_SEASON_STATS_TTL = 30 * 60 * 1000;
let wcSeasonTeamStats: { at: number; map: Map<string, Record<string, number>> } | null = null;

async function getWcSeasonTeamStatsMap(): Promise<Map<string, Record<string, number>>> {
  if (wcSeasonTeamStats && Date.now() - wcSeasonTeamStats.at < WC_SEASON_STATS_TTL)
    return wcSeasonTeamStats.map;
  const map = new Map<string, Record<string, number>>();
  try {
    const comp = await getTsCompetitionExtra(WC_COMPETITION_ID);
    const season = comp?.curSeasonId ?? null;
    if (season) {
      const rows = await getTsSeasonTeamStats(season);
      for (const r of rows) map.set(r.teamId, r.values);
    }
  } catch {
    /* أفضل جهد */
  }
  wcSeasonTeamStats = { at: Date.now(), map };
  return map;
}

function statPct(num: number | undefined, den: number | undefined): number | null {
  if (!num || !den) return null;
  return Math.round((num / den) * 100);
}

/** إحصاء المنتخب الموسمي عبر الجسر (API-Football id → uuid → TheSports) — مُعرَّب ومُنتقى. */
export async function getWcTeamSeasonStats(teamId: number): Promise<WcTeamSeasonStats> {
  const empty: WcTeamSeasonStats = { available: false, matches: 0, items: [] };
  try {
    const bridge = await getWcTeamBridge();
    const uuid = bridge.get(teamId);
    if (!uuid) return empty;
    const map = await getWcSeasonTeamStatsMap();
    const v = map.get(uuid);
    if (!v) return empty;

    const items: WcSeasonStatItem[] = [];
    const push = (label: string, val: number | null | undefined, percent = false) => {
      if (val == null) return;
      items.push({ label, value: val, percent });
    };
    push("الأهداف المسجَّلة", v.goals);
    push("الأهداف المستقبَلة", v.goals_against);
    push("متوسّط الاستحواذ", v.ball_possession, true);
    push("التسديدات", v.shots);
    push("التسديدات على المرمى", v.shots_on_target);
    push("دقّة التمرير", statPct(v.passes_accuracy, v.passes), true);
    push("التمريرات المفتاحية", v.key_passes);
    push("الفرص الكبيرة المصنوعة", v.big_chance_created);
    push("الركنيات", v.corner_kicks);
    push("التدخّلات الدفاعية", v.tackles);
    push("الاعتراضات", v.interceptions);
    push("الثنائيات المكسوبة", statPct(v.duels_won, v.duels), true);
    push("الأخطاء المرتكبة", v.fouls);
    push("البطاقات الصفراء", v.yellow_cards);
    push("البطاقات الحمراء", v.red_cards);
    if (items.length === 0) return empty;
    return { available: true, matches: v.matches ?? 0, items };
  } catch {
    return empty;
  }
}

export interface WcInjury {
  /** اسم اللاعب معرَّبًا (best-effort) */
  player: string;
  /** سبب الغياب (نوع الإصابة معرَّب أو نصّ المزوّد) — null إن تعذّر */
  reason: string | null;
  /** نوع الغياب: إصابة/إيقاف/مشكوك… معرَّبًا — null إن تعذّر */
  status: string | null;
  /** العودة المتوقّعة (تاريخ ميلادي مختصر) — null إن غاب */
  until: string | null;
}

// تعريب سبب الإصابة: المزوّد يرسله إنجليزيًّا قصيرًا ("Calf Injury", "Suspension").
// نعرّب جزء الجسم + النمط "X Injury"، وإلا نُبقي النصّ كما هو (أفضل جهد).
const INJURY_PART_AR: Record<string, string> = {
  calf: "عضلة الساق",
  knee: "الركبة",
  hamstring: "أوتار الركبة الخلفية",
  ankle: "الكاحل",
  thigh: "الفخذ",
  groin: "أعلى الفخذ",
  achilles: "وتر العرقوب",
  muscle: "إصابة عضلية",
  back: "الظهر",
  shoulder: "الكتف",
  foot: "القدم",
  hip: "الورك",
  head: "الرأس",
  chest: "الصدر",
  wrist: "المعصم",
  hand: "اليد",
  toe: "إصبع القدم",
  rib: "الضلع",
  neck: "الرقبة",
  elbow: "المرفق",
  finger: "الإصبع",
  shin: "الساق",
  quadricep: "العضلة الرباعية",
  abductor: "العضلة المبعّدة",
};
const INJURY_WHOLE_AR: Record<string, string> = {
  suspension: "إيقاف",
  suspended: "إيقاف",
  ban: "إيقاف",
  illness: "مرض",
  ill: "مرض",
  knock: "رضّة",
  fatigue: "إجهاد",
  "unknown injury": "إصابة غير محدّدة",
  "knee injury": "إصابة في الركبة",
};

function translateInjuryReason(en: string | null): string | null {
  if (!en) return null;
  const low = en.toLowerCase().trim();
  if (INJURY_WHOLE_AR[low]) return INJURY_WHOLE_AR[low];
  const m = low.match(/^(.+?)\s+(injury|problem|strain|knock|surgery)$/);
  if (m && INJURY_PART_AR[m[1]]) return `إصابة في ${INJURY_PART_AR[m[1]]}`;
  if (INJURY_PART_AR[low]) return `إصابة في ${INJURY_PART_AR[low]}`;
  return en; // غير معروف — نُبقي الإنجليزي بدل تشويهه
}

function fmtInjuryDate(ts: number | null): string | null {
  if (!ts || ts <= 0) return null;
  try {
    return new Intl.DateTimeFormat("ar", {
      day: "numeric",
      month: "long",
      calendar: "gregory",
      timeZone: TIMEZONE,
    }).format(new Date(ts * 1000));
  } catch {
    return null;
  }
}

/**
 * إصابات/غيابات منتخب عبر الجسر (TheSports) — أفضل جهد: غياب TheSports أو تعذّر
 * الربط → []. الأسماء عربية عبر language/list type 5 (`name_aa`)، والسبب يُعرَّب.
 * نُسقط أي صفّ بلا اسم قابل للعرض (لا قيمة لإصابة بلا لاعب).
 */
export async function getWcTeamInjuries(teamId: number): Promise<WcInjury[]> {
  const bridge = await getWcTeamBridge();
  const uuid = bridge.get(teamId);
  if (!uuid) return [];
  const raw = await getTsTeamInjuries(uuid).catch(() => []);
  if (raw.length === 0) return [];

  // اسم اللاعب بالعربية مباشرةً من المزوّد (name_aa) — لا يأتي في رد الإصابات.
  const noop = (_: string | null | undefined): string | null => null;
  const nameOf = await resolveTsNames(
    TS_I18N_TYPE.player,
    raw.map((r) => r.playerId),
  ).catch(() => noop);

  const out: WcInjury[] = [];
  for (const r of raw) {
    const player = r.playerId ? nameOf(r.playerId) : null;
    if (!player) continue; // بلا اسم → لا نعرض
    out.push({
      player,
      reason: translateInjuryReason(r.reason),
      status: null, // لا حقل حالة في رد المزوّد — السبب يكفي
      until: fmtInjuryDate(r.endTime),
    });
  }
  return out;
}

// ---------- جسر معرّف المباراة (API-Football fixtureId ↔ TheSports match uuid) ----------
// نطابق فريقي مباراتنا (عبر جسر الفِرق → uuid) بزوج فرق مباراة TheSports من
// match/recent/list، فينكشف معرّف مباراة TheSports. تطابق الزوج فريد لكل مباراة
// (لا التباس بالتزامن كما في جسر النتيجة اللحظي الذي يعتمد الوقت وحده). أفضل جهد:
// غياب جسر الفِرق أو المباراة → null. يُكاش المعرّف بعد أول حلّ.
const wcMatchIdBridge = new Map<number, string>();

export async function getWcMatchTsId(fixtureId: number): Promise<string | null> {
  const cached = wcMatchIdBridge.get(fixtureId);
  if (cached) return cached;
  const [fixtures, bridge, comp] = await Promise.all([
    getFixtures(),
    getWcTeamBridge(),
    getTsCompetitionExtra(WC_COMPETITION_ID),
  ]);
  const fx = fixtures.find((f) => f.id === fixtureId);
  if (!fx?.home?.id || !fx?.away?.id) return null;
  const homeUuid = bridge.get(fx.home.id);
  const awayUuid = bridge.get(fx.away.id);
  if (!homeUuid || !awayUuid) return null;
  const pairs = await getTsCompetitionMatchPairs(WC_COMPETITION_ID, comp?.curSeasonId ?? null);
  const matches = pairs.filter(
    (p) =>
      p.id &&
      ((p.home === homeUuid && p.away === awayUuid) || (p.home === awayUuid && p.away === homeUuid)),
  );
  if (matches.length === 0) return null;
  // تكرار اللقاء نادر في المونديال — نختار الأقرب زمنيًّا لوقت بدء مباراتنا.
  const best = matches.reduce((a, b) =>
    Math.abs(b.time - fx.timestamp) < Math.abs(a.time - fx.timestamp) ? b : a,
  );
  if (!best.id) return null;
  wcMatchIdBridge.set(fixtureId, best.id);
  return best.id;
}

export interface WcTvChannel {
  name: string;
  country: string | null;
  url: string | null;
  logo: string | null;
}

/** قنوات بثّ مباراة عبر جسر المباراة (TheSports) — [] إن تعذّر الجسر/الجلب. */
export async function getWcMatchTv(fixtureId: number): Promise<WcTvChannel[]> {
  const uuid = await getWcMatchTsId(fixtureId).catch(() => null);
  if (!uuid) return [];
  return getTsMatchTv(uuid).catch(() => []);
}

// إحصاء الفريق المفصّل (TheSports) عبر جسر المباراة — للمباريات المنتهية احتياطًا
// خلف SportMonks. الحقول **مسمّاة** (متحقَّقة حيًّا) فنختار منها لائحة مألوفة.
// `acc` يحسب نسبة الدقّة من حقلَي العدّ (مثلًا passes + passes_accuracy).
const TS_TEAM_STAT_FIELDS: { field: string; label: string; pct?: boolean; accOf?: string }[] = [
  { field: "ball_possession", label: "الاستحواذ", pct: true },
  { field: "shots", label: "إجمالي التسديدات" },
  { field: "shots_on_target", label: "التسديدات على المرمى" },
  { field: "passes", label: "التمريرات" },
  { field: "passes_accuracy", label: "دقّة التمرير", pct: true, accOf: "passes" },
  { field: "corner_kicks", label: "الركنيات" },
  { field: "fouls", label: "الأخطاء" },
  { field: "offsides", label: "التسلّل" },
  { field: "yellow_cards", label: "البطاقات الصفراء" },
  { field: "red_cards", label: "البطاقات الحمراء" },
];

/** إحصاء الفريقين المفصّل لمباراة عبر الجسر (TheSports) — [] إن تعذّر. حقول مسمّاة. */
export async function getWcMatchTeamStats(fixtureId: number): Promise<WcStatistic[]> {
  const uuid = await getWcMatchTsId(fixtureId).catch(() => null);
  if (!uuid) return [];
  const sides = await getTsMatchTeamStats(uuid).catch(() => []);
  if (sides.length < 2) return [];

  // إقران مضيف/ضيف بمعرّف TheSports عبر الجسر؛ وإلا نفترض الترتيب [مضيف، ضيف].
  const fixtures = await getFixtures().catch(() => [] as WcFixture[]);
  const fx = fixtures.find((f) => f.id === fixtureId);
  const bridge = await getWcTeamBridge();
  const homeUuid = fx ? bridge.get(fx.home.id) : null;
  let home = sides[0];
  let away = sides[1];
  if (homeUuid && sides[1].teamId === homeUuid) {
    home = sides[1];
    away = sides[0];
  }

  // قيمة الحقل (مع حساب نسبة الدقّة عند الحاجة) — null لو الحقل غائب.
  const valOf = (side: TsTeamStatSide, f: (typeof TS_TEAM_STAT_FIELDS)[number]): number | null => {
    const v = side.values[f.field];
    if (v == null) return null;
    if (f.accOf) {
      const total = side.values[f.accOf];
      if (!total) return null;
      return Math.round((v / total) * 100);
    }
    return v;
  };

  const out: WcStatistic[] = [];
  for (const f of TS_TEAM_STAT_FIELDS) {
    const h = valOf(home, f);
    const a = valOf(away, f);
    if (h == null && a == null) continue;
    if ((h ?? 0) === 0 && (a ?? 0) === 0) continue; // صفر للطرفين = غير مُبلَّغ
    const suffix = f.pct ? "%" : "";
    out.push({ key: `ts:team:${f.field}`, label: f.label, home: `${h ?? 0}${suffix}`, away: `${a ?? 0}${suffix}` });
  }
  return out;
}

// ---------- تقييمات اللاعبين لكل مباراة (match/player_stats/detail) ----------
// لكل لاعب شارك: تقييم (rating) + دقائق + أهداف/صناعة + بطاقات. الأسماء معرَّبة
// (name_aa عبر language/list type5، واحتياط اسم التشكيلة). نُقرن مضيف/ضيف بالجسر.

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

export interface WcMatchPlayerStats {
  available: boolean;
  home: { team: WcTeam; players: WcPlayerStatLine[] } | null;
  away: { team: WcTeam; players: WcPlayerStatLine[] } | null;
}

/** تقييمات/إحصاء لاعبي المباراة من TheSports عبر الجسر — available:false إن تعذّر. */
export async function getWcMatchPlayerStats(fixtureId: number): Promise<WcMatchPlayerStats> {
  const empty: WcMatchPlayerStats = { available: false, home: null, away: null };
  const uuid = await getWcMatchTsId(fixtureId).catch(() => null);
  if (!uuid) return empty;
  const [rows, fixtures, lineup] = await Promise.all([
    getTsMatchPlayerStats(uuid).catch(() => []),
    getFixtures().catch(() => [] as WcFixture[]),
    getTsLineup(uuid).catch(() => null as TsLineup | null),
  ]);
  // نُبقي من شارك فقط (دقائق>0 أو تقييم فعلي)
  const played = rows.filter((r) => r.minutes > 0 || (r.rating ?? 0) > 0);
  if (played.length === 0) return empty;

  const fx = fixtures.find((f) => f.id === fixtureId);
  if (!fx) return empty;

  // أسماء عربية (name_aa) + احتياط اسم التشكيلة (إنجليزي/عربي)
  const nameOf = await resolveTsNames(TS_I18N_TYPE.player, played.map((r) => r.playerId));
  const lineupName = new Map<string, string>();
  if (lineup) {
    for (const p of [...lineup.home, ...lineup.away]) {
      const nm = p.nameAr || p.name;
      if (p.id && nm) lineupName.set(String(p.id), nm);
    }
  }

  // إقران مضيف/ضيف بمعرّف TheSports عبر الجسر
  const bridge = await getWcTeamBridge();
  const homeUuid = bridge.get(fx.home.id) ?? null;
  const awayUuid = bridge.get(fx.away.id) ?? null;

  const toLine = (r: (typeof played)[number]): WcPlayerStatLine | null => {
    const name = nameOf(r.playerId) || lineupName.get(r.playerId) || "";
    if (!name) return null;
    return {
      name,
      rating: (r.rating ?? 0) > 0 ? r.rating : null,
      starter: r.starter,
      minutes: r.minutes,
      goals: r.values.goals ?? 0,
      assists: r.values.assists ?? 0,
      yellow: r.values.yellow_cards ?? 0,
      red: r.values.red_cards ?? 0,
    };
  };

  // ترتيب: التقييم تنازليًّا (بلا تقييم أخيرًا)، ثم الدقائق
  const sortLines = (a: WcPlayerStatLine, b: WcPlayerStatLine) =>
    (b.rating ?? -1) - (a.rating ?? -1) || b.minutes - a.minutes;

  const homePlayers: WcPlayerStatLine[] = [];
  const awayPlayers: WcPlayerStatLine[] = [];
  const distinctTeams = Array.from(new Set(played.map((r) => r.teamId).filter(Boolean)));
  for (const r of played) {
    const line = toLine(r);
    if (!line) continue;
    let side: "home" | "away";
    if (homeUuid && r.teamId === homeUuid) side = "home";
    else if (awayUuid && r.teamId === awayUuid) side = "away";
    else side = r.teamId === distinctTeams[0] ? "home" : "away"; // احتياط: ترتيب الظهور
    (side === "home" ? homePlayers : awayPlayers).push(line);
  }
  homePlayers.sort(sortLines);
  awayPlayers.sort(sortLines);
  if (homePlayers.length === 0 && awayPlayers.length === 0) return empty;

  return {
    available: true,
    home: homePlayers.length ? { team: fx.home, players: homePlayers } : null,
    away: awayPlayers.length ? { team: fx.away, players: awayPlayers } : null,
  };
}

// ---------- الزخم/الضغط اللحظي من TheSports (match/trend/detail) ----------
// أسرع وأدقّ من SportMonks: مؤشّر زخم لحظي (−100..100) دقيقة‑بدقيقة. نُحوّله إلى
// نفس شكلَي WcMomentum/WcPressure فلا تتغيّر الواجهة. الاستحواذ من إحصاء الفريق
// (ball_possession). أفضل جهد: تعذّر الجسر/الترند → null فيتراجع الراوتر لـSportMonks.

function trendToPoints(values: { minute: number; value: number }[]) {
  return values.map((v) => ({
    label: `${v.minute}'`,
    minute: v.minute,
    home: v.value > 0 ? v.value : 0,
    away: v.value < 0 ? v.value : 0, // سالبة لتُرسم أسفل الصفر (كاصطلاح SportMonks)
    net: v.value,
  }));
}

/** الزخم اللحظي من TheSports — null إن تعذّر (يتراجع الراوتر لـSportMonks). */
export async function getWcMomentumTs(fixtureId: number): Promise<WcMomentum | null> {
  const uuid = await getWcMatchTsId(fixtureId).catch(() => null);
  if (!uuid) return null;
  const [trend, fixtures, sides] = await Promise.all([
    getTsMatchTrend(uuid),
    getFixtures().catch(() => [] as WcFixture[]),
    getTsMatchTeamStats(uuid).catch(() => [] as TsTeamStatSide[]),
  ]);
  if (!trend || trend.values.length === 0) return null;
  const fx = fixtures.find((f) => f.id === fixtureId);
  const live = !!fx?.status.live;

  // الاستحواذ من إحصاء الفريق (إقران مضيف/ضيف عبر الجسر)
  let possession: { home: number; away: number } | null = null;
  if (fx && sides.length >= 2) {
    const bridge = await getWcTeamBridge();
    const homeUuid = bridge.get(fx.home.id);
    let home = sides[0];
    let away = sides[1];
    if (homeUuid && sides[1].teamId === homeUuid) {
      home = sides[1];
      away = sides[0];
    }
    const h = home.values.ball_possession;
    const a = away.values.ball_possession;
    if (h != null || a != null) {
      possession = {
        home: h ?? (a != null ? 100 - a : 0),
        away: a ?? (h != null ? 100 - h : 0),
      };
    }
  }

  return { available: true, live, possession, points: trendToPoints(trend.values) };
}

/** مؤشّر الضغط اللحظي من TheSports — null إن تعذّر. */
export async function getWcPressureTs(fixtureId: number): Promise<WcPressure | null> {
  const uuid = await getWcMatchTsId(fixtureId).catch(() => null);
  if (!uuid) return null;
  const [trend, fixtures] = await Promise.all([
    getTsMatchTrend(uuid),
    getFixtures().catch(() => [] as WcFixture[]),
  ]);
  if (!trend || trend.values.length === 0) return null;
  const live = !!fixtures.find((f) => f.id === fixtureId)?.status.live;
  const last = trend.values[trend.values.length - 1].value;
  const latest: WcPressure["latest"] = {
    side: last > 0 ? "home" : last < 0 ? "away" : "even",
    value: Math.abs(last),
  };
  return { available: true, live, latest, points: trendToPoints(trend.values) };
}

// ---------- التشكيلات والخطط من TheSports (match/lineup/detail) ----------
// نحوّل قوائم TheSports إلى WcLineup[] (نفس شكل API-Football) ليعرضها مركز
// المباراة دون تغيير. الإحداثيات x/y → شبكة "صف:عمود" عند توفّرها لرسم الملعب،
// وإلا grid=null فتظهر القوائم نصيًّا. الأسماء معرَّبة (name_aa) مع fallback إنجليزي.

// x = عمق الملعب (0=خط مرمى الفريق .. 100=مرمى الخصم). نحوّله إلى أرقام صفوف
// متتابعة (الحارس صف 1) بتجميع اللاعبين على قيم x المتقاربة، والعمود من ترتيب y.
function tsPlayersToGrid(players: TsLineupPlayer[]): Map<string, string> {
  const grid = new Map<string, string>();
  const withXy = players.filter((p) => p.starter && (p.x != null || p.y != null) && (p.x || p.y));
  if (withXy.length < 7) return grid; // إحداثيات غير موثوقة (أصفار) → بلا ملعب
  // اجمع على قيم x متقاربة (±6) كصفوف
  const sorted = [...withXy].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  const rows: TsLineupPlayer[][] = [];
  for (const p of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs((last[0].x ?? 0) - (p.x ?? 0)) <= 6) last.push(p);
    else rows.push([p]);
  }
  rows.forEach((row, ri) => {
    row.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    row.forEach((p, ci) => grid.set(p.id, `${ri + 1}:${ci + 1}`));
  });
  return grid;
}

function tsLineupToWc(
  side: TsLineupPlayer[],
  formation: string | null,
  team: WcTeam,
): WcLineup {
  const gridMap = tsPlayersToGrid(side);
  const toPlayer = (p: TsLineupPlayer): WcLineupPlayer => ({
    id: 0, // معرّفات TheSports نصّية ولا تطابق API-Football → لا فتح بطاقة لاعب
    name: p.nameAr || p.name,
    number: p.shirtNumber,
    position: p.position,
    grid: gridMap.get(p.id) ?? null,
  });
  return {
    teamId: team.id,
    teamName: team.name,
    formation,
    coach: "",
    startXI: side.filter((p) => p.starter).map(toPlayer),
    substitutes: side.filter((p) => !p.starter).map(toPlayer),
  };
}

/** تشكيلتا المباراة من TheSports بشكل WcLineup[] — [] إن تعذّر الجسر/الجلب. */
export async function getWcLineupsTs(fixtureId: number): Promise<WcLineup[]> {
  const uuid = await getWcMatchTsId(fixtureId).catch(() => null);
  if (!uuid) return [];
  const [lineup, fixtures] = await Promise.all([
    getTsLineup(uuid).catch(() => null as TsLineup | null),
    getFixtures().catch(() => [] as WcFixture[]),
  ]);
  if (!lineup) return [];
  const fx = fixtures.find((f) => f.id === fixtureId);
  if (!fx) return [];
  const out: WcLineup[] = [];
  if (lineup.home.length > 0) out.push(tsLineupToWc(lineup.home, lineup.homeFormation, fx.home));
  if (lineup.away.length > 0) out.push(tsLineupToWc(lineup.away, lineup.awayFormation, fx.away));
  return out;
}

// ---------- القيمة السوقية للاعبين (player/with_stat/list + team/squad/list) ----------
// نربط لاعب API-Football (اسم إنجليزي + رقم قميص) بلاعب TheSports (uuid) عبر قائمة
// منتخب TheSports، ثم نأخذ قيمته السوقية من خريطة البطولة. أفضل جهد: تعذّر الربط
// → خريطة فارغة (لا قيمة، لا عطل).

/** تطبيع اسم لاتيني للمطابقة: حروف صغيرة، بلا تشكيل/علامات، مسافة واحدة. */
function normNameKey(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface WcPlayerMarketInfo {
  marketValue: number | null;
  currency: string;
  tsPlayerId: string;
}

// نطابق لاعب API-Football بلاعب TheSports داخل المنتخب: الاسم الكامل المطبّع أولًا
// (API-Football يعطي اسمًا كاملًا في players/squads فالمطابقة دقيقة)، ثم رقم القميص
// مع تأكيد تقاطع اسم العائلة (حماية من إعادة ترقيم)، ثم اسم العائلة الفريد.
function matchTsPlayer(
  ap: { enName: string; number: number | null },
  tsSquad: { id: string; name: string; shirtNumber: number | null }[],
  byName: Map<string, { id: string; name: string; shirtNumber: number | null }>,
  byNum: Map<number, { id: string; name: string; shirtNumber: number | null }>,
  byLast: Map<string, { id: string; name: string; shirtNumber: number | null }[]>,
): string | null {
  const key = normNameKey(ap.enName);
  const apLast = key.split(" ").pop() ?? "";
  const exact = key ? byName.get(key) : undefined;
  if (exact) return exact.id;
  if (ap.number) {
    const byNumber = byNum.get(ap.number);
    if (byNumber) {
      const tsLast = normNameKey(byNumber.name).split(" ").pop() ?? "";
      // تأكيد تقاطع اسم العائلة لتجنّب مطابقة رقم للاعب مختلف
      if (!apLast || !tsLast || apLast === tsLast || tsLast.includes(apLast) || apLast.includes(tsLast)) {
        return byNumber.id;
      }
    }
  }
  if (apLast) {
    const cands = byLast.get(apLast);
    if (cands && cands.length === 1) return cands[0].id; // اسم عائلة فريد فقط
  }
  return null;
}

/**
 * يربط لاعبي API-Football (id + اسم إنجليزي + رقم) بمعرّفات TheSports عبر قائمة
 * المنتخب، ثم يجلب قيمتهم السوقية الحاليّة من player/market/list (آخر قيمة في
 * التاريخ). نداء/لاعب مكاش 24س. أفضل جهد: تعذّر أي شيء → خريطة فارغة (لا قيمة).
 */
export async function getWcSquadMarket(
  teamId: number,
  apiPlayers: { id: number; enName: string; number: number | null }[],
): Promise<Map<number, WcPlayerMarketInfo>> {
  const out = new Map<number, WcPlayerMarketInfo>();
  try {
    const bridge = await getWcTeamBridge();
    const tsTeam = bridge.get(teamId);
    if (!tsTeam) return out;
    const tsSquad = await getTsTeamSquad(tsTeam);
    if (tsSquad.length === 0) return out;

    const byName = new Map<string, (typeof tsSquad)[number]>();
    const byNum = new Map<number, (typeof tsSquad)[number]>();
    const byLast = new Map<string, (typeof tsSquad)[number][]>();
    for (const s of tsSquad) {
      const key = normNameKey(s.name);
      if (key) byName.set(key, s);
      if (s.shirtNumber) byNum.set(s.shirtNumber, s);
      const last = key.split(" ").pop() ?? "";
      if (last) {
        if (!byLast.has(last)) byLast.set(last, []);
        byLast.get(last)!.push(s);
      }
    }

    const matched: { apiId: number; tsId: string }[] = [];
    for (const ap of apiPlayers) {
      const tsId = matchTsPlayer(ap, tsSquad, byName, byNum, byLast);
      if (tsId) matched.push({ apiId: ap.id, tsId });
    }
    if (matched.length === 0) return out;

    // القيمة الحاليّة = آخر قيمة في تاريخ player/market/list (نداء/لاعب مكاش 24س)
    const limit = pLimit(5);
    await Promise.all(
      matched.map(({ apiId, tsId }) =>
        limit(async () => {
          const hist = await getTsPlayerMarketHistory(tsId).catch(() => []);
          const last = hist.length ? hist[hist.length - 1] : null;
          out.set(apiId, {
            marketValue: last ? last.value : null,
            currency: last ? last.currency : "€",
            tsPlayerId: tsId,
          });
        }),
      ),
    );
  } catch {
    /* أفضل جهد */
  }
  return out;
}

/** تاريخ القيمة السوقية للاعب (عبر منتخبه) — [] إن تعذّر. */
export async function getWcPlayerMarketHistory(
  teamId: number,
  player: { id: number; enName: string; number: number | null },
): Promise<{ marketValue: number | null; currency: string; history: { time: number; value: number }[] }> {
  const empty = { marketValue: null as number | null, currency: "€", history: [] as { time: number; value: number }[] };
  const market = await getWcSquadMarket(teamId, [player]).catch(() => new Map<number, WcPlayerMarketInfo>());
  const info = market.get(player.id);
  if (!info) return empty;
  const hist = await getTsPlayerMarketHistory(info.tsPlayerId).catch(() => []);
  return {
    marketValue: info.marketValue ?? (hist.length ? hist[hist.length - 1].value : null),
    currency: info.currency,
    history: hist.map((h) => ({ time: h.time, value: h.value })),
  };
}

export interface WcPlayerMarket {
  available: boolean;
  marketValue: number | null;
  currency: string;
  history: { time: number; value: number }[];
}

/**
 * القيمة السوقية وتاريخها للاعب عبر معرّفه (API-Football): نجلب اسمه الإنجليزي
 * ومنتخبه ورقمه، ثم نربطه بـTheSports. كاش طويل (القيمة تتغيّر ببطء).
 */
export async function getPlayerMarket(playerId: number): Promise<WcPlayerMarket> {
  const empty: WcPlayerMarket = { available: false, marketValue: null, currency: "€", history: [] };
  return withSWR(`wc:playermarket:${playerId}`, PLAYER_CARD_TTL, PLAYER_CARD_TTL * 2, async () => {
    const [profileRows, statsRows] = await Promise.all([
      apiGet("players/profiles", { player: playerId }),
      apiGet("players", { id: playerId, season: SEASON, league: LEAGUE_ID }).catch(() => [] as any[]),
    ]);
    const p = profileRows[0]?.player;
    if (!p?.id) return empty;
    const enName = [p.firstname, p.lastname].filter(Boolean).join(" ").trim() || p.name || "";
    const st = statsRows[0]?.statistics?.[0];
    const teamId = st?.team?.id ?? 0;
    const number = st?.games?.number ?? p.number ?? null;
    if (!teamId || !enName) return empty;
    const res = await getWcPlayerMarketHistory(teamId, { id: playerId, enName, number });
    if (res.marketValue == null && res.history.length === 0) return empty;
    return { available: true, marketValue: res.marketValue, currency: res.currency, history: res.history };
  });
}

export interface WcCompetitionFacts {
  defendingChampion: WcTeam | null;
  defendingChampionTitles: number | null;
  mostTitles: { teams: WcTeam[]; count: number } | null;
  host: string | null;
}

/** حقائق البطولة من TheSports: حامل اللقب + الأكثر تتويجًا + الدول المضيفة. */
export async function getWcCompetitionFacts(): Promise<WcCompetitionFacts> {
  const empty: WcCompetitionFacts = {
    defendingChampion: null,
    defendingChampionTitles: null,
    mostTitles: null,
    host: null,
  };
  try {
    const comp = await getTsCompetitionExtra(WC_COMPETITION_ID);
    if (!comp) return empty;
    const [bridge, teams] = await Promise.all([getWcTeamBridge(), getTeams().catch(() => [] as WcTeam[])]);
    const byId = new Map(teams.map((t) => [t.id, t]));
    const rev = new Map<string, number>();
    for (const [id, uuid] of bridge) rev.set(uuid, id);
    const toTeam = (uuid: string | null): WcTeam | null => {
      if (!uuid) return null;
      const id = rev.get(uuid);
      return id ? byId.get(id) ?? null : null;
    };
    const champTeams = comp.mostTitlesTeamIds.map(toTeam).filter((t): t is WcTeam => !!t);
    return {
      defendingChampion: toTeam(comp.titleHolderTeamId),
      defendingChampionTitles: comp.titleHolderCount,
      mostTitles: comp.mostTitlesCount != null && champTeams.length > 0 ? { teams: champTeams, count: comp.mostTitlesCount } : null,
      host: localizeHostCountries(comp.host),
    };
  } catch (error) {
    console.warn("[WorldCup] competition facts failed:", error);
    return empty;
  }
}

// أسماء الدول المضيفة من TheSports تأتي إنجليزية مفصولة بفواصل ("United States,Canadian,Mexico").
const HOST_COUNTRY_AR: Record<string, string> = {
  "united states": "الولايات المتحدة",
  usa: "الولايات المتحدة",
  canadian: "كندا",
  canada: "كندا",
  mexico: "المكسيك",
};
function localizeHostCountries(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((c) => HOST_COUNTRY_AR[c.toLowerCase()] ?? c);
  return parts.length ? parts.join("، ") : null;
}

// ---------- صفحة المنتخب المتكاملة ----------
// تجمّع كل ما يخص منتخبًا واحدًا في طلب واحد: هويته + مجموعته وترتيبه +
// كل مبارياته (منتهية/مباشرة/قادمة) + قائمته الكاملة + المدرّب. كلها مبنية
// على دوال مكاشة بـ SWR، فالتجميع لا يكلّف المزود نداءات تُذكر.

export interface WcTeamProfile {
  team: WcTeam;
  isSaudi: boolean;
  coach: string | null;
  /** مجموعة المنتخب كاملة (الأربعة) لتظليل صفّه — null قبل اعتماد القرعة/الجداول */
  group: WcGroup | null;
  fixtures: WcFixture[];
  squad: WcSquadPlayer[];
  /** إثراء TheSports (قيمة سوقية/تأسيس/حجم القائمة) — null إن تعذّر */
  extra: WcTeamExtra | null;
  /** تصنيف فيفا للمنتخب (TheSports) — null إن تعذّر الربط/الجلب */
  fifaRank: WcFifaRank | null;
  /** إصابات/غيابات المنتخب (TheSports) — [] إن تعذّر/لا يوجد */
  injuries: WcInjury[];
  /** إحصاء المنتخب في البطولة (TheSports season stats) — available:false إن تعذّر */
  seasonStats: WcTeamSeasonStats;
  /** المدرّب (صورة/خطة/عمر/جنسية) من TheSports — null إن تعذّر */
  coachInfo: WcCoachInfo | null;
  /** ملعب المنتخب (اسم/سعة/مدينة/دولة) من TheSports — null إن تعذّر */
  venue: WcVenueInfo | null;
}

export async function getTeamProfile(teamId: number): Promise<WcTeamProfile | null> {
  const [fixtures, squad, groups, teams, extra, fifaRank, injuries, seasonStats, basics] = await Promise.all([
    getFixtures(),
    getSquad(teamId).catch(() => null),
    getStandings().catch(() => [] as WcGroup[]),
    getTeams().catch(() => [] as WcTeam[]),
    getWcTeamExtra(teamId).catch(() => null),
    getWcTeamFifaRank(teamId).catch(() => null),
    getWcTeamInjuries(teamId).catch(() => [] as WcInjury[]),
    getWcTeamSeasonStats(teamId).catch(() => ({ available: false, matches: 0, items: [] }) as WcTeamSeasonStats),
    getWcTeamBasics(teamId).catch(() => ({ coach: null, venue: null }) as WcTeamBasics),
  ]);

  const teamFixtures = fixtures
    .filter((f) => f.home.id === teamId || f.away.id === teamId)
    .sort((a, b) => a.timestamp - b.timestamp);

  // هوية المنتخب: القائمة أولًا (اسم + شعار)، ثم قائمة المنتخبات، ثم من أي مباراة له
  let team: WcTeam | null = squad?.team ?? teams.find((t) => t.id === teamId) ?? null;
  if (!team && teamFixtures.length > 0) {
    const fx = teamFixtures[0];
    team = fx.home.id === teamId ? fx.home : fx.away;
  }
  if (!team || !team.id) return null;

  const group = groups.find((g) => g.rows.some((r) => r.team.id === teamId)) ?? null;

  // المدرّب أفضل جهد — لا يُفشل الصفحة إن غاب
  let coach: string | null = null;
  try {
    coach = await getCoach(teamId);
  } catch (error) {
    console.warn(`[WorldCup] coach ${teamId} failed:`, error);
  }

  return {
    team,
    isSaudi: teamId === SAUDI_TEAM_ID,
    coach,
    group,
    fixtures: teamFixtures,
    squad: squad?.players ?? [],
    extra,
    fifaRank,
    injuries,
    seasonStats,
    coachInfo: basics.coach,
    venue: basics.venue,
  };
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
  "AFC Champions League Elite": "دوري أبطال آسيا للنخبة",
  "AFC Champions League Two": "دوري أبطال آسيا الثاني",
  "Division 1": "دوري يلو لأندية الدرجة الأولى",
  "CAF Champions League": "دوري أبطال أفريقيا",
  "Copa Libertadores": "كأس ليبرتادوريس",
  "UEFA Europa League": "الدوري الأوروبي",
  "Europa League": "الدوري الأوروبي",
  "UEFA Super Cup": "كأس السوبر الأوروبي",
  "UEFA Nations League": "دوري الأمم الأوروبية",
  "Saudi League": "دوري روشن السعودي",
  "Pro League": "دوري روشن السعودي",
  "Premier League": "الدوري الممتاز",
  "First Division": "دوري يلو لأندية الدرجة الأولى",
  "Second Division": "دوري الدرجة الثانية السعودي",
  "Super Cup": "كأس السوبر السعودي",
  "King Cup": "كأس خادم الحرمين الشريفين",
  "King's Cup": "كأس خادم الحرمين الشريفين",
  "Women's Premier League": "الدوري السعودي الممتاز للسيدات",
  "Women Premier League": "الدوري السعودي الممتاز للسيدات",
  "Womens Premier League": "الدوري السعودي الممتاز للسيدات",
  "Saudi Women's Premier League": "الدوري السعودي الممتاز للسيدات",
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
  Guyana: "غويانا",
  "French Guiana": "غويانا الفرنسية",
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

export interface WcPlayerIdentityEn {
  firstname: string | null;
  lastname: string | null;
  dob: string | null;
}

/** هوية اللاعب الإنجليزية (الاسم الأول/الأخير + الميلاد) — لجسر لاعب SportMonks. */
export async function getPlayerIdentityEn(playerId: number): Promise<WcPlayerIdentityEn | null> {
  return withSWR(`wc:playeridEn:${playerId}`, PLAYER_CARD_TTL, PLAYER_CARD_TTL * 2, async () => {
    const rows = await apiGet("players/profiles", { player: playerId });
    const p = rows[0]?.player;
    if (!p?.id) return null;
    return { firstname: p.firstname ?? null, lastname: p.lastname ?? null, dob: p.birth?.date ?? null };
  });
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
// لوحات اللاعبين المجمعة تُعتمد عند المزود بفاصل بعد المباريات (مرة أو مرتين يوميًا)،
// بينما الأحداث لحظية وبين أيدينا — فنجمع الهدافين/الصناعة/البطاقات بأنفسنا ونقارن:
// إن كان مجموع عدّنا أعلى فلوحة المزود متأخرة ونعرض تجميعنا، وإلا فلوحته الأكمل
// (دقائق اللعب والصور وعدد المباريات) هي المرجع.

// المقارنة تعتمد المجموع الكامل لكل مصدر (لا مجموع العشرة الأوائل المقتطعة): أوائل
// البطولة يتعادل عشرات اللاعبين عند هدف/بطاقة واحدة، فيتساوى مجموعا العشرة بين لوحة
// المزود المتأخرة ولوحتنا الحية — وكانت المساواة تُرجّح المزود فتتجمّد الأسماء يومين
// حتى يحدّث المزود تجميعه. المجموع الكامل يكشف تأخّر المزود فورًا فنعرض لوحة الأحداث.
function freshestBoard<T extends { id: number; photo: string; minutes: number; matches: number }>(
  provider: T[] | null | undefined,
  providerTotal: number,
  fromEvents: T[],
  eventsTotal: number
): T[] {
  const board = provider ?? [];
  if (board.length > 0 && providerTotal >= eventsTotal) return board;
  // المزود متأخر — تجميعنا هو الأحدث، ونثريه بدقائق/مباريات/صور صفه المطابق
  const byId = new Map(board.map((row) => [row.id, row]));
  return fromEvents.map((row) => {
    const known = row.id ? byId.get(row.id) : undefined;
    return known
      ? { ...row, minutes: known.minutes, matches: known.matches, photo: row.photo || known.photo }
      : row;
  });
}

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
  // أحدث مساهمة (بدء المباراة + دقيقة الحدث) — كاسر تعادل يرفع صاحب أحدث هدف/بطاقة
  // فوق صاحب أول أمس عند تساوي العدد، فلا تبدو اللوحة جامدة بينما المباريات تُلعب
  lastAt: number;
}

interface WcRacesFromEvents {
  scorers: WcScorer[];
  assists: WcLeader[];
  cards: WcLeader[];
  // مجاميع كاملة (كل اللاعبين لا العشرة الأوائل) لمقارنة الحداثة مع لوحة المزود
  totals: { goals: number; assists: number; cards: number };
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
      at: number,
      apply: (t: WcRaceTally) => void
    ) => {
      const team = teamById.get(teamId);
      if (!name || !team) return;
      const key = `${teamId}:${name}`;
      let tally = tallies.get(key);
      if (!tally) {
        // صور المزود تتبع معرف اللاعب مباشرة
        const photo = playerId ? `https://media.api-sports.io/football/players/${playerId}.png` : "";
        tally = { playerId, name, team, photo, goals: 0, penalties: 0, assists: 0, yellow: 0, red: 0, lastAt: at };
        tallies.set(key, tally);
      } else {
        if (!tally.photo && playerId) {
          tally.playerId = playerId;
          tally.photo = `https://media.api-sports.io/football/players/${playerId}.png`;
        }
        if (at > tally.lastAt) tally.lastAt = at;
      }
      apply(tally);
    };

    // أحداث المباراة المنتهية لا تتغير — كاش طويل خاص بها كي لا يستنزف التجميع
    // الدوري (كل 30 ثانية) حصة المزود بإعادة جلب تفاصيل كل مباريات البطولة
    const FINISHED_EVENTS_TTL = 60 * 60 * 1000;
    // حدّ تزامن صارم: لا نطلق أكثر من MATCH_FETCH_CONCURRENCY نداءً للمزود معًا،
    // ونكتفي بمسار الأحداث الخفيف (نداء واحد لكل مباراة) بدل التفاصيل الكاملة.
    const limit = pLimit(MATCH_FETCH_CONCURRENCY);
    const eventLists = await Promise.all(
      started.map((f): Promise<{ at: number; events: WcMatchEvent[] }> =>
        limit(async () => {
          try {
            const events = f.status.finished
              ? await withSWR(
                  `wc:raceEvents:${f.id}`,
                  FINISHED_EVENTS_TTL,
                  FINISHED_EVENTS_TTL * 2,
                  async () => await getMatchEventsOnly(f.id)
                )
              : await getMatchEventsOnly(f.id);
            return { at: f.timestamp, events };
          } catch {
            return { at: f.timestamp, events: [] };
          }
        })
      )
    );
    for (const { at, events } of eventLists) {
      for (const ev of events) {
        // ترتيب زمني داخل البطولة: بدء المباراة + دقيقة الحدث — يُرجّح الأحدث عند التعادل
        const evAt = at + (ev.minute ?? 0) * 60;
        if (ev.type === "goal" && ev.detail !== "Own Goal") {
          // الهدف العكسي لا يدخل سباق الهداف، وركلة الجزاء الضائعة نوع مستقل أصلًا
          bump(ev.player, ev.playerId, ev.teamId, evAt, (t) => {
            t.goals += 1;
            if (ev.detail === "Penalty") t.penalties += 1;
          });
          if (ev.assist) bump(ev.assist, ev.assistId, ev.teamId, evAt, (t) => { t.assists += 1; });
        } else if (ev.type === "yellow-card") {
          bump(ev.player, ev.playerId, ev.teamId, evAt, (t) => {
            t.yellow += 1;
            if (ev.detail === "Second Yellow card") t.red += 1; // طرد بإنذارين
          });
        } else if (ev.type === "red-card") {
          bump(ev.player, ev.playerId, ev.teamId, evAt, (t) => { t.red += 1; });
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
        // عند تساوي الأهداف ثم الصناعة نرفع صاحب أحدث هدف — وإلا بقي هدّاف اليوم
        // تحت هدّاف أول أمس فتبدو اللوحة جامدة رغم استمرار المباريات
        .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.lastAt - a.lastAt)
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
        .sort((a, b) => b.assists - a.assists || b.goals - a.goals || b.lastAt - a.lastAt)
        .slice(0, 10)
        .map(toLeader),
      cards: all
        .filter((t) => t.yellow + t.red > 0)
        // الطرد أهمّ حدث انضباطي وأندر من الإنذار — نرتّب بالحمراء أولًا كي لا
        // يغرق اللاعب المطرود تحت أصحاب الإنذار الواحد فيُقتطع خارج العشرة الأوائل
        .sort((a, b) => b.red - a.red || b.yellow - a.yellow || b.lastAt - a.lastAt)
        .slice(0, 10)
        .map(toLeader),
      totals: {
        goals: all.reduce((sum, t) => sum + t.goals, 0),
        assists: all.reduce((sum, t) => sum + t.assists, 0),
        cards: all.reduce((sum, t) => sum + t.yellow + t.red, 0),
      },
    };
  });
}

export async function getTopAssists(): Promise<WcLeader[]> {
  const provider = await withSWR("wc:assists", CACHE_TTL.LONG, CACHE_TTL.LONG * 2, async () => {
    const rows = await apiGet("players/topassists", { league: LEAGUE_ID, season: SEASON });
    const total = rows.reduce((sum: number, row: any) => sum + (row.statistics?.[0]?.goals?.assists ?? 0), 0);
    const top = rows.slice(0, 10);
    const tr = await resolveNames(top.map((row: any) => row.player?.name));
    const board = top.map((row: any, i: number) => mapLeader(row, i, tr));
    return { board, total };
  });
  const events = await aggregateRacesFromEvents();
  return freshestBoard(provider.board, provider.total, events.assists, events.totals.assists);
}

export async function getTopCards(): Promise<WcLeader[]> {
  const provider = await withSWR("wc:cards", CACHE_TTL.LONG, CACHE_TTL.LONG * 2, async () => {
    // المزود يرتّب البطاقات في قائمتين منفصلتين: أعلى صفراء وأعلى حمراء. لو اكتفينا
    // بالصفراء وحدها فاللاعب الذي نال طردًا مباشرًا دون إنذارات كافية لا يظهر إطلاقًا،
    // فيبقى عمود الحمراء صفرًا. نجلب القائمتين معًا ونوحّدهما حسب معرّف اللاعب —
    // كلتاهما تحملان إحصاءات الموسم الكاملة (صفراء + حمراء)، فالدمج بلا تكرار.
    const [yellowRows, redRows] = await Promise.all([
      apiGet("players/topyellowcards", { league: LEAGUE_ID, season: SEASON }),
      apiGet("players/topredcards", { league: LEAGUE_ID, season: SEASON }),
    ]);
    const byId = new Map<number, any>();
    for (const row of [...yellowRows, ...redRows]) {
      const id = row.player?.id ?? 0;
      if (id && !byId.has(id)) byId.set(id, row);
    }
    const merged = [...byId.values()];
    // المجموع الكامل (صفراء + حمراء + طرد بإنذارين) عبر كل اللاعبين قبل الاقتطاع
    const total = merged.reduce((sum: number, row: any) => {
      const c = row.statistics?.[0]?.cards ?? {};
      return sum + (c.yellow ?? 0) + (c.red ?? 0) + (c.yellowred ?? 0);
    }, 0);
    const tr = await resolveNames(merged.map((row: any) => row.player?.name));
    const board = merged
      .map((row: any) => mapLeader(row, 0, tr))
      // نفس ترتيب لوحة الأحداث: الحمراء أولًا ثم الصفراء حتى لا تختفي الطرود
      .sort((a, b) => b.red - a.red || b.yellow - a.yellow)
      .slice(0, 10)
      .map((leader, i) => ({ ...leader, rank: i + 1 }));
    return { board, total };
  });
  const events = await aggregateRacesFromEvents();
  return freshestBoard(provider.board, provider.total, events.cards, events.totals.cards);
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

/**
 * يبني خريطة «معرّف اللاعب → أفضل اسم خام» من كل مصادر المباراة في الرد الواحد
 * (أحداث + تشكيلات + تقييمات). السبب: API-Football يرسل اسم اللاعب في الأحداث
 * مختصرًا («F. Al-Buraikan») وأحيانًا بصيغة لا يلتقطها القاموس الثابت، فيتراجع
 * النقل الصوتي للـAI الذي قد يخطئ توسعة الحرف الأول (مثال حقيقي: «F. Al-Buraikan»
 * → «فهد البريكين» بدل «فراس البريكان»). أما التشكيلات/التقييمات فتحمل نفس
 * المعرّف بالاسم الكامل، فنوحّد التعريب بالمعرّف الثابت لا بسلسلة الاسم المتقلّبة:
 * هكذا يطابق اسم الحدث/التقرير اسمَ بطاقة اللاعب تمامًا.
 *
 * المفاضلة لكل معرّف: ما هو في القاموس الثابت أولًا، ثم الاسم الأطول (الأكمل غالبًا).
 */
function collectBestNamesById(item: any): Map<number, string> {
  const best = new Map<number, string>();
  const consider = (id: any, name: any) => {
    if (typeof id !== "number" || !name || typeof name !== "string" || !name.trim()) return;
    const candidate = name.trim();
    const prev = best.get(id);
    if (prev === undefined) {
      best.set(id, candidate);
      return;
    }
    const prevInDict = !!WC_PLAYER_AR[prev];
    const candInDict = !!WC_PLAYER_AR[candidate];
    if (candInDict && !prevInDict) {
      best.set(id, candidate);
    } else if (candInDict === prevInDict && candidate.length > prev.length) {
      best.set(id, candidate);
    }
  };
  for (const ev of item?.events ?? []) {
    consider(ev.player?.id, ev.player?.name);
    consider(ev.assist?.id, ev.assist?.name);
  }
  for (const lineup of item?.lineups ?? []) {
    for (const p of lineup.startXI ?? []) consider(p.player?.id, p.player?.name);
    for (const p of lineup.substitutes ?? []) consider(p.player?.id, p.player?.name);
  }
  for (const teamBlock of item?.players ?? []) {
    for (const p of teamBlock.players ?? []) consider(p.player?.id, p.player?.name);
  }
  return best;
}

/**
 * يرجّع دالة تعريب تفضّل المعرّف الثابت: لو توفّر معرّف اللاعب، تُعرّب أفضل اسم
 * خام له (الأكمل) بدل سلسلة الاسم المحلية المتقلّبة. تتراجع لتعريب الاسم كما ورد.
 */
function nameResolverById(
  tr: (name: string | null | undefined) => string,
  bestById: Map<number, string>,
): (id: number | null | undefined, name: string | null | undefined) => string {
  return (id, name) => {
    const best = typeof id === "number" ? bestById.get(id) : undefined;
    return tr(best ?? name);
  };
}

/** يعرّب أحداث المباراة فقط — مشترك بين التفاصيل الكاملة والمسار الخفيف. */
function localizeMatchEvents(
  item: any,
  tr: (name: string | null | undefined) => string,
  bestById?: Map<number, string>,
): WcMatchEvent[] {
  const arName = nameResolverById(tr, bestById ?? new Map());
  return (item?.events ?? []).map((ev: any): WcMatchEvent => {
    const localized = localizeEvent(ev.type ?? "", ev.detail ?? "");
    const hasAssist = !!(ev.assist?.name || ev.assist?.id);
    return {
      minute: ev.time?.elapsed ?? 0,
      extraMinute: ev.time?.extra ?? null,
      teamId: ev.team?.id ?? 0,
      type: localized.type,
      label: localized.label,
      detail: ev.detail ?? "",
      player: arName(ev.player?.id, ev.player?.name),
      playerId: ev.player?.id ?? null,
      assist: hasAssist ? arName(ev.assist?.id, ev.assist?.name) || null : null,
      assistId: ev.assist?.id ?? null,
    };
  });
}

/**
 * مسار خفيف يجلب أحداث المباراة فقط (نداء `fixtures` واحد) دون توقعات أو سجل
 * مواجهات. تجميع سباقات الهدّافين يحتاج الأحداث وحدها، فلا داعي لإشعال نداءين
 * إضافيين لكل مباراة كما يفعل getMatchDetail — هذا جذر طوفان rate-limit.
 */
async function getMatchEventsOnly(fixtureId: number): Promise<WcMatchEvent[]> {
  const known = (await getFixtures()).find((f) => f.id === fixtureId);
  let ttl = CACHE_TTL.MEDIUM;
  if (known?.status.live) {
    ttl = MATCH_DETAIL_LIVE_TTL;
  } else if (known && !known.status.finished) {
    const msToKickoff = new Date(known.date).getTime() - Date.now();
    if (msToKickoff < PREKICKOFF_WINDOW_MS) ttl = MATCH_DETAIL_PREKICKOFF_TTL;
  }

  return withSWR(`wc:matchEvents:${fixtureId}`, ttl, ttl * 2, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return [];
    // وحّد التعريب بمعرّف اللاعب: نفس رد `fixtures` يحمل الأسماء الكاملة في
    // التشكيلات/التقييمات، فنعرّبها بدل الاسم المختصر في الأحداث (انظر
    // collectBestNamesById) كي لا يخترع الـAI اسمًا أول خاطئًا.
    const bestById = collectBestNamesById(item);
    const rawNames: (string | null | undefined)[] = [...bestById.values()];
    for (const ev of item.events ?? []) {
      rawNames.push(ev.player?.name, ev.assist?.name);
    }
    const tr = await resolveNames(rawNames);
    return localizeMatchEvents(item, tr, bestById);
  });
}

export async function getMatchDetail(
  fixtureId: number,
  opts: { forceFresh?: boolean } = {}
): Promise<WcMatchDetail | null> {
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

  // forceFresh يتجاوز كاش SWR ويعيد الجلب من المزود فورًا. مولّد تقرير ما بعد
  // المباراة يحتاجه: لقطة حيّة قديمة (سُجّلت بـ ttl قصير قبل هدف التعادل
  // الأخير) قد تبقى ضمن نافذة الـ SWR وتُقدَّم كأنها "النتيجة النهائية" —
  // وهذا جذر حادثة نشر مباراة متعادلة كأنها فوز.
  const detail = await withSWR(`wc:match:${fixtureId}`, ttl, ttl * 2, async () => {
    const rows = await apiGet("fixtures", { id: fixtureId, timezone: TIMEZONE });
    const item = rows[0];
    if (!item) return null;

    // اجمع كل أسماء اللاعبين في هذه المباراة (أحداث + تشكيلات + تقييمات)
    // وعرّبها دفعة واحدة — استدعاء AI واحد فقط للأسماء الجديدة، ثم كاش للأبد.
    // التعريب يُوحَّد بمعرّف اللاعب (لا بسلسلة الاسم): اسم الحدث المختصر يُعرَّب
    // عبر أكمل اسم لنفس المعرّف من التشكيلة/التقييم — فيطابق اسمَ بطاقة اللاعب.
    const bestById = collectBestNamesById(item);
    const rawNames: (string | null | undefined)[] = [...bestById.values()];
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
    const arName = nameResolverById(tr, bestById);

    const events: WcMatchEvent[] = localizeMatchEvents(item, tr, bestById);

    let lineups: WcLineup[] = (item.lineups ?? []).map((lineup: any): WcLineup => {
      const mapPlayer = (p: any): WcLineupPlayer => ({
        id: p.player?.id ?? 0,
        name: arName(p.player?.id, p.player?.name),
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

    // تشكيلات API-Football تتأخّر/تغيب لبعض مباريات المونديال → نتراجع لتشكيلات
    // TheSports (أسرع نشرًا، وبأرقام/خطط/إحداثيات ملعب). أفضل جهد: لا تعطّل المباراة.
    if (lineups.length === 0) {
      const tsLineups = await getWcLineupsTs(fixtureId).catch(() => [] as WcLineup[]);
      if (tsLineups.length > 0) lineups = tsLineups;
    }

    // تقييمات اللاعبين — يرسلها المزود ضمن نفس الرد بعد انطلاق المباراة
    const ratings: WcPlayerRating[] = (item.players ?? [])
      .flatMap((teamBlock: any) =>
        (teamBlock.players ?? []).map((p: any): WcPlayerRating | null => {
          const st = p.statistics?.[0] ?? {};
          const rating = parseFloat(st.games?.rating ?? "");
          if (!Number.isFinite(rating)) return null;
          return {
            id: p.player?.id ?? 0,
            name: arName(p.player?.id, p.player?.name),
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
  }, opts.forceFresh ?? false);

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
  // المباريات القادمة المتزامنة مع المميّزة (نفس وقت الانطلاق) — قد تكون في يوم
  // تقويمي تالٍ فلا تظهر في today؛ تُمرّر لتُعرض كبطاقات Hero متجاورة.
  matchOfDayPeers: WcFixture[];
  // توقعات النتيجة مفهرسة بمعرّف المباراة — لكل مباراة قد تُعرض كبطاقة Hero
  // كبيرة (الحيّة + المتزامنة القادمة)، لا المميّزة وحدها.
  predictions: Record<number, WcPrediction>;
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

  // توقعات لكل المباريات التي قد تُعرض كبطاقات Hero كبيرة: الحيّة جميعها +
  // المباراة المميّزة + المباريات القادمة المتزامنة معها (نفس وقت الانطلاق).
  // getPrediction مُخزَّن (SWR) فجلب عدة مباريات لا يكلّف نداءات متكرّرة للمزود.
  // المباريات القادمة المتزامنة مع المميّزة (نفس وقت الانطلاق) — تُبحث ضمن كل
  // المباريات القادمة لا «اليوم» فقط، لأن ختام دور المجموعات قد ينطلق بعد منتصف
  // الليل (يوم تقويمي تالٍ) فلا تكون الشقيقة في مصفوفة today إطلاقًا.
  const motdPeers =
    motdFixture && !motdFixture.status.live && !motdFixture.status.finished
      ? upcoming.filter(
          (f) => f.id !== motdFixture.id && f.timestamp === motdFixture.timestamp
        )
      : [];

  const predictionTargets = new Set<number>();
  for (const f of live) predictionTargets.add(f.id);
  if (motdFixture && !motdFixture.status.finished) {
    predictionTargets.add(motdFixture.id);
    for (const f of motdPeers) predictionTargets.add(f.id);
  }

  const predictions: Record<number, WcPrediction> = {};
  await Promise.all(
    [...predictionTargets].map(async (id) => {
      try {
        const pred = await getPrediction(id);
        if (pred) predictions[id] = pred;
      } catch (error) {
        console.warn(`[WorldCup] prediction failed for fixture ${id}:`, error);
      }
    })
  );

  const motdPrediction = motdFixture ? predictions[motdFixture.id] ?? null : null;

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
    matchOfDayPeers: motdPeers,
    predictions,
    saudi: { next: saudiNext, fixtures: saudiFixtures, group: saudiGroup },
    updatedAt: new Date().toISOString(),
  };
}
