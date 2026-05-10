/**
 * Apply a public-read bucket policy to the configured S3 bucket so that
 * objects under `public/*` are fetchable anonymously over HTTPS.
 *
 * Usage:
 *   S3_ENDPOINT=https://t3.storageapi.dev \
 *   S3_BUCKET=<your-bucket> \
 *   S3_ACCESS_KEY_ID=<...> \
 *   S3_SECRET_ACCESS_KEY=<...> \
 *   tsx scripts/configure-s3-public.ts
 *
 * Effect:
 *   - Allows s3:GetObject on arn:aws:s3:::<bucket>/public/* to anyone.
 *   - Other prefixes (.private/, uploads/, etc.) remain private.
 *
 * Re-runnable. Replaces any existing bucket policy — if you have a
 * custom one already, merge by hand instead of running this.
 */

import {
  S3Client,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
} from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const region = process.env.S3_REGION || "auto";

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

const policy = {
  Version: "2012-10-17",
  Statement: [
    {
      Sid: "PublicReadForPublicPrefix",
      Effect: "Allow",
      Principal: "*",
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${bucket}/public/*`],
    },
  ],
};

async function main() {
  console.log("=".repeat(60));
  console.log("S3 bucket policy: enable public read on public/*");
  console.log("=".repeat(60));
  console.log(`  endpoint: ${endpoint}`);
  console.log(`  bucket:   ${bucket}`);
  console.log(`  policy:   anyone can GET arn:aws:s3:::${bucket}/public/*`);
  console.log("");

  console.log("[1/2] PutBucketPolicy...");
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify(policy),
    }),
  );
  console.log("      ✅ policy applied");

  console.log("[2/2] GetBucketPolicy (verify)...");
  const got = await client.send(new GetBucketPolicyCommand({ Bucket: bucket }));
  const parsed = got.Policy ? JSON.parse(got.Policy) : null;
  console.log("      retrieved:");
  console.log(JSON.stringify(parsed, null, 2));

  console.log("");
  console.log("✅ Done. Re-run scripts/test-s3-upload.ts — step 3 should now return HTTP 200.");
}

main().catch((err: any) => {
  console.error("❌ Failed:", err?.message || err);
  if (err?.$metadata) console.error("   metadata:", err.$metadata);
  if (err?.Code === "NotImplemented" || err?.name === "NotImplemented") {
    console.error("");
    console.error("   This S3-compatible provider may not support PutBucketPolicy via the API.");
    console.error("   For Tigris on Railway, log in to https://console.tigris.dev with the same");
    console.error("   credentials and set the policy there, OR set S3_PUBLIC_URL to a CDN host");
    console.error("   that fronts the bucket and serves it publicly.");
  }
  process.exit(2);
});
