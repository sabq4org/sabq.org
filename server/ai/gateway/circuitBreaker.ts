// In-memory circuit breaker with pluggable persistence (ai_provider_health).
// Pure module: DB writes happen through the injected `persist` callback so
// unit tests run without a database.

import type { AIGatewayError, AIHubProvider, ModelRef } from "./types";

export type BreakerStatus = "healthy" | "degraded" | "quota_exceeded" | "down";

export interface BreakerState {
  status: BreakerStatus;
  failCount: number;
  cooldownUntil: number | null;
  lastError?: string;
  lastErrorCode?: string;
}

export interface BreakerPersistPayload extends BreakerState {
  provider: AIHubProvider;
  modelId: string;
}

/** Emitted when a model's health status actually changes (not on every failure). */
export interface BreakerStatusChange {
  provider: AIHubProvider;
  modelId: string;
  prevStatus: BreakerStatus;
  newStatus: BreakerStatus;
  lastError?: string;
  lastErrorCode?: string;
}

export interface CircuitBreakerOptions {
  /** Consecutive generic failures before the circuit opens. Default 3. */
  failureThreshold?: number;
  /** How long an open circuit skips a model. Default 10 minutes. */
  cooldownMs?: number;
  /** Fire-and-forget persistence hook (writes to ai_provider_health). */
  persist?: (payload: BreakerPersistPayload) => void;
  /**
   * Fire-and-forget hook invoked only when a model's status transitions
   * (e.g. healthy → quota_exceeded). Used for critical operational alerts.
   */
  onStatusChange?: (change: BreakerStatusChange) => void;
  now?: () => number;
}

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000;

function key(m: ModelRef): string {
  return `${m.provider}:${m.modelId}`;
}

export class CircuitBreaker {
  private readonly states = new Map<string, BreakerState>();
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly persist?: (payload: BreakerPersistPayload) => void;
  private onStatusChange?: (change: BreakerStatusChange) => void;
  private readonly now: () => number;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
    this.cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.persist = opts.persist;
    this.onStatusChange = opts.onStatusChange;
    this.now = opts.now ?? Date.now;
  }

  /** Wire (or re-wire) the status-transition alert hook after construction. */
  setStatusChangeHandler(fn: (change: BreakerStatusChange) => void): void {
    this.onStatusChange = fn;
  }

  /** Emit a status transition to the alert hook — guarded so alerting never breaks the breaker. */
  private emitStatusChange(m: ModelRef, prevStatus: BreakerStatus, state: BreakerState): void {
    if (!this.onStatusChange || state.status === prevStatus) return;
    try {
      this.onStatusChange({
        provider: m.provider,
        modelId: m.modelId,
        prevStatus,
        newStatus: state.status,
        lastError: state.lastError,
        lastErrorCode: state.lastErrorCode,
      });
    } catch (err) {
      console.warn("[AI Hub] status-change handler threw:", (err as Error).message);
    }
  }

  /** Warm the in-memory map from persisted rows at boot. */
  hydrate(rows: BreakerPersistPayload[]): void {
    for (const row of rows) {
      this.states.set(key(row), {
        status: row.status,
        failCount: row.failCount,
        cooldownUntil: row.cooldownUntil,
        lastError: row.lastError,
        lastErrorCode: row.lastErrorCode,
      });
    }
  }

  /**
   * A model is available when healthy, or when its cooldown expired
   * (half-open: the next real request is the trial; a failure re-opens
   * the circuit immediately because failCount is still at threshold).
   */
  isAvailable(m: ModelRef): boolean {
    const state = this.states.get(key(m));
    if (!state) return true;
    // "degraded" (failures below threshold) keeps serving; only an active
    // cooldown blocks the model.
    if (state.cooldownUntil === null) return state.status === "healthy" || state.status === "degraded";
    return this.now() >= state.cooldownUntil;
  }

  getState(m: ModelRef): BreakerState | undefined {
    return this.states.get(key(m));
  }

  recordSuccess(m: ModelRef): void {
    const existing = this.states.get(key(m));
    if (!existing || (existing.status === "healthy" && existing.failCount === 0)) return;
    const prevStatus = existing.status;
    const state: BreakerState = { status: "healthy", failCount: 0, cooldownUntil: null };
    this.states.set(key(m), state);
    this.persist?.({ ...state, provider: m.provider, modelId: m.modelId });
    this.emitStatusChange(m, prevStatus, state);
  }

  recordFailure(m: ModelRef, err: AIGatewayError): void {
    const existing = this.states.get(key(m)) ?? {
      status: "healthy" as BreakerStatus,
      failCount: 0,
      cooldownUntil: null,
    };
    const prevStatus = existing.status;

    let state: BreakerState;
    if (err.code === "QUOTA_EXCEEDED") {
      // No point retrying an empty wallet — open immediately.
      state = this.open(existing, "quota_exceeded", err);
    } else if (err.code === "AUTH_ERROR") {
      state = this.open(existing, "down", err);
    } else {
      const failCount = existing.failCount + 1;
      if (failCount >= this.failureThreshold) {
        state = this.open({ ...existing, failCount }, "down", err);
      } else {
        state = {
          status: "degraded",
          failCount,
          cooldownUntil: null,
          lastError: err.message,
          lastErrorCode: err.code,
        };
      }
    }

    this.states.set(key(m), state);
    this.persist?.({ ...state, provider: m.provider, modelId: m.modelId });
    this.emitStatusChange(m, prevStatus, state);
  }

  snapshot(): BreakerPersistPayload[] {
    return Array.from(this.states.entries()).map(([k, state]) => {
      const [provider, ...rest] = k.split(":");
      return { ...state, provider: provider as AIHubProvider, modelId: rest.join(":") };
    });
  }

  private open(existing: BreakerState, status: BreakerStatus, err: AIGatewayError): BreakerState {
    return {
      status,
      failCount: Math.max(existing.failCount, this.failureThreshold),
      cooldownUntil: this.now() + this.cooldownMs,
      lastError: err.message,
      lastErrorCode: err.code,
    };
  }
}
