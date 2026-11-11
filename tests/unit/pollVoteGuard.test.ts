import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  POLL_MAX_ANON_VOTES_PER_IP,
  anonVoteCapReached,
  resolveVoterSessionId,
} from "../../server/services/pollVoteGuard";

// تدقيق 2026-11-10: بلا كوكي كان المصوّت يأخذ `anon-<وقت>` جديدًا كل مرة.
describe("resolveVoterSessionId", () => {
  const base = { ip: "203.0.113.7", pollId: "poll-1" };

  it("is stable for the same connection and poll when the client sends nothing", () => {
    const a = resolveVoterSessionId(base);
    const b = resolveVoterSessionId(base);
    expect(a).toBe(b);
    expect(a.startsWith("ip-")).toBe(true);
    expect(a.length).toBeLessThanOrEqual(100);
  });

  it("differs per poll and per address, and never embeds the raw address", () => {
    const a = resolveVoterSessionId(base);
    expect(resolveVoterSessionId({ ...base, pollId: "poll-2" })).not.toBe(a);
    expect(resolveVoterSessionId({ ...base, ip: "203.0.113.8" })).not.toBe(a);
    expect(a).not.toContain("203.0.113.7");
  });

  it("prefers the cookie, then the header, and ignores junk", () => {
    expect(resolveVoterSessionId({ ...base, cookieSessionId: "c1", headerSessionId: "h1" })).toBe("c1");
    expect(resolveVoterSessionId({ ...base, headerSessionId: "h1" })).toBe("h1");
    for (const junk of ["", "x".repeat(101), ["a"], 5, null]) {
      expect(resolveVoterSessionId({ ...base, headerSessionId: junk }).startsWith("ip-")).toBe(true);
    }
  });
});

describe("anonVoteCapReached", () => {
  it("allows a shared connection a few votes, then stops", () => {
    expect(anonVoteCapReached(0)).toBe(false);
    expect(anonVoteCapReached(POLL_MAX_ANON_VOTES_PER_IP - 1)).toBe(false);
    expect(anonVoteCapReached(POLL_MAX_ANON_VOTES_PER_IP)).toBe(true);
  });
});

describe("vote handler", () => {
  const src = readFileSync(resolve(__dirname, "../..", "server/routes/pollsRoutes.ts"), "utf8");
  const block = src.slice(src.indexOf('router.post("/:pollId/vote"'));

  it("checks the option belongs to the poll before counting", () => {
    expect(block).toContain("eq(pollOptions.id, optionId), eq(pollOptions.pollId, pollId)");
    expect(block.indexOf("الخيار لا يتبع هذا الاستطلاع")).toBeLessThan(block.indexOf("tx.insert(pollVotes)"));
  });

  it("no longer mints a throwaway session or trusts x-forwarded-for", () => {
    expect(block.slice(0, 4000)).not.toContain("anon-${Date.now()}");
    expect(block.slice(0, 4000)).not.toContain("x-forwarded-for");
  });
});

describe("vote write is race-safe", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, "../..", rel), "utf8");
  const src = read("server/routes/pollsRoutes.ts");
  const block = src.slice(src.indexOf('router.post("/:pollId/vote"'));

  it("serialises one voter per poll and re-checks inside the transaction", () => {
    const lock = block.indexOf("pg_advisory_xact_lock(");
    const recheck = block.indexOf("if (already) return false;");
    const insert = block.indexOf("tx.insert(pollVotes)");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(recheck);
    expect(recheck).toBeLessThan(insert);
  });

  it("does not bump counters when the unique index rejects the row", () => {
    expect(block).toContain(".onConflictDoNothing().returning({ id: pollVotes.id })");
    expect(block.indexOf("if (inserted.length === 0) return false;")).toBeLessThan(block.indexOf("tx.update(pollOptions)"));
  });

  it("schema and migration define the same two partial unique indexes", () => {
    const schema = read("shared/schema.ts");
    const migration = read("migrations/20261111_poll_votes_unique.sql");
    for (const name of ["uq_poll_votes_option_user", "uq_poll_votes_option_session"]) {
      expect(schema).toContain(`uniqueIndex("${name}")`);
      expect(migration).toContain(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${name}`);
    }
    // على الخيار لا على الاستطلاع: allowMultipleVotes يسمح بأكثر من خيار.
    expect(migration).toContain("ON poll_votes (poll_id, option_id, user_id)");
    expect(migration).not.toMatch(/^BEGIN;/m);
  });
});

describe("presigned public uploads", () => {
  it("the two reader-reachable endpoints are gone", () => {
    const routes = readFileSync(resolve(__dirname, "../..", "server/routes.ts"), "utf8");
    expect(routes).not.toContain('app.post("/api/profile/image/upload"');
    expect(routes).not.toContain('app.post("/api/objects/upload"');
  });
});
