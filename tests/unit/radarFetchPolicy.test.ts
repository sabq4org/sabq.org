import { describe, expect, it } from "vitest";
import { isRadarRateLimitError } from "../../server/services/radar/fetchPolicy";

describe("Radar fetch policy", () => {
  it("recognizes provider rate limits without matching unrelated errors", () => {
    expect(isRadarRateLimitError(new Error("HTTP 429"))).toBe(true);
    expect(isRadarRateLimitError({ status: 429 })).toBe(true);
    expect(isRadarRateLimitError({ code: "429" })).toBe(true);
    expect(isRadarRateLimitError(new Error("HTTP 500"))).toBe(false);
    expect(isRadarRateLimitError(new Error("feed parse failed"))).toBe(false);
  });
});
