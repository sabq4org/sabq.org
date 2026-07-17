/**
 * رادار الفجوات التحريرية (Coverage Gap Radar) — محرك المطابقة.
 *
 * يقارن دوريًا مواد الرادار النشطة (الرائجة خارجيًا) بالمحتوى الداخلي
 * (مقالات منشورة/مسودات/مجدولة) ويكشف المواضيع بلا تغطية. المطابقة دلالية
 * عبر متجهات بوابة الذكاء (ai-hub) بمفتاح الميزة `coverage-gap-matcher`،
 * مع سقوط تلقائي إلى تطابق كلمات/كيانات مُطبَّعة عند تعذّر المتجهات.
 *
 * التشغيل: بعد كل دورة رادار (cycle.ts) + تحديث كسول من مسار GET عندما
 * تكون البيانات أقدم من دقيقتين. كل الأعطال مُحتواة — لا يُسقط الإقلاع أبدًا.
 */
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import {
  articles,
  coverageGaps,
  radarItems,
  radarSources,
  users,
  type CoverageGap,
} from "@shared/schema";
import { aiGateway } from "../ai/gateway";
import { cosineSimilarity } from "../embeddingsService";

const FEATURE_KEY = "coverage-gap-matcher";
const MATCH_THRESHOLD = Number(process.env.COVERAGE_GAP_MATCH_THRESHOLD || 0.82);
const WINDOW_HOURS = Number(process.env.COVERAGE_GAP_WINDOW_HOURS || 72);
const ARTICLE_LOOKBACK_DAYS = Number(process.env.COVERAGE_GAP_ARTICLE_LOOKBACK_DAYS || 7);
const MAX_ITEMS = Number(process.env.COVERAGE_GAP_MAX_ITEMS || 60);
const MAX_ARTICLES = Number(process.env.COVERAGE_GAP_MAX_ARTICLES || 300);
const EMBED_BATCH = 100;
const KEYWORD_OVERLAP_THRESHOLD = 0.6;
const STALE_MS = 2 * 60 * 1000; // دقيقتان — التحديث الكسول من مسار GET

export const COVERAGE_GAP_STATUSES = ["open", "drafting", "scheduled", "covered", "dismissed"] as const;
export type CoverageGapStatus = (typeof COVERAGE_GAP_STATUSES)[number];

// ---------- تطبيع النص وبصمة الموضوع ----------

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "") // تشكيل عربي
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ARABIC_STOPWORDS = new Set([
  "في", "من", "على", "الى", "إلى", "عن", "مع", "هذا", "هذه", "ذلك", "التي", "الذي",
  "بعد", "قبل", "عبر", "ضد", "بين", "لدي", "خلال", "امام", "أمام", "حول", "دون",
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "at", "by", "with",
  "is", "are", "was", "were", "as", "it", "its", "from", "after", "before", "over",
]);

function significantTokens(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .filter((t) => t.length > 1 && !ARABIC_STOPWORDS.has(t));
}

/** بصمة موضوع مُطبَّعة — أبرز 10 وحدات معجمية من العنوان، مرتبة لضمان الثبات */
export function topicFingerprintFor(title: string): string {
  const tokens = Array.from(new Set(significantTokens(title))).sort();
  return tokens.slice(0, 10).join(" ").substring(0, 300) || normalizeText(title).substring(0, 300);
}

// ---------- نصوص المطابقة ----------

function radarItemText(item: typeof radarItems.$inferSelect): string {
  const title = item.translatedTitle || item.originalTitle;
  const body = item.translatedSummary || item.originalExcerpt || "";
  return `${title}\n${body}`.trim();
}

interface ArticleCandidate {
  id: string;
  status: string;
  text: string;
}

// ---------- تضمين المتجهات عبر بوابة الذكاء (مع تسجيل الاستخدام تلقائيًا) ----------

async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const slice = texts.slice(i, i + EMBED_BATCH);
    const res = await aiGateway.embed({ feature: FEATURE_KEY, input: slice, timeoutMs: 60_000 });
    vectors.push(...res.embeddings);
  }
  return vectors;
}

// ---------- تطابق الكلمات (السقوط عند غياب المتجهات) ----------

function keywordOverlap(a: string, b: string): number {
  const setA = new Set(significantTokens(a));
  const setB = new Set(significantTokens(b));
  if (!setA.size || !setB.size) return 0;
  let common = 0;
  for (const token of setA) if (setB.has(token)) common++;
  return common / Math.min(setA.size, setB.size); // احتواء — العنوان الأقصر يجب أن يُغطى
}

// ---------- حالة الفجوة من حالة المقال ----------

function gapStatusFromArticle(articleStatus: string): CoverageGapStatus | null {
  if (articleStatus === "draft") return "drafting";
  if (articleStatus === "scheduled") return "scheduled";
  if (articleStatus === "published") return "covered";
  return null;
}

// ---------- المحرك ----------

let isRunning = false;
let lastRunAt = 0;
let lastRunMode: "embeddings" | "keywords" | null = null;

export function coverageGapMatcherState() {
  return { lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null, lastRunMode, isRunning };
}

export interface CoverageGapRefreshSummary {
  radarItemsScanned: number;
  articlesScanned: number;
  gapsCreated: number;
  gapsUpdated: number;
  mode: "embeddings" | "keywords";
}

export async function refreshCoverageGaps(trigger = "manual"): Promise<CoverageGapRefreshSummary | null> {
  if (isRunning) return null;
  isRunning = true;
  try {
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);
    const articlesSince = new Date(Date.now() - ARTICLE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // مواد الرادار النشطة والحديثة — المستبعدة والمُصدَّرة لا تُنشئ فجوات
    const items = await db
      .select()
      .from(radarItems)
      .where(
        and(
          inArray(radarItems.status, ["new", "analyzed", "ready"]),
          gte(radarItems.fetchedAt, since)
        )
      )
      .orderBy(desc(radarItems.fetchedAt))
      .limit(MAX_ITEMS);

    // المحتوى الداخلي المرشح للتغطية
    const candidates: ArticleCandidate[] = (
      await db
        .select({
          id: articles.id,
          status: articles.status,
          title: articles.title,
          excerpt: articles.excerpt,
          aiSummary: articles.aiSummary,
        })
        .from(articles)
        .where(
          and(
            inArray(articles.status, ["draft", "scheduled", "published"]),
            gte(articles.createdAt, articlesSince)
          )
        )
        .orderBy(desc(articles.createdAt))
        .limit(MAX_ARTICLES)
    ).map((a) => ({
      id: a.id,
      status: a.status,
      text: `${a.title}\n${a.excerpt || a.aiSummary || ""}`.trim(),
    }));

    const summary: CoverageGapRefreshSummary = {
      radarItemsScanned: items.length,
      articlesScanned: candidates.length,
      gapsCreated: 0,
      gapsUpdated: 0,
      mode: "embeddings",
    };

    // المتجهات — نصوص الرادار ثم نصوص المقالات في دفعات؛ السقوط للكلمات عند الفشل
    let itemVectors: number[][] | null = null;
    let articleVectors: number[][] | null = null;
    if (items.length && candidates.length) {
      try {
        const all = await embedTexts([
          ...items.map(radarItemText),
          ...candidates.map((c) => c.text),
        ]);
        itemVectors = all.slice(0, items.length);
        articleVectors = all.slice(items.length);
      } catch (error) {
        summary.mode = "keywords";
        lastRunMode = "keywords";
        console.warn(
          "[CoverageGap] embeddings unavailable — falling back to keyword/entity overlap:",
          error instanceof Error ? error.message : error
        );
      }
    } else {
      summary.mode = "keywords";
    }

    const existingRows = await db.select().from(coverageGaps);
    const byRadarItem = new Map(existingRows.map((g) => [g.radarItemId, g]));
    const now = new Date();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const heatScore = item.newsValue ?? 0;
      let best: { article: ArticleCandidate; score: number } | null = null;

      if (itemVectors && articleVectors) {
        for (let j = 0; j < candidates.length; j++) {
          const score = cosineSimilarity(itemVectors[i], articleVectors[j]);
          if (!best || score > best.score) best = { article: candidates[j], score };
        }
        if (best && best.score < MATCH_THRESHOLD) best = null;
      } else {
        const itemText = radarItemText(item);
        for (const candidate of candidates) {
          const score = keywordOverlap(itemText, candidate.text);
          if (score >= KEYWORD_OVERLAP_THRESHOLD && (!best || score > best.score)) {
            best = { article: candidate, score };
          }
        }
      }

      const computedStatus: CoverageGapStatus = best
        ? (gapStatusFromArticle(best.article.status) ?? "open")
        : "open";
      const computedArticleId = best?.article.id ?? null;

      const existing = byRadarItem.get(item.id);
      if (existing) {
        if (existing.status === "dismissed") {
          // قرار بشري — لا نعيد فتحها؛ نحدّث الحرارة فقط
          if (existing.heatScore !== heatScore) {
            await db.update(coverageGaps).set({ heatScore, updatedAt: now }).where(eq(coverageGaps.id, existing.id));
          }
          continue;
        }
        // لا نرجع فجوة مغطاة إلى open ما دام مقالها قائمًا
        const keepCovered =
          existing.coveredByArticleId &&
          ["drafting", "scheduled", "covered"].includes(existing.status) &&
          !computedArticleId;
        await db
          .update(coverageGaps)
          .set({
            heatScore,
            status: keepCovered ? existing.status : computedStatus,
            coveredByArticleId: computedArticleId ?? (keepCovered ? existing.coveredByArticleId : null),
            updatedAt: now,
          })
          .where(eq(coverageGaps.id, existing.id));
        summary.gapsUpdated++;
      } else {
        await db.insert(coverageGaps).values({
          radarItemId: item.id,
          topicFingerprint: topicFingerprintFor(item.translatedTitle || item.originalTitle),
          heatScore,
          status: computedStatus,
          coveredByArticleId: computedArticleId,
        });
        summary.gapsCreated++;
      }
    }

    // مصالحة: مواد صُدّرت من الرادار مباشرة (خارج المحرك) أو مقالات تغيّرت حالتها
    await reconcileLinkedGaps();

    lastRunAt = Date.now();
    lastRunMode = summary.mode;
    if (summary.gapsCreated || summary.gapsUpdated) {
      console.log(
        `[CoverageGap] (${trigger}/${summary.mode}) items=${summary.radarItemsScanned} articles=${summary.articlesScanned} created=${summary.gapsCreated} updated=${summary.gapsUpdated}`
      );
    }
    return summary;
  } catch (error) {
    console.error("[CoverageGap] refresh failed:", error);
    return null;
  } finally {
    isRunning = false;
  }
}

/** فجوة ارتبطت بمقال (تصدير رادار مباشر أو تغيّر حالة المقال) — طابق الحالة */
async function reconcileLinkedGaps(): Promise<void> {
  const linked = await db
    .select({ gap: coverageGaps, articleStatus: articles.status })
    .from(coverageGaps)
    .innerJoin(articles, eq(coverageGaps.coveredByArticleId, articles.id))
    .where(inArray(coverageGaps.status, ["open", "drafting", "scheduled", "covered"]));

  const now = new Date();
  for (const row of linked) {
    const mapped = gapStatusFromArticle(row.articleStatus);
    if (mapped && mapped !== row.gap.status) {
      await db.update(coverageGaps).set({ status: mapped, updatedAt: now }).where(eq(coverageGaps.id, row.gap.id));
    }
  }

  // مادة رادار صُدّرت يدويًا ولفجوة مفتوحة — أغلقها كمغطاة بالمقال المُصدَّر
  const exported = await db
    .select({ gapId: coverageGaps.id, articleId: radarItems.exportedArticleId })
    .from(coverageGaps)
    .innerJoin(radarItems, eq(coverageGaps.radarItemId, radarItems.id))
    .where(
      and(
        inArray(coverageGaps.status, ["open", "drafting", "scheduled"]),
        eq(radarItems.status, "exported"),
        isNotNull(radarItems.exportedArticleId)
      )
    );
  for (const row of exported) {
    await db
      .update(coverageGaps)
      .set({ status: "drafting", coveredByArticleId: row.articleId, updatedAt: now })
      .where(eq(coverageGaps.id, row.gapId));
  }
}

/** تحديث كسول — يُستدعى من مسار GET؛ لا يحجب الاستجابة */
export function refreshCoverageGapsIfStale(): void {
  if (Date.now() - lastRunAt < STALE_MS || isRunning) return;
  void refreshCoverageGaps("lazy-get").catch((error) => {
    console.warn("[CoverageGap] lazy refresh failed:", error instanceof Error ? error.message : error);
  });
}

// ---------- استعلامات العرض والعمليات (تستهلكها routes/coverageGaps.ts) ----------

export interface CoverageGapView {
  id: string;
  radarItemId: string;
  title: string;
  originalTitle: string;
  link: string;
  imageUrl: string | null;
  sourceName: string | null;
  sourceType: string | null;
  publishedAt: Date | null;
  isBreaking: boolean;
  newsValue: number | null;
  topicFingerprint: string;
  heatScore: number;
  status: CoverageGapStatus;
  firstDetectedAt: Date;
  coveredByArticleId: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  dismissedBy: string | null;
  dismissedAt: Date | null;
  dismissReason: string | null;
}

export async function listCoverageGaps(statuses?: CoverageGapStatus[]): Promise<CoverageGapView[]> {
  const where = statuses?.length ? inArray(coverageGaps.status, statuses) : undefined;
  const rows = await db
    .select({
      gap: coverageGaps,
      item: radarItems,
      sourceName: radarSources.name,
      sourceType: radarSources.type,
      assigneeFirstName: users.firstName,
      assigneeLastName: users.lastName,
      assigneeEmail: users.email,
    })
    .from(coverageGaps)
    .innerJoin(radarItems, eq(coverageGaps.radarItemId, radarItems.id))
    .leftJoin(radarSources, eq(radarItems.sourceId, radarSources.id))
    .leftJoin(users, eq(coverageGaps.assignedTo, users.id))
    .where(where)
    .orderBy(desc(coverageGaps.heatScore), desc(coverageGaps.firstDetectedAt))
    .limit(200);

  return rows.map((row) => ({
    id: row.gap.id,
    radarItemId: row.gap.radarItemId,
    title: row.item.translatedTitle || row.item.originalTitle,
    originalTitle: row.item.originalTitle,
    link: row.item.link,
    imageUrl: row.item.imageUrl,
    sourceName: row.sourceName,
    sourceType: row.sourceType,
    publishedAt: row.item.publishedAt,
    isBreaking: row.item.isBreaking,
    newsValue: row.item.newsValue,
    topicFingerprint: row.gap.topicFingerprint,
    heatScore: row.gap.heatScore,
    status: row.gap.status as CoverageGapStatus,
    firstDetectedAt: row.gap.firstDetectedAt,
    coveredByArticleId: row.gap.coveredByArticleId,
    assignedTo: row.gap.assignedTo,
    assigneeName:
      [row.assigneeFirstName, row.assigneeLastName].filter(Boolean).join(" ").trim() ||
      row.assigneeEmail ||
      null,
    dismissedBy: row.gap.dismissedBy,
    dismissedAt: row.gap.dismissedAt,
    dismissReason: row.gap.dismissReason,
  }));
}

export async function getCoverageGap(id: string): Promise<CoverageGap | undefined> {
  const rows = await db.select().from(coverageGaps).where(eq(coverageGaps.id, id)).limit(1);
  return rows[0];
}

export async function updateCoverageGap(
  id: string,
  patch: Partial<typeof coverageGaps.$inferInsert>
): Promise<CoverageGap | undefined> {
  const rows = await db
    .update(coverageGaps)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(coverageGaps.id, id))
    .returning();
  return rows[0];
}
