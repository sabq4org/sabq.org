import { describe, expect, it, vi } from "vitest";
import { createOAuthTokenErrorHandler, createOAuthWebCompletion } from "../../server/oauthWebCompletion";

function fakeReqRes(user: any) {
  const session: any = { save: vi.fn((cb: (err?: unknown) => void) => cb()) };
  const req: any = { user, session, logIn: vi.fn((_u: any, cb: (err?: unknown) => void) => cb()) };
  const res: any = { redirect: vi.fn() };
  return { req, res, session };
}

describe("createOAuthWebCompletion", () => {
  it("redirects TokenError without description and logs only safe provider/code/status", () => {
    const { req, res } = fakeReqRes(undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    createOAuthTokenErrorHandler("apple")(
      { name: "TokenError", code: "invalid_grant", status: 400 },
      req,
      res,
      vi.fn(),
    );
    expect(res.redirect).toHaveBeenCalledWith("/ar/login?error=apple_auth_failed");
    expect(warn).toHaveBeenCalledWith("[apple OAuth TokenError] code=invalid_grant status=400");
    warn.mockRestore();
  });

  it("passes invalid_client TokenError to next", () => {
    const { req, res } = fakeReqRes(undefined);
    const next = vi.fn();
    const error = { name: "TokenError", code: "invalid_client", status: 401 };
    createOAuthTokenErrorHandler("apple")(error, req, res, next);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it("passes unexpected errors to next", () => {
    const { req, res } = fakeReqRes(undefined);
    const next = vi.fn();
    const error = new Error("unexpected");
    createOAuthTokenErrorHandler("google")(error, req, res, next);
    expect(next).toHaveBeenCalledWith(error);
    expect(res.redirect).not.toHaveBeenCalled();
  });

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
