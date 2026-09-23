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
  isRevoked(sid: string, sess: session.SessionData): Promise<boolean>;
  revokeSid(sid: string): Promise<void>;
  revokeUser(userId: string, exceptSid?: string): Promise<void>;
  generationForUser(userId: string): Promise<string>;
}

const PREFIX = "revocation:";
const SID_RETENTION_SECONDS = 8 * 24 * 60 * 60; // Session lifetime is at most seven days.
function key(kind: "sid" | "user", value: string): string {
  return `${PREFIX}${kind}:${createHash("sha256").update(value).digest("hex")}`;
}

/** Independent rows in the existing sessions table; session set/destroy cannot overwrite them. */
export class PgSessionRevocations implements SessionRevocations {
  constructor(private readonly pool: () => Pick<Pool, "query">) {}

  async isRevoked(sid: string, sess: session.SessionData): Promise<boolean> {
    // Reserved rows are never usable as Passport sessions, even by a signed cookie.
    if (sid.startsWith(PREFIX)) return true;
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
  }

  async revokeUser(userId: string, exceptSid?: string): Promise<void> {
    // One persistent generation per user. It must outlive rolling/exempt sessions.
    await this.pool().query(
      `INSERT INTO sessions (sid, sess, expire) VALUES ($1, $2::jsonb, 'infinity'::timestamp)
       ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
      [key("user", userId), JSON.stringify({ kind: "user-revocation", generation: randomUUID(), exceptSid })],
    );
  }

  async generationForUser(userId: string): Promise<string> {
    const { rows } = await this.pool().query<{ sess: { generation: string } }>(
      "SELECT sess FROM sessions WHERE sid = $1 AND expire > CURRENT_TIMESTAMP", [key("user", userId)],
    );
    return rows[0]?.sess.generation ?? "";
  }
}
