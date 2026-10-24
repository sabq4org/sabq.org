import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSION_CODES } from "../../shared/rbac-constants";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  authenticatePublisherToken: vi.fn(),
  canUserViewOpinionDesk: vi.fn(),
  userHasPermission: vi.fn(),
  logActivity: vi.fn(),
  listOpinionTickets: vi.fn(),
  getOpinionTicketWithMessages: vi.fn(),
  appendOpinionTicketMessage: vi.fn(),
  updateOpinionTicketStatus: vi.fn(),
  listPendingSocialProposalsForDesk: vi.fn(),
  getPost: vi.fn(),
  getPostAttempts: vi.fn(),
  cancelPost: vi.fn(),
  claimPostForImmediatePublish: vi.fn(),
  publishClaimedPost: vi.fn(),
  schedulePost: vi.fn(),
  sendEmailNotification: vi.fn(),
  createNotification: vi.fn(),
  realAppendOpinionTicketMessage: undefined as
    | typeof import("../../server/services/opinionTicketsService").appendOpinionTicketMessage
    | undefined,
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

vi.mock("../../server/services/opinionTicketsService", async () => {
  const actual = await vi.importActual<typeof import("../../server/services/opinionTicketsService")>(
    "../../server/services/opinionTicketsService",
  );
  mocks.realAppendOpinionTicketMessage = actual.appendOpinionTicketMessage;
  return {
    ...actual,
    canUserViewOpinionDesk: (...args: unknown[]) => mocks.canUserViewOpinionDesk(...args),
    listOpinionTickets: (...args: unknown[]) => mocks.listOpinionTickets(...args),
    getOpinionTicketWithMessages: (...args: unknown[]) => mocks.getOpinionTicketWithMessages(...args),
    appendOpinionTicketMessage: (...args: unknown[]) => mocks.appendOpinionTicketMessage(...args),
    updateOpinionTicketStatus: (...args: unknown[]) => mocks.updateOpinionTicketStatus(...args),
  };
});

vi.mock("../../server/services/socialPublishing/socialPublishingService", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/services/socialPublishing/socialPublishingService")
  >("../../server/services/socialPublishing/socialPublishingService");
  return {
    ...actual,
    listPendingSocialProposalsForDesk: (...args: unknown[]) =>
      mocks.listPendingSocialProposalsForDesk(...args),
    getPost: (...args: unknown[]) => mocks.getPost(...args),
    getPostAttempts: (...args: unknown[]) => mocks.getPostAttempts(...args),
    cancelPost: (...args: unknown[]) => mocks.cancelPost(...args),
    claimPostForImmediatePublish: (...args: unknown[]) =>
      mocks.claimPostForImmediatePublish(...args),
    publishClaimedPost: (...args: unknown[]) => mocks.publishClaimedPost(...args),
    schedulePost: (...args: unknown[]) => mocks.schedulePost(...args),
  };
});

vi.mock("../../server/services/email", () => ({
  sendEmailNotification: (...args: unknown[]) => mocks.sendEmailNotification(...args),
}));

vi.mock("../../server/storage", () => ({
  storage: {
    createNotification: (...args: unknown[]) => mocks.createNotification(...args),
  },
}));

import botDeskRouter from "../../server/routes/botDesk";
import { isCsrfExemptRequest } from "../../server/csrf";
import { OpinionTicketServiceError } from "../../server/services/opinionTicketsService";
import {
  AGENCY_SOCIAL_DEFAULT_ALERT_EMAIL,
  buildDeskAlertHeader,
  buildDeskSocialProposalAlertEmail,
  buildDeskTicketAlertEmail,
  isMeaningfulProposalTextChange,
  resolveAgencySocialAlertRecipients,
  resolveDeskBotAlertRecipients,
} from "../../server/services/deskBotAlerts";
import { notifyDeskOfWriterInquiry } from "../../server/services/opinionTicketNotifications";

const VALID_CREDENTIAL = "botpub_valid_personal_credential";
const REVOKED_CREDENTIAL = "botpub_revoked_personal_credential";
const EXPIRED_CREDENTIAL = "botpub_expired_personal_credential";
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
  vi.stubEnv("BOT_DESK_PUBLISH_RATE_LIMIT", "1000");
  vi.stubEnv("DESK_BOT_ALERT_EMAILS", "");
  for (const fn of Object.values(mocks)) {
    if (fn && typeof (fn as { mockReset?: () => void }).mockReset === "function") {
      (fn as { mockReset: () => void }).mockReset();
    }
  }

  mocks.authenticatePublisherToken.mockImplementation(async (raw: string) => {
    if (raw === VALID_CREDENTIAL) return OWNER_PRINCIPAL;
    return null;
  });
  mocks.canUserViewOpinionDesk.mockResolvedValue(true);
  mocks.userHasPermission.mockResolvedValue(true);
  mocks.logActivity.mockResolvedValue(undefined);
  mocks.sendEmailNotification.mockResolvedValue({ success: true });
  mocks.createNotification.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Bot Desk API — Auth & RBAC", () => {
  it("exempts /api/internal/bot-desk/* from CSRF checks", () => {
    expect(
      isCsrfExemptRequest(
        "POST",
        "/internal/bot-desk/tickets/t-1/reply",
        "/api/internal/bot-desk/tickets/t-1/reply",
      ),
    ).toBe(true);
    expect(
      isCsrfExemptRequest(
        "POST",
        "/internal/bot-desk/social/posts/p-1/publish",
        "/api/internal/bot-desk/social/posts/p-1/publish",
      ),
    ).toBe(true);
  });

  it("rejects missing, non-botpub, revoked, and expired tokens with 401", async () => {
    const missing = await call("GET", "/api/internal/bot-desk/tickets", undefined, null);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("Bearer");
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
    expect((await missing.json()).code).toBe("unauthorized");

    const nonBotpub = await call(
      "GET",
      "/api/internal/bot-desk/tickets",
      undefined,
      NON_BOTPUB_CREDENTIAL,
    );
    expect(nonBotpub.status).toBe(401);
    expect(mocks.authenticatePublisherToken).not.toHaveBeenCalled();

    const revoked = await call(
      "GET",
      "/api/internal/bot-desk/tickets",
      undefined,
      REVOKED_CREDENTIAL,
    );
    expect(revoked.status).toBe(401);
    expect((await revoked.json()).code).toBe("unauthorized");

    const expired = await call(
      "GET",
      "/api/internal/bot-desk/social/pending",
      undefined,
      EXPIRED_CREDENTIAL,
    );
    expect(expired.status).toBe(401);
    expect((await expired.json()).code).toBe("unauthorized");
  });

  it("returns 403 when token owner is not an opinion desk viewer on ticket routes", async () => {
    mocks.canUserViewOpinionDesk.mockResolvedValue(false);

    const res = await call("GET", "/api/internal/bot-desk/tickets");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("forbidden");
    expect(mocks.listOpinionTickets).not.toHaveBeenCalled();
  });

  it("enforces granular social_publish.* permissions on social routes (403 when insufficient)", async () => {
    mocks.userHasPermission.mockImplementation(async (_userId: string, perm: string) => {
      return perm === PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG;
    });
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue([]);

    // Has VIEW_LOG -> 200
    const viewRes = await call("GET", "/api/internal/bot-desk/social/pending");
    expect(viewRes.status).toBe(200);

    // Lacks SOCIAL_PUBLISH_NOW -> 403
    const pubRes = await call("POST", "/api/internal/bot-desk/social/posts/post-1/publish", {});
    expect(pubRes.status).toBe(403);
    expect((await pubRes.json()).code).toBe("forbidden");

    // Lacks SOCIAL_PUBLISH_SCHEDULE -> 403
    const schedRes = await call("POST", "/api/internal/bot-desk/social/posts/post-1/schedule", {
      scheduledAt: "2026-10-25T18:00:00+03:00",
    });
    expect(schedRes.status).toBe(403);

    // Lacks MANAGE_SCHEDULED and CREATE -> 403
    const rejRes = await call("POST", "/api/internal/bot-desk/social/posts/post-1/reject", {
      reason: "سبب",
    });
    expect(rejRes.status).toBe(403);
  });
});

describe("Bot Desk API — Tickets", () => {
  it("lists tickets with filters and returns writer details and latest excerpt", async () => {
    mocks.listOpinionTickets.mockResolvedValue([
      {
        id: "t-100",
        writerId: "w-1",
        writerName: "د. خالد العتيبي",
        writerEmail: "khalid@example.com",
        authorKind: "opinion_author",
        writer: {
          id: "w-1",
          name: "د. خالد العتيبي",
          email: "khalid@example.com",
          authorKind: "opinion_author",
          roleKind: "opinion_author",
        },
        title: "استفسار عن موعد نشر المقال",
        status: "open",
        direction: "inbound",
        lastMessageAt: "2026-10-24T15:00:00.000Z",
        last_message_at: "2026-10-24T15:00:00.000Z",
        hasUnread: true,
        latestMessageExcerpt: "متى يُنشر مقالي الأسبوعي؟",
        latest_message_excerpt: "متى يُنشر مقالي الأسبوعي؟",
      },
    ]);

    const res = await call(
      "GET",
      "/api/internal/bot-desk/tickets?status=open&authorKind=opinion_author&unread=true&limit=10",
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tickets).toHaveLength(1);
    expect(body.tickets[0]).toMatchObject({
      id: "t-100",
      title: "استفسار عن موعد نشر المقال",
      status: "open",
      writerName: "د. خالد العتيبي",
      writerEmail: "khalid@example.com",
      authorKind: "opinion_author",
      hasUnread: true,
      latestMessageExcerpt: "متى يُنشر مقالي الأسبوعي؟",
    });
    expect(mocks.listOpinionTickets).toHaveBeenCalledWith({
      viewerId: OWNER_PRINCIPAL.userId,
      isAdmin: true,
      status: "open",
      authorKind: "opinion_author",
      unread: true,
      limit: 10,
    });
  });

  it("gets full ticket thread with ISO timestamps and sender fields", async () => {
    mocks.getOpinionTicketWithMessages.mockResolvedValue({
      ticket: {
        id: "t-100",
        title: "استفسار",
        status: "open",
        writerName: "د. خالد",
        writerEmail: "khalid@example.com",
        authorKind: "opinion_author",
        last_message_at: "2026-10-24T15:00:00.000Z",
      },
      messages: [
        {
          id: "m-1",
          ticketId: "t-100",
          senderId: "w-1",
          senderName: "د. خالد",
          senderRole: "writer",
          role: "writer",
          text: "نص الرسالة الكاملة",
          message: "نص الرسالة الكاملة",
          createdAt: "2026-10-24T15:00:00.000Z",
          created_at: "2026-10-24T15:00:00.000Z",
        },
      ],
    });

    const res = await call("GET", "/api/internal/bot-desk/tickets/t-100");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket.id).toBe("t-100");
    expect(body.messages[0]).toMatchObject({
      senderName: "د. خالد",
      role: "writer",
      text: "نص الرسالة الكاملة",
      created_at: "2026-10-24T15:00:00.000Z",
    });
  });

  it("replies as the token owner, transitions open -> answered, and audits without raw token", async () => {
    const now = new Date("2026-10-24T16:00:00.000Z");
    mocks.appendOpinionTicketMessage.mockResolvedValue({
      message: {
        id: "msg-reply-1",
        ticketId: "t-100",
        senderId: OWNER_PRINCIPAL.userId,
        senderRole: "admin",
        message: "تمت جدولة مقالكم ليوم غد بإذن الله.",
        parentMessageId: null,
        createdAt: now,
      },
      previousStatus: "open",
      status: "answered",
    });

    const res = await call("POST", "/api/internal/bot-desk/tickets/t-100/reply", {
      message: "تمت جدولة مقالكم ليوم غد بإذن الله.",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("answered");
    expect(body.message).toMatchObject({
      id: "msg-reply-1",
      senderId: OWNER_PRINCIPAL.userId,
      role: "admin",
      text: "تمت جدولة مقالكم ليوم غد بإذن الله.",
      created_at: "2026-10-24T16:00:00.000Z",
    });

    expect(mocks.appendOpinionTicketMessage).toHaveBeenCalledWith({
      ticketId: "t-100",
      senderId: OWNER_PRINCIPAL.userId,
      isAdmin: true,
      message: "تمت جدولة مقالكم ليوم غد بإذن الله.",
      parentMessageId: null,
      forceAdminRole: true,
    });

    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
    const auditCall = mocks.logActivity.mock.calls[0][0];
    expect(auditCall).toMatchObject({
      userId: OWNER_PRINCIPAL.userId,
      action: "ticket_reply",
      entityType: "opinion_ticket",
      entityId: "t-100",
      oldValue: { status: "open" },
      newValue: { status: "answered", messageId: "msg-reply-1" },
      metadata: expect.objectContaining({
        channel: "bot-desk-api",
        tokenId: OWNER_PRINCIPAL.tokenId,
        tokenPrefix: OWNER_PRINCIPAL.tokenPrefix,
        tokenLabel: OWNER_PRINCIPAL.label,
      }),
    });
    expect(JSON.stringify(auditCall)).not.toContain(VALID_CREDENTIAL);
  });

  it("returns 400 when replying to a closed ticket", async () => {
    mocks.appendOpinionTicketMessage.mockRejectedValue(
      new OpinionTicketServiceError(400, "ticket_closed", "تم إغلاق هذا الاستفسار"),
    );

    const res = await call("POST", "/api/internal/bot-desk/tickets/t-closed/reply", {
      message: "محاولة رد على تذكرة مغلقة",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("ticket_closed");
    expect(body.message).toContain("إغلاق");
    expect(mocks.logActivity).not.toHaveBeenCalled();
  });

  it("updates ticket status and validates status enum with Zod", async () => {
    mocks.updateOpinionTicketStatus.mockResolvedValue({
      id: "t-100",
      status: "closed",
    });

    const okRes = await call("PATCH", "/api/internal/bot-desk/tickets/t-100/status", {
      status: "closed",
    });
    expect(okRes.status).toBe(200);
    expect((await okRes.json()).ticket.status).toBe("closed");
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ticket_status_update",
        entityType: "opinion_ticket",
        entityId: "t-100",
      }),
    );

    const badRes = await call("PATCH", "/api/internal/bot-desk/tickets/t-100/status", {
      status: "invalid_status",
    });
    expect(badRes.status).toBe(400);
    expect((await badRes.json()).code).toBe("validation_error");
  });

  it("service appendOpinionTicketMessage transitions open -> answered on admin reply and rejects closed tickets with 400", async () => {
    // 1) Open ticket -> transitions to answered, updates lastReadByAdminAt
    mocks.dbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: "t-open-1",
                writerId: "writer-user-1",
                title: "استفسار",
                status: "open",
              },
            ]),
        }),
      }),
    });

    mocks.dbInsert.mockReturnValueOnce({
      values: (val: Record<string, unknown>) => {
        expect(val.senderRole).toBe("admin");
        expect(val.senderId).toBe(OWNER_PRINCIPAL.userId);
        return {
          returning: () =>
            Promise.resolve([
              {
                id: "m-new-1",
                ticketId: "t-open-1",
                senderId: OWNER_PRINCIPAL.userId,
                senderRole: "admin",
                message: "تم الرد",
                createdAt: new Date("2026-10-24T17:00:00.000Z"),
              },
            ]),
        };
      },
    });

    let updatedTicketFields: Record<string, unknown> | undefined;
    mocks.dbUpdate.mockReturnValueOnce({
      set: (fields: Record<string, unknown>) => {
        updatedTicketFields = fields;
        return {
          where: () => Promise.resolve(),
        };
      },
    });

    const replyOutcome = await mocks.realAppendOpinionTicketMessage!({
      ticketId: "t-open-1",
      senderId: OWNER_PRINCIPAL.userId,
      isAdmin: true,
      message: "تم الرد",
      forceAdminRole: true,
    });

    expect(replyOutcome.previousStatus).toBe("open");
    expect(replyOutcome.status).toBe("answered");
    expect(updatedTicketFields).toMatchObject({
      status: "answered",
      lastReadByAdminAt: expect.any(Date),
    });

    // 2) Closed ticket -> throws 400 ticket_closed
    mocks.dbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: "t-closed-1",
                writerId: "writer-user-1",
                title: "مغلق",
                status: "closed",
              },
            ]),
        }),
      }),
    });

    await expect(
      mocks.realAppendOpinionTicketMessage!({
        ticketId: "t-closed-1",
        senderId: OWNER_PRINCIPAL.userId,
        isAdmin: true,
        message: "رد بعد الإغلاق",
        forceAdminRole: true,
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "ticket_closed",
    });
  });
});

describe("Bot Desk API — Social Proposals (created by other users)", () => {
  const otherUsersDraftPost = {
    id: "social-post-99",
    articleId: "art-opinion-55",
    platform: "x",
    status: "draft",
    text: "مقترح تغريدة من كاتب المقال حول التحول الرقمي",
    textSource: "custom",
    linkUrl: "https://sabq.org/article/digital-transform",
    createdByUserId: "writer-user-777",
    publisherId: null,
  };

  it("lists pending author and agency social proposals", async () => {
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue([
      {
        id: "social-post-99",
        status: "draft",
        kind: "author",
        text: otherUsersDraftPost.text,
        authorName: "أ. سارة القحطاني",
        agencyName: null,
        proposerName: "أ. سارة القحطاني",
        article: {
          id: "art-opinion-55",
          title: "التحول الرقمي في المملكة",
          url: "https://sabq.org/article/digital-transform",
          imageUrl: null,
        },
        createdAt: "2026-10-24T12:00:00.000Z",
        created_at: "2026-10-24T12:00:00.000Z",
      },
    ]);

    const res = await call("GET", "/api/internal/bot-desk/social/pending?kind=author");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0]).toMatchObject({
      id: "social-post-99",
      authorName: "أ. سارة القحطاني",
      article: {
        title: "التحول الرقمي في المملكة",
        url: "https://sabq.org/article/digital-transform",
      },
      created_at: "2026-10-24T12:00:00.000Z",
    });
    expect(mocks.listPendingSocialProposalsForDesk).toHaveBeenCalledWith("author", 50);
  });

  it("rejects (cancels) another user's draft proposal with optional reason and audits", async () => {
    mocks.getPost.mockResolvedValue(otherUsersDraftPost);
    mocks.cancelPost.mockResolvedValue({
      ...otherUsersDraftPost,
      status: "canceled",
      canceledByUserId: OWNER_PRINCIPAL.userId,
      lastError: "النص يحتاج اختصاراً",
    });

    const res = await call("POST", "/api/internal/bot-desk/social/posts/social-post-99/reject", {
      reason: "النص يحتاج اختصاراً",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.post.status).toBe("canceled");
    expect(mocks.cancelPost).toHaveBeenCalledWith(
      "social-post-99",
      OWNER_PRINCIPAL.userId,
      "النص يحتاج اختصاراً",
    );
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "social_post_reject",
        entityType: "social_post",
        entityId: "social-post-99",
      }),
    );
  });

  it("schedules another user's draft proposal and enforces ISO datetime with offset", async () => {
    mocks.getPost.mockResolvedValue(otherUsersDraftPost);
    mocks.schedulePost.mockResolvedValue({
      ...otherUsersDraftPost,
      status: "scheduled",
      scheduledAt: new Date("2026-10-25T19:30:00+03:00"),
    });

    const okRes = await call(
      "POST",
      "/api/internal/bot-desk/social/posts/social-post-99/schedule",
      { scheduledAt: "2026-10-25T19:30:00+03:00" },
    );
    expect(okRes.status).toBe(200);
    expect((await okRes.json()).post.status).toBe("scheduled");
    expect(mocks.schedulePost).toHaveBeenCalledWith(
      "social-post-99",
      new Date("2026-10-25T19:30:00+03:00"),
      { resetAttempts: true },
    );

    // Missing timezone offset -> 400 validation_error
    const badRes = await call(
      "POST",
      "/api/internal/bot-desk/social/posts/social-post-99/schedule",
      { scheduledAt: "2026-10-25T19:30:00" },
    );
    expect(badRes.status).toBe(400);
    expect((await badRes.json()).code).toBe("validation_error");
  });

  it("claims and publishes another user's draft proposal, returning 409 when already claimed/published", async () => {
    const claimedPost = { ...otherUsersDraftPost, status: "processing", attempts: 1 };
    const publishedPost = {
      ...otherUsersDraftPost,
      status: "published",
      publishedByUserId: OWNER_PRINCIPAL.userId,
      externalPostUrl: "https://x.com/sabqorg/status/12345",
    };

    mocks.claimPostForImmediatePublish.mockResolvedValueOnce(claimedPost);
    mocks.publishClaimedPost.mockResolvedValueOnce(publishedPost);

    const res = await call(
      "POST",
      "/api/internal/bot-desk/social/posts/social-post-99/publish",
      {},
    );
    expect(res.status).toBe(200);
    expect((await res.json()).post).toMatchObject({
      id: "social-post-99",
      status: "published",
      externalPostUrl: "https://x.com/sabqorg/status/12345",
    });
    expect(mocks.publishClaimedPost).toHaveBeenCalledWith(
      claimedPost,
      OWNER_PRINCIPAL.userId,
    );

    // Second attempt: claim returns null, getPost returns published -> 409
    mocks.claimPostForImmediatePublish.mockResolvedValueOnce(null);
    mocks.getPost.mockResolvedValueOnce(publishedPost);

    const conflict = await call(
      "POST",
      "/api/internal/bot-desk/social/posts/social-post-99/publish",
      {},
    );
    expect(conflict.status).toBe(409);
    const conflictBody = await conflict.json();
    expect(conflictBody.code).toBe("conflict");
    expect(conflictBody.post.status).toBe("published");
  });
});

describe("Desk Bot Alerts — Recipient Resolution & Machine-Parseable Headers", () => {
  it("resolves extra recipients with and without DESK_BOT_ALERT_EMAILS env and settings", () => {
    expect(resolveDeskBotAlertRecipients({ env: "", settingEmails: [] })).toEqual([]);

    expect(
      resolveDeskBotAlertRecipients({
        env: "sohba@mail.grokbot.com, Desk@Sabq.org , sohba@mail.grokbot.com",
        settingEmails: ["desk@sabq.org", "extra@sabq.org"],
      }),
    ).toEqual(["desk@sabq.org", "extra@sabq.org", "sohba@mail.grokbot.com"]);
  });

  it("keeps aalhazmi@sabq.org as default/fallback for agency alerts with and without env", () => {
    expect(resolveAgencySocialAlertRecipients({ env: "" })).toEqual([
      AGENCY_SOCIAL_DEFAULT_ALERT_EMAIL,
    ]);

    expect(
      resolveAgencySocialAlertRecipients({
        env: "sohba@mail.grokbot.com",
      }),
    ).toEqual(["aalhazmi@sabq.org", "sohba@mail.grokbot.com"]);
  });

  it("builds stable machine-parseable lines for tickets and social proposals with Riyadh time", () => {
    const occurredAt = new Date("2026-10-24T15:30:00.000Z"); // 18:30 in Asia/Riyadh

    const ticketEmail = buildDeskTicketAlertEmail({
      ticketId: "ticket-abc-123",
      kind: "new_ticket",
      title: "سؤال عن موعد النشر",
      senderName: "د. سعد",
      senderRole: "opinion_author",
      message: "هل يمكن نشر المقال صباح الأحد؟",
      deeplinkUrl: "https://sabq.org/dashboard/opinion-tickets/ticket-abc-123",
      occurredAt,
    });

    expect(ticketEmail.header).toBe("[sabq-desk] type=ticket id=ticket-abc-123");
    expect(ticketEmail.subject).toContain("[sabq-desk] type=ticket id=ticket-abc-123");
    expect(ticketEmail.text).toContain("[sabq-desk] type=ticket id=ticket-abc-123");
    expect(ticketEmail.text).toContain("sender: د. سعد");
    expect(ticketEmail.text).toContain("role: opinion_author");
    expect(ticketEmail.text).toContain("2026-10-24 18:30:00 Asia/Riyadh");
    expect(ticketEmail.text).toContain("excerpt: هل يمكن نشر المقال صباح الأحد؟");

    const socialEmail = buildDeskSocialProposalAlertEmail({
      postId: "post-xyz-789",
      proposalKind: "author",
      senderName: "أ. نورة",
      senderRole: "opinion_author",
      text: "قراءة في مستهدفات التحول الوطني ومستقبل الاقتصاد المعرفي",
      articleTitle: "مستقبل الاقتصاد المعرفي",
      articleUrl: "https://sabq.org/article/knowledge-economy",
      occurredAt,
    });

    expect(socialEmail.header).toBe("[sabq-desk] type=social_proposal id=post-xyz-789");
    expect(socialEmail.subject).toContain("[sabq-desk] type=social_proposal id=post-xyz-789");
    expect(socialEmail.text).toContain("[sabq-desk] type=social_proposal id=post-xyz-789");
    expect(socialEmail.text).toContain("sender: أ. نورة");
    expect(socialEmail.text).toContain("role: opinion_author");
    expect(socialEmail.text).toContain("2026-10-24 18:30:00 Asia/Riyadh");
    expect(socialEmail.text).toContain(
      "excerpt: قراءة في مستهدفات التحول الوطني ومستقبل الاقتصاد المعرفي",
    );
  });

  it("detects meaningful proposal text changes vs spam/whitespace-only repeats", () => {
    expect(isMeaningfulProposalTextChange(null, "نص جديد")).toBe(true);
    expect(isMeaningfulProposalTextChange("نص أول", "نص مختلف")).toBe(true);
    expect(isMeaningfulProposalTextChange("نص   نفسه", "  نص نفسه  ")).toBe(false);
    expect(buildDeskAlertHeader({ type: "ticket", id: "123" })).toBe(
      "[sabq-desk] type=ticket id=123",
    );
  });

  it("sends ticket inquiry email to DESK_BOT_ALERT_EMAILS even when no superuser rows are returned", async () => {
    vi.stubEnv("DESK_BOT_ALERT_EMAILS", "sohba@mail.grokbot.com");

    await notifyDeskOfWriterInquiry({
      kind: "new_ticket",
      ticketId: "t-bot-alert-1",
      title: "استفسار عاجل",
      writerName: "فهد الشمري",
      writerRole: "reporter",
      message: "أحتاج تأكيد استلام المادة",
      senderId: "writer-9",
      occurredAt: new Date("2026-10-24T12:00:00.000Z"),
    });

    expect(mocks.sendEmailNotification).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmailNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sohba@mail.grokbot.com",
        subject: expect.stringContaining("[sabq-desk] type=ticket id=t-bot-alert-1"),
        text: expect.stringContaining("[sabq-desk] type=ticket id=t-bot-alert-1"),
      }),
    );
  });
});
