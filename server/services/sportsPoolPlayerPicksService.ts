/**
 * Sabq Sports — طبقة توقّعات الهدافين (Expansion Phase A).
 *
 * يدير تسوية توقّعَي «هداف المباراة» (300 نقطة) و«أول هدّاف» (200 نقطة)
 * لكل مباراة. بركة pari-mutuel مستقلّة عن نتائج المباراة، تُقسَّم بالتساوي
 * على المصيبين. الهدافون الفعليّون يُستجلَبون من `getMatchDetail` (أحداث
 * API-Football بنوع «goal»). المُطابقة تتمّ بمعرّف اللاعب الرقمي عند توفّره،
 * مع تتراجّع للمطابقة بالاسم المُعرَّب إذا غاب المعرّف.
 *
 * نُمط التصميم مطابق لـ sportsPoolPredictionsService.settleFinishedMatches:
 * - حارس الإعاديّة: `settledAt` (لا تُسوَّى مباراة مرّتين).
 * - الـ lifetime dedup في awardPoints يمنع الدفع المزدوج حتى لو أُعيد التشغيل.
 * - صفّ SELECT … FOR UPDATE داخل transaction يمنع سباق الـ cron المتزامن.
 * - الـ picks تُغلَق (status='locked') عند انطلاق المباراة من نفس cron التسوية.
 */
import { and, desc, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  sportsPoolPlayerPicks,
  sportsPoolMatchPicks,
  sportsPoolMatches,
  notificationsInbox,
} from "@shared/schema";
import { getMatchDetail, type SplMatchEvent } from "./saudiLeagueService";
import { awardPoints } from "./loyalty";
import { LOYALTY_ACTIONS } from "@shared/loyalty";

// ---------------------------------------------------------------------------
// ثوابت البركة
// ---------------------------------------------------------------------------

const SCORER_POOL = 300; // بركة «هداف المباراة»
const FIRST_SCORER_POOL = 200; // بركة «أول هدّاف»

const nowSec = (): number => Math.floor(Date.now() / 1000);

export type PickKind = "match_scorer" | "first_scorer";

/** الحدث يُحتسب هدفًا مفترَضًا للواعد صاحب التوقّع (الاسم يخضع للتعريب).
 *  نستبعد الأهداف العكسيّة (own goal) لأنها تُحسب للفريق الآخر. */
function isScoringEvent(e: SplMatchEvent): boolean {
  return e.type === "goal" && !e.label.includes("عكسي");
}

/** يستخرج قائمة الهدافين الفعليّين من أحداث المباراة.
 *  الترتيب زمني (حسب الدقيقة) ليُعتبر أول عنصر هو «أول هدّاف». */
function extractActualScorers(events: SplMatchEvent[]): Array<{
  playerId: number | null;
  name: string;
  teamId: number;
  minute: number | null;
}> {
  const scorers: Array<{ playerId: number | null; name: string; teamId: number; minute: number | null }> = [];
  for (const e of events) {
    if (!isScoringEvent(e)) continue;
    // لا نضمّن هدفًا بلا اسم لاعب (لا يمكن مطابقته أصلًا).
    if (!e.player) continue;
    scorers.push({
      playerId: e.playerId ?? null,
      name: e.player,
      teamId: e.teamId,
      minute: e.minute,
    });
  }
  // ترتيب زمني تصاعدي — أول هدّاف = الأبكر. الأهداف المتأخّرة (extra) تُضاف للدقيقة.
  scorers.sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
  return scorers;
}

/** يطابق توقّع المستخدم بـ playerId رقمي إن توفّر، وإلّا بالاسم المُعرَّب.
 *  الاسم الحساس للحالة وللمسافات الزائدة يُقصّ ويُوحَّد. */
function pickMatchesScorer(
  pick: { playerId: number; playerName: string },
  scorer: { playerId: number | null; name: string },
): boolean {
  if (scorer.playerId != null && pick.playerId > 0 && scorer.playerId === pick.playerId) {
    return true;
  }
  // تتراجّع للمطابقة بالاسم عندما يغيب معرّف اللاعب (مزوّدون مثل TheSports).
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  if (!pick.playerName || !scorer.name) return false;
  return norm(pick.playerName) === norm(scorer.name);
}

export type SpPickSettlementSummary = { settled: number; awarded: number; errors: number };

// ---------------------------------------------------------------------------
// Settlement engine — تُدار من cron التسوية نفسه (sportsPredictionsJob)
// ---------------------------------------------------------------------------

/**
 * يُسوّي توقّعات الهدافين للمباريات المنتهية التي لم تُسوَّق بعد. يفترض أنّ
 * مباريات `sports_pool_matches` المُستقرّة قد عُولجت في الأصل؛ نحن نلتزم بجدول
 * `sports_pool_match_picks` المستقلّ (الذي يُنشأ عند فتح المباراة للتوقّع).
 *
 * Idempotent: حارس `settledAt` + الـ pending guard + lifetime dedup.
 */
export async function settlePlayerPickMatches(maxFixtures = 40): Promise<SpPickSettlementSummary> {
  const cutoff = nowSec() - 100 * 60; // ≥100 دقيقة من الانطلاق (نافذة نهاية المباراة)
  const due = await db
    .select({
      fixtureId: sportsPoolMatchPicks.fixtureId,
      competitionSlug: sportsPoolMatchPicks.competitionSlug,
      kickoffTs: sportsPoolMatchPicks.kickoffTs,
    })
    .from(sportsPoolMatchPicks)
    .where(and(isNull(sportsPoolMatchPicks.settledAt), sql`${sportsPoolMatchPicks.kickoffTs} < ${cutoff}`))
    .orderBy(sportsPoolMatchPicks.kickoffTs)
    .limit(maxFixtures);

  let settled = 0;
  let awarded = 0;
  let errors = 0;

  for (const m of due) {
    try {
      const detail = await getMatchDetail(m.fixtureId);
      if (!detail || !detail.fixture.status.finished) continue;

      const actualScorers = extractActualScorers(detail.events);
      const firstScorer = actualScorers[0] ?? null;
      const firstScorerId = firstScorer?.playerId ?? null;
      const homeName = detail.fixture.home.name;
      const awayName = detail.fixture.away.name;

      const payouts = await db.transaction(async (tx) => {
        const [locked] = await tx
          .select({ settledAt: sportsPoolMatchPicks.settledAt })
          .from(sportsPoolMatchPicks)
          .where(eq(sportsPoolMatchPicks.fixtureId, m.fixtureId))
          .for("update");
        if (locked?.settledAt != null) return null; // خسر السباق

        const picks = await tx
          .select()
          .from(sportsPoolPlayerPicks)
          .where(and(
            eq(sportsPoolPlayerPicks.fixtureId, m.fixtureId),
            eq(sportsPoolPlayerPicks.status, "pending"),
          ));

        if (picks.length === 0) {
          // لا توقّعات معلّقة — نُسوّي صف المباراة فقط (نحفظ الهدافين للعرض).
          await tx
            .update(sportsPoolMatchPicks)
            .set({
              status: "settled",
              actualScorers: actualScorers.map((s) => ({
                playerId: s.playerId ?? 0,
                name: s.name,
                teamId: s.teamId,
                minute: s.minute,
              })),
              firstScorerId,
              settledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(sportsPoolMatchPicks.fixtureId, m.fixtureId));
          return [];
        }

        // المُطابقة
        const winnerScorers = picks.filter(
          (p) => p.kind === "match_scorer" && actualScorers.some((s) => pickMatchesScorer(p, s)),
        );
        const winnerFirstScorers = picks.filter(
          (p) => p.kind === "first_scorer" && firstScorer != null && pickMatchesScorer(p, firstScorer),
        );

        const shareScorer = winnerScorers.length > 0
          ? Math.max(1, Math.floor(SCORER_POOL / winnerScorers.length))
          : 0;
        const shareFirstScorer = winnerFirstScorers.length > 0
          ? Math.max(1, Math.floor(FIRST_SCORER_POOL / winnerFirstScorers.length))
          : 0;

        const wins: { userId: string; points: number; kind: PickKind }[] = [];
        const now = new Date();

        for (const p of picks) {
          let isCorrect = false;
          let points = 0;
          if (p.kind === "match_scorer") {
            isCorrect = winnerScorers.some((w) => w.id === p.id);
            points = isCorrect ? shareScorer : 0;
          } else {
            isCorrect = winnerFirstScorers.some((w) => w.id === p.id);
            points = isCorrect ? shareFirstScorer : 0;
          }
          await tx
            .update(sportsPoolPlayerPicks)
            .set({
              status: isCorrect ? "correct" : "incorrect",
              pointsAwarded: points,
              settledAt: now,
              updatedAt: now,
            })
            .where(eq(sportsPoolPlayerPicks.id, p.id));
          if (points > 0) wins.push({ userId: p.userId, points, kind: p.kind as PickKind });
        }

        await tx
          .update(sportsPoolMatchPicks)
          .set({
            status: "settled",
            actualScorers: actualScorers.map((s) => ({
              playerId: s.playerId ?? 0,
              name: s.name,
              teamId: s.teamId,
              minute: s.minute,
            })),
            firstScorerId,
            paidScorer: shareScorer * winnerScorers.length,
            paidFirstScorer: shareFirstScorer * winnerFirstScorers.length,
            scorerWinners: winnerScorers.length,
            firstScorerWinners: winnerFirstScorers.length,
            settledAt: now,
            updatedAt: now,
          })
          .where(eq(sportsPoolMatchPicks.fixtureId, m.fixtureId));

        return wins;
      });

      if (payouts == null) continue;
      settled++;

      const winnerIds = new Set<string>();
      for (const w of payouts) {
        if (w.points <= 0) continue;
        winnerIds.add(w.userId);
        await notifyPickWin(w.userId, w.points, homeName, awayName, m.fixtureId, w.kind);
        const outcome = await awardPoints({
          userId: w.userId,
          action: LOYALTY_ACTIONS.SPORTS_SCORER_PREDICTION_WIN,
          source: `${m.fixtureId}:${w.kind}`,
          points: w.points,
          metadata: {
            fixtureId: String(m.fixtureId),
            kind: w.kind,
            home: homeName,
            away: awayName,
          },
        });
        if (outcome.awarded) awarded++;
      }
    } catch (err) {
      errors++;
      console.error(`[SportsPoolPicks] settle failed for fixture ${m.fixtureId}:`, err);
    }
  }

  return { settled, awarded, errors };
}

/** إشعار فوز توقّع الهداف — نفس نمط notifyWin في sportsPoolPredictionsService. */
async function notifyPickWin(
  userId: string,
  points: number,
  homeName: string,
  awayName: string,
  fixtureId: number,
  kind: PickKind,
): Promise<void> {
  const kindAr = kind === "match_scorer" ? "هداف المباراة ⚽" : "أول هدّاف 🥇";
  try {
    await db.insert(notificationsInbox).values({
      userId,
      type: "SPORTS_PREDICTION_WIN",
      title: "🎉 أصبت الهداف!",
      body: `${kindAr} في مباراة ${homeName} و${awayName} — ربحت ${points} نقطة.`,
      deeplink: "sabqsports://predictions",
      metadata: { fixtureId: String(fixtureId), points, kind },
    });
  } catch (err) {
    console.warn(`[SportsPoolPicks] notify failed for ${userId}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Lock-open lifecycle — يُستدعى من الـ routes عند فتح المباراة للتوقّع.
// ---------------------------------------------------------------------------

/** يضمن وجود صفّ `sports_pool_match_picks` للمباراة (upsert هادئ). يُستدعى
 *  عند جلب مباريات اليوم في `getTodayMatches`. */
export async function ensureMatchPickRow(
  fixtureId: number,
  kickoffTs: number,
  competitionSlug: string | null,
): Promise<void> {
  await db
    .insert(sportsPoolMatchPicks)
    .values({
      fixtureId,
      kickoffTs,
      competitionSlug,
      status: nowSec() >= kickoffTs ? "locked" : "open",
    })
    .onConflictDoNothing({ target: sportsPoolMatchPicks.fixtureId });
}

/** يُغلق توقّعات الهدافين عند انطلاق المباراة (يُستدعى من نفس cron الإغلاق
 *  الموجود لـ sports_pool_matches). Idempotent: لا يفتح ما أُغلق. */
export async function lockMatchPicksIfDue(): Promise<number> {
  const result = await db
    .update(sportsPoolMatchPicks)
    .set({ status: "locked", updatedAt: new Date() })
    .where(and(
      eq(sportsPoolMatchPicks.status, "open"),
      sql`${sportsPoolMatchPicks.kickoffTs} <= ${nowSec()}`,
    ))
    .returning({ fixtureId: sportsPoolMatchPicks.fixtureId });
  return result.length;
}

// ---------------------------------------------------------------------------
// واجهة القراءة/الكتابة للـ routes وiOS.
// ---------------------------------------------------------------------------

export type SpPickPlayer = {
  id: number;
  name: string;
  teamId: number;
  teamName: string;
  /** أساسي أم بديل — يُستخدم للعرض والتجميع. */
  starter: boolean;
};

export type SpMatchPlayersResponse = {
  fixtureId: number;
  /** lineups جاهزة؟ إن false، المباراة لم تُعلن تشكيلاتها بعد. */
  lineupsReady: boolean;
  kickoffTs: number;
  locked: boolean;
  home: { teamId: number; teamName: string; players: SpPickPlayer[] };
  away: { teamId: number; teamName: string; players: SpPickPlayer[] };
};

/** يجلب لاعبي مباراة لاختيار الهداف من lineups API-Football. الـ lineups قد
 *  لا تتوفّر قبل المباراة بساعات؛ في تلك الحالة lineupsReady=false ونعيد
 *  قوائم فارغة (العميل يُظهر رسالة «التشكيلات ستتوفّر قريبًا»). */
export async function getMatchPlayersForPicks(fixtureId: number): Promise<SpMatchPlayersResponse | null> {
  const detail = await getMatchDetail(fixtureId);
  if (!detail) return null;

  const fx = detail.fixture;
  const locked = fx.timestamp <= nowSec() || fx.status.live || fx.status.finished;

  const buildSide = (
    side: { id: number; name: string },
    lineup: typeof detail.lineups[number] | undefined,
  ): { teamId: number; teamName: string; players: SpPickPlayer[] } => {
    const players: SpPickPlayer[] = [];
    if (lineup) {
      for (const p of lineup.startXI) {
        if (p.id > 0) {
          players.push({ id: p.id, name: p.name, teamId: side.id, teamName: side.name, starter: true });
        }
      }
      for (const p of lineup.substitutes) {
        if (p.id > 0) {
          players.push({ id: p.id, name: p.name, teamId: side.id, teamName: side.name, starter: false });
        }
      }
    }
    return { teamId: side.id, teamName: side.name, players };
  };

  const homeLineup = detail.lineups.find((l) => l.team.id === fx.home.id);
  const awayLineup = detail.lineups.find((l) => l.team.id === fx.away.id);
  const home = buildSide(fx.home, homeLineup);
  const away = buildSide(fx.away, awayLineup);
  const lineupsReady = home.players.length > 0 || away.players.length > 0;

  return { fixtureId, lineupsReady, kickoffTs: fx.timestamp, locked, home, away };
}

export type SpSubmitPickInput = {
  fixtureId: number;
  kind: PickKind;
  playerId: number;
  playerName: string;
  teamId: number;
  teamName?: string;
};

export type SpSubmitPickResult =
  | { ok: true; pick: { kind: PickKind; playerId: number; playerName: string; status: string } }
  | { ok: false; reason: "INVALID" | "LOCKED" | "NOT_IN_LINEUP" | "NOT_OPEN" };

/** يُرسل أو يُعدّل توقّع الهداف. تحقّق: المباراة مفتوحة، اللاعب ضمن lineups
 *  (إن توفّرت)، النوع صحيح. upsert على (fixtureId, userId, kind). */
export async function submitPick(userId: string, input: SpSubmitPickInput): Promise<SpSubmitPickResult> {
  if (input.kind !== "match_scorer" && input.kind !== "first_scorer") {
    return { ok: false, reason: "INVALID" };
  }
  if (!Number.isFinite(input.playerId) || input.playerId <= 0 || !input.playerName) {
    return { ok: false, reason: "INVALID" };
  }

  // تحقّق حالة المباراة + خطّا الفريقين.
  const [matchRow] = await db
    .select({
      status: sportsPoolMatchPicks.status,
      kickoffTs: sportsPoolMatchPicks.kickoffTs,
    })
    .from(sportsPoolMatchPicks)
    .where(eq(sportsPoolMatchPicks.fixtureId, input.fixtureId))
    .limit(1);

  // إن لم يكن صفّ الـ picks موجودًا بعد، نتحقّق من المباراة الأم sports_pool_matches
  // ونُنشئ صف الـ picks. هذا يسمح بالتوقّع على الهداف حتى قبل توقّع النتيجة.
  if (!matchRow) {
    const [parent] = await db
      .select({ kickoffTs: sportsPoolMatches.kickoffTs, status: sportsPoolMatches.status })
      .from(sportsPoolMatches)
      .where(eq(sportsPoolMatches.fixtureId, input.fixtureId))
      .limit(1);
    if (!parent) return { ok: false, reason: "NOT_OPEN" };
    if (parent.kickoffTs <= nowSec()) return { ok: false, reason: "LOCKED" };
    await ensureMatchPickRow(input.fixtureId, parent.kickoffTs, null);
  } else {
    if (matchRow.status === "settled") return { ok: false, reason: "LOCKED" };
    if (matchRow.kickoffTs <= nowSec()) return { ok: false, reason: "LOCKED" };
  }

  // تحقّق أن اللاعب ضمن lineups (إن كانت متوفّرة). نسمح بالتوقّع إذا الـ lineups
  // لم تُعلَن بعد (القائمة فارغة) لأنّ المستخدم قد يتوقّع من قائمة الهدافين
  // الموسميّة — لكن نتحقّق إن وُجدت lineups فعلاً.
  const players = await getMatchPlayersForPicks(input.fixtureId);
  if (players && players.lineupsReady) {
    const all = [...players.home.players, ...players.away.players];
    if (!all.some((p) => p.id === input.playerId)) {
      return { ok: false, reason: "NOT_IN_LINEUP" };
    }
  }

  await db
    .insert(sportsPoolPlayerPicks)
    .values({
      fixtureId: input.fixtureId,
      userId,
      kind: input.kind,
      playerId: input.playerId,
      playerName: input.playerName,
      teamId: input.teamId,
      teamName: input.teamName ?? null,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [sportsPoolPlayerPicks.fixtureId, sportsPoolPlayerPicks.userId, sportsPoolPlayerPicks.kind],
      set: {
        playerId: input.playerId,
        playerName: input.playerName,
        teamId: input.teamId,
        teamName: input.teamName ?? null,
        updatedAt: new Date(),
      },
    });

  return {
    ok: true,
    pick: { kind: input.kind, playerId: input.playerId, playerName: input.playerName, status: "pending" },
  };
}

export type SpMyPickRow = {
  fixtureId: number;
  kind: PickKind;
  playerId: number;
  playerName: string;
  teamId: number;
  teamName: string | null;
  status: string;
  pointsAwarded: number;
  kickoffTs: number | null;
  competitionSlug: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  finalHome: number | null;
  finalAway: number | null;
  actualScorers: Array<{ playerId: number; name: string; teamId: number; minute: number | null }> | null;
  firstScorerId: number | null;
};

/** توقّعات الهدافين للمستخدم الحالي + معلومات التسوية لكل مباراة. */
export async function getMyPicks(userId: string): Promise<SpMyPickRow[]> {
  const rows = await db
    .select({
      id: sportsPoolPlayerPicks.id,
      fixtureId: sportsPoolPlayerPicks.fixtureId,
      kind: sportsPoolPlayerPicks.kind,
      playerId: sportsPoolPlayerPicks.playerId,
      playerName: sportsPoolPlayerPicks.playerName,
      teamId: sportsPoolPlayerPicks.teamId,
      teamName: sportsPoolPlayerPicks.teamName,
      status: sportsPoolPlayerPicks.status,
      pointsAwarded: sportsPoolPlayerPicks.pointsAwarded,
      kickoffTs: sportsPoolMatchPicks.kickoffTs,
      competitionSlug: sportsPoolMatchPicks.competitionSlug,
      actualScorers: sportsPoolMatchPicks.actualScorers,
      firstScorerId: sportsPoolMatchPicks.firstScorerId,
    })
    .from(sportsPoolPlayerPicks)
    .leftJoin(sportsPoolMatchPicks, eq(sportsPoolPlayerPicks.fixtureId, sportsPoolMatchPicks.fixtureId))
    .where(eq(sportsPoolPlayerPicks.userId, userId))
    .orderBy(desc(sportsPoolMatchPicks.kickoffTs));

  // اربط أسماء الفرق من sports_pool_matches (المصدر الموثوق للأسماء).
  const fixtureIds = [...new Set(rows.map((r) => r.fixtureId))];
  const matchNames = fixtureIds.length > 0
    ? await db
        .select({
          fixtureId: sportsPoolMatches.fixtureId,
          homeTeamName: sportsPoolMatches.homeTeamName,
          awayTeamName: sportsPoolMatches.awayTeamName,
          finalHome: sportsPoolMatches.finalHome,
          finalAway: sportsPoolMatches.finalAway,
        })
        .from(sportsPoolMatches)
        .where(inArray(sportsPoolMatches.fixtureId, fixtureIds))
    : [];
  const namesByFixture = new Map(matchNames.map((m) => [m.fixtureId, m]));

  return rows.map((r) => ({
    fixtureId: r.fixtureId,
    kind: r.kind as PickKind,
    playerId: r.playerId,
    playerName: r.playerName,
    teamId: r.teamId,
    teamName: r.teamName,
    status: r.status,
    pointsAwarded: Number(r.pointsAwarded ?? 0),
    kickoffTs: r.kickoffTs ?? null,
    competitionSlug: r.competitionSlug ?? null,
    homeTeamName: namesByFixture.get(r.fixtureId)?.homeTeamName ?? null,
    awayTeamName: namesByFixture.get(r.fixtureId)?.awayTeamName ?? null,
    finalHome: namesByFixture.get(r.fixtureId)?.finalHome ?? null,
    finalAway: namesByFixture.get(r.fixtureId)?.finalAway ?? null,
    actualScorers: r.actualScorers ?? null,
    firstScorerId: r.firstScorerId ?? null,
  }));
}
