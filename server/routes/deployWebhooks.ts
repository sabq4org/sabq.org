import { Router } from "express";
import { purgeAll } from "../services/cloudflarePurge";

const router = Router();

/**
 * POST /api/webhooks/deploy-cache-purge
 *
 * Purges the entire Cloudflare zone cache after a frontend/backend deploy.
 * Without this, Cloudflare can keep serving a stale SPA shell whose
 * <script src="/assets/index-<oldhash>.js"> 404s after Vite rotates chunks —
 * users see a white page until someone runs "Purge Everything" manually.
 *
 * Auth: shared secret in X-Deploy-Webhook-Secret (or ?secret= for curl tests).
 * CSRF: exempt via /api/webhooks/ prefix in server/csrf.ts.
 *
 * Wire-up:
 *   1. Vercel → Project Settings → Webhooks → deployment.succeeded → this URL
 *   2. Or set DEPLOY_PURGE_URL + DEPLOY_WEBHOOK_SECRET on Vercel so
 *      scripts/purge-cdn-after-deploy.js runs at the end of every build.
 */
router.post("/api/webhooks/deploy-cache-purge", async (req, res) => {
  const secret = process.env.DEPLOY_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "DEPLOY_WEBHOOK_SECRET not configured" });
  }

  const provided =
    (req.headers["x-deploy-webhook-secret"] as string | undefined) ||
    (typeof req.query.secret === "string" ? req.query.secret : undefined);

  if (!provided || provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const source =
    (typeof req.body?.source === "string" && req.body.source) ||
    (req.headers["x-deploy-source"] as string | undefined) ||
    "unknown";

  console.log(`[DeployWebhook] Cloudflare purge requested (source=${source})`);

  const result = await purgeAll();
  if (!result.success) {
    console.error("[DeployWebhook] Purge failed:", result.errors);
    return res.status(502).json({ success: false, errors: result.errors });
  }

  return res.json({ success: true, message: "Cloudflare cache purged" });
});

export default router;
