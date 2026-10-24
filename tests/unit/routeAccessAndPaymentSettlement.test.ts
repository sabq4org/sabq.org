import express from "express";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { validateCsrfToken } from "../../server/csrf";

const state = vi.hoisted(() => ({
  user: null as { id: string; role?: string } | null,
  hasSession: true,
  advertiserId: null as string | null,
  advertiserRow: {
    id: "adv-1",
    name: "Test Advertiser",
    email: "adv@example.com",
    password: "hashed-password",
    isActive: true,
  } as Record<string, any> | null,
  permissions: [] as string[],
  articleAccess: { ok: true, articleId: "art-1" } as { ok: boolean; articleId?: string; httpStatus?: number; message?: string },
  storyCard: null as { id: string; articleId: string | null; userId: string } | null,
  storyCardUpdated: vi.fn(),
  storyCardDeleted: vi.fn(),
  txClaimWon: true,
  walletUpdates: 0,
  adBudgetUpdates: 0,
  articleUpdates: 0,
  transactionRow: {
    id: "tx-1",
    advertiserId: "adv-1",
    walletId: "wal-1",
    packageId: "pkg-1",
    adId: "ad-1",
    chargeId: "chg_adv_1",
    amountHalalas: 23000,
    status: "pending",
    metadata: { baseAmount: 20000, vatAmount: 3000 },
  } as Record<string, any> | null,
  retrievedCharge: {
    id: "chg_adv_1",
    status: "CAPTURED",
    amount: 230,
    currency: "SAR",
  } as Record<string, any>,
}));

vi.mock("../../server/auth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    next();
  },
}));

vi.mock("../../server/rbac", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    next();
  },
  requireAnyPermission: (...codes: string[]) => (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });
    if (state.permissions.includes("*") || codes.some((c) => state.permissions.includes(c))) {
      return next();
    }
    return res.status(403).json({ message: "Forbidden" });
  },
}));

vi.mock("../../server/services/articleAccessService", () => ({
  authorizeArticleWrite: vi.fn(async () => state.articleAccess),
}));

vi.mock("../../server/services/storyCardsService", () => ({
  storyCardsService: {
    getStoryCardById: vi.fn(async () => state.storyCard),
    updateStoryCard: (...args: unknown[]) => state.storyCardUpdated(...args),
    deleteStoryCard: (...args: unknown[]) => state.storyCardDeleted(...args),
    generateStoryCards: vi.fn(),
    generateInstagramCarousel: vi.fn(),
    generateLinkedInDocument: vi.fn(),
    getStoryCardsByArticle: vi.fn(async () => []),
  },
}));

vi.mock("../../server/services/smartCategoryClassifier", () => ({
  classifyArticle: vi.fn(async () => ({ categoryId: "cat-1", confidence: 0.9 })),
  generateNewsletterSubtitle: vi.fn(async () => ({ subtitle: "s", excerpt: "e" })),
  updateArticleCategorySuggestion: vi.fn(async () => undefined),
  updateArticleNewsletterContent: vi.fn(async () => undefined),
}));

vi.mock("../../server/services/tapPaymentService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../server/services/tapPaymentService")>()),
  retrieveCharge: vi.fn(async () => state.retrievedCharge),
}));

vi.mock("../../server/db", () => {
  const makeSelectChain = () => {
    const q: any = {
      from: () => q,
      where: () => q,
      orderBy: () => q,
      offset: () => q,
      groupBy: async () => [],
      limit: async () => (state.transactionRow ? [state.transactionRow] : []),
    };
    return q;
  };
  const tx = {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if ("status" in values) {
              if (!state.txClaimWon) return [];
              state.txClaimWon = false;
              if (state.transactionRow) state.transactionRow.status = values.status;
              return [{ id: "tx-1" }];
            }
            if ("balanceHalalas" in values) {
              state.walletUpdates += 1;
              return [{ balanceHalalas: 50000 }];
            }
            return [{ id: "tx-1" }];
          },
          then: (resolve: (v: unknown) => unknown) => {
            if ("totalBudget" in values) state.adBudgetUpdates += 1;
            return Promise.resolve(undefined).then(resolve);
          },
        }),
      }),
    }),
  };
  return {
    db: {
      select: () => makeSelectChain(),
      update: () => ({
        set: () => ({
          where: () => {
            state.articleUpdates += 1;
            return {
              returning: async () => (state.txClaimWon ? [{ id: "tx-1" }] : []),
            };
          },
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: "camp-1", subject: "Test" }],
        }),
      }),
      transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
      query: {
        newsletterEmailCampaigns: {
          findFirst: async () => ({ id: "camp-1", subject: "Test", events: [] }),
        },
        advertiserProfiles: {
          findFirst: async () => state.advertiserRow,
        },
      },
    },
  };
});

import advertiserAuthRouter, { requireAdvertiserAuth } from "../../server/routes/advertiserAuth";
import advertiserPaymentsRouter from "../../server/routes/advertiserPayments";
import newsletterAnalyticsRouter from "../../server/routes/newsletterAnalyticsRoutes";
import smartClassificationRouter from "../../server/routes/smartClassificationRoutes";
import { storyCardsRouter } from "../../server/routes/storyCardsRoutes";

describe("route access checks and advertiser payment settlement", () => {
  let server: Server;
  let origin: string;
  const tapWebhookPassphrase = "tap-webhook-test-value";

  beforeAll(async () => {
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as typeof req & { rawBody: Buffer }).rawBody = buf;
        },
      }),
    );
    app.use((req: any, _res, next) => {
      req.user = state.user;
      if (state.hasSession) {
        req.session = {
          advertiserId: state.advertiserId ?? undefined,
          csrfToken: "csrf-fixed",
          destroy: (cb: (err?: unknown) => void) => cb(),
        };
      }
      next();
    });
    app.use("/api", validateCsrfToken);
    app.use("/api/advertiser", advertiserAuthRouter);
    app.use("/api/advertiser-payments", advertiserPaymentsRouter);
    app.use("/api/newsletter/analytics", newsletterAnalyticsRouter);
    app.use("/api/smart-classification", smartClassificationRouter);
    app.patch("/api/story-cards/:cardId", storyCardsRouter.patch["/:cardId"]);
    app.delete("/api/story-cards/:cardId", storyCardsRouter.delete["/:cardId"]);

    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  beforeEach(() => {
    vi.stubEnv("TAP_WEBHOOK_SECRET", tapWebhookPassphrase);
    state.user = { id: "user-1", role: "reader" };
    state.hasSession = true;
    state.advertiserId = null;
    state.advertiserRow = {
      id: "adv-1",
      name: "Test Advertiser",
      email: "adv@example.com",
      password: "hashed-password",
      isActive: true,
    };
    state.permissions = [];
    state.articleAccess = { ok: true, articleId: "art-1" };
    state.storyCard = { id: "card-1", articleId: "art-1", userId: "user-1" };
    state.storyCardUpdated.mockReset();
    state.storyCardDeleted.mockReset();
    state.txClaimWon = true;
    state.walletUpdates = 0;
    state.adBudgetUpdates = 0;
    state.articleUpdates = 0;
    state.transactionRow = {
      id: "tx-1",
      advertiserId: "adv-1",
      walletId: "wal-1",
      packageId: "pkg-1",
      adId: "ad-1",
      chargeId: "chg_adv_1",
      amountHalalas: 23000,
      status: "pending",
      metadata: { baseAmount: 20000, vatAmount: 3000 },
    };
    state.retrievedCharge = {
      id: "chg_adv_1",
      status: "CAPTURED",
      amount: 230,
      currency: "SAR",
    };
  });

  it("requires an authenticated advertiser session on verify and transaction endpoints", async () => {
    const verifyRes = await fetch(`${origin}/api/advertiser-payments/verify/tx-1`);
    expect(verifyRes.status).toBe(401);

    const txRes = await fetch(`${origin}/api/advertiser-payments/transaction/tx-1`);
    expect(txRes.status).toBe(401);
  });

  it("returns 401 instead of crashing on /api/advertiser/* when req.session is missing or has no advertiserId, and passes with a valid advertiser session", async () => {
    // 1. No session attached at all (e.g., anonymous GET /api/advertiser/me without connect.sid cookie)
    state.hasSession = false;
    const noSessionMeRes = await fetch(`${origin}/api/advertiser/me`);
    expect(noSessionMeRes.status).toBe(401);
    await expect(noSessionMeRes.json()).resolves.toEqual({ error: "يجب تسجيل الدخول" });

    const next = vi.fn();
    const resJson = vi.fn();
    const resStatus = vi.fn(() => ({ json: resJson }));
    requireAdvertiserAuth({} as any, { status: resStatus } as any, next);
    expect(resStatus).toHaveBeenCalledWith(401);
    expect(resJson).toHaveBeenCalledWith({ error: "يجب تسجيل الدخول" });
    expect(next).not.toHaveBeenCalled();

    // 2. Session exists, but without advertiser data
    state.hasSession = true;
    state.advertiserId = null;
    const unauthMeRes = await fetch(`${origin}/api/advertiser/me`);
    expect(unauthMeRes.status).toBe(401);
    await expect(unauthMeRes.json()).resolves.toEqual({ error: "يجب تسجيل الدخول" });

    // 3. Valid advertiser session passes and returns sanitized advertiser profile
    state.advertiserId = "adv-1";
    const validMeRes = await fetch(`${origin}/api/advertiser/me`);
    expect(validMeRes.status).toBe(200);
    const body = await validMeRes.json();
    expect(body).toEqual({
      id: "adv-1",
      name: "Test Advertiser",
      email: "adv@example.com",
      isActive: true,
    });
    expect(body).not.toHaveProperty("password");
  });

  it("credits the advertiser wallet only once across concurrent verify and webhook settlements", async () => {
    state.advertiserId = "adv-1";
    const payload = JSON.stringify({ id: "chg_adv_1", amount: 230, currency: "SAR" });
    const sig = createHmac("sha256", tapWebhookPassphrase).update(payload).digest("hex");

    const [verifyRes, webhookRes] = await Promise.all([
      fetch(`${origin}/api/advertiser-payments/verify/tx-1`),
      fetch(`${origin}/api/advertiser-payments/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", hashstring: sig },
        body: payload,
      }),
    ]);

    expect(verifyRes.status).toBe(200);
    expect(webhookRes.status).toBe(200);
    expect(state.walletUpdates).toBe(1);
    expect(state.adBudgetUpdates).toBe(1);
  });

  it("blocks ordinary readers from newsletter analytics endpoints and allows permitted staff", async () => {
    const deniedGet = await fetch(`${origin}/api/newsletter/analytics/campaigns/camp-1`);
    expect(deniedGet.status).toBe(403);

    const deniedPost = await fetch(`${origin}/api/newsletter/analytics/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "csrf-fixed" },
      body: JSON.stringify({ subject: "Test", templateType: "daily" }),
    });
    expect(deniedPost.status).toBe(403);

    state.permissions = ["analytics.view"];
    const allowedGet = await fetch(`${origin}/api/newsletter/analytics/campaigns/camp-1`);
    expect(allowedGet.status).toBe(200);
  });

  it("enforces permission and ownership on story card PATCH and DELETE", async () => {
    const noPermRes = await fetch(`${origin}/api/story-cards/card-1`, {
      method: "DELETE",
      headers: { "x-csrf-token": "csrf-fixed" },
    });
    expect(noPermRes.status).toBe(403);
    expect(state.storyCardDeleted).not.toHaveBeenCalled();

    state.permissions = ["articles.edit_own"];
    state.storyCard = { id: "card-1", articleId: "art-other", userId: "other-user" };
    state.articleAccess = { ok: false, httpStatus: 403, message: "غير مصرح لك بتعديل هذا المقال" };

    const notOwnerRes = await fetch(`${origin}/api/story-cards/card-1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-csrf-token": "csrf-fixed" },
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(notOwnerRes.status).toBe(403);
    expect(state.storyCardUpdated).not.toHaveBeenCalled();

    state.articleAccess = { ok: true, articleId: "art-1" };
    const ownerRes = await fetch(`${origin}/api/story-cards/card-1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-csrf-token": "csrf-fixed" },
      body: JSON.stringify({ title: "Updated" }),
    });
    expect(ownerRes.status).toBe(200);
    expect(state.storyCardUpdated).toHaveBeenCalledOnce();
  });

  it("enforces authorizeArticleWrite on smart classification article mutations", async () => {
    state.permissions = ["articles.create"];
    state.articleAccess = { ok: false, httpStatus: 403, message: "غير مصرح لك بتعديل هذا المقال" };

    const deniedPut = await fetch(`${origin}/api/smart-classification/newsletter-content/art-other`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": "csrf-fixed" },
      body: JSON.stringify({ subtitle: "Sub", excerpt: "Ex" }),
    });
    expect(deniedPut.status).toBe(403);
    expect(state.articleUpdates).toBe(0);

    state.articleAccess = { ok: true, articleId: "art-1" };
    const allowedPut = await fetch(`${origin}/api/smart-classification/newsletter-content/art-1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-csrf-token": "csrf-fixed" },
      body: JSON.stringify({ subtitle: "Sub", excerpt: "Ex" }),
    });
    expect(allowedPut.status).toBe(200);
    expect(state.articleUpdates).toBe(1);
  });
});
