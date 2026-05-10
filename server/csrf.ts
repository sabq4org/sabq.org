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

  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
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
  "/api/forgot-password",
  "/api/reset-password",
  "/api/verify-email",
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
  "/api/articles/",  // Article views for anonymous users
  "/api/en/articles/",  // English article views for anonymous users
  "/api/ur/articles/",  // Urdu article views for anonymous users
  "/api/native-ads/",  // Native ads tracking (impressions/clicks) for anonymous users
  "/api/store/auth/",  // Store customer authentication (login, register, etc.)
  "/api/store/cart",  // Store cart operations
  "/api/ai/chat",  // AI chatbot for public users
  "/api/en/chat",  // English AI chatbot
  "/api/ur/chat",  // Urdu AI chatbot
  "/api/test/",  // Test endpoints for development
  "/api/analytics/visitors/ping",  // Visitor heartbeat for anonymous users
  "/api/v1/",  // Mobile API (iOS/Android apps)
  "/api/angle-submissions",  // Public angle submission form (Muqtarab)
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
];

function isExemptPath(path: string, originalUrl: string): boolean {
  // Check both req.path and req.originalUrl since middleware mounting affects req.path
  return EXEMPT_PATHS.some(exempt => 
    path === exempt || path.startsWith(exempt) ||
    originalUrl === exempt || originalUrl.startsWith(exempt)
  );
}

export const validateCsrfToken: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  if (isExemptPath(req.path, req.originalUrl)) {
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
