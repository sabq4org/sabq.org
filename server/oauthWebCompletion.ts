import type { ErrorRequestHandler, Request, Response } from "express";

type OAuthProvider = "google" | "apple";
type OAuthUser = { id?: string; twoFactorEnabled?: boolean };

function safeTokenErrorField(value: unknown, fallback: string): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return fallback;
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return sanitized || fallback;
}

/** Handles only Apple's expired/replayed OAuth grant; all other errors continue. */
export function createOAuthTokenErrorHandler(provider: OAuthProvider): ErrorRequestHandler {
  const failure = `/ar/login?error=${provider}_auth_failed`;
  return (error, _req, res, next) => {
    const tokenError = error as { name?: unknown; code?: unknown; status?: unknown } | undefined;
    if (provider !== "apple" || tokenError?.name !== "TokenError" || tokenError.code !== "invalid_grant") {
      return next(error);
    }
    const code = safeTokenErrorField(tokenError.code, "unknown");
    const status = safeTokenErrorField(tokenError.status, "unknown");
    console.warn(`[${provider} OAuth TokenError] code=${code} status=${status}`);
    return res.redirect(failure);
  };
}

/**
 * يكمل callback الويب لـGoogle/Apple بعد `passport.authenticate({ session: false })`.
 * الحساب المحمي بـ2FA لا ينال جلسة هنا: نحفظ `pending2FAUserId` ونحوّل إلى
 * `/2fa-verify` كما يفعل دخول كلمة المرور، وإلا ننشئ الجلسة ونكمل للوجهة المعتادة.
 */
export function createOAuthWebCompletion(
  provider: OAuthProvider,
  landing: (req: any, res: Response) => unknown,
) {
  const failure = `/ar/login?error=${provider}_auth_failed`;
  return (req: Request, res: Response) => {
    const user = req.user as OAuthUser | undefined;
    if (!user?.id) return res.redirect(failure);

    if (user.twoFactorEnabled) {
      req.user = undefined;
      (req.session as any).pending2FAUserId = user.id;
      (req.session as any).pending2FAFirstFactor = "oauth";
      return req.session.save((saveErr) => {
        if (saveErr) {
          console.error(`❌ ${provider} OAuth 2FA session save error:`, saveErr);
          return res.redirect(failure);
        }
        return res.redirect("/2fa-verify");
      });
    }

    return req.logIn(user as Express.User, (loginErr) => {
      if (loginErr) {
        console.error(`❌ ${provider} OAuth session error:`, loginErr);
        return res.redirect(failure);
      }
      console.log(`✅ ${provider} OAuth callback successful`);
      return landing(req, res);
    });
  };
}
