import express from "express";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  getMailerLiteSubscriber: vi.fn(),
  isMailerLiteConfigured: vi.fn(),
  nextRow: null as Record<string, unknown> | null,
}));

vi.mock("../../server/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
  },
  withStatementTimeout: vi.fn(),
}));

vi.mock("../../server/services/mailerlite", () => ({
  getMailerLiteSubscriber: mocks.getMailerLiteSubscriber,
  isMailerLiteConfigured: mocks.isMailerLiteConfigured,
  unsubscribeFromMailerLite: vi.fn(),
  syncUserInterestsToMailerLite: vi.fn(),
  getMailerLiteGroups: vi.fn(),
}));

vi.mock("../../server/services/emailSuppressionService", () => ({
  addEmailSuppression: vi.fn(),
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../server/rbac", () => ({
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../server/routes/mailerliteWebhookHandler", () => ({
  createMailerLiteWebhookHandler: () => (_req: unknown, res: { status: (code: number) => { end: () => void } }) =>
    res.status(204).end(),
}));

vi.mock("../../server/utils/rateLimiting", () => ({
  cfKeyGenerator: () => "newsletter-status-test",
  cfValidate: false,
}));

vi.mock("../../server/services/newsletterSubscriptionService", () => ({
  confirmNewsletterSubscription: vi.fn(),
  createPendingNewsletterSubscription: vi.fn(),
  retryNewsletterMailerLiteSync: vi.fn(),
  syncConfirmedSubscription: vi.fn(),
  newsletterSubscribeInputSchema: { parse: (value: unknown) => value },
  hasConfirmedNewsletterMarker: (subscription: { metadata?: unknown }) => {
    const metadata = subscription.metadata;
    return Boolean(
      metadata &&
      typeof metadata === "object" &&
      (metadata as Record<string, unknown>).newsletterConsentVersion === 1 &&
      typeof (metadata as Record<string, unknown>).confirmedAt === "string",
    );
  },
}));

const subscription = (overrides: Record<string, unknown> = {}) => ({
  id: "subscription-token",
  email: "subscriber@example.invalid",
  status: "active",
  language: "ar",
  preferences: { frequency: "daily" },
  verifiedAt: new Date("2026-09-24T00:00:00.000Z"),
  metadata: {
    newsletterConsentVersion: 1,
    confirmedAt: "2026-09-24T00:00:00.000Z",
  },
  createdAt: new Date("2026-09-23T00:00:00.000Z"),
  updatedAt: new Date("2026-09-24T00:00:00.000Z"),
  ...overrides,
});

let server: Server;
let baseUrl: string;

async function request(path: string, user?: { email: string; emailVerified: boolean }) {
  const headers: Record<string, string> = {};
  if (user) {
    headers["x-test-user"] = `${user.emailVerified ? "verified" : "unverified"}:${user.email}`;
  }
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return { response, body: await response.json() as Record<string, unknown> };
}

describe("smart newsletter status ownership", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.nextRow = null;
    mocks.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => (mocks.nextRow ? [mocks.nextRow] : []),
        }),
      }),
    }));
    mocks.isMailerLiteConfigured.mockReturnValue(true);
    mocks.getMailerLiteSubscriber.mockResolvedValue({
      success: true,
      data: { id: "provider-subscriber", status: "active", groups: [], fields: {} },
    });

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
      const rawUser = req.header("x-test-user");
      if (rawUser) {
        const [verification, email] = rawUser.split(":");
        req.user = { email, emailVerified: verification === "verified" };
      }
      next();
    });
    const { registerSmartNewsletterRoutes } = await import("../../server/routes/smartNewsletterRoutes");
    registerSmartNewsletterRoutes(app);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("returns an empty owned state without querying MailerLite", async () => {
    const result = await request("/api/smart-newsletter/status/verified-owner%40example.invalid", {
      email: "verified-owner@example.invalid",
      emailVerified: true,
    });

    expect(result.response.status).toBe(200);
    expect(result.body).toEqual({
      success: true,
      subscribed: false,
      local: null,
      mailerlite: null,
    });
    expect(mocks.getMailerLiteSubscriber).not.toHaveBeenCalled();
  });

  it("denies a verified account requesting another account", async () => {
    const result = await request("/api/smart-newsletter/status/other-owner%40example.invalid", {
      email: "verified-owner@example.invalid",
      emailVerified: true,
    });

    expect(result.response.status).toBe(403);
    expect(result.body.success).toBe(false);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.getMailerLiteSubscriber).not.toHaveBeenCalled();
  });

  it.each([
    ["PUT", "update"],
    ["POST", "unsubscribe"],
  ])("keeps %s %s denied when the verified owner has no subscription", async (method, endpoint) => {
    const response = await fetch(`${baseUrl}/api/smart-newsletter/${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json", "x-test-user": "verified:verified-owner@example.invalid" },
      body: JSON.stringify({ email: "verified-owner@example.invalid", frequency: "weekly" }),
    });
    expect(response.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.getMailerLiteSubscriber).not.toHaveBeenCalled();
  });

  it("denies an unverified account even when the address has no row", async () => {
    const result = await request("/api/smart-newsletter/status/unverified-owner%40example.invalid", {
      email: "unverified-owner@example.invalid",
      emailVerified: false,
    });

    expect(result.response.status).toBe(403);
    expect(result.body.success).toBe(false);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("denies anonymous status requests", async () => {
    const result = await request("/api/smart-newsletter/status/anonymous%40example.invalid");

    expect(result.response.status).toBe(403);
    expect(result.body.success).toBe(false);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each(["missing-token", ""])("denies invalid token '%s' even for a verified owner", async token => {
    const result = await request(
      `/api/smart-newsletter/status/verified-owner%40example.invalid?token=${token}`,
      { email: "verified-owner@example.invalid", emailVerified: true },
    );

    expect(result.response.status).toBe(403);
    expect(result.body.success).toBe(false);
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.getMailerLiteSubscriber).not.toHaveBeenCalled();
  });

  it("returns an existing token-owned row with confirmed state and performs no mutation", async () => {
    mocks.nextRow = subscription();
    const result = await request("/api/smart-newsletter/status/ignored%40example.invalid?token=subscription-token");

    expect(result.response.status).toBe(200);
    expect(result.body).toMatchObject({
      success: true,
      subscribed: true,
      local: {
        status: "active",
        confirmed: true,
      },
    });
    expect(mocks.getMailerLiteSubscriber).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("marks a legacy existing row as needing DOI confirmation", async () => {
    mocks.nextRow = subscription({ metadata: {}, verifiedAt: new Date("2026-09-24T00:00:00.000Z") });
    const result = await request("/api/smart-newsletter/status/subscriber%40example.invalid", {
      email: "subscriber@example.invalid",
      emailVerified: true,
    });

    expect(result.response.status).toBe(200);
    expect(result.body).toMatchObject({ local: { confirmed: false } });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
