/**
 * قراءة وتحديث خلاصة لقطات VARA الذكية. كل الوصول إلى Drizzle هنا داخل الخدمة
 * حتى تبقى الراوترات نظيفة وفق ADR-001.
 */
import { desc, eq, gte } from "drizzle-orm";
import { db } from "../../db";
import { sportsFollows, sportsMatchViews, type SportsInsight } from "@shared/schema";
import { pruneExpiredInsights, queryInsights, saveInsights } from "../sportsIntelligence/insightsStore";
import { listFollows } from "../sportsFollowsService";
import { buildTeamFacts } from "./factsBuilder";
import { composeSnaps } from "./composer";
import {
  PHASE_ONE_SNAP_KINDS,
  SNAP_FEED_LIMIT,
  SPORTS_SNAPS_WINDOWS,
  type SportsSnapAccent,
  type SportsSnapKind,
} from "./config";
import { personalizeForFavorite, personalizeForViewedMatch, type TemplateSnap } from "./templates";
import { getRecentViewedTeamIds } from "./engagement";

const ICON_BY_KIND: Record<SportsSnapKind, string> = {
  upcoming_match: "calendar",
  behavioral_big_match: "sparkles",
  post_match_recap: "flag",
  streak_note: "activity",
  h2h_context: "history",
  schedule_congestion: "timer",
  standings_stake: "table",
};

const ACCENT_BY_KIND: Record<SportsSnapKind, SportsSnapAccent> = {
  upcoming_match: "green",
  behavioral_big_match: "gold",
  post_match_recap: "green",
  streak_note: "green",
  h2h_context: "gold",
  schedule_congestion: "gold",
  standings_stake: "crimson",
};

export interface SnapDto {
  id: string;
  kind: SportsSnapKind;
  icon: string;
  headline: string;
  body: string;
  accent: SportsSnapAccent;
  fixtureId?: number;
  teamId?: number;
  competitionSlug?: string | null;
  kickoff?: string | null;
  deeplink: string;
  generatedAt: Date;
  ttlAt: Date | null;
}

function entitiesOf(row: SportsInsight): Record<string, any> {
  return row.entities && typeof row.entities === "object" && !Array.isArray(row.entities)
    ? (row.entities as Record<string, any>)
    : {};
}

function deeplink(entities: Record<string, any>): string {
  if (typeof entities.fixtureId === "number") return `sabq://match/${entities.fixtureId}`;
  if (typeof entities.teamId === "number") return `sabq://team/${entities.teamId}`;
  return "sabq://sports";
}

function toDto(row: SportsInsight): SnapDto {
  const entities = entitiesOf(row);
  const kind = row.kind as SportsSnapKind;
  return {
    id: row.id,
    kind,
    icon: ICON_BY_KIND[kind] ?? "sparkles",
    headline: row.headline,
    body: row.body,
    accent: (entities.accent as SportsSnapAccent | undefined) ?? ACCENT_BY_KIND[kind] ?? "green",
    fixtureId: typeof entities.fixtureId === "number" ? entities.fixtureId : undefined,
    teamId: typeof entities.teamId === "number" ? entities.teamId : undefined,
    competitionSlug: typeof entities.competitionSlug === "string" ? entities.competitionSlug : null,
    kickoff: typeof entities.kickoff === "string" ? entities.kickoff : null,
    deeplink: deeplink(entities),
    generatedAt: row.createdAt,
    ttlAt: row.ttlAt ?? null,
  };
}

function withBody(dto: SnapDto, body: string): SnapDto {
  return { ...dto, body };
}

function ttlMsFor(snap: TemplateSnap): number | null {
  if (!snap.ttlAt) return null;
  return Math.max(60_000, snap.ttlAt.getTime() - Date.now());
}

async function storeTeamSnaps(teamId: number, snaps: TemplateSnap[], sourceStats: unknown): Promise<void> {
  await saveInsights(
    snaps.map((snap) => ({
      scope: "team",
      refId: String(teamId),
      competitionSlug: snap.entities.competitionSlug ?? null,
      kind: snap.kind,
      importance: snap.importance,
      headline: snap.headline,
      body: snap.body,
      entities: { ...snap.entities, accent: snap.accent },
      sourceStats,
      dedupeKey: snap.dedupeKey,
      ttlMs: ttlMsFor(snap),
    })),
  );
}

export async function refreshTeamSnaps(teamId: number): Promise<number> {
  const facts = await buildTeamFacts(teamId);
  const snaps = await composeSnaps(facts);
  await storeTeamSnaps(teamId, snaps, facts);
  return snaps.length;
}

export async function getTeamSnaps(teamId: number, opts: { lazy?: boolean } = {}): Promise<SnapDto[]> {
  const rows = await queryInsights({
    scope: "team",
    refId: String(teamId),
    kinds: [...PHASE_ONE_SNAP_KINDS],
    limit: SNAP_FEED_LIMIT,
  });
  if (rows.length > 0 || opts.lazy === false) return rows.map(toDto);

  await refreshTeamSnaps(teamId);
  const fresh = await queryInsights({
    scope: "team",
    refId: String(teamId),
    kinds: [...PHASE_ONE_SNAP_KINDS],
    limit: SNAP_FEED_LIMIT,
  });
  return fresh.map(toDto);
}

export async function getUserFeed(userId: string): Promise<SnapDto[]> {
  const follows = await listFollows(userId).catch(() => []);
  const followedTeamIds = follows
    .filter((follow) => follow.kind === "team")
    .map((follow) => Number(follow.refId))
    .filter((id) => Number.isFinite(id) && id > 0);
  const viewedTeamIds = await getRecentViewedTeamIds(userId).catch(() => []);

  const seen = new Set<number>();
  const teams: Array<{ id: number; source: "follow" | "view" }> = [];
  for (const id of followedTeamIds) {
    if (!seen.has(id)) {
      seen.add(id);
      teams.push({ id, source: "follow" });
    }
  }
  for (const id of viewedTeamIds) {
    if (!seen.has(id)) {
      seen.add(id);
      teams.push({ id, source: "view" });
    }
  }

  const items: SnapDto[] = [];
  for (const team of teams.slice(0, 8)) {
    const snaps = await getTeamSnaps(team.id).catch(() => []);
    for (const snap of snaps) {
      if (team.source === "follow") {
        items.push(withBody(snap, personalizeForFavorite(snap.body)));
      } else if (snap.kind === "behavioral_big_match") {
        items.push(withBody(snap, personalizeForViewedMatch(snap.body)));
      } else {
        items.push(snap);
      }
    }
  }

  const deduped = new Map<string, SnapDto>();
  for (const item of items) {
    const key = `${item.kind}:${item.fixtureId ?? item.teamId ?? item.id}`;
    if (!deduped.has(key)) deduped.set(key, item);
  }

  return [...deduped.values()].slice(0, SNAP_FEED_LIMIT);
}

export async function getActiveSnapTeamIds(limit = 60): Promise<number[]> {
  const ids = new Set<number>();

  const follows = await db
    .select({ refId: sportsFollows.refId })
    .from(sportsFollows)
    .where(eq(sportsFollows.kind, "team"))
    .orderBy(desc(sportsFollows.createdAt))
    .limit(limit * 2)
    .catch(() => []);

  for (const row of follows) {
    const id = Number(row.refId);
    if (Number.isFinite(id) && id > 0) ids.add(id);
    if (ids.size >= limit) return [...ids];
  }

  const since = new Date(Date.now() - SPORTS_SNAPS_WINDOWS.behavioralLookbackDays * 24 * 60 * 60 * 1000);
  const views = await db
    .select({ homeId: sportsMatchViews.homeId, awayId: sportsMatchViews.awayId })
    .from(sportsMatchViews)
    .where(gte(sportsMatchViews.lastViewedAt, since))
    .orderBy(desc(sportsMatchViews.lastViewedAt))
    .limit(limit * 2)
    .catch(() => []);

  for (const row of views) {
    for (const id of [row.homeId, row.awayId]) {
      if (typeof id === "number" && id > 0) ids.add(id);
      if (ids.size >= limit) return [...ids];
    }
  }

  return [...ids];
}

export async function pruneExpiredTeamSnaps(): Promise<number> {
  return pruneExpiredInsights();
}
