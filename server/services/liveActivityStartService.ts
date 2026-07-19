/** Remote ActivityKit push-to-start orchestration for followed matches. */
import { and, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "../db";
import {
  liveActivityStartDeliveries,
  liveActivityStartTokens,
  sportsFollows,
} from "@shared/schema";
import { getGlobalTodayFixtures, type SplLiveBoardItem } from "./saudiLeagueService";
import { isApnsConfigured, sendLiveActivityStart } from "./apnsService";

const SPORTS_BUNDLE_ID = process.env.APNS_SPORTS_BUNDLE_ID || "com.sabq.sports";
const ATTRIBUTES_TYPE = "SpMatchActivityAttributes";
const START_LEAD_SECONDS = 10 * 60;
const RECOVERY_TAIL_SECONDS = 5 * 60;
const RETRY_AFTER_MS = 5 * 60 * 1000;
const APPLE_REFERENCE_EPOCH_SECONDS = 978_307_200;
const INVALID_TOKEN_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

const riyadhDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function registerLiveActivityStartToken(input: {
  userId: string;
  pushToken: string;
  bundleId: string;
  deviceId?: string | null;
}): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    // ActivityKit rotates tokens. A stable installation id lets us retire the
    // old value immediately instead of repeatedly sending to a stale token.
    if (input.deviceId) {
      await tx
        .update(liveActivityStartTokens)
        .set({ isActive: false, updatedAt: now })
        .where(and(
          eq(liveActivityStartTokens.userId, input.userId),
          eq(liveActivityStartTokens.deviceId, input.deviceId),
        ));
    }

    await tx
      .insert(liveActivityStartTokens)
      .values({
        userId: input.userId,
        pushToken: input.pushToken,
        bundleId: input.bundleId,
        deviceId: input.deviceId ?? null,
        isActive: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: liveActivityStartTokens.pushToken,
        set: {
          userId: input.userId,
          bundleId: input.bundleId,
          deviceId: input.deviceId ?? null,
          isActive: true,
          updatedAt: now,
        },
      });
  });
}

export async function deleteLiveActivityStartToken(userId: string, pushToken: string): Promise<void> {
  await db
    .update(liveActivityStartTokens)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(
      eq(liveActivityStartTokens.userId, userId),
      eq(liveActivityStartTokens.pushToken, pushToken),
    ));
}

function dateKey(offsetDays: number): string {
  return riyadhDay.format(new Date(Date.now() + offsetDays * 86_400_000));
}

async function startableFixtures(fixtureIds: number[]): Promise<Map<number, SplLiveBoardItem>> {
  const now = Math.floor(Date.now() / 1000);
  const [today, tomorrow] = await Promise.all([
    getGlobalTodayFixtures(dateKey(0)),
    getGlobalTodayFixtures(dateKey(1)),
  ]);
  return new Map([...today, ...tomorrow]
    .filter((fixture) =>
      fixtureIds.includes(fixture.id) &&
      !fixture.status.finished &&
      now >= fixture.timestamp - START_LEAD_SECONDS &&
      now <= fixture.timestamp + RECOVERY_TAIL_SECONDS)
    .map((fixture) => [fixture.id, fixture]));
}

async function claimDelivery(startTokenId: string, fixtureId: number): Promise<boolean> {
  const now = new Date();
  const retryBefore = new Date(now.getTime() - RETRY_AFTER_MS);
  const inserted = await db
    .insert(liveActivityStartDeliveries)
    .values({ startTokenId, fixtureId, status: "pending", attemptedAt: now, updatedAt: now })
    .onConflictDoNothing({
      target: [liveActivityStartDeliveries.startTokenId, liveActivityStartDeliveries.fixtureId],
    })
    .returning({ id: liveActivityStartDeliveries.id });
  if (inserted.length > 0) return true;

  const recovered = await db
    .update(liveActivityStartDeliveries)
    .set({ status: "pending", error: null, attemptedAt: now, updatedAt: now })
    .where(and(
      eq(liveActivityStartDeliveries.startTokenId, startTokenId),
      eq(liveActivityStartDeliveries.fixtureId, fixtureId),
      or(
        eq(liveActivityStartDeliveries.status, "failed"),
        and(
          eq(liveActivityStartDeliveries.status, "pending"),
          lt(liveActivityStartDeliveries.attemptedAt, retryBefore),
        ),
      ),
      lt(liveActivityStartDeliveries.attemptedAt, retryBefore),
    ))
    .returning({ id: liveActivityStartDeliveries.id });
  return recovered.length > 0;
}

export async function runLiveActivityStartCycle(): Promise<{
  fixtures: number;
  attempted: number;
  delivered: number;
  failed: number;
}> {
  const summary = { fixtures: 0, attempted: 0, delivered: 0, failed: 0 };
  if (!isApnsConfigured()) return summary;

  const followed = await db
    .selectDistinct({ fixtureId: sportsFollows.refId })
    .from(sportsFollows)
    .where(and(eq(sportsFollows.kind, "match"), eq(sportsFollows.notify, true)));
  const fixtureIds = followed.map((row) => Number(row.fixtureId)).filter(Number.isFinite);
  if (fixtureIds.length === 0) return summary;

  const fixtures = await startableFixtures(fixtureIds);
  summary.fixtures = fixtures.size;
  if (fixtures.size === 0) return summary;

  const recipients = await db
    .select({
      id: liveActivityStartTokens.id,
      userId: liveActivityStartTokens.userId,
      pushToken: liveActivityStartTokens.pushToken,
      bundleId: liveActivityStartTokens.bundleId,
      fixtureId: sportsFollows.refId,
    })
    .from(liveActivityStartTokens)
    .innerJoin(sportsFollows, and(
      eq(sportsFollows.userId, liveActivityStartTokens.userId),
      eq(sportsFollows.kind, "match"),
      eq(sportsFollows.notify, true),
    ))
    .where(and(
      eq(liveActivityStartTokens.isActive, true),
      eq(liveActivityStartTokens.bundleId, SPORTS_BUNDLE_ID),
      inArray(sportsFollows.refId, [...fixtures.keys()].map(String)),
    ));

  for (const recipient of recipients) {
    const fixtureId = Number(recipient.fixtureId);
    const fixture = fixtures.get(fixtureId);
    if (!fixture || !(await claimDelivery(recipient.id, fixtureId))) continue;
    summary.attempted++;

    const response = await sendLiveActivityStart(recipient.pushToken, {
      bundleId: recipient.bundleId,
      attributesType: ATTRIBUTES_TYPE,
      attributes: {
        fixtureId,
        homeName: fixture.home.name,
        awayName: fixture.away.name,
        homeLogo: fixture.home.logo,
        awayLogo: fixture.away.logo,
        homeLogoFile: null,
        awayLogoFile: null,
        competition: fixture.competition,
        // Synthesized Swift Codable uses Date.timeIntervalSinceReferenceDate.
        kickoff: fixture.timestamp - APPLE_REFERENCE_EPOCH_SECONDS,
      },
      contentState: {
        homeScore: fixture.goals.home ?? 0,
        awayScore: fixture.goals.away ?? 0,
        homePenaltyScore: fixture.penalties?.home ?? null,
        awayPenaltyScore: fixture.penalties?.away ?? null,
        minute: "",
        statusLabel: "تبدأ قريبًا",
        isLive: fixture.status.live,
        isFinished: false,
        lastEvent: null,
        clockStartEpoch: fixture.status.clockStartEpoch ?? null,
      },
      alert: {
        title: `${fixture.home.name} × ${fixture.away.name}`,
        body: "المباراة تبدأ قريبًا — بدأت المتابعة المباشرة تلقائيًا",
      },
      staleDate: fixture.timestamp + 3 * 60 * 60,
    });

    await db
      .update(liveActivityStartDeliveries)
      .set({
        status: response.success ? "delivered" : "failed",
        apnsId: response.apnsId ?? null,
        error: response.reason ?? null,
        deliveredAt: response.success ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(liveActivityStartDeliveries.startTokenId, recipient.id),
        eq(liveActivityStartDeliveries.fixtureId, fixtureId),
      ));

    if (response.success) {
      summary.delivered++;
      await db.update(liveActivityStartTokens)
        .set({ lastUsedAt: new Date(), updatedAt: new Date() })
        .where(eq(liveActivityStartTokens.id, recipient.id));
    } else {
      summary.failed++;
      if (response.reason && INVALID_TOKEN_REASONS.has(response.reason)) {
        await db.update(liveActivityStartTokens)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(liveActivityStartTokens.id, recipient.id));
      }
    }
  }

  return summary;
}
