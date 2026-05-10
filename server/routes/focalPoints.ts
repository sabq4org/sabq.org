import { Router } from "express";
import { eq, and, desc, isNull, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { articles } from "@shared/schema";
import { requireAuth, requirePermission, requireRole } from "../rbac";
import { detectImageFocalPoint, FocalPointResult } from "../openai";
import { memoryCache } from "../memoryCache";
import { extractGeoLocations } from "../services/geoExtractionService";

const router: Router = Router();

function processFocalPointResult(result: FocalPointResult): { data: { x: number; y: number; confidence: string; subject: string; needsReview?: boolean }; shouldSave: boolean } {
  const data: any = { x: result.x, y: result.y, confidence: result.confidence, subject: result.subject };
  if (result.confidence === "low") {
    data.needsReview = true;
    return { data, shouldSave: true };
  }
  return { data, shouldSave: true };
}

// Get stats about focal point coverage
router.get("/api/admin/focal-points/stats", requireAuth, requirePermission("articles.edit_any"), async (req: any, res) => {
  try {
    const [stats] = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'published') as total_published,
        COUNT(*) FILTER (WHERE status = 'published' AND image_url IS NOT NULL) as with_images,
        COUNT(*) FILTER (WHERE status = 'published' AND image_url IS NOT NULL AND image_focal_point IS NOT NULL) as with_focal_points,
        COUNT(*) FILTER (WHERE status = 'published' AND image_url IS NOT NULL AND image_focal_point IS NULL) as missing_focal_points,
        COUNT(*) FILTER (WHERE status = 'published' AND image_url IS NOT NULL AND image_focal_point IS NOT NULL AND (image_focal_point->>'needsReview')::boolean = true) as needs_review
      FROM articles
    `);
    res.json(stats);
  } catch (error: any) {
    console.error("[FocalPoint Stats] Error:", error);
    res.status(500).json({ message: "Failed to get focal point stats" });
  }
});

// Batch process articles without focal points
router.post("/api/admin/focal-points/batch", requireAuth, requirePermission("articles.edit_any"), async (req: any, res) => {
  try {
    const batchSize = Math.min(Number(req.body.batchSize) || 20, 100);
    const concurrency = Math.min(Number(req.body.concurrency) || 8, 10);

    const articlesNeedingFP = await db
      .select({ id: articles.id, imageUrl: articles.imageUrl, title: articles.title })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          isNotNull(articles.imageUrl),
          isNull(articles.imageFocalPoint)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(batchSize);

    if (articlesNeedingFP.length === 0) {
      return res.json({ message: "All published articles with images already have focal points", processed: 0, succeeded: 0, failed: 0 });
    }

    const imageCache = new Map<string, { x: number; y: number; confidence: string; subject: string }>();

    let succeeded = 0;
    let failed = 0;
    let skippedLowConfidence = 0;
    let cachedHits = 0;
    const results: Array<{ id: string; status: string; x?: number; y?: number; subject?: string; cached?: boolean }> = [];

    for (let i = 0; i < articlesNeedingFP.length; i += concurrency) {
      const chunk = articlesNeedingFP.slice(i, i + concurrency);
      await Promise.allSettled(
        chunk.map(async (article) => {
          try {
            const imgUrl = article.imageUrl!;
            let focalResult;

            if (imageCache.has(imgUrl)) {
              focalResult = imageCache.get(imgUrl)!;
              cachedHits++;
            } else {
              focalResult = await detectImageFocalPoint(imgUrl);
              imageCache.set(imgUrl, focalResult);
            }

            const isLowConfidence = focalResult.confidence === "low";
            const focalData: any = { x: focalResult.x, y: focalResult.y, confidence: focalResult.confidence };
            if (isLowConfidence) {
              focalData.needsReview = true;
              skippedLowConfidence++;
            }

            await db.update(articles)
              .set({ imageFocalPoint: focalData })
              .where(eq(articles.id, article.id));
            succeeded++;
            results.push({ id: article.id, status: isLowConfidence ? "needs_review" : "ok", x: focalResult.x, y: focalResult.y, subject: focalResult.subject });
          } catch (err: any) {
            failed++;
            results.push({ id: article.id, status: "error" });
            console.error(`[FocalPoint Batch] Failed for article ${article.id}:`, err?.message);
          }
        })
      );
      if (i + concurrency < articlesNeedingFP.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    console.log(`[FocalPoint Batch] Completed: ${succeeded} succeeded (${skippedLowConfidence} needs review), ${failed} failed, ${cachedHits} cached out of ${articlesNeedingFP.length}`);

    res.json({
      processed: articlesNeedingFP.length,
      succeeded,
      failed,
      needsReview: skippedLowConfidence,
      cachedHits,
      results,
    });
  } catch (error: any) {
    console.error("[FocalPoint Batch] Error:", error);
    res.status(500).json({ message: "Batch processing failed" });
  }
});

// Detect focal point for a single article
router.post("/api/admin/focal-points/detect/:id", requireAuth, requirePermission("articles.edit_any"), async (req: any, res) => {
  try {
    const [article] = await db
      .select({ id: articles.id, imageUrl: articles.imageUrl })
      .from(articles)
      .where(eq(articles.id, req.params.id))
      .limit(1);

    if (!article) {
      return res.status(404).json({ message: "Article not found" });
    }
    if (!article.imageUrl) {
      return res.status(400).json({ message: "Article has no image" });
    }

    const focalResult = await detectImageFocalPoint(article.imageUrl);
    const { data: focalData } = processFocalPointResult(focalResult);

    await db.update(articles)
      .set({ imageFocalPoint: focalData })
      .where(eq(articles.id, article.id));

    res.json({
      articleId: article.id,
      focalPoint: focalData,
      confidence: focalResult.confidence,
      subject: focalResult.subject,
    });
  } catch (error: any) {
    console.error("[FocalPoint Detect] Error:", error);
    res.status(500).json({ message: "Focal point detection failed" });
  }
});

// List articles needing focal point review
router.get("/api/admin/focal-points/needs-review", requireAuth, requirePermission("articles.edit_any"), async (req: any, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = (page - 1) * limit;

    const reviewArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        imageUrl: articles.imageUrl,
        imageFocalPoint: articles.imageFocalPoint,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(
        sql`status = 'published' AND image_url IS NOT NULL AND image_focal_point IS NOT NULL AND (image_focal_point->>'needsReview')::boolean = true`
      )
      .orderBy(desc(articles.publishedAt))
      .limit(limit)
      .offset(offset);

    res.json(reviewArticles);
  } catch (error: any) {
    console.error("[FocalPoint NeedsReview] Error:", error);
    res.status(500).json({ message: "Failed to get review list" });
  }
});

// Mark focal point as reviewed (clear needsReview flag)
router.post("/api/admin/focal-points/mark-reviewed/:id", requireAuth, requirePermission("articles.edit_any"), async (req: any, res) => {
  try {
    const [article] = await db
      .select({ id: articles.id, imageFocalPoint: articles.imageFocalPoint })
      .from(articles)
      .where(eq(articles.id, req.params.id))
      .limit(1);

    if (!article || !article.imageFocalPoint) {
      return res.status(404).json({ message: "Article or focal point not found" });
    }

    const updatedFP = { ...article.imageFocalPoint, needsReview: false };
    await db.update(articles)
      .set({ imageFocalPoint: updatedFP })
      .where(eq(articles.id, article.id));

    res.json({ success: true });
  } catch (error: any) {
    console.error("[FocalPoint MarkReviewed] Error:", error);
    res.status(500).json({ message: "Failed to mark as reviewed" });
  }
});

// POST /api/admin/focal-points/backfill - Batch backfill missing focal points
router.post("/api/admin/focal-points/backfill", requireRole("admin", "editor_in_chief"), async (req: any, res) => {
  try {
    const batchSize = Math.min(Number(req.query.batch) || 20, 50);

    const missingArticles = await db
      .select({
        id: articles.id,
        imageUrl: articles.imageUrl,
        title: articles.title,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          isNotNull(articles.imageUrl),
          isNull(articles.imageFocalPoint)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(batchSize);

    if (missingArticles.length === 0) {
      return res.json({ message: "All published articles have focal points", processed: 0, remaining: 0 });
    }

    const [{ count: remainingCount }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          isNotNull(articles.imageUrl),
          isNull(articles.imageFocalPoint)
        )
      );

    let processed = 0;
    let failed = 0;
    const results: Array<{ id: string; title: string; focal: any; error?: string }> = [];

    for (const article of missingArticles) {
      try {
        const focalResult = await detectImageFocalPoint(article.imageUrl!);
        const { data: focalData } = processFocalPointResult(focalResult);

        await db.update(articles)
          .set({ imageFocalPoint: focalData })
          .where(eq(articles.id, article.id));
        results.push({ id: article.id, title: article.title, focal: { x: focalData.x, y: focalData.y, confidence: focalData.confidence, needsReview: focalData.needsReview } });
        processed++;
      } catch (err: any) {
        failed++;
        results.push({ id: article.id, title: article.title, focal: null, error: err.message });
      }
    }

    memoryCache.invalidatePattern('^article:detail:');
    memoryCache.invalidatePattern('^article:id:');
    memoryCache.invalidatePattern('^homepage');

    console.log(`[FocalPoint Backfill] Processed ${processed}, failed ${failed}, remaining ~${Number(remainingCount) - processed}`);

    res.json({
      processed,
      failed,
      remaining: Math.max(0, Number(remainingCount) - processed),
      results,
    });
  } catch (error: any) {
    console.error('[FocalPoint Backfill] Error:', error);
    res.status(500).json({ error: error.message || 'Backfill failed' });
  }
});

// POST /api/admin/geo-locations/backfill - Batch backfill missing geo-locations
router.post("/api/admin/geo-locations/backfill", requireRole("admin", "editor_in_chief"), async (req: any, res) => {
  try {
    const batchSize = Math.min(Number(req.query.batch) || 10, 30);

    const missingArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        content: articles.content,
      })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          isNull(articles.geoLocations)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(batchSize);

    if (missingArticles.length === 0) {
      return res.json({ message: "All published articles have geo-locations", processed: 0, remaining: 0 });
    }

    const [{ count: remainingCount }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          isNull(articles.geoLocations)
        )
      );

    let processed = 0;
    let failed = 0;
    const results: Array<{ id: string; title: string; locations: any; error?: string }> = [];

    for (const article of missingArticles) {
      try {
        const locations = await extractGeoLocations(article.title, article.content);
        await db.update(articles)
          .set({ geoLocations: locations.length > 0 ? locations : [] })
          .where(eq(articles.id, article.id));
        results.push({ id: article.id, title: article.title.substring(0, 60), locations });
        processed++;
        await new Promise(r => setTimeout(r, 300));
      } catch (err: any) {
        failed++;
        results.push({ id: article.id, title: article.title.substring(0, 60), locations: null, error: err.message });
      }
    }

    memoryCache.invalidatePattern('^news-map');

    console.log(`[GeoLocation Backfill] Processed ${processed}, failed ${failed}, remaining ~${Number(remainingCount) - processed}`);

    res.json({
      processed,
      failed,
      remaining: Math.max(0, Number(remainingCount) - processed),
      results,
    });
  } catch (error: any) {
    console.error('[GeoLocation Backfill] Error:', error);
    res.status(500).json({ error: error.message || 'Backfill failed' });
  }
});

export default router;
