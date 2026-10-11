import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const s: any = {
    article: null,
    initialArticle: null,
    articleAtLock: null,
    mutateBeforeTransaction: false,
    operations: [] as any[],
    operationCounter: 0,
    auditFailure: null as unknown,
    categoryFailure: null as unknown,
    rollbackReject: null as unknown,
    commitReject: null as unknown,
    articleUpdates: 0,
    queueCount: 0,
    transactionQueue: Promise.resolve(),
    inTransaction: false,
  };

  const kind = (table: any): string => {
    if (table?.operationId?.name === "operation_id") return "operations";
    if (table?.action?.name === "action" && table?.articleId?.name === "article_id") return "overrides";
    if (table?.title?.name === "title") return "articles";
    if (table?.slug?.name === "slug" && table?.nameAr?.name === "name_ar") return "categories";
    if (table?.role?.name === "role") return "users";
    if (table?.userName?.name === "user_name") return "locks";
    return "other";
  };

  const resultFor = (table: any, projection?: unknown): any[] => {
    const tableKind = kind(table);
    if (tableKind === "articles") {
      if (s.inTransaction && s.articleAtLock) return [s.articleAtLock];
      if (s.inTransaction && s.article?.status === "published") return [];
      return [s.inTransaction ? s.article : (s.initialArticle ?? s.article)].filter(Boolean);
    }
    if (tableKind === "operations") {
      const processing = s.operations.find((row) => row.status === "processing");
      return [processing ?? s.operations[0]].filter(Boolean);
    }
    if (tableKind === "categories") {
      if (s.categoryFailure) throw s.categoryFailure;
      return [{ slug: "local" }];
    }
    if (tableKind === "users") return [{ role: "admin" }];
    if (tableKind === "locks") return [];
    return [];
  };

  const chain = (operation: "select" | "insert" | "update", projection?: unknown) => {
    let table: any;
    let values: any;
    let mutationApplied = false;
    const applyUpdate = () => {
      if (mutationApplied || operation !== "update") return;
      mutationApplied = true;
      const tableKind = kind(table);
      if (tableKind === "articles") {
        s.articleUpdates += 1;
        s.article = { ...s.article, ...values };
      } else if (tableKind === "operations") {
        const row = s.operations.find((candidate) => candidate.status === "processing") ?? s.operations[0];
        if (row) Object.assign(row, values);
      }
    };
    const query: any = {
      from(next: any) { table = next; return query; },
      where() { return query; },
      limit() { return query; },
      for() { return query; },
      values(next: any) { values = next; return query; },
      set(next: any) { values = next; return query; },
      onConflictDoNothing() { return query; },
      returning() {
        if (operation === "insert") {
          const tableKind = kind(table);
          if (tableKind === "operations") {
            const existing = s.operations.find((row) => row.operationId === values.operationId && row.actorKey === values.actorKey && row.articleId === values.articleId);
            if (existing) return Promise.resolve([]);
            const row = { id: `op-row-${++s.operationCounter}`, ...values, response: null, error: null, completedAt: null };
            s.operations.push(row);
            return Promise.resolve([row]);
          }
          if (tableKind === "overrides") {
            if (s.auditFailure) return Promise.reject(s.auditFailure);
            return Promise.resolve([{ id: "override-1", ...values }]);
          }
        }
        if (operation === "update") {
          applyUpdate();
          const tableKind = kind(table);
          if (tableKind === "articles") {
            return Promise.resolve([s.article]);
          }
          if (tableKind === "operations") {
            const row = s.operations.find((candidate) => candidate.status === "processing") ?? s.operations[0];
            return Promise.resolve(row ? [row] : []);
          }
        }
        return Promise.resolve([]);
      },
      then(resolve: (value: any) => unknown, reject: (error: unknown) => unknown) {
        try { applyUpdate(); return Promise.resolve(resultFor(table, projection)).then(resolve, reject); }
        catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  };

  const db: any = {
    select: (projection?: unknown) => chain("select", projection),
    insert: (table: any) => { const q = chain("insert"); q.from(table); return q; },
    update: (table: any) => { const q = chain("update"); q.from(table); return q; },
    transaction: (callback: (tx: any) => Promise<unknown>) => {
      const run = s.transactionQueue.then(async () => {
        if (s.mutateBeforeTransaction) s.article = { ...s.article, riskLabel: "sensitive" };
        const articleSnapshot = s.article && { ...s.article };
        const operationsSnapshot = s.operations.map((row) => ({ ...row }));
        s.inTransaction = true;
        try {
          const tx = { ...db, execute: async () => [{ receipt_update: true, override_insert: true }] };
          let result: unknown;
          try {
            result = await callback(tx);
          } catch (callbackError) {
            if (s.rollbackReject) throw s.rollbackReject;
            s.article = articleSnapshot;
            s.operations = operationsSnapshot;
            throw callbackError;
          }
          // Model a successful COMMIT whose response is lost on the network:
          // writes remain durable, but the service cannot safely run effects.
          if (s.commitReject) throw s.commitReject;
          return result;
        } catch (callbackError) {
          throw callbackError;
        } finally {
          s.inTransaction = false;
        }
      });
      s.transactionQueue = run.catch(() => undefined);
      return run;
    },
  };
  return { s, db };
});

vi.mock("../../server/db", () => ({ db: state.db }));
vi.mock("../../server/rbac", () => ({
  getUserRoleNames: vi.fn(async () => ["admin"]),
  logActivity: vi.fn(async () => undefined),
}));
vi.mock("../../server/memoryCache", () => ({ memoryCache: { invalidatePattern: vi.fn() } }));
vi.mock("../../server/services/articleEventsService", () => ({ logArticleEvent: vi.fn(async () => undefined) }));
vi.mock("../../server/services/botDraftPublishEffects", () => ({ queueBotDraftPublishEffects: () => { state.s.queueCount += 1; } }));
vi.mock("../../server/services/mediaLicenseService", () => ({ assertMediaLicenseAllowsSubmission: vi.fn(async () => ({ ok: true })) }));
vi.mock("@shared/mediaLicense", () => ({ resolveContentBylineUserId: () => "author" }));
vi.mock("../../server/services/publishFirstService", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../server/services/publishFirstService")>();
  return {
    ...original,
    editorDisplayName: vi.fn(async () => "مدير النشر"),
  };
});

import {
  getBotDraftPublishOperation,
  publishBotDraft,
  type BotIdentity,
} from "../../server/services/botDraftsService";

const operationId = "11111111-1111-4111-8111-111111111111";
const makeArticle = (over: Record<string, unknown> = {}) => ({
  id: "art-1",
  source: "bot",
  status: "draft",
  title: "خبر تجريبي",
  subtitle: null,
  slug: "خبر-تجريبي",
  englishSlug: "test-news",
  content: "<p>نص الخبر</p>",
  excerpt: null,
  seo: null,
  categoryId: null,
  imageUrl: null,
  sourceUrl: null,
  keywords: [],
  sourceMetadata: { bot: "nashr-sabq" },
  authorId: "author",
  reporterId: "author",
  articleType: "news",
  riskLabel: "safe",
  publishedAt: null,
  scheduledAt: null,
  createdAt: new Date("2026-10-02T00:00:00.000Z"),
  updatedAt: new Date("2026-10-02T00:00:00.000Z"),
  ...over,
});
const legacyBot: BotIdentity = { name: "nashr-sabq" };
const personalAdmin: BotIdentity = {
  name: "publisher-user-1",
  personal: { userId: "user-1", publisherId: null, tokenId: "token-1", capabilities: ["publish"] } as any,
};

function reset(over: Record<string, unknown> = {}) {
  Object.assign(state.s, {
    article: makeArticle(over),
    initialArticle: null,
    articleAtLock: null,
    mutateBeforeTransaction: false,
    operations: [],
    operationCounter: 0,
    auditFailure: null,
    categoryFailure: null,
    rollbackReject: null,
    commitReject: null,
    articleUpdates: 0,
    queueCount: 0,
    transactionQueue: Promise.resolve(),
    inTransaction: false,
  });
}

describe("BotDraft publish operation receipts", () => {
  beforeEach(() => reset());

  it("publishes a story labelled sensitive with no reviewer verdict", async () => {
    state.s.article = makeArticle({ riskLabel: "sensitive" });
    await expect(publishBotDraft(legacyBot, "art-1", {}, { operationId })).resolves.toMatchObject({ status: "succeeded", operationId });
    expect(state.s.article.status).toBe("published");
    expect(state.s.article.riskLabel).toBe("sensitive");
  });

  it("replays a successful receipt after a lost response without queueing effects twice", async () => {
    const first = await publishBotDraft(legacyBot, "art-1", {}, { operationId });
    expect(first).toMatchObject({ status: "succeeded", operationId });
    expect(state.s.queueCount).toBe(1);
    const receipt = await getBotDraftPublishOperation(legacyBot, "art-1", operationId);
    expect(receipt).toMatchObject({ status: "succeeded", response: { status: "published" } });
    const replay = await publishBotDraft(legacyBot, "art-1", {}, { operationId });
    expect(replay).toMatchObject({ status: "succeeded", operationId });
    expect(state.s.queueCount).toBe(1);
  });

  it("replays the same receipt when an older client resends legacy override fields", async () => {
    await publishBotDraft(legacyBot, "art-1", {}, { operationId });
    const legacyOptions = { operationId, sensitiveOverride: true, overrideReason: "سبب" } as { operationId: string };
    await expect(publishBotDraft(legacyBot, "art-1", {}, legacyOptions)).resolves.toMatchObject({ status: "succeeded", operationId });
    expect(state.s.articleUpdates).toBe(1);
    expect(state.s.queueCount).toBe(1);
  });

  it("keeps a different actor's operation receipt isolated after the article is published", async () => {
    await publishBotDraft(legacyBot, "art-1", {}, { operationId });
    const otherOperationId = "33333333-3333-4333-8333-333333333333";
    await expect(publishBotDraft(personalAdmin, "art-1", {}, { operationId: otherOperationId })).rejects.toMatchObject({
      httpStatus: 409,
      code: "not_a_draft",
    });
    expect(state.s.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorKey: "legacy:nashr-sabq", operationId, status: "succeeded" }),
      expect.objectContaining({ actorKey: "personal:user-1", operationId: otherOperationId, status: "failed" }),
    ]));
    expect(state.s.articleUpdates).toBe(1);
    expect(state.s.queueCount).toBe(1);
  });

  it("leaves processing when rollback itself fails, preserving uncertainty", async () => {
    state.s.categoryFailure = new Error("transport failed after update");
    state.s.rollbackReject = new Error("rollback transport failed");
    await expect(publishBotDraft(legacyBot, "art-1", {}, { operationId })).rejects.toThrow("rollback transport failed");
    expect(state.s.operations[0]).toMatchObject({ status: "processing" });
  });

  it("resolves a lost COMMIT response from the durable success receipt", async () => {
    state.s.commitReject = new Error("commit response lost");
    await expect(publishBotDraft(legacyBot, "art-1", {}, { operationId })).rejects.toThrow("commit response lost");
    expect(state.s.operations[0]).toMatchObject({ status: "succeeded" });
    expect(state.s.queueCount).toBe(0);
    await expect(getBotDraftPublishOperation(legacyBot, "art-1", operationId)).resolves.toMatchObject({
      status: "succeeded",
      response: { status: "published" },
    });
  });

  it("serializes two operation ids so only one can publish and notify", async () => {
    const secondId = "22222222-2222-4222-8222-222222222222";
    const results = await Promise.allSettled([
      publishBotDraft(legacyBot, "art-1", {}, { operationId }),
      publishBotDraft(legacyBot, "art-1", {}, { operationId: secondId }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(state.s.article.status).toBe("published");
    expect(state.s.queueCount).toBe(1);
    expect(state.s.operations.map((row) => row.status).sort()).toEqual(["failed", "succeeded"]);
  });

  it("publishes even when the risk label turns sensitive before the row lock", async () => {
    state.s.initialArticle = makeArticle({ riskLabel: "safe" });
    state.s.article = makeArticle({ riskLabel: "safe" });
    state.s.mutateBeforeTransaction = true;
    await expect(publishBotDraft(legacyBot, "art-1", {}, { operationId })).resolves.toMatchObject({ status: "succeeded" });
    expect(state.s.article.status).toBe("published");
    expect(state.s.article.riskLabel).toBe("sensitive");
  });
});
