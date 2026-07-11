/** Match duels inside Gulf Cup majalis, including loyalty-point escrow. */
import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  gcDuels,
  gcMajalis,
  gcMajlisMembers,
  gcPredictionMatches,
  gcPredictions,
  userLoyaltyEvents,
  userPointsTotal,
  users,
  type GcDuel,
} from "@shared/schema";
import { getGcFixtures, type GcFixture } from "./gulfCupService";
import {
  duelFixtureDisposition,
  duelRefundRecipientIds,
  evaluateDuelAcceptance,
  resolveDuel,
} from "./gcMajlisLogic";
import type { GcTier } from "./gulfCupPredictionScoring";
import type { GcMajlisResult, GcMajlisSummary } from "./gcMajlisService";

export const GC_DUEL_MIN_STAKE = 10;
export const GC_DUEL_MAX_STAKE = 100;
export const GC_DUEL_DAILY_CAP = 200;

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

type MemberIdentity = { userId: string; name: string; avatar: string | null };

export type GcDuelView = {
  id: string;
  majlisId: string;
  fixtureId: number;
  stake: number;
  status: string;
  challenger: MemberIdentity;
  challenged: MemberIdentity;
  winnerId: string | null;
  createdAt: string;
  acceptedAt: string | null;
  expiresAt: string;
  settledAt: string | null;
};

function displayName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "عضو سبق";
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

function isValidStake(stake: number): boolean {
  return Number.isInteger(stake) && stake >= GC_DUEL_MIN_STAKE && stake <= GC_DUEL_MAX_STAKE && stake % 10 === 0;
}

function riyadhDayBounds(at: Date): { start: Date; end: Date } {
  const local = new Date(at.getTime() + RIYADH_OFFSET_MS);
  const key = local.toISOString().slice(0, 10);
  const start = new Date(`${key}T00:00:00.000Z`);
  start.setTime(start.getTime() - RIYADH_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function riyadhDateKey(at: Date): string {
  return new Date(at.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

async function usedStakeToday(tx: any, userId: string, at: Date): Promise<number> {
  const { start, end } = riyadhDayBounds(at);
  const [row] = await tx
    .select({
      total: sql<number>`coalesce(sum(
        case when ${gcDuels.challengerId} = ${userId}
          and ${gcDuels.challengerHeldAt} >= ${start}
          and ${gcDuels.challengerHeldAt} < ${end}
          then ${gcDuels.stake} else 0 end
        + case when ${gcDuels.challengedId} = ${userId}
          and ${gcDuels.challengedHeldAt} >= ${start}
          and ${gcDuels.challengedHeldAt} < ${end}
          then ${gcDuels.stake} else 0 end
      ), 0)::int`,
    })
    .from(gcDuels)
    .where(or(eq(gcDuels.challengerId, userId), eq(gcDuels.challengedId, userId)));
  return Number(row?.total ?? 0);
}

async function debitStake(tx: any, userId: string, stake: number, duelId: string): Promise<boolean> {
  const updated = await tx
    .update(userPointsTotal)
    .set({
      totalPoints: sql`${userPointsTotal.totalPoints} - ${stake}`,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(userPointsTotal.userId, userId), gte(userPointsTotal.totalPoints, stake)))
    .returning({ userId: userPointsTotal.userId });
  if (updated.length === 0) return false;
  await tx.insert(userLoyaltyEvents).values({
    userId,
    action: "GC_DUEL_STAKE",
    points: -stake,
    source: duelId,
    metadata: { duelId },
  });
  return true;
}

async function creditAvailablePoints(
  tx: any,
  userId: string,
  points: number,
  duelId: string,
  action: "GC_DUEL_REFUND" | "GC_DUEL_WIN",
): Promise<void> {
  await tx
    .insert(userPointsTotal)
    .values({
      userId,
      totalPoints: points,
      lifetimePoints: 0,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userPointsTotal.userId,
      set: {
        totalPoints: sql`${userPointsTotal.totalPoints} + ${points}`,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      },
    });
  await tx.insert(userLoyaltyEvents).values({
    userId,
    action,
    points,
    source: duelId,
    metadata: { duelId },
  });
}

async function loadMajlisAndMembers(viewerUserId: string, majlisId: string) {
  const [majlis] = await db.select().from(gcMajalis).where(eq(gcMajalis.id, majlisId)).limit(1);
  if (!majlis) return { ok: false, reason: "NOT_FOUND" } as const;
  const rows = await db
    .select({
      userId: gcMajlisMembers.userId,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.profileImageUrl,
    })
    .from(gcMajlisMembers)
    .innerJoin(users, eq(gcMajlisMembers.userId, users.id))
    .where(eq(gcMajlisMembers.majlisId, majlisId))
    .orderBy(asc(gcMajlisMembers.joinedAt), asc(gcMajlisMembers.userId));
  if (!rows.some((row) => row.userId === viewerUserId)) {
    return { ok: false, reason: "NOT_MEMBER" } as const;
  }
  const identities = rows.map((row): MemberIdentity => ({
    userId: row.userId,
    name: displayName(row.firstName, row.lastName),
    avatar: row.avatar,
  }));
  const summary: GcMajlisSummary = {
    id: majlis.id,
    name: majlis.name,
    code: majlis.code,
    isOwner: majlis.ownerId === viewerUserId,
    membersCount: rows.length,
    createdAt: majlis.createdAt.toISOString(),
    joinedNow: false,
  };
  return { ok: true, data: { majlis: summary, identities } } as const;
}

function toView(row: GcDuel, identity: Map<string, MemberIdentity>): GcDuelView {
  const fallback = (userId: string): MemberIdentity => ({ userId, name: "عضو سبق", avatar: null });
  return {
    id: row.id,
    majlisId: row.majlisId,
    fixtureId: Number(row.fixtureId),
    stake: row.stake,
    status: row.status,
    challenger: identity.get(row.challengerId) ?? fallback(row.challengerId),
    challenged: identity.get(row.challengedId) ?? fallback(row.challengedId),
    winnerId: row.winnerId,
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
  };
}

export async function listMajlisDuels(
  viewerUserId: string,
  majlisId: string,
): Promise<GcMajlisResult<{ majlis: GcMajlisSummary; duels: GcDuelView[]; eligibleMembers: MemberIdentity[] }>> {
  const context = await loadMajlisAndMembers(viewerUserId, majlisId);
  if (!context.ok) return context;
  const rows = await db
    .select()
    .from(gcDuels)
    .where(eq(gcDuels.majlisId, majlisId))
    .orderBy(sql`${gcDuels.createdAt} desc`)
    .limit(100);
  const identity = new Map(context.data.identities.map((person) => [person.userId, person]));
  return {
    ok: true,
    data: {
      majlis: context.data.majlis,
      duels: rows.map((row) => toView(row, identity)),
      eligibleMembers: context.data.identities.filter((person) => person.userId !== viewerUserId),
    },
  };
}

async function loadDuelViewForActor(actorUserId: string, duelId: string): Promise<GcMajlisResult<GcDuelView>> {
  const [duel] = await db.select().from(gcDuels).where(eq(gcDuels.id, duelId)).limit(1);
  if (!duel) return { ok: false, reason: "NOT_FOUND" };
  const context = await loadMajlisAndMembers(actorUserId, duel.majlisId);
  if (!context.ok) return context;
  const identity = new Map(context.data.identities.map((person) => [person.userId, person]));
  return { ok: true, data: toView(duel, identity) };
}

function isPairConflict(error: any): boolean {
  const cause = error?.cause ?? error;
  return cause?.code === "23505" && (
    cause?.constraint === "idx_gc_duel_pair_fixture" ||
    String(cause?.message ?? error?.message ?? "").includes("idx_gc_duel_pair_fixture")
  );
}

async function ensureFixtureSnapshot(tx: any, fixture: GcFixture): Promise<void> {
  await tx
    .insert(gcPredictionMatches)
    .values({
      fixtureId: String(fixture.id),
      kickoffAt: new Date(fixture.timestamp * 1000),
      homeTeamId: fixture.home.id,
      awayTeamId: fixture.away.id,
      homeTeamName: fixture.home.name,
      homeTeamLogo: fixture.home.logo,
      awayTeamName: fixture.away.name,
      awayTeamLogo: fixture.away.logo,
      status: "open",
    })
    .onConflictDoNothing({ target: gcPredictionMatches.fixtureId });
}

export async function createMajlisDuel(input: {
  challengerId: string;
  majlisId: string;
  fixtureId: number;
  challengedUserId: string;
  stake: number;
}): Promise<GcMajlisResult<GcDuelView>> {
  if (!isValidStake(input.stake)) return { ok: false, reason: "INVALID_STAKE" };
  if (input.challengerId === input.challengedUserId) return { ok: false, reason: "SELF_CHALLENGE" };
  const fixture = (await getGcFixtures()).find((row) => row.id === input.fixtureId);
  if (!fixture || fixture.home.id <= 0 || fixture.away.id <= 0) return { ok: false, reason: "FIXTURE_NOT_FOUND" };
  const now = new Date();
  if (now.getTime() >= fixture.timestamp * 1000 || fixture.status.live || fixture.status.finished) {
    return { ok: false, reason: "LOCKED" };
  }

  let duelId: string;
  try {
    duelId = await db.transaction(async (tx) => {
      // Share the council lock with join/leave so a membership cannot disappear
      // between validation and escrow creation.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gc-majlis:${input.majlisId}`}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gc-duel:${input.majlisId}:${pairKey(input.challengerId, input.challengedUserId)}:${input.fixtureId}`}))`);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gc-duel-cap:${input.challengerId}:${riyadhDateKey(now)}`}))`);
      const [majlis] = await tx
        .select({ id: gcMajalis.id })
        .from(gcMajalis)
        .where(eq(gcMajalis.id, input.majlisId))
        .limit(1);
      if (!majlis) throw new Error("GC_DUEL_NOT_FOUND");
      const memberships = await tx
        .select({ userId: gcMajlisMembers.userId })
        .from(gcMajlisMembers)
        .where(and(
          eq(gcMajlisMembers.majlisId, input.majlisId),
          inArray(gcMajlisMembers.userId, [input.challengerId, input.challengedUserId]),
        ));
      const memberIds = new Set(memberships.map((row) => row.userId));
      if (!memberIds.has(input.challengerId)) throw new Error("GC_DUEL_NOT_MEMBER");
      if (!memberIds.has(input.challengedUserId)) throw new Error("GC_DUEL_TARGET_NOT_MEMBER");
      if ((await usedStakeToday(tx, input.challengerId, now)) + input.stake > GC_DUEL_DAILY_CAP) {
        throw new Error("GC_DUEL_DAILY_CAP");
      }

      const [duel] = await tx
        .insert(gcDuels)
        .values({
          majlisId: input.majlisId,
          fixtureId: String(input.fixtureId),
          challengerId: input.challengerId,
          challengedId: input.challengedUserId,
          pairKey: pairKey(input.challengerId, input.challengedUserId),
          stake: input.stake,
          status: "pending",
          challengerHeldAt: now,
          expiresAt: new Date(fixture.timestamp * 1000),
        })
        .returning({ id: gcDuels.id });
      if (!(await debitStake(tx, input.challengerId, input.stake, duel.id))) {
        throw new Error("GC_DUEL_INSUFFICIENT_POINTS");
      }
      await ensureFixtureSnapshot(tx, fixture);
      return duel.id;
    });
  } catch (error: any) {
    if (isPairConflict(error)) return { ok: false, reason: "DUPLICATE" };
    const reason = String(error?.message ?? "").replace(/^GC_DUEL_/, "");
    if (["NOT_FOUND", "NOT_MEMBER", "TARGET_NOT_MEMBER", "DAILY_CAP", "INSUFFICIENT_POINTS"].includes(reason)) {
      return { ok: false, reason };
    }
    throw error;
  }
  return loadDuelViewForActor(input.challengerId, duelId);
}

async function refundPendingChallenger(tx: any, duel: GcDuel, status: "declined" | "cancelled" | "expired"): Promise<void> {
  await creditAvailablePoints(tx, duel.challengerId, duel.stake, duel.id, "GC_DUEL_REFUND");
  await tx
    .update(gcDuels)
    .set({ status, settledAt: new Date(), updatedAt: new Date() })
    .where(and(eq(gcDuels.id, duel.id), eq(gcDuels.status, "pending")));
}

async function refundUnsettleableDuel(tx: any, duel: GcDuel): Promise<void> {
  // Lock loyalty balances in a stable order across concurrent duel refunds.
  for (const userId of duelRefundRecipientIds(duel).sort((a, b) => a.localeCompare(b))) {
    await creditAvailablePoints(tx, userId, duel.stake, duel.id, "GC_DUEL_REFUND");
  }
  const now = new Date();
  await tx
    .update(gcDuels)
    .set({ status: "refunded", settledAt: now, updatedAt: now })
    .where(and(eq(gcDuels.id, duel.id), inArray(gcDuels.status, ["pending", "accepted"])));
}

export async function actOnMajlisDuel(
  actorUserId: string,
  duelId: string,
  action: "accept" | "decline" | "cancel",
): Promise<GcMajlisResult<GcDuelView>> {
  // Provider refresh happens before opening the write transaction: no network
  // wait while the duel row is locked, but the debit below uses this freshly
  // fetched kickoff/status rather than the invitation's historical expiresAt.
  let currentAcceptFixture: GcFixture | undefined;
  if (action === "accept") {
    const [snapshot] = await db
      .select({
        fixtureId: gcDuels.fixtureId,
        challengedId: gcDuels.challengedId,
        status: gcDuels.status,
      })
      .from(gcDuels)
      .where(eq(gcDuels.id, duelId))
      .limit(1);
    if (!snapshot) return { ok: false, reason: "NOT_FOUND" };
    if (snapshot.challengedId !== actorUserId) return { ok: false, reason: "NOT_ALLOWED" };
    if (snapshot.status !== "pending") return { ok: false, reason: "INVALID_STATE" };
    currentAcceptFixture = (await getGcFixtures(true))
      .find((fixture) => String(fixture.id) === snapshot.fixtureId);
  }

  let resultReason: string | null = null;
  await db.transaction(async (tx) => {
    const [duel] = await tx.select().from(gcDuels).where(eq(gcDuels.id, duelId)).for("update").limit(1);
    if (!duel) {
      resultReason = "NOT_FOUND";
      return;
    }
    if (action === "cancel" && actorUserId !== duel.challengerId) {
      resultReason = "NOT_ALLOWED";
      return;
    }
    if ((action === "accept" || action === "decline") && actorUserId !== duel.challengedId) {
      resultReason = "NOT_ALLOWED";
      return;
    }
    if (duel.status !== "pending") {
      resultReason = "INVALID_STATE";
      return;
    }
    const now = new Date();
    if (action !== "accept" && now >= duel.expiresAt) {
      await refundPendingChallenger(tx, duel, "expired");
      resultReason = "EXPIRED";
      return;
    }
    if (action === "decline" || action === "cancel") {
      await refundPendingChallenger(tx, duel, action === "decline" ? "declined" : "cancelled");
      return;
    }

    if (!currentAcceptFixture) {
      await refundUnsettleableDuel(tx, duel);
      resultReason = "FIXTURE_NOT_FOUND";
      return;
    }
    const currentKickoffMs = currentAcceptFixture.timestamp * 1000;
    const acceptance = evaluateDuelAcceptance({
      nowMs: now.getTime(),
      storedExpiresAtMs: duel.expiresAt.getTime(),
      currentKickoffMs,
      live: currentAcceptFixture.status.live,
      finished: currentAcceptFixture.status.finished,
      disposition: duelFixtureDisposition(currentAcceptFixture),
    });
    if (!acceptance.allowed) {
      if (acceptance.reason === "EXPIRED") {
        await refundPendingChallenger(tx, duel, "expired");
      } else {
        await refundUnsettleableDuel(tx, duel);
      }
      resultReason = acceptance.reason;
      return;
    }

    const memberships = await tx
      .select({ userId: gcMajlisMembers.userId })
      .from(gcMajlisMembers)
      .where(and(
        eq(gcMajlisMembers.majlisId, duel.majlisId),
        inArray(gcMajlisMembers.userId, [duel.challengerId, duel.challengedId]),
      ));
    if (memberships.length !== 2) {
      resultReason = "NOT_MEMBER";
      return;
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gc-duel-cap:${actorUserId}:${riyadhDateKey(now)}`}))`);
    if ((await usedStakeToday(tx, actorUserId, now)) + duel.stake > GC_DUEL_DAILY_CAP) {
      resultReason = "DAILY_CAP";
      return;
    }
    if (!(await debitStake(tx, actorUserId, duel.stake, duel.id))) {
      resultReason = "INSUFFICIENT_POINTS";
      return;
    }
    await tx
      .update(gcDuels)
      .set({
        status: "accepted",
        challengedHeldAt: now,
        acceptedAt: now,
        expiresAt: new Date(acceptance.expiresAtMs),
        updatedAt: now,
      })
      .where(and(eq(gcDuels.id, duel.id), eq(gcDuels.status, "pending")));
  });

  if (resultReason) return { ok: false, reason: resultReason };
  return loadDuelViewForActor(actorUserId, duelId);
}

export type GcDuelSettlementSummary = { settled: number; refunded: number; expired: number; errors: number };

export async function settleMajlisDuels(fixtureIds: string[]): Promise<GcDuelSettlementSummary> {
  const uniqueIds = [...new Set(fixtureIds.map(String))];
  const summary: GcDuelSettlementSummary = { settled: 0, refunded: 0, expired: 0, errors: 0 };

  // Keep the direct provider-state scan even though prediction settlement now
  // emits void fixture ids: it releases escrow safely if no prediction snapshot
  // exists or a previous prediction-settlement attempt failed.
  const fixtureById = new Map<string, GcFixture>();
  try {
    for (const fixture of await getGcFixtures()) fixtureById.set(String(fixture.id), fixture);
    const refundFixtureIds = [...fixtureById]
      .filter(([, fixture]) => duelFixtureDisposition(fixture) === "refund")
      .map(([fixtureId]) => fixtureId);
    if (refundFixtureIds.length > 0) {
      const voidCandidates = await db
        .select({ id: gcDuels.id })
        .from(gcDuels)
        .where(and(
          inArray(gcDuels.fixtureId, refundFixtureIds),
          inArray(gcDuels.status, ["pending", "accepted"]),
        ));
      for (const candidate of voidCandidates) {
        try {
          const refunded = await db.transaction(async (tx) => {
            const [duel] = await tx.select().from(gcDuels).where(eq(gcDuels.id, candidate.id)).for("update").limit(1);
            if (!duel || (duel.status !== "pending" && duel.status !== "accepted")) return false;
            await refundUnsettleableDuel(tx, duel);
            return true;
          });
          if (refunded) summary.refunded++;
        } catch (error) {
          summary.errors++;
          console.error(`[GC Duels] void-result refund failed duel=${candidate.id}:`, error);
        }
      }
    }
  } catch (error) {
    // Expiry and normal result settlement can still make progress if provider
    // refresh failed during this tick.
    summary.errors++;
    console.error("[GC Duels] fixture-state scan failed:", error);
  }

  // Pending invitations expire at kickoff, not at the final whistle. This sweep
  // runs every cron tick even when no fixture settled in that tick.
  const expiredCandidates = await db
    .select({ id: gcDuels.id })
    .from(gcDuels)
    .where(and(eq(gcDuels.status, "pending"), lte(gcDuels.expiresAt, new Date())));
  for (const candidate of expiredCandidates) {
    try {
      const expired = await db.transaction(async (tx) => {
        const [duel] = await tx.select().from(gcDuels).where(eq(gcDuels.id, candidate.id)).for("update").limit(1);
        if (!duel || duel.status !== "pending" || duel.expiresAt > new Date()) return false;
        await refundPendingChallenger(tx, duel, "expired");
        return true;
      });
      if (expired) summary.expired++;
    } catch (error) {
      summary.errors++;
      console.error(`[GC Duels] expiry failed duel=${candidate.id}:`, error);
    }
  }

  const settleableIds = uniqueIds.filter((fixtureId) => {
    const fixture = fixtureById.get(fixtureId);
    return !fixture || duelFixtureDisposition(fixture) === "settle";
  });
  if (settleableIds.length === 0) return summary;
  const candidates = await db
    .select({ id: gcDuels.id })
    .from(gcDuels)
    .where(and(inArray(gcDuels.fixtureId, settleableIds), eq(gcDuels.status, "accepted")));

  for (const candidate of candidates) {
    try {
      const outcome = await db.transaction(async (tx) => {
        const [duel] = await tx.select().from(gcDuels).where(eq(gcDuels.id, candidate.id)).for("update").limit(1);
        if (!duel || duel.status !== "accepted") return "skip" as const;

        const picks = await tx
          .select({ userId: gcPredictions.userId, status: gcPredictions.status, tier: gcPredictions.tier })
          .from(gcPredictions)
          .where(and(
            eq(gcPredictions.fixtureId, duel.fixtureId),
            inArray(gcPredictions.userId, [duel.challengerId, duel.challengedId]),
          ));
        if (picks.some((pick) => pick.status === "pending")) return "skip" as const;
        const byUser = new Map(picks.map((pick) => [pick.userId, pick.tier as GcTier]));
        const challengerTier = byUser.get(duel.challengerId) ?? null;
        const challengedTier = byUser.get(duel.challengedId) ?? null;
        const resolution = resolveDuel(challengerTier, challengedTier);
        const now = new Date();

        if (resolution === "refund") {
          for (const userId of [duel.challengerId, duel.challengedId].sort((a, b) => a.localeCompare(b))) {
            await creditAvailablePoints(tx, userId, duel.stake, duel.id, "GC_DUEL_REFUND");
          }
          await tx.update(gcDuels).set({
            status: "refunded",
            challengerTier,
            challengedTier,
            settledAt: now,
            updatedAt: now,
          }).where(eq(gcDuels.id, duel.id));
          return "refunded" as const;
        }

        const winnerId = resolution === "challenger" ? duel.challengerId : duel.challengedId;
        await creditAvailablePoints(tx, winnerId, duel.stake * 2, duel.id, "GC_DUEL_WIN");
        await tx.update(gcDuels).set({
          status: "settled",
          winnerId,
          challengerTier,
          challengedTier,
          settledAt: now,
          updatedAt: now,
        }).where(eq(gcDuels.id, duel.id));
        return "settled" as const;
      });
      if (outcome === "settled") summary.settled++;
      else if (outcome === "refunded") summary.refunded++;
    } catch (error) {
      summary.errors++;
      console.error(`[GC Duels] settlement failed duel=${candidate.id}:`, error);
    }
  }
  return summary;
}
