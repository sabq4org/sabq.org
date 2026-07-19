// Normalizes provider-specific errors into the unified AIErrorCode taxonomy.
// Pure module (no SDK imports) — classification is duck-typed on the shapes
// the OpenAI / Anthropic / Google SDKs and plain fetch errors actually throw.

import { AIGatewayError, type AIHubProvider } from "./types";

function extractStatus(err: any): number | undefined {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  return typeof status === "number" ? status : undefined;
}

function extractText(err: any): string {
  const parts = [
    err?.message,
    err?.code,
    err?.error?.type,
    err?.error?.code,
    err?.error?.message,
    err?.error?.error?.message,
  ];
  return parts.filter((p) => typeof p === "string").join(" | ").toLowerCase();
}

export function normalizeProviderError(
  provider: AIHubProvider,
  modelId: string,
  err: unknown,
): AIGatewayError {
  if (err instanceof AIGatewayError) return err;

  const status = extractStatus(err);
  const text = extractText(err);
  const message = (err as any)?.message || String(err);
  const base = { provider, modelId, cause: err };

  // Out of credit / hard quota — the primary failover trigger.
  if (
    status === 402 ||
    text.includes("insufficient_quota") ||
    text.includes("insufficient credit") ||
    text.includes("billing") ||
    text.includes("exceeded your current quota") ||
    (status === 429 && text.includes("quota"))
  ) {
    return new AIGatewayError(`${provider}/${modelId}: quota exceeded — ${message}`, {
      ...base,
      code: "QUOTA_EXCEEDED",
    });
  }

  // Transient throttling (retry, then failover if it persists).
  if (status === 429 || text.includes("rate_limit") || text.includes("rate limit")) {
    return new AIGatewayError(`${provider}/${modelId}: rate limited — ${message}`, {
      ...base,
      code: "RATE_LIMITED",
      retryable: true,
    });
  }

  if (
    status === 401 ||
    status === 403 ||
    text.includes("authentication") ||
    text.includes("invalid api key") ||
    text.includes("invalid x-api-key") ||
    text.includes("permission_denied") ||
    text.includes("api key not valid")
  ) {
    return new AIGatewayError(`${provider}/${modelId}: auth error — ${message}`, {
      ...base,
      code: "AUTH_ERROR",
    });
  }

  if (
    text.includes("timed out") ||
    text.includes("timeout") ||
    text.includes("etimedout") ||
    text.includes("aborterror") ||
    (err as any)?.name === "AbortError"
  ) {
    return new AIGatewayError(`${provider}/${modelId}: timeout — ${message}`, {
      ...base,
      code: "TIMEOUT",
      retryable: true,
    });
  }

  // Safety refusals — failing over would just hit another filter; fail fast.
  if (
    text.includes("content_filter") ||
    text.includes("content filter") ||
    text.includes("safety") ||
    text.includes("blocked by") ||
    text.includes("prohibited_content")
  ) {
    return new AIGatewayError(`${provider}/${modelId}: content filtered — ${message}`, {
      ...base,
      code: "CONTENT_FILTER",
    });
  }

  const retryable = status !== undefined && status >= 500;
  return new AIGatewayError(`${provider}/${modelId}: ${message}`, {
    ...base,
    code: "MODEL_ERROR",
    retryable,
  });
}

/** Failover moves to the next model for these; CONTENT_FILTER never fails over. */
export function shouldFailover(code: string): boolean {
  return code !== "CONTENT_FILTER" && code !== "FEATURE_DISABLED" && code !== "NOT_SUPPORTED";
}

/** Codes where in-model retries are pointless — skip pRetry and move on. */
export function isRetryableWithinModel(err: AIGatewayError): boolean {
  return err.retryable && err.code !== "QUOTA_EXCEEDED" && err.code !== "AUTH_ERROR" && err.code !== "CONTENT_FILTER";
}
