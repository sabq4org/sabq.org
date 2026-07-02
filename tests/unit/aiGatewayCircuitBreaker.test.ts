// AI Hub — circuit breaker unit tests (acceptance criterion #4 of #589).

import { describe, expect, it } from "vitest";
import {
  CircuitBreaker,
  type BreakerPersistPayload,
} from "../../server/ai/gateway/circuitBreaker";
import { AIGatewayError, type ModelRef } from "../../server/ai/gateway/types";

const MODEL: ModelRef = { provider: "openai", modelId: "gpt-test" };

function err(code: "QUOTA_EXCEEDED" | "AUTH_ERROR" | "MODEL_ERROR" | "TIMEOUT"): AIGatewayError {
  return new AIGatewayError(`test ${code}`, { code, provider: "openai", modelId: "gpt-test" });
}

describe("CircuitBreaker", () => {
  it("opens after 3 consecutive generic failures and blocks the model", () => {
    let clock = 1_000_000;
    const breaker = new CircuitBreaker({ now: () => clock, cooldownMs: 600_000 });

    breaker.recordFailure(MODEL, err("MODEL_ERROR"));
    breaker.recordFailure(MODEL, err("TIMEOUT"));
    expect(breaker.isAvailable(MODEL)).toBe(true); // degraded, still serving

    breaker.recordFailure(MODEL, err("MODEL_ERROR"));
    expect(breaker.isAvailable(MODEL)).toBe(false); // threshold hit → open
    expect(breaker.getState(MODEL)?.status).toBe("down");
  });

  it("opens IMMEDIATELY on QUOTA_EXCEEDED (no threshold)", () => {
    let clock = 1_000_000;
    const breaker = new CircuitBreaker({ now: () => clock, cooldownMs: 600_000 });

    breaker.recordFailure(MODEL, err("QUOTA_EXCEEDED"));
    expect(breaker.isAvailable(MODEL)).toBe(false);
    expect(breaker.getState(MODEL)?.status).toBe("quota_exceeded");
  });

  it("re-allows the model after cooldown (half-open) and re-opens on the next failure", () => {
    let clock = 1_000_000;
    const breaker = new CircuitBreaker({ now: () => clock, cooldownMs: 600_000 });

    breaker.recordFailure(MODEL, err("QUOTA_EXCEEDED"));
    expect(breaker.isAvailable(MODEL)).toBe(false);

    clock += 600_001; // cooldown expired → trial allowed
    expect(breaker.isAvailable(MODEL)).toBe(true);

    breaker.recordFailure(MODEL, err("QUOTA_EXCEEDED")); // trial failed
    expect(breaker.isAvailable(MODEL)).toBe(false);
    expect(breaker.getState(MODEL)?.cooldownUntil).toBe(clock + 600_000);
  });

  it("recordSuccess resets the circuit to healthy", () => {
    let clock = 1_000_000;
    const breaker = new CircuitBreaker({ now: () => clock, cooldownMs: 600_000 });

    breaker.recordFailure(MODEL, err("QUOTA_EXCEEDED"));
    clock += 600_001;
    breaker.recordSuccess(MODEL);

    expect(breaker.isAvailable(MODEL)).toBe(true);
    expect(breaker.getState(MODEL)).toMatchObject({ status: "healthy", failCount: 0 });
  });

  it("persists every state change and hydrates back", () => {
    const persisted: BreakerPersistPayload[] = [];
    const breaker = new CircuitBreaker({ persist: (p) => persisted.push(p) });

    breaker.recordFailure(MODEL, err("MODEL_ERROR"));
    breaker.recordFailure(MODEL, err("QUOTA_EXCEEDED"));
    expect(persisted).toHaveLength(2);
    expect(persisted[1].status).toBe("quota_exceeded");

    const restored = new CircuitBreaker();
    restored.hydrate(breaker.snapshot());
    expect(restored.isAvailable(MODEL)).toBe(breaker.isAvailable(MODEL));
    expect(restored.getState(MODEL)?.status).toBe("quota_exceeded");
  });

  it("tracks models independently", () => {
    const other: ModelRef = { provider: "anthropic", modelId: "claude-test" };
    const breaker = new CircuitBreaker();

    breaker.recordFailure(MODEL, err("QUOTA_EXCEEDED"));
    expect(breaker.isAvailable(MODEL)).toBe(false);
    expect(breaker.isAvailable(other)).toBe(true);
  });
});
