/**
 * توقّعات بطولة كأس العالم 2026 طويلة المدى — البطل + هدّاف البطولة.
 *
 * فكرة «وزن المبادر» (الإبداعية): جائزة البطل 10,000 نقطة تُقسَّم **مرجّحةً**
 * بوزن كل فائز لا بالتساوي — كلما ثبّتَّ توقّعك أبكر كبُرت حصّتك. يُحسب الوزن لحظة
 * الحفظ من الدور الإقصائي الجاري:
 *   • دور الـ32 أو أبكر → 100   • دور الـ16 → 60   • ربع النهائي → 30
 *   • يُغلق توقّع البطل عند انطلاق نصف النهائي.
 * جائزة الهدّاف 3,000 نقطة تُقسَّم بالتساوي (الوزن دائمًا 100)، وتُغلق عند انطلاق
 * ربع النهائي (نهاية دور الـ16).
 *
 * التسوية مرّة واحدة عند انتهاء النهائي: البطل = الفائز بالنهائي (أو الترجيح)،
 * والهدّاف = متصدّر لوحة الهدّافين. حارس settledAt لكل صفّ يجعل كرون الدقيقة آمنًا
 * لإعادة التشغيل (+ dedup الولاء على المصدر wc-long:<kind>).
 *
 * ADR-001: هذه الخدمة تملك كل استعلامات Drizzle؛ مسار wcPredictions لا يستورد db.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { wcLongPredictions } from "@shared/schema";
import {
  getFixtures,
  getOfficialTopScorers,
  type WcFixture,
  type WcTeam,
  type WcScorer,
} from "./worldCupService";

// عدد مرشّحي الهدّاف المعروضين من اللوحة الرسمية (مرتّبة بالأهداف).
const SCORER_CANDIDATES = 20;
import { awardPoints } from "./loyalty";
import { LOYALTY_ACTIONS } from "@shared/loyalty";

export const WC_LONG_POOL = { champion: 10000, top_scorer: 3000 } as const;
export type WcLongKind = "champion" | "top_scorer";

// ---------------------------------------------------------------------------
// كشف الدور الجاري ← الوزن / الإغلاق
// ---------------------------------------------------------------------------

// أرقام الأطوار: 0 المجموعات، 1 دور الـ32، 2 دور الـ16، 3 ربع، 4 نصف، 5 النهائي.
// مباراة المركز الثالث ليست على مسار البطل فتُهمَل (طور 0).
const ROUND_PHASE: ReadonlyArray<[string, number]> = [
  ["Round of 32", 1],
  ["Round of 16", 2],
  ["Quarter-finals", 3],
  ["Semi-finals", 4],
  ["Final", 5],
];

function roundPhase(roundEn: string): number {
  const r = (roundEn ?? "").trim();
  if (r.startsWith("3rd")) return 0; // 3rd Place Final — خارج مسار البطل
  for (const [prefix, phase] of ROUND_PHASE) {
    if (r === prefix || r.startsWith(prefix)) return phase;
  }
  return 0;
}

/** مباراة «انطلقت» متى حان موعدها أو بعده (يكفي للأطوار). */
function started(fx: WcFixture): boolean {
  return Date.now() >= fx.timestamp * 1000;
}

/** أعلى دور إقصائي انطلقت فيه مباراة — يحكم الوزن والإغلاق. */
function currentPhase(fixtures: WcFixture[]): number {
  let max = 0;
  for (const fx of fixtures) {
    if (!started(fx)) continue;
    const p = roundPhase(fx.roundEn ?? "");
    if (p > max) max = p;
  }
  return max;
}

/** وزن المبادر للبطل حسب الطور — null متى أُغلق (انطلق نصف النهائي). */
function championWeight(phase: number): number | null {
  if (phase <= 1) return 100; // المجموعات/دور الـ32
  if (phase === 2) return 60; // دور الـ16
  if (phase === 3) return 30; // ربع النهائي
  return null; // نصف النهائي فما بعد — مغلق
}

function stageLabel(phase: number): string {
  if (phase <= 1) return "r32";
  if (phase === 2) return "r16";
  if (phase === 3) return "qf";
  return "closed";
}

/** الهدّاف مفتوح حتى انطلاق ربع النهائي (طور ≤ 2 = حتى دور الـ16). */
function scorerOpen(phase: number): boolean {
  return phase <= 2;
}

function hasRealFinalScore(fx: WcFixture): boolean {
  return ["FT", "AET", "PEN"].includes(fx.status.code) && fx.goals.home != null && fx.goals.away != null;
}

function championOfFinal(final: WcFixture): number | null {
  const fh = final.goals.home;
  const fa = final.goals.away;
  if (fh == null || fa == null) return null;
  if (fh > fa) return final.home.id;
  if (fa > fh) return final.away.id;
  // تعادل في الوقتين → ركلات الترجيح
  const ph = final.penalties?.home;
  const pa = final.penalties?.away;
  if (ph != null && pa != null && ph !== pa) return ph > pa ? final.home.id : final.away.id;
  return null;
}

/** خاسر مباراة إقصائية حُسمت (بالأهداف أو الترجيح) — للإقصاء من قائمة البطل. */
function loserOf(fx: WcFixture): number | null {
  if (!hasRealFinalScore(fx)) return null;
  const fh = fx.goals.home as number;
  const fa = fx.goals.away as number;
  if (fh > fa) return fx.away.id;
  if (fa > fh) return fx.home.id;
  const ph = fx.penalties?.home;
  const pa = fx.penalties?.away;
  if (ph != null && pa != null && ph !== pa) return ph > pa ? fx.away.id : fx.home.id;
  return null;
}

/** معرّفات المنتخبات التي خرجت من أي دور إقصائي حُسم (دور الـ32 فما بعد). */
function eliminatedTeamIds(fixtures: WcFixture[]): Set<number> {
  const out = new Set<number>();
  for (const f of fixtures) {
    if (roundPhase(f.roundEn ?? "") < 1) continue; // غير إقصائية
    const loser = loserOf(f);
    if (loser != null) out.add(loser);
  }
  return out;
}

/**
 * مرشّحو البطل = المنتخبات **المتأهّلة لدور الـ32** (= المتأهّلون للأدوار الإقصائية).
 * القائمة الكاملة تبقى ظاهرة دائمًا — من خرج في أي دور إقصائي حُسم يُعلَّم
 * eliminated (لا يُحذف) كي تُعطّل الواجهة اختياره بدل إخفائه فجأة. مشتقّ من جدول
 * المباريات لا من كامل قائمة الـ48 (التي تضمّ من لم يتأهّل أصلًا).
 */
function championCandidates(fixtures: WcFixture[]): (WcTeam & { eliminated: boolean })[] {
  const byId = new Map<number, WcTeam>();
  for (const f of fixtures) {
    const r = (f.roundEn ?? "").trim();
    if (r !== "Round of 32" && !r.startsWith("Round of 32")) continue;
    if (f.home?.id) byId.set(f.home.id, f.home);
    if (f.away?.id) byId.set(f.away.id, f.away);
  }
  const eliminated = eliminatedTeamIds(fixtures);
  return [...byId.values()]
    .map((t) => ({ ...t, eliminated: eliminated.has(t.id) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

// ---------------------------------------------------------------------------
// قراءة الحالة + توقّعي
// ---------------------------------------------------------------------------

export async function getWcLongPredictions(userId?: string) {
  const [scorers, fixtures] = await Promise.all([
    getOfficialTopScorers(SCORER_CANDIDATES).catch(() => [] as WcScorer[]),
    getFixtures().catch(() => [] as WcFixture[]),
  ]);
  const phase = currentPhase(fixtures);
  const teams = championCandidates(fixtures); // المتأهّلون لدور الـ32 (eliminated لمن خرج)
  const eliminatedScorerTeams = eliminatedTeamIds(fixtures);

  // أصوات البطل: عدد + مجموع الأوزان لكل منتخب (لتقدير الحصّة المرجّحة).
  const champVotes = await db
    .select({
      teamId: wcLongPredictions.teamId,
      n: sql<number>`count(*)::int`,
      w: sql<number>`coalesce(sum(${wcLongPredictions.weight}), 0)::int`,
    })
    .from(wcLongPredictions)
    .where(eq(wcLongPredictions.kind, "champion"))
    .groupBy(wcLongPredictions.teamId);

  const scorerVotes = await db
    .select({ playerId: wcLongPredictions.playerId, n: sql<number>`count(*)::int` })
    .from(wcLongPredictions)
    .where(eq(wcLongPredictions.kind, "top_scorer"))
    .groupBy(wcLongPredictions.playerId);

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
        kind: wcLongPredictions.kind,
        teamId: wcLongPredictions.teamId,
        teamName: wcLongPredictions.teamName,
        teamLogo: wcLongPredictions.teamLogo,
        playerId: wcLongPredictions.playerId,
        playerName: wcLongPredictions.playerName,
        playerPhoto: wcLongPredictions.playerPhoto,
        weight: wcLongPredictions.weight,
        status: wcLongPredictions.status,
        pointsAwarded: wcLongPredictions.pointsAwarded,
      })
      .from(wcLongPredictions)
      .where(eq(wcLongPredictions.userId, userId));
  }

  return {
    pools: WC_LONG_POOL,
    teams: teams.map((t) => ({ id: t.id, name: t.name, logo: t.logo, eliminated: t.eliminated })),
    scorers: scorers.map((s) => ({
      id: s.id,
      name: s.name,
      photo: s.photo,
      team: { name: s.team.name, logo: s.team.logo },
      goals: s.goals,
      // فريقه خرج من البطولة ⇐ لا يمكنه تسجيل أهداف بعد الآن (يُعطَّل لا يُحذف).
      eliminated: eliminatedScorerTeams.has(s.team.id),
    })),
    champion: {
      open: championWeight(phase) != null,
      weight: championWeight(phase), // الوزن لو حفظتَ الآن (null = مغلق)
      stage: stageLabel(phase),
      votes: champVotes.filter((v) => v.teamId != null),
    },
    topScorer: {
      open: scorerOpen(phase),
      votes: scorerVotes.filter((v) => v.playerId != null),
    },
    mine,
  };
}

/** لمحة عامة لبطاقات الصفحة الرئيسية — أصوات الجمهور + ملاحظة خروج مرشّح بارز. */
export type WcStoriesTeaser = {
  champions: Array<{
    teamId: number;
    name: string;
    logo: string | null;
    pct: number;
    eliminated: boolean;
  }>;
  /** أبرز منتخب خرج رغم نسبة ترشيح ملحوظة (فرنسا أولوية إن وُجدت) */
  eliminatedNote: { teamId: number; name: string; pct: number } | null;
  topScorer: {
    playerId: number;
    name: string;
    photo: string | null;
    pct: number;
  } | null;
};

const FRANCE_TEAM_ID = 2;

export async function getWcStoriesTeaser(): Promise<WcStoriesTeaser | null> {
  const [champRows, scorerRows, scorerTotalRow, fixtures] = await Promise.all([
    db
      .select({
        teamId: wcLongPredictions.teamId,
        name: wcLongPredictions.teamName,
        logo: wcLongPredictions.teamLogo,
        n: sql<number>`count(*)::int`,
      })
      .from(wcLongPredictions)
      .where(eq(wcLongPredictions.kind, "champion"))
      .groupBy(
        wcLongPredictions.teamId,
        wcLongPredictions.teamName,
        wcLongPredictions.teamLogo,
      )
      .orderBy(sql`count(*) DESC`)
      .limit(8),
    db
      .select({
        playerId: wcLongPredictions.playerId,
        name: wcLongPredictions.playerName,
        photo: wcLongPredictions.playerPhoto,
        n: sql<number>`count(*)::int`,
      })
      .from(wcLongPredictions)
      .where(eq(wcLongPredictions.kind, "top_scorer"))
      .groupBy(
        wcLongPredictions.playerId,
        wcLongPredictions.playerName,
        wcLongPredictions.playerPhoto,
      )
      .orderBy(sql`count(*) DESC`)
      .limit(1),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(wcLongPredictions)
      .where(eq(wcLongPredictions.kind, "top_scorer")),
    getFixtures().catch(() => [] as WcFixture[]),
  ]);

  const champTotal = champRows.reduce((a, r) => a + (r.n ?? 0), 0);
  const eliminated = eliminatedTeamIds(fixtures);

  const champions = champRows
    .filter((r) => r.teamId != null && r.name)
    .slice(0, 3)
    .map((r) => ({
      teamId: r.teamId!,
      name: r.name!,
      logo: r.logo ?? null,
      pct: champTotal > 0 ? Math.round(((r.n ?? 0) / champTotal) * 1000) / 10 : 0,
      eliminated: eliminated.has(r.teamId!),
    }));

  let eliminatedNote: WcStoriesTeaser["eliminatedNote"] = null;
  if (champTotal > 0) {
    const ranked = champRows
      .filter((r) => r.teamId != null && r.name && eliminated.has(r.teamId))
      .map((r) => ({
        teamId: r.teamId!,
        name: r.name!,
        pct: Math.round(((r.n ?? 0) / champTotal) * 1000) / 10,
      }))
      .filter((r) => r.pct >= 8);
    const france = ranked.find((r) => r.teamId === FRANCE_TEAM_ID);
    eliminatedNote = france ?? ranked[0] ?? null;
  }

  const scorer = scorerRows[0];
  const scorerTotal = scorerTotalRow[0]?.n ?? 0;
  const topScorer =
    scorer?.playerId != null && scorer.name && scorerTotal > 0
      ? {
          playerId: scorer.playerId,
          name: scorer.name,
          photo: scorer.photo ?? null,
          pct: Math.round(((scorer.n ?? 0) / scorerTotal) * 1000) / 10,
        }
      : null;

  if (champions.length === 0 && !topScorer && !eliminatedNote) return null;
  return { champions, eliminatedNote, topScorer };
}

// ---------------------------------------------------------------------------
// حفظ التوقّع
// ---------------------------------------------------------------------------

export type WcLongSubmit = { ok: true } | { ok: false; reason: "LOCKED" | "INVALID" };

export async function submitWcLongPrediction(
  userId: string,
  kind: WcLongKind,
  payload: { teamId?: number; playerId?: number },
): Promise<WcLongSubmit> {
  if (kind !== "champion" && kind !== "top_scorer") return { ok: false, reason: "INVALID" };
  const fixtures = await getFixtures().catch(() => [] as WcFixture[]);
  const phase = currentPhase(fixtures);

  if (kind === "champion") {
    const weight = championWeight(phase);
    if (weight == null) return { ok: false, reason: "LOCKED" };
    // يجب أن يكون الاختيار من المتأهّلين لدور الـ32 وما زالوا في المنافسة (لا مُقصًى).
    const team = championCandidates(fixtures).find((t) => t.id === payload.teamId);
    if (!team || team.eliminated) return { ok: false, reason: "INVALID" };
    await db
      .insert(wcLongPredictions)
      .values({
        userId,
        kind,
        teamId: team.id,
        teamName: team.name,
        teamLogo: team.logo,
        weight,
        lockedStage: stageLabel(phase),
      })
      .onConflictDoUpdate({
        target: [wcLongPredictions.userId, wcLongPredictions.kind],
        // عند تعديل الاختيار نُحدّث الوزن للطور الحالي (لا نُجمّد الوزن الأبكر إن
        // غيّر رأيه متأخّرًا — عدالةً مع من ثبّت مبكرًا ولم يغيّر).
        set: {
          teamId: team.id,
          teamName: team.name,
          teamLogo: team.logo,
          weight,
          lockedStage: stageLabel(phase),
          updatedAt: new Date(),
        },
      });
    return { ok: true };
  }

  // top_scorer — من اللوحة الرسمية للهدّافين (تسوية آلية بالمعرّف)
  if (!scorerOpen(phase)) return { ok: false, reason: "LOCKED" };
  const scorers = await getOfficialTopScorers(SCORER_CANDIDATES);
  const sc = scorers.find((s) => s.id === payload.playerId && s.id !== 0);
  if (!sc) return { ok: false, reason: "INVALID" };
  // فريقه خرج من البطولة ⇐ لا يمكنه تسجيل أهداف بعد الآن.
  if (eliminatedTeamIds(fixtures).has(sc.team.id)) return { ok: false, reason: "INVALID" };
  await db
    .insert(wcLongPredictions)
    .values({
      userId,
      kind,
      playerId: sc.id,
      playerName: sc.name,
      playerPhoto: sc.photo,
      weight: 100,
      lockedStage: stageLabel(phase),
    })
    .onConflictDoUpdate({
      target: [wcLongPredictions.userId, wcLongPredictions.kind],
      set: { playerId: sc.id, playerName: sc.name, playerPhoto: sc.photo, updatedAt: new Date() },
    });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// التسوية (مرّة واحدة عند انتهاء النهائي)
// ---------------------------------------------------------------------------

export type WcLongSettlement = {
  championSettled: boolean;
  championWinners: number;
  scorerSettled: boolean;
  scorerWinners: number;
};

export async function settleWcLong(): Promise<WcLongSettlement> {
  const out: WcLongSettlement = {
    championSettled: false,
    championWinners: 0,
    scorerSettled: false,
    scorerWinners: 0,
  };
  const fixtures = await getFixtures().catch(() => [] as WcFixture[]);
  const final = fixtures.find((f) => {
    const r = (f.roundEn ?? "").trim();
    return (r === "Final" || r.startsWith("Final")) && !r.startsWith("3rd");
  });
  if (!final || !hasRealFinalScore(final)) return out; // البطولة لم تنتهِ بعد

  const championId = championOfFinal(final);
  if (championId != null) {
    const r = await settleChampion(championId);
    out.championSettled = r.settled;
    out.championWinners = r.winners;
  }

  // الهدّاف الرسمي المتصدّر عند انتهاء البطولة.
  const scorers = await getOfficialTopScorers(1).catch(() => [] as WcScorer[]);
  const top = scorers[0];
  if (top && top.id) {
    const r = await settleTopScorer(top.id);
    out.scorerSettled = r.settled;
    out.scorerWinners = r.winners;
  }
  return out;
}

/** البطل: بركة مرجّحة بالوزن على من اختاروه. idempotent عبر settledAt + dedup الولاء. */
async function settleChampion(championId: number): Promise<{ settled: boolean; winners: number }> {
  const rows = await db
    .select({
      id: wcLongPredictions.id,
      userId: wcLongPredictions.userId,
      teamId: wcLongPredictions.teamId,
      weight: wcLongPredictions.weight,
      settledAt: wcLongPredictions.settledAt,
    })
    .from(wcLongPredictions)
    .where(eq(wcLongPredictions.kind, "champion"));
  const pending = rows.filter((r) => r.settledAt == null);
  if (pending.length === 0) return { settled: false, winners: 0 };

  const now = new Date();
  // 1) علّم كل توقّعات البطل غير المُسوّاة «خاطئة» (الفائزون يُصحَّحون في الخطوة 2).
  await db
    .update(wcLongPredictions)
    .set({ status: "incorrect", settledAt: now, updatedAt: now })
    .where(and(eq(wcLongPredictions.kind, "champion"), sql`${wcLongPredictions.settledAt} is null`));

  const winners = pending.filter((r) => r.teamId === championId);
  const weightSum = winners.reduce((s, w) => s + (w.weight ?? 0), 0);
  for (const w of winners) {
    const share =
      weightSum > 0 ? Math.max(1, Math.floor((WC_LONG_POOL.champion * (w.weight ?? 0)) / weightSum)) : 0;
    await db
      .update(wcLongPredictions)
      .set({ status: "correct", pointsAwarded: share, settledAt: now, updatedAt: now })
      .where(eq(wcLongPredictions.id, w.id));
    await awardPoints({
      userId: w.userId,
      action: LOYALTY_ACTIONS.WC_LONG_PREDICTION_WIN,
      source: "wc-long:champion",
      points: share,
      metadata: { championId, weight: w.weight },
    });
  }
  return { settled: true, winners: winners.length };
}

/** الهدّاف: بركة متساوية على من اختاروا اللاعب المتصدّر. */
async function settleTopScorer(playerId: number): Promise<{ settled: boolean; winners: number }> {
  const rows = await db
    .select({
      id: wcLongPredictions.id,
      userId: wcLongPredictions.userId,
      playerId: wcLongPredictions.playerId,
      settledAt: wcLongPredictions.settledAt,
    })
    .from(wcLongPredictions)
    .where(eq(wcLongPredictions.kind, "top_scorer"));
  const pending = rows.filter((r) => r.settledAt == null);
  if (pending.length === 0) return { settled: false, winners: 0 };

  const now = new Date();
  await db
    .update(wcLongPredictions)
    .set({ status: "incorrect", settledAt: now, updatedAt: now })
    .where(and(eq(wcLongPredictions.kind, "top_scorer"), sql`${wcLongPredictions.settledAt} is null`));

  const winners = pending.filter((r) => r.playerId === playerId);
  const share = winners.length > 0 ? Math.max(1, Math.floor(WC_LONG_POOL.top_scorer / winners.length)) : 0;
  for (const w of winners) {
    await db
      .update(wcLongPredictions)
      .set({ status: "correct", pointsAwarded: share, settledAt: now, updatedAt: now })
      .where(eq(wcLongPredictions.id, w.id));
    await awardPoints({
      userId: w.userId,
      action: LOYALTY_ACTIONS.WC_LONG_PREDICTION_WIN,
      source: "wc-long:top_scorer",
      points: share,
      metadata: { playerId },
    });
  }
  return { settled: true, winners: winners.length };
}
