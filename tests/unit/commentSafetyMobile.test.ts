import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

const session = { current: { userId: "reader-1" } as { userId: string } | null };
const reportComment = vi.fn();
const blockUser = vi.fn();
const unblockUser = vi.fn();
const listBlockedUsers = vi.fn();
const removeBlocksByUser = vi.fn();
const checkText = vi.fn();
const prepareAppleRevocation = vi.fn();
const revokeAppleToken = vi.fn();

vi.mock("../../server/services/memberSessionService", () => ({
  verifyMemberBearer: async () => session.current,
}));
vi.mock("../../server/services/commentSafetyService", () => ({
  COMMENT_REPORT_REASONS: ["offensive", "harassment", "spam", "misinformation", "other"],
  reportComment: (...args: unknown[]) => reportComment(...args),
  blockUser: (...args: unknown[]) => blockUser(...args),
  unblockUser: (...args: unknown[]) => unblockUser(...args),
  listBlockedUsers: (...args: unknown[]) => listBlockedUsers(...args),
  removeBlocksByUser: (...args: unknown[]) => removeBlocksByUser(...args),
}));
vi.mock("../../server/utils/suspiciousWordsChecker", () => ({
  checkTextForSuspiciousWords: (...args: unknown[]) => checkText(...args),
}));
vi.mock("../../server/services/appleTokenRevocation", () => ({
  appleClientIds: () => ["com.sabq.sabqorg", "com.sabq.sports"],
  getUserAppleId: async () => "apple-sub-1",
  prepareAppleRevocation: (...args: unknown[]) => prepareAppleRevocation(...args),
  revokeAppleToken: (...args: unknown[]) => revokeAppleToken(...args),
}));

const { default: safetyRouter } = await import("../../server/routes/commentSafetyMobile");
const { default: hooksRouter } = await import("../../server/routes/mobileAccountHooks");

describe("comment safety + account hooks (Apple 1.2 / 5.1.1(v))", () => {
  let server: Server;
  let origin: string;
  const downstream = vi.fn();

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(safetyRouter);
    app.use("/api/v1", hooksRouter);
    // يمثل mobileApiRoutes: يصل إليه الطلب بعد الخطاف.
    app.delete("/api/v1/members/account", (req, res) => {
      downstream("delete", req.body);
      res.status(req.body?.fail ? 400 : 200).json({ success: !req.body?.fail });
    });
    app.put("/api/v1/members/profile", (req, res) => {
      downstream("profile", req.body);
      res.json({ success: true });
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    origin = `http://127.0.0.1:${address.port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  beforeEach(() => {
    session.current = { userId: "reader-1" };
    vi.clearAllMocks();
  });

  const send = (method: string, path: string, body?: unknown) =>
    fetch(origin + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("requires a session to report", async () => {
    session.current = null;
    const res = await send("POST", "/api/v1/comments/c1/report", { reason: "spam" });
    expect(res.status).toBe(401);
    expect(reportComment).not.toHaveBeenCalled();
  });

  it("rejects unknown report reasons", async () => {
    const res = await send("POST", "/api/v1/comments/c1/report", { reason: "boring" });
    expect(res.status).toBe(400);
    expect(reportComment).not.toHaveBeenCalled();
  });

  it("records a report for the signed-in reader", async () => {
    reportComment.mockResolvedValue({ ok: true, alreadyReported: false });
    const res = await send("POST", "/api/v1/comments/c1/report", { reason: "offensive", details: "شتيمة" });
    expect(res.status).toBe(200);
    expect(reportComment).toHaveBeenCalledWith({
      commentId: "c1",
      reporterId: "reader-1",
      reason: "offensive",
      details: "شتيمة",
    });
  });

  it("maps report refusals to status codes", async () => {
    reportComment.mockResolvedValueOnce({ ok: false, code: "own_comment" });
    expect((await send("POST", "/api/v1/comments/c1/report", { reason: "spam" })).status).toBe(400);
    reportComment.mockResolvedValueOnce({ ok: false, code: "rate_limited" });
    expect((await send("POST", "/api/v1/comments/c1/report", { reason: "spam" })).status).toBe(429);
    reportComment.mockResolvedValueOnce({ ok: false, code: "not_found" });
    expect((await send("POST", "/api/v1/comments/c1/report", { reason: "spam" })).status).toBe(404);
  });

  it("blocks, lists and unblocks for the session user only", async () => {
    blockUser.mockResolvedValue({ ok: true });
    listBlockedUsers.mockResolvedValue([{ id: "troll", name: "x", profileImageUrl: null, blockedAt: "t" }]);
    expect((await send("POST", "/api/v1/members/blocks", { userId: "troll" })).status).toBe(200);
    expect(blockUser).toHaveBeenCalledWith("reader-1", "troll");
    const list = await (await send("GET", "/api/v1/members/blocks")).json();
    expect(list.users).toHaveLength(1);
    expect((await send("DELETE", "/api/v1/members/blocks/troll")).status).toBe(200);
    expect(unblockUser).toHaveBeenCalledWith("reader-1", "troll");
  });

  it("refuses to block yourself", async () => {
    blockUser.mockResolvedValue({ ok: false, code: "self" });
    expect((await send("POST", "/api/v1/members/blocks", { userId: "reader-1" })).status).toBe(400);
  });

  it("revokes the Apple token only after the account is actually deleted", async () => {
    const prepared = { clientID: "com.sabq.sabqorg", refreshToken: "r" };
    prepareAppleRevocation.mockResolvedValue(prepared);
    revokeAppleToken.mockResolvedValue(true);

    const res = await send("DELETE", "/api/v1/members/account", { appleAuthorizationCode: "code", appleClientId: "com.sabq.sabqorg" });
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(revokeAppleToken).toHaveBeenCalledWith(prepared));
    expect(prepareAppleRevocation).toHaveBeenCalledWith({
      authorizationCode: "code",
      clientID: "com.sabq.sabqorg",
      expectedAppleId: "apple-sub-1",
    });
    expect(removeBlocksByUser).toHaveBeenCalledWith("reader-1");
    expect(downstream).toHaveBeenCalledWith("delete", expect.objectContaining({ appleAuthorizationCode: "code" }));
  });

  it("does not revoke when deletion fails, and ignores unknown client ids", async () => {
    prepareAppleRevocation.mockResolvedValue({ clientID: "com.sabq.sabqorg", refreshToken: "r" });
    const res = await send("DELETE", "/api/v1/members/account", { appleAuthorizationCode: "code", appleClientId: "evil.app", fail: true });
    expect(res.status).toBe(400);
    expect(prepareAppleRevocation).toHaveBeenCalledWith(expect.objectContaining({ clientID: "com.sabq.sabqorg" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(revokeAppleToken).not.toHaveBeenCalled();
    expect(removeBlocksByUser).not.toHaveBeenCalled();
  });

  it("deletes without Apple when no authorization code is sent", async () => {
    const res = await send("DELETE", "/api/v1/members/account", {});
    expect(res.status).toBe(200);
    expect(prepareAppleRevocation).not.toHaveBeenCalled();
  });

  it("rejects profile names that hit the banned-words filter before saving", async () => {
    checkText.mockResolvedValue({ hasSuspiciousWords: true, foundWords: [{ word: "x" }] });
    const res = await send("PUT", "/api/v1/members/profile", { firstName: "اسم", lastName: "مسيء" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("PROFILE_TEXT_REJECTED");
    expect(downstream).not.toHaveBeenCalled();
  });

  it("passes clean profile updates and non-text updates through", async () => {
    checkText.mockResolvedValue({ hasSuspiciousWords: false, foundWords: [] });
    expect((await send("PUT", "/api/v1/members/profile", { firstName: "أحمد" })).status).toBe(200);
    expect((await send("PUT", "/api/v1/members/profile", { city: "الرياض" })).status).toBe(200);
    expect(checkText).toHaveBeenCalledTimes(1);
    expect(downstream).toHaveBeenCalledTimes(2);
  });
});
