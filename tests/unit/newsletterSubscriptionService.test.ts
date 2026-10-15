import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertValues: vi.fn(),
  updateValues: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  transaction: vi.fn(),
  sendConfirmation: vi.fn(),
  subscribeToMailerLite: vi.fn(),
  updateMailerLiteSubscriber: vi.fn(),
  unsubscribeFromMailerLite: vi.fn(),
  getMailerLiteSubscriber: vi.fn(),
  isMailerLiteConfigured: vi.fn(),
  reconcileMailerLiteCadenceGroups: vi.fn(),
  isEmailSuppressed: vi.fn(),
  selectSuppression: vi.fn(),
}));

vi.mock("../../server/db", () => ({
  db: {
    query: { newsletterSubscriptions: { findFirst: mocks.findFirst } },
    insert: () => ({ values: mocks.insertValues }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updateValues(values);
        return {
          where: (condition: unknown) => {
            mocks.updateWhere(condition);
            return { returning: mocks.updateReturning };
          },
        };
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.selectSuppression }) }) }),
    transaction: mocks.transaction,
  },
}));

vi.mock("../../server/services/email", () => ({
  sendNewsletterConfirmationEmail: mocks.sendConfirmation,
}));

vi.mock("../../server/services/mailerlite", () => ({
  subscribeToMailerLite: mocks.subscribeToMailerLite,
  updateMailerLiteSubscriber: mocks.updateMailerLiteSubscriber,
  unsubscribeFromMailerLite: mocks.unsubscribeFromMailerLite,
  getMailerLiteSubscriber: mocks.getMailerLiteSubscriber,
  isMailerLiteConfigured: mocks.isMailerLiteConfigured,
  reconcileMailerLiteCadenceGroups: mocks.reconcileMailerLiteCadenceGroups,
}));

vi.mock("../../server/services/emailSuppressionService", () => ({
  isEmailSuppressed: mocks.isEmailSuppressed,
}));

describe("newsletter subscription confirmation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("MAILERLITE_DAILY_GROUP_ID", "daily-group");
    vi.stubEnv("MAILERLITE_WEEKLY_GROUP_ID", "weekly-group");
    mocks.sendConfirmation.mockResolvedValue({ success: true });
    mocks.updateReturning.mockResolvedValue([]);
    mocks.subscribeToMailerLite.mockResolvedValue({ success: true, data: { id: "ml-1" } });
    mocks.isMailerLiteConfigured.mockReturnValue(false);
    mocks.reconcileMailerLiteCadenceGroups.mockResolvedValue({ success: true });
    mocks.isEmailSuppressed.mockResolvedValue(false);
    mocks.selectSuppression.mockResolvedValue([]);
  });

  it("stores a hashed token and sends a generic confirmation link", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const inserted = {
      id: "sub-1",
      email: "reader@example.invalid",
      status: "pending_confirmation",
      preferences: { frequency: "daily" },
    };
    mocks.insertValues.mockReturnValue({ returning: vi.fn().mockResolvedValue([inserted]) });

    const { createPendingNewsletterSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const result = await createPendingNewsletterSubscription({
      email: " Reader@Example.Invalid ",
      frequency: "daily",
      language: "ar",
      consent: true,
    });

    const values = mocks.insertValues.mock.calls[0][0];
    expect(values.email).toBe("reader@example.invalid");
    expect(values.status).toBe("pending_confirmation");
    expect(values.verificationToken).toMatch(/^[a-f0-9]{64}$/);
    expect(values.metadata.consent).toBe(true);
    expect(mocks.sendConfirmation).toHaveBeenCalledOnce();
    expect(mocks.sendConfirmation.mock.calls[0][0].confirmationUrl).toMatch(
      /^https:\/\/sabq\.org\/newsletter#confirm=[a-f0-9]{64}$/,
    );
    expect(result.confirmationSent).toBe(true);

    mocks.findFirst.mockResolvedValue({
      id: "sub-1",
      email: "reader@example.invalid",
      status: "pending_confirmation",
      updatedAt: new Date(),
      preferences: { frequency: "daily" },
    });
    const second = await createPendingNewsletterSubscription({
      email: " Reader@Example.Invalid ",
      frequency: "daily",
      language: "ar",
      consent: true,
    });
    expect(second.confirmationSent).toBe(false);
  });

  it("moves a legacy active row without the DOI marker to pending and sends a fresh confirmation", async () => {
    const legacy = {
      id: "legacy-1",
      email: "reader@example.invalid",
      status: "active",
      verifiedAt: new Date("2025-12-01T00:00:00.000Z"),
      updatedAt: new Date(Date.now() - 11 * 60 * 1000),
      metadata: null,
      preferences: { frequency: "weekly", categories: ["local"] },
    };
    const pending = { ...legacy, status: "pending_confirmation" };
    mocks.findFirst.mockResolvedValue(legacy);
    mocks.updateReturning.mockResolvedValue([pending]);

    const { createPendingNewsletterSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const result = await createPendingNewsletterSubscription({
      email: legacy.email,
      frequency: "daily",
      language: "ar",
      consent: true,
    });

    expect(result.subscription).toEqual(pending);
    expect(result.confirmationSent).toBe(true);
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.sendConfirmation).toHaveBeenCalledOnce();
    expect(mocks.updateValues).toHaveBeenCalledWith(expect.objectContaining({
      status: "pending_confirmation",
      verifiedAt: null,
      metadata: expect.objectContaining({ consent: true }),
    }));
    const updateQuery = new PgDialect().sqlToQuery(mocks.updateWhere.mock.calls[0][0]);
    const updateSql = updateQuery.sql;
    expect(updateSql).toContain('"status" =');
    expect(updateSql).toContain("newsletterConsentVersion");
    expect(updateSql).toContain("10 minutes");
    expect(updateQuery.params).toContain("active");
  });

  it("leaves a currently confirmed active row untouched", async () => {
    const confirmed = {
      id: "sub-1",
      email: "reader@example.invalid",
      status: "active",
      verifiedAt: new Date(),
      updatedAt: new Date(Date.now() - 11 * 60 * 1000),
      metadata: {
        newsletterConsentVersion: 1,
        confirmedAt: new Date().toISOString(),
      },
      preferences: { frequency: "weekly" },
    };
    mocks.findFirst.mockResolvedValue(confirmed);

    const { createPendingNewsletterSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const result = await createPendingNewsletterSubscription({
      email: confirmed.email,
      frequency: "daily",
      language: "ar",
      consent: true,
    });

    expect(result.subscription).toBe(confirmed);
    expect(result.confirmationSent).toBe(false);
    expect(mocks.updateValues).not.toHaveBeenCalled();
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it("keeps the ten minute resend throttle for a legacy active row", async () => {
    const legacy = {
      id: "legacy-1",
      email: "reader@example.invalid",
      status: "active",
      verifiedAt: new Date("2025-12-01T00:00:00.000Z"),
      updatedAt: new Date(),
      metadata: {},
      preferences: { frequency: "weekly" },
    };
    mocks.findFirst.mockResolvedValue(legacy);
    // Simulates the SQL cooldown predicate rejecting the update.
    mocks.updateReturning.mockResolvedValue([]);

    const { createPendingNewsletterSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const result = await createPendingNewsletterSubscription({
      email: legacy.email,
      frequency: "weekly",
      language: "ar",
      consent: true,
    });

    expect(result.subscription).toBe(legacy);
    expect(result.confirmationSent).toBe(false);
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
    expect(mocks.updateValues).toHaveBeenCalledOnce();
  });

  it("does not send when confirmation or unsubscribe wins the atomic state transition", async () => {
    const legacy = {
      id: "legacy-1",
      email: "reader@example.invalid",
      status: "active",
      verifiedAt: new Date("2025-12-01T00:00:00.000Z"),
      updatedAt: new Date(Date.now() - 11 * 60 * 1000),
      metadata: {},
      preferences: { frequency: "weekly" },
    };
    mocks.findFirst.mockResolvedValue(legacy);
    // A zero-row RETURNING result means a concurrent writer changed status or
    // added the confirmed marker before this guarded UPDATE acquired its lock.
    mocks.updateReturning.mockResolvedValue([]);

    const { createPendingNewsletterSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const result = await createPendingNewsletterSubscription({
      email: legacy.email,
      frequency: "weekly",
      language: "ar",
      consent: true,
    });

    expect(result.confirmationSent).toBe(false);
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it("atomically activates a pending row and syncs its frequency group", async () => {
    const token = "a".repeat(64);
    const candidate = {
      id: "sub-1",
      email: "reader@example.invalid",
      status: "pending_confirmation",
      verificationToken: "hash",
      preferences: {
        frequency: "weekly",
        categories: [],
      },
      metadata: { confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString() },
      source: "footer",
    };
    const activated = {
      ...candidate,
      status: "active",
      verifiedAt: new Date(),
      verificationToken: null,
      metadata: {
        ...candidate.metadata,
        newsletterConsentVersion: 1,
        confirmedAt: new Date().toISOString(),
      },
    };
    mocks.findFirst.mockResolvedValueOnce(candidate).mockResolvedValueOnce(activated).mockResolvedValueOnce(activated);
    const where = vi.fn().mockResolvedValue([candidate]);
    const tx = {
      select: () => ({ from: () => ({ where: () => ({ for: where }) }) }),
      update: () => ({ set: () => ({ where: () => ({ returning: vi.fn().mockResolvedValue([activated]) }) }) }),
    };
    mocks.isMailerLiteConfigured.mockReturnValue(true);
    mocks.getMailerLiteSubscriber.mockResolvedValue({ success: false, notFound: true, error: "not found" });
    mocks.transaction.mockImplementation(async (callback: (tx: typeof tx) => unknown) => callback(tx));

    const { confirmNewsletterSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const result = await confirmNewsletterSubscription(token);

    expect(result.subscription.status).toBe("active");
    expect(mocks.subscribeToMailerLite).toHaveBeenCalledWith(expect.objectContaining({
      status: "active",
      groupIds: ["weekly-group"],
    }));
  });

  it.each(["unsubscribed", "bounced", "junk"])("does not reactivate terminal %s rows", async status => {
    mocks.findFirst.mockResolvedValue({ id: "sub-1", status });
    const { createPendingNewsletterSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const result = await createPendingNewsletterSubscription({
      email: "reader@example.invalid",
      frequency: "weekly",
      language: "ar",
      consent: true,
    });

    expect(result.subscription).toBeNull();
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.sendConfirmation).not.toHaveBeenCalled();
  });

  it("blocks activation when the local suppression list contains the address", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "sub-1",
      email: "reader@example.invalid",
      status: "pending_confirmation",
      verificationToken: "hash",
      metadata: { confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString() },
    });
    mocks.selectSuppression.mockResolvedValue([{ email: "reader@example.invalid" }]);
    const { confirmNewsletterSubscription } = await import("../../server/services/newsletterSubscriptionService");
    await expect(confirmNewsletterSubscription("b".repeat(64))).rejects.toThrow("NEWSLETTER_CONFIRMATION_SUPPRESSED");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("replays an already active confirmation without resending or reactivating", async () => {
    const active = {
      id: "sub-1",
      email: "reader@example.invalid",
      status: "active",
      verificationToken: "hash",
      verifiedAt: new Date(),
      metadata: {
        confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        newsletterConsentVersion: 1,
        confirmedAt: new Date().toISOString(),
        mailerliteSync: { status: "synced" },
      },
      preferences: { frequency: "daily" },
    };
    mocks.findFirst.mockResolvedValue(active);
    const { confirmNewsletterSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const result = await confirmNewsletterSubscription("c".repeat(64));
    expect(result.subscription.status).toBe("active");
    expect(result.mailerlite?.success).toBe(true);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.subscribeToMailerLite).not.toHaveBeenCalled();
  });

  it("does not sync a legacy active row without an explicit DOI marker", async () => {
    const { syncConfirmedSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const result = await syncConfirmedSubscription({
      id: "legacy-1",
      email: "reader@example.invalid",
      status: "active",
      verifiedAt: new Date(),
      metadata: {},
      preferences: { frequency: "daily", categories: [] },
    } as any);
    expect(result).toEqual({ success: false, error: "NEWSLETTER_CONFIRMATION_REQUIRED" });
    expect(mocks.subscribeToMailerLite).not.toHaveBeenCalled();
  });

  it("replays safely when another confirmer activates while this transaction waits", async () => {
    const token = "d".repeat(64);
    const active = {
      id: "sub-1",
      email: "reader@example.invalid",
      status: "active",
      verifiedAt: new Date(),
      verificationToken: "hash",
      metadata: {
        confirmationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        newsletterConsentVersion: 1,
        confirmedAt: new Date().toISOString(),
        mailerliteSync: { status: "synced" },
      },
      preferences: { frequency: "daily" },
    };
    mocks.findFirst.mockResolvedValue({
      ...active,
      status: "pending_confirmation",
      metadata: { confirmationExpiresAt: active.metadata.confirmationExpiresAt },
    });
    const where = vi.fn().mockResolvedValue([active]);
    mocks.transaction.mockImplementation(async (callback: (tx: any) => unknown) => callback({
      select: () => ({ from: () => ({ where: () => ({ for: where }) }) }),
    }));
    const { confirmNewsletterSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const result = await confirmNewsletterSubscription(token);
    expect(result.subscription.status).toBe("active");
    expect(result.mailerlite?.success).toBe(true);
    expect(mocks.subscribeToMailerLite).not.toHaveBeenCalled();
  });

  it("fails closed when MailerLite is not configured", async () => {
    const { syncConfirmedSubscription } = await import("../../server/services/newsletterSubscriptionService");
    const active = {
      id: "sub-1",
      email: "reader@example.invalid",
      status: "active",
      verifiedAt: new Date(),
      metadata: { newsletterConsentVersion: 1, confirmedAt: new Date().toISOString() },
      preferences: { frequency: "daily", categories: [] },
    };
    mocks.findFirst.mockResolvedValue(active);
    const result = await syncConfirmedSubscription(active as any);
    expect(result).toEqual({ success: false, error: "MAILERLITE_NOT_CONFIGURED" });
    expect(mocks.subscribeToMailerLite).not.toHaveBeenCalled();
  });
});


describe("provider synchronization safety", () => {
  const active = {
    id: "sub-1", email: "reader@example.invalid", status: "active", verifiedAt: new Date(),
    updatedAt: new Date(), metadata: { newsletterConsentVersion: 1, confirmedAt: new Date().toISOString() },
    preferences: { frequency: "daily", categories: [] },
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("MAILERLITE_DAILY_GROUP_ID", "daily-group");
    mocks.isMailerLiteConfigured.mockReturnValue(true);
    mocks.findFirst.mockResolvedValue(active);
    mocks.selectSuppression.mockResolvedValue([]);
    mocks.unsubscribeFromMailerLite.mockResolvedValue({ success: true });
  });
  it.each(["unsubscribed", "bounced", "junk"])("never mutates a remote %s subscriber", async status => {
    mocks.getMailerLiteSubscriber.mockResolvedValue({ success: true, data: { id: "ml-1", status } });
    const { syncConfirmedSubscription } = await import("../../server/services/newsletterSubscriptionService");
    expect((await syncConfirmedSubscription(active as any))?.success).toBe(false);
    expect(mocks.subscribeToMailerLite).not.toHaveBeenCalled();
    expect(mocks.updateMailerLiteSubscriber).not.toHaveBeenCalled();
  });
  it("never treats a lookup outage as a missing subscriber", async () => {
    mocks.getMailerLiteSubscriber.mockResolvedValue({ success: false, statusCode: 503, error: "unavailable" });
    const { syncConfirmedSubscription } = await import("../../server/services/newsletterSubscriptionService");
    expect((await syncConfirmedSubscription(active as any))?.success).toBe(false);
    expect(mocks.subscribeToMailerLite).not.toHaveBeenCalled();
  });
  it("suppression blocks all provider writes", async () => {
    mocks.selectSuppression.mockResolvedValue([{ email: active.email }]);
    const { syncConfirmedSubscription } = await import("../../server/services/newsletterSubscriptionService");
    expect((await syncConfirmedSubscription(active as any))?.success).toBe(false);
    expect(mocks.getMailerLiteSubscriber).not.toHaveBeenCalled();
    expect(mocks.subscribeToMailerLite).not.toHaveBeenCalled();
  });
  it("compensates cancellation even when creation succeeds but group reconciliation fails", async () => {
    mocks.findFirst.mockResolvedValueOnce(active).mockResolvedValue({ ...active, status: "unsubscribed" });
    mocks.getMailerLiteSubscriber.mockResolvedValue({ success: false, notFound: true });
    mocks.subscribeToMailerLite.mockResolvedValue({ success: true, data: { id: "ml-1" } });
    mocks.reconcileMailerLiteCadenceGroups.mockResolvedValue({ success: false, error: "group outage" });
    const { syncConfirmedSubscription } = await import("../../server/services/newsletterSubscriptionService");
    expect(await syncConfirmedSubscription(active as any)).toEqual({ success: false, error: "NEWSLETTER_LOCAL_STATE_CHANGED" });
    expect(mocks.unsubscribeFromMailerLite).toHaveBeenCalledWith("ml-1");
  });
  it("retry of terminal subscription only unsubscribes and treats remote404 as complete", async () => {
    mocks.findFirst.mockResolvedValue({ ...active, status: "unsubscribed" });
    mocks.getMailerLiteSubscriber.mockResolvedValue({ success: false, notFound: true });
    const { retryNewsletterMailerLiteSync } = await import("../../server/services/newsletterSubscriptionService");
    expect(await retryNewsletterMailerLiteSync(active.id)).toEqual({ success: true });
    expect(mocks.subscribeToMailerLite).not.toHaveBeenCalled();
    expect(mocks.updateMailerLiteSubscriber).not.toHaveBeenCalled();
  });
});
