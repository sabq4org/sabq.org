/**
 * توقّعات موسم دوري روشن طويلة المدى — البطل + هدّاف الدوري.
 *
 * نفس فكرة «وزن المبادر» المونديالية مقيسةً بجولات الدوري (34 جولة) بدل الأدوار
 * الإقصائية: جائزة البطل 10,000 نقطة تُقسَّم **مرجّحةً** بوزن كل فائز —
 *   • قبل الموسم وحتى الجولة 11 → 100   • الجولات 12–22 → 60
 *   • الجولات 23–29 → 30                • يُغلق مع انطلاق الجولة 30.
 * جائزة الهدّاف 3,000 نقطة تُقسَّم بالتساوي، وتُغلق مع انطلاق الجولة 25.
 *
 * قبل نشر جدول الموسم الجديد تُشتق قوائم المرشّحين من الموسم الماضي (أندية
 * الترتيب + هدّافو الموسم المنقضي) ثم تتحدّث تلقائيًّا فور اعتماد الجدول.
 * التسوية مرّة واحدة عند اكتمال الموسم: البطل = متصدّر الترتيب النهائي،
 * والهدّاف = متصدّر لوحة الهدّافين. حارس settledAt لكل صفّ + dedup الولاء على
 * المصدر rsl-long:<kind> يجعلان كرون الدقيقة آمنًا لإعادة التشغيل.
 *
 * ADR-001: هذه الخدمة تملك كل استعلامات Drizzle؛ مسار rslPredictions لا يستورد db.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { rslLongPredictions } from "@shared/schema";
import {
  getFixtures,
  getSeasonOutlook,
  getStandings,
  getTopScorers,
  type SplFixture,
  type SplScorer,
  type SplStandingRow,
} from "./saudiLeagueService";
import { rslComp } from "./rslPredictionsService";
import { awardPoints } from "./loyalty";
import { LOYALTY_ACTIONS } from "@shared/loyalty";

export const RSL_LONG_POOL = { champion: 10000, top_scorer: 3000 } as const;
export type RslLongKind = "champion" | "top_scorer";

/** عدد مرشّحي الهدّاف المعروضين من اللوحة الرسمية (مرتّبة بالأهداف). */
const SCORER_CANDIDATES = 20;

// حدود أطوار الوزن بالجولات (دوري 18 فريقًا = 34 جولة).
const EARLY_MAX_ROUND = 11;
const MID_MAX_ROUND = 22;
const LATE_MAX_ROUND = 29; // الجولة 30 فما بعد = مغلق
const SCORER_CLOSE_ROUND = 25; // يُغلق مع انطلاق الجولة 25

// ---------------------------------------------------------------------------
// كشف الجولة الجارية ← الوزن / الإغلاق
// ---------------------------------------------------------------------------

/** رقم الجولة من نصّها («الجولة 12» أو "Regular Season - 12") — 0 إن تعذّر. */
function roundNumber(round: string): number {
  const m = (round ?? "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** مباراة «انطلقت» متى حان موعدها أو بعده. */
function started(fx: SplFixture): boolean {
  return Date.now() >= fx.timestamp * 1000;
}

/** أعلى جولة انطلقت فيها مباراة — تحكم الوزن والإغلاق (0 = الموسم لم يبدأ). */
function currentRound(fixtures: SplFixture[]): number {
  // موسم مكتمل بالكامل = نحن بين الموسمين: التوقّعات الجديدة للموسم القادم الذي
  // لم يُنشر/يبدأ بعد ⇒ الجولة الفعلية 0 (مفتوح بوزن المبادر الكامل). دون هذا
  // الحارس تُقرأ جولة 34 من جدول الموسم المنقضي فتُقفل التوقّعات خطأً.
  if (fixtures.length > 0 && fixtures.every((f) => f.status.finished)) return 0;
  let max = 0;
  for (const fx of fixtures) {
    if (!started(fx)) continue;
    const r = roundNumber(fx.round);
    if (r > max) max = r;
  }
  return max;
}

/** وزن المبادر للبطل حسب الجولة الجارية — null متى أُغلق. */
function championWeight(round: number): number | null {
  if (round <= EARLY_MAX_ROUND) return 100;
  if (round <= MID_MAX_ROUND) return 60;
  if (round <= LATE_MAX_ROUND) return 30;
  return null;
}

function stageLabel(round: number): string {
  if (round <= EARLY_MAX_ROUND) return "early";
  if (round <= MID_MAX_ROUND) return "mid";
  if (round <= LATE_MAX_ROUND) return "late";
  return "closed";
}

function scorerOpen(round: number): boolean {
  return round < SCORER_CLOSE_ROUND;
}

/** اكتمل الموسم؟ (جدول منشور وكل مبارياته انتهت — نفس قاعدة الدوريات). */
function seasonComplete(fixtures: SplFixture[]): boolean {
  return fixtures.length > 0 && fixtures.every((f) => f.status.finished);
}

// ---------------------------------------------------------------------------
// المرشّحون (مع تراجُع للموسم الماضي قبل نشر الجدول الجديد)
// ---------------------------------------------------------------------------

type ChampionCandidate = { id: number; name: string; logo: string; eliminated: boolean };

/**
 * أندية الدوري من جدول المباريات، وإلا (قبل نشر الجدول) من ترتيب الموسم
 * الأحدث المتاح. eliminated = خرج حسابيًّا من سباق اللقب (فارق الصدارة أكبر
 * من نقاط جولاته المتبقية) — يُحسب فقط أثناء موسم جارٍ.
 */
async function championCandidates(fixtures: SplFixture[]): Promise<ChampionCandidate[]> {
  const comp = rslComp();
  const byId = new Map<number, { id: number; name: string; logo: string }>();
  for (const f of fixtures) {
    for (const t of [f.home, f.away]) {
      if (t.id > 0 && !byId.has(t.id)) byId.set(t.id, { id: t.id, name: t.name, logo: t.logo });
    }
  }

  let standings: SplStandingRow[] = [];
  try {
    standings = await getStandings(comp);
  } catch {
    standings = [];
  }

  // الجدول الجديد غير منشور — مرشّحون من ترتيب الموسم الأحدث (يتحدّثون تلقائيًّا لاحقًا).
  if (byId.size === 0) {
    for (const r of standings) {
      if (r.team.id > 0 && !byId.has(r.team.id)) {
        byId.set(r.team.id, { id: r.team.id, name: r.team.name, logo: r.team.logo });
      }
    }
  }

  // الإقصاء الحسابي من سباق اللقب — أثناء موسم جارٍ فقط (لا قبل الانطلاق ولا بعد الختام).
  const eliminated = new Set<number>();
  const inSeason = fixtures.some(started) && !seasonComplete(fixtures);
  if (inSeason && standings.length > 0) {
    const totalRounds = Math.max(...fixtures.map((f) => roundNumber(f.round)), 0);
    const leaderPoints = Math.max(...standings.map((r) => r.points));
    for (const r of standings) {
      const remaining = Math.max(0, totalRounds - r.played);
      if (r.points + remaining * 3 < leaderPoints) eliminated.add(r.team.id);
    }
  }

  return [...byId.values()]
    .map((t) => ({ ...t, eliminated: eliminated.has(t.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

/**
 * مرشّحو الهدّاف من لوحة الموسم الجاري، وإلا (قبل انطلاقه) هدّافو الموسم
 * الماضي — أوجَه المرشّحين للمنافسة الجديدة، وتتحدّث القائمة فور أول جولة.
 */
async function scorerCandidates(): Promise<{ scorers: SplScorer[]; fromLastSeason: boolean }> {
  const comp = rslComp();
  const current = await getTopScorers(comp).catch(() => [] as SplScorer[]);
  if (current.length > 0) return { scorers: current.slice(0, SCORER_CANDIDATES), fromLastSeason: false };

  try {
    const outlook = await getSeasonOutlook(comp);
    const lastSeason = (outlook.nextSeason ?? outlook.season) - 1;
    const previous = await getTopScorers(comp, lastSeason).catch(() => [] as SplScorer[]);
    return { scorers: previous.slice(0, SCORER_CANDIDATES), fromLastSeason: true };
  } catch {
    return { scorers: [], fromLastSeason: false };
  }
}

// ---------------------------------------------------------------------------
// قراءة الحالة + توقّعي
// ---------------------------------------------------------------------------

export async function getRslLongPredictions(userId?: string) {
  const fixtures = await getFixtures(rslComp()).catch(() => [] as SplFixture[]);
  const round = currentRound(fixtures);
  const [teams, scorerPool] = await Promise.all([
    championCandidates(fixtures),
    scorerCandidates(),
  ]);

  const champVotes = await db
    .select({
      teamId: rslLongPredictions.teamId,
      n: sql<number>`count(*)::int`,
      w: sql<number>`coalesce(sum(${rslLongPredictions.weight}), 0)::int`,
    })
    .from(rslLongPredictions)
    .where(eq(rslLongPredictions.kind, "champion"))
    .groupBy(rslLongPredictions.teamId);

  const scorerVotes = await db
    .select({ playerId: rslLongPredictions.playerId, n: sql<number>`count(*)::int` })
    .from(rslLongPredictions)
    .where(eq(rslLongPredictions.kind, "top_scorer"))
    .groupBy(rslLongPredictions.playerId);

  let mine: {
    kind: string;
    teamId: number | null;
    teamName: string | null;
    teamLogo: string | null;
    playerId: number | null;
    playerName: string | null;
    playerPhoto: string | null;
    weight: number;
    status: string;
    pointsAwarded: number;
  }[] = [];
  if (userId) {
    mine = await db
      .select({
        kind: rslLongPredictions.kind,
        teamId: rslLongPredictions.teamId,
        teamName: rslLongPredictions.teamName,
        teamLogo: rslLongPredictions.teamLogo,
        playerId: rslLongPredictions.playerId,
        playerName: rslLongPredictions.playerName,
        playerPhoto: rslLongPredictions.playerPhoto,
        weight: rslLongPredictions.weight,
        status: rslLongPredictions.status,
        pointsAwarded: rslLongPredictions.pointsAwarded,
      })
      .from(rslLongPredictions)
      .where(eq(rslLongPredictions.userId, userId));
  }

  return {
    pools: RSL_LONG_POOL,
    currentRound: round,
    teams: teams.map((t) => ({ id: t.id, name: t.name, logo: t.logo, eliminated: t.eliminated })),
    scorers: scorerPool.scorers.map((s) => ({
      id: s.id,
      name: s.name,
      photo: s.photo,
      team: { name: s.team.name, logo: s.team.logo },
      goals: s.goals,
      eliminated: false, // في الدوري لا يخرج فريق — تُعطَّل القائمة بالإغلاق الزمني فقط
    })),
    /** المرشّحون من لوحة الموسم الماضي (قبل انطلاق الجديد) — للواجهة أن توضّح ذلك. */
    scorersFromLastSeason: scorerPool.fromLastSeason,
    champion: {
      open: championWeight(round) != null,
      weight: championWeight(round),
      stage: stageLabel(round),
      votes: champVotes.filter((v) => v.teamId != null),
    },
    topScorer: {
      open: scorerOpen(round),
      votes: scorerVotes.filter((v) => v.playerId != null),
    },
    mine,
  };
}

// ---------------------------------------------------------------------------
// حفظ التوقّع
// ---------------------------------------------------------------------------

export type RslLongSubmit = { ok: true } | { ok: false; reason: "LOCKED" | "INVALID" };

export async function submitRslLongPrediction(
  userId: string,
  kind: RslLongKind,
  payload: { teamId?: number; playerId?: number },
): Promise<RslLongSubmit> {
  if (kind !== "champion" && kind !== "top_scorer") return { ok: false, reason: "INVALID" };
  const fixtures = await getFixtures(rslComp()).catch(() => [] as SplFixture[]);
  const round = currentRound(fixtures);

  if (kind === "champion") {
    const weight = championWeight(round);
    if (weight == null) return { ok: false, reason: "LOCKED" };
    const team = (await championCandidates(fixtures)).find((t) => t.id === payload.teamId);
    if (!team || team.eliminated) return { ok: false, reason: "INVALID" };
    await db
      .insert(rslLongPredictions)
      .values({
        userId,
        kind,
        teamId: team.id,
        teamName: team.name,
        teamLogo: team.logo,
        weight,
        lockedStage: stageLabel(round),
      })
      .onConflictDoUpdate({
        target: [rslLongPredictions.userId, rslLongPredictions.kind],
        // تعديل الاختيار يُحدّث الوزن للطور الحالي — عدالةً مع من ثبّت مبكرًا ولم يغيّر.
        set: {
          teamId: team.id,
          teamName: team.name,
          teamLogo: team.logo,
          weight,
          lockedStage: stageLabel(round),
          updatedAt: new Date(),
        },
      });
    return { ok: true };
  }

  // top_scorer — من قائمة المرشّحين (تسوية آلية بالمعرّف)
  if (!scorerOpen(round)) return { ok: false, reason: "LOCKED" };
  const { scorers } = await scorerCandidates();
  const sc = scorers.find((s) => s.id === payload.playerId && s.id !== 0);
  if (!sc) return { ok: false, reason: "INVALID" };
  await db
    .insert(rslLongPredictions)
    .values({
      userId,
      kind,
      playerId: sc.id,
      playerName: sc.name,
      playerPhoto: sc.photo,
      weight: 100,
      lockedStage: stageLabel(round),
    })
    .onConflictDoUpdate({
      target: [rslLongPredictions.userId, rslLongPredictions.kind],
      set: { playerId: sc.id, playerName: sc.name, playerPhoto: sc.photo, updatedAt: new Date() },
    });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// التسوية (مرّة واحدة عند اكتمال الموسم)
// ---------------------------------------------------------------------------

export type RslLongSettlement = {
  championSettled: boolean;
  championWinners: number;
  scorerSettled: boolean;
  scorerWinners: number;
};

export async function settleRslLong(): Promise<RslLongSettlement> {
  const out: RslLongSettlement = {
    championSettled: false,
    championWinners: 0,
    scorerSettled: false,
    scorerWinners: 0,
  };
  const comp = rslComp();
  const fixtures = await getFixtures(comp).catch(() => [] as SplFixture[]);
  if (!seasonComplete(fixtures)) return out; // الموسم لم يكتمل بعد

  // حدّ التسوية: تُسوّى فقط التوقّعات المسجّلة قبل ختام هذا الموسم — ما سُجّل
  // بعده (بين الموسمين) يخصّ الموسم القادم ويبقى معلّقًا. دون هذا الحارس تُسوّى
  // توقّعات الموسم الجديد فورًا ببطل الموسم المنقضي.
  const seasonEnd = new Date(Math.max(...fixtures.map((f) => f.timestamp)) * 1000);

  const standings = await getStandings(comp).catch(() => [] as SplStandingRow[]);
  const top = standings[0];
  if (top && top.played > 0 && top.team.id > 0) {
    const r = await settleChampion(top.team.id, seasonEnd);
    out.championSettled = r.settled;
    out.championWinners = r.winners;
  }

  const scorers = await getTopScorers(comp).catch(() => [] as SplScorer[]);
  const topScorer = scorers[0];
  if (topScorer && topScorer.id) {
    const r = await settleTopScorer(topScorer.id, seasonEnd);
    out.scorerSettled = r.settled;
    out.scorerWinners = r.winners;
  }
  return out;
}

/** البطل: بركة مرجّحة بالوزن على من اختاروه. idempotent عبر settledAt + dedup الولاء. */
async function settleChampion(
  championId: number,
  seasonEnd: Date,
): Promise<{ settled: boolean; winners: number }> {
  const rows = await db
    .select({
      id: rslLongPredictions.id,
      userId: rslLongPredictions.userId,
      teamId: rslLongPredictions.teamId,
      weight: rslLongPredictions.weight,
      settledAt: rslLongPredictions.settledAt,
      createdAt: rslLongPredictions.createdAt,
    })
    .from(rslLongPredictions)
    .where(eq(rslLongPredictions.kind, "champion"));
  const pending = rows.filter((r) => r.settledAt == null && r.createdAt <= seasonEnd);
  if (pending.length === 0) return { settled: false, winners: 0 };

  const now = new Date();
  await db
    .update(rslLongPredictions)
    .set({ status: "incorrect", settledAt: now, updatedAt: now })
    .where(
      and(
        eq(rslLongPredictions.kind, "champion"),
        sql`${rslLongPredictions.settledAt} is null`,
        sql`${rslLongPredictions.createdAt} <= ${seasonEnd}`,
      ),
    );

  const winners = pending.filter((r) => r.teamId === championId);
  const weightSum = winners.reduce((s, w) => s + (w.weight ?? 0), 0);
  for (const w of winners) {
    const share =
      weightSum > 0 ? Math.max(1, Math.floor((RSL_LONG_POOL.champion * (w.weight ?? 0)) / weightSum)) : 0;
    await db
      .update(rslLongPredictions)
      .set({ status: "correct", pointsAwarded: share, settledAt: now, updatedAt: now })
      .where(eq(rslLongPredictions.id, w.id));
    await awardPoints({
      userId: w.userId,
      action: LOYALTY_ACTIONS.RSL_LONG_PREDICTION_WIN,
      source: "rsl-long:champion",
      points: share,
      metadata: { championId, weight: w.weight },
    });
  }
  return { settled: true, winners: winners.length };
}

/** الهدّاف: بركة متساوية على من اختاروا اللاعب المتصدّر. */
async function settleTopScorer(
  playerId: number,
  seasonEnd: Date,
): Promise<{ settled: boolean; winners: number }> {
  const rows = await db
    .select({
      id: rslLongPredictions.id,
      userId: rslLongPredictions.userId,
      playerId: rslLongPredictions.playerId,
      settledAt: rslLongPredictions.settledAt,
      createdAt: rslLongPredictions.createdAt,
    })
    .from(rslLongPredictions)
    .where(eq(rslLongPredictions.kind, "top_scorer"));
  const pending = rows.filter((r) => r.settledAt == null && r.createdAt <= seasonEnd);
  if (pending.length === 0) return { settled: false, winners: 0 };

  const now = new Date();
  await db
    .update(rslLongPredictions)
    .set({ status: "incorrect", settledAt: now, updatedAt: now })
    .where(
      and(
        eq(rslLongPredictions.kind, "top_scorer"),
        sql`${rslLongPredictions.settledAt} is null`,
        sql`${rslLongPredictions.createdAt} <= ${seasonEnd}`,
      ),
    );

  const winners = pending.filter((r) => r.playerId === playerId);
  const share = winners.length > 0 ? Math.max(1, Math.floor(RSL_LONG_POOL.top_scorer / winners.length)) : 0;
  for (const w of winners) {
    await db
      .update(rslLongPredictions)
      .set({ status: "correct", pointsAwarded: share, settledAt: now, updatedAt: now })
      .where(eq(rslLongPredictions.id, w.id));
    await awardPoints({
      userId: w.userId,
      action: LOYALTY_ACTIONS.RSL_LONG_PREDICTION_WIN,
      source: "rsl-long:top_scorer",
      points: share,
      metadata: { playerId },
    });
  }
  return { settled: true, winners: winners.length };
}
