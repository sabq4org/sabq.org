/**
 * دورة دفع لقطات VARA الذكية.
 *
 * لا تولّد لقطات هنا؛ تعتمد على sports_insights الجاهزة من جوب التوليد، ثم تختار
 * اللقطات المؤهلة للدفع وتطبّق: نافذة التوقيت، التفضيلات، إزالة التكرار، وحدود
 * الإزعاج اليومية/الأسبوعية.
 */
import { and, desc, eq, gt, gte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { notificationBus } from "../../notificationBus";
import { getRedisClient } from "../../redis";
import { notificationsInbox, sportsInsights, sportsMatchViews } from "@shared/schema";
import { filterUsersByEventPref } from "../sportsAlertPrefsService";
import { pushToUserDevices } from "../sportsAlertsService";
import { getTeamFollowerUserIds } from "../sportsFollowsService";
import {
  SPORTS_SNAPS_PUSH_CAPS,
  SPORTS_SNAPS_WINDOWS,
  type SportsSnapAccent,
  type SportsSnapKind,
} from "./config";

type PushSnapKind = "upcoming_match" | "behavioral_big_match";

interface SnapEntities {
  fixtureId?: number;
  teamId?: number;
  opponentId?: number;
  kickoff?: string;
  accent?: SportsSnapAccent;
  competitionSlug?: string;
  [key: string]: unknown;
}

interface PushCandidate {
  insightId: string;
  kind: PushSnapKind;
  title: string;
  body: string;
  fixtureId: number;
  teamId: number;
  kickoff: Date | null;
  candidates: string[];
  accent?: SportsSnapAccent;
  competitionSlug?: string;
}

export interface SportsSnapsPushCycleSummary {
  candidates: number;
  recipients: number;
  skippedQuietHours: boolean;
}

const DEDUPE_TTL_MS = 8 * 24 * 3600 * 1000;
const DAY_TTL_SECONDS = 36 * 3600;
const WEEK_TTL_SECONDS = 9 * 24 * 3600;

const memoryDedupe = new Map<string, number>();
const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

function compactMemoryMaps(now = Date.now()): void {
  for (const [key, expiresAt] of memoryDedupe) {
    if (expiresAt <= now) memoryDedupe.delete(key);
  }
  for (const [key, item] of memoryCounters) {
    if (item.expiresAt <= now) memoryCounters.delete(key);
  }
}

function toNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseEntities(value: unknown): SnapEntities {
  return value && typeof value === "object" ? (value as SnapEntities) : {};
}

function parseKickoff(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hoursUntil(date: Date | null): number | null {
  if (!date) return null;
  return (date.getTime() - Date.now()) / 3_600_000;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function riyadhParts(date = new Date()): { date: string; minutes: number; week: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SPORTS_SNAPS_PUSH_CAPS.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const minutes = hour * 60 + minute;
  const week = String(Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / (7 * 24 * 3600 * 1000)));
  return { date: dateKey, minutes, week };
}

function parseClock(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function isQuietHours(): boolean {
  const { minutes } = riyadhParts();
  const start = parseClock(SPORTS_SNAPS_PUSH_CAPS.quietHoursStart);
  const end = parseClock(SPORTS_SNAPS_PUSH_CAPS.quietHoursEnd);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

async function hasInboxDuplicate(userId: string, kind: SportsSnapKind, fixtureId: number): Promise<boolean> {
  const [existing] = await db
    .select({ id: notificationsInbox.id })
    .from(notificationsInbox)
    .where(
      and(
        eq(notificationsInbox.userId, userId),
        eq(notificationsInbox.type, `sports.snap.${kind}`),
        sql`${notificationsInbox.metadata}->>'fixtureId' = ${String(fixtureId)}`,
        sql`${notificationsInbox.metadata}->>'kind' = ${kind}`,
      ),
    )
    .limit(1);
  return Boolean(existing);
}

async function reserveDedupe(userId: string, kind: SportsSnapKind, fixtureId: number): Promise<boolean> {
  const key = `sports_snaps:dedupe:${userId}:${kind}:${fixtureId}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      return (await redis.setLock(key, "1", DEDUPE_TTL_MS)) === "OK";
    } catch (err) {
      console.error("[SportsSnaps Push] redis dedupe failed:", err);
    }
  }

  compactMemoryMaps();
  if (memoryDedupe.has(key)) return false;
  memoryDedupe.set(key, Date.now() + DEDUPE_TTL_MS);
  return true;
}

async function readCounter(key: string): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    try {
      return Number((await redis.get(key)) ?? "0");
    } catch (err) {
      console.error("[SportsSnaps Push] redis cap read failed:", err);
    }
  }

  compactMemoryMaps();
  return memoryCounters.get(key)?.count ?? 0;
}

async function writeCounter(key: string, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const current = Number((await redis.get(key)) ?? "0");
      await redis.set(key, String(current + 1), {
        expiration: { type: "EX", value: ttlSeconds },
      });
      return;
    } catch (err) {
      console.error("[SportsSnaps Push] redis cap write failed:", err);
    }
  }

  compactMemoryMaps();
  const now = Date.now();
  const current = memoryCounters.get(key);
  memoryCounters.set(key, {
    count: (current?.count ?? 0) + 1,
    expiresAt: now + ttlSeconds * 1000,
  });
}

async function reserveCaps(userId: string, kind: PushSnapKind): Promise<boolean> {
  const { date, week } = riyadhParts();
  const dailyKey = `sports_snaps:cap:day:${date}:${userId}`;
  const weeklyKey = `sports_snaps:cap:week:${week}:${userId}`;
  const behaviorKey = `sports_snaps:cap:behavioral:${week}:${userId}`;

  const daily = await readCounter(dailyKey);
  const weekly = await readCounter(weeklyKey);
  const behavioral = kind === "behavioral_big_match" ? await readCounter(behaviorKey) : 0;
  if (daily >= SPORTS_SNAPS_PUSH_CAPS.perUserPerDay) return false;
  if (weekly >= SPORTS_SNAPS_PUSH_CAPS.perUserPerWeek) return false;
  if (
    kind === "behavioral_big_match" &&
    behavioral >= SPORTS_SNAPS_PUSH_CAPS.behavioralPerUserPerWeek
  ) {
    return false;
  }

  await writeCounter(dailyKey, DAY_TTL_SECONDS);
  await writeCounter(weeklyKey, WEEK_TTL_SECONDS);
  if (kind === "behavioral_big_match") await writeCounter(behaviorKey, WEEK_TTL_SECONDS);
  return true;
}

async function recentViewUserIdsForTeam(teamId: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - SPORTS_SNAPS_WINDOWS.behavioralLookbackDays * 24 * 3600 * 1000);
  const rows = await db
    .selectDistinct({ userId: sportsMatchViews.userId })
    .from(sportsMatchViews)
    .where(
      and(
        gte(sportsMatchViews.lastViewedAt, cutoff),
        or(eq(sportsMatchViews.homeId, teamId), eq(sportsMatchViews.awayId, teamId)),
      ),
    );
  return rows.map((row) => row.userId);
}

async function loadCandidateRows(kind: PushSnapKind) {
  return db
    .select()
    .from(sportsInsights)
    .where(and(eq(sportsInsights.scope, "team"), eq(sportsInsights.kind, kind), gt(sportsInsights.ttlAt, new Date())))
    .orderBy(desc(sportsInsights.importance), desc(sportsInsights.createdAt))
    .limit(50);
}

async function getUpcomingCandidates(): Promise<PushCandidate[]> {
  const rows = await loadCandidateRows("upcoming_match");
  const candidates: PushCandidate[] = [];
  for (const row of rows) {
    const entities = parseEntities(row.entities);
    const fixtureId = toNumber(entities.fixtureId);
    const teamId = toNumber(entities.teamId ?? row.refId);
    const kickoff = parseKickoff(entities.kickoff);
    const leadHours = hoursUntil(kickoff);
    if (!fixtureId || !teamId || leadHours == null) continue;
    if (
      leadHours < SPORTS_SNAPS_WINDOWS.upcomingMatchLeadHoursMin ||
      leadHours > SPORTS_SNAPS_WINDOWS.upcomingMatchLeadHoursMax
    ) {
      continue;
    }

    const followers = await getTeamFollowerUserIds([String(teamId)]);
    candidates.push({
      insightId: row.id,
      kind: "upcoming_match",
      title: row.headline,
      body: row.body,
      fixtureId,
      teamId,
      kickoff,
      candidates: followers,
      accent: entities.accent,
      competitionSlug: entities.competitionSlug,
    });
  }
  return candidates;
}

async function getBehavioralCandidates(): Promise<PushCandidate[]> {
  const rows = await loadCandidateRows("behavioral_big_match");
  const candidates: PushCandidate[] = [];
  for (const row of rows) {
    const entities = parseEntities(row.entities);
    const fixtureId = toNumber(entities.fixtureId);
    const teamId = toNumber(entities.teamId ?? row.refId);
    const kickoff = parseKickoff(entities.kickoff);
    const leadHours = hoursUntil(kickoff);
    if (!fixtureId || !teamId || leadHours == null) continue;
    if (leadHours < 0 || leadHours > SPORTS_SNAPS_WINDOWS.behavioralUpcomingHours) continue;

    const viewers = await recentViewUserIdsForTeam(teamId);
    candidates.push({
      insightId: row.id,
      kind: "behavioral_big_match",
      title: row.headline,
      body: row.body,
      fixtureId,
      teamId,
      kickoff,
      candidates: viewers,
      accent: entities.accent,
      competitionSlug: entities.competitionSlug,
    });
  }
  return candidates;
}

async function dispatchSnap(candidate: PushCandidate): Promise<number> {
  const prefAllowed = await filterUsersByEventPref(unique(candidate.candidates), "smartSnaps");
  let recipients = 0;

  for (const userId of prefAllowed) {
    try {
      if (!(await reserveCaps(userId, candidate.kind))) continue;
      if (await hasInboxDuplicate(userId, candidate.kind, candidate.fixtureId)) continue;
      if (!(await reserveDedupe(userId, candidate.kind, candidate.fixtureId))) continue;

      const type = `sports.snap.${candidate.kind}`;
      const deeplink = `/sports/match/${candidate.fixtureId}`;
      const pushData: Record<string, string> = {
        type,
        deeplink: `sabq://match/${candidate.fixtureId}`,
        fixtureId: String(candidate.fixtureId),
        kind: candidate.kind,
        insightId: candidate.insightId,
        priority: "time-sensitive",
      };

      await db.insert(notificationsInbox).values({
        userId,
        type,
        title: candidate.title,
        body: candidate.body,
        deeplink,
        read: false,
        metadata: {
          kind: candidate.kind,
          fixtureId: candidate.fixtureId,
          teamId: candidate.teamId,
          insightId: candidate.insightId,
          accent: candidate.accent,
          competitionSlug: candidate.competitionSlug,
        },
      });
      notificationBus.emit(userId, {
        type,
        title: candidate.title,
        body: candidate.body,
        deeplink,
      });
      await pushToUserDevices(userId, candidate.title, candidate.body, pushData);
      recipients += 1;
    } catch (err) {
      console.error(`[SportsSnaps Push] dispatch failed for user ${userId}:`, err);
    }
  }

  return recipients;
}

export async function runSnapsPushCycle(): Promise<SportsSnapsPushCycleSummary> {
  if (isQuietHours()) return { candidates: 0, recipients: 0, skippedQuietHours: true };

  const [upcoming, behavioral] = await Promise.all([getUpcomingCandidates(), getBehavioralCandidates()]);
  const candidates = [...upcoming, ...behavioral].filter((candidate) => candidate.candidates.length > 0);

  let recipients = 0;
  for (const candidate of candidates) {
    recipients += await dispatchSnap(candidate);
  }

  return { candidates: candidates.length, recipients, skippedQuietHours: false };
}
