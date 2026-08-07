import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// اختبارات مسار العدّاد الحالي (#1374): الدفق يكتب إلى article_view_deltas
// عبر معاملة قصيرة المهلة، والدمج إلى articles.views يجري في استعلام CTE
// منفصل بـ SKIP LOCKED. (النسخة السابقة من هذه الاختبارات كانت تثبّت تصميم
// «تحديث articles مباشرة» الملغى ولم تُحدَّث مع #1374.)

type QueryFn = (sql: string, params?: unknown[]) => Promise<any>;

function mockPoolWithClient(queryImpl: QueryFn) {
  const query = vi.fn(queryImpl);
  const client = { query, release: vi.fn() };
  const connect = vi.fn().mockResolvedValue(client);
  return { pool: { connect, query }, query, connect };
}

const okResult = { rows: [] as any[] };

describe("articleViewCounterService", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("../../server/db");
  });

  it("combines repeated article increments into one batched delta insert", async () => {
    const { pool, query } = mockPoolWithClient(async () => okResult);
    vi.doMock("../../server/db", () => ({ pool }));

    const counter = await import("../../server/services/articleViewCounterService");
    counter.bufferArticleViewIncrement("article-a", 5);
    counter.bufferArticleViewIncrement("article-a", 7);
    counter.bufferArticleViewIncrement("article-b", 3);

    await counter.flushArticleViewCounters();

    const insertCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO article_view_deltas"),
    );
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1]).toEqual(["article-a", 12, "article-b", 3]);
    // لا لمس لجدول articles في مسار الدفق — هذا جوهر إصلاح #1374
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("UPDATE articles")),
    ).toBe(false);
  });

  it("re-buffers increments when a flush fails", async () => {
    let failNextInsert = true;
    const { pool, query } = mockPoolWithClient(async (sql) => {
      if (String(sql).includes("INSERT INTO article_view_deltas") && failNextInsert) {
        failNextInsert = false;
        throw new Error("temporary database failure");
      }
      return okResult;
    });
    vi.doMock("../../server/db", () => ({ pool }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const counter = await import("../../server/services/articleViewCounterService");
    counter.bufferArticleViewIncrement("article-a", 9);

    await counter.flushArticleViewCounters();
    await counter.flushArticleViewCounters();

    const insertCalls = query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO article_view_deltas"),
    );
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[1][1]).toEqual(["article-a", 9]);
  });

  it("merges deltas into articles.views with SKIP LOCKED and short local timeouts", async () => {
    const { pool, query } = mockPoolWithClient(async (sql) => {
      if (String(sql).includes("WITH picked")) {
        return { rows: [{ merged: 2, deferred: 1 }] };
      }
      return okResult;
    });
    vi.doMock("../../server/db", () => ({ pool }));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const counter = await import("../../server/services/articleViewCounterService");
    await counter.mergeArticleViewDeltas();

    const mergeCall = query.mock.calls.find(([sql]) => String(sql).includes("WITH picked"));
    expect(mergeCall).toBeDefined();
    expect(String(mergeCall![0])).toContain("FOR UPDATE OF a SKIP LOCKED");
    expect(String(mergeCall![0])).toContain("FOR UPDATE OF d SKIP LOCKED");
    // مهلات محلية قصيرة داخل المعاملة — لا تعتمد على إعدادات الجلسة
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("SET LOCAL statement_timeout")),
    ).toBe(true);
  });

  it("getLiveArticleViews caches the read for the micro-TTL window (single flight)", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ views: 7 }] });
    vi.doMock("../../server/db", () => ({ pool: { query } }));

    const counter = await import("../../server/services/articleViewCounterService");
    const [first, second] = await Promise.all([
      counter.getLiveArticleViews("article-a"),
      counter.getLiveArticleViews("article-a"),
    ]);
    const third = await counter.getLiveArticleViews("article-a");

    expect(first).toBe(7);
    expect(second).toBe(7);
    expect(third).toBe(7);
    // طلبان متزامنان + طلب لاحق داخل النافذة = استعلام واحد فقط
    expect(query).toHaveBeenCalledTimes(1);
  });
});
