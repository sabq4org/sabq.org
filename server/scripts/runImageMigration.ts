import { db } from "../db";
import { sql } from "drizzle-orm";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { cloudflareImagesService } from "../services/cloudflareImagesService";

const BATCH_SIZE = 50;
const CONCURRENCY = 5;
const MAX_RETRIES = 2;
const S3_BUCKET = "prod-qt-images";

const s3 = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

function urlToS3Key(imageUrl: string): string | null {
  const prefix = "https://images.assettype.com/";
  if (!imageUrl.startsWith(prefix)) return null;
  const key = imageUrl.substring(prefix.length);
  if (!key || key === "sabq/import" || key.length < 10) return null;
  return key;
}

async function downloadFromS3(s3Key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const cmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key });
      const response = await s3.send(cmd);
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (buffer.length < 100) return null;
      return { buffer, contentType: response.ContentType || "image/jpeg" };
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return null;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

let migrated = 0, failed = 0, skipped = 0;
const startTime = Date.now();

async function processOne(oldUrl: string) {
  try {
    const s3Key = urlToS3Key(oldUrl);
    if (!s3Key) {
      await db.execute(sql`UPDATE image_migrations SET status = 'skipped', error = 'invalid_url', completed_at = NOW() WHERE old_url = ${oldUrl}`);
      skipped++;
      return;
    }

    const imageData = await downloadFromS3(s3Key);
    if (!imageData) {
      await db.execute(sql`UPDATE image_migrations SET status = 'failed', error = 's3_not_found', completed_at = NOW() WHERE old_url = ${oldUrl}`);
      failed++;
      return;
    }

    if (!imageData.contentType.startsWith("image/")) {
      await db.execute(sql`UPDATE image_migrations SET status = 'failed', error = 'not_image', completed_at = NOW() WHERE old_url = ${oldUrl}`);
      failed++;
      return;
    }

    const filename = s3Key.split("/").pop() || "image.jpg";
    const result = await cloudflareImagesService.uploadToCloudflare(
      imageData.buffer,
      filename,
      { source: "quintype_s3" },
      imageData.contentType
    );

    if (result.success && result.deliveryUrl) {
      const updateResult = await db.execute(
        sql`UPDATE articles SET image_url = ${result.deliveryUrl} WHERE image_url = ${oldUrl}`
      );
      const count = (updateResult as any).rowCount || 0;
      await db.execute(sql`
        UPDATE image_migrations 
        SET status = 'done', new_url = ${result.deliveryUrl}, cloudflare_id = ${result.imageId!}, 
            file_size = ${imageData.buffer.length}, articles_updated = ${count}, completed_at = NOW()
        WHERE old_url = ${oldUrl}
      `);
      migrated++;
    } else {
      const errMsg = (result.error || "cf_upload_failed").substring(0, 200);
      await db.execute(sql`UPDATE image_migrations SET status = 'failed', error = ${errMsg}, completed_at = NOW() WHERE old_url = ${oldUrl}`);
      failed++;
    }
  } catch (err: any) {
    try {
      await db.execute(sql`UPDATE image_migrations SET status = 'failed', error = ${(err.message || 'unknown').substring(0, 200)}, completed_at = NOW() WHERE old_url = ${oldUrl}`);
    } catch {}
    failed++;
  }
}

function logProgress(total: number) {
  const processed = migrated + failed + skipped;
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const rate = elapsed > 0 ? (migrated / elapsed).toFixed(2) : "0";
  const remaining = total - processed;
  const etaHrs = parseFloat(rate) > 0 ? (remaining / parseFloat(rate) / 3600).toFixed(1) : "?";
  const pct = ((processed / total) * 100).toFixed(2);
  console.log(
    `[Migration] ${migrated} ok | ${failed} fail | ${skipped} skip | ${processed}/${total} (${pct}%) | ${rate}/s | ETA: ${etaHrs}h`
  );
}

async function run() {
  const totalResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM image_migrations WHERE status = 'pending'`);
  const total = parseInt((totalResult.rows[0] as any).cnt, 10);
  console.log(`[Migration] Starting: ${total} pending images`);

  if (total === 0) {
    console.log("[Migration] Nothing to do!");
    process.exit(0);
  }

  let lastLog = 0;
  while (true) {
    const batch = await db.execute(sql`
      SELECT old_url FROM image_migrations WHERE status = 'pending' ORDER BY id LIMIT ${BATCH_SIZE}
    `);
    if (!batch.rows.length) break;

    const rows = batch.rows as { old_url: string }[];
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      await Promise.allSettled(chunk.map((r) => processOne(r.old_url)));
    }

    const now = Date.now();
    if (now - lastLog > 30000) {
      logProgress(total);
      lastLog = now;
    }
  }

  logProgress(total);
  console.log(`[Migration] COMPLETE!`);
  s3.destroy();
  process.exit(0);
}

run().catch((e) => {
  console.error("[Migration] FATAL:", e);
  process.exit(1);
});
