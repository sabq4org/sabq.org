import { afterEach, expect, it, vi } from "vitest";
import {
  QUERY_DEADLINE_ERROR_MESSAGE,
  QUERY_DEADLINE_ERROR_NAME,
  withQueryDeadline,
} from "../../client/src/lib/queryDeadline";
afterEach(() => vi.useRealTimers());
function stalled(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}
it("bounds the entire response body read, not just receiving headers", async () => {
  vi.useFakeTimers();
  const query = withQueryDeadline(async signal => {
    await Promise.resolve({ status: 200 });
    return stalled(signal);
  }, new AbortController().signal, 6_000);
  const rejection = expect(query).rejects.toMatchObject({
    name: QUERY_DEADLINE_ERROR_NAME,
    message: QUERY_DEADLINE_ERROR_MESSAGE,
  });
  await vi.advanceTimersByTimeAsync(6_000); await rejection;
  expect(vi.getTimerCount()).toBe(0);
});
it("propagates navigation cancellation and removes its deadline", async () => {
  vi.useFakeTimers();
  const parent = new AbortController();
  const query = withQueryDeadline(stalled, parent.signal, 6_000);
  const rejection = expect(query).rejects.toMatchObject({ name: "AbortError" });
  parent.abort(); await rejection; expect(vi.getTimerCount()).toBe(0);
});
it("handles already cancelled requests and clears successful deadlines", async () => {
  vi.useFakeTimers(); const parent = new AbortController(); parent.abort();
  await expect(withQueryDeadline(stalled, parent.signal, 6_000)).rejects.toMatchObject({ name: "AbortError" });
  expect(await withQueryDeadline(async () => 7, new AbortController().signal, 6_000)).toBe(7);
  expect(vi.getTimerCount()).toBe(0);
});
