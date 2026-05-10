import { db } from "../db";
import { articles, imageMigrations } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { cloudflareImagesService } from "../services/cloudflareImagesService";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const IS_PRODUCTION = process.env.NODE_ENV === "production" || process.env.REPL_DEPLOYMENT === "1";
const BATCH_SIZE = IS_PRODUCTION ? 10 : 20;
const CONCURRENCY = IS_PRODUCTION ? 2 : 5;
const BATCH_DELAY_MS = IS_PRODUCTION ? 3000 : 1000;
const MAX_RETRIES = 2;

let isRunning = false;
let shouldStop = false;
let stats = {
  total: 0,
  migrated: 0,
  failed: 0,
  skipped: 0,
  startTime: 0,
  lastUpdate: "",
};

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.AWS_S3_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });
}

const S3_BUCKET = "prod-qt-images";

function urlToS3Key(imageUrl: string): string | null {
  try {
    const prefix = "https://images.assettype.com/";
    if (!imageUrl.startsWith(prefix)) return null;
    const key = imageUrl.substring(prefix.length);
    if (!key || key === "sabq/import" || key.length < 10) return null;
    return key;
  } catch {
    return null;
  }
}

export function getMigrationStats() {
  const elapsed = stats.startTime ? (Date.now() - stats.startTime) / 1000 : 0;
  const rate = elapsed > 0 ? stats.migrated / elapsed : 0;
  const remaining = stats.total - stats.migrated - stats.failed - stats.skipped;
  const eta = rate > 0 ? remaining / rate : 0;
  return {
    ...stats,
    isRunning,
    elapsed: Math.round(elapsed),
    rate: Math.round(rate * 100) / 100,
    remaining,
    etaMinutes: Math.round(eta / 60),
  };
}

export function stopMigration() {
  shouldStop = true;
  return { message: "Stop signal sent. Migration will stop after current batch." };
}

async function downloadFromS3(s3: S3Client, s3Key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key });
      const response = await s3.send(cmd);

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length < 100) return null;

      const contentType = response.ContentType || "image/jpeg";
      return { buffer, contentType };
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        return null;
      }
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      console.error(`[ImageMigration] S3 download failed for ${s3Key}:`, err.message);
      return null;
    }
  }
  return null;
}

async function processImage(
  s3: S3Client,
  oldUrl: string
): Promise<{ success: boolean; newUrl?: string; cloudflareId?: string; fileSize?: number; error?: string }> {
  const s3Key = urlToS3Key(oldUrl);
  if (!s3Key) {
    return { success: false, error: "invalid_url" };
  }

  const imageData = await downloadFromS3(s3, s3Key);
  if (!imageData) {
    return { success: false, error: "s3_not_found" };
  }

  if (!imageData.contentType.startsWith("image/")) {
    return { success: false, error: "not_image" };
  }

  const filename = s3Key.split("/").pop() || "image.jpg";
  const result = await cloudflareImagesService.uploadToCloudflare(
    imageData.buffer,
    filename,
    { source: "quintype_s3", s3Key: s3Key.substring(0, 200) },
    imageData.contentType
  );

  if (!result.success) {
    return { success: false, error: result.error || "cf_upload_failed" };
  }

  return {
    success: true,
    newUrl: result.deliveryUrl!,
    cloudflareId: result.imageId!,
    fileSize: imageData.buffer.length,
  };
}

async function processBatch(s3: S3Client, rows: { oldUrl: string }[]): Promise<void> {
  const chunks: { oldUrl: string }[][] = [];
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    chunks.push(rows.slice(i, i + CONCURRENCY));
  }

  for (const chunk of chunks) {
    if (shouldStop) return;

    // Delay between chunks to respect Cloudflare rate limits
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));

    await Promise.allSettled(
      chunk.map(async (row) => {
        const result = await processImage(s3, row.oldUrl);

        if (result.success && result.newUrl) {
          const updateResult = await db.execute(
            sql`UPDATE articles SET image_url = ${result.newUrl} WHERE image_url = ${row.oldUrl}`
          );
          const count = (updateResult as any).rowCount || 0;

          await db.execute(sql`
            UPDATE image_migrations 
            SET status = 'done', new_url = ${result.newUrl}, cloudflare_id = ${result.cloudflareId!}, 
                file_size = ${result.fileSize!}, articles_updated = ${count}, completed_at = NOW()
            WHERE old_url = ${row.oldUrl}
          `);
          stats.migrated++;
        } else {
          const errorMsg = result.error || "unknown";
          const status = errorMsg === "invalid_url" ? "skipped" : "failed";
          await db.execute(sql`
            UPDATE image_migrations SET status = ${status}, error = ${errorMsg}, completed_at = NOW()
            WHERE old_url = ${row.oldUrl}
          `);
          if (status === "skipped") stats.skipped++;
          else stats.failed++;
        }
      })
    );
  }
}

export async function startMigration(): Promise<{ message: string }> {
  if (isRunning) {
    return { message: "Migration is already running." };
  }

  if (!cloudflareImagesService.isCloudflareConfigured()) {
    return { message: "Cloudflare Images is not configured." };
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return { message: "AWS S3 credentials not configured." };
  }

  isRunning = true;
  shouldStop = false;
  stats = { total: 0, migrated: 0, failed: 0, skipped: 0, startTime: Date.now(), lastUpdate: "" };

  (async () => {
    const s3 = getS3Client();

    try {
      const existingCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM image_migrations`);
      const existing = parseInt((existingCount.rows[0] as any).cnt, 10);

      if (existing < 1000) {
        console.log("[ImageMigration] Seeding unique URLs into tracking table...");
        const seeded = await db.execute(sql`
          INSERT INTO image_migrations (old_url, status)
          SELECT DISTINCT image_url, 'pending'
          FROM articles
          WHERE image_url LIKE 'https://images.assettype.com/%'
          AND image_url NOT IN (SELECT old_url FROM image_migrations)
          ON CONFLICT (old_url) DO NOTHING
        `);
        console.log(`[ImageMigration] Seeded ${(seeded as any).rowCount || 0} new URLs`);
      } else {
        console.log(`[ImageMigration] Tracking table already has ${existing} URLs, skipping seed`);
      }

      const totalResult = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM image_migrations WHERE status = 'pending'
      `);
      stats.total = parseInt((totalResult.rows[0] as any).cnt, 10);
      console.log(`[ImageMigration] Starting S3→Cloudflare migration of ${stats.total} images (concurrency: ${CONCURRENCY})...`);

      while (!shouldStop) {
        const batch = await db.execute(sql`
          SELECT old_url FROM image_migrations 
          WHERE status = 'pending'
          ORDER BY id
          LIMIT ${BATCH_SIZE}
        `);

        if (!batch.rows.length) {
          console.log("[ImageMigration] ✅ No more pending images. Migration complete.");
          break;
        }

        const rows = batch.rows as { old_url: string }[];
        await processBatch(s3, rows.map((r) => ({ oldUrl: r.old_url })));

        stats.lastUpdate = new Date().toISOString();
        const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
        const rate = elapsed > 0 ? (stats.migrated / elapsed).toFixed(1) : "0";
        console.log(
          `[ImageMigration] Progress: ${stats.migrated} done, ${stats.failed} failed, ${stats.skipped} skipped / ${stats.total} total | ${rate} img/s | ${elapsed}s elapsed`
        );
      }

      if (shouldStop) {
        console.log("[ImageMigration] ⏹ Migration stopped by user.");
      }
    } catch (err) {
      console.error("[ImageMigration] Fatal error:", err);
    } finally {
      isRunning = false;
      shouldStop = false;
      s3.destroy();
    }
  })();

  return { message: `Migration started. ${stats.total || "calculating..."} images to process with S3→Cloudflare pipeline.` };
}

export async function retryFailed(): Promise<{ message: string }> {
  const result = await db.execute(sql`
    UPDATE image_migrations SET status = 'pending', error = NULL, completed_at = NULL
    WHERE status = 'failed'
  `);
  const count = (result as any).rowCount || 0;
  return { message: `Reset ${count} failed images to pending.` };
}

export async function getMigrationProgress(): Promise<any> {
  const result = await db.execute(sql`
    SELECT 
      status, 
      COUNT(*) as count,
      COALESCE(SUM(articles_updated), 0) as articles_updated,
      COALESCE(SUM(file_size), 0) as total_bytes
    FROM image_migrations 
    GROUP BY status
    ORDER BY status
  `);

  const errors = await db.execute(sql`
    SELECT error, COUNT(*) as count
    FROM image_migrations
    WHERE status = 'failed'
    GROUP BY error
    ORDER BY count DESC
    LIMIT 10
  `);

  return { breakdown: result.rows, topErrors: errors.rows, ...getMigrationStats() };
}
