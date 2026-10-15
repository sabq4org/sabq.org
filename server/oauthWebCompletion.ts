import type { Request, Response } from "express";

type OAuthProvider = "google" | "apple";
type OAuthUser = { id?: string; twoFactorEnabled?: boolean };

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
