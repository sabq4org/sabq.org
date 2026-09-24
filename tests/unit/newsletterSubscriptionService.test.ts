import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertValues: vi.fn(),
  updateValues: vi.fn(),
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
      set: () => ({
        where: () => ({ returning: vi.fn().mockResolvedValue([]) }),
      }),
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

  it("does not reactivate terminal unsubscribed rows", async () => {
    mocks.findFirst.mockResolvedValue({ id: "sub-1", status: "unsubscribed" });
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
