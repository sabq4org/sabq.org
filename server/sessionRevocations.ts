import { createHash, randomUUID } from "node:crypto";
import type session from "express-session";
import type { Pool } from "pg";

declare module "express-session" {
  interface SessionData {
    /** Captured only at authentication; ordinary saves must never refresh it. */
    webAuthGeneration?: string;
  }
}

export interface SessionRevocations {
  /**
   * `allowCached` is for the per-request read path only (store get/touch).
   * Writes (store set) must always pass through to PostgreSQL.
   */
  isRevoked(sid: string, sess: session.SessionData, opts?: { allowCached?: boolean }): Promise<boolean>;
  revokeSid(sid: string): Promise<void>;
  revokeUser(userId: string, exceptSid?: string): Promise<void>;
  generationForUser(userId: string): Promise<string>;
}

const PREFIX = "revocation:";
const SID_RETENTION_SECONDS = 8 * 24 * 60 * 60; // Session lifetime is at most seven days.
function key(kind: "sid" | "user", value: string): string {
  return `${PREFIX}${kind}:${createHash("sha256").update(value).digest("hex")}`;
}

/**
 * Short read cache for the per-request check (حادثة 2026-10-13: عاجل مع حركة
 * عالية). express-session يستدعي get ثم touch لكل طلب يحمل كوكي الجلسة، وكلاهما
 * كان استعلامًا على مسبح الجلسات الصغير (4 اتصالات)؛ تحت الضغط اصطفّت الطلبات
 * حتى مهلة الاتصال (2ث) على مسارات لا تقرأ الجلسة أصلًا.
 *
 * Module-level so every store instance in this process shares it, and local
 * revokeSid/revokeUser take effect here immediately. Another replica may serve
 * a revoked session for at most REVOCATION_CACHE_TTL_MS (deserializeUser
 * already caches the user for 60s, so this does not widen the existing window).
 */
const REVOCATION_CACHE_TTL_MS = 10_000;
const REVOCATION_CACHE_MAX = 20_000;
type CachedRevocation = { userId?: string; generation?: string; revoked: boolean; expiresAt: number };
const revocationCache = new Map<string, CachedRevocation>();
const revocationInflight = new Map<string, Promise<boolean>>();
let revocationEpoch = 0;

function cacheKey(sid: string, userId: string | undefined, generation: string | undefined): string {
  return `${sid}\u0000${userId ?? ""}\u0000${generation ?? ""}`;
}

/** Test hook. */
export function clearRevocationCache(): void {
  revocationCache.clear();
  revocationInflight.clear();
  revocationEpoch++;
}

/** Independent rows in the existing sessions table; session set/destroy cannot overwrite them. */
export class PgSessionRevocations implements SessionRevocations {
  constructor(private readonly pool: () => Pick<Pool, "query">) {}

  async isRevoked(sid: string, sess: session.SessionData, opts?: { allowCached?: boolean }): Promise<boolean> {
    // Reserved rows are never usable as Passport sessions, even by a signed cookie.
    if (sid.startsWith(PREFIX)) return true;
    if (!opts?.allowCached) return this.queryRevoked(sid, sess);

    const rawUser = (sess as session.SessionData & { passport?: { user?: unknown } }).passport?.user;
    const userId = typeof rawUser === "string" ? rawUser : undefined;
    const k = cacheKey(sid, userId, sess.webAuthGeneration);
    const now = Date.now();
    const hit = revocationCache.get(k);
    if (hit && hit.expiresAt > now) return hit.revoked;

    const pending = revocationInflight.get(k);
    if (pending) return pending;

    const epoch = revocationEpoch;
    const lookup = this.queryRevoked(sid, sess).then(revoked => {
      // A revocation that happened while this query was in flight wins.
      if (epoch === revocationEpoch) {
        if (revocationCache.size >= REVOCATION_CACHE_MAX) revocationCache.clear();
        revocationCache.set(k, {
          userId, generation: sess.webAuthGeneration, revoked, expiresAt: Date.now() + REVOCATION_CACHE_TTL_MS,
        });
      }
      return revoked;
    }).finally(() => {
      if (revocationInflight.get(k) === lookup) revocationInflight.delete(k);
    });
    revocationInflight.set(k, lookup);
    return lookup;
  }

  private async queryRevoked(sid: string, sess: session.SessionData): Promise<boolean> {
    const userId = (sess as session.SessionData & { passport?: { user?: unknown } }).passport?.user;
    const sidKey = key("sid", sid);
    const keys = typeof userId === "string" ? [sidKey, key("user", userId)] : [sidKey];
    const { rows } = await this.pool().query<{ sid: string; sess: { generation?: string; exceptSid?: string } }>(
      "SELECT sid, sess FROM sessions WHERE sid = ANY($1::varchar[]) AND expire > CURRENT_TIMESTAMP",
      [keys],
    );
    for (const row of rows) {
      if (row.sid === sidKey) return true;
      if (row.sess.exceptSid !== sid && row.sess.generation !== sess.webAuthGeneration) return true;
    }
    return false;
  }

  async revokeSid(sid: string): Promise<void> {
    if (sid.startsWith(PREFIX)) throw new Error("Reserved session identifier");
    await this.pool().query(
      `INSERT INTO sessions (sid, sess, expire) VALUES ($1, '{"kind":"sid-revocation"}'::jsonb,
        CURRENT_TIMESTAMP + $2 * interval '1 second')
       ON CONFLICT (sid) DO UPDATE SET expire = GREATEST(sessions.expire, EXCLUDED.expire)`,
      [key("sid", sid), SID_RETENTION_SECONDS],
    );
    forgetCached(entry => entry.sid === sid);
  }

  async revokeUser(userId: string, exceptSid?: string): Promise<void> {
    // One persistent generation per user. It must outlive rolling/exempt sessions.
    await this.pool().query(
      `INSERT INTO sessions (sid, sess, expire) VALUES ($1, $2::jsonb, 'infinity'::timestamp)
       ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
      [key("user", userId), JSON.stringify({ kind: "user-revocation", generation: randomUUID(), exceptSid })],
    );
    forgetCached(entry => entry.userId === userId);
  }

  async generationForUser(userId: string): Promise<string> {
    const { rows } = await this.pool().query<{ sess: { generation: string } }>(
      "SELECT sess FROM sessions WHERE sid = $1 AND expire > CURRENT_TIMESTAMP", [key("user", userId)],
    );
    return rows[0]?.sess.generation ?? "";
  }
}

function forgetCached(match: (entry: CachedRevocation & { sid: string }) => boolean): void {
  revocationEpoch++;
  revocationInflight.clear();
  for (const [k, entry] of revocationCache) {
    const sid = k.slice(0, k.indexOf("\u0000"));
    if (match({ ...entry, sid })) revocationCache.delete(k);
  }
}
