import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleNewsletterAiError,
  isNewsletterAiCircuitOpen,
  isOpenAIQuotaError,
  resetNewsletterAiCircuit,
} from "../../server/services/aiNewsletterEnhancer";

afterEach(() => {
  resetNewsletterAiCircuit();
  vi.restoreAllMocks();
});

describe("newsletter OpenAI quota circuit", () => {
  it.each([
    { code: "insufficient_quota" },
    { status: 429, message: "You exceeded your current quota" },
    { status: 429, error: { type: "insufficient_quota" } },
    { status: 429, error: { message: "Billing quota exceeded" } },
  ])("recognizes quota exhaustion", (error) => {
    expect(isOpenAIQuotaError(error)).toBe(true);
  });

  it("does not classify an ordinary transient 429 as quota exhaustion", () => {
    expect(isOpenAIQuotaError({ status: 429, message: "Rate limit reached; retry later" })).toBe(false);
  });

  it("opens immediately and emits only one compact warning", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    handleNewsletterAiError("subject lines", { code: "insufficient_quota" });
    handleNewsletterAiError("article summary", { code: "insufficient_quota" });

    expect(isNewsletterAiCircuitOpen()).toBe(true);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0]?.[0]).not.toContain("stack");
  });
});
