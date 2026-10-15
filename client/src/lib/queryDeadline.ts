export const QUERY_DEADLINE_ERROR_NAME = "SabqQueryDeadlineError";
export const QUERY_DEADLINE_ERROR_MESSAGE = "Request timed out";

/**
 * This is an application-owned control-flow signal, not a browser/network
 * TimeoutError. Keeping a distinct name lets observability discard only the
 * deadline that our recovery UI already handles while preserving real timeouts.
 */
export function createQueryDeadlineError(): DOMException {
  return new DOMException(QUERY_DEADLINE_ERROR_MESSAGE, QUERY_DEADLINE_ERROR_NAME);
}

/** A deadline includes reading the body, while navigation still cancels immediately. */
export async function withQueryDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  if (signal.aborted) cancel();
  else signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(createQueryDeadlineError()), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}
