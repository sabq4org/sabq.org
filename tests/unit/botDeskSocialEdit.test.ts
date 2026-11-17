import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSION_CODES } from "../../shared/rbac-constants";

// PATCH /api/internal/bot-desk/social/posts/:id — تعديل نص مقترح النشر قبل نشره.
// نفس عُدّة tests/unit/botDesk.test.ts: الموجّه الحقيقي، والخدمات مُحاكاة.

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  authenticatePublisherToken: vi.fn(),
  userHasPermission: vi.fn(),
  logActivity: vi.fn(),
  getPost: vi.fn(),
  cancelPost: vi.fn(),
  claimPostForImmediatePublish: vi.fn(),
  publishClaimedPost: vi.fn(),
  schedulePost: vi.fn(),
  updateDeskPostText: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
    insert: (...args: unknown[]) => mocks.dbInsert(...args),
    update: (...args: unknown[]) => mocks.dbUpdate(...args),
  },
}));

vi.mock("../../server/services/botPublisherTokenService", () => ({
  authenticatePublisherToken: (...args: unknown[]) => mocks.authenticatePublisherToken(...args),
}));

vi.mock("../../server/rbac", () => ({
  userHasPermission: (...args: unknown[]) => mocks.userHasPermission(...args),
  logActivity: (...args: unknown[]) => mocks.logActivity(...args),
}));

vi.mock("../../server/services/socialPublishing/socialPublishingService", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/services/socialPublishing/socialPublishingService")
  >("../../server/services/socialPublishing/socialPublishingService");
  return {
    ...actual,
    getPost: (...args: unknown[]) => mocks.getPost(...args),
    cancelPost: (...args: unknown[]) => mocks.cancelPost(...args),
    claimPostForImmediatePublish: (...args: unknown[]) =>
      mocks.claimPostForImmediatePublish(...args),
    publishClaimedPost: (...args: unknown[]) => mocks.publishClaimedPost(...args),
    schedulePost: (...args: unknown[]) => mocks.schedulePost(...args),
    updateDeskPostText: (...args: unknown[]) => mocks.updateDeskPostText(...args),
  };
});

import botDeskRouter from "../../server/routes/botDesk";
import { isCsrfExemptRequest } from "../../server/csrf";

const VALID_CREDENTIAL = "botpub_valid_personal_credential";
const NON_BOTPUB_CREDENTIAL = "legacy-shared-credential-placeholder";

const OWNER_PRINCIPAL = {
  userId: "desk-admin-user-1",
  tokenId: "tok-uuid-1",
  tokenPrefix: "botpub_valid_per",
  label: "sohba-desk-assistant",
  email: "desk-owner@sabq.org",
  name: "مسؤول الديسك",
  expiresAt: new Date("2027-01-01T00:00:00.000Z"),
  capabilities: ["read", "publish", "schedule"],
};

const app = express();
app.use(express.json());
app.use(botDeskRouter);
const server = createServer(app);
let base = "";

function call(
  method: string,
  path: string,
  body?: unknown,
  credential: string | null = VALID_CREDENTIAL,
) {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(() => {
  vi.stubEnv("BOT_DESK_WRITE_RATE_LIMIT", "1000");
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.authenticatePublisherToken.mockImplementation(async (raw: string) =>
    raw === VALID_CREDENTIAL ? OWNER_PRINCIPAL : null,
  );
  mocks.userHasPermission.mockResolvedValue(true);
  mocks.logActivity.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Bot Desk API — Social Proposal text edit (PATCH /social/posts/:id)", () => {
  const draft = {
    id: "social-post-77",
    articleId: "art-opinion-12",
    platform: "x",
    status: "draft",
    text: "نص فيه #وسم_مكسور وخطأ",
    textSource: "custom",
    linkUrl: "https://sabq.org/article/h218asr",
    imageSource: "article",
    imageUrl: "https://cdn.sabq.org/img.jpg",
    mediaKind: "none",
    mediaUrls: [],
    scheduledAt: null,
    createdByUserId: "writer-user-1",
    publisherId: null,
  };
  const path = "/api/internal/bot-desk/social/posts/social-post-77";

  it("edits only the text of a draft, returns X weighted length, audits, and never publishes", async () => {
    mocks.getPost.mockResolvedValue(draft);
    const newText = "  نص مصحح للتغريدة  ";
    mocks.updateDeskPostText.mockImplementation(async (_id: string, text: string) => ({
      ...draft,
      text: text.trim(),
    }));

    const res = await call("PATCH", path, { text: newText });
    expect(res.status).toBe(200);
    const body = await res.json();
    // "نص مصحح للتغريدة" = 16, + "\n" + link (23) = 40
    expect(body).toMatchObject({ xWeightedLength: 40, xLimit: 280, overLimit: false });
    expect(body.post).toMatchObject({
      text: "نص مصحح للتغريدة",
      status: "draft",
      linkUrl: draft.linkUrl,
      imageUrl: draft.imageUrl,
    });
    expect(mocks.updateDeskPostText).toHaveBeenCalledWith("social-post-77", "نص مصحح للتغريدة");
    expect(mocks.claimPostForImmediatePublish).not.toHaveBeenCalled();
    expect(mocks.publishClaimedPost).not.toHaveBeenCalled();
    expect(mocks.schedulePost).not.toHaveBeenCalled();
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "social_post_edit_text",
        entityType: "social_post",
        entityId: "social-post-77",
        oldValue: { status: "draft", text: draft.text },
        newValue: { status: "draft", text: "نص مصحح للتغريدة", xWeightedLength: 40 },
        metadata: expect.objectContaining({ channel: "bot-desk-api", tokenId: "tok-uuid-1" }),
      }),
    );
    expect(JSON.stringify(mocks.logActivity.mock.calls)).not.toContain(VALID_CREDENTIAL);
  });

  it("keeps a scheduled post scheduled with the same time and flags overLimit past 280", async () => {
    const scheduledAt = "2026-11-18T09:00:00.000Z";
    const scheduled = { ...draft, status: "scheduled", scheduledAt };
    mocks.getPost.mockResolvedValue(scheduled);
    mocks.updateDeskPostText.mockImplementation(async (_id: string, text: string) => ({
      ...scheduled,
      text,
    }));
    const longText = "ا".repeat(260);

    const res = await call("PATCH", path, { text: longText });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.xWeightedLength).toBe(260 + 1 + 23);
    expect(body.overLimit).toBe(true);
    expect(body.post).toMatchObject({ status: "scheduled", scheduledAt });
  });

  it("returns 409 for published, processing, failed and canceled posts without writing", async () => {
    for (const status of ["published", "processing", "failed", "canceled"]) {
      mocks.getPost.mockResolvedValueOnce({ ...draft, status });
      const res = await call("PATCH", path, { text: "نص جديد" });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe("conflict");
      expect(body.message).toContain(status);
      expect(body.post.status).toBe(status);
    }
    expect(mocks.updateDeskPostText).not.toHaveBeenCalled();
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it("returns 409 when the worker claims the post between read and write", async () => {
    mocks.getPost
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, status: "processing" });
    mocks.updateDeskPostText.mockResolvedValueOnce(null);
    const res = await call("PATCH", path, { text: "نص جديد" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("conflict");
    expect(body.post.status).toBe("processing");
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown post", async () => {
    mocks.getPost.mockResolvedValueOnce(null);
    const res = await call("PATCH", path, { text: "نص" });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("not_found");
    expect(mocks.updateDeskPostText).not.toHaveBeenCalled();
  });

  it("rejects empty/whitespace text, missing text and unknown fields with 400", async () => {
    for (const body of [{ text: "   " }, {}, { text: "نص", linkUrl: "https://x.com" }, { text: 5 }]) {
      const res = await call("PATCH", path, body);
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe("validation_error");
    }
    expect(mocks.getPost).not.toHaveBeenCalled();
    expect(mocks.updateDeskPostText).not.toHaveBeenCalled();
  });

  it("requires a botpub_ bearer token", async () => {
    const res = await call("PATCH", path, { text: "نص" }, null);
    expect(res.status).toBe(401);
    const legacy = await call("PATCH", path, { text: "نص" }, NON_BOTPUB_CREDENTIAL);
    expect(legacy.status).toBe(401);
  });

  it("is CSRF-exempt and requires social_publish.manage_scheduled or social_publish.create", async () => {
    expect(
      isCsrfExemptRequest(
        "PATCH",
        "/internal/bot-desk/social/posts/p-1",
        "/api/internal/bot-desk/social/posts/p-1",
      ),
    ).toBe(true);

    mocks.userHasPermission.mockImplementation(
      async (_userId: string, perm: string) => perm === PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG,
    );
    const denied = await call("PATCH", path, { text: "نص" });
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("forbidden");
    expect(mocks.updateDeskPostText).not.toHaveBeenCalled();

    mocks.userHasPermission.mockImplementation(
      async (_userId: string, perm: string) => perm === PERMISSION_CODES.SOCIAL_PUBLISH_CREATE,
    );
    mocks.getPost.mockResolvedValue(draft);
    mocks.updateDeskPostText.mockResolvedValue({ ...draft, text: "نص" });
    const allowed = await call("PATCH", path, { text: "نص" });
    expect(allowed.status).toBe(200);
  });
});
