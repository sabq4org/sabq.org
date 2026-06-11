import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
dotenv.config();
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { randomBytes, createHash } from "crypto";
import { isNoindexPath } from "./utils/noindexPaths";

process.on('uncaughtException', (error) => {
  console.error('[CRITICAL] Uncaught Exception:', error.message);
  console.error('[CRITICAL] Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise);
  console.error('[CRITICAL] Reason:', reason);
});

const app = express();
app.set("trust proxy", 1);

if ((globalThis as any).__sabqAttachExpress) {
  (globalThis as any).__sabqAttachExpress(app);
}

app.get("/health", async (_req, res) => {
  let dbReady = false;
  try {
    const { isDatabaseAvailable } = await import("./db");
    dbReady = isDatabaseAvailable();
  } catch {}
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    database: dbReady ? "connected" : "warming-up",
  });
});

const serverBootedAt = new Date().toISOString();
const deployCommit =
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT_SHA ||
  null;
const deployBranch =
  process.env.RAILWAY_GIT_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  null;

app.get("/api/version", (_req, res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.status(200).json({
    commit: deployCommit,
    shortCommit: deployCommit ? deployCommit.slice(0, 7) : null,
    branch: deployBranch,
    bootedAt: serverBootedAt,
    now: new Date().toISOString(),
  });
});


// Serve ads.txt and app-ads.txt BEFORE any SPA/Vite middleware
app.get('/ads.txt', (_req, res) => {
  const filePath = path.resolve(process.cwd(), 'public', 'ads.txt');
  if (fs.existsSync(filePath)) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Not found');
  }
});

app.get('/app-ads.txt', (_req, res) => {
  const filePath = path.resolve(process.cwd(), 'public', 'app-ads.txt');
  if (fs.existsSync(filePath)) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(filePath);
  } else {
    res.status(404).send('Not found');
  }
});

// Track server readiness state
let isServerReady = false;

app.get("/ready", async (_req, res) => {
  try {
    // Only mark ready if server has finished basic initialization
    if (!isServerReady) {
      res.status(503).json({ 
        status: "starting",
        server: "initializing",
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    // Verify database connectivity with a quick ping
    const { pool } = await import("./db");
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    res.status(200).json({ 
      status: "ready",
      server: "running",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[Ready Check] Database ping failed:", error);
    res.status(503).json({ 
      status: "unavailable",
      server: "running",
      database: "disconnected",
      timestamp: new Date().toISOString()
    });
  }
});

// CORS Configuration
//
// Origins come from three sources:
//   1. ALLOWED_ORIGINS — comma-separated explicit list (Railway/prod)
//   2. FRONTEND_URL — primary Vercel deployment URL (Railway/prod)
//   3. REPLIT_DOMAINS — auto-detected on Replit (legacy, kept for backup project)
// Plus FRONTEND_PREVIEW_PATTERN (optional regex) for Vercel preview deploys
// like https://sabq-git-foo-bar.vercel.app — set to "^https://sabq-.*\\.vercel\\.app$".
const allowedOrigins = (process.env.ALLOWED_ORIGINS?.split(',') || [])
  .concat(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [])
  .concat(
    (process.env.REPLIT_DOMAINS?.split(',') || []).map(domain =>
      domain.trim().startsWith('http') ? domain.trim() : `https://${domain.trim()}`
    )
  )
  .concat(['http://localhost:5000', 'http://localhost:5001', 'http://127.0.0.1:5000', 'http://127.0.0.1:5001'])
  .concat(['https://appleid.apple.com']) // Allow Apple OAuth callback
  .filter(origin => origin && origin.trim().length > 0) // Remove empty strings
  .map(origin => origin.trim());

const allowedOriginsSet = new Set(allowedOrigins);
const normalizedOriginsSet = new Set(allowedOrigins.map(o => o.replace(/:5000$/, '').replace(/:5001$/, '')));

const previewPattern = process.env.FRONTEND_PREVIEW_PATTERN
  ? new RegExp(process.env.FRONTEND_PREVIEW_PATTERN)
  : null;

app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // No Origin header at all → same-origin request or server-side call.
    // Allow so curl, health checks, and SSR-internal requests keep working.
    if (!origin) {
      return callback(null, true);
    }
    // Literal string "null" → opaque origins (sandboxed iframes, cross-origin
    // redirects, file://, data:, privacy modes, some Edge configurations).
    // Deny CORS but DON'T throw — `callback(null, false)` just omits the
    // Access-Control-Allow-Origin header, letting the browser block the
    // response on its own. Throwing here surfaced as user-visible 500s.
    if (origin === 'null') {
      return callback(null, false);
    }
    // Parse-and-protocol gate (security audit M7, 2026-05-11) — a malformed
    // origin can't smuggle past a loose preview-pattern regex.
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      console.warn(`[CORS] Rejected non-URL origin: ${origin}`);
      return callback(null, false);
    }
    // ── Mobile WebView allowance (Capacitor iOS / Android) ──────────────
    // iOS  → capacitor://localhost
    // Android → https://localhost   (Capacitor 5+)  or  http://localhost (legacy)
    // Ionic legacy → ionic://localhost
    // These are app-bundle WebViews loading our own JS, so we trust them like
    // first-party origins. App identity is enforced separately by auth tokens.
    const isCapacitorWebView =
      (parsed.protocol === 'capacitor:' && parsed.hostname === 'localhost') ||
      (parsed.protocol === 'ionic:' && parsed.hostname === 'localhost') ||
      ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.hostname === 'localhost');
    if (isCapacitorWebView) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      console.warn(`[CORS] Rejected non-HTTPS origin in production: ${origin}`);
      return callback(null, false);
    }
    const normalizedOrigin = origin.replace(/:5000$/, '').replace(/:5001$/, '');
    if (allowedOriginsSet.has(origin) || normalizedOriginsSet.has(normalizedOrigin)) {
      return callback(null, true);
    }
    // NOTE: previewPattern is matched against the *whole* origin string,
    // anchored. Make sure FRONTEND_PREVIEW_PATTERN env var is tight —
    // e.g. `^https://sabq-[a-z0-9-]+-<team-id>\.vercel\.app$` — because
    // any Vercel user can deploy a project named "sabq-*" otherwise.
    if (previewPattern && previewPattern.test(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS] Blocked origin: ${origin}`);
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-csrf-token'],
}));

// Security headers with Helmet.js - 'unsafe-inline' and 'unsafe-eval' needed for Swagger UI
const isDevelopment = process.env.NODE_ENV !== "production";

// Per-request CSP nonce. Used by the strict Report-Only policy below and
// injected into inline <script> tags by the SEO/HTML pipeline (seoInjector).
app.use((_req, res, next) => {
  (res as any).locals.cspNonce = randomBytes(16).toString("base64");
  next();
});

// Strict CSP in REPORT-ONLY mode (nonce + strict-dynamic, no 'unsafe-inline'
// or blanket 'https:' for scripts). This does NOT block anything — it only
// surfaces what a hardened policy would flag, so we can migrate the enforced
// policy off 'unsafe-inline'/'https:' for script-src without risking the live
// site. The enforced (loose) Helmet policy below is intentionally unchanged.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) {
    const nonce = (res as any).locals.cspNonce;
    res.setHeader(
      "Content-Security-Policy-Report-Only",
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        "script-src-attr 'none'",
        "connect-src 'self' https: ws: wss:",
        "frame-src 'self' https:",
        "frame-ancestors 'self'",
        "img-src 'self' data: https: blob:",
        "style-src 'self' 'unsafe-inline' https:",
        "font-src 'self' data: https:",
        "media-src 'self' data: https: blob:",
        "object-src 'none'",
        "worker-src 'self' blob:",
        "base-uri 'self'",
        "form-action 'self' https://appleid.apple.com",
        "report-uri /api/security/csp-report",
      ].join("; "),
    );
  }
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: isDevelopment 
          ? ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:", "blob:"]
          : ["'self'", "'unsafe-inline'", "https:", "blob:"],
        connectSrc: ["'self'", "https:", "ws:", "wss:"],
        frameSrc: ["'self'", "https:"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        fontSrc: ["'self'", "data:", "https:"],
        mediaSrc: ["'self'", "data:", "https:", "blob:"],
        objectSrc: ["'none'"],
        workerSrc: ["'self'", "blob:"],
        baseUri: ["'self'"],
        formAction: ["'self'", "https://appleid.apple.com"],
        upgradeInsecureRequests: isDevelopment ? null : [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    noSniff: true,
    xssFilter: true,
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
  })
);

// Enable Gzip compression for all responses
app.use(compression({
  filter: (req, res) => {
    if (req.headers['cache-control']?.includes('no-transform')) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 1,
  threshold: 1024,
}));

app.use(cookieParser());
app.use(express.json({
  limit: '25mb', // base64 image uploads from mobile inflate ~33% over the
                 // raw photo, so a couple of phone images need headroom.
                 // Bumped 10mb → 25mb to stop /articles/submit 413s.
  verify: (req: any, _res: any, buf: Buffer) => {
    // Stash the exact raw bytes before JSON parsing so webhook handlers
    // can verify HMAC signatures against the original payload.
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: false, limit: '25mb' }));

// Direct proxy for /public-objects/ — uses searchPublicObject for dual-bucket fallback.
// In production, /public-objects/ returns HTML (SPA fallback) instead of actual images.
// This handler intercepts before the SPA fallback and streams from Object Storage.
app.get('/public-objects/*', async (req: any, res) => {
  try {
    const subPath = req.params[0] as string;
    if (!subPath) return res.status(400).end();

    const { ObjectStorageService } = await import('./objectStorage');
    const service = new ObjectStorageService();
    const file = await service.searchPublicObject(subPath);
    
    if (!file) {
      return res.status(404).json({ message: "الملف غير موجود" });
    }

    await service.downloadObject(file, res, { forcePublic: true });
  } catch (error) {
    console.error('[PublicObjects Proxy] Error:', error);
    if (!res.headersSent) res.status(500).end();
  }
});
console.log(`[Server] ✅ /public-objects/ direct proxy configured`);

app.get('/objects/*', async (req: any, res) => {
  try {
    const subPath = req.params[0] as string;
    if (!subPath) return res.status(400).end();

    const { ObjectStorageService } = await import('./objectStorage');
    const service = new ObjectStorageService();
    const file = await service.searchPublicObject(subPath);
    
    if (!file) {
      return res.status(404).json({ message: "الملف غير موجود" });
    }

    await service.downloadObject(file, res, { forcePublic: true });
  } catch (error) {
    console.error('[Objects Proxy] Error:', error);
    if (!res.headersSent) res.status(500).end();
  }
});
console.log(`[Server] ✅ /objects/ direct proxy configured`);

// Serve static files from uploads directory (for thumbnails and advertiser ads)
// On Railway/Vercel the filesystem is ephemeral — set UPLOADS_DIR explicitly
// or migrate uploads to R2/Cloudflare Images and skip local serving.
const uploadsDir = process.env.UPLOADS_DIR
  || (fs.existsSync('/home/runner/workspace/uploads') ? '/home/runner/workspace/uploads' : path.resolve(process.cwd(), 'uploads'));
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
console.log(`[Server] ✅ Static uploads directory configured: ${uploadsDir}`);

// Serve static files from public directory (for branding, logos, etc.)
const publicDir = path.join(process.cwd(), 'public');
app.use('/branding', express.static(path.join(publicDir, 'branding')));
console.log(`[Server] ✅ Static branding directory configured: ${publicDir}/branding`);

function get429Page(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>سبق الذكية - يرجى الانتظار</title>
  <meta http-equiv="refresh" content="10">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; color: #1e293b; }
    .container { text-align: center; padding: 2rem; max-width: 480px; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.75rem; color: #0f172a; }
    p { font-size: 1rem; color: #64748b; line-height: 1.6; margin-bottom: 1.5rem; }
    .retry-btn { display: inline-block; padding: 0.75rem 2rem; background: #2563eb; color: #fff; border: none; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; text-decoration: none; }
    .retry-btn:hover { background: #1d4ed8; }
    .note { font-size: 0.85rem; color: #94a3b8; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">&#9203;</div>
    <h1>عدد الطلبات كبير</h1>
    <p>الموقع يستقبل عدداً كبيراً من الزيارات حالياً. يرجى الانتظار لحظات ثم المحاولة مرة أخرى.</p>
    <a href="/" class="retry-btn">إعادة المحاولة</a>
    <p class="note">ستتم إعادة المحاولة تلقائياً خلال 10 ثوانٍ</p>
  </div>
</body>
</html>`;
}

// Rate limiting configurations - use Cloudflare's real IP header
function rateLimitHandler(req: Request, res: Response) {
  if (req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
    res.status(429).json({ message: "تم تجاوز حد الطلبات. يرجى المحاولة مرة أخرى بعد قليل" });
  } else {
    res.status(429).type('text/html').send(get429Page());
  }
}

function hasSessionCookie(req: Request): boolean {
  return !!(req.headers.cookie && req.headers.cookie.includes('connect.sid'));
}

// Per-identity rate-limit key so one client can't be throttled by — or throttle
// — others. Order matters:
//  1. Passport session users → `req.user.id` (web).
//  2. Mobile apps authenticate with a Bearer token (appMemberSessions), NOT a
//     Passport session, and `verifyMemberSession` only runs inside the route
//     handler — so `req.user` is unset when the limiter runs. Without this branch
//     every app user behind the same carrier-grade NAT public IP shares ONE
//     write bucket and intermittently gets HTTP 429 (e.g. when posting a
//     comment). Keying by the token (hashed) gives each session its own bucket.
//  3. Anonymous requests → CDN/real client IP.
function rateLimitKey(req: Request): string {
  const userId = (req as any).user?.id;
  if (userId) return `u:${userId}`;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return `b:${createHash('sha256').update(auth.slice(7)).digest('hex').slice(0, 32)}`;
  }
  // Real visitor IP resolution. When traffic is proxied through our Cloudflare
  // Worker (frontend-edge-worker.js, route sabq.org/*), the worker re-issues
  // the request with `fetch(request)`, which makes Cloudflare REWRITE
  // `cf-connecting-ip` on the origin subrequest to the worker's single egress
  // IP. The result: every visitor collapses into ONE rate-limit bucket and the
  // whole site's anonymous writes (logins, comments, reactions) share the
  // writeLimiter's 1000/15min ceiling → permanent HTTP 429 for everyone.
  //
  // Fix: the worker forwards the genuine client IP it sees in a trusted custom
  // header (`x-sabq-client-ip`; `true-client-ip` is also honored for parity
  // with Cloudflare Enterprise). We prefer that, then fall back to
  // `cf-connecting-ip` (correct for DIRECT origin pulls like api.sabq.org),
  // then the leftmost X-Forwarded-For, then req.ip.
  const forwardedReal = (req.headers['x-sabq-client-ip'] || req.headers['true-client-ip']) as string | undefined;
  const cfIp = req.headers['cf-connecting-ip'] as string;
  const xForwardedFor = req.headers['x-forwarded-for'] as string;
  return forwardedReal?.split(',')[0]?.trim() || cfIp || xForwardedFor?.split(',')[0]?.trim() || req.ip || 'unknown';
}

// Fire-and-forget TELEMETRY beacons (view counter, behavior/accessibility logs)
// are high-frequency, anonymous, and harmless to over-count — they must NOT be
// throttled. Critically, behind the Cloudflare Pages proxy every anonymous
// visitor shares ONE cf-connecting-ip (the Pages egress), so without this skip
// the whole site's view tracking collapses into a single write bucket and 429s
// (symptom: article views frozen at 0). Keep this list to telemetry only.
function isTelemetryWrite(req: Request): boolean {
  const p = req.path;
  return (
    /^\/api\/articles\/[^/]+\/view$/.test(p) || // article view counter
    p === "/api/behavior/log" ||                // behavior beacon
    p === "/api/accessibility/track"            // accessibility beacon
  );
}

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // 10000 requests per IP/user per window (high-traffic site behind CDN)
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  // Per-user keying when authenticated, IP otherwise (security audit H7).
  keyGenerator: rateLimitKey,
  skip: (req) => {
    if (req.path.startsWith("/health") || req.path.startsWith("/ready")) return true;
    if (req.method === "GET") return true;
    if (isTelemetryWrite(req)) return true;
    return false;
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  message: { message: "تم تجاوز حد محاولات تسجيل الدخول. يرجى المحاولة بعد 15 دقيقة" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window for sensitive operations
  message: { message: "تم تجاوز حد الطلبات للعمليات الحساسة. يرجى المحاولة بعد قليل" },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
  // Key by authenticated user when available, IP otherwise (security
  // audit H7, 2026-05-11). The previous skip-on-session-cookie meant a
  // stolen session token bypassed every write limit; per-user keying
  // closes that path while keeping anonymous writes IP-limited.
  keyGenerator: rateLimitKey,
  skip: (req) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return true;
    if (isTelemetryWrite(req)) return true;
    return false;
  },
});

// ---------------------------------------------------------------------------
// CACHE-CONTROL INVARIANT FOR NOINDEX SPA ROUTES (do not break)
// ---------------------------------------------------------------------------
// Noindex SPA routes (dashboard, admin, search, profile, auth flows, payment,
// onboarding, etc. — see server/utils/noindexPaths.ts) MUST always respond
// with `Cache-Control: private, no-store`. Anything containing `public` or
// `s-maxage` would leak authenticated HTML into the Cloudflare/edge cache.
//
// Two independent layers enforce this:
//
//   1. The "smart caching" middleware below sets the noindex default
//      directly: any HTML-ish path matched by isNoindexPath() gets
//      `private, no-store`; everything else gets the normal SPA default
//      (`public, max-age=60, s-maxage=300, stale-while-revalidate=600`).
//      This protects HEAD requests and any code path that bypasses the
//      SEO injector.
//
//   2. The SEO injector middleware (server/seoInjector.ts, registered later
//      in the async init block) re-sets `private, no-store` for every route
//      whose resolved robots meta contains `noindex`. This catches dynamic
//      noindex cases (tracking params, deep paginated lists, missing
//      content, etc.) that aren't in the static path list.
//
// A dev-mode `res.on('finish')` hook (registered immediately below the smart
// caching middleware) asserts that no noindex path ever ships a Cache-Control
// containing `public` or `s-maxage`. It throws in development and
// NODE_ENV=test so a future middleware reorder, a stray `res.setHeader` in
// Vite/static glue, or a drift in the noindex path list is caught before
// deploy. The authoritative noindex list lives in server/utils/noindexPaths.ts.
// ---------------------------------------------------------------------------

// Smart caching middleware - must come before routes
app.use((req, res, next) => {
  const path = req.path;
  
  // Hashed assets (Vite generates files like main-abc123.js)
  // Cache aggressively with immutable flag - s-maxage for Cloudflare CDN
  if (/\/assets\/.*\.(js|css)$/.test(path) && /[-_][a-f0-9]{8,}/.test(path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
  }
  // Images and fonts - cache for 1 year (CDN and browser)
  else if (/\.(jpg|jpeg|png|gif|svg|webp|avif|ico|woff|woff2|ttf|eot)$/i.test(path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400');
  }
  // HTML pages (SPA routes) — public, edge-cacheable for fast TTFB.
  // - max-age=60: short browser cache so users see fresh content quickly.
  // - s-maxage=300: Cloudflare/edge caches for 5 minutes for fast repeat hits.
  // - stale-while-revalidate=600: edge can serve a stale copy for 10 min
  //   while refreshing in the background, eliminating cold-start tax.
  //
  // Noindex SPA routes (search/dashboard/profile/auth/etc. — see
  // server/utils/noindexPaths.ts) are explicitly downgraded to
  // `private, no-store` here so private surfaces NEVER ship a CDN-cacheable
  // header — even for HEAD requests or any code path that bypasses the SEO
  // injector. The SEO injector also sets the same value as defense-in-depth
  // (and the dev guard below asserts both layers stay in sync).
  else if (path.endsWith('.html') || (!path.startsWith('/api/') && !path.includes('.'))) {
    if (isNoindexPath(path)) {
      res.setHeader('Cache-Control', 'private, no-store');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    }
  }
  // API routes - cache is now controlled per-endpoint in routes.ts via cacheControl middleware
  // No default cache headers set here to allow individual routes to opt-in
  
  next();
});

// Dev-mode regression guard for the invariant documented above.
// Hooks res.on('finish') and asserts that no noindex SPA route ever sends a
// Cache-Control containing `public` or `s-maxage`. Active in development and
// NODE_ENV=test only — never runs in production hot paths.
//
// Additionally, this guard treats ANY HTML SPA response shipping with a 404
// or 410 status as if it were a noindex surface — those responses are the
// `setNoBrowserCacheHeaders` code path in server/utils/sendIndexHtml.ts, and
// they must NEVER ship `public`, `s-maxage`, or `stale-while-revalidate`,
// regardless of whether their request path is on the static noindex
// allow-list (most 404/410 paths are decided dynamically by a DB lookup in
// server/contentExistenceMiddleware.ts and the static-asset 404 fallback
// below). This catches the regression class of task #72 — where the SEO
// injector's smart-caching default leaked into a 404 SPA shell — in dev/test
// instead of in production edge caches.
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    // Skip non-SPA paths quickly (assets, api, files with extensions).
    const p = req.path;
    if (
      p.startsWith("/api/") ||
      p.startsWith("/assets/") ||
      p.startsWith("/@") ||
      p.startsWith("/src/") ||
      p.startsWith("/node_modules/") ||
      /\.\w{2,5}$/.test(p)
    ) {
      return next();
    }

    res.on("finish", () => {
      const status = res.statusCode;
      const isErrorSpa = status === 404 || status === 410;
      const isNoindex = isNoindexPath(p);
      if (!isErrorSpa && !isNoindex) return;

      // Only police HTML responses; JSON/text 404s from API-ish handlers
      // never matched our SPA-path filter above, but be defensive.
      const ct = String(res.getHeader("Content-Type") || "").toLowerCase();
      if (ct && !ct.includes("text/html")) return;

      const cc = String(res.getHeader("Cache-Control") || "").toLowerCase();
      const cdn = String(res.getHeader("CDN-Cache-Control") || "").toLowerCase();

      const ccLeaks =
        !!cc &&
        (cc.includes("public") ||
          cc.includes("s-maxage") ||
          cc.includes("stale-while-revalidate"));

      // Parse `max-age=N` from CDN-Cache-Control and flag if N > 0.
      // The leading `(?:^|[,;\s])` anchor excludes the `s-maxage` token.
      let cdnLeaks = false;
      if (cdn) {
        const m = cdn.match(/(?:^|[,;\s])max-age\s*=\s*(\d+)/);
        if (m && Number(m[1]) > 0) cdnLeaks = true;
      }

      // For 404/410 SPA shells, also strictly require `private, no-store` —
      // the absence of those directives is itself a regression even if the
      // header doesn't contain a known leaky token (e.g. an empty or
      // alternative non-cacheable value would otherwise pass silently).
      const missingPrivateNoStore =
        isErrorSpa && (!cc || !cc.includes("private") || !cc.includes("no-store"));

      if (!ccLeaks && !cdnLeaks && !missingPrivateNoStore) return;

      const surfaceLabel = isErrorSpa
        ? `${status} SPA shell`
        : `noindex route`;
      const reason = missingPrivateNoStore && !ccLeaks && !cdnLeaks
        ? `is missing required "private, no-store" directives`
        : `would leak private/error HTML into the CDN`;
      const msg =
        `[CacheControlGuard] FATAL: ${surfaceLabel} "${p}" responded with ` +
        `Cache-Control="${cc}"` +
        (cdn ? `, CDN-Cache-Control="${cdn}"` : "") +
        `. This ${reason}. ` +
        (isErrorSpa
          ? `404/410 SPA responses must ship "private, no-store" via ` +
            `setNoBrowserCacheHeaders in server/utils/sendIndexHtml.ts — ` +
            `check that the SEO injector's smart-cache default is not ` +
            `running after the 404 handler set its headers.`
          : `Check middleware ordering — the SEO injector must override ` +
            `the smart caching default to "private, no-store". See the ` +
            `invariant block in server/index.ts and ` +
            `server/utils/noindexPaths.ts.`);
      console.error(msg);
      // Throwing inside a 'finish' listener surfaces as an unhandled
      // exception in dev and is caught by the process-level handler at
      // the top of this file, making the regression impossible to miss.
      throw new Error(msg);
    });

    next();
  });
  console.log(
    `[Server] ✅ Dev Cache-Control guard active for noindex + 404/410 SPA routes (NODE_ENV=${process.env.NODE_ENV ?? "development"})`,
  );
}

// Apply general rate limiter to all API routes
app.use("/api", generalApiLimiter);
app.use("/api", writeLimiter);

// ============================================
// APM (Application Performance Monitoring) Middleware
// ============================================
const APM_BUFFER_SIZE = 1000;
const apmResponseBuffer = new Float64Array(APM_BUFFER_SIZE);
let apmBufferIndex = 0;
let apmBufferCount = 0;

const apmStats = {
  requests: { total: 0, success: 0, errors: 0 },
  slowRequests: [] as { path: string; method: string; duration: number; timestamp: Date }[],
  errorPaths: new Map<string, number>(),
};

function sendApmStats(_req: Request, res: Response) {
  const samplesCount = apmBufferCount;
  let avgResponseTime = 0;
  if (samplesCount > 0) {
    let sum = 0;
    for (let i = 0; i < samplesCount; i++) sum += apmResponseBuffer[i];
    avgResponseTime = sum / samplesCount;
  }

  const sortedTimes = Array.from(apmResponseBuffer.subarray(0, samplesCount)).sort((a, b) => a - b);
  const p95Index = Math.floor(samplesCount * 0.95);
  const p95ResponseTime = sortedTimes[p95Index] || 0;
  
  res.json({
    requests: apmStats.requests,
    performance: {
      avgResponseTime: Math.round(avgResponseTime),
      p95ResponseTime: Math.round(p95ResponseTime),
      samplesCount,
    },
    slowRequests: apmStats.slowRequests.slice(-10), // Last 10 slow requests
    topErrorPaths: Array.from(apmStats.errorPaths.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
}

function resetApmStats(_req: Request, res: Response) {
  apmStats.requests = { total: 0, success: 0, errors: 0 };
  apmResponseBuffer.fill(0);
  apmBufferIndex = 0;
  apmBufferCount = 0;
  apmStats.slowRequests = [];
  apmStats.errorPaths.clear();
  res.json({ message: "APM stats reset successfully" });
}

const isDevEnv = process.env.NODE_ENV !== 'production';

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;

  if (!reqPath.startsWith("/api") || reqPath.includes("/apm/")) {
    return next();
  }

  res.on("finish", () => {
    const duration = Date.now() - start;

    apmStats.requests.total++;

    if (res.statusCode >= 200 && res.statusCode < 400) {
      apmStats.requests.success++;
    } else if (res.statusCode >= 400) {
      apmStats.requests.errors++;
      const normalizedPath = reqPath.replace(/\/\d+/g, '/:id').replace(/\/[a-f0-9-]{36}/gi, '/:uuid');
      const errorCount = apmStats.errorPaths.get(normalizedPath) || 0;
      apmStats.errorPaths.set(normalizedPath, errorCount + 1);
      if (apmStats.errorPaths.size > 100) {
        const oldestKey = apmStats.errorPaths.keys().next().value;
        if (oldestKey) apmStats.errorPaths.delete(oldestKey);
      }
    }

    apmResponseBuffer[apmBufferIndex % APM_BUFFER_SIZE] = duration;
    apmBufferIndex++;
    if (apmBufferCount < APM_BUFFER_SIZE) apmBufferCount++;

    if (duration > 1000) {
      apmStats.slowRequests.push({
        path: reqPath,
        method: req.method,
        duration,
        timestamp: new Date(),
      });
      if (apmStats.slowRequests.length > 50) {
        apmStats.slowRequests = apmStats.slowRequests.slice(-50);
      }
      console.warn(`[APM] ⚠️ Slow request: ${req.method} ${reqPath} took ${duration}ms`);
    }

    if (isDevEnv) {
      console.log(`${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

const isProduction = process.env.NODE_ENV === "production";
const port = (globalThis as any).__sabqPort || parseInt(process.env.PORT || '5000', 10);
const server = (globalThis as any).__sabqServer || createServer(app);

if (!(globalThis as any).__sabqServer) {
  // reusePort is unsupported on macOS/Darwin; only enable on Linux
  const listenOpts: { port: number; host: string; reusePort?: boolean } =
    process.platform === "linux"
      ? { port, host: "0.0.0.0", reusePort: true }
      : { port, host: "0.0.0.0" };
  server.listen(listenOpts, () => {
    console.log(`[Server] ✅ Listening on port ${port}`);
  });
}

(async () => {
  try {
    console.log("[Server] Starting full initialization...");
    console.log(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`[Server] Port: ${port}`);
    
    if (isProduction) {
      const requiredEnvVars = ["DATABASE_URL"];
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.error(`[Server] ⚠️  WARNING: Missing required environment variables: ${missingVars.join(", ")}`);
        console.error("[Server] Server will start but database features will not work");
      } else {
        console.log("[Server] ✅ All required environment variables are present");
      }
    }

    const { registerRoutes } = await import("./routes");
    const { edgeExistsHandler } = await import("./routes/edgeExistsRoute");
    app.get("/api/edge-exists", edgeExistsHandler);

    const audioNewsletterRoutes = await import("./routes/audioNewsletterRoutes");
    app.use("/api/audio-newsletters", audioNewsletterRoutes.default);
    console.log("[Server] ✅ Audio Newsletter routes registered (priority)");

    const mobileApiRoutes = (await import("./routes/mobileApiRoutes")).default;
    app.use("/api/v1", mobileApiRoutes);
    console.log("[Server] ✅ Mobile API routes registered (v1)");

    await registerRoutes(app, server);
    console.log("[Server] ✅ Routes registered successfully");

    const { requireAuth, requirePermission } = await import("./rbac");
    app.get(
      "/api/apm/stats",
      requireAuth,
      requirePermission("system.manage_settings"),
      sendApmStats,
    );
    app.post(
      "/api/apm/reset",
      requireAuth,
      requirePermission("system.manage_settings"),
      resetApmStats,
    );
    console.log("[Server] ✅ APM endpoints protected (system.manage_settings)");

    const { setupAgentReady } = await import("./agentReady");
    setupAgentReady(app);

    const { setupSwagger } = await import("./swagger");
    setupSwagger(app);
    console.log("[Server] ✅ Swagger documentation available at /api-docs");

    const nanoBananaRoutes = (await import("./routes/nanoBananaRoutes")).default;
    app.use("/api/nano-banana", nanoBananaRoutes);
    console.log("[Server] ✅ Nano Banana Pro routes registered");
    
    const notebookLmRoutes = (await import("./routes/notebookLmRoutes")).default;
    app.use("/api/notebooklm", notebookLmRoutes);
    console.log("[Server] ✅ NotebookLM routes registered");
    
    const visualAiRoutes = (await import("./routes/visualAiRoutes")).default;
    app.use("/api/visual-ai", visualAiRoutes);
    console.log("[Server] ✅ Visual AI routes registered");
    
    const autoImageRoutes = (await import("./routes/autoImageRoutes")).default;
    app.use("/api/auto-image", autoImageRoutes);
    console.log("[Server] ✅ Auto Image Generation routes registered");

    const loyaltyAdminRoutes = (await import("./routes/loyaltyAdmin")).default;
    app.use("/api/loyalty-admin", loyaltyAdminRoutes);
    console.log("[Server] ✅ Loyalty Admin Dashboard routes registered");

    const hajjBlockRoutes = (await import("./routes/hajjBlock")).default;
    app.use("/api/hajj-block", hajjBlockRoutes);
    console.log("[Server] ✅ Hajj Block routes registered");
    
    // Register Thumbnail routes
    const thumbnailRoutes = await import("./routes/thumbnailRoutes");
    app.use("/api/thumbnails", thumbnailRoutes.default);
    console.log("[Server] ✅ Thumbnail routes registered");
    
    // Register Story Cards routes
    const { storyCardsRouter } = await import("./routes/storyCardsRoutes");
    app.post("/api/story-cards/generate", storyCardsRouter.post["/generate"]);
    app.post("/api/story-cards/instagram-carousel", storyCardsRouter.post["/instagram-carousel"]);
    app.post("/api/story-cards/linkedin-document", storyCardsRouter.post["/linkedin-document"]);
    app.get("/api/story-cards/article/:articleId", storyCardsRouter.get["/article/:articleId"]);
    app.patch("/api/story-cards/:cardId", storyCardsRouter.patch["/:cardId"]);
    app.delete("/api/story-cards/:cardId", storyCardsRouter.delete["/:cardId"]);
    console.log("[Server] ✅ Story Cards routes registered");

    const rssFeedRoutes = (await import("./routes/rssFeedRoutes")).default;
    app.use("/api/rss", rssFeedRoutes);
    console.log("[Server] ✅ RSS Feed routes registered");
    
    const aiTasksRoutes = (await import("./routes/aiTasksRoutes")).default;
    app.use("/api/ai-tasks", aiTasksRoutes);
    console.log("[Server] ✅ AI Tasks routes registered");
    
    const advancedAnalyticsRoutes = (await import("./routes/advancedAnalytics")).default;
    app.use("/api/advanced-analytics", advancedAnalyticsRoutes);
    console.log("[Server] ✅ Advanced Analytics routes registered");
    
    const mediaStoreRoutes = (await import("./routes/mediaStoreRoutes")).default;
    app.use("/api/media-store", mediaStoreRoutes);
    console.log("[Server] ✅ Media Store routes registered");
    
    const quizRoutes = (await import("./quiz-routes")).default;
    app.use(quizRoutes);
    console.log("[Server] ✅ Quiz routes registered");

    const smartClassificationRoutes = (await import("./routes/smartClassificationRoutes")).default;
    app.use("/api/smart-classification", smartClassificationRoutes);
    console.log("[Server] ✅ Smart Classification routes registered");

    const sharp = (await import('sharp')).default;
    const fsPromises = (await import('fs/promises'));
    const socialImgDir = path.join(process.cwd(), 'dist', 'public', 'social-images');
    await fsPromises.mkdir(socialImgDir, { recursive: true });
    app.use('/social-images', express.static(socialImgDir, {
      maxAge: '1y',
      immutable: true,
      setHeaders: (res) => {
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=86400, immutable');
      }
    }));

    app.get("/social-image/*", async (req: any, res) => {
      try {
        const rawPath = req.params[0] as string;
        if (!rawPath) return res.status(400).end();

        const cleanPath = rawPath.replace(/\.jpg$/, '');
        const safeFilename = cleanPath.replace(/[^a-zA-Z0-9\-_\/]/g, '') + '.jpg';
        const cachedPath = path.join(socialImgDir, safeFilename.replace(/\//g, '_'));

        try {
          await fsPromises.access(cachedPath);
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=86400, stale-while-revalidate=86400, immutable');
          const cached = await fsPromises.readFile(cachedPath);
          return res.send(cached);
        } catch {}

        const { objectStorageClient, getBucketConfig } = await import('./objectStorage');
        const { bucketName } = getBucketConfig();
        const storagePath = cleanPath.includes('/') ? `public/${cleanPath}` : `public/uploads/${cleanPath}`;
        const bucketsToTry = [bucketName, 'replit-objstore-3dc2325c-bbbe-4e54-9a00-e6f10b243138'];

        let chunks: Buffer[] = [];
        let found = false;
        for (const bName of bucketsToTry) {
          try {
            const bucket = objectStorageClient.bucket(bName);
            const file = bucket.file(storagePath);
            const [exists] = await file.exists();
            if (!exists) continue;
            chunks = [];
            await new Promise<void>((resolve, reject) => {
              file.createReadStream()
                .on('data', (chunk: Buffer) => chunks.push(chunk))
                .on('end', () => resolve())
                .on('error', reject);
            });
            found = true;
            break;
          } catch {}
        }
        if (!found) return res.status(404).end();

        const jpegBuffer = await sharp(Buffer.concat(chunks))
          .resize(1200, 630, { fit: 'cover' })
          .jpeg({ quality: 85 })
          .toBuffer();

        await fsPromises.writeFile(cachedPath, jpegBuffer).catch(() => {});

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=86400, stale-while-revalidate=86400, immutable');
        res.send(jpegBuffer);
      } catch (error) {
        console.error('[Social Image] Error:', error);
        if (!res.headersSent) res.status(500).end();
      }
    });
    console.log("[Server] ✅ Social image endpoint registered (/social-image/)");

    // SPA serving is ON by default (preserves Replit single-process behavior).
    // Set SERVE_SPA=false on Railway (or any headless deployment where the
    // frontend lives elsewhere, e.g. Vercel + Cloudflare) to disable the SPA
    // wiring entirely. Computed here — not just at the SPA-serve block below —
    // because the crawler/SEO middlewares that follow all transform or fall
    // back to dist/public/index.html, which the server-only build never
    // produces. Without this guard seoInjector's getTemplate() throws ENOENT
    // on every non-API GET to the headless backend. Lenient parser: accepts
    // "false"/"0"/"no"/"off" in any case with surrounding whitespace, since
    // Railway/CI env editors sometimes inject them on copy-paste.
    const serveSpaEnv = String(process.env.SERVE_SPA || "").trim().toLowerCase();
    const serveSpa = !["false", "0", "no", "off"].includes(serveSpaEnv);

    if (serveSpa) {
      // Social media crawler middleware - MUST come before Vite/static setup
      // This intercepts crawler requests and serves static HTML with proper meta tags
      const { socialCrawlerMiddleware } = await import("./socialCrawler");
      app.use(socialCrawlerMiddleware);
      console.log("[Server] ✅ Social crawler middleware registered");

      // Legacy URL redirects middleware - MUST run BEFORE seoInjector so that
      // legacy paths like /news/{slug} are 301-redirected before seoInjector
      // sees them as spa-fallback and serves a 200 SPA shell.
      const { legacyRedirectMiddleware } = await import("./legacyRedirectMiddleware");
      app.use(legacyRedirectMiddleware);
      console.log("[Server] ✅ Legacy redirect middleware registered");

      // Content existence middleware - MUST run BEFORE seoInjector. In production
      // it serves a 404 SPA shell directly for missing entity slugs (article,
      // muqtarab, world-day, keyword, reporter, writer, category), preventing
      // seoInjector from overwriting the status with 200.
      const { contentExistenceMiddleware } = await import("./contentExistenceMiddleware");
      app.use(contentExistenceMiddleware);
      console.log("[Server] ✅ Content existence middleware registered (SEO 404)");

      // SEO meta tag injection middleware - Injects dynamic title, OG, Twitter, canonical, JSON-LD
      // into the SPA HTML for all browsers (not just crawlers) to fix SEO indexing.
      const { seoInjectorMiddleware } = await import("./seoInjector");
      app.use(seoInjectorMiddleware);
      console.log("[Server] ✅ SEO injector middleware registered (dynamic meta tags)");
    } else {
      console.log("[Server] 🛰  Headless mode — crawler/SEO middleware skipped (SERVE_SPA=false). SEO is handled by the frontend deployment + Cloudflare edge worker.");
    }

    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Enriched 5xx logging so we can group failures by endpoint + crawler
      // in the GSC recovery work. Logs go to Railway stdout (`[5xx]` prefix
      // is greppable). The previous one-line log buried path + UA + stack
      // on a single line, making patterns invisible. This shape lets us
      // run `grep "\\[5xx\\]" railway.log | jq` to bucket failures.
      if (status >= 500) {
        const ua = (req.headers["user-agent"] as string | undefined) || "";
        const isBot =
          /googlebot|bingbot|duckduckbot|baiduspider|yandex|applebot|facebookexternalhit|twitterbot|whatsapp/i.test(ua);
        console.error(
          `[5xx] ${req.method} ${req.originalUrl} status=${status} bot=${isBot} msg=${JSON.stringify(message)} ua=${JSON.stringify(ua.slice(0, 120))} stack=${JSON.stringify((err.stack || "").split("\n").slice(0, 3).join(" | "))}`
        );
      } else {
        // Sub-500 errors keep the old one-line log; they're not what GSC
        // counts under "Server error".
        console.error(`[Server] Error: ${status} - ${message}`, err);
      }

      const urlPath = req.path;
      if (urlPath.startsWith('/assets/') || urlPath.endsWith('.js') || urlPath.endsWith('.css') || urlPath.endsWith('.map')) {
        return res.status(status).type('text/plain').send('Server error');
      }

      if (req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
        if (process.env.NODE_ENV === 'production' && status >= 500) {
          res.status(status).json({ message: 'خطأ داخلي في الخادم', code: 'INTERNAL_SERVER_ERROR' });
        } else {
          res.status(status).json({ message });
        }
      } else if (status === 429) {
        res.status(429).type('text/html').send(get429Page());
      } else {
        res.status(status).type('text/html').send(`<h1>Error ${status}</h1>`);
      }
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    
    const isProductionMode = process.env.NODE_ENV === "production" || 
                        process.env.REPLIT_DEPLOYMENT === "1" ||
                        fs.existsSync(path.resolve(import.meta.dirname, "public"));
    
    // Strip Set-Cookie from HTML responses for unauthenticated visitors
    // This allows Cloudflare to cache public HTML pages at edge (fast TTFB)
    // Authenticated users still get their session cookies normally
    app.use((req: Request, res: Response, next: NextFunction) => {
      const isHtmlRequest = !req.path.startsWith('/api/') && !req.path.includes('.');
      const isAuthenticated = (req as any).isAuthenticated?.();

      if (isHtmlRequest && !isAuthenticated) {
        const originalSetHeader = res.setHeader.bind(res);
        (res as any).setHeader = function(name: string, value: any) {
          if (name.toLowerCase() === 'set-cookie') return res;
          return originalSetHeader(name, value);
        };
      }
      next();
    });
    console.log("[Server] ✅ Public HTML cache headers middleware registered");

    const { isValidSpaRoute } = await import("./utils/spaRouteMatcher");
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      const urlPath = req.path;
      
      if (urlPath.startsWith('/api/') || 
          urlPath.startsWith('/@') || 
          urlPath.startsWith('/node_modules/') ||
          urlPath.startsWith('/src/') ||
          urlPath.includes('.')) {
        return next();
      }
      
      if (!isValidSpaRoute(urlPath)) {
        // In production, serve index.html with proper 404 status
        const distPath = path.resolve(import.meta.dirname, "public");
        const indexPath = path.resolve(distPath, "index.html");
        
        if (fs.existsSync(indexPath)) {
          // Production mode: serve index.html with 404 status (no browser cache!)
          const { sendIndexHtml } = await import("./utils/sendIndexHtml");
          sendIndexHtml(res, indexPath, 404);
          return;
        }
        // Development mode: just set status (Vite will override but GA will track it)
        res.status(404);
      }
      
      next();
    });
    console.log("[Server] ✅ SEO-friendly 404 middleware registered");
    
    // Production-only: Intercept missing static asset requests before SPA fallback
    // This prevents returning index.html for missing JS/CSS chunks (MIME type errors)
    if (isProductionMode || app.get("env") !== "development") {
      const distPath = path.resolve(import.meta.dirname, "public");
      const staticExtensions = ['.js', '.css', '.map', '.mjs', '.cjs', '.woff', '.woff2', '.ttf', '.eot', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.json', '.xml', '.txt'];
      
      app.use((req: Request, res: Response, next: NextFunction) => {
        const urlPath = req.path;
        
        if (!urlPath.startsWith('/assets/') && !urlPath.startsWith('/branding/') && !urlPath.startsWith('/fixtures/')) {
          const isStaticAsset = staticExtensions.some(ext => urlPath.toLowerCase().endsWith(ext));
          if (!isStaticAsset) {
            return next();
          }
        }
        
        const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = path.join(distPath, safePath);
        
        if (!fs.existsSync(filePath)) {
          // Skip noisy warnings for paths we intentionally never serve as files.
          // /sitemap*.xml: sitemaps are dynamic Express routes; only the numbered
          // buckets exist (/sitemap-articles-1.xml ...). robots.txt + the sitemap
          // index reference ONLY those, so bare /sitemap-articles.xml or
          // /sitemap-index.xml are never linked — a 404 is correct, and the log is
          // just noise from bots/stale URLs. Indexing is unaffected.
          const isNoisy404 =
            urlPath === '/service-worker.js' || /^\/sitemap[\w-]*\.xml$/i.test(urlPath);
          if (!isNoisy404) {
            console.warn(`[Static 404] Missing asset: ${urlPath}`);
          }
          return res.status(404).type('text/plain').send('Not found');
        }
        
        next();
      });
      console.log("[Server] ✅ Static asset 404 guard registered");
    }
    
    // HTML caching is now handled directly in rocketLoaderFix.ts (production)
    // and vite.ts (development) — no writeHead interception needed.
    console.log("[Server] ✅ HTML cache headers handled by serve layer");
    
    // SPA serving is ON by default — preserves existing Replit behavior.
    // `serveSpa` was computed earlier (just before the crawler/SEO middleware
    // block) so that headless deployments skip that block too. Production on
    // Replit (no env override) → serveSpa=true → unchanged.
    if (!serveSpa) {
      console.log("[Server] 🛰  Headless mode — SPA serving disabled (SERVE_SPA=false). Frontend is served externally.");
      // Catch-all for non-API GETs so we return JSON 404 instead of HTML.
      app.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        if (req.path.startsWith("/api/") || req.path.startsWith("/health") || req.path.startsWith("/ready")) return next();
        if (req.path.startsWith("/public-objects/") || req.path.startsWith("/objects/") || req.path.startsWith("/uploads/") || req.path.startsWith("/branding/")) return next();
        res.status(404).json({ message: "Not found", hint: "Backend is headless. SPA is served by the frontend deployment." });
      });
    } else if (!isProductionMode && app.get("env") === "development") {
      console.log("[Server] Starting in DEVELOPMENT mode with Vite");
      // Computed-string import keeps esbuild from following ./vite during
      // bundling. Without this, server/vite.ts (which `import`s the `vite`
      // npm package — a devDependency) gets inlined into dist/index.js,
      // and the production stage's `npm ci --omit=dev` removes vite,
      // crashing the container at startup with ERR_MODULE_NOT_FOUND.
      // This file path is only resolved at runtime in dev mode (where vite
      // IS installed); production code paths never reach this branch.
      const viteModulePath = "./vite";
      const { setupVite } = await import(/* @vite-ignore */ viteModulePath);
      await setupVite(app, server);
      console.log("[Server] ✅ Vite setup completed");
    } else {
      console.log("[Server] Starting in PRODUCTION mode with static files");
      const { serveStaticWithRocketLoaderFix } = await import("./rocketLoaderFix");
      serveStaticWithRocketLoaderFix(app);
      console.log("[Server] ✅ Static files setup with Cloudflare Rocket Loader fix");
    }

    console.log("[Server] ✅ Full initialization complete — all routes registered");
    
      // Warm up database connection before marking ready
      try {
        const { pool } = await import("./db");
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        isServerReady = true;
        if ((globalThis as any).__sabqMarkReady) {
          (globalThis as any).__sabqMarkReady();
        }
        console.log(`[Server] ✅ Database warmed up, server is now READY`);

        // Keep production RBAC in sync after deploys. Permission rows are
        // idempotent, and this prevents deploys from shipping code that
        // expects a permission the database has not received yet.
        setImmediate(async () => {
          try {
            const { seedRBAC } = await import("./seedRBAC");
            const { allRoles, allPermissions } = await seedRBAC();
            console.log(`[Server] ✅ RBAC synced (${allRoles.length} roles, ${allPermissions.length} permissions)`);
          } catch (error) {
            console.error("[Server] ⚠️ RBAC sync failed:", error);
          }
        });

        
        // Warm up dashboard stats cache in background (non-blocking)
        setImmediate(async () => {
          try {
            const { storage } = await import("./storage");
            const { memoryCache, CACHE_TTL } = await import("./memoryCache");
            console.log(`[Cache Warmup] 🔄 Pre-loading dashboard stats cache...`);
            const stats = await storage.getAdminDashboardStats();
            const trimmedStats = {
              ...stats,
              recentArticles: stats.recentArticles.map((article: any) => ({
                id: article.id,
                title: article.title,
                slug: article.slug,
                englishSlug: article.englishSlug || undefined,
                status: article.status,
                publishedAt: article.publishedAt,
                views: article.views,
                author: article.author ? {
                  firstName: article.author.firstName,
                  lastName: article.author.lastName,
                  email: article.author.email,
                } : undefined,
              })),
              topArticles: stats.topArticles.map((article: any) => ({
                id: article.id,
                title: article.title,
                slug: article.slug,
                englishSlug: article.englishSlug || undefined,
                status: article.status,
                publishedAt: article.publishedAt,
                views: article.views,
                category: article.category ? {
                  nameAr: article.category.nameAr,
                } : undefined,
              })),
              recentComments: stats.recentComments.map((comment: any) => ({
                id: comment.id,
                content: comment.content ? comment.content.substring(0, 100) : '',
                status: comment.status,
                createdAt: comment.createdAt,
                user: comment.user ? {
                  firstName: comment.user.firstName,
                  lastName: comment.user.lastName,
                } : undefined,
              })),
            };
            memoryCache.set('admin:dashboard:stats', trimmedStats, CACHE_TTL.MEDIUM);
            console.log(`[Cache Warmup] ✅ Dashboard stats cache loaded successfully`);
          } catch (error) {
            console.error("[Cache Warmup] ⚠️  Dashboard stats cache warmup failed:", error);
          }
        });
        
        // Warm up critical caches in background (non-blocking)
        setImmediate(async () => {
          try {
            const port = parseInt(process.env.PORT || '5000', 10);
            console.log(`[Cache Warmup] 🔄 Pre-loading homepage cache...`);
            const [homepageRes, categoriesRes] = await Promise.all([
              fetch(`http://localhost:${port}/api/homepage-lite`),
              fetch(`http://localhost:${port}/api/categories`),
            ]);
            if (homepageRes.ok) {
              console.log(`[Cache Warmup] ✅ Homepage cache loaded successfully`);
            } else {
              console.error(`[Cache Warmup] ⚠️  Homepage cache warmup failed: HTTP ${homepageRes.status}`);
            }
            if (categoriesRes.ok) {
              console.log(`[Cache Warmup] ✅ Categories cache loaded successfully`);
            } else {
              console.error(`[Cache Warmup] ⚠️  Categories cache warmup failed: HTTP ${categoriesRes.status}`);
            }
          } catch (error) {
            console.error("[Cache Warmup] ⚠️  Cache warmup failed:", error);
          }
        });
      } catch (error) {
        console.error("[Server] ⚠️  Database warmup failed, but marking ready anyway:", error);
        isServerReady = true;
      }

      const enableBackgroundWorkers = process.env.ENABLE_BACKGROUND_WORKERS === "true";
      
      const { tryBecomeLeader, isLeader, getPodId, startLeaderElectionLoop, onBecomeLeader } = await import("./leaderElection");
      await tryBecomeLeader();
      startLeaderElectionLoop(60000);
      
      if (enableBackgroundWorkers) {
        onBecomeLeader(async () => {
          console.log("[Server] Starting background workers after leader failover...");
          try {
            const { startNotificationWorker } = await import("./notificationWorker");
            startNotificationWorker();
          } catch (error) {
            console.error("[Server] Error starting notification worker after failover:", error);
          }
          try {
            const { startPushWorker } = await import("./jobs/pushWorker");
            startPushWorker();
          } catch (error) {
            console.error("[Server] Error starting push worker after failover:", error);
          }
        });
      }
      
      const shouldRunBackgroundJobs = enableBackgroundWorkers && isLeader();
      
      if (!enableBackgroundWorkers) {
        console.log("[Server] Background workers disabled (ENABLE_BACKGROUND_WORKERS not set)");
      } else if (!isLeader()) {
        console.log(`[Server] Pod ${getPodId()} is NOT the leader — background jobs on leader only`);
      } else {
        console.log(`[Server] Pod ${getPodId()} is the LEADER — background jobs enabled`);
      }
      
      if (shouldRunBackgroundJobs) {
        setImmediate(async () => {
          try {
            const { startNotificationWorker } = await import("./notificationWorker");
            startNotificationWorker();
          } catch (error) {
            console.error("[Server] Error starting notification worker:", error);
          }
        });

        setImmediate(async () => {
          try {
            const { startPushWorker } = await import("./jobs/pushWorker");
            startPushWorker();
          } catch (error) {
            console.error("[Server] Error starting push worker:", error);
          }
        });
      }

      // Register job queue handlers for TTS generation
      if (shouldRunBackgroundJobs) {
        setImmediate(async () => {
          try {
            const { jobQueue } = await import("./services/job-queue");
            const { getElevenLabsService } = await import("./services/elevenlabs");
            const { ObjectStorageService } = await import("./objectStorage");
            const { storage } = await import("./storage");

          jobQueue.onExecute(async (job) => {
            if (job.type === 'generate-tts') {
              console.log(`[JobQueue] Executing TTS generation job ${job.id}`);
              
              const { newsletterId } = job.data;
              const newsletter = await storage.getAudioNewsletterById(newsletterId);

              if (!newsletter) {
                throw new Error('النشرة الصوتية غير موجودة');
              }

              // Update status to processing
              await storage.updateAudioNewsletter(newsletter.id, {
                generationStatus: 'processing',
                generationError: null,
              });

              const elevenLabs = getElevenLabsService();
              const objectStorage = new ObjectStorageService();

              if (!elevenLabs) {
                await storage.updateAudioNewsletter(newsletter.id, {
                  generationStatus: 'failed',
                  generationError: 'ElevenLabs service is not available - missing API key',
                });
                throw new Error('ElevenLabs service is not configured');
              }

              // Build script from articles
              const articlesData = newsletter.articles?.map(na => ({
                title: na.article?.title || '',
                excerpt: na.article?.excerpt || undefined,
                aiSummary: na.article?.aiSummary || undefined,
              })) || [];

              const script = elevenLabs.buildNewsletterScript({
                title: newsletter.title,
                description: newsletter.description || undefined,
                articles: articlesData,
              });

              console.log(`[JobQueue] Generating TTS for newsletter ${newsletter.id}`);
              console.log(`[JobQueue] Script length: ${script.length} characters`);

              // Generate audio
              const audioBuffer = await elevenLabs.textToSpeech({
                text: script,
                voiceId: newsletter.voiceId || undefined,
                model: newsletter.voiceModel || undefined,
                voiceSettings: newsletter.voiceSettings || undefined,
              });

              // Upload to object storage
              const audioPath = `audio-newsletters/${newsletter.id}.mp3`;
              const uploadedFile = await objectStorage.uploadFile(
                audioPath,
                audioBuffer,
                'audio/mpeg'
              );

              // Update newsletter with audio details
              await storage.updateAudioNewsletter(newsletter.id, {
                audioUrl: uploadedFile.url,
                fileSize: audioBuffer.length,
                duration: Math.floor(audioBuffer.length / 16000), // Rough estimate
                generationStatus: 'completed',
                generationError: null,
              });

              console.log(`[JobQueue] Successfully generated audio for newsletter ${newsletter.id}`);
            } else if (job.type === 'generate-audio-brief') {
              console.log(`[JobQueue] Executing audio brief generation job ${job.id}`);
              
              const { briefId } = job.data;
              const brief = await storage.getAudioNewsBriefById(briefId);

              if (!brief) {
                throw new Error('الخبر الصوتي غير موجود');
              }

              // Update status to processing
              await storage.updateAudioNewsBrief(briefId, {
                generationStatus: 'processing',
              });

              const elevenLabs = getElevenLabsService();
              const objectStorage = new ObjectStorageService();

              if (!elevenLabs) {
                await storage.updateAudioNewsBrief(briefId, {
                  generationStatus: 'failed',
                });
                throw new Error('ElevenLabs service is not configured');
              }

              console.log(`[JobQueue] Generating TTS for audio brief ${briefId}`);
              console.log(`[JobQueue] Content length: ${brief.content.length} characters`);

              // Generate audio
              const audioBuffer = await elevenLabs.textToSpeech({
                text: brief.content,
                voiceId: brief.voiceId || undefined,
                voiceSettings: brief.voiceSettings || undefined,
              });

              // Upload to object storage
              const audioPath = `audio-briefs/brief_${briefId}_${Date.now()}.mp3`;
              const uploadedFile = await objectStorage.uploadFile(
                audioPath,
                audioBuffer,
                'audio/mpeg'
              );

              // Get audio duration (rough estimate: ~150 words per minute for Arabic)
              const wordCount = brief.content.split(/\s+/).length;
              const estimatedDuration = Math.ceil((wordCount / 150) * 60);

              // Update brief with audio details
              await storage.updateAudioNewsBrief(briefId, {
                audioUrl: uploadedFile.url,
                duration: estimatedDuration,
                generationStatus: 'completed',
              });

              console.log(`[JobQueue] Successfully generated audio for brief ${briefId}`);
            }
          });

            console.log("[Server] ✅ Job queue handlers registered successfully");
          } catch (error) {
            console.error("[Server] ⚠️  Error registering job queue handlers:", error);
            console.error("[Server] Server will continue running without job queue");
          }
        });
      }

      // ============================================
      // DELAYED BACKGROUND JOBS - تأخير الوظائف الخلفية
      // Wait 45 seconds before starting heavy jobs to allow traffic to be served first
      // This reduces deployment downtime significantly
      // ============================================
      const BACKGROUND_JOB_DELAY = 45000; // 45 seconds delay after server starts
      
      console.log(`[Server] 📅 Background jobs will start in ${BACKGROUND_JOB_DELAY / 1000} seconds...`);
      
      if (shouldRunBackgroundJobs) {
        setTimeout(async () => {
          try {
            const { startSeasonalCategoriesJob } = await import("./jobs/seasonalCategoriesJob");
            startSeasonalCategoriesJob();
          } catch (error) {
            console.error("[Server] Error starting seasonal categories job:", error);
          }
        }, BACKGROUND_JOB_DELAY);
      }

      if (shouldRunBackgroundJobs) {
        setTimeout(async () => {
          try {
            const { startDynamicCategoriesJob } = await import("./jobs/dynamicCategoriesJob");
            startDynamicCategoriesJob();
          } catch (error) {
            console.error("[Server] Error starting dynamic categories job:", error);
          }
        }, BACKGROUND_JOB_DELAY + 5000);
      }

      if (shouldRunBackgroundJobs) {
        setTimeout(async () => {
          try {
            const { startCampaignDailyResetJob } = await import("./jobs/campaignDailyResetJob");
            startCampaignDailyResetJob();
          } catch (error) {
            console.error("[Server] Error starting campaign daily reset job:", error);
          }
        }, BACKGROUND_JOB_DELAY + 10000);
      }

      if (shouldRunBackgroundJobs) {
        setTimeout(async () => {
          try {
            const { startNativeAdsDailyResetJob } = await import("./jobs/nativeAdsDailyResetJob");
            startNativeAdsDailyResetJob();
          } catch (error) {
            console.error("[Server] Error starting native ads daily reset job:", error);
          }
        }, BACKGROUND_JOB_DELAY + 15000);
      }
      
      // Start Audio Newsletter Jobs (scheduled generation and retries) - delayed
      if (shouldRunBackgroundJobs) {
        setTimeout(async () => {
          try {
            const { initializeAudioNewsletterJobs } = await import("./jobs/audioNewsletterJob");
            initializeAudioNewsletterJobs();
            console.log("[Server] ✅ Audio newsletter jobs started successfully");
          } catch (error) {
            console.error("[Server] ⚠️  Error starting audio newsletter jobs:", error);
            console.error("[Server] Server will continue running without audio newsletter automation");
          }
        }, BACKGROUND_JOB_DELAY + 20000); // +20s stagger
      }

      const enableNewsletterScheduler = process.env.ENABLE_NEWSLETTER_SCHEDULER !== 'false';
      
      if (shouldRunBackgroundJobs && enableNewsletterScheduler) {
        setTimeout(async () => {
          try {
            const { newsletterScheduler } = await import("./services/newsletterScheduler");
            newsletterScheduler.start();
            console.log("[Server] Newsletter scheduler started");
          } catch (error) {
            console.error("[Server] Error starting newsletter scheduler:", error);
          }
        }, BACKGROUND_JOB_DELAY + 25000);
      }
      
      const enableAITasksScheduler = process.env.ENABLE_AI_TASKS_SCHEDULER !== 'false';
      
      if (shouldRunBackgroundJobs && enableAITasksScheduler) {
        setTimeout(async () => {
          try {
            const { startAITasksScheduler } = await import("./jobs/aiTasksJob");
            startAITasksScheduler();
          } catch (error) {
            console.error("[Server] Error starting AI tasks scheduler:", error);
          }
        }, BACKGROUND_JOB_DELAY + 30000);
        
        setTimeout(async () => {
          try {
            const { startAiTasksCleanupJob } = await import("./jobs/aiTasksCleanup");
            startAiTasksCleanupJob();
          } catch (error) {
            console.error("[Server] Error starting AI tasks cleanup:", error);
          }
        }, BACKGROUND_JOB_DELAY + 40000);
        
        setTimeout(async () => {
          try {
            const { startArticleEditLocksCleanupJob } = await import("./jobs/articleEditLocksCleanup");
            startArticleEditLocksCleanupJob();
            const { startDatabaseCleanupJob } = await import("./jobs/databaseCleanupJob");
            startDatabaseCleanupJob();
          } catch (error) {
            console.error("[Server] Error starting cleanup jobs:", error);
          }
        }, BACKGROUND_JOB_DELAY + 50000);
        
        setTimeout(async () => {
          try {
            const { startIfoxContentGeneratorJob } = await import("./jobs/ifoxContentGeneratorJob");
            startIfoxContentGeneratorJob();
          } catch (error) {
            console.error("[Server] Error starting iFox generator:", error);
          }
        }, BACKGROUND_JOB_DELAY + 60000);
        
        setTimeout(async () => {
          try {
            const { startWorldDaysReminderJob } = await import("./jobs/worldDaysReminder");
            startWorldDaysReminderJob();
          } catch (error) {
            console.error("[Server] Error starting world days reminder:", error);
          }
        }, BACKGROUND_JOB_DELAY + 70000);
        
        setTimeout(async () => {
          try {
            const { startStaffCommunicationsScheduler } = await import("./jobs/staffCommunicationsJob");
            startStaffCommunicationsScheduler();
          } catch (error) {
            console.error("[Server] Error starting staff comms scheduler:", error);
          }
        }, BACKGROUND_JOB_DELAY + 80000);
        
        setTimeout(async () => {
          try {
            const { startArticleDailyStatsJob } = await import("./jobs/articleDailyStatsJob");
            startArticleDailyStatsJob();
          } catch (error) {
            console.error("[Server] Error starting article daily stats job:", error);
          }
        }, BACKGROUND_JOB_DELAY + 90000);


        // Missing Thumbnails Regeneration - DISABLED for performance
        // TODO: Re-enable when missing images are fixed
        // setTimeout(async () => {
        //   try {
        //     const thumbnailService = await import('./services/thumbnailService');
        //     console.log("[Thumbnail Job] 🖼️ Starting missing thumbnails regeneration...");
        //     thumbnailService.generateMissingThumbnails(10).then(() => {
        //       console.log("[Thumbnail Job] ✅ Initial thumbnail regeneration completed");
        //     }).catch((err: any) => {
        //       console.error("[Thumbnail Job] ⚠️ Thumbnail regeneration error:", err);
        //     });
        //   } catch (error) {
        //     console.error("[Server] ⚠️ Error starting thumbnail job:", error);
        //   }
        // }, BACKGROUND_JOB_DELAY + 90000);
        console.log("[Thumbnail Job] ⏸️ Disabled for performance optimization");
        
        // Dashboard Stats Cache Refresh - runs every 4 minutes to keep cache warm
        setTimeout(async () => {
          try {
            const { storage } = await import("./storage");
            const { memoryCache, CACHE_TTL } = await import("./memoryCache");
            
            const refreshDashboardCache = async () => {
              try {
                const stats = await storage.getAdminDashboardStats();
                const trimmedStats = {
                  ...stats,
                  recentArticles: stats.recentArticles.map((article: any) => ({
                    id: article.id,
                    title: article.title,
                    slug: article.slug,
                    englishSlug: article.englishSlug || undefined,
                    status: article.status,
                    publishedAt: article.publishedAt,
                    views: article.views,
                    author: article.author ? {
                      firstName: article.author.firstName,
                      lastName: article.author.lastName,
                      email: article.author.email,
                    } : undefined,
                  })),
                  topArticles: stats.topArticles.map((article: any) => ({
                    id: article.id,
                    title: article.title,
                    slug: article.slug,
                    englishSlug: article.englishSlug || undefined,
                    status: article.status,
                    publishedAt: article.publishedAt,
                    views: article.views,
                    category: article.category ? {
                      nameAr: article.category.nameAr,
                    } : undefined,
                  })),
                  recentComments: stats.recentComments.map((comment: any) => ({
                    id: comment.id,
                    content: comment.content ? comment.content.substring(0, 100) : '',
                    status: comment.status,
                    createdAt: comment.createdAt,
                    user: comment.user ? {
                      firstName: comment.user.firstName,
                      lastName: comment.user.lastName,
                    } : undefined,
                  })),
                };
                memoryCache.set('admin:dashboard:stats', trimmedStats, CACHE_TTL.MEDIUM);
                console.log("[Dashboard Cache] ✅ Cache refreshed successfully");
              } catch (error) {
                console.error("[Dashboard Cache] ⚠️ Refresh failed:", error);
              }
            };
            
            setInterval(refreshDashboardCache, 30 * 60 * 1000);
            console.log("[Server] ✅ Dashboard Cache Refresh job started (every 30 minutes)");
          } catch (error) {
            console.error("[Server] ⚠️ Error starting dashboard cache refresh:", error);
          }
        }, BACKGROUND_JOB_DELAY + 100000);
        
      } else if (!shouldRunBackgroundJobs) {
        console.log("[Server] AI Tasks Scheduler skipped (background workers disabled or not leader)");
      } else {
        console.log("[Server] AI Tasks Scheduler disabled (set ENABLE_AI_TASKS_SCHEDULER=true to enable)");
      }

      // أخبار المونديال: التسجيل خارج بوابة isLeader() عمدًا — أثناء النشر
      // يقلع الـ pod الجديد قبل موت القديم فلا يكون قائدًا لحظة الإقلاع،
      // والتسجيل المشروط بالقيادة يترك الوظيفة ميتة. الـ cron يُجدول هنا
      // دائمًا، وفحص القيادة يتم داخل كل دورة في worldCupNewsJob نفسه.
      if (enableBackgroundWorkers) {
        setTimeout(async () => {
          try {
            const { startWorldCupNewsJob } = await import("./jobs/worldCupNewsJob");
            startWorldCupNewsJob();
          } catch (error) {
            console.error("[Server] Error starting world cup news job:", error);
          }
        }, BACKGROUND_JOB_DELAY);
      }

    // Handle server errors
    server.on("error", (error: any) => {
      console.error("[Server] ❌ Server error:", error);
      if (error.code === "EADDRINUSE") {
        console.error(`[Server] Port ${port} is already in use`);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error("[Server] Fatal error during route initialization:", error);
    console.error("[Server] Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
    console.error("[Server] Server is still listening — health check will work but routes may be incomplete");
  }
})();


if (!(globalThis as any).__sabqServer) {
  process.on("SIGTERM", () => {
    console.log("[Server] SIGTERM signal received: closing HTTP server");
    process.exit(0);
  });
  process.on("SIGINT", () => {
    console.log("[Server] SIGINT signal received: closing HTTP server");
    process.exit(0);
  });
}
