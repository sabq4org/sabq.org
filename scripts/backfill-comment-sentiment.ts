/**
 * Backfill sentiment for existing comments.
 *
 * كل التعليقات التاريخية (2,950 حتى يوليو 2026) بلا تحليل مشاعر لأن الخدمة لم
 * تكن مفعّلة قط. هذا السكربت يحلل التعليقات التي sentiment_analyzed_at IS NULL
 * على دفعات قابلة للاستئناف (يمكن إيقافه وإعادة تشغيله بأمان).
 *
 * Usage:
 *   npx tsx scripts/backfill-comment-sentiment.ts            # default batch (200)
 *   npx tsx scripts/backfill-comment-sentiment.ts --limit 50 # smaller batch
 *   npx tsx scripts/backfill-comment-sentiment.ts --all      # keep going until done
 *
 * Only approved + pending comments are analyzed (rejected ones add no
 * editorial signal and would waste tokens).
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config();

// Dynamic imports so dotenv runs BEFORE server/db reads DATABASE_URL
// (static ESM imports are hoisted above the dotenv.config calls).
const { db } = await import("../server/db");
const { comments, commentSentiments } = await import("../shared/schema");
const { and, asc, isNull, sql } = await import("drizzle-orm");
const { detectLanguage } = await import("../server/sentiment-analyzer");
const { aiGateway } = await import("../server/ai/gateway");

const SENTIMENT_PROMPT = `أنت محلل مشاعر لتعليقات موقع إخباري عربي. حلّل مشاعر التعليق تجاه موضوعه وأرجع JSON فقط:
{"sentiment": "positive | neutral | negative", "confidence": رقم من 0 إلى 1}
التعليق:`;

async function analyzeSentimentViaGateway(text: string): Promise<{
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
  provider: string;
  model: string;
}> {
  const response = await aiGateway.complete({
    feature: "comment-moderation",
    messages: [
      { role: "system", content: SENTIMENT_PROMPT },
      { role: "user", content: `"${text}"` },
    ],
    options: { jsonMode: true, temperature: 0.1, maxTokens: 100 },
  });
  const parsed = JSON.parse(response.content) as { sentiment: string; confidence: number };
  const valid = ["positive", "neutral", "negative"];
  return {
    sentiment: (valid.includes(parsed.sentiment) ? parsed.sentiment : "neutral") as
      | "positive"
      | "neutral"
      | "negative",
    confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
    provider: response.provider,
    model: response.modelId,
  };
}

const args = process.argv.slice(2);
const runAll = args.includes("--all");
const limitIdx = args.indexOf("--limit");
const batchLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || 200 : 200;

async function processBatch(): Promise<number> {
  const rows = await db
    .select({ id: comments.id, content: comments.content })
    .from(comments)
    .where(
      and(
        isNull(comments.sentimentAnalyzedAt),
        sql`${comments.status} in ('approved', 'pending')`,
        sql`length(trim(${comments.content})) >= 2`
      )
    )
    .orderBy(asc(comments.createdAt))
    .limit(batchLimit);

  if (rows.length === 0) return 0;

  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const language = detectLanguage(row.content);
      const result = await analyzeSentimentViaGateway(row.content);
      const analyzedAt = new Date();

      await db
        .update(comments)
        .set({
          currentSentiment: result.sentiment,
          currentSentimentConfidence: result.confidence,
          sentimentAnalyzedAt: analyzedAt,
        })
        .where(sql`${comments.id} = ${row.id}`);

      await db.insert(commentSentiments).values({
        commentId: row.id,
        sentiment: result.sentiment,
        confidence: result.confidence,
        provider: result.provider,
        model: result.model,
        language,
        rawMetadata: { source: "backfill-script" },
      });

      done++;
      if (done % 25 === 0) {
        console.log(`  ... ${done}/${rows.length} in current batch`);
      }
    } catch (error: any) {
      failed++;
      console.error(`  ✗ ${row.id}: ${error?.message || error}`);
      // Back off briefly on failure so a rate-limited provider can recover.
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`[Sentiment Backfill] Batch done: ${done} analyzed, ${failed} failed`);
  return done + failed;
}

async function main() {
  const [remaining] = await db
    .select({ count: sql<number>`count(*)` })
    .from(comments)
    .where(
      and(
        isNull(comments.sentimentAnalyzedAt),
        sql`${comments.status} in ('approved', 'pending')`
      )
    );
  console.log(`[Sentiment Backfill] ${remaining?.count ?? "?"} comments awaiting sentiment analysis`);

  if (runAll) {
    let total = 0;
    for (;;) {
      const processed = await processBatch();
      if (processed === 0) break;
      total += processed;
      console.log(`[Sentiment Backfill] Progress: ${total} processed so far`);
    }
    console.log(`[Sentiment Backfill] ✅ Complete — ${total} comments processed`);
  } else {
    await processBatch();
    console.log("[Sentiment Backfill] Run again (or use --all) to continue with the next batch.");
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("[Sentiment Backfill] Fatal:", error);
  process.exit(1);
});
