import { describe, expect, it } from "vitest";
import { deriveAuthState, type User } from "../../client/src/hooks/useAuth";

const USER: User = { id: "staff-1", role: "admin" };

describe("dashboard auth availability", () => {
  it("treats a confirmed anonymous response as a real logout", () => {
    expect(deriveAuthState(null, false, false)).toEqual({
      isAuthenticated: false,
      isUnavailable: false,
      shouldRedirectToLogin: true,
    });
  });

  it("keeps a cached user authenticated during a transient refetch failure", () => {
    expect(deriveAuthState(USER, false, true)).toEqual({
      isAuthenticated: true,
      isUnavailable: false,
      shouldRedirectToLogin: false,
    });
  });

  it("shows a retry state instead of login when the initial auth request is unavailable", () => {
    expect(deriveAuthState(undefined, false, true)).toEqual({
      isAuthenticated: false,
      isUnavailable: true,
      shouldRedirectToLogin: false,
    });
  });

  it("does not redirect while authentication is still loading", () => {
    expect(deriveAuthState(undefined, true, false).shouldRedirectToLogin).toBe(false);
  });
});
