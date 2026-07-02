// Failover executor: walks the candidate chain (primary + fallbackChain),
// skipping models whose circuit is open, until one succeeds.
// Pure module — the gateway injects availability checks and the runner.

import { shouldFailover } from "./errors";
import { AIGatewayError, type AttemptRecord, type ModelRef } from "./types";

export interface FailoverArgs<T> {
  feature: string;
  candidates: ModelRef[];
  allowFailover: boolean;
  isAvailable: (m: ModelRef) => boolean;
  isConfigured: (m: ModelRef) => boolean;
  run: (m: ModelRef) => Promise<T>;
  onSuccess?: (m: ModelRef) => void;
  onFailure?: (m: ModelRef, err: AIGatewayError) => void;
  now?: () => number;
}

export interface FailoverOutcome<T> {
  result: T;
  used: ModelRef;
  attempts: AttemptRecord[];
  /** true when a model other than the first candidate produced the result. */
  fallbackUsed: boolean;
}

export async function executeWithFailover<T>(args: FailoverArgs<T>): Promise<FailoverOutcome<T>> {
  const now = args.now ?? Date.now;
  const attempts: AttemptRecord[] = [];
  const candidates = args.allowFailover ? args.candidates : args.candidates.slice(0, 1);
  let lastError: AIGatewayError | null = null;

  for (const model of candidates) {
    if (!args.isConfigured(model)) {
      attempts.push({ provider: model.provider, modelId: model.modelId, ok: false, errorCode: "NOT_CONFIGURED" });
      continue;
    }
    if (!args.isAvailable(model)) {
      attempts.push({ provider: model.provider, modelId: model.modelId, ok: false, errorCode: "CIRCUIT_OPEN" });
      continue;
    }

    const startedAt = now();
    try {
      const result = await args.run(model);
      args.onSuccess?.(model);
      attempts.push({
        provider: model.provider,
        modelId: model.modelId,
        ok: true,
        latencyMs: now() - startedAt,
      });
      // Any earlier skip (open circuit / unconfigured) or failure means the
      // primary didn't serve this request — that's a fallback, and the
      // dashboard must see it as one.
      return { result, used: model, attempts, fallbackUsed: attempts.some((a) => !a.ok) };
    } catch (err) {
      const gwErr =
        err instanceof AIGatewayError
          ? err
          : new AIGatewayError((err as Error)?.message || String(err), {
              code: "MODEL_ERROR",
              provider: model.provider,
              modelId: model.modelId,
              cause: err,
            });
      lastError = gwErr;
      attempts.push({
        provider: model.provider,
        modelId: model.modelId,
        ok: false,
        errorCode: gwErr.code,
        latencyMs: now() - startedAt,
      });
      args.onFailure?.(model, gwErr);

      if (!shouldFailover(gwErr.code)) {
        throw new AIGatewayError(gwErr.message, {
          code: gwErr.code,
          provider: gwErr.provider,
          modelId: gwErr.modelId,
          attempts,
          cause: gwErr,
        });
      }
    }
  }

  if (lastError) {
    throw new AIGatewayError(
      `[${args.feature}] all models in the chain failed — last: ${lastError.message}`,
      {
        code: lastError.code,
        provider: lastError.provider,
        modelId: lastError.modelId,
        attempts,
        cause: lastError,
      },
    );
  }

  throw new AIGatewayError(
    `[${args.feature}] no available model (all candidates unconfigured or in cooldown)`,
    { code: "NO_MODEL_AVAILABLE", attempts },
  );
}
