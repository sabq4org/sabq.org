/**
 * «فانتازي خليجي المصغّر» — اختر 7 لاعبين ضمن ميزانية 100 نقطة، وتُحتسب
 * نقاطك من تقييمات TheSports الفعلية لكل مباراة (يُضاعَف القائد). 15 مباراة
 * فقط — حجم مثالي لفانتازي خفيف. لا نقاط منفصلة عن المزوّد: كل شيء مشتق من
 * التقييمات، فيضيء تلقائيًّا متى توفّرت بيانات الموسم.
 */
import { eq } from "drizzle-orm";
import { db } from "../db";
import { gcFantasySquads, users } from "@shared/schema";
import {
  getGcFantasyPoints,
  getGcFantasyPool,
  type GcFantasyPoolPlayer,
} from "./gulfCupService";

export const FANTASY_BUDGET = 100;
export const FANTASY_SQUAD_SIZE = 7;

export type GcFantasyResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface GcFantasySquadView {
  players: (GcFantasyPoolPlayer & { isCaptain: boolean; points: number })[];
  captainId: string;
  spent: number;
  budget: number;
  totalPoints: number;
}

export interface GcFantasyLeaderRow {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  totalPoints: number;
}

function displayName(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "عضو سبق";
}

/** المجموعة المتاحة للاختيار (لاعبون بأسعار). */
export async function getFantasyPool(): Promise<GcFantasyPoolPlayer[]> {
  const pool = await getGcFantasyPool();
  return pool.sort((a, b) => b.price - a.price);
}

/** حفظ تشكيلتي — تحقق الحجم والتفرّد والقائد والميزانية ضد المجموعة الحيّة. */
export async function saveFantasySquad(
  userId: string,
  playerIds: unknown,
  captainId: unknown,
): Promise<GcFantasyResult<{ spent: number }>> {
  if (!Array.isArray(playerIds) || playerIds.length !== FANTASY_SQUAD_SIZE) {
    return { ok: false, reason: "SIZE" };
  }
  const ids = playerIds.map(String);
  const captain = String(captainId ?? "");
  if (new Set(ids).size !== ids.length) return { ok: false, reason: "DUPLICATE" };
  if (!ids.includes(captain)) return { ok: false, reason: "CAPTAIN" };

  const pool = await getGcFantasyPool();
  if (pool.length === 0) return { ok: false, reason: "POOL_EMPTY" };
  const byId = new Map(pool.map((p) => [p.id, p]));
  if (!ids.every((id) => byId.has(id))) return { ok: false, reason: "UNKNOWN_PLAYER" };

  const spent = ids.reduce((acc, id) => acc + (byId.get(id)?.price ?? 0), 0);
  if (spent > FANTASY_BUDGET) return { ok: false, reason: "OVER_BUDGET" };

  await db
    .insert(gcFantasySquads)
    .values({ userId, playerIds: ids, captainId: captain, spent, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: gcFantasySquads.userId,
      set: { playerIds: ids, captainId: captain, spent, updatedAt: new Date() },
    });
  return { ok: true, data: { spent } };
}

/** تشكيلتي مع نقاط كل لاعب الحيّة (القائد مضاعف). */
export async function getMyFantasy(userId: string): Promise<GcFantasySquadView | null> {
  const [row] = await db.select().from(gcFantasySquads).where(eq(gcFantasySquads.userId, userId)).limit(1);
  if (!row) return null;
  const [pool, points] = await Promise.all([getGcFantasyPool(), getGcFantasyPoints()]);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const ids = (row.playerIds ?? []) as string[];

  let totalPoints = 0;
  const players = ids
    .map((id) => byId.get(id))
    .filter((p): p is GcFantasyPoolPlayer => Boolean(p))
    .map((p) => {
      const isCaptain = p.id === row.captainId;
      const pts = (points.get(p.id) ?? 0) * (isCaptain ? 2 : 1);
      totalPoints += pts;
      return { ...p, isCaptain, points: pts };
    });

  return {
    players,
    captainId: row.captainId,
    spent: row.spent,
    budget: FANTASY_BUDGET,
    totalPoints,
  };
}

/** ترتيب الفانتازي العام — يُحسب من نقاط التقييمات الحيّة لكل تشكيلة. */
export async function getFantasyLeaderboard(limit = 100): Promise<GcFantasyLeaderRow[]> {
  const squads = await db
    .select({
      userId: gcFantasySquads.userId,
      playerIds: gcFantasySquads.playerIds,
      captainId: gcFantasySquads.captainId,
      firstName: users.firstName,
      lastName: users.lastName,
      avatar: users.profileImageUrl,
    })
    .from(gcFantasySquads)
    .innerJoin(users, eq(gcFantasySquads.userId, users.id));
  if (squads.length === 0) return [];

  const points = await getGcFantasyPoints();
  const scored = squads.map((s) => {
    const ids = (s.playerIds ?? []) as string[];
    const total = ids.reduce(
      (acc, id) => acc + (points.get(id) ?? 0) * (id === s.captainId ? 2 : 1),
      0,
    );
    return {
      userId: s.userId,
      name: displayName(s.firstName, s.lastName),
      avatar: s.avatar,
      totalPoints: total,
    };
  });
  scored.sort((a, b) => b.totalPoints - a.totalPoints);
  return scored.slice(0, limit).map((r, i) => ({ rank: i + 1, ...r }));
}
