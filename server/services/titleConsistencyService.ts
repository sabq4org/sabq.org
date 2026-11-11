// ----------------------------------------------------------------------------
// فحص ظل لتطابق العنوان مع المتن عبر Gemini Decisions API.
//
// معلوماتي فقط: لا يمنع النشر ولا يؤخره ولا يُفشله (سياسة سبق: لا بوابة نشر).
// مطفأ افتراضياً: GEMINI_TITLE_CHECK_ENABLED=true + GEMINI_API_KEY، يُقرآن عند كل
// استدعاء. عند الإطفاء scheduleTitleConsistencyCheck يعود فوراً بلا قاعدة ولا مؤقت.
//
// - نداء REST واحد (fetch) بمهلة 5 ثوانٍ، بلا إعادة محاولة.
// - تكرار المدخل نفسه يُتجاوز: sha256(العنوان + المتن) يُقارن بالمخزّن (وبذاكرة
//   محلية لكل نسخة)، وفحص واحد لكل خبر في الوقت نفسه، و3 فحوص متزامنة كحد أقصى
//   (الزائد يُسقط ولا يُصف في طابور).
// - النتيجة في جدول article_title_checks (صف لكل خبر). عند الخطأ يُسجَّل
//   decision=error دون تحديث input_hash، فيُعاد الفحص عند الحفظ التالي.
// ----------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { articles, articleTitleChecks } from "@shared/schema";
import { db } from "../db";

export const GEMINI_DECISIONS_URL = "https://generativelanguage.googleapis.com/v1beta/decisions";
export const TITLE_CHECK_MODEL = "gemini-decision-1";
export const TITLE_CHECK_QUESTION_KEY = "title_ar";
// النصوص التالية جُرّبت كما هي (24/24 عنواناً خاطئاً اكتُشف، بلا إنذار كاذب). لا تُعدَّل.
export const TITLE_CHECK_INSTRUCTIONS =
  "هل يعكس «العنوان» مضمون «المتن» بدقة، بحيث لا يحتوي على رقم أو اسم أو مكان أو جهة أو اتجاه (ارتفاع/انخفاض) يخالف ما ورد في المتن أو غير موجود فيه؟";
export const TITLE_CHECK_TRUE_DESCRIPTION =
  "العنوان يلخّص خبر المتن نفسه، وكل رقم واسم ومكان فيه مطابق لما في المتن.";
export const TITLE_CHECK_FALSE_DESCRIPTION =
  "العنوان عن موضوع آخر، أو فيه رقم أو اسم أو مكان أو اتجاه مختلف عن المتن أو غير موجود فيه.";
export const TITLE_CHECK_LABEL = "راجع العنوان";

export const TITLE_CHECK_THRESHOLD = 0.5;
export const TITLE_CHECK_TIMEOUT_MS = 5000;
export const TITLE_CHECK_MAX_BODY_CHARS = 12000;
export const TITLE_CHECK_MIN_BODY_CHARS = 80;
export const TITLE_CHECK_MAX_CONCURRENCY = 3;
const HASH_MEMO_LIMIT = 2000;

export type TitleCheckDecision = "consistent" | "review_title" | "error";

export interface TitleCheckArticle {
  id: string;
  status?: string | null;
  title?: string | null;
  content?: string | null;
}

export interface TitleCheckResult {
  articleId: string;
  probability: number | null;
  decision: TitleCheckDecision | null;
  flagged: boolean;
  latencyMs: number | null;
  inputTokens: number | null;
  skipped?: "disabled" | "no_key" | "not_found" | "not_published" | "empty" | "unchanged" | "in_flight" | "busy";
  error?: string;
}

export interface TitleCheckRow {
  articleId: string;
  inputHash: string;
  probability: number | null;
  decision: TitleCheckDecision;
  flagged: boolean;
  latencyMs: number | null;
  inputTokens: number | null;
  error: string | null;
}

export interface TitleCheckStore {
  getStoredHash(articleId: string): Promise<string | null>;
  upsert(row: TitleCheckRow): Promise<void>;
  loadArticle(articleId: string): Promise<TitleCheckArticle | null>;
}

export interface TitleCheckDeps {
  fetchImpl?: typeof fetch;
  store?: TitleCheckStore;
}

export function isTitleCheckEnabled(): boolean {
  return process.env.GEMINI_TITLE_CHECK_ENABLED === "true" && !!process.env.GEMINI_API_KEY;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  zwnj: "‌",
  zwj: "‍",
  rlm: "",
  lrm: "",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return " ";
      try {
        return String.fromCodePoint(code);
      } catch {
        return " ";
      }
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named ?? " ";
  });
}

/** HTML المتن إلى نص عادي: بلا وسوم ولا كيانات، مسافات مطوية، 12000 حرف كحد أقصى. */
export function toPlainText(html: string | null | undefined, maxChars = TITLE_CHECK_MAX_BODY_CHARS): string {
  if (!html) return "";
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxChars ? text.slice(0, maxChars).trim() : text;
}

export function titleCheckInputHash(title: string, bodyText: string): string {
  return createHash("sha256").update(`${title}\n${bodyText}`).digest("hex");
}

export function buildTitleCheckRequest(title: string, bodyText: string) {
  return {
    model: TITLE_CHECK_MODEL,
    input: `العنوان: ${title}\n\nالمتن:\n${bodyText}`,
    questions: {
      [TITLE_CHECK_QUESTION_KEY]: {
        type: "noul",
        instructions: TITLE_CHECK_INSTRUCTIONS,
        criteria: {
          true_description: TITLE_CHECK_TRUE_DESCRIPTION,
          false_description: TITLE_CHECK_FALSE_DESCRIPTION,
        },
      },
    },
  };
}

export function decideFromProbability(probability: number): { decision: TitleCheckDecision; flagged: boolean } {
  const flagged = probability < TITLE_CHECK_THRESHOLD;
  return { decision: flagged ? "review_title" : "consistent", flagged };
}

// ── الحالة داخل النسخة ───────────────────────────────────────────────────────
const hashMemo = new Map<string, string>();
const inFlight = new Set<string>();
let busyDropLogged = false;

function rememberHash(articleId: string, hash: string): void {
  hashMemo.delete(articleId);
  hashMemo.set(articleId, hash);
  if (hashMemo.size > HASH_MEMO_LIMIT) {
    const oldest = hashMemo.keys().next().value;
    if (oldest !== undefined) hashMemo.delete(oldest);
  }
}

/** للاختبارات فقط. */
export function __resetTitleCheckStateForTests(): void {
  hashMemo.clear();
  inFlight.clear();
  busyDropLogged = false;
}

function redact(message: string, key: string | undefined): string {
  let out = message;
  if (key) out = out.split(key).join("***");
  return out.replace(/\s+/g, " ").slice(0, 200);
}

const dbStore: TitleCheckStore = {
  async getStoredHash(articleId) {
    const [row] = await db
      .select({ inputHash: articleTitleChecks.inputHash })
      .from(articleTitleChecks)
      .where(eq(articleTitleChecks.articleId, articleId))
      .limit(1);
    return row?.inputHash ?? null;
  },
  async upsert(row) {
    // خطأ: input_hash فارغ عند الإدراج ولا يُحدَّث عند التعارض، فيُعاد الفحص
    // عند الحفظ التالي حتى لو لم يتغير المدخل.
    const isError = row.decision === "error";
    const values = { ...row, inputHash: isError ? "" : row.inputHash, model: TITLE_CHECK_MODEL, checkedAt: new Date() };
    const set: Record<string, unknown> = {
      probability: values.probability,
      decision: values.decision,
      flagged: values.flagged,
      model: values.model,
      latencyMs: values.latencyMs,
      inputTokens: values.inputTokens,
      error: values.error,
      checkedAt: values.checkedAt,
    };
    if (!isError) set.inputHash = values.inputHash;
    await db
      .insert(articleTitleChecks)
      .values(values)
      .onConflictDoUpdate({ target: articleTitleChecks.articleId, set });
  },
  async loadArticle(articleId) {
    const [row] = await db
      .select({ id: articles.id, status: articles.status, title: articles.title, content: articles.content })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);
    return row ?? null;
  },
};

async function callGeminiDecision(
  title: string,
  bodyText: string,
  key: string,
  fetchImpl: typeof fetch,
): Promise<{ probability: number; inputTokens: number | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TITLE_CHECK_TIMEOUT_MS);
  try {
    const response = await fetchImpl(GEMINI_DECISIONS_URL, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(buildTitleCheckRequest(title, bodyText)),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = (await response.json()) as {
      answers?: Record<string, { noul?: unknown }>;
      usage?: { total_input_tokens?: unknown };
    };
    const probability = json?.answers?.[TITLE_CHECK_QUESTION_KEY]?.noul;
    if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error("bad_response");
    }
    const tokens = json?.usage?.total_input_tokens;
    return { probability, inputTokens: typeof tokens === "number" && Number.isFinite(tokens) ? Math.round(tokens) : null };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function skippedResult(articleId: string, skipped: NonNullable<TitleCheckResult["skipped"]>): TitleCheckResult {
  return { articleId, probability: null, decision: null, flagged: false, latencyMs: null, inputTokens: null, skipped };
}

/**
 * ينفّذ الفحص ويحفظه. للاختبارات والإثبات اليدوي؛ المسارات الحية تستدعي
 * scheduleTitleConsistencyCheck. لا يرمي إلا عند خطأ قاعدة قبل النداء.
 */
export async function runTitleConsistencyCheck(
  input: string | TitleCheckArticle,
  deps: TitleCheckDeps = {},
): Promise<TitleCheckResult> {
  const articleId = typeof input === "string" ? input : input.id;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return skippedResult(articleId, "no_key");
  if (inFlight.has(articleId)) return skippedResult(articleId, "in_flight");
  if (inFlight.size >= TITLE_CHECK_MAX_CONCURRENCY) {
    if (!busyDropLogged) {
      busyDropLogged = true;
      console.debug(`[TitleCheck] concurrency cap ${TITLE_CHECK_MAX_CONCURRENCY} reached; dropping checks`);
    }
    return skippedResult(articleId, "busy");
  }

  const store = deps.store ?? dbStore;
  const fetchImpl = deps.fetchImpl ?? fetch;
  inFlight.add(articleId);
  try {
    const article = typeof input === "string" ? await store.loadArticle(articleId) : input;
    if (!article) return skippedResult(articleId, "not_found");
    if (typeof input === "string" && article.status !== "published") return skippedResult(articleId, "not_published");

    const title = (article.title ?? "").replace(/\s+/g, " ").trim();
    const bodyText = toPlainText(article.content);
    if (!title || bodyText.length < TITLE_CHECK_MIN_BODY_CHARS) return skippedResult(articleId, "empty");

    const inputHash = titleCheckInputHash(title, bodyText);
    if (hashMemo.get(articleId) === inputHash) return skippedResult(articleId, "unchanged");
    const stored = await store.getStoredHash(articleId);
    if (stored === inputHash) {
      rememberHash(articleId, inputHash);
      return skippedResult(articleId, "unchanged");
    }

    const started = Date.now();
    try {
      const { probability, inputTokens } = await callGeminiDecision(title, bodyText, key, fetchImpl);
      const latencyMs = Date.now() - started;
      const { decision, flagged } = decideFromProbability(probability);
      await store.upsert({ articleId, inputHash, probability, decision, flagged, latencyMs, inputTokens, error: null });
      rememberHash(articleId, inputHash);
      return { articleId, probability, decision, flagged, latencyMs, inputTokens };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const message = redact(error instanceof Error ? error.message : String(error), key);
      console.warn(`[TitleCheck] check failed for ${articleId}: ${message}`);
      try {
        await store.upsert({
          articleId,
          inputHash,
          probability: null,
          decision: "error",
          flagged: false,
          latencyMs,
          inputTokens: null,
          error: message,
        });
      } catch (persistError) {
        const persistMessage = redact(persistError instanceof Error ? persistError.message : String(persistError), key);
        console.warn(`[TitleCheck] could not record error for ${articleId}: ${persistMessage}`);
      }
      return { articleId, probability: null, decision: "error", flagged: false, latencyMs, inputTokens: null, error: message };
    }
  } finally {
    inFlight.delete(articleId);
  }
}

function runDetached(input: string | TitleCheckArticle, deps: TitleCheckDeps): void {
  setImmediate(() => {
    runTitleConsistencyCheck(input, deps).catch((error) => {
      const message = redact(error instanceof Error ? error.message : String(error), process.env.GEMINI_API_KEY);
      const articleId = typeof input === "string" ? input : input.id;
      console.warn(`[TitleCheck] check aborted for ${articleId}: ${message}`);
    });
  });
}

/**
 * يجدول فحص الظل بعد كتابة ناجحة. يعود فوراً ولا يرمي أبداً.
 * `touched: false` يعني أن الحفظ لم يغيّر العنوان أو المتن أو الحالة.
 */
export function scheduleTitleConsistencyCheck(
  article: TitleCheckArticle | null | undefined,
  opts: { touched?: boolean } = {},
  deps: TitleCheckDeps = {},
): void {
  try {
    if (!isTitleCheckEnabled()) return;
    if (opts.touched === false) return;
    if (!article?.id || article.status !== "published") return;
    runDetached({ id: article.id, status: article.status, title: article.title, content: article.content }, deps);
  } catch (error) {
    console.warn(`[TitleCheck] schedule failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** مثل scheduleTitleConsistencyCheck حين لا يتوفر إلا المعرّف؛ يقرأ الصف ويتحقق أنه منشور. */
export function scheduleTitleConsistencyCheckById(articleId: string | null | undefined, deps: TitleCheckDeps = {}): void {
  try {
    if (!isTitleCheckEnabled()) return;
    if (!articleId) return;
    runDetached(articleId, deps);
  } catch (error) {
    console.warn(`[TitleCheck] schedule failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface TitleCheckListItem {
  articleId: string;
  title: string;
  slug: string;
  publishedAt: Date | null;
  probability: number | null;
  decision: string;
  flagged: boolean;
  checkedAt: Date;
  label: string | null;
}

/** أحدث الفحوص للمواد التي ما زالت منشورة؛ المعلَّمة فقط افتراضياً. */
export async function listFlaggedTitleChecks(opts: {
  limit: number;
  offset: number;
  includeAll?: boolean;
}): Promise<TitleCheckListItem[]> {
  const rows = await db
    .select({
      articleId: articleTitleChecks.articleId,
      title: articles.title,
      slug: articles.slug,
      publishedAt: articles.publishedAt,
      probability: articleTitleChecks.probability,
      decision: articleTitleChecks.decision,
      flagged: articleTitleChecks.flagged,
      checkedAt: articleTitleChecks.checkedAt,
    })
    .from(articleTitleChecks)
    .innerJoin(articles, eq(articles.id, articleTitleChecks.articleId))
    .where(
      opts.includeAll
        ? eq(articles.status, "published")
        : and(eq(articles.status, "published"), eq(articleTitleChecks.flagged, true)),
    )
    .orderBy(desc(articleTitleChecks.checkedAt), sql`${articleTitleChecks.id}`)
    .limit(opts.limit)
    .offset(opts.offset);
  return rows.map((row) => ({ ...row, label: row.flagged ? TITLE_CHECK_LABEL : null }));
}

/** آخر فحص مخزّن لخبر واحد (لإشعار المحرر). null إن لم يُفحص أو لم يعد منشوراً. */
export async function getTitleCheckForArticle(articleId: string): Promise<TitleCheckListItem | null> {
  const rows = await db
    .select({
      articleId: articleTitleChecks.articleId,
      title: articles.title,
      slug: articles.slug,
      publishedAt: articles.publishedAt,
      probability: articleTitleChecks.probability,
      decision: articleTitleChecks.decision,
      flagged: articleTitleChecks.flagged,
      checkedAt: articleTitleChecks.checkedAt,
    })
    .from(articleTitleChecks)
    .innerJoin(articles, eq(articles.id, articleTitleChecks.articleId))
    .where(and(eq(articleTitleChecks.articleId, articleId), eq(articles.status, "published")))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, label: row.flagged ? TITLE_CHECK_LABEL : null } : null;
}
