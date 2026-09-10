/**
 * Process-local generation for the edge SEO projection cache.
 *
 * The edge metadata cache intentionally lives outside the shared feed cache,
 * so the normal pattern invalidation cannot see it. Publishers bump this
 * generation locally and through contentInvalidation's Redis fan-out. The
 * edgeMeta route should include the value in its cache key and capture it
 * before its DB promise starts; a response completed under an older
 * generation must be discarded rather than written back after a publish.
 */
let generation = 0;

export function getSeoCacheGeneration(): number {
  return generation;
}

export function bumpSeoCacheGeneration(reason = "published-content"): number {
  generation += 1;
  console.log(`[SeoCacheInvalidation] generation=${generation} (${reason})`);
  return generation;
}
