/**
 * Process-local admission control for large push broadcasts.
 *
 * This deliberately does not pretend to be a durable or cross-instance queue.
 * It keeps one fanout reservation per API process so an API process cannot
 * accept an unbounded number of in-memory broadcasts.
 */

export type PushBroadcastKind = "news";

export interface PushBroadcastCoordinatorOptions {
  retryAfterSeconds?: number;
}

export interface PushBroadcastLease {
  readonly kind: PushBroadcastKind;
  start(): void;
  release(): void;
}

export interface PushBroadcastState {
  active: number;
  pending: number;
}

export class PushBroadcastCapacityError extends Error {
  readonly code = "PUSH_BROADCAST_CAPACITY";
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("A push broadcast is already active or waiting; retry later");
    this.name = "PushBroadcastCapacityError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value as number)));
}

function envInteger(name: string, fallback: number, min: number, max: number): number {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return boundedInteger(raw, fallback, min, max);
}

export class PushBroadcastCoordinator {
  private readonly retryAfterSeconds: number;
  private phase: "idle" | "pending" | "active" = "idle";

  constructor(options: PushBroadcastCoordinatorOptions = {}) {
    this.retryAfterSeconds = boundedInteger(options.retryAfterSeconds, 15, 1, 120);
  }

  acquire(kind: PushBroadcastKind = "news"): PushBroadcastLease {
    if (this.phase !== "idle") {
      throw new PushBroadcastCapacityError(this.retryAfterSeconds);
    }

    this.phase = "pending";
    let started = false;
    let released = false;

    return {
      kind,
      start: () => {
        if (released || started) return;
        this.phase = "active";
        started = true;
      },
      release: () => {
        if (released) return;
        released = true;
        this.phase = "idle";
      },
    };
  }

  snapshot(): PushBroadcastState {
    return {
      active: this.phase === "active" ? 1 : 0,
      pending: this.phase === "pending" ? 1 : 0,
    };
  }
}

export const pushBroadcastCoordinator = new PushBroadcastCoordinator({
  retryAfterSeconds: envInteger("PUSH_BROADCAST_RETRY_AFTER_SECONDS", 15, 1, 120),
});

export function acquirePushBroadcast(kind: PushBroadcastKind = "news"): PushBroadcastLease {
  return pushBroadcastCoordinator.acquire(kind);
}

export function getPushBroadcastState(): PushBroadcastState {
  return pushBroadcastCoordinator.snapshot();
}
