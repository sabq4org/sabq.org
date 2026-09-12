import { describe, expect, it } from "vitest";
import { parseAuthAnalyticsMarker } from "../../client/src/components/AuthAnalyticsMarker";

describe("OAuth analytics marker", () => {
  it("accepts the server marker shape", () => {
    expect(parseAuthAnalyticsMarker("?sabq_auth_event=sign_up&method=google&nonce=01234567-89ab-cdef-0123-456789abcdef"))
      .toEqual({ event: "sign_up", method: "google", nonce: "01234567-89ab-cdef-0123-456789abcdef" });
  });

  it("rejects missing, malformed, or unsupported markers", () => {
    expect(parseAuthAnalyticsMarker("?sabq_auth_event=login&method=google")).toBeNull();
    expect(parseAuthAnalyticsMarker("?sabq_auth_event=login&method=google&nonce=short")).toBeNull();
    expect(parseAuthAnalyticsMarker("?sabq_auth_event=signup&method=google&nonce=01234567-89ab-cdef-0123-456789abcdef")).toBeNull();
  });
});
