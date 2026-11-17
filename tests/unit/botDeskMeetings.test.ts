import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  botDeskMeetingEventsQuerySchema,
  botDeskMeetingTranscriptQuerySchema,
  botDeskMeetingsQuerySchema,
  decodeBotDeskCursor,
  encodeBotDeskCursor,
} from "../../shared/botDeskMeetings";

// GET /api/internal/bot-desk/meetings* — قراءة اجتماعات سبق لبوت الديسك.
// الموجّه الحقيقي، وخدمات البيانات مُحاكاة (الإثبات على Postgres في وصف الـ PR).

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  authenticatePublisherToken: vi.fn(),
  userHasPermission: vi.fn(),
  logActivity: vi.fn(),
  listMeetingsForBot: vi.fn(),
  listMeetingEventsForBot: vi.fn(),
  loadMeetingForBot: vi.fn(),
  getMeetingDetailForBot: vi.fn(),
  getTranscriptPageForBot: vi.fn(),
  reconcileLiveMeetings: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: { select: (...args: unknown[]) => mocks.dbSelect(...args) },
}));

vi.mock("../../server/services/botPublisherTokenService", () => ({
  authenticatePublisherToken: (...args: unknown[]) => mocks.authenticatePublisherToken(...args),
}));

vi.mock("../../server/rbac", () => ({
  userHasPermission: (...args: unknown[]) => mocks.userHasPermission(...args),
  logActivity: (...args: unknown[]) => mocks.logActivity(...args),
}));

vi.mock("../../server/services/meetingsService", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/meetingsService")>(
    "../../server/services/meetingsService",
  );
  return { ...actual, reconcileLiveMeetings: (...a: unknown[]) => mocks.reconcileLiveMeetings(...a) };
});

vi.mock("../../server/services/botDeskMeetingsService", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/botDeskMeetingsService")>(
    "../../server/services/botDeskMeetingsService",
  );
  return {
    ...actual,
    listMeetingsForBot: (...a: unknown[]) => mocks.listMeetingsForBot(...a),
    listMeetingEventsForBot: (...a: unknown[]) => mocks.listMeetingEventsForBot(...a),
    loadMeetingForBot: (...a: unknown[]) => mocks.loadMeetingForBot(...a),
    getMeetingDetailForBot: (...a: unknown[]) => mocks.getMeetingDetailForBot(...a),
    getTranscriptPageForBot: (...a: unknown[]) => mocks.getTranscriptPageForBot(...a),
  };
});

import botDeskRouter from "../../server/routes/botDesk";

const WITH_MEETINGS = "botpub_meetings_reader_placeholder_aaaa";
const WITHOUT_MEETINGS = "botpub_articles_only_placeholder_bbbbb";

const principal = (capabilities: string[]) => ({
  userId: "owner-1",
  tokenId: "tok-1",
  tokenPrefix: "botpub_meetings_",
  label: "sohba-meetings",
  email: "owner@example.test",
  name: "مالك التوكن",
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  capabilities,
});

const meetingRow = {
  id: "m-1",
  title: "اجتماع التحرير الصباحي",
  description: null,
  hostUserId: "owner-1",
  accessType: "all",
  departmentId: null,
  inviteToken: "INVITE_SHOULD_NEVER_LEAK",
  requireApproval: true,
  muteOnJoin: true,
  status: "live",
  isLocked: false,
  roomName: "sbq-ROOM_SHOULD_NEVER_LEAK",
  minutesEnabled: true,
  minutesStatus: "draft",
  minutes: { summary: "ملخص", decisions: ["قرار"], actionItems: [], deferred: [] },
  minutesGeneratedAt: new Date("2026-11-17T08:00:00Z"),
  minutesApprovedAt: null,
  durationMinutes: 30,
  agenda: [],
  scheduledAt: null,
  startedAt: new Date("2026-11-17T07:00:00Z"),
  endedAt: null,
  createdAt: new Date("2026-11-17T06:59:00Z"),
};

const app = express();
app.use(express.json());
app.use(botDeskRouter);
const server = createServer(app);
let base = "";

const get = (path: string, credential: string | null = WITH_MEETINGS) =>
  fetch(`${base}/api/internal/bot-desk${path}`, {
    headers: credential ? { Authorization: `Bearer ${credential}` } : {},
  });

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.authenticatePublisherToken.mockImplementation(async (raw: string) =>
    raw === WITH_MEETINGS
      ? principal(["read", "meetingsRead"])
      : raw === WITHOUT_MEETINGS
        ? principal(["read", "publish"])
        : null,
  );
  mocks.userHasPermission.mockResolvedValue(true);
  mocks.reconcileLiveMeetings.mockResolvedValue(undefined);
});

describe("cursor codec + query schemas", () => {
  it("round-trips a microsecond Postgres timestamp and id", () => {
    const c = { ts: "2026-11-17 08:12:33.123456", id: "0b9f2c1e-1111-4a4a-9b9b-222233334444" };
    expect(decodeBotDeskCursor(encodeBotDeskCursor(c))).toEqual(c);
    const t = { ts: "2026-11-17 08:12:33.5", ms: 12000, id: "seg-1" };
    expect(decodeBotDeskCursor(encodeBotDeskCursor(t))).toEqual(t);
    expect(decodeBotDeskCursor(Buffer.from("2026-11-17 08:12:33|-5|seg").toString("base64url"))).toBeNull();
    expect(decodeBotDeskCursor(encodeBotDeskCursor({ ts: "2026-11-17 08:12:33", id: "0" }))).toEqual({
      ts: "2026-11-17 08:12:33",
      id: "0",
    });
  });

  it("rejects tampered or non-timestamp cursors (no SQL reaches the DB)", () => {
    expect(decodeBotDeskCursor("")).toBeNull();
    expect(decodeBotDeskCursor("not-base64-|")).toBeNull();
    expect(decodeBotDeskCursor(Buffer.from("2026-11-17'; drop table x;--|id").toString("base64url"))).toBeNull();
    expect(decodeBotDeskCursor(Buffer.from("2026-11-17 08:12:33|id with space").toString("base64url"))).toBeNull();
    expect(botDeskMeetingTranscriptQuerySchema.safeParse({ since: "garbage" }).success).toBe(false);
  });

  it("parses status lists, ISO windows, limits and is strict", () => {
    const q = botDeskMeetingsQuerySchema.parse({ status: "live,ended", from: "2026-11-17T00:00:00Z", limit: "5" });
    expect(q.status).toEqual(["live", "ended"]);
    expect(q.from).toBeInstanceOf(Date);
    expect(q.limit).toBe(5);
    expect(botDeskMeetingsQuerySchema.safeParse({ status: "live,bogus" }).success).toBe(false);
    expect(botDeskMeetingsQuerySchema.safeParse({ limit: "9999" }).success).toBe(false);
    expect(botDeskMeetingsQuerySchema.safeParse({ inviteToken: "x" }).success).toBe(false);
    expect(botDeskMeetingTranscriptQuerySchema.parse({}).limit).toBe(200);
    expect(botDeskMeetingEventsQuerySchema.parse({}).limit).toBe(100);
  });
});

describe("auth and capability", () => {
  it("401 without a token, with WWW-Authenticate and no-store", async () => {
    const res = await get("/meetings", null);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("sabq-bot-desk");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(mocks.listMeetingsForBot).not.toHaveBeenCalled();
  });

  it("403 when the token owner lacks meetingsRead", async () => {
    for (const path of ["/meetings", "/meetings/events", "/meetings/m-1", "/meetings/m-1/transcript", "/meetings/m-1/minutes"]) {
      const res = await get(path, WITHOUT_MEETINGS);
      expect(res.status, path).toBe(403);
      expect((await res.json()).details).toEqual({ required: "meetingsRead" });
    }
    expect(mocks.loadMeetingForBot).not.toHaveBeenCalled();
  });

  it("never writes activity_logs on reads", async () => {
    mocks.listMeetingsForBot.mockResolvedValue([]);
    await get("/meetings");
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });
});

describe("GET /meetings and /meetings/events", () => {
  it("passes owner identity + meetings.manage and default query", async () => {
    mocks.userHasPermission.mockResolvedValue(false);
    mocks.listMeetingsForBot.mockResolvedValue([{ id: "m-1" }]);
    const res = await get("/meetings");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ meetings: [{ id: "m-1" }] });
    expect(mocks.userHasPermission).toHaveBeenCalledWith("owner-1", "meetings.manage");
    expect(mocks.listMeetingsForBot).toHaveBeenCalledWith("owner-1", false, { limit: 50 });
    expect(mocks.reconcileLiveMeetings).toHaveBeenCalled();
  });

  it("400 on a bad status", async () => {
    const res = await get("/meetings?status=open");
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("validation_error");
  });

  it("/meetings/events is not captured by /meetings/:id", async () => {
    mocks.listMeetingEventsForBot.mockResolvedValue({ events: [], nextCursor: "c", hasMore: false });
    const res = await get("/meetings/events");
    expect(res.status).toBe(200);
    expect(mocks.loadMeetingForBot).not.toHaveBeenCalled();
    expect(mocks.listMeetingEventsForBot).toHaveBeenCalledWith("owner-1", true, { limit: 100 });
  });
});

describe("GET /meetings/:id, /transcript, /minutes", () => {
  it("404 for unknown and 403 for ineligible meetings", async () => {
    mocks.loadMeetingForBot.mockResolvedValueOnce({ ok: false, status: 404 });
    expect((await get("/meetings/nope")).status).toBe(404);
    mocks.loadMeetingForBot.mockResolvedValueOnce({ ok: false, status: 403 });
    expect((await get("/meetings/private/transcript")).status).toBe(403);
  });

  it("detail delegates to the service", async () => {
    mocks.loadMeetingForBot.mockResolvedValue({ ok: true, meeting: meetingRow, viewerIsHost: true });
    mocks.getMeetingDetailForBot.mockResolvedValue({ id: "m-1", attendees: [] });
    const res = await get("/meetings/m-1");
    expect(res.status).toBe(200);
    expect(mocks.getMeetingDetailForBot).toHaveBeenCalledWith(meetingRow, "owner-1", true);
  });

  it("transcript is host/manager only", async () => {
    mocks.loadMeetingForBot.mockResolvedValue({ ok: true, meeting: { ...meetingRow, hostUserId: "x" }, viewerIsHost: false });
    const res = await get("/meetings/m-1/transcript");
    expect(res.status).toBe(403);
    expect(mocks.getTranscriptPageForBot).not.toHaveBeenCalled();
  });

  it("transcript pages with the cursor and never leaks room secrets", async () => {
    const since = encodeBotDeskCursor({ ts: "2026-11-17 07:05:00.5", id: "seg-9" });
    mocks.loadMeetingForBot.mockResolvedValue({ ok: true, meeting: meetingRow, viewerIsHost: true });
    mocks.getTranscriptPageForBot.mockResolvedValue({ segments: [{ id: "seg-10" }], nextCursor: "next", hasMore: true });
    const res = await get(`/meetings/m-1/transcript?since=${since}&limit=1`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain("INVITE_SHOULD_NEVER_LEAK");
    expect(body).not.toContain("ROOM_SHOULD_NEVER_LEAK");
    expect(JSON.parse(body)).toMatchObject({ minutesEnabled: true, nextCursor: "next", hasMore: true });
    expect(mocks.getTranscriptPageForBot).toHaveBeenCalledWith("m-1", { since, limit: 1 });
  });

  it("transcript says minutesEnabled=false instead of polling an empty table", async () => {
    mocks.loadMeetingForBot.mockResolvedValue({ ok: true, meeting: { ...meetingRow, minutesEnabled: false }, viewerIsHost: true });
    const res = await get("/meetings/m-1/transcript");
    expect(await res.json()).toMatchObject({ minutesEnabled: false, segments: [], nextCursor: null });
    expect(mocks.getTranscriptPageForBot).not.toHaveBeenCalled();
  });

  it("minutes: draft only for host/manager, approved for every eligible viewer", async () => {
    mocks.loadMeetingForBot.mockResolvedValueOnce({ ok: true, meeting: meetingRow, viewerIsHost: false });
    let body = await (await get("/meetings/m-1/minutes")).json();
    expect(body).toMatchObject({ minutesStatus: "draft", approved: false, minutes: null });

    mocks.loadMeetingForBot.mockResolvedValueOnce({ ok: true, meeting: meetingRow, viewerIsHost: true });
    body = await (await get("/meetings/m-1/minutes")).json();
    expect(body.minutes.summary).toBe("ملخص");

    mocks.loadMeetingForBot.mockResolvedValueOnce({
      ok: true,
      meeting: { ...meetingRow, minutesStatus: "approved", minutesApprovedAt: new Date("2026-11-17T09:00:00Z") },
      viewerIsHost: false,
    });
    body = await (await get("/meetings/m-1/minutes")).json();
    expect(body).toMatchObject({ approved: true, approvedAt: "2026-11-17T09:00:00.000Z" });
    expect(body.minutes.decisions).toEqual(["قرار"]);
  });
});
