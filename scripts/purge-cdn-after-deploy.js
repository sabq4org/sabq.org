#!/usr/bin/env node
/**
 * Optional post-build Cloudflare purge for Vercel deploys.
 *
 * Set on the Vercel project (same secret as Railway DEPLOY_WEBHOOK_SECRET):
 *   DEPLOY_PURGE_URL=https://api.sabq.news/api/webhooks/deploy-cache-purge
 *   DEPLOY_WEBHOOK_SECRET=<random>
 *
 * Non-fatal: a failed purge never fails the build.
 */

const url = process.env.DEPLOY_PURGE_URL;
const secret = process.env.DEPLOY_WEBHOOK_SECRET;

if (!url || !secret) {
  console.log(
    "[purge-cdn] skipped — set DEPLOY_PURGE_URL and DEPLOY_WEBHOOK_SECRET on Vercel to auto-purge Cloudflare after each deploy",
  );
  process.exit(0);
}

try {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Deploy-Webhook-Secret": secret,
      "X-Deploy-Source": "vercel-build",
    },
    body: JSON.stringify({ source: "vercel-build" }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(
      `[purge-cdn] purge returned ${res.status} (non-fatal): ${text.slice(0, 200)}`,
    );
    process.exit(0);
  }

  console.log("[purge-cdn] Cloudflare cache purge triggered successfully");
} catch (err) {
  console.warn(
    `[purge-cdn] purge request failed (non-fatal): ${err instanceof Error ? err.message : err}`,
  );
}

process.exit(0);
