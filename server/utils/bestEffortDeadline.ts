export type BestEffortDeadlineOptions<T> = {
  fallback: T;
  timeoutMs: number;
  onTimeout?: () => void;
  onError?: (error: unknown) => void;
};

/**
 * Bound how long an optional operation may delay its caller.
 *
 * The original operation is deliberately not cancelled after the deadline: it
 * may still populate its own cache for the next request. Its rejection remains
 * observed so a late failure cannot become an unhandled rejection.
 */
export async function bestEffortWithin<T>(
  operation: Promise<T>,
  options: BestEffortDeadlineOptions<T>,
): Promise<T> {
  const { fallback, timeoutMs, onTimeout, onError } = options;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("timeoutMs must be a positive finite number");
  }

  const guardedOperation = operation.catch((error) => {
    onError?.(error);
    return fallback;
  });

  let timeout: NodeJS.Timeout | undefined;
  const deadline = new Promise<T>((resolve) => {
    timeout = setTimeout(() => {
      onTimeout?.();
      resolve(fallback);
    }, timeoutMs);
    timeout.unref();
  });

  try {
    return await Promise.race([guardedOperation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
