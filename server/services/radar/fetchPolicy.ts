function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

/** Shared cap for automatic and manual source fetches in this process. */
export const RADAR_FETCH_CONCURRENCY = boundedInteger(
  process.env.RADAR_FETCH_CONCURRENCY,
  4,
  1,
  12,
);

/** A rate-limited source is not due again every minute. */
export const RADAR_RATE_LIMIT_BACKOFF_MINUTES = boundedInteger(
  process.env.RADAR_RATE_LIMIT_BACKOFF_MINUTES,
  15,
  5,
  1_440,
);

export function isRadarRateLimitError(error: unknown): boolean {
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown } | null;
  if (candidate?.status === 429 || candidate?.code === 429 || candidate?.code === "429") return true;
  return /(?:HTTP|status|code)?\s*429\b/i.test(String(candidate?.message ?? error ?? ""));
}
