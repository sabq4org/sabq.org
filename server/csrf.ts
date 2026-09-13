import { Request, Response, NextFunction, RequestHandler } from "express";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
  }
}

const CSRF_HEADER = "x-csrf-token";
const CSRF_COOKIE = "csrf-token";

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function ensureCsrfToken(req: Request): string {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }
  return req.session.csrfToken;
}

export const getCsrfToken: RequestHandler = (req, res) => {
  const token = ensureCsrfToken(req);
  
  // Cross-subdomain mode: when COOKIE_SAMESITE=none, the CSRF cookie must
  // mirror the session cookie config so the browser sends both on cross-site
  // fetches. Strict would otherwise drop the CSRF cookie on cross-origin
  // navigations from the frontend.
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  const sessionSameSite = (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none" | undefined);
  const csrfSameSite: "lax" | "strict" | "none" =
    sessionSameSite === "none"
      ? "none"
      : process.env.NODE_ENV === "production"
        ? "strict"
        : "lax";
  const csrfSecure = csrfSameSite === "none" ? true : process.env.NODE_ENV === "production";

  // httpOnly: true (security audit H1, 2026-05-11). The frontend
  // primarily reads the token from this endpoint's JSON body and stores
  // it in memory; the cookie itself is only used by the server as a
  // double-submit check. Locking it from JS prevents an XSS leak —
  // previously, since SameSite=none weakens CSRF defaults to zero, a
  // single XSS could pair the stolen token with a forged request and
  // bypass CSRF entirely.
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: csrfSecure,
    sameSite: csrfSameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
  
  res.json({ csrfToken: token });
};

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

const EXEMPT_PATHS = [
  "/api/login",
  "/api/register",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/auth/apple",
  "/api/auth/apple/callback",
  "/api/csrf-token",
  // 2FA login-flow endpoints — user is mid-login (pending2FAUserId in session),
  // not yet authenticated, so no CSRF token is available yet. These are
  // already protected by the pending session token + rate limiting + the 2FA code itself.
  "/api/2fa/verify",
  "/api/2fa/verify-sms",
  "/api/2fa/send-sms",
  "/api/oauth/token",  // RFC 6749 §5.2 token endpoint — uses client auth, not CSRF
  "/api/webhooks/",
  "/api/whatsapp/",
  "/api/twilio/",
  "/api/email-agent/webhook",  // SendGrid inbound parse webhook
  "/api/correspondent-applications",  // Public reporter registration form
  "/api/opinion-author-applications",  // Public opinion author registration form
  "/api/accessibility/track",  // Accessibility tracking for anonymous users
  // NOTE: Do NOT add a broad "/api/articles/" prefix here. EXEMPT_PATHS uses
  // startsWith matching, so a prefix would silently disable CSRF on every
  // state-changing route under /api/articles/* (comments, reactions, tags,
  // AI content generation, …) — a CSRF bypass (security audit S-01, 2026-06-07).
  // Only the anonymous, header-less telemetry routes (view / reading-time,
  // sent via raw fetch or navigator.sendBeacon which cannot attach the
  // x-csrf-token header) are exempted, via EXEMPT_REGEX below.
  "/api/native-ads/",  // Native ads tracking (impressions/clicks) for anonymous users
  "/api/store/auth/",  // Store customer authentication (login, register, etc.)
  "/api/store/cart",  // Store cart operations
  "/api/analytics/visitors/ping",  // Visitor heartbeat for anonymous users
  "/api/v1/",  // Mobile API (iOS/Android apps)
  // Machine-to-machine agent/webhook routes — authenticated by shared secret
  // (x-agent-secret), not by browser session cookies. Without this exemption
  // CSRF middleware returns 403 and meetings-agent never persists transcripts
  // (UI: «تعذر توليد المحضر» / 0 مقاطع). Prefix covers future /api/internal/*.
  "/api/internal/",
  "/api/angle-submissions",  // Public angle submission form (Muqtarab)
  // Muqtarab public topic view counter (anonymous, idempotent-ish increment).
  // Only public /topics/:id/view lives here; authenticated writer routes are
  // under /api/muqtarab/my-angle/* and remain CSRF-protected.
  "/api/muqtarab/topics/",
  "/api/admin/moderator/disconnect",  // sendBeacon on tab close can't send headers
  "/api/editor-presence/",  // Live editor presence heartbeat/leave (session-auth gated, sendBeacon on unload)
  // Behavior telemetry — fire-and-forget analytics sent via sendBeacon
  // (which cannot attach an x-csrf-token header). The endpoint is
  // session-auth gated (returns 204 for anonymous), tightly rate-limited,
  // append-only and idempotent in effect, so CSRF adds no real protection.
  "/api/behavior/log",
  // Reading-history sync also flushes via sendBeacon on pagehide. The
  // endpoint requires authentication, only writes the user's own history,
  // and is idempotent (entries are upserted by id), so CSRF adds no real
  // protection here either.
  "/api/me/reading-history",
  // Public short-link generation for article sharing — anonymous visitors
  // trigger this from article pages and may not have a session cookie yet
  // (especially in in-app WebViews like WhatsApp/Telegram). The endpoint is
  // unauthenticated, rate-limited, and idempotent, so CSRF adds no real
  // protection here.
  // NOTE: EXEMPT_PATHS uses startsWith matching, so this also exempts any
  // future route nested under /api/shortlinks/* (e.g. /api/shortlinks/foo).
  // Before adding new state-changing routes under this prefix, confirm they
  // are safe to expose without CSRF or move them to a different prefix.
  "/api/shortlinks",
  // Public prompt-studio optimizer — shared-password gated (not session auth),
  // used by external collaborators without a Sabq account. Protected by its own
  // password check + rate limiting, so the session-bound CSRF token adds no
  // real protection. Exact route only (the authenticated /optimize variant
  // does NOT start with this string and remains CSRF-protected).
  "/api/prompt-studio/optimize-public",
  // Survey responses via personal token links (/survey/<token>). The token
  // itself is the credential (unauthenticated, unguessable, one response per
  // invitation enforced server-side) and the native apps submit without any
  // cookie session, so the session-bound CSRF token adds no real protection.
  "/api/public/surveys/",
];

// Precise exemptions for anonymous, header-less telemetry routes that live
// under an otherwise CSRF-protected prefix. These are reached via raw fetch
// or navigator.sendBeacon (which cannot attach the x-csrf-token header), are
// unauthenticated/idempotent in effect, so CSRF adds no real protection.
// Anchored regexes — NOT prefixes — so sibling state-changing routes
// (e.g. /api/articles/:id/react, /comments) stay protected (S-01).
const EXEMPT_REGEX = [
  /^\/api\/articles\/[^/]+\/view$/,          // Arabic article view counter (sendBeacon)
  /^\/api\/articles\/[^/]+\/reading-time$/,  // Reading-time telemetry (sendBeacon)
  /^\/api\/en\/articles\/[^/]+\/view$/,      // English article view counter (raw fetch)
  /^\/api\/ur\/articles\/[^/]+\/view$/,      // Urdu article view counter (raw fetch)
];

export function isCsrfExemptRequest(
  method: string,
  path: string,
  originalUrl: string,
): boolean {
  const originalPath = originalUrl.split("?", 1)[0];

  // CSP reports are anonymous browser telemetry. Exempt only this exact POST;
  // sibling paths and other methods remain CSRF-protected.
  if (method === "POST" &&
      (path === "/api/security/csp-report" || path === "/security/csp-report" ||
       originalPath === "/api/security/csp-report")) {
    return true;
  }

  // Check both req.path and req.originalUrl since middleware mounting affects req.path
  if (EXEMPT_PATHS.some(exempt =>
    path === exempt || path.startsWith(exempt) ||
    originalPath === exempt || originalPath.startsWith(exempt)
  )) {
    return true;
  }

  // Dev-only test endpoints — never exempt in production (S-08).
  if (process.env.NODE_ENV !== "production" &&
      (path.startsWith("/api/test/") || originalPath.startsWith("/api/test/"))) {
    return true;
  }

  // req.path carries no query string, so the $-anchored regexes match it
  // reliably even when originalUrl has a ?query suffix.
  return EXEMPT_REGEX.some(re => re.test(path) || re.test(originalPath));
}

export const validateCsrfToken: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  // Exact machine-to-machine endpoint; its Tap signature replaces cookie CSRF.
  // originalUrl retains /api when this middleware is mounted under that prefix.
  if (req.method === "POST" && /^\/api\/media-store\/webhook\/?$/i.test(req.originalUrl.split("?")[0])) {
    return next();
  }

  if (isCsrfExemptRequest(req.method, req.path, req.originalUrl)) {
    return next();
  }

  if (!req.session) {
    console.warn("[CSRF] No session found for request:", req.path);
    return res.status(403).json({ 
      message: "الجلسة غير متوفرة. يرجى تحديث الصفحة والمحاولة مرة أخرى" 
    });
  }

  const sessionToken = req.session.csrfToken;
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;
  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;

  if (!headerToken) {
    console.warn("[CSRF] No X-CSRF-Token header for:", req.path);
    return res.status(403).json({ 
      message: "رمز الحماية مطلوب للعمليات الحساسة. يرجى تحديث الصفحة" 
    });
  }

  let compareToken = sessionToken;

  if (!compareToken && cookieToken && headerToken) {
    try {
      if (cookieToken.length === headerToken.length &&
          crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
        req.session.csrfToken = cookieToken;
        compareToken = cookieToken;
      }
    } catch {}
  }

  if (!compareToken) {
    console.warn("[CSRF] No session token for:", req.path);
    return res.status(403).json({ 
      message: "رمز الحماية غير متوفر. يرجى تحديث الصفحة والمحاولة مرة أخرى" 
    });
  }

  try {
    if (!crypto.timingSafeEqual(
      Buffer.from(compareToken),
      Buffer.from(headerToken)
    )) {
      console.warn("[CSRF] Token mismatch for:", req.path);
      return res.status(403).json({ 
        message: "رمز الحماية غير صالح. يرجى تحديث الصفحة والمحاولة مرة أخرى" 
      });
    }
  } catch (error) {
    console.warn("[CSRF] Token comparison error for:", req.path, error);
    return res.status(403).json({ 
      message: "رمز الحماية غير صالح" 
    });
  }

  next();
};

export function regenerateCsrfToken(req: Request): string {
  req.session.csrfToken = generateCsrfToken();
  return req.session.csrfToken;
}
