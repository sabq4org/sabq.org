/**
 * Tebi-specific attempts to make the bucket publicly readable.
 *
 * Tebi (t3.storageapi.dev) ignores per-object public-read ACLs for
 * anonymous HTTP access. It uses a bucket-level public toggle. Two API
 * paths are worth trying before falling back to the dashboard or CDN:
 *
 *   1. PutBucketAcl with canned ACL "public-read" (bucket-level).
 *   2. PutPublicAccessBlock disabling all public-access blocks (some
 *      providers require both).
 *
 * If both fail, the only remaining options are:
 *   - Login to https://console.tebi.io and toggle the bucket to Public.
 *     (Same credentials you received from Railway.)
 *   - Switch to a different Railway storage plugin that supports
 *     per-object ACLs natively (Tigris does — check the marketplace
 *     for "Tigris" specifically, the endpoint is *.fly.storage.tigris.dev).
 *   - Front the bucket with a CDN (Cloudflare) and set S3_PUBLIC_URL.
 *
 * Usage:
 *   S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
 *   tsx scripts/try-tebi-public.ts
 */

import {
  S3Client,
  PutBucketAclCommand,
  PutPublicAccessBlockCommand,
  GetBucketAclCommand,
} from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const region = process.env.S3_REGION || "auto";

if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
  console.error("❌ Missing S3 credentials");
  process.exit(1);
}

const client = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
});

async function tryBucketAcl() {
  console.log("[1] PutBucketAcl ACL=public-read ...");
  try {
    await client.send(new PutBucketAclCommand({ Bucket: bucket, ACL: "public-read" }));
    console.log("    ✅ accepted");
    return true;
  } catch (err: any) {
    console.log(`    ❌ ${err?.name || "Error"}: ${err?.message}`);
    return false;
  }
}

async function tryDisablePAB() {
  console.log("[2] PutPublicAccessBlock (disable all blocks) ...");
  try {
    await client.send(
      new PutPublicAccessBlockCommand({
        Bucket: bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: false,
          IgnorePublicAcls: false,
          BlockPublicPolicy: false,
          RestrictPublicBuckets: false,
        },
      }),
    );
    console.log("    ✅ accepted");
    return true;
  } catch (err: any) {
    console.log(`    ❌ ${err?.name || "Error"}: ${err?.message}`);
    return false;
  }
}

async function getAcl() {
  console.log("[3] GetBucketAcl (current state) ...");
  try {
    const res = await client.send(new GetBucketAclCommand({ Bucket: bucket }));
    console.log("    Owner:", res.Owner?.DisplayName || res.Owner?.ID);
    console.log("    Grants:", res.Grants?.length || 0);
    for (const g of res.Grants || []) {
      console.log(`      - ${g.Permission} → ${g.Grantee?.URI || g.Grantee?.ID || g.Grantee?.DisplayName}`);
    }
    return true;
  } catch (err: any) {
    console.log(`    ❌ ${err?.name}: ${err?.message}`);
    return false;
  }
}

async function probePublic() {
  console.log("[4] HTTP GET on a smoke-test object created earlier ...");
  // Find any test object. Just try a known prefix.
  const url = `${endpoint.replace(/\/+$/, "")}/${bucket}/public/_smoke/`;
  const res = await fetch(url);
  console.log(`    listing ${url} → HTTP ${res.status}`);
  console.log("    (404 here is fine — listing isn't public, but individual objects might be)");
}

(async () => {
  console.log("=".repeat(60));
  console.log("Tebi public-bucket fallback attempts");
  console.log("=".repeat(60));
  console.log(`  bucket: ${bucket} @ ${endpoint}`);
  console.log("");

  await tryBucketAcl();
  await tryDisablePAB();
  await getAcl();
  await probePublic();

  console.log("");
  console.log("Now re-run scripts/test-s3-upload.ts and check whether step 3 returns 200.");
  console.log("If it still 403s, Tebi requires the dashboard toggle. Options:");
  console.log("  A. https://console.tebi.io — login, mark bucket public");
  console.log("  B. Switch Railway plugin to Tigris (per-object ACL works natively)");
  console.log("  C. Put a CDN in front of the bucket and set S3_PUBLIC_URL=<cdn host>");
})().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
