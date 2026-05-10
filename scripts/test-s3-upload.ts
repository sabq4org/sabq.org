/**
 * Smoke test for the S3 upload pipeline.
 *
 * Verifies that:
 *   1. The configured S3 client can reach S3_ENDPOINT.
 *   2. PutObject succeeds with the supplied credentials/bucket.
 *   3. The resulting public URL is fetchable (HTTP 200).
 *
 * Run locally with the same env vars Railway has:
 *   STORAGE_PROVIDER=s3 \
 *   S3_ENDPOINT=https://t3.storageapi.dev \
 *   S3_BUCKET=<your-bucket> \
 *   S3_ACCESS_KEY_ID=<...> \
 *   S3_SECRET_ACCESS_KEY=<...> \
 *   tsx scripts/test-s3-upload.ts
 *
 * If step 3 fails with 403, the bucket isn't configured for public read on
 * the `public/` prefix. Either set a bucket policy that grants
 * s3:GetObject to anyone for `public/*`, or set S3_PUBLIC_URL to a CDN
 * endpoint that fronts the bucket.
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const region = process.env.S3_REGION || "auto";
const explicitPublicUrl = process.env.S3_PUBLIC_URL;

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  console.error("❌ Missing one of: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY");
  process.exit(1);
}

const client = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
});

const publicBase = (explicitPublicUrl || `${endpoint.replace(/\/+$/, "")}/${bucket}`).replace(/\/+$/, "");

const stamp = Date.now();
const key = `public/_smoke/test-${stamp}.txt`;
const body = `sabq s3 smoke test\ntimestamp: ${new Date().toISOString()}\n`;

async function main() {
  console.log("=".repeat(60));
  console.log("S3 upload smoke test");
  console.log("=".repeat(60));
  console.log(`  endpoint:   ${endpoint}`);
  console.log(`  bucket:     ${bucket}`);
  console.log(`  region:     ${region}`);
  console.log(`  publicBase: ${publicBase}`);
  console.log(`  key:        ${key}`);
  console.log("");

  console.log("[1/3] PutObject...");
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "text/plain; charset=utf-8",
    }),
  );
  console.log("      ✅ uploaded");

  console.log("[2/3] HeadObject (verify exists in bucket)...");
  await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  console.log("      ✅ object visible to S3 API");

  const publicUrl = `${publicBase}/${key}`;
  console.log(`[3/3] GET ${publicUrl}`);
  const res = await fetch(publicUrl);
  console.log(`      HTTP ${res.status}`);

  if (res.status === 200) {
    const text = await res.text();
    console.log("      ✅ publicly readable");
    console.log("      body:", JSON.stringify(text.slice(0, 60)));
  } else if (res.status === 403) {
    console.error("      ❌ 403 Forbidden — bucket lacks public-read policy on public/*");
    console.error("         Configure the bucket policy to grant s3:GetObject for");
    console.error(`         arn:aws:s3:::${bucket}/public/* to *, OR set S3_PUBLIC_URL`);
    console.error("         to a CDN host that fronts the bucket.");
    process.exit(2);
  } else {
    console.error(`      ⚠️  unexpected status ${res.status}`);
    console.error("         body:", (await res.text()).slice(0, 200));
    process.exit(3);
  }

  console.log("");
  console.log("✅ All checks passed. Set STORAGE_PROVIDER=s3 on Railway and uploads will go here.");
}

main().catch((err) => {
  console.error("❌ Failed:", err.message || err);
  if (err.$metadata) console.error("   metadata:", err.$metadata);
  process.exit(1);
});
