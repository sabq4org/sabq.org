/**
 * Social read-models for Gulf Cup prediction majalis. All endpoints share the
 * same membership/privacy rules; route modules only translate reasons to HTTP.
 */
import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import { db } from "../db";
import {
  gcFantasySquads,
  gcBadges,
  gcLongPredictions,
  gcMajalis,
  gcMajlisMembers,
  gcPredictionMatches,
  gcPredictions,
  userNotificationPrefs,
  users,
} from "@shared/schema";
import {
  getGcFantasyPoints,
  getGcFixtures,
  type GcFixture,
} from "./gulfCupService";
import type { GcMajlisResult, GcMajlisSummary } from "./gcMajlisService";
import { GC_FIXTURES } from "./gulfCupData";
import {
  gcImmutableTournamentLockAt,
  isGcTournamentLocked,
} from "./gulfCupFixtureIdentity";
import {
  gcFixtureSettlementDisposition,
  isGcClosedMatchStatus,
  isGcCountedPredictionStatus,
} from "./gcPredictionSettlementLogic";
import {
  dayChampionStatus,
  matchVisibility,
  selectDayChampions,
  selectHarvestAwards,
  visibleMemberPrediction,
  type DayChampionCandidate,
  type HarvestAccuracyCandidate,
  type HarvestBoldCandidate,
  type HarvestChampionCandidate,
  type HarvestStubbornCandidate,
} from "./gcMajlisLogic";

const MAX_MEMBERS = 50;
const MIN_ACCURACY_PICKS = 3;
const MIN_STUBBORN_PICKS = 3;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

type MajlisMemberRow = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  joinedAt: Date;
};

function displayName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "عضو سبق";
}

function riyadhDateKey(date: Date): string {
  return new Date(date.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

function fixtureDateKey(fixture: GcFixture): string {
  return riyadhDateKey(new Date(fixture.timestamp * 1000));
}

/**
 * أبطال آخر جولة مكتملة التسوية داخل المجلس — تُعلَّق الشارة على الترتيب
 * حتى تكتمل جولة لاحقة لها فائزون جدد (وفق الخطة).
 */
export async function resolveMajlisDayChampionUserIds(
  memberIds: string[],
): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const fixtures = await getGcFixtures();
  if (fixtures.length === 0) return [];

  const byDate = new Map<string, GcFixture[]>();
  for (const fixture of fixtures) {
    const key = fixtureDateKey(fixture);
    const list = byDate.get(key) ?? [];
    list.push(fixture);
    byDate.set(key, list);
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a));

  for (const date of dates) {
    const dayFixtures = byDate.get(date) ?? [];
    const fixtureIds = dayFixtures.map((fixture) => String(fixture.id));
    const [predictionRows, snapshots] = await Promise.all([
      db.select().from(gcPredictions).where(and(
        inArray(gcPredictions.fixtureId, fixtureIds),
        inArray(gcPredictions.userId, memberIds),
      )),
      db.select().from(gcPredictionMatches).where(inArray(gcPredictionMatches.fixtureId, fixtureIds)),
    ]);
    const snapshotByFixture = new Map(snapshots.map((row) => [row.fixtureId, row]));
    const championByUser = new Map<string, DayChampionCandidate>();
    let settledMatches = 0;

    for (const fixture of dayFixtures) {
      const fixtureId = String(fixture.id);
      const matchPredictions = predictionRows.filter((row) => row.fixtureId === fixtureId);
      const snapshot = snapshotByFixture.get(fixtureId);
      const disposition = gcFixtureSettlementDisposition({
        statusCode: fixture.status.code,
        goalsHome: fixture.goals.home,
        goalsAway: fixture.goals.away,
      });
      const voidFixture = disposition === "void";
      const settled = voidFixture || isGcClosedMatchStatus(snapshot?.status) || (
        fixture.status.finished && matchPredictions.every((row) => row.status !== "pending")
      );
      if (!settled) continue;
      settledMatches += 1;
      for (const prediction of matchPredictions) {
        if (!isGcCountedPredictionStatus(prediction.status)) continue;
        const current = championByUser.get(prediction.userId) ?? {
          userId: prediction.userId,
          name: "",
          avatar: null,
          points: 0,
          exact: 0,
          correct: 0,
          played: 0,
        };
        current.points += Number(prediction.pointsAwarded || 0);
        current.exact += prediction.exactHit ? 1 : 0;
        current.correct += prediction.outcomeHit ? 1 : 0;
        current.played += 1;
        championByUser.set(prediction.userId, current);
      }
    }

    // جولة جارية غير مكتملة — نتخطاها ونعلّق أبطال آخر يوم مُسوّى بالكامل.
    if (settledMatches !== dayFixtures.length) continue;
    if (championByUser.size === 0) continue;
    return selectDayChampions([...championByUser.values()]).map((row) => row.userId);
  }

  return [];
}

function validDateKey(raw: string | undefined): string | null {
  if (!raw) return riyadhDateKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

async function loadMemberContext(
  viewerUserId: string,
  majlisId: string,
): Promise<GcMajlisResult<{ majlis: GcMajlisSummary; ownerId: string; members: MajlisMemberRow[] }>> {
  const [majlis] = await db.select().from(gcMajalis).where(eq(gcMajalis.id, majlisId)).limit(1);
  if (!majlis) return { ok: false, reason: "NOT_FOUND" };

  const members = await db
    .select({
      userId: gcMajlisMembers.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.profileImageUrl,
      joinedAt: gcMajlisMembers.joinedAt,
    })
    .from(gcMajlisMembers)
    .innerJoin(users, eq(gcMajlisMembers.userId, users.id))
    .where(eq(gcMajlisMembers.majlisId, majlisId))
    .orderBy(asc(gcMajlisMembers.joinedAt), asc(gcMajlisMembers.userId));
  if (!members.some((member) => member.userId === viewerUserId)) {
    return { ok: false, reason: "NOT_MEMBER" };
  }

  return {
    ok: true,
    data: {
      ownerId: majlis.ownerId,
      members,
      majlis: {
        id: majlis.id,
        name: majlis.name,
        code: majlis.code,
        isOwner: majlis.ownerId === viewerUserId,
        membersCount: members.length,
        createdAt: majlis.createdAt.toISOString(),
        joinedNow: false,
      },
    },
  };
}

export async function getMajlisInvitePreview(rawCode: string) {
  const code = (rawCode || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    return { ok: false, reason: "INVALID_CODE" } as const;
  }
  const [row] = await db
    .select({
      name: gcMajalis.name,
      code: gcMajalis.code,
      membersCount: sql<number>`count(${gcMajlisMembers.id})::int`,
    })
    .from(gcMajalis)
    .leftJoin(gcMajlisMembers, eq(gcMajlisMembers.majlisId, gcMajalis.id))
    .where(eq(gcMajalis.code, code))
    .groupBy(gcMajalis.id, gcMajalis.name, gcMajalis.code)
    .limit(1);
  if (!row) return { ok: false, reason: "NOT_FOUND" } as const;
  const membersCount = Number(row.membersCount ?? 0);
  return {
    ok: true,
    data: {
      code: row.code,
      name: row.name,
      membersCount,
      maxMembers: MAX_MEMBERS,
      full: membersCount >= MAX_MEMBERS,
      joinUrl: `https://sabq.org/gulf-cup/majlis?code=${encodeURIComponent(row.code)}`,
    },
  } as const;
}

export async function getMajlisMatchday(
  viewerUserId: string,
  majlisId: string,
  rawDate?: string,
): Promise<GcMajlisResult<any>> {
  const date = validDateKey(rawDate);
  if (!date) return { ok: false, reason: "INVALID_DATE" };
  const context = await loadMemberContext(viewerUserId, majlisId);
  if (!context.ok) return context;

  const fixtures = (await getGcFixtures()).filter((fixture) => fixtureDateKey(fixture) === date);
  const fixtureIds = fixtures.map((fixture) => String(fixture.id));
  const memberIds = context.data.members.map((member) => member.userId);
  const [predictionRows, snapshots] = fixtureIds.length > 0
    ? await Promise.all([
        db.select().from(gcPredictions).where(and(
          inArray(gcPredictions.fixtureId, fixtureIds),
          inArray(gcPredictions.userId, memberIds),
        )),
        db.select().from(gcPredictionMatches).where(inArray(gcPredictionMatches.fixtureId, fixtureIds)),
      ])
    : [[], []];

  const predictions = predictionRows;
  const predictionByMemberFixture = new Map(
    predictions.map((row) => [`${row.fixtureId}:${row.userId}`, row]),
  );
  const snapshotByFixture = new Map(snapshots.map((row) => [row.fixtureId, row]));
  const nameByUser = new Map(
    context.data.members.map((member) => [member.userId, {
      name: displayName(member.firstName, member.lastName),
      avatar: member.avatar,
    }]),
  );

  const championByUser = new Map<string, DayChampionCandidate>();
  let settledMatches = 0;
  const nowMs = Date.now();
  const matches = fixtures.map((fixture) => {
    const fixtureId = String(fixture.id);
    const matchPredictions = predictions.filter((row) => row.fixtureId === fixtureId);
    const snapshot = snapshotByFixture.get(fixtureId);
    const disposition = gcFixtureSettlementDisposition({
      statusCode: fixture.status.code,
      goalsHome: fixture.goals.home,
      goalsAway: fixture.goals.away,
    });
    const voidFixture = disposition === "void";
    const settled = voidFixture || isGcClosedMatchStatus(snapshot?.status) || (
      fixture.status.finished && matchPredictions.every((row) => row.status !== "pending")
    );
    if (settled) settledMatches++;
    const visibility = matchVisibility({
      nowMs,
      kickoffMs: fixture.timestamp * 1000,
      live: fixture.status.live,
      finished: fixture.status.finished || voidFixture,
      settled,
    });

    if (settled) {
      for (const prediction of matchPredictions) {
        if (!isGcCountedPredictionStatus(prediction.status)) continue;
        const identity = nameByUser.get(prediction.userId)!;
        const current = championByUser.get(prediction.userId) ?? {
          userId: prediction.userId,
          name: identity.name,
          avatar: identity.avatar,
          points: 0,
          exact: 0,
          correct: 0,
          played: 0,
        };
        current.points += Number(prediction.pointsAwarded || 0);
        current.exact += prediction.exactHit ? 1 : 0;
        current.correct += prediction.outcomeHit ? 1 : 0;
        current.played += 1;
        championByUser.set(prediction.userId, current);
      }
    }

    return {
      fixture,
      revealAt: new Date(fixture.timestamp * 1000).toISOString(),
      visibility,
      result: visibility === "sealed"
        ? null
        : { home: fixture.goals.home, away: fixture.goals.away, status: fixture.status.code },
      members: context.data.members.map((member) => {
        const prediction = predictionByMemberFixture.get(`${fixtureId}:${member.userId}`) ?? null;
        return {
          userId: member.userId,
          name: displayName(member.firstName, member.lastName),
          avatar: member.avatar,
          isOwner: member.userId === context.data.ownerId,
          isViewer: member.userId === viewerUserId,
          hasPredicted: Boolean(prediction),
          prediction: visibleMemberPrediction({
            visibility,
            prediction,
            currentHome: fixture.goals.home,
            currentAway: fixture.goals.away,
          }),
        };
      }),
    };
  });

  return {
    ok: true,
    data: {
      date,
      timezone: "Asia/Riyadh",
      majlis: context.data.majlis,
      matches,
      dayChampion: {
        status: dayChampionStatus(
          fixtures.length,
          settledMatches,
          fixtures.some((fixture) => fixture.status.live),
        ),
        settledMatches,
        totalMatches: fixtures.length,
        winners: settledMatches === fixtures.length
          ? selectDayChampions([...championByUser.values()])
          : [],
      },
    },
  };
}

export async function getMajlisFantasy(
  viewerUserId: string,
  majlisId: string,
): Promise<GcMajlisResult<any>> {
  const context = await loadMemberContext(viewerUserId, majlisId);
  if (!context.ok) return context;
  const memberIds = context.data.members.map((member) => member.userId);
  const squads = memberIds.length > 0
    ? await db.select().from(gcFantasySquads).where(inArray(gcFantasySquads.userId, memberIds))
    : [];
  const squadByUser = new Map(squads.map((row) => [row.userId, row]));
  const points = squads.length > 0 ? await getGcFantasyPoints() : new Map<string, number>();

  const scored = context.data.members.map((member) => {
    const squad = squadByUser.get(member.userId);
    const playerIds = (squad?.playerIds ?? []) as string[];
    const totalPoints = squad
      ? playerIds.reduce(
          (sum, playerId) => sum + (points.get(playerId) ?? 0) * (playerId === squad.captainId ? 2 : 1),
          0,
        )
      : 0;
    return {
      userId: member.userId,
      name: displayName(member.firstName, member.lastName),
      avatar: member.avatar,
      isOwner: member.userId === context.data.ownerId,
      isViewer: member.userId === viewerUserId,
      hasSquad: Boolean(squad),
      totalPoints,
    };
  });
  scored.sort((a, b) =>
    Number(b.hasSquad) - Number(a.hasSquad) || b.totalPoints - a.totalPoints || a.userId.localeCompare(b.userId),
  );
  return {
    ok: true,
    data: { majlis: context.data.majlis, rows: scored.map((row, index) => ({ rank: index + 1, ...row })) },
  };
}

export async function getMajlisChampionPicks(
  viewerUserId: string,
  majlisId: string,
): Promise<GcMajlisResult<any>> {
  const context = await loadMemberContext(viewerUserId, majlisId);
  if (!context.ok) return context;
  const lockedAt = gcImmutableTournamentLockAt(GC_FIXTURES);
  const locked = isGcTournamentLocked(GC_FIXTURES);
  const memberIds = context.data.members.map((member) => member.userId);
  const picks = memberIds.length > 0
    ? await db
        .select()
        .from(gcLongPredictions)
        .where(and(eq(gcLongPredictions.kind, "champion"), inArray(gcLongPredictions.userId, memberIds)))
    : [];
  const pickByUser = new Map(picks.map((pick) => [pick.userId, pick]));
  return {
    ok: true,
    data: {
      majlis: context.data.majlis,
      visibility: locked ? "revealed" : "sealed",
      lockedAt: lockedAt == null ? null : new Date(lockedAt).toISOString(),
      members: context.data.members.map((member) => {
        const pick = pickByUser.get(member.userId);
        const validPick = pick?.teamId != null && typeof pick.teamName === "string" && pick.teamName.length > 0;
        return {
          userId: member.userId,
          name: displayName(member.firstName, member.lastName),
          avatar: member.avatar,
          isOwner: member.userId === context.data.ownerId,
          isViewer: member.userId === viewerUserId,
          hasPicked: Boolean(pick && validPick),
          pick: locked && pick && validPick
            ? {
                teamId: pick.teamId,
                teamName: pick.teamName,
                status: pick.status,
                points: Number(pick.pointsAwarded || 0),
              }
            : null,
        };
      }),
    },
  };
}

function finalWinnerId(fixture: GcFixture): number | null {
  const home = fixture.goals.home;
  const away = fixture.goals.away;
  if (home == null || away == null) return null;
  if (home > away) return fixture.home.id;
  if (away > home) return fixture.away.id;
  const penalties = fixture.penalties;
  if (penalties?.home == null || penalties.away == null) return null;
  return penalties.home > penalties.away ? fixture.home.id : penalties.away > penalties.home ? fixture.away.id : null;
}

const emptyHarvestAwards = () => ({ champions: [], mostAccurate: [], boldest: [], stubborn: [] });

type HarvestBuildOptions = {
  awardBadges?: boolean;
  fixtures?: GcFixture[];
};

async function buildMajlisHarvest(
  viewerUserId: string,
  majlisId: string,
  options: HarvestBuildOptions = {},
): Promise<GcMajlisResult<any>> {
  const context = await loadMemberContext(viewerUserId, majlisId);
  if (!context.ok) return context;
  const fixtures = options.fixtures ?? await getGcFixtures();
  const final = fixtures.find((fixture) => fixture.roundEn === "Final");
  const generatedAt = new Date().toISOString();
  const pending = !final || !final.status.finished || finalWinnerId(final) == null;
  if (pending) {
    return {
      ok: true,
      data: {
        status: "pending",
        majlis: context.data.majlis,
        finalAt: final?.date ?? null,
        generatedAt,
        awards: emptyHarvestAwards(),
      },
    };
  }

  const memberIds = context.data.members.map((member) => member.userId);
  const predictionRows = memberIds.length > 0
    ? await db
        .select({
          userId: gcPredictions.userId,
          fixtureId: gcPredictions.fixtureId,
          predHome: gcPredictions.predHome,
          predAway: gcPredictions.predAway,
          status: gcPredictions.status,
          outcomeHit: gcPredictions.outcomeHit,
          exactHit: gcPredictions.exactHit,
          pointsAwarded: gcPredictions.pointsAwarded,
          pickProb: gcPredictions.pickProb,
          homeTeamId: gcPredictionMatches.homeTeamId,
          awayTeamId: gcPredictionMatches.awayTeamId,
          homeTeamName: gcPredictionMatches.homeTeamName,
          awayTeamName: gcPredictionMatches.awayTeamName,
        })
        .from(gcPredictions)
        .leftJoin(gcPredictionMatches, eq(gcPredictions.fixtureId, gcPredictionMatches.fixtureId))
        .where(inArray(gcPredictions.userId, memberIds))
    : [];
  // Do not publish a partial harvest in the minute between final whistle and settlement.
  if (predictionRows.some((row) => row.status === "pending")) {
    return {
      ok: true,
      data: {
        status: "pending",
        majlis: context.data.majlis,
        finalAt: final.date,
        generatedAt,
        awards: emptyHarvestAwards(),
      },
    };
  }

  const identity = new Map(context.data.members.map((member) => [member.userId, {
    userId: member.userId,
    name: displayName(member.firstName, member.lastName),
    avatar: member.avatar,
  }]));
  const championAgg = new Map<string, HarvestChampionCandidate>();
  const boldByUser = new Map<string, HarvestBoldCandidate>();
  const stubbornCounts = new Map<string, { teamId: number; teamName: string; count: number }>();

  for (const row of predictionRows) {
    if (!isGcCountedPredictionStatus(row.status)) continue;
    const person = identity.get(row.userId)!;
    const aggregate = championAgg.get(row.userId) ?? {
      ...person,
      totalPoints: 0,
      exactCount: 0,
      correctCount: 0,
      playedCount: 0,
    };
    aggregate.totalPoints += Number(row.pointsAwarded || 0);
    aggregate.exactCount += row.exactHit ? 1 : 0;
    aggregate.correctCount += row.outcomeHit ? 1 : 0;
    aggregate.playedCount += 1;
    championAgg.set(row.userId, aggregate);

    if (row.outcomeHit && row.pickProb > 0) {
      const current = boldByUser.get(row.userId);
      if (!current || row.pickProb < current.pickProb) {
        boldByUser.set(row.userId, { ...person, pickProb: row.pickProb, fixtureId: Number(row.fixtureId) });
      }
    }

    let teamId: number | null = null;
    let teamName = "";
    if (row.predHome > row.predAway && row.homeTeamId != null) {
      teamId = row.homeTeamId;
      teamName = row.homeTeamName ?? "";
    } else if (row.predAway > row.predHome && row.awayTeamId != null) {
      teamId = row.awayTeamId;
      teamName = row.awayTeamName ?? "";
    }
    if (teamId != null && teamId > 0) {
      const key = `${row.userId}:${teamId}`;
      const current = stubbornCounts.get(key);
      stubbornCounts.set(key, { teamId, teamName, count: (current?.count ?? 0) + 1 });
    }
  }

  const championCandidates = [...championAgg.values()];
  const accurate: HarvestAccuracyCandidate[] = championCandidates
    .filter((row) => row.playedCount >= MIN_ACCURACY_PICKS)
    .map((row) => ({
      userId: row.userId,
      name: row.name,
      avatar: row.avatar,
      accuracy: Math.round((row.correctCount / row.playedCount) * 100),
      correctCount: row.correctCount,
      playedCount: row.playedCount,
    }));

  const stubbornByUser = new Map<string, HarvestStubbornCandidate>();
  for (const [key, value] of stubbornCounts) {
    const userId = key.slice(0, key.lastIndexOf(":"));
    if (value.count < MIN_STUBBORN_PICKS) continue;
    const person = identity.get(userId)!;
    const current = stubbornByUser.get(userId);
    if (!current || value.count > current.picksCount) {
      stubbornByUser.set(userId, { ...person, teamId: value.teamId, teamName: value.teamName, picksCount: value.count });
    }
  }

  const awards = selectHarvestAwards({
    champions: championCandidates,
    accurate,
    bold: [...boldByUser.values()] as HarvestBoldCandidate[],
    stubborn: [...stubbornByUser.values()] as HarvestStubbornCandidate[],
  });

  if (options.awardBadges) {
    // منح الأوسمة مهمة job حتمية، لا side-effect لطلب GET. تُكتب أوسمة كل
    // المتعادلين وعلامة اكتمال المجلس في معاملة واحدة كي لا يضيع أحدهم عند crash.
    await db.transaction(async (tx) => {
      for (const champion of awards.champions) {
        await tx.insert(gcBadges).values({
          userId: champion.userId,
          badge: `majlis_champion:${majlisId}`,
          metadata: {
            majlisId,
            majlisName: context.data.majlis.name,
            totalPoints: champion.totalPoints,
          },
        }).onConflictDoNothing();
      }
      await tx.insert(gcBadges).values({
        userId: context.data.ownerId,
        badge: `majlis_harvest_processed:${majlisId}`,
        metadata: {
          majlisId,
          majlisName: context.data.majlis.name,
          champions: awards.champions.map((champion) => champion.userId),
        },
      }).onConflictDoNothing();
    });
  }

  return {
    ok: true,
    data: {
      status: "ready",
      majlis: context.data.majlis,
      finalAt: final.date,
      generatedAt,
      awards: {
        ...awards,
        champions: awards.champions.map(({ playedCount: _playedCount, ...row }) => ({
          ...row,
          badgeCode: "majlis_champion" as const,
        })),
      },
    },
  };
}

/** Endpoint read model: intentionally side-effect free. */
export async function getMajlisHarvest(
  viewerUserId: string,
  majlisId: string,
): Promise<GcMajlisResult<any>> {
  return buildMajlisHarvest(viewerUserId, majlisId);
}

/**
 * Final-job hook that guarantees permanent council champion badges even when
 * nobody opens the harvest screen. The internal marker makes repeated cron
 * cycles and multiple pods idempotent at council granularity.
 */
export async function awardGcMajlisChampionBadgesIfReady(): Promise<number> {
  const fixtures = await getGcFixtures();
  const final = fixtures.find((fixture) => fixture.roundEn === "Final");
  if (!final || !final.status.finished || finalWinnerId(final) == null) return 0;

  const councils = await db
    .select({ id: gcMajalis.id, ownerId: gcMajalis.ownerId })
    .from(gcMajalis);
  if (councils.length === 0) return 0;

  const markerPrefix = "majlis_harvest_processed:";
  const markers = await db
    .select({ badge: gcBadges.badge })
    .from(gcBadges)
    .where(like(gcBadges.badge, `${markerPrefix}%`));
  const processed = new Set(markers.map((row) => row.badge.slice(markerPrefix.length)));

  let completed = 0;
  for (const council of councils) {
    if (processed.has(council.id)) continue;
    const harvest = await buildMajlisHarvest(council.ownerId, council.id, {
      awardBadges: true,
      fixtures,
    });
    if (harvest.ok && harvest.data.status === "ready") completed++;
  }
  return completed;
}

export async function getMajlisNotificationPreference(userId: string): Promise<{ enabled: boolean }> {
  const [row] = await db
    .select({ enabled: userNotificationPrefs.gulfCupMajlis })
    .from(userNotificationPrefs)
    .where(eq(userNotificationPrefs.userId, userId))
    .limit(1);
  return { enabled: row?.enabled ?? true };
}

export async function setMajlisNotificationPreference(
  userId: string,
  enabled: boolean,
): Promise<{ enabled: boolean }> {
  await db
    .insert(userNotificationPrefs)
    .values({ userId, gulfCupMajlis: enabled })
    .onConflictDoUpdate({
      target: userNotificationPrefs.userId,
      set: { gulfCupMajlis: enabled, updatedAt: new Date() },
    });
  return { enabled };
}
