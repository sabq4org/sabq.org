import { createServer } from "node:http";
import { DEFAULT_STAFF_ALERT_PREFS } from "@shared/staffApp";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSION_CODES } from "../../shared/rbac-constants";
import {
  STAFF_APP_AUDIT_CHANNEL,
  STAFF_APP_BUNDLE_ID,
  READER_APP_BUNDLE_ID,
} from "../../shared/staffApp";

const mocks = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  verifyMemberBearer: vi.fn(),
  canUserViewOpinionDesk: vi.fn(),
  userHasPermission: vi.fn(),
  getUserRoleNames: vi.fn(),
  invalidateUserPermissionCache: vi.fn(),
  logActivity: vi.fn(),
  listOpinionTickets: vi.fn(),
  getOpinionTicketsUnreadCounts: vi.fn(),
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
  returnPostToDraft: vi.fn(),
  sendEmailNotification: vi.fn(),
  createNotification: vi.fn(),
  sendPushToUserApp: vi.fn(),
  sendPushNotification: vi.fn(),
  isApnsConfigured: vi.fn(),
  listOpinionDeskRecipients: vi.fn(),
  getAllBalances: vi.fn(),
  getProviderBalance: vi.fn(),
  saveBalanceTopup: vi.fn(),
  saveBalanceThreshold: vi.fn(),
}));

vi.mock("../../server/services/aiBalanceService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/services/aiBalanceService")>();
  return {
    ...actual,
    getAllBalances: (...args: unknown[]) => mocks.getAllBalances(...args),
    getProviderBalance: (...args: unknown[]) => mocks.getProviderBalance(...args),
    saveBalanceTopup: (...args: unknown[]) => mocks.saveBalanceTopup(...args),
    saveBalanceThreshold: (...args: unknown[]) => mocks.saveBalanceThreshold(...args),
  };
});

vi.mock("../../server/db", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
    insert: (...args: unknown[]) => mocks.dbInsert(...args),
    update: (...args: unknown[]) => mocks.dbUpdate(...args),
  },
}));

vi.mock("../../server/services/memberSessionService", () => ({
  verifyMemberBearer: (...args: unknown[]) => mocks.verifyMemberBearer(...args),
}));

vi.mock("../../server/rbac", () => ({
  userHasPermission: (...args: unknown[]) => mocks.userHasPermission(...args),
  getUserRoleNames: (...args: unknown[]) => mocks.getUserRoleNames(...args),
  invalidateUserPermissionCache: (...args: unknown[]) =>
    mocks.invalidateUserPermissionCache(...args),
  logActivity: (...args: unknown[]) => mocks.logActivity(...args),
}));

vi.mock("../../server/services/opinionTicketsService", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/services/opinionTicketsService")
  >("../../server/services/opinionTicketsService");
  return {
    ...actual,
    canUserViewOpinionDesk: (...args: unknown[]) => mocks.canUserViewOpinionDesk(...args),
    listOpinionTickets: (...args: unknown[]) => mocks.listOpinionTickets(...args),
    getOpinionTicketsUnreadCounts: (...args: unknown[]) =>
      mocks.getOpinionTicketsUnreadCounts(...args),
    getOpinionTicketWithMessages: (...args: unknown[]) =>
      mocks.getOpinionTicketWithMessages(...args),
    appendOpinionTicketMessage: (...args: unknown[]) =>
      mocks.appendOpinionTicketMessage(...args),
    updateOpinionTicketStatus: (...args: unknown[]) =>
      mocks.updateOpinionTicketStatus(...args),
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
    returnPostToDraft: (...args: unknown[]) => mocks.returnPostToDraft(...args),
  };
});

vi.mock("../../server/services/userAppPushService", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/services/userAppPushService")
  >("../../server/services/userAppPushService");
  return {
    ...actual,
    sendPushToUserApp: (...args: unknown[]) => mocks.sendPushToUserApp(...args),
  };
});

vi.mock("../../server/services/apnsService", async () => {
  const actual = await vi.importActual<
    typeof import("../../server/services/apnsService")
  >("../../server/services/apnsService");
  return {
    ...actual,
    sendPushNotification: (...args: unknown[]) => mocks.sendPushNotification(...args),
    isApnsConfigured: (...args: unknown[]) => mocks.isApnsConfigured(...args),
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

import staffAppMobileRouter from "../../server/routes/staffAppMobile";
import mobileAccountHooksRouter from "../../server/routes/mobileAccountHooks";
import { isCsrfExemptRequest } from "../../server/csrf";
import { OpinionTicketServiceError } from "../../server/services/opinionTicketsService";
import { notifyDeskOfWriterInquiry } from "../../server/services/opinionTicketNotifications";
import {
  CANCEL_REASON_REQUIRED_MESSAGE,
  notifyDeskOfAuthorSocialProposal,
} from "../../server/services/socialPublishing/socialPublishingService";
import { notifyStaffDeskOfSocialProposal } from "../../server/services/staffAppService";
import { notifyEditorialEvent } from "../../server/services/editorialNotifications";

const MEMBER_SESSION_CREDENTIAL = "member_session_bearer_abc123";
const BOTPUB_CREDENTIAL = "botpub_should_be_rejected_on_staff_app";

interface MockUserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  profileImageUrl: string | null;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string | null;
  twoFactorMethod: string;
  bannedUntil: Date | null;
  suspendedUntil: Date | null;
  accountLocked: boolean;
  lockedUntil: Date | null;
  deletedAt: Date | null;
  emailVerified: boolean;
}

const DEFAULT_STAFF_USER: MockUserRow = {
  id: "staff-editor-1",
  email: "editor@sabq.org",
  firstName: "ماجد",
  lastName: "العتيبي",
  role: "editor",
  status: "active",
  profileImageUrl: "https://media.sabq.org/avatars/editor.webp",
  twoFactorEnabled: true,
  twoFactorMethod: "authenticator",
  bannedUntil: null,
  suspendedUntil: null,
  accountLocked: false,
  lockedUntil: null,
  deletedAt: null,
  emailVerified: true,
};

let activeMockUser: MockUserRow | null = { ...DEFAULT_STAFF_USER };

const app = express();
app.use(express.json());
app.use("/api/v1", mobileAccountHooksRouter);
app.post("/api/v1/members/push-token", (req, res) => {
  res.json({ success: true, bundleId: req.body?.bundleId ?? null });
});
app.use("/api/v1/staff", staffAppMobileRouter);
const server = createServer(app);
let base = "";

function call(
  method: string,
  path: string,
  body?: unknown,
  options?: {
    credential?: string | null;
    installationId?: string;
  },
) {
  const credential =
    options && "credential" in options ? options.credential : MEMBER_SESSION_CREDENTIAL;
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(options?.installationId ? { "X-Installation-Id": options.installationId } : {}),
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
  vi.stubEnv("STAFF_APP_SOCIAL_RATE_LIMIT", "1000");
  vi.stubEnv("STAFF_APP_READ_RATE_LIMIT", "1000");
  vi.stubEnv("DESK_BOT_ALERT_EMAILS", "");

  for (const fn of Object.values(mocks)) {
    if (fn && typeof (fn as { mockReset?: () => void }).mockReset === "function") {
      (fn as { mockReset: () => void }).mockReset();
    }
  }

  activeMockUser = { ...DEFAULT_STAFF_USER };

  mocks.verifyMemberBearer.mockImplementation(async (req: express.Request) => {
    const auth = req.headers.authorization;
    if (auth === `Bearer ${MEMBER_SESSION_CREDENTIAL}` && activeMockUser) {
      return { userId: activeMockUser.id };
    }
    return null;
  });

  mocks.dbSelect.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(activeMockUser ? [activeMockUser] : []),
      }),
    }),
  }));

  mocks.getUserRoleNames.mockImplementation(async () =>
    activeMockUser ? [activeMockUser.role] : [],
  );
  mocks.canUserViewOpinionDesk.mockResolvedValue(true);
  mocks.userHasPermission.mockResolvedValue(true);
  mocks.logActivity.mockResolvedValue(undefined);
  mocks.sendPushToUserApp.mockResolvedValue({
    attempted: 1,
    sent: 1,
    failed: 0,
    errors: [],
  });
  mocks.sendEmailNotification.mockResolvedValue({ success: true });
  mocks.createNotification.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Sabq Desk Staff API — Auth, 2FA Gate & RBAC", () => {
  it("exempts /api/v1/staff/* from browser CSRF checks", () => {
    expect(
      isCsrfExemptRequest(
        "POST",
        "/v1/staff/tickets/t-1/reply",
        "/api/v1/staff/tickets/t-1/reply",
      ),
    ).toBe(true);
    expect(
      isCsrfExemptRequest(
        "POST",
        "/v1/staff/social/p-1/publish",
        "/api/v1/staff/social/p-1/publish",
      ),
    ).toBe(true);
  });

  it("rejects missing bearer tokens and botpub_ tokens with 401 unauthorized", async () => {
    const noTokenRes = await call("GET", "/api/v1/staff/me", undefined, {
      credential: null,
    });
    expect(noTokenRes.status).toBe(401);
    expect(noTokenRes.headers.get("cache-control")).toBe("private, no-store");
    expect((await noTokenRes.json()).code).toBe("unauthorized");

    const botpubRes = await call("GET", "/api/v1/staff/me", undefined, {
      credential: BOTPUB_CREDENTIAL,
    });
    expect(botpubRes.status).toBe(401);
    expect((await botpubRes.json()).code).toBe("unauthorized");
    // Must reject botpub_ before calling verifyMemberBearer
    expect(mocks.verifyMemberBearer).not.toHaveBeenCalled();
  });

  it("enforces mandatory 2FA gate: returns 403 { code: 'two_factor_required' } when 2FA is disabled", async () => {
    activeMockUser = {
      ...DEFAULT_STAFF_USER,
      twoFactorEnabled: false,
    };

    for (const [method, path, body] of [
      ["GET", "/api/v1/staff/me", undefined],
      ["GET", "/api/v1/staff/inbox", undefined],
      ["GET", "/api/v1/staff/unread-counts", undefined],
      ["GET", "/api/v1/staff/tickets/t-1", undefined],
      ["POST", "/api/v1/staff/tickets/t-1/reply", { message: "رد" }],
      ["GET", "/api/v1/staff/social/s-1", undefined],
      ["POST", "/api/v1/staff/social/s-1/publish", {}],
    ] as const) {
      const res = await call(method, path, body);
      expect(res.status).toBe(403);
      const payload = await res.json();
      expect(payload).toEqual({
        code: "two_factor_required",
        message: expect.any(String),
      });
    }
  });

  it("still returns 403 two_factor_required when a TOTP secret exists from an unconfirmed setup but twoFactorEnabled is false", async () => {
    const unconfirmedSecret = "JBSWY3DP" + "EHPK3PXP";
    activeMockUser = {
      ...DEFAULT_STAFF_USER,
      twoFactorEnabled: false,
      twoFactorSecret: unconfirmedSecret,
    };

    const resUnconfirmed = await call("GET", "/api/v1/staff/me");
    expect(resUnconfirmed.status).toBe(403);
    expect(await resUnconfirmed.json()).toEqual({
      code: "two_factor_required",
      message: expect.any(String),
    });

    // Once the user completes verification (twoFactorEnabled = true), /me succeeds
    activeMockUser = {
      ...DEFAULT_STAFF_USER,
      twoFactorEnabled: true,
      twoFactorSecret: unconfirmedSecret,
    };
    const resEnabled = await call("GET", "/api/v1/staff/me");
    expect(resEnabled.status).toBe(200);
    expect((await resEnabled.json()).twoFactorEnabled).toBe(true);
  });

  it("GET /me returns user basics, roles, and live capability matrix", async () => {
    mocks.getUserRoleNames.mockResolvedValue(["editor", "reporter"]);
    mocks.canUserViewOpinionDesk.mockResolvedValue(true);
    mocks.userHasPermission.mockImplementation(async (_uid: string, code: string) => {
      return (
        code === PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG ||
        code === PERMISSION_CODES.SOCIAL_PUBLISH_SCHEDULE
      );
    });

    const res = await call("GET", "/api/v1/staff/me");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({
      id: "staff-editor-1",
      email: "editor@sabq.org",
      name: "ماجد العتيبي",
      role: "editor",
      twoFactorEnabled: true,
    });
    expect(body.roles).toEqual(["editor", "reporter"]);
    expect(body.capabilities).toEqual({
      canTickets: true,
      canSocial: {
        view: true,
        publish: false,
        schedule: true,
        reject: false,
      },
      canSystemHealth: false,
      canAdminAlerts: false,
      canManageBalances: false,
    });
    // Every member gets their own prefs now (writer messages, X proposals, quiet hours).
    expect(body.alertPrefs).toEqual(DEFAULT_STAFF_ALERT_PREFS);
    expect(mocks.invalidateUserPermissionCache).toHaveBeenCalledWith("staff-editor-1");
  });

  it("admin-only desk endpoints: /system/health, /system/balances and /alerts need ai_hub.view", async () => {
    mocks.userHasPermission.mockImplementation(async (_uid: string, code: string) => code !== "ai_hub.view");
    for (const [method, path, body] of [
      ["GET", "/api/v1/staff/system/health", undefined],
      ["GET", "/api/v1/staff/alerts", undefined],
      ["GET", "/api/v1/staff/system/balances", undefined],
      ["GET", "/api/v1/staff/system/balances/openai", undefined],
      ["POST", "/api/v1/staff/system/balances/openai/topup", { mode: "add", amountUsd: 500 }],
      ["PUT", "/api/v1/staff/system/balances/openai/threshold", { threshold: 100 }],
    ] as const) {
      const res = await call(method, path, body);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("forbidden");
    }

    // Admin: capabilities on, alertPrefs default ON when no row exists.
    mocks.userHasPermission.mockResolvedValue(true);
    mocks.dbSelect.mockImplementation(() => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () =>
            Promise.resolve(
              table && typeof table === "object" && "twoFactorEnabled" in (table as object)
                ? activeMockUser
                  ? [activeMockUser]
                  : []
                : [],
            ),
        }),
      }),
    }));
    const me = await (await call("GET", "/api/v1/staff/me")).json();
    expect(me.capabilities).toMatchObject({ canSystemHealth: true, canAdminAlerts: true, canManageBalances: true });
    expect(me.alertPrefs).toEqual({ ...DEFAULT_STAFF_ALERT_PREFS, aiAlerts: true, adminAlerts: true });
    const prefs = await call("GET", "/api/v1/staff/me/alert-prefs");
    expect(prefs.status).toBe(200);
    expect(await prefs.json()).toEqual({ ...DEFAULT_STAFF_ALERT_PREFS, aiAlerts: true, adminAlerts: true });
    const bad = await call("PUT", "/api/v1/staff/me/alert-prefs", { aiAlerts: "off" });
    expect(bad.status).toBe(400);
  });

  it("model balances: reads need ai_hub.view; top-up and threshold writes also need ai_hub.manage", async () => {
    const openai = { provider: "openai", label: "OpenAI", kind: "estimated", unit: "usd", state: "low", amount: 86.3 };
    mocks.getAllBalances.mockResolvedValue({
      generatedAt: "2026-10-25T09:00:00.000Z",
      summary: { critical: 0, low: 1, notConfigured: 0, attention: 1, text: "" },
      providers: [openai],
    });
    mocks.getProviderBalance.mockResolvedValue({ ...openai, series: [], topups: [] });
    const writeResult = { before: {}, after: { threshold: 100 }, balance: { ...openai, series: [], topups: [] } };
    mocks.saveBalanceTopup.mockResolvedValue(writeResult);
    mocks.saveBalanceThreshold.mockResolvedValue(writeResult);

    // View-only supervisor: ai_hub.view without ai_hub.manage.
    mocks.userHasPermission.mockImplementation(async (_uid: string, code: string) => code !== "ai_hub.manage");
    const me = await (await call("GET", "/api/v1/staff/me")).json();
    expect(me.capabilities).toMatchObject({ canSystemHealth: true, canManageBalances: false });
    const list = await call("GET", "/api/v1/staff/system/balances");
    expect(list.status).toBe(200);
    expect((await list.json()).canManage).toBe(false);
    const detail = await call("GET", "/api/v1/staff/system/balances/openai");
    expect(detail.status).toBe(200);
    expect((await detail.json()).canManage).toBe(false);
    for (const [method, path, body] of [
      ["POST", "/api/v1/staff/system/balances/openai/topup", { mode: "add", amountUsd: 500 }],
      ["PUT", "/api/v1/staff/system/balances/openai/threshold", { threshold: 100 }],
    ] as const) {
      const res = await call(method, path, body);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("forbidden");
    }
    expect(mocks.saveBalanceTopup).not.toHaveBeenCalled();
    expect(mocks.saveBalanceThreshold).not.toHaveBeenCalled();

    // Manager: both permissions.
    mocks.userHasPermission.mockResolvedValue(true);
    expect((await (await call("GET", "/api/v1/staff/system/balances")).json()).canManage).toBe(true);
    const topup = await call("POST", "/api/v1/staff/system/balances/openai/topup", { mode: "add", amountUsd: 500 });
    expect(topup.status).toBe(200);
    expect((await topup.json()).canManage).toBe(true);
    const threshold = await call("PUT", "/api/v1/staff/system/balances/openai/threshold", { threshold: 100 });
    expect(threshold.status).toBe(200);
    expect(mocks.saveBalanceTopup).toHaveBeenCalledTimes(1);
    expect(mocks.saveBalanceThreshold).toHaveBeenCalledTimes(1);
  });

  it("RBAC tickets: editor and admin can access tickets, reader cannot (403 forbidden)", async () => {
    mocks.getOpinionTicketWithMessages.mockResolvedValue({
      ticket: {
        id: "t-1",
        writerId: "w-1",
        writerName: "د. سعد",
        writerEmail: "saad@sabq.org",
        writerProfileImageUrl: "https://media.sabq.org/avatars/w-1.jpg",
        authorKind: "opinion_author",
        title: "استفسار",
        status: "open",
      },
      messages: [],
    });

    // 1) Editor -> allowed
    activeMockUser = { ...DEFAULT_STAFF_USER, role: "editor" };
    mocks.canUserViewOpinionDesk.mockResolvedValue(true);
    const editorRes = await call("GET", "/api/v1/staff/tickets/t-1");
    expect(editorRes.status).toBe(200);
    expect((await editorRes.json()).ticket.sender).toEqual({
      id: "w-1",
      name: "د. سعد",
      kind: "writer",
      roleKind: "opinion_author",
      avatarUrl: "https://media.sabq.org/avatars/w-1.jpg",
    });

    // 2) Admin -> allowed
    activeMockUser = { ...DEFAULT_STAFF_USER, id: "staff-admin-1", role: "admin" };
    mocks.canUserViewOpinionDesk.mockResolvedValue(true);
    const adminRes = await call("GET", "/api/v1/staff/tickets/t-1");
    expect(adminRes.status).toBe(200);

    // 3) Reader -> 403 forbidden on ticket detail, reply, status, and ticket inbox
    activeMockUser = { ...DEFAULT_STAFF_USER, id: "reader-user-1", role: "reader" };
    mocks.canUserViewOpinionDesk.mockResolvedValue(false);
    mocks.userHasPermission.mockResolvedValue(false);

    const readerDetail = await call("GET", "/api/v1/staff/tickets/t-1");
    expect(readerDetail.status).toBe(403);
    expect((await readerDetail.json()).code).toBe("forbidden");

    const readerReply = await call("POST", "/api/v1/staff/tickets/t-1/reply", {
      message: "محاولة رد",
    });
    expect(readerReply.status).toBe(403);
    expect((await readerReply.json()).code).toBe("forbidden");

    const readerStatus = await call("PATCH", "/api/v1/staff/tickets/t-1/status", {
      status: "closed",
    });
    expect(readerStatus.status).toBe(403);

    const readerInbox = await call("GET", "/api/v1/staff/inbox");
    expect(readerInbox.status).toBe(403);
    expect((await readerInbox.json()).code).toBe("forbidden");

    const readerUnread = await call("GET", "/api/v1/staff/unread-counts");
    expect(readerUnread.status).toBe(403);
    expect((await readerUnread.json()).code).toBe("forbidden");
  });

  it("RBAC social permission matrix: enforces view_log, publish_now, schedule, and manage_scheduled|create per route", async () => {
    const samplePost = {
      id: "soc-1",
      articleId: "art-1",
      platform: "x",
      status: "draft",
      text: "نص تغريدة مقترحة",
      textSource: "custom",
      linkUrl: "https://sabq.org/article/test",
      imageSource: "none",
      imageUrl: null,
      mediaKind: "none",
      mediaUrls: [],
      createdByUserId: "writer-1",
      publisherId: null,
    };
    mocks.getPost.mockResolvedValue(samplePost);
    mocks.getPostAttempts.mockResolvedValue([]);
    mocks.claimPostForImmediatePublish.mockResolvedValue({ ...samplePost, status: "processing" });
    mocks.publishClaimedPost.mockResolvedValue({
      ...samplePost,
      status: "published",
      externalPostUrl: "https://x.com/sabqorg/status/1",
    });
    mocks.schedulePost.mockResolvedValue({ ...samplePost, status: "scheduled" });
    mocks.cancelPost.mockResolvedValue({ ...samplePost, status: "canceled" });

    const futureIso = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    // Case A: Only view_log -> GET /social/:id succeeds (200), publish/schedule/reject fail (403)
    mocks.userHasPermission.mockImplementation(
      async (_uid: string, code: string) => code === PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG,
    );

    expect((await call("GET", "/api/v1/staff/social/soc-1")).status).toBe(200);
    expect((await call("POST", "/api/v1/staff/social/soc-1/publish", {})).status).toBe(403);
    expect(
      (await call("POST", "/api/v1/staff/social/soc-1/schedule", { scheduledAt: futureIso }))
        .status,
    ).toBe(403);
    expect(
      (await call("POST", "/api/v1/staff/social/soc-1/reject", { reason: "سبب" })).status,
    ).toBe(403);

    // Case B: Only publish_now -> publish succeeds (200), view/schedule/reject fail (403)
    mocks.userHasPermission.mockImplementation(
      async (_uid: string, code: string) => code === PERMISSION_CODES.SOCIAL_PUBLISH_NOW,
    );
    expect((await call("GET", "/api/v1/staff/social/soc-1")).status).toBe(403);
    expect((await call("POST", "/api/v1/staff/social/soc-1/publish", {})).status).toBe(200);

    // Case C: Only schedule -> schedule succeeds (200), publish/reject fail (403)
    mocks.userHasPermission.mockImplementation(
      async (_uid: string, code: string) => code === PERMISSION_CODES.SOCIAL_PUBLISH_SCHEDULE,
    );
    expect(
      (await call("POST", "/api/v1/staff/social/soc-1/schedule", { scheduledAt: futureIso }))
        .status,
    ).toBe(200);
    expect((await call("POST", "/api/v1/staff/social/soc-1/publish", {})).status).toBe(403);

    // Case D: Only create (or manage_scheduled) -> reject succeeds (200)
    mocks.userHasPermission.mockImplementation(
      async (_uid: string, code: string) => code === PERMISSION_CODES.SOCIAL_PUBLISH_CREATE,
    );
    expect(
      (await call("POST", "/api/v1/staff/social/soc-1/reject", { reason: "غير مناسب" })).status,
    ).toBe(200);
  });
});

describe("Sabq Desk Staff API — Unified Inbox, Cursor Pagination & Unread Counts", () => {
  const sampleTickets = [
    {
      id: "ticket-1",
      writerId: "writer-1",
      writerName: "د. خالد العتيبي",
      writerEmail: "khalid@sabq.org",
      authorKind: "opinion_author",
      title: "استفسار عن موعد المقال",
      status: "open",
      createdAt: new Date("2026-10-24T10:00:00.000Z"),
      updatedAt: new Date("2026-10-24T14:00:00.000Z"),
      lastMessageAt: new Date("2026-10-24T14:00:00.000Z"),
      hasUnread: true,
      latestMessageExcerpt: "هل ينشر مقالي غداً؟",
    },
    {
      id: "ticket-2",
      writerId: "reporter-1",
      writerName: "فهد الشمري",
      writerEmail: "fahad@sabq.org",
      authorKind: "reporter",
      title: "تغطية ميدانية",
      status: "answered",
      createdAt: new Date("2026-10-24T09:00:00.000Z"),
      updatedAt: new Date("2026-10-24T11:00:00.000Z"),
      lastMessageAt: new Date("2026-10-24T11:00:00.000Z"),
      hasUnread: false,
      latestMessageExcerpt: "تم استلام الصور",
    },
  ];

  const sampleSocialProposals = [
    {
      id: "social-1",
      status: "draft",
      kind: "agency",
      text: "تغريدة وكالة الأنباء حول المؤتمر التقني",
      authorName: null,
      agencyName: "وكالة الأفق",
      proposerName: "وكالة الأفق",
      createdByUserId: "agency-user-1",
      createdByName: "أحمد",
      publisherId: "pub-1",
      isAuthorProposal: false,
      isAgencyProposal: true,
      articleId: "art-10",
      articleTitle: "انطلاق المؤتمر التقني بالرياض",
      articleUrl: "https://sabq.org/article/tech-conf",
      article: {
        id: "art-10",
        title: "انطلاق المؤتمر التقني بالرياض",
        url: "https://sabq.org/article/tech-conf",
        imageUrl: null,
      },
      createdAt: "2026-10-24T13:00:00.000Z",
      created_at: "2026-10-24T13:00:00.000Z",
      updatedAt: "2026-10-24T15:00:00.000Z",
      updated_at: "2026-10-24T15:00:00.000Z",
    },
    {
      id: "social-2",
      status: "draft",
      kind: "author",
      text: "قراءة في التحول الوطني ومستقبل المعرفة",
      authorName: "أ. نورة القحطاني",
      agencyName: null,
      proposerName: "أ. نورة القحطاني",
      createdByUserId: "writer-2",
      createdByName: "أ. نورة القحطاني",
      publisherId: null,
      isAuthorProposal: true,
      isAgencyProposal: false,
      articleId: "art-11",
      articleTitle: "مستقبل المعرفة",
      articleUrl: "https://sabq.org/article/future-knowledge",
      article: {
        id: "art-11",
        title: "مستقبل المعرفة",
        url: "https://sabq.org/article/future-knowledge",
        imageUrl: null,
      },
      createdAt: "2026-10-24T12:00:00.000Z",
      created_at: "2026-10-24T12:00:00.000Z",
      updatedAt: "2026-10-24T12:30:00.000Z",
      updated_at: "2026-10-24T12:30:00.000Z",
    },
  ];

  it("returns unified items sorted newest first with normalized sender kinds and cursor pagination", async () => {
    mocks.listOpinionTickets.mockResolvedValue(sampleTickets);
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue(sampleSocialProposals);

    // Page 1 (limit=2) -> should return social-1 (15:00) and ticket-1 (14:00)
    const page1Res = await call("GET", "/api/v1/staff/inbox?type=all&limit=2");
    expect(page1Res.status).toBe(200);
    const page1 = await page1Res.json();
    expect(page1.items).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(typeof page1.nextCursor).toBe("string");

    expect(page1.items[0]).toMatchObject({
      id: "social-1",
      kind: "social",
      title: "انطلاق المؤتمر التقني بالرياض",
      previewText: "تغريدة وكالة الأنباء حول المؤتمر التقني",
      sender: { name: "وكالة الأفق", kind: "agency" },
      updatedAt: "2026-10-24T15:00:00.000Z",
      status: "draft",
      hasUnread: true,
      deeplink: "sabqdesk://social/social-1",
    });

    expect(page1.items[1]).toMatchObject({
      id: "ticket-1",
      kind: "ticket",
      title: "استفسار عن موعد المقال",
      previewText: "هل ينشر مقالي غداً؟",
      sender: { name: "د. خالد العتيبي", kind: "writer" },
      updatedAt: "2026-10-24T14:00:00.000Z",
      status: "open",
      hasUnread: true,
      deeplink: "sabqdesk://ticket/ticket-1",
    });

    // Page 2 using opaque cursor -> should return social-2 (12:30) and ticket-2 (11:00)
    const page2Res = await call(
      "GET",
      `/api/v1/staff/inbox?type=all&limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
    );
    expect(page2Res.status).toBe(200);
    const page2 = await page2Res.json();
    expect(page2.items).toHaveLength(2);
    expect(page2.hasMore).toBe(false);
    expect(page2.nextCursor).toBeNull();

    expect(page2.items[0]).toMatchObject({
      id: "social-2",
      kind: "social",
      sender: { name: "أ. نورة القحطاني", kind: "writer" },
    });
    expect(page2.items[1]).toMatchObject({
      id: "ticket-2",
      kind: "ticket",
      sender: { name: "فهد الشمري", kind: "reporter" },
      hasUnread: false,
    });
  });

  it("supports filtering inbox by type, status, unread, and search query q, and rejects limit>50 or invalid cursor", async () => {
    mocks.listOpinionTickets.mockResolvedValue(sampleTickets);
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue(sampleSocialProposals);

    const searchRes = await call(
      "GET",
      `/api/v1/staff/inbox?type=all&q=${encodeURIComponent("المؤتمر")}`,
    );
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json();
    expect(searchBody.items).toHaveLength(1);
    expect(searchBody.items[0].id).toBe("social-1");

    // Reject limit > 50
    const overLimitRes = await call("GET", "/api/v1/staff/inbox?limit=51");
    expect(overLimitRes.status).toBe(400);
    expect((await overLimitRes.json()).code).toBe("validation_error");

    // Reject invalid opaque cursor
    const badCursorRes = await call("GET", "/api/v1/staff/inbox?cursor=not-a-valid-cursor");
    expect(badCursorRes.status).toBe(400);
    expect((await badCursorRes.json()).code).toBe("validation_error");
  });

  it("includes scheduled/processing and recent published/failed social posts with scheduledAt/publishedAt, keeping hasUnread draft-only", async () => {
    mocks.listOpinionTickets.mockResolvedValue([]);
    const scheduled = {
      ...sampleSocialProposals[0],
      id: "social-scheduled",
      status: "scheduled",
      scheduledAt: "2026-10-25T11:05:00.000Z",
      publishedAt: null,
      updatedAt: "2026-10-25T10:51:17.000Z",
      updated_at: "2026-10-25T10:51:17.000Z",
    };
    const published = {
      ...sampleSocialProposals[1],
      id: "social-published",
      status: "published",
      scheduledAt: "2026-10-25T09:00:00.000Z",
      publishedAt: "2026-10-25T09:00:03.000Z",
      updatedAt: "2026-10-25T09:00:03.000Z",
      updated_at: "2026-10-25T09:00:03.000Z",
    };
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue([
      scheduled,
      published,
      ...sampleSocialProposals,
    ]);

    const before = Date.now();
    const res = await call("GET", "/api/v1/staff/inbox?type=social&limit=20");
    expect(res.status).toBe(200);
    const body = await res.json();

    // الاستعلام يطلب المسودة والمجدول والجاري نشره دائماً، والمنشور/الفاشل آخر 24 ساعة، بلا المرفوض
    expect(mocks.listPendingSocialProposalsForDesk).toHaveBeenCalledTimes(1);
    const [kind, , filter] = mocks.listPendingSocialProposalsForDesk.mock.calls[0];
    expect(kind).toBe("all");
    expect(filter.statuses).toEqual(["draft", "scheduled", "processing"]);
    expect(filter.recentStatuses).toEqual(["published", "failed"]);
    expect(filter.statuses).not.toContain("canceled");
    expect(filter.recentStatuses).not.toContain("canceled");
    const since = (filter.recentSince as Date).getTime();
    expect(Math.abs(before - 24 * 60 * 60 * 1000 - since)).toBeLessThan(5_000);

    const byId = Object.fromEntries(body.items.map((i: any) => [i.id, i]));
    expect(byId["social-scheduled"]).toMatchObject({
      status: "scheduled",
      hasUnread: false,
      scheduledAt: "2026-10-25T11:05:00.000Z",
      publishedAt: null,
    });
    expect(byId["social-published"]).toMatchObject({
      status: "published",
      hasUnread: false,
      publishedAt: "2026-10-25T09:00:03.000Z",
    });
    expect(byId["social-1"]).toMatchObject({ status: "draft", hasUnread: true });

    // «غير المقروء فقط» يبقى للمسودات فقط
    const unreadRes = await call("GET", "/api/v1/staff/inbox?type=social&unread=true");
    expect(unreadRes.status).toBe(200);
    const unreadIds = (await unreadRes.json()).items.map((i: any) => i.id).sort();
    expect(unreadIds).toEqual(["social-1", "social-2"]);
  });

  it("serves the full published/canceled history when the desk asks for that status, with the rejection reason", async () => {
    mocks.listOpinionTickets.mockResolvedValue([]);
    const rejected = {
      ...sampleSocialProposals[0],
      id: "social-rejected",
      status: "canceled",
      lastError: "مكرر — نُشر الخبر قبل ساعة",
      updatedAt: "2026-10-20T08:00:00.000Z",
      updated_at: "2026-10-20T08:00:00.000Z",
    };
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue([rejected]);

    const res = await call("GET", "/api/v1/staff/inbox?type=social&status=canceled");
    expect(res.status).toBe(200);
    const [, , filter] = mocks.listPendingSocialProposalsForDesk.mock.calls[0];
    expect(filter).toEqual({ statuses: ["canceled"] });
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: "social-rejected",
      status: "canceled",
      lastError: "مكرر — نُشر الخبر قبل ساعة",
    });

    mocks.listPendingSocialProposalsForDesk.mockClear();
    await call("GET", "/api/v1/staff/inbox?type=social&status=published");
    expect(mocks.listPendingSocialProposalsForDesk.mock.calls[0][2]).toEqual({
      statuses: ["published"],
    });

    // A comma list keeps the active query and filters after the merge.
    mocks.listPendingSocialProposalsForDesk.mockClear();
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue([
      { ...sampleSocialProposals[0], id: "p-draft", status: "draft" },
      { ...sampleSocialProposals[0], id: "p-failed", status: "failed", lastError: "rate limit" },
      { ...sampleSocialProposals[0], id: "p-sched", status: "scheduled" },
    ]);
    const multi = await call("GET", "/api/v1/staff/inbox?type=social&status=draft,processing,failed");
    expect(mocks.listPendingSocialProposalsForDesk.mock.calls[0][2].statuses).toEqual([
      "draft",
      "scheduled",
      "processing",
    ]);
    const multiItems = (await multi.json()).items;
    expect(multiItems.map((i: any) => i.id).sort()).toEqual(["p-draft", "p-failed"]);
    expect(multiItems.find((i: any) => i.id === "p-failed").lastError).toBe("rate limit");

    // A draft keeps no reason even if an old error is stored on the row.
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue([
      { ...sampleSocialProposals[0], lastError: "قديم" },
    ]);
    const draftRes = await call("GET", "/api/v1/staff/inbox?type=social");
    expect((await draftRes.json()).items[0].lastError).toBeNull();
  });

  it("adds https-only sender avatars, sender kinds (incl. organization) and canceledBySelf", async () => {
    mocks.listOpinionTickets.mockResolvedValue([
      { ...sampleTickets[0], writerProfileImageUrl: "https://media.sabq.org/w/khalid.webp" },
      { ...sampleTickets[1], writerProfileImageUrl: "/objects/avatars/fahad.png" },
    ]);
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue([
      { ...sampleSocialProposals[0], agencyLogoUrl: "https://media.sabq.org/logos/ofuq.png" },
      {
        ...sampleSocialProposals[1],
        id: "social-org",
        creatorRoles: ["system_admin"],
        creatorProfileImageUrl: "http://insecure.example/a.png",
      },
      {
        ...sampleSocialProposals[1],
        id: "social-rep",
        status: "canceled",
        creatorRoles: ["reporter"],
        creatorProfileImageUrl: "https://media.sabq.org/r.webp",
        canceledByUserId: "writer-2",
      },
      {
        ...sampleSocialProposals[1],
        id: "social-rej",
        status: "canceled",
        creatorRoles: ["opinion_author"],
        canceledByUserId: "editor-9",
      },
    ]);

    const res = await call("GET", "/api/v1/staff/inbox?type=all&limit=50&status=open,answered,draft,canceled");
    expect(res.status).toBe(200);
    const items = (await res.json()).items as any[];
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("ticket-1").sender.avatarUrl).toBe("https://media.sabq.org/w/khalid.webp");
    expect(byId.get("ticket-2").sender.avatarUrl).toBeNull();
    expect(byId.get("social-1").sender).toMatchObject({
      kind: "agency",
      avatarUrl: "https://media.sabq.org/logos/ofuq.png",
    });
    expect(byId.get("social-1").canceledBySelf).toBeNull();
    expect(byId.get("social-org").sender).toMatchObject({ kind: "organization", avatarUrl: null });
    expect(byId.get("social-rep").sender).toMatchObject({
      kind: "reporter",
      avatarUrl: "https://media.sabq.org/r.webp",
    });
    expect(byId.get("social-rep").canceledBySelf).toBe(true);
    expect(byId.get("social-rej").sender.kind).toBe("writer");
    expect(byId.get("social-rej").canceledBySelf).toBe(false);
  });

  it("GET /unread-counts keeps the social count draft-only (default pending filter)", async () => {
    mocks.getOpinionTicketsUnreadCounts.mockResolvedValue({ unreadCount: 0, unansweredCount: 0 });
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue(sampleSocialProposals);

    const res = await call("GET", "/api/v1/staff/unread-counts");
    expect(res.status).toBe(200);
    expect((await res.json()).social).toBe(2);
    const args = mocks.listPendingSocialProposalsForDesk.mock.calls[0];
    expect(args[0]).toBe("all");
    expect(args[2]).toBeUndefined();
  });

  it("GET /unread-counts returns { tickets, social, total }", async () => {
    mocks.getOpinionTicketsUnreadCounts.mockResolvedValue({
      unreadCount: 3,
      unansweredCount: 2,
    });
    mocks.listPendingSocialProposalsForDesk.mockResolvedValue(sampleSocialProposals);

    const res = await call("GET", "/api/v1/staff/unread-counts");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tickets: 3,
      social: 2,
      total: 5,
    });
  });
});

describe("Sabq Desk Staff API — Tickets, Social Actions, Schedule Validation, Audit & Rate Limiting", () => {
  it("replies to a ticket and updates status, auditing channel='staff-app' with userId and installationId", async () => {
    mocks.appendOpinionTicketMessage.mockResolvedValue({
      message: {
        id: "msg-99",
        ticketId: "t-50",
        senderId: DEFAULT_STAFF_USER.id,
        senderRole: "admin",
        message: "تم اعتماد المقال",
        parentMessageId: null,
        createdAt: new Date("2026-10-24T16:00:00.000Z"),
      },
      previousStatus: "open",
      status: "answered",
    });

    const replyRes = await call(
      "POST",
      "/api/v1/staff/tickets/t-50/reply",
      { message: "تم اعتماد المقال" },
      { installationId: "ios-idfv-desk-001" },
    );
    expect(replyRes.status).toBe(201);
    const replyBody = await replyRes.json();
    expect(replyBody.status).toBe("answered");

    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: DEFAULT_STAFF_USER.id,
        action: "ticket_reply",
        entityType: "opinion_ticket",
        entityId: "t-50",
        metadata: expect.objectContaining({
          channel: STAFF_APP_AUDIT_CHANNEL,
          userId: DEFAULT_STAFF_USER.id,
          installationId: "ios-idfv-desk-001",
        }),
      }),
    );

    mocks.updateOpinionTicketStatus.mockResolvedValue({
      id: "t-50",
      status: "closed",
    });

    const statusRes = await call(
      "PATCH",
      "/api/v1/staff/tickets/t-50/status",
      { status: "closed" },
      { installationId: "ios-idfv-desk-001" },
    );
    expect(statusRes.status).toBe(200);
    expect((await statusRes.json()).ticket.status).toBe("closed");

    // Closed ticket reply -> 400 ticket_closed
    mocks.appendOpinionTicketMessage.mockRejectedValueOnce(
      new OpinionTicketServiceError(400, "ticket_closed", "تم إغلاق هذا الاستفسار"),
    );
    const closedRes = await call("POST", "/api/v1/staff/tickets/t-50/reply", {
      message: "رد بعد الإغلاق",
    });
    expect(closedRes.status).toBe(400);
    expect((await closedRes.json()).code).toBe("ticket_closed");
  });

  it("validates schedule time: requires ISO with offset and rejects past timestamps", async () => {
    const draftPost = {
      id: "soc-10",
      articleId: "art-10",
      platform: "x",
      status: "draft",
      text: "نص تغريدة",
      textSource: "custom",
      linkUrl: "https://sabq.org/article/test",
      createdByUserId: "writer-1",
      publisherId: null,
    };
    mocks.getPost.mockResolvedValue(draftPost);
    mocks.schedulePost.mockResolvedValue({
      ...draftPost,
      status: "scheduled",
    });

    // 1) Past timestamp -> 400 validation_error without calling schedulePost
    const pastIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const pastRes = await call("POST", "/api/v1/staff/social/soc-10/schedule", {
      scheduledAt: pastIso,
    });
    expect(pastRes.status).toBe(400);
    const pastBody = await pastRes.json();
    expect(pastBody.code).toBe("validation_error");
    expect(mocks.schedulePost).not.toHaveBeenCalled();

    // 2) Timestamp without offset -> 400 validation_error
    const noOffsetRes = await call("POST", "/api/v1/staff/social/soc-10/schedule", {
      scheduledAt: "2027-05-01T18:00:00",
    });
    expect(noOffsetRes.status).toBe(400);
    expect((await noOffsetRes.json()).code).toBe("validation_error");

    // 3) Valid future timestamp with offset -> 200 and audited
    const futureIso = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const okRes = await call(
      "POST",
      "/api/v1/staff/social/soc-10/schedule",
      { scheduledAt: futureIso },
      { installationId: "ios-idfv-desk-002" },
    );
    expect(okRes.status).toBe(200);
    expect(mocks.schedulePost).toHaveBeenCalledWith(
      "soc-10",
      new Date(futureIso),
      { resetAttempts: true },
    );
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: DEFAULT_STAFF_USER.id,
        action: "social_post_schedule",
        entityType: "social_post",
        entityId: "soc-10",
        metadata: expect.objectContaining({
          channel: STAFF_APP_AUDIT_CHANNEL,
          installationId: "ios-idfv-desk-002",
        }),
      }),
    );
  });

  it("returns a scheduled post to draft with schedule permission and a rejected one with reject permission", async () => {
    const base = {
      id: "soc-back",
      articleId: "art-1",
      platform: "x",
      text: "تغريدة",
      textSource: "custom",
      linkUrl: null,
      createdByUserId: "w-1",
      publisherId: null,
    };
    mocks.returnPostToDraft.mockResolvedValue({ ...base, status: "draft", scheduledAt: null });

    // Scheduled: schedule permission only → 200; reject permission only → 403.
    mocks.getPost.mockResolvedValue({ ...base, status: "scheduled", scheduledAt: new Date() });
    mocks.userHasPermission.mockImplementation(
      async (_uid: string, code: string) => code === PERMISSION_CODES.SOCIAL_PUBLISH_SCHEDULE,
    );
    const ok = await call("POST", "/api/v1/staff/social/soc-back/return-to-draft", {});
    expect(ok.status).toBe(200);
    expect((await ok.json()).post.status).toBe("draft");
    expect(mocks.returnPostToDraft).toHaveBeenCalledWith("soc-back");
    expect(mocks.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "social_post_return_to_draft", entityId: "soc-back" }),
    );

    mocks.userHasPermission.mockImplementation(
      async (_uid: string, code: string) => code === PERMISSION_CODES.SOCIAL_PUBLISH_CREATE,
    );
    expect((await call("POST", "/api/v1/staff/social/soc-back/return-to-draft", {})).status).toBe(403);

    // Canceled: reject permission → 200.
    mocks.getPost.mockResolvedValue({ ...base, status: "canceled", lastError: "مكرر" });
    expect((await call("POST", "/api/v1/staff/social/soc-back/return-to-draft", {})).status).toBe(200);

    // Published: never goes back → 409 without touching the row.
    mocks.returnPostToDraft.mockClear();
    mocks.getPost.mockResolvedValue({ ...base, status: "published" });
    const conflict = await call("POST", "/api/v1/staff/social/soc-back/return-to-draft", {});
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).code).toBe("conflict");
    expect(mocks.returnPostToDraft).not.toHaveBeenCalled();

    // The body must be empty.
    expect(
      (await call("POST", "/api/v1/staff/social/soc-back/return-to-draft", { status: "draft" })).status,
    ).toBe(400);
  });

  it("rate limits social publish/schedule/reject per user (429 rate_limited)", async () => {
    vi.stubEnv("STAFF_APP_SOCIAL_RATE_LIMIT", "2");
    activeMockUser = { ...DEFAULT_STAFF_USER, id: "rate-limited-editor" };

    const draftPost = {
      id: "soc-rl",
      articleId: "art-1",
      platform: "x",
      status: "draft",
      text: "تغريدة",
      textSource: "custom",
      linkUrl: null,
      createdByUserId: "w-1",
      publisherId: null,
    };
    mocks.getPost.mockResolvedValue(draftPost);
    mocks.cancelPost.mockResolvedValue({ ...draftPost, status: "canceled" });

    const r1 = await call("POST", "/api/v1/staff/social/soc-rl/reject", { reason: "1" });
    const r2 = await call("POST", "/api/v1/staff/social/soc-rl/reject", { reason: "2" });
    const r3 = await call("POST", "/api/v1/staff/social/soc-rl/reject", { reason: "3" });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect((await r3.json()).code).toBe("rate_limited");
  });

  it("requires a rejection reason unless the staff user withdraws their own post", async () => {
    const draftPost = {
      id: "soc-reason",
      articleId: "art-1",
      platform: "x",
      status: "draft",
      text: "تغريدة",
      textSource: "custom",
      linkUrl: null,
      createdByUserId: "w-1",
      publisherId: null,
    };
    mocks.getPost.mockResolvedValue(draftPost);
    mocks.cancelPost.mockResolvedValue({ ...draftPost, status: "canceled" });

    // غير صاحب المنشور بلا جسم أو بسبب فارغ → 400 ولا يُلغى شيء.
    for (const body of [undefined, {}, { reason: "   " }, { reason: null }]) {
      const res = await call("POST", "/api/v1/staff/social/soc-reason/reject", body);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.code).toBe("validation_error");
      expect(json.message).toBe(CANCEL_REASON_REQUIRED_MESSAGE);
    }
    // المسار البديل /social/posts/:id/reject يطبّق القاعدة نفسها.
    const postsAlias = await call("POST", "/api/v1/staff/social/posts/soc-reason/reject", {});
    expect(postsAlias.status).toBe(400);
    expect(mocks.cancelPost).not.toHaveBeenCalled();

    // بسبب → 200 ويصل السبب المقلّم إلى cancelPost.
    const withReason = await call("POST", "/api/v1/staff/social/soc-reason/reject", {
      reason: "  صياغة غير مناسبة  ",
    });
    expect(withReason.status).toBe(200);
    expect(mocks.cancelPost).toHaveBeenLastCalledWith(
      "soc-reason",
      DEFAULT_STAFF_USER.id,
      "صياغة غير مناسبة",
    );

    // صاحب المنشور يسحبه بلا سبب → 200 والسبب null.
    mocks.getPost.mockResolvedValue({ ...draftPost, createdByUserId: DEFAULT_STAFF_USER.id });
    const ownWithdraw = await call("POST", "/api/v1/staff/social/soc-reason/reject", {});
    expect(ownWithdraw.status).toBe(200);
    expect(mocks.cancelPost).toHaveBeenLastCalledWith("soc-reason", DEFAULT_STAFF_USER.id, null);
  });
});

describe("Sabq Desk Staff Push Hooks & Reader Bundle Isolation", () => {
  it("notifyDeskOfWriterInquiry sends push to com.sabq.desk with sabqdesk://ticket/<id> and never throws when push fails", async () => {
    // 1) subquery rbacDeskUserIds in listOpinionDeskRecipients
    mocks.dbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => [],
          }),
        }),
      })
      // 2) candidates query in listOpinionDeskRecipients
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: "admin-1", email: "admin1@sabq.org", role: "admin" },
            ]),
        }),
      })
      // 3) rbacRows query in listOpinionDeskRecipients
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([{ userId: "admin-1", roleName: "admin" }]),
          }),
        }),
      })
      // 4) systemSettings query in getDeskBotAlertRecipients
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      });

    mocks.sendPushToUserApp.mockRejectedValueOnce(new Error("APNs socket error"));

    await expect(
      notifyDeskOfWriterInquiry({
        kind: "new_ticket",
        ticketId: "ticket-push-77",
        title: "استفسار هام",
        writerName: "د. فهد",
        writerRole: "opinion_author",
        message: "متى ينشر مقالي؟",
        senderId: "writer-99",
      }),
    ).resolves.toBeUndefined();

    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    expect(mocks.sendPushToUserApp).toHaveBeenCalledWith(
      "admin-1",
      STAFF_APP_BUNDLE_ID,
      expect.objectContaining({
        deeplink: "sabqdesk://ticket/ticket-push-77",
        data: expect.objectContaining({
          ticketId: "ticket-push-77",
          kind: "new_ticket",
        }),
      }),
    );
  });

  it("notifyStaffDeskOfSocialProposal & notifyDeskOfAuthorSocialProposal send push to social_publish.view_log users with sabqdesk://social/<id> and never throw", async () => {
    // Mock candidates query in listSocialDeskRecipientUserIds
    const subQueryChain = {
      from: () => ({
        innerJoin: () => ({
          where: () => [],
          innerJoin: () => ({ where: () => [] }),
        }),
        where: () => [],
      }),
    };
    mocks.dbSelect
      // 4 subqueries + 1 main candidates query
      .mockReturnValueOnce(subQueryChain)
      .mockReturnValueOnce(subQueryChain)
      .mockReturnValueOnce(subQueryChain)
      .mockReturnValueOnce(subQueryChain)
      .mockReturnValueOnce({
        from: () => ({
          where: () =>
            Promise.resolve([
              { id: "social-editor-1", role: "editor" },
              { id: "no-perm-user-2", role: "reporter" },
            ]),
        }),
      });

    mocks.userHasPermission.mockImplementation(
      async (uid: string, code: string) =>
        uid === "social-editor-1" && code === PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG,
    );
    mocks.sendPushToUserApp.mockRejectedValueOnce(new Error("FCM/APNs timeout"));

    await expect(
      notifyStaffDeskOfSocialProposal({
        postId: "social-prop-88",
        proposalKind: "agency",
        senderName: "وكالة الأفق",
        articleTitle: "خبر اقتصادي",
        text: "نص مقترح التغريدة",
      }),
    ).resolves.toBeUndefined();

    expect(mocks.sendPushToUserApp).toHaveBeenCalledTimes(1);
    expect(mocks.sendPushToUserApp).toHaveBeenCalledWith(
      "social-editor-1",
      STAFF_APP_BUNDLE_ID,
      expect.objectContaining({
        deeplink: "sabqdesk://social/social-prop-88",
        type: "desk.social_proposal",
      }),
    );

    // Also verify notifyDeskOfAuthorSocialProposal does not throw when push or DB fails
    await expect(
      notifyDeskOfAuthorSocialProposal({
        post: {
          id: "social-prop-99",
          articleId: "art-1",
          platform: "x",
          accountId: "acc-1",
          textSource: "custom",
          text: "تغريدة كاتب رأي",
          linkUrl: "https://sabq.org/article/1",
          imageSource: "none",
          imageUrl: null,
          mediaKind: "none",
          mediaUrls: [],
          status: "draft",
          scheduledAt: null,
          publishedAt: null,
          requestedAt: null,
          externalPostId: null,
          externalPostUrl: null,
          attempts: 0,
          lastError: null,
          lockedAt: null,
          createdByUserId: "writer-1",
          publishedByUserId: null,
          canceledByUserId: null,
          publisherId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        articleTitle: "مقال الرأي",
        articleUrl: "https://sabq.org/article/1",
        authorUserId: "writer-1",
        authorName: "د. علي",
      }),
    ).resolves.toBeUndefined();
  });

  it("notifyEditorialEvent filters iOS devices by reader bundleId (com.sabq.sabqorg) so com.sabq.desk devices do not get reader pushes", async () => {
    mocks.isApnsConfigured.mockReturnValue(true);
    mocks.sendPushNotification.mockResolvedValue({ success: true });

    // 1) fetchUserPrefs
    mocks.dbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    });

    // 2) insert editorialNotifications
    mocks.dbInsert.mockReturnValueOnce({
      values: () => ({
        returning: () => Promise.resolve([{ id: "ed-notif-1" }]),
      }),
    });

    // 3) update supersede scheduled
    mocks.dbUpdate.mockReturnValueOnce({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    });

    // 4) select pushDevices — simulate returning both a reader device and a desk device
    mocks.dbSelect.mockReturnValueOnce({
      from: () => ({
        where: () =>
          Promise.resolve([
            {
              token: "reader-apns-token-1",
              provider: "apns",
              bundleId: READER_APP_BUNDLE_ID,
            },
            {
              token: "desk-apns-token-2",
              provider: "apns",
              bundleId: STAFF_APP_BUNDLE_ID,
            },
          ]),
      }),
    });

    // 5) update editorialNotifications deliveryStatus
    mocks.dbUpdate.mockReturnValueOnce({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    });

    await notifyEditorialEvent({
      userId: "writer-with-both-apps",
      event: "published",
      article: {
        id: "art-500",
        title: "مقال منشور",
        slug: "published-op",
        articleType: "opinion",
      },
    });

    expect(mocks.sendPushNotification).toHaveBeenCalledTimes(1);
    expect(mocks.sendPushNotification).toHaveBeenCalledWith(
      "reader-apns-token-1",
      expect.any(Object),
      expect.objectContaining({
        topic: READER_APP_BUNDLE_ID,
      }),
    );
  });

  it("POST /api/v1/members/push-token accepts com.sabq.desk and rejects unknown bundleIds", async () => {
    const deskRes = await call("POST", "/api/v1/members/push-token", {
      provider: "apns",
      platform: "ios",
      bundleId: "com.sabq.desk",
    });
    expect(deskRes.status).toBe(200);
    expect(await deskRes.json()).toEqual({
      success: true,
      bundleId: "com.sabq.desk",
    });

    const badRes = await call("POST", "/api/v1/members/push-token", {
      provider: "apns",
      platform: "ios",
      bundleId: "com.unknown.app",
    });
    expect(badRes.status).toBe(400);
    expect((await badRes.json()).code).toBe("invalid_bundle_id");
  });
});
