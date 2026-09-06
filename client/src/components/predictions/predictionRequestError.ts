/**
 * HTTP 429 is an expected, recoverable response from the public API edge.
 * Keep the check exact so unrelated application failures still surface.
 */
export function isPredictionRateLimitError(error: unknown): boolean {
  return error instanceof Error && error.message === "RATE_LIMITED";
}
