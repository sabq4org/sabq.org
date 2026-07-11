/**
 * «رجل المباراة — الجمهور ضد الأرقام» لخليجي 27.
 *
 * تصويت جماهيري حي: صوت واحد لكل مستخدم لكل مباراة (يُستبدل عند إعادة
 * التصويت)، تُفتح النافذة من الشوط الثاني (elapsed ≥ 46) وحتى 24 ساعة بعد
 * الصافرة. النتيجة توزيعة أصوات يقارنها العميل بأعلى تقييم بيانات
 * (playerStats من TheSports) — مادة النقاش المثالية بعد كل مباراة.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { gcMotmVotes } from "@shared/schema";
import { getGcFixtureForLiveActivity } from "./gulfCupService";

const VOTE_WINDOW_AFTER_MS = 24 * 60 * 60 * 1000;
const SECOND_HALF_MINUTE = 46;

export type GcMotmResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export interface GcMotmBoard {
  total: number;
  myPick: { playerId: string; playerName: string } | null;
  open: boolean;
  results: { playerId: string; playerName: string; votes: number; percent: number }[];
}

/** نافذة التصويت: من الشوط الثاني وحتى 24 ساعة بعد نهاية المباراة. */
async function voteWindow(fixtureId: number): Promise<{ open: boolean; reason?: string }> {
  const fx = await getGcFixtureForLiveActivity(fixtureId);
  if (!fx) return { open: false, reason: "NOT_FOUND" };
  if (fx.status.live) {
    return (fx.status.elapsed ?? 0) >= SECOND_HALF_MINUTE
      ? { open: true }
      : { open: false, reason: "TOO_EARLY" };
  }
  if (fx.status.finished) {
    const since = Date.now() - fx.timestamp * 1000;
    return since <= VOTE_WINDOW_AFTER_MS + 2 * 60 * 60 * 1000
      ? { open: true }
      : { open: false, reason: "CLOSED" };
  }
  return { open: false, reason: "NOT_STARTED" };
}

/** حفظ/استبدال صوتي لرجل المباراة. */
export async function voteMotm(
  userId: string,
  fixtureId: number,
  playerId: string,
  playerName: string,
): Promise<GcMotmResult<{ saved: true }>> {
  const pid = (playerId || "").trim().slice(0, 64);
  const pname = (playerName || "").trim().slice(0, 120);
  if (!pid || !pname) return { ok: false, reason: "INVALID_PLAYER" };

  const window = await voteWindow(fixtureId);
  if (!window.open) return { ok: false, reason: window.reason ?? "CLOSED" };

  await db
    .insert(gcMotmVotes)
    .values({ fixtureId: String(fixtureId), userId, playerId: pid, playerName: pname })
    .onConflictDoUpdate({
      target: [gcMotmVotes.fixtureId, gcMotmVotes.userId],
      set: { playerId: pid, playerName: pname, createdAt: new Date() },
    });
  return { ok: true, data: { saved: true } };
}

/** توزيعة أصوات مباراة + صوتي + هل النافذة مفتوحة. */
export async function getMotmBoard(fixtureId: number, userId?: string): Promise<GcMotmBoard> {
  const fid = String(fixtureId);
  const [rows, mine, window] = await Promise.all([
    db
      .select({
        playerId: gcMotmVotes.playerId,
        playerName: sql<string>`max(${gcMotmVotes.playerName})`,
        votes: sql<number>`count(*)::int`,
      })
      .from(gcMotmVotes)
      .where(eq(gcMotmVotes.fixtureId, fid))
      .groupBy(gcMotmVotes.playerId)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
    userId
      ? db
          .select({ playerId: gcMotmVotes.playerId, playerName: gcMotmVotes.playerName })
          .from(gcMotmVotes)
          .where(and(eq(gcMotmVotes.fixtureId, fid), eq(gcMotmVotes.userId, userId)))
          .limit(1)
      : Promise.resolve([] as { playerId: string; playerName: string }[]),
    voteWindow(fixtureId),
  ]);

  const total = rows.reduce((acc, r) => acc + Number(r.votes), 0);
  return {
    total,
    myPick: mine[0] ?? null,
    open: window.open,
    results: rows.map((r) => ({
      playerId: r.playerId,
      playerName: r.playerName,
      votes: Number(r.votes),
      percent: total > 0 ? Math.round((Number(r.votes) / total) * 100) : 0,
    })),
  };
}
