import { describe, expect, it, vi } from "vitest";
import { createOAuthWebCompletion } from "../../server/oauthWebCompletion";

function fakeReqRes(user: any) {
  const session: any = { save: vi.fn((cb: (err?: unknown) => void) => cb()) };
  const req: any = { user, session, logIn: vi.fn((_u: any, cb: (err?: unknown) => void) => cb()) };
  const res: any = { redirect: vi.fn() };
  return { req, res, session };
}

describe("createOAuthWebCompletion", () => {
  it("does not create a session for a 2FA-enabled account and sends it to the 2FA challenge", () => {
    const landing = vi.fn();
    const { req, res, session } = fakeReqRes({ id: "u1", twoFactorEnabled: true });
    createOAuthWebCompletion("google", landing)(req, res);
    expect(req.logIn).not.toHaveBeenCalled();
    expect(landing).not.toHaveBeenCalled();
    expect(session.pending2FAUserId).toBe("u1");
    expect(req.user).toBeUndefined();
    expect(res.redirect).toHaveBeenCalledWith("/2fa-verify");
  });

  it("logs in and lands normally when 2FA is off", () => {
    const landing = vi.fn();
    const { req, res, session } = fakeReqRes({ id: "u2", twoFactorEnabled: false });
    createOAuthWebCompletion("apple", landing)(req, res);
    expect(req.logIn).toHaveBeenCalledTimes(1);
    expect(landing).toHaveBeenCalledWith(req, res);
    expect(session.pending2FAUserId).toBeUndefined();
  });

  it("redirects to the provider failure page when no user came back", () => {
    const { req, res } = fakeReqRes(undefined);
    createOAuthWebCompletion("google", vi.fn())(req, res);
    expect(res.redirect).toHaveBeenCalledWith("/ar/login?error=google_auth_failed");
  });

  it("redirects to failure when saving the pending 2FA state fails", () => {
    const { req, res, session } = fakeReqRes({ id: "u3", twoFactorEnabled: true });
    session.save = vi.fn((cb: (err?: unknown) => void) => cb(new Error("redis down")));
    createOAuthWebCompletion("apple", vi.fn())(req, res);
    expect(res.redirect).toHaveBeenCalledWith("/ar/login?error=apple_auth_failed");
  });
});
