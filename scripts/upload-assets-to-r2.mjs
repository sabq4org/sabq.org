// Append-only asset upload — the structural cure for "white page after every
// deploy" on Cloudflare Pages.
//
// WHY: Pages serves exactly ONE deployment's files at the apex (sabq.org). The
// moment a new build is promoted, the previous build's content-hashed
// /assets/*.js stop resolving, and a brand-new build's chunks can 404 at a POP
// for a few seconds while the deployment propagates. Either way a lazy import()
// 404s and the SPA white-pages. On a single-origin host (the old Replit setup)
// this could never happen — one process served HTML + chunks from one atomic
// folder.
//
// FIX: publish the hashed bundle to an R2 bucket that is NEVER wiped. Because
// filenames are content-hashed, the bucket simply ACCUMULATES every build's
// chunks. index.html (built with ASSET_CDN_URL set) points at
// https://cdn.sabq.org/assets/<hash>.js, which is present for EVERY build — so
// no chunk URL ever 404s, for old tabs or new ones. The whole reactive recovery
// stack (deployRecovery / buildVersion / retryImport / the _middleware asset
// guard) becomes a belt, not the load-bearing mechanism.
//
// RUN: as a post-build step in the Cloudflare Pages build command:
//   npm run build:client && node scripts/upload-assets-to-r2.mjs
//
// REQUIRED ENV (set in Pages → Settings → Environment variables, Production +
// Preview). Reuses the same R2 vars the server already reads:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
//   ASSET_CDN_URL   — must ALSO be set so vite.config.ts emits absolute URLs.
// Optional:
//   ASSET_UPLOAD_PREFIX  — key prefix in the bucket (default "assets").
//   ASSET_DIST_DIR       — local dir to upload (default "dist/public/assets").
//
// SAFETY: this never deletes. It SKIPS keys that already exist (idempotent —
// re-running a build is a no-op for unchanged chunks). Uploading is fail-soft by
// default: a transient R2 error won't fail the whole deploy unless you set
// ASSET_UPLOAD_STRICT=true.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  ASSET_CDN_URL,
  ASSET_UPLOAD_PREFIX = "assets",
  ASSET_DIST_DIR = "dist/public/assets",
  ASSET_UPLOAD_STRICT = "",
} = process.env;

// Fail-HARD by default. When ASSET_CDN_URL is set, index.html is built to point
// at the CDN, so a failed/partial upload ships a site whose chunks 404 (the
// white-page incident: a wrong R2_ACCESS_KEY_ID uploaded 0 files yet the deploy
// still went live). Failing the build instead keeps production on the previous
// good deploy. Opt out only with ASSET_UPLOAD_STRICT=false.
const strict = ASSET_UPLOAD_STRICT.toLowerCase() !== "false";

function bail(msg) {
  console.error(`[upload-assets-to-r2] ${msg}`);
  process.exit(strict ? 1 : 0);
}

if (!ASSET_CDN_URL) {
  // Without the CDN URL the build still emits root-relative /assets paths, so an
  // upload would be pointless (nothing references the bucket). No-op, not a fail.
  console.log(
    "[upload-assets-to-r2] ASSET_CDN_URL unset — skipping upload (Pages-relative assets in use).",
  );
  process.exit(0);
}
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  bail("Missing R2_* env vars — cannot upload assets. (Set them in Pages env.)");
}
// Preflight: an R2 S3 Access Key ID is exactly 32 hex chars. The most common
// setup mistake is pasting the "Token value" (cfut_…, ~53 chars) into
// R2_ACCESS_KEY_ID — every PutObject then fails with "Credential access key has
// length 53, should be 32". Catch it up front with an actionable message.
if (R2_ACCESS_KEY_ID.length !== 32) {
  bail(
    `R2_ACCESS_KEY_ID length is ${R2_ACCESS_KEY_ID.length}, expected 32. ` +
      `You likely pasted the R2 "Token value" (cfut_…) or the Secret instead of ` +
      `the 32-char hex "Access Key ID". Fix it in Pages → Variables.`,
  );
}

// Content-type by extension — R2 doesn't infer it, and a wrong/missing type on a
// .js file makes the browser refuse to execute it as a module.
const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
};
function mimeFor(name) {
  const dot = name.lastIndexOf(".");
  return (dot >= 0 && MIME[name.slice(dot).toLowerCase()]) || "application/octet-stream";
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  // The S3 client retries on transient errors; cap it so a wedged endpoint
  // fails in bounded time instead of looping. The per-request hang itself is
  // bounded by an abortSignal on every send() below (see REQUEST_TIMEOUT_MS) —
  // the SDK has NO socket timeout by default, which is what let the build hang
  // for HOURS in the "stuck since 09:00" incident while index.html had already
  // shipped to the CDN but the entry chunk never uploaded → site-wide white
  // page. We avoid a direct @smithy/node-http-handler import (transitive-only
  // dep) and use the dependency-free AbortSignal.timeout instead.
  maxAttempts: Number(process.env.ASSET_UPLOAD_MAX_ATTEMPTS) || 4,
});

// Bound every individual S3 operation. AbortSignal.timeout aborts the whole
// send — including a stalled TCP connect — so no request can hang indefinitely.
const REQUEST_TIMEOUT_MS =
  Number(process.env.ASSET_UPLOAD_REQUEST_TIMEOUT_MS) || 30000;
function sendWithTimeout(command) {
  return client.send(command, {
    abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function existsInBucket(key) {
  try {
    await sendWithTimeout(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let distDir = ASSET_DIST_DIR;
  try {
    const s = await stat(distDir);
    if (!s.isDirectory()) throw new Error("not a directory");
  } catch {
    bail(`Asset dir "${distDir}" not found — did build:client run first?`);
    return;
  }

  let uploaded = 0,
    skipped = 0,
    failed = 0;

  // Gather the file list first, then upload with a CONCURRENCY pool. The first
  // run pushes ~680 files to an R2 region that may be far from the build box;
  // doing it one-at-a-time (HeadObject + PutObject sequentially) took 6+ min and
  // slowed every deploy. A bounded pool of parallel workers brings it back to
  // seconds. Tune with ASSET_UPLOAD_CONCURRENCY (default 24).
  const files = [];
  for await (const file of walk(distDir)) files.push(file);

  const concurrency = Math.max(
    1,
    Number(process.env.ASSET_UPLOAD_CONCURRENCY) || 24,
  );

  async function processOne(file) {
    // Key mirrors the public path: assets/<...>. Hashed files are immutable, so
    // a present key is byte-identical and safe to skip.
    const rel = relative(distDir, file).split(sep).join("/");
    const key = `${ASSET_UPLOAD_PREFIX}/${rel}`.replace(/\/+/g, "/");
    try {
      if (await existsInBucket(key)) {
        skipped++;
        return;
      }
      await sendWithTimeout(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
          Body: await readFile(file),
          ContentType: mimeFor(file),
          // Hashed bundle → cache forever.
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      uploaded++;
    } catch (err) {
      failed++;
      console.error(`[upload-assets-to-r2] FAILED ${key}: ${err?.message || err}`);
    }
  }

  // Simple worker pool: `concurrency` workers each pull from a shared cursor.
  let cursor = 0;
  async function worker() {
    while (cursor < files.length) {
      const i = cursor++;
      await processOne(files[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, worker),
  );

  console.log(
    `[upload-assets-to-r2] done — uploaded=${uploaded} skipped=${skipped} failed=${failed} → ${ASSET_CDN_URL}/${ASSET_UPLOAD_PREFIX}/`,
  );
  if (failed && strict) {
    bail(`${failed} asset(s) failed to upload — refusing to ship a CDN-mode build with missing chunks.`);
  }

  // Final guard against the white-page incident: verify the chunks that the
  // built index.html ACTUALLY references are fetchable from the CDN right now.
  // PutObject succeeding is not enough — wrong bucket, unconnected R2 custom
  // domain, or a partial upload all leave the entry chunk 404ing on
  // cdn.sabq.org while the deploy still goes live. We HEAD every CDN-prefixed
  // asset in index.html; any non-200 fails the build so production stays on the
  // previous good deploy. Opt out with ASSET_VERIFY_CDN=false.
  if ((process.env.ASSET_VERIFY_CDN || "").toLowerCase() !== "false") {
    await verifyCdnAssets(distDir);
  }
}

async function verifyCdnAssets(distDir) {
  let html;
  try {
    html = await readFile(join(distDir, "..", "index.html"), "utf8");
  } catch (err) {
    console.warn(
      `[upload-assets-to-r2] could not read index.html to verify (${err?.message || err}) — skipping CDN verification.`,
    );
    return;
  }

  // Pull every src=/href= that points at the configured CDN origin.
  const base = ASSET_CDN_URL.replace(/\/+$/, "");
  const urls = new Set();
  for (const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    if (m[1].startsWith(base + "/")) urls.add(m[1]);
  }
  if (urls.size === 0) {
    console.warn(
      "[upload-assets-to-r2] index.html references no CDN URLs — is ASSET_CDN_URL set at build time? Skipping verification.",
    );
    return;
  }

  const missing = [];
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const res = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) missing.push(`${url} → HTTP ${res.status}`);
      } catch (err) {
        missing.push(`${url} → ${err?.message || err}`);
      }
    }),
  );

  if (missing.length) {
    console.error("[upload-assets-to-r2] CDN verification FAILED — these referenced assets are not served:");
    for (const m of missing) console.error(`  • ${m}`);
    bail(
      `${missing.length} index.html asset(s) are not fetchable from ${base}. ` +
        `Refusing to ship — the SPA would white-page. Check R2 upload + cdn.sabq.org custom domain.`,
    );
  }
  console.log(
    `[upload-assets-to-r2] CDN verification OK — ${urls.size} referenced asset(s) reachable on ${base}.`,
  );
}

main().catch((err) => bail(`Unexpected: ${err?.message || err}`));
