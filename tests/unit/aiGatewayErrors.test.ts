// AI Hub — provider error normalization into the unified taxonomy.

import { describe, expect, it } from "vitest";
import {
  isRetryableWithinModel,
  normalizeProviderError,
  shouldFailover,
} from "../../server/ai/gateway/errors";
import { AIGatewayError } from "../../server/ai/gateway/types";

function normalize(err: unknown) {
  return normalizeProviderError("openai", "gpt-test", err);
}

describe("normalizeProviderError", () => {
  it("classifies insufficient_quota (429) as QUOTA_EXCEEDED", () => {
    const err = normalize({
      status: 429,
      message: "You exceeded your current quota, please check your plan and billing details.",
      code: "insufficient_quota",
    });
    expect(err.code).toBe("QUOTA_EXCEEDED");
    expect(isRetryableWithinModel(err)).toBe(false); // never retry an empty wallet
  });

  it("classifies 402 payment-required as QUOTA_EXCEEDED", () => {
    expect(normalize({ status: 402, message: "Payment Required" }).code).toBe("QUOTA_EXCEEDED");
  });

  it("classifies plain 429 as RATE_LIMITED (retryable)", () => {
    const err = normalize({ status: 429, message: "Rate limit reached for requests" });
    expect(err.code).toBe("RATE_LIMITED");
    expect(isRetryableWithinModel(err)).toBe(true);
  });

  it("classifies 401/403 and Anthropic authentication_error as AUTH_ERROR", () => {
    expect(normalize({ status: 401, message: "Incorrect API key provided" }).code).toBe("AUTH_ERROR");
    expect(
      normalize({ status: 403, error: { type: "authentication_error", message: "invalid x-api-key" } }).code,
    ).toBe("AUTH_ERROR");
  });

  it("classifies timeouts as TIMEOUT (retryable)", () => {
    const err = normalize(new Error("AI model openai/gpt-test timed out after 90s"));
    expect(err.code).toBe("TIMEOUT");
    expect(err.retryable).toBe(true);
  });

  it("classifies safety blocks as CONTENT_FILTER and never fails over", () => {
    const err = normalize(new Error("Response blocked by content filter"));
    expect(err.code).toBe("CONTENT_FILTER");
    expect(shouldFailover(err.code)).toBe(false);
  });

  it("classifies 5xx as retryable MODEL_ERROR", () => {
    const err = normalize({ status: 500, message: "The server had an error" });
    expect(err.code).toBe("MODEL_ERROR");
    expect(err.retryable).toBe(true);
  });

  it("passes through an existing AIGatewayError untouched", () => {
    const original = new AIGatewayError("x", { code: "QUOTA_EXCEEDED" });
    expect(normalize(original)).toBe(original);
  });

  it("QUOTA_EXCEEDED and AUTH_ERROR do fail over to the next model", () => {
    expect(shouldFailover("QUOTA_EXCEEDED")).toBe(true);
    expect(shouldFailover("AUTH_ERROR")).toBe(true);
  });
});
