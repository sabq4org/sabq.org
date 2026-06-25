/**
 * مسابقة توقّعات كأس آسيا 2027 الذكية — المحرّك.
 *
 * تختلف جوهريًّا عن مسابقة المونديال (التي تقسم 500 نقطة على مَن أصاب النتيجة
 * بالضبط). هنا كل مستخدم يكسب نقاطه الخاصّة بالمهارة لكل مباراة:
 *
 *   نقاط = (نقاط الطبقات: نتيجة 10 + فارق 8 + مطابقة 12)
 *          × مضاعِف الجرأة (احتمال نتيجتك المعكوس — الإصابة البعيدة تُضاعِف)
 *          × مضاعِف السلسلة (إصاباتك المتتالية)
 *
 * المساعد الذكي: لكل مباراة نعرض احتمالات النموذج (asianCupRatings) + إجماع
 * الجمهور اللحظي. المباريات لا تُخزَّن — تُجلب حيّة من asianCupService خلف كاش
 * SWR. نخزّن توقّعات المستخدمين (ac_predictions) ولقطة كل مباراة بما فيها
 * احتمالات ما قبل الصافرة المجمَّدة (ac_prediction_matches).
 *
 * ADR-001: هذه الخدمة تملك كل استعلامات Drizzle؛ مسار acPredictions لا يستورد db.
 */
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { acPredictions, acPredictionMatches, users } from "@shared/schema";
import {
  getAcFixtures,
  getAcStandings,
  isAsianCupConfigured,
  type AcFixture,
  type AcStandingRow,
} from "./asianCupService";
import { WC_FINISHED_STATUSES, WC_LIVE_STATUSES } from "./worldCupNames";
import {
  computeMatchProbabilities,
  toWholePercents,
  boldnessMultiplier,
  streakMultiplier,
  scorePrediction,
  outcomeOf,
  type Outcome,
} from "./asianCupRatings";
import { awardPoints } from "./loyalty";
import { LOYALTY_ACTIONS } from "@shared/loyalty";

/** التفعيل صريح: المفتاح موجود + علم البيئة مرفوع (لا نكشف الميزة قبل قرار النشر). */
export function isAcPredictionsEnabled(): boolean {
  return isAsianCupConfigured() && process.env.AC_PREDICTIONS_ENABLED === "true";
}

const fid = (fixtureId: number | string): string => String(fixtureId);

/** مفتاح يوم بتوقيت الرياض (تواريخ المزود تصل بإزاحة +03:00). */
function riyadhDateKey(offsetDays = 0): string {
  return new Date(Date.now() + (3 * 60 * 60 + offsetDays * 24 * 60 * 60) * 1000)
    .toISOString()
    .slice(0, 10);
}

/** مباراة «مقفلة» متى انطلقت أو انتهت أو حان موعدها — حارس مزدوج كما في المونديال. */
function isLocked(fx: AcFixture): boolean {
  if (WC_LIVE_STATUSES.has(fx.status.code) || WC_FINISHED_STATUSES.has(fx.status.code)) return true;
  return Date.now() >= fx.timestamp * 1000;
}

/** تُسوّى فقط المباريات ذات نتيجة فعلية على الملعب (FT/AET/PEN مع أهداف). */
function hasRealFinalScore(fx: AcFixture): boolean {
  const settleable = new Set(["FT", "AET", "PEN"]);
  return settleable.has(fx.status.code) && fx.goals.home != null && fx.goals.away != null;
}

/** خريطة معرّف منتخب ← صفّ ترتيبه (للفورمة في النموذج). */
async function standingsMap(): Promise<Map<number, AcStandingRow>> {
  const groups = await getAcStandings();
  const m = new Map<number, AcStandingRow>();
  for (const g of groups) for (const r of g.rows) m.set(r.team.id, r);
  return m;
}

/** احتمالات مباراة كنِسَب مئوية صحيحة تجمع 100. */
function percentsFor(fx: AcFixture, smap: Map<number, AcStandingRow>) {
  const probs = computeMatchProbabilities({
    homeId: fx.home.id,
    awayId: fx.away.id,
    homeRow: smap.get(fx.home.id),
    awayRow: smap.get(fx.away.id),
  });
  return toWholePercents(probs);
}

/** نتيجة توقّع من الأهداف المتوقَّعة. */
const pickOutcome = (predHome: number, predAway: number): Outcome => outcomeOf(predHome, predAway);

/** نسبة احتمال النتيجة المختارة (كسر 0..1) من لقطة النِسَب المئوية. */
function probOfPick(pick: Outcome, p: { home: number; draw: number; away: number }): number {
  const pct = pick === "home" ? p.home : pick === "away" ? p.away : p.draw;
  return pct / 100;
}

// ---------------------------------------------------------------------------
// أنواع الإخراج للواجهة
// ---------------------------------------------------------------------------

export type AcModelProbs = { home: number; draw: number; away: number };
export type AcCrowd = { home: number; draw: number; away: number; total: number };

export type AcMyPrediction = {
  predHome: number;
  predAway: number;
  status: string;
  outcomeHit: boolean;
  marginHit: boolean;
  exactHit: boolean;
  boldnessMult: number; // ×100
  streakMult: number;   // ×100
  pointsAwarded: number;
};

export type AcMatchSettlement = {
  status: string;
  finalHome: number | null;
  finalAway: number | null;
  predictionsCount: number;
  outcomeWinners: number;
  exactWinners: number;
};

export type AcPredictableMatch = {
  fixture: AcFixture;
  locked: boolean;
  probs: AcModelProbs;
  crowd: AcCrowd;
  predictionsCount: number;
  myPrediction: AcMyPrediction | null;
  settlement: AcMatchSettlement | null;
};

export type AcMeStats = {
  points: number;
  correct: number;
  exact: number;
  played: number;
  currentStreak: number;
};

export type AcSubmitResult =
  | { ok: true; prediction: { predHome: number; predAway: number; status: string } }
  | { ok: false; reason: "NOT_FOUND" | "LOCKED" | "INVALID" };

// ---------------------------------------------------------------------------
// كتابة التوقّع
// ---------------------------------------------------------------------------

export async function submitPrediction(
  userId: string,
  fixtureId: number,
  predHome: number,
  predAway: number,
): Promise<AcSubmitResult> {
  if (
    !Number.isInteger(predHome) || !Number.isInteger(predAway) ||
    predHome < 0 || predAway < 0 || predHome > 99 || predAway > 99
  ) {
    return { ok: false, reason: "INVALID" };
  }

  const fx = (await getAcFixtures()).find((f) => f.id === fixtureId);
  if (!fx) return { ok: false, reason: "NOT_FOUND" };
  if (isLocked(fx)) return { ok: false, reason: "LOCKED" };

  // لقطة المباراة (open) مع احتمالات ما قبل الصافرة المحسوبة الآن — تتجمّد عند
  // آخر توقّع قبل القفل وتُسعِّر الجرأة عند التسوية.
  const pct = percentsFor(fx, await standingsMap());
  await db
    .insert(acPredictionMatches)
    .values({
      fixtureId: fid(fx.id),
      kickoffAt: new Date(fx.timestamp * 1000),
      homeTeamId: fx.home.id,
      awayTeamId: fx.away.id,
      homeTeamName: fx.home.name,
      homeTeamLogo: fx.home.logo,
      awayTeamName: fx.away.name,
      awayTeamLogo: fx.away.logo,
      probHome: pct.home,
      probDraw: pct.draw,
      probAway: pct.away,
      status: "open",
    })
    .onConflictDoUpdate({
      target: acPredictionMatches.fixtureId,
      set: {
        homeTeamId: fx.home.id,
        awayTeamId: fx.away.id,
        homeTeamName: fx.home.name,
        homeTeamLogo: fx.home.logo,
        awayTeamName: fx.away.name,
        awayTeamLogo: fx.away.logo,
        kickoffAt: new Date(fx.timestamp * 1000),
        // التوقّع لا يمرّ إلا والمباراة مفتوحة (isLocked يحرس)، فتحديث الاحتمالات
        // هنا يبقى دائمًا ضمن طور ما قبل الصافرة — تتجمّد عند آخر توقّع قبل القفل.
        probHome: pct.home,
        probDraw: pct.draw,
        probAway: pct.away,
        updatedAt: new Date(),
      },
    });

  const [row] = await db
    .insert(acPredictions)
    .values({ fixtureId: fid(fx.id), userId, predHome, predAway })
    .onConflictDoUpdate({
      target: [acPredictions.fixtureId, acPredictions.userId],
      set: { predHome, predAway, updatedAt: new Date() },
    })
    .returning({
      predHome: acPredictions.predHome,
      predAway: acPredictions.predAway,
      status: acPredictions.status,
    });

  return { ok: true, prediction: row };
}

// ---------------------------------------------------------------------------
// قراءات الواجهة
// ---------------------------------------------------------------------------

/** سلسلة المستخدم الحالية: عدد الإصابات المتتالية (نتيجة صحيحة) في آخر تسوياته. */
async function computeCurrentStreak(userId: string): Promise<number> {
  const rows = await db
    .select({ outcomeHit: acPredictions.outcomeHit })
    .from(acPredictions)
    .innerJoin(acPredictionMatches, eq(acPredictions.fixtureId, acPredictionMatches.fixtureId))
    .where(and(eq(acPredictions.userId, userId), isNotNull(acPredictions.settledAt)))
    .orderBy(desc(acPredictionMatches.kickoffAt));
  let n = 0;
  for (const r of rows) {
    if (r.outcomeHit) n++;
    else break;
  }
  return n;
}

/** إحصاءات المستخدم المختصرة (لشريط البطل + معاينة النقاط المحتملة). */
async function getMeStats(userId: string): Promise<AcMeStats> {
  const [agg] = await db
    .select({
      points: sql<number>`coalesce(sum(${acPredictions.pointsAwarded}), 0)::int`,
      correct: sql<number>`count(*) filter (where ${acPredictions.outcomeHit})::int`,
      exact: sql<number>`count(*) filter (where ${acPredictions.exactHit})::int`,
      played: sql<number>`count(*) filter (where ${acPredictions.status} <> 'pending')::int`,
    })
    .from(acPredictions)
    .where(eq(acPredictions.userId, userId));
  return {
    points: Number(agg?.points ?? 0),
    correct: Number(agg?.correct ?? 0),
    exact: Number(agg?.exact ?? 0),
    played: Number(agg?.played ?? 0),
    currentStreak: await computeCurrentStreak(userId),
  };
}

/**
 * مباريات اليوم والغد (بتوقيت الرياض) + احتمالات النموذج + إجماع الجمهور +
 * توقّع المستخدم + حالة القفل/التسوية. ومعها إحصاءات المستخدم (me) إن سجّل دخوله.
 */
export async function getUpcomingPredictableMatches(
  userId?: string,
): Promise<{ matches: AcPredictableMatch[]; me: AcMeStats | null }> {
  const [fixtures, smap] = await Promise.all([getAcFixtures(), standingsMap()]);
  const days = new Set([riyadhDateKey(0), riyadhDateKey(1)]);
  const today = fixtures.filter((f) => days.has((f.date ?? "").slice(0, 10)));
  if (today.length === 0) {
    return { matches: [], me: userId ? await getMeStats(userId) : null };
  }

  const ids = today.map((f) => fid(f.id));

  // إجماع الجمهور (توزيع النتائج المتوقَّعة) — تجميع واحد لكل المباريات.
  const crowdRows = await db
    .select({
      fixtureId: acPredictions.fixtureId,
      home: sql<number>`count(*) filter (where ${acPredictions.predHome} > ${acPredictions.predAway})::int`,
      draw: sql<number>`count(*) filter (where ${acPredictions.predHome} = ${acPredictions.predAway})::int`,
      away: sql<number>`count(*) filter (where ${acPredictions.predHome} < ${acPredictions.predAway})::int`,
    })
    .from(acPredictions)
    .where(inArray(acPredictions.fixtureId, ids))
    .groupBy(acPredictions.fixtureId);
  const crowdByFixture = new Map(crowdRows.map((r) => [r.fixtureId, r]));

  // لقطات المباريات (الاحتمالات المجمّدة + التسوية).
  const matchRows = await db
    .select()
    .from(acPredictionMatches)
    .where(inArray(acPredictionMatches.fixtureId, ids));
  const matchByFixture = new Map(matchRows.map((m) => [m.fixtureId, m]));

  // توقّع المستخدم الحالي (إن وُجد).
  const myByFixture = new Map<string, AcMyPrediction>();
  if (userId) {
    const mine = await db
      .select()
      .from(acPredictions)
      .where(and(eq(acPredictions.userId, userId), inArray(acPredictions.fixtureId, ids)));
    for (const m of mine) {
      myByFixture.set(m.fixtureId, {
        predHome: m.predHome,
        predAway: m.predAway,
        status: m.status,
        outcomeHit: m.outcomeHit,
        marginHit: m.marginHit,
        exactHit: m.exactHit,
        boldnessMult: m.boldnessMult,
        streakMult: m.streakMult,
        pointsAwarded: m.pointsAwarded,
      });
    }
  }

  const matches: AcPredictableMatch[] = today.map((fixture) => {
    const key = fid(fixture.id);
    const snap = matchByFixture.get(key);
    // الاحتمالات: المجمّدة من اللقطة إن وُجدت، وإلا محسوبة حيًّا للعرض.
    const probs: AcModelProbs = snap
      ? { home: snap.probHome, draw: snap.probDraw, away: snap.probAway }
      : percentsFor(fixture, smap);
    const c = crowdByFixture.get(key);
    const cHome = Number(c?.home ?? 0);
    const cDraw = Number(c?.draw ?? 0);
    const cAway = Number(c?.away ?? 0);
    const total = cHome + cDraw + cAway;
    const crowd: AcCrowd = total > 0
      ? {
          home: Math.round((cHome / total) * 100),
          draw: Math.round((cDraw / total) * 100),
          away: Math.round((cAway / total) * 100),
          total,
        }
      : { home: 0, draw: 0, away: 0, total: 0 };

    return {
      fixture,
      locked: isLocked(fixture),
      probs,
      crowd,
      predictionsCount: total,
      myPrediction: myByFixture.get(key) ?? null,
      settlement: snap
        ? {
            status: snap.status,
            finalHome: snap.finalHome,
            finalAway: snap.finalAway,
            predictionsCount: snap.predictionsCount,
            outcomeWinners: snap.outcomeWinners,
            exactWinners: snap.exactWinners,
          }
        : null,
    };
  });

  return { matches, me: userId ? await getMeStats(userId) : null };
}

/** سجل توقّعات المستخدم كاملًا — يُبنى من اللقطة بلا نداء API حيّ. */
export async function getMyPredictions(userId: string) {
  return db
    .select({
      fixtureId: acPredictions.fixtureId,
      predHome: acPredictions.predHome,
      predAway: acPredictions.predAway,
      status: acPredictions.status,
      outcomeHit: acPredictions.outcomeHit,
      marginHit: acPredictions.marginHit,
      exactHit: acPredictions.exactHit,
      boldnessMult: acPredictions.boldnessMult,
      streakMult: acPredictions.streakMult,
      pointsAwarded: acPredictions.pointsAwarded,
      createdAt: acPredictions.createdAt,
      kickoffAt: acPredictionMatches.kickoffAt,
      homeTeamName: acPredictionMatches.homeTeamName,
      homeTeamLogo: acPredictionMatches.homeTeamLogo,
      awayTeamName: acPredictionMatches.awayTeamName,
      awayTeamLogo: acPredictionMatches.awayTeamLogo,
      finalHome: acPredictionMatches.finalHome,
      finalAway: acPredictionMatches.finalAway,
      matchStatus: acPredictionMatches.status,
    })
    .from(acPredictions)
    .leftJoin(acPredictionMatches, eq(acPredictions.fixtureId, acPredictionMatches.fixtureId))
    .where(eq(acPredictions.userId, userId))
    .orderBy(desc(acPredictionMatches.kickoffAt));
}

/** عدّادات مباراة + نتيجتها إن سُوّيت — لا نكشف توقّعات الآخرين الفردية. */
export async function getMatchPredictionsSummary(fixtureId: number): Promise<AcMatchSettlement & { crowd: AcCrowd }> {
  const key = fid(fixtureId);
  const [snap] = await db
    .select()
    .from(acPredictionMatches)
    .where(eq(acPredictionMatches.fixtureId, key));
  const [c] = await db
    .select({
      home: sql<number>`count(*) filter (where ${acPredictions.predHome} > ${acPredictions.predAway})::int`,
      draw: sql<number>`count(*) filter (where ${acPredictions.predHome} = ${acPredictions.predAway})::int`,
      away: sql<number>`count(*) filter (where ${acPredictions.predHome} < ${acPredictions.predAway})::int`,
    })
    .from(acPredictions)
    .where(eq(acPredictions.fixtureId, key));
  const cHome = Number(c?.home ?? 0);
  const cDraw = Number(c?.draw ?? 0);
  const cAway = Number(c?.away ?? 0);
  const total = cHome + cDraw + cAway;
  return {
    status: snap?.status ?? "open",
    finalHome: snap?.finalHome ?? null,
    finalAway: snap?.finalAway ?? null,
    predictionsCount: total,
    outcomeWinners: snap?.outcomeWinners ?? 0,
    exactWinners: snap?.exactWinners ?? 0,
    crowd: total > 0
      ? {
          home: Math.round((cHome / total) * 100),
          draw: Math.round((cDraw / total) * 100),
          away: Math.round((cAway / total) * 100),
          total,
        }
      : { home: 0, draw: 0, away: 0, total: 0 },
  };
}

/** لوحة المتصدّرين — الترتيب بمجموع النقاط ثم الإصابات الدقيقة ثم النتائج الصحيحة. */
export async function getLeaderboard(limit = 100) {
  const rows = await db
    .select({
      userId: acPredictions.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.profileImageUrl,
      totalPoints: sql<number>`coalesce(sum(${acPredictions.pointsAwarded}), 0)::int`,
      correctCount: sql<number>`count(*) filter (where ${acPredictions.outcomeHit})::int`,
      exactCount: sql<number>`count(*) filter (where ${acPredictions.exactHit})::int`,
      playedCount: sql<number>`count(*) filter (where ${acPredictions.status} <> 'pending')::int`,
    })
    .from(acPredictions)
    .innerJoin(users, eq(acPredictions.userId, users.id))
    .groupBy(acPredictions.userId, users.firstName, users.lastName, users.profileImageUrl)
    .having(sql`count(*) filter (where ${acPredictions.status} <> 'pending') > 0`)
    .orderBy(
      desc(sql`coalesce(sum(${acPredictions.pointsAwarded}), 0)`),
      desc(sql`count(*) filter (where ${acPredictions.exactHit})`),
      desc(sql`count(*) filter (where ${acPredictions.outcomeHit})`),
    )
    .limit(limit);

  return rows.map((r, i) => {
    const played = Number(r.playedCount);
    const correct = Number(r.correctCount);
    return {
      rank: i + 1,
      userId: r.userId,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "عضو سبق",
      avatar: r.avatar,
      totalPoints: Number(r.totalPoints),
      correctCount: correct,
      exactCount: Number(r.exactCount),
      playedCount: played,
      accuracy: played > 0 ? Math.round((correct / played) * 100) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// محرّك التسوية — كل دقيقة عبر الكرون
// ---------------------------------------------------------------------------

export type AcSettlementSummary = { settled: number; awarded: number; errors: number };

/** سلسلة المستخدم قبل مباراة بعينها (داخل المعاملة) — للفائزين فقط. */
async function priorStreakTx(tx: any, userId: string, beforeKickoff: Date): Promise<number> {
  const rows = await tx
    .select({ outcomeHit: acPredictions.outcomeHit })
    .from(acPredictions)
    .innerJoin(acPredictionMatches, eq(acPredictions.fixtureId, acPredictionMatches.fixtureId))
    .where(
      and(
        eq(acPredictions.userId, userId),
        isNotNull(acPredictions.settledAt),
        sql`${acPredictionMatches.kickoffAt} < ${beforeKickoff}`,
      ),
    )
    .orderBy(desc(acPredictionMatches.kickoffAt));
  let n = 0;
  for (const r of rows) {
    if (r.outcomeHit) n++;
    else break;
  }
  return n;
}

/**
 * يُسوّي المباريات المنتهية ويمنح كل مستخدم نقاطه المهاريّة. نفس درع الـ
 * idempotency ثلاثي الطبقات في المونديال (settledAt مرساة + قيد pending +
 * dedup الولاء)، مع اختلاف جوهري: لكل مستخدم نقاطه الخاصّة لا قسمة مجمَّع.
 *
 * commit-ثم-award: Phase A تسوية ذرّية تكتب التفصيل وتعلّم المباراة مُسوّاة،
 * Phase B تمنح نقاط الولاء بعدها (آمنة للتكرار عبر dedup المصدر=fixtureId).
 */
export async function settleFinishedMatches(): Promise<AcSettlementSummary> {
  const fixtures = await getAcFixtures();
  const finished = fixtures.filter(hasRealFinalScore);
  let settled = 0;
  let awarded = 0;
  let errors = 0;

  for (const fx of finished) {
    try {
      const key = fid(fx.id);
      const [existing] = await db
        .select({ settledAt: acPredictionMatches.settledAt })
        .from(acPredictionMatches)
        .where(eq(acPredictionMatches.fixtureId, key));

      // لا لقطة ⇒ لا توقّعات على هذه المباراة (تُنشأ عند أول توقّع).
      if (!existing) continue;

      let payouts: { userId: string; points: number }[] = [];

      if (existing.settledAt == null) {
        // ---- Phase A: تسوية ذرّية ----
        const result = await db.transaction(async (tx) => {
          const [locked] = await tx
            .select({
              settledAt: acPredictionMatches.settledAt,
              probHome: acPredictionMatches.probHome,
              probDraw: acPredictionMatches.probDraw,
              probAway: acPredictionMatches.probAway,
              kickoffAt: acPredictionMatches.kickoffAt,
            })
            .from(acPredictionMatches)
            .where(eq(acPredictionMatches.fixtureId, key))
            .for("update");
          if (locked?.settledAt != null) return null; // خسرنا السباق

          const finalHome = fx.goals.home as number;
          const finalAway = fx.goals.away as number;
          const snapPct = { home: locked.probHome, draw: locked.probDraw, away: locked.probAway };
          const now = new Date();

          const preds = await tx
            .select({
              userId: acPredictions.userId,
              predHome: acPredictions.predHome,
              predAway: acPredictions.predAway,
            })
            .from(acPredictions)
            .where(and(eq(acPredictions.fixtureId, key), eq(acPredictions.status, "pending")));

          const wins: { userId: string; points: number }[] = [];
          let outcomeWinners = 0;
          let exactWinners = 0;

          for (const p of preds) {
            const pick = pickOutcome(p.predHome, p.predAway);
            const pProb = probOfPick(pick, snapPct);
            // الفائزون (نتيجة صحيحة) يحتاجون السلسلة؛ غيرهم 0 بلا استعلام.
            const outcomeHit = pick === outcomeOf(finalHome, finalAway);
            const prior = outcomeHit ? await priorStreakTx(tx, p.userId, locked.kickoffAt) : 0;
            const br = scorePrediction(
              p.predHome, p.predAway, finalHome, finalAway, pProb, prior,
            );

            await tx
              .update(acPredictions)
              .set({
                status: br.outcomeHit ? "correct" : "incorrect",
                outcomeHit: br.outcomeHit,
                marginHit: br.marginHit,
                exactHit: br.exactHit,
                boldnessMult: Math.round(br.boldness * 100),
                streakMult: Math.round(br.streak * 100),
                pointsAwarded: br.points,
                settledAt: now,
                updatedAt: now,
              })
              .where(
                and(
                  eq(acPredictions.fixtureId, key),
                  eq(acPredictions.userId, p.userId),
                  eq(acPredictions.status, "pending"),
                ),
              );

            if (br.outcomeHit) outcomeWinners++;
            if (br.exactHit) exactWinners++;
            if (br.points > 0) wins.push({ userId: p.userId, points: br.points });
          }

          const [{ total }] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(acPredictions)
            .where(eq(acPredictions.fixtureId, key));

          await tx
            .update(acPredictionMatches)
            .set({
              status: "settled",
              finalHome,
              finalAway,
              predictionsCount: Number(total ?? 0),
              outcomeWinners,
              exactWinners,
              settledAt: now,
              updatedAt: now,
            })
            .where(eq(acPredictionMatches.fixtureId, key));

          return wins;
        });

        if (result == null) continue; // سُوّيت في دورة متزامنة
        payouts = result;
        settled++;
      } else {
        // مسوّاة مسبقًا — توفيق بعد موت محتمل بين A وB: نعيد اشتقاق المدفوعات من
        // الصفوف الثابتة؛ dedup يجعل إعادة المنح مجانية لمن دُفع له.
        const rows = await db
          .select({ userId: acPredictions.userId, points: acPredictions.pointsAwarded })
          .from(acPredictions)
          .where(
            and(
              eq(acPredictions.fixtureId, key),
              eq(acPredictions.status, "correct"),
              sql`${acPredictions.pointsAwarded} > 0`,
            ),
          );
        payouts = rows.map((r) => ({ userId: r.userId, points: Number(r.points) }));
        if (payouts.length === 0) continue;
      }

      // ---- Phase B: منح النقاط (خارج المعاملة، آمن للتكرار) ----
      for (const w of payouts) {
        if (w.points <= 0) continue;
        const outcome = await awardPoints({
          userId: w.userId,
          action: LOYALTY_ACTIONS.AC_PREDICTION_WIN,
          source: key, // مفتاح dedup — مرة واحدة لكل (مستخدم، مباراة)
          points: w.points,
          metadata: { fixtureId: key, score: `${fx.goals.home}-${fx.goals.away}` },
        });
        if (outcome.awarded) awarded++;
      }
    } catch (err) {
      errors++;
      console.error(`[AC Predictions] settle failed for fixture ${fx.id}:`, err);
    }
  }

  return { settled, awarded, errors };
}
