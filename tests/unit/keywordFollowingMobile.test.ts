import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const session = { current: null as null | { userId: string } };
vi.mock("../../server/services/memberSessionService", () => ({
  verifyMemberBearer: vi.fn(async () => session.current),
}));

const followKeyword = vi.fn(async (_u: string, _k: string) => "tag-1");
const unfollowKeyword = vi.fn(async (_u: string, _k: string) => undefined);
const listFollowedKeywords = vi.fn(async (_u: string) => [{ tagId: "tag-1", name: "الهلال", articleCount: 3 }]);
vi.mock("../../server/services/keywordFollowService", async () => {
  const normalizeKeyword = (raw: unknown) => {
    if (typeof raw !== "string") return null;
    const k = raw.replace(/\s+/g, " ").trim();
    return k.length > 0 && k.length <= 80 ? k : null;
  };
  return { followKeyword, unfollowKeyword, listFollowedKeywords, normalizeKeyword, KEYWORD_SYNC_MAX: 3 };
});

let server: Server;
let base = "";

beforeAll(async () => {
  const router = (await import("../../server/routes/keywordFollowingMobile")).default;
  const app = express();
  app.use(express.json());
  app.use(router);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());
beforeEach(() => {
  session.current = { userId: "u1" };
  vi.clearAllMocks();
});

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("v1 keyword following", () => {
  it("يرفض بلا جلسة", async () => {
    session.current = null;
    const res = await fetch(base + "/api/v1/keywords/followed");
    expect(res.status).toBe(401);
    expect(listFollowedKeywords).not.toHaveBeenCalled();
  });

  it("يرجّع القائمة بلا كاش", async () => {
    const res = await fetch(base + "/api/v1/keywords/followed");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ keywords: [{ tagId: "tag-1", name: "الهلال", articleCount: 3 }] });
  });

  it("يتابع بالاسم بعد التوحيد ويرفض الفارغ", async () => {
    expect((await post("/api/v1/keywords/follow", { keyword: "  رؤية   2030 " })).status).toBe(200);
    expect(followKeyword).toHaveBeenCalledWith("u1", "رؤية 2030");
    expect((await post("/api/v1/keywords/follow", { keyword: "   " })).status).toBe(400);
    expect((await post("/api/v1/keywords/unfollow", {})).status).toBe(400);
  });

  it("المزامنة تزيل المكرر وتحترم السقف ثم ترجّع القائمة", async () => {
    const res = await post("/api/v1/keywords/sync", { keywords: ["أ", "أ ", 7, "ب", "ج", "د"] });
    expect(res.status).toBe(200);
    expect(followKeyword.mock.calls.map((c) => c[1])).toEqual(["أ", "ب", "ج"]);
    expect((await res.json()).keywords).toHaveLength(1);
  });
});
