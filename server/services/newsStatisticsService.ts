import { CACHE_TTL, withSWR } from "../memoryCache";
import { storage } from "../storage";

/** Coalesce cold requests and avoid blocking every reader at each TTL expiry. */
export function getCachedNewsStatistics() {
  return withSWR(
    "news:stats",
    CACHE_TTL.SHORT,
    CACHE_TTL.SHORT,
    () => storage.getNewsStatistics(),
  );
}
