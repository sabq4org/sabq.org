// فحص الظل لتطابق العنوان مع المتن (Gemini Decisions).
// الشرط الأساسي: مطفأ افتراضياً بلا أي أثر، ولا يرمي أبداً في مسار النشر.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(() => {
    throw new Error("db.select must not be called");
  }),
  insert: vi.fn(() => {
    throw new Error("db.insert must not be called");
  }),
}));

vi.mock("../../server/db", () => ({ db: dbMock }));

import {
  GEMINI_DECISIONS_URL,
  TITLE_CHECK_FALSE_DESCRIPTION,
  TITLE_CHECK_INSTRUCTIONS,
  TITLE_CHECK_MAX_BODY_CHARS,
  TITLE_CHECK_TRUE_DESCRIPTION,
  __resetTitleCheckStateForTests,
  decideFromProbability,
  isTitleCheckEnabled,
  runTitleConsistencyCheck,
  scheduleTitleConsistencyCheck,
  scheduleTitleConsistencyCheckById,
  titleCheckInputHash,
  toPlainText,
  type TitleCheckRow,
  type TitleCheckStore,
} from "../../server/services/titleConsistencyService";
import { installTitleCheckStorageHooks } from "../../server/services/titleConsistencyHooks";

const PLANTED = "planted-value-for-redaction-test";
const BODY =
  "<p>أعلنت الهيئة العامة للإحصاء أن معدل التضخم في المملكة ارتفع إلى 2.3% في أكتوبر مقارنة بالشهر نفسه من العام الماضي، مدفوعاً بأسعار السكن.</p>";
const article = (over: Record<string, unknown> = {}) => ({
  id: "art-1",
  status: "published",
  title: "التضخم في المملكة يرتفع إلى 2.3% في أكتوبر",
  content: BODY,
  ...over,
});

function okResponse(probability: number, tokens = 1276) {
  return new Response(
    JSON.stringify({
      answers: { title_ar: { confidence: probability, noul: probability, type: "noul" } },
      usage: { total_input_tokens: tokens, total_output_tokens: 0 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function fakeStore(stored: string | null = null) {
  const rows: TitleCheckRow[] = [];
  const store: TitleCheckStore & { rows: TitleCheckRow[] } = {
    rows,
    getStoredHash: vi.fn(async () => stored),
    upsert: vi.fn(async (row: TitleCheckRow) => {
      rows.push(row);
    }),
    loadArticle: vi.fn(async () => article()),
  };
  return store;
}

async function flush(times = 5) {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

const ENV_KEYS = ["GEMINI_TITLE_CHECK_ENABLED", "GEMINI_API_KEY"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  delete process.env.GEMINI_TITLE_CHECK_ENABLED;
  delete process.env.GEMINI_API_KEY;
  __resetTitleCheckStateForTests();
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function enable() {
  process.env.GEMINI_TITLE_CHECK_ENABLED = "true";
  process.env.GEMINI_API_KEY = PLANTED;
}

describe("feature flag", () => {
  it("flag off: schedule does nothing — no fetch, no db, no timers", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const immediateSpy = vi.spyOn(global, "setImmediate");
    process.env.GEMINI_API_KEY = PLANTED; // المفتاح وحده لا يكفي
    expect(isTitleCheckEnabled()).toBe(false);
    scheduleTitleConsistencyCheck(article());
    scheduleTitleConsistencyCheckById("art-1");
    expect(immediateSpy).not.toHaveBeenCalled();
    immediateSpy.mockRestore();
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("flag on but no key: nothing happens", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    process.env.GEMINI_TITLE_CHECK_ENABLED = "true";
    expect(isTitleCheckEnabled()).toBe(false);
    scheduleTitleConsistencyCheck(article());
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("flag on: only published articles with touched content are scheduled", async () => {
    enable();
    const fetchImpl = vi.fn(async () => okResponse(0.9));
    const store = fakeStore();
    scheduleTitleConsistencyCheck(article({ status: "draft" }), {}, { fetchImpl, store });
    scheduleTitleConsistencyCheck(article(), { touched: false }, { fetchImpl, store });
    scheduleTitleConsistencyCheck(null, {}, { fetchImpl, store });
    await flush();
    expect(fetchImpl).not.toHaveBeenCalled();

    scheduleTitleConsistencyCheck(article(), { touched: true }, { fetchImpl, store });
    await vi.waitFor(() => expect(store.upsert).toHaveBeenCalledTimes(1));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("schedule never throws even if the store explodes", async () => {
    enable();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = fakeStore();
    store.getStoredHash = vi.fn(async () => {
      throw Object.assign(new Error('relation "article_title_checks" does not exist'), { code: "42P01" });
    });
    const fetchImpl = vi.fn(async () => okResponse(0.9));
    expect(() => scheduleTitleConsistencyCheck(article(), {}, { fetchImpl, store })).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(fetchImpl).not.toHaveBeenCalled(); // لا تكلفة نداء إن كان الجدول غائباً
  });
});

describe("decision parsing", () => {
  beforeEach(enable);

  it("0.111 → review_title, flagged", async () => {
    const store = fakeStore();
    const result = await runTitleConsistencyCheck(article(), { fetchImpl: vi.fn(async () => okResponse(0.111, 900)), store });
    expect(result).toMatchObject({ probability: 0.111, decision: "review_title", flagged: true, inputTokens: 900 });
    expect(typeof result.latencyMs).toBe("number");
    expect(store.rows[0]).toMatchObject({ articleId: "art-1", decision: "review_title", flagged: true, probability: 0.111, error: null });
  });

  it("0.93 → consistent", async () => {
    const store = fakeStore();
    const result = await runTitleConsistencyCheck(article(), { fetchImpl: vi.fn(async () => okResponse(0.93)), store });
    expect(result).toMatchObject({ probability: 0.93, decision: "consistent", flagged: false, inputTokens: 1276 });
  });

  it("threshold boundary at 0.5", () => {
    expect(decideFromProbability(0.5)).toEqual({ decision: "consistent", flagged: false });
    expect(decideFromProbability(0.4999)).toEqual({ decision: "review_title", flagged: true });
  });

  it("malformed answer → error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = fakeStore();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answers: {} }), { status: 200 }));
    const result = await runTitleConsistencyCheck(article(), { fetchImpl, store });
    expect(result).toMatchObject({ decision: "error", flagged: false, probability: null, error: "bad_response" });
  });
});

describe("request", () => {
  beforeEach(enable);

  it("posts model gemini-decision-1 with the exact Arabic question and the key header", async () => {
    const fetchImpl = vi.fn(async (..._args: Parameters<typeof fetch>) => okResponse(0.9));
    await runTitleConsistencyCheck(article(), { fetchImpl, store: fakeStore() });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(GEMINI_DECISIONS_URL);
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/decisions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "x-goog-api-key": PLANTED, "Content-Type": "application/json" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("gemini-decision-1");
    expect(body.input).toBe(`العنوان: ${article().title}\n\nالمتن:\n${toPlainText(BODY)}`);
    expect(body.questions.title_ar).toEqual({
      type: "noul",
      instructions:
        "هل يعكس «العنوان» مضمون «المتن» بدقة، بحيث لا يحتوي على رقم أو اسم أو مكان أو جهة أو اتجاه (ارتفاع/انخفاض) يخالف ما ورد في المتن أو غير موجود فيه؟",
      criteria: {
        true_description: "العنوان يلخّص خبر المتن نفسه، وكل رقم واسم ومكان فيه مطابق لما في المتن.",
        false_description: "العنوان عن موضوع آخر، أو فيه رقم أو اسم أو مكان أو اتجاه مختلف عن المتن أو غير موجود فيه.",
      },
    });
    expect(body.questions.title_ar.instructions).toBe(TITLE_CHECK_INSTRUCTIONS);
    expect(body.questions.title_ar.criteria.true_description).toBe(TITLE_CHECK_TRUE_DESCRIPTION);
    expect(body.questions.title_ar.criteria.false_description).toBe(TITLE_CHECK_FALSE_DESCRIPTION);
    expect(JSON.stringify(body)).not.toContain(PLANTED);
  });
});

describe("failures are swallowed", () => {
  beforeEach(enable);

  it("timeout after 5s aborts → decision error, no throw", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const store = fakeStore();
    const pending = runTitleConsistencyCheck(article(), { fetchImpl: fetchImpl as typeof fetch, store });
    await vi.advanceTimersByTimeAsync(4999);
    expect(store.upsert).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(result).toMatchObject({ decision: "error", flagged: false, probability: null, error: "timeout" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.rows[0]).toMatchObject({ decision: "error", flagged: false, probability: null, error: "timeout" });
  });

  it("non-200 → error, fetch called once (no retry), retried on the next save", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response("quota", { status: 429 }));
    const store = fakeStore();
    const result = await runTitleConsistencyCheck(article(), { fetchImpl, store });
    expect(result).toMatchObject({ decision: "error", error: "HTTP 429" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // الخطأ لا يُحفظ في ذاكرة التكرار: الحفظ التالي يعيد المحاولة.
    await runTitleConsistencyCheck(article(), { fetchImpl, store });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("the API key never appears in logs or results", async () => {
    const logged: unknown[] = [];
    for (const level of ["warn", "error", "log", "debug", "info"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(...args);
      });
    }
    const fetchImpl = vi.fn(async () => {
      throw new Error(`connect failed for key=${PLANTED}`);
    });
    const store = fakeStore();
    const result = await runTitleConsistencyCheck(article(), { fetchImpl, store });
    expect(result.decision).toBe("error");
    expect(result.error).toContain("***");
    expect(logged.length).toBeGreaterThan(0);
    const all = JSON.stringify(logged) + JSON.stringify(result) + JSON.stringify(store.rows);
    expect(all).not.toContain(PLANTED);
  });
});

describe("dedupe and concurrency", () => {
  beforeEach(enable);

  it("same stored hash → skipped without calling Gemini", async () => {
    const title = article().title;
    const stored = titleCheckInputHash(title, toPlainText(BODY));
    const store = fakeStore(stored);
    const fetchImpl = vi.fn(async () => okResponse(0.9));
    const result = await runTitleConsistencyCheck(article(), { fetchImpl, store });
    expect(result.skipped).toBe("unchanged");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("in-memory hash skips the db read after a successful check; a changed title re-checks", async () => {
    const store = fakeStore();
    const fetchImpl = vi.fn(async () => okResponse(0.9));
    await runTitleConsistencyCheck(article(), { fetchImpl, store });
    expect(store.getStoredHash).toHaveBeenCalledTimes(1);
    const again = await runTitleConsistencyCheck(article(), { fetchImpl, store });
    expect(again.skipped).toBe("unchanged");
    expect(store.getStoredHash).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await runTitleConsistencyCheck(article({ title: "التضخم في المملكة ينخفض إلى 1.2%" }), { fetchImpl, store });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("one check per article in flight, at most 3 overall", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const releases: Array<() => void> = [];
    const fetchImpl = vi.fn(
      () => new Promise<Response>((resolve) => releases.push(() => resolve(okResponse(0.9)))),
    );
    const store = fakeStore();
    const runs = ["a", "b", "c"].map((id) => runTitleConsistencyCheck(article({ id }), { fetchImpl, store }));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    expect((await runTitleConsistencyCheck(article({ id: "a" }), { fetchImpl, store })).skipped).toBe("in_flight");
    expect((await runTitleConsistencyCheck(article({ id: "d" }), { fetchImpl, store })).skipped).toBe("busy");
    expect((await runTitleConsistencyCheck(article({ id: "e" }), { fetchImpl, store })).skipped).toBe("busy");
    expect(debug).toHaveBeenCalledTimes(1); // يُسجَّل مرة واحدة فقط
    releases.forEach((release) => release());
    await Promise.all(runs);
    fetchImpl.mockImplementation(async () => okResponse(0.9));
    expect((await runTitleConsistencyCheck(article({ id: "d" }), { fetchImpl, store })).decision).toBe("consistent");
  });

  it("empty title or short body is skipped", async () => {
    const fetchImpl = vi.fn(async () => okResponse(0.9));
    const store = fakeStore();
    expect((await runTitleConsistencyCheck(article({ title: "  " }), { fetchImpl, store })).skipped).toBe("empty");
    expect((await runTitleConsistencyCheck(article({ content: "<p>قصير جداً</p>" }), { fetchImpl, store })).skipped).toBe("empty");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("by id: loads the row and skips unpublished ones", async () => {
    const fetchImpl = vi.fn(async () => okResponse(0.9));
    const store = fakeStore();
    store.loadArticle = vi.fn(async () => article({ status: "archived" }));
    expect((await runTitleConsistencyCheck("art-1", { fetchImpl, store })).skipped).toBe("not_published");
    store.loadArticle = vi.fn(async () => article());
    expect((await runTitleConsistencyCheck("art-1", { fetchImpl, store })).decision).toBe("consistent");
  });
});

describe("toPlainText", () => {
  it("strips tags, scripts and entities and collapses whitespace", () => {
    const html =
      '<h2>عنوان&nbsp;فرعي</h2>\n<p>نص   <strong>مهم</strong> &amp; &quot;مقتبس&quot; &#1587;&#x628;&#1602;</p><script>alert(1)</script><style>p{}</style><!-- note --><br/>نهاية';
    expect(toPlainText(html)).toBe('عنوان فرعي نص مهم & "مقتبس" سبق نهاية');
  });

  it("truncates to 12000 characters", () => {
    const html = `<p>${"أ".repeat(20000)}</p>`;
    expect(toPlainText(html)).toHaveLength(TITLE_CHECK_MAX_BODY_CHARS);
    expect(toPlainText(null)).toBe("");
  });
});

describe("storage hooks", () => {
  it("wraps create/update, passes results and errors through, and computes touched", async () => {
    enable();
    const created = article({ id: "new-1" });
    const target = {
      createArticle: vi.fn(async () => created as any),
      updateArticle: vi.fn(async (id: string) => ({ ...article(), id }) as any),
    };
    const originalUpdate = target.updateArticle;
    installTitleCheckStorageHooks(target);
    installTitleCheckStorageHooks(target); // مرة واحدة فقط
    const immediateSpy = vi.spyOn(global, "setImmediate");

    await expect(target.createArticle({} as any)).resolves.toBe(created);
    expect(immediateSpy).toHaveBeenCalledTimes(1);

    await target.updateArticle("x", { isFeatured: true } as any);
    expect(immediateSpy).toHaveBeenCalledTimes(1); // لم يُلمس العنوان/المتن/الحالة

    await target.updateArticle("x", { title: "جديد" } as any);
    expect(immediateSpy).toHaveBeenCalledTimes(2);
    expect(originalUpdate).toHaveBeenCalledTimes(2);

    originalUpdate.mockRejectedValueOnce(new Error("write failed"));
    await expect(target.updateArticle("x", { title: "y" } as any)).rejects.toThrow("write failed");
    immediateSpy.mockRestore();
    __resetTitleCheckStateForTests();
  });
});

// ── المسار ───────────────────────────────────────────────────────────────────
const routeMocks = vi.hoisted(() => ({
  listFlaggedTitleChecks: vi.fn(),
  getTitleCheckForArticle: vi.fn(),
  isTitleCheckEnabled: vi.fn(() => false),
}));

vi.mock("../../server/rbac", () => ({
  requireAuth: (req: any, res: any, next: any) => (req.headers["x-test-user"] ? next() : res.sendStatus(401)),
  requirePermission: (code: string) => (req: any, res: any, next: any) =>
    String(req.headers["x-test-permission"] || "").split(",").includes(code) ? next() : res.sendStatus(403),
}));

describe("GET /api/internal/title-checks", () => {
  let base = "";
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    vi.doMock("../../server/services/titleConsistencyService", () => routeMocks);
    const { default: router } = await import("../../server/routes/titleChecks");
    const app = express();
    app.use(router);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    vi.doUnmock("../../server/services/titleConsistencyService");
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    routeMocks.listFlaggedTitleChecks.mockReset();
    routeMocks.getTitleCheckForArticle.mockReset();
    routeMocks.isTitleCheckEnabled.mockReturnValue(false);
  });

  const auth = { "x-test-user": "u1", "x-test-permission": "articles.view" };

  it("requires auth and articles.view", async () => {
    expect((await fetch(`${base}/api/internal/title-checks`)).status).toBe(401);
    const res = await fetch(`${base}/api/internal/title-checks`, { headers: { "x-test-user": "u1" } });
    expect(res.status).toBe(403);
    expect(routeMocks.listFlaggedTitleChecks).not.toHaveBeenCalled();
  });

  it("defaults to limit 50, flagged only, and returns items with the label", async () => {
    routeMocks.isTitleCheckEnabled.mockReturnValue(true);
    routeMocks.listFlaggedTitleChecks.mockResolvedValue([
      { articleId: "a1", title: "ع", slug: "s", publishedAt: null, probability: 0.1, decision: "review_title", flagged: true, checkedAt: "2026-11-11T00:00:00.000Z", label: "راجع العنوان" },
    ]);
    const res = await fetch(`${base}/api/internal/title-checks`, { headers: auth });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body).toMatchObject({ enabled: true, limit: 50, offset: 0 });
    expect(body.items[0].label).toBe("راجع العنوان");
    expect(routeMocks.listFlaggedTitleChecks).toHaveBeenCalledWith({ limit: 50, offset: 0, includeAll: false });
  });

  it("passes all=true and validates limit 1..100", async () => {
    routeMocks.listFlaggedTitleChecks.mockResolvedValue([]);
    await fetch(`${base}/api/internal/title-checks?limit=100&offset=20&all=true`, { headers: auth });
    expect(routeMocks.listFlaggedTitleChecks).toHaveBeenCalledWith({ limit: 100, offset: 20, includeAll: true });
    expect((await fetch(`${base}/api/internal/title-checks?limit=0`, { headers: auth })).status).toBe(400);
    expect((await fetch(`${base}/api/internal/title-checks?limit=101`, { headers: auth })).status).toBe(400);
  });

  it("missing table → 200 with tableMissing", async () => {
    routeMocks.listFlaggedTitleChecks.mockRejectedValue(Object.assign(new Error("missing"), { code: "42P01" }));
    const res = await fetch(`${base}/api/internal/title-checks`, { headers: auth });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ enabled: false, items: [], tableMissing: true });
  });
  it("article endpoint: auth, returns the stored check, null when unchecked, tableMissing tolerated", async () => {
    expect((await fetch(`${base}/api/internal/title-checks/article/a1`)).status).toBe(401);
    expect((await fetch(`${base}/api/internal/title-checks/article/a1`, { headers: { "x-test-user": "u1" } })).status).toBe(403);
    routeMocks.getTitleCheckForArticle.mockResolvedValueOnce({ articleId: "a1", probability: 0.11, decision: "review_title", flagged: true, label: "راجع العنوان" });
    let res = await fetch(`${base}/api/internal/title-checks/article/a1`, { headers: auth });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await res.json()).item).toMatchObject({ flagged: true, label: "راجع العنوان" });
    expect(routeMocks.getTitleCheckForArticle).toHaveBeenCalledWith("a1");
    routeMocks.getTitleCheckForArticle.mockResolvedValueOnce(null);
    res = await fetch(`${base}/api/internal/title-checks/article/a2`, { headers: auth });
    expect((await res.json()).item).toBeNull();
    routeMocks.getTitleCheckForArticle.mockRejectedValueOnce(Object.assign(new Error("missing"), { code: "42P01" }));
    res = await fetch(`${base}/api/internal/title-checks/article/a3`, { headers: auth });
    expect(await res.json()).toMatchObject({ item: null, tableMissing: true });
  });
});

