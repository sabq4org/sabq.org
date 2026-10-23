/**
 * Limit on paid «استمع» syntheses: clips that are neither in memory nor in R2.
 * Stored clips, and the primary-voice retry of a stored fallback clip, never
 * count. In memory per replica: 20 per visitor per 10 minutes, and 60 an hour
 * in all, which bounds the cost of a visitor walking the archive. Once clips
 * are kept in R2, readers need about 7 an hour across both replicas
 * (2026-10-21/22 logs: 231 articles voiced in 33.5 hours). The visitor key is
 * the API rate limiter's: the user id, else the signed client IP. When the edge
 * IP is not signed, readers behind one Cloudflare address share a key, hence
 * the wide per-visitor margin.
 */
export const SUMMARY_AUDIO_VISITOR_LIMIT = 20;
export const SUMMARY_AUDIO_VISITOR_WINDOW_MS = 10 * 60_000;
export const SUMMARY_AUDIO_HOURLY_LIMIT = 60;
const HOUR_MS = 60 * 60_000;
const MAX_TRACKED_VISITORS = 10_000;

type Window = { start: number; count: number };
const visitors = new Map<string, Window>();
let hour: Window = { start: 0, count: 0 };
let hourCapLoggedFor = -1;

function current(window: Window | undefined, now: number, span: number): Window {
  return window && now - window.start < span ? window : { start: now, count: 0 };
}

function prune(now: number): void {
  if (visitors.size <= MAX_TRACKED_VISITORS) return;
  for (const [visitor, window] of visitors) {
    if (now - window.start >= SUMMARY_AUDIO_VISITOR_WINDOW_MS) visitors.delete(visitor);
  }
  // Least recently charged first (each charge re-inserts its visitor).
  for (const visitor of visitors.keys()) {
    if (visitors.size <= MAX_TRACKED_VISITORS) break;
    visitors.delete(visitor);
  }
}

/** Charges one synthesis to `visitor`; false when the visitor or this replica is at its limit. */
export function takeSummaryAudioSlot(visitor: string, now = Date.now()): boolean {
  hour = current(hour, now, HOUR_MS);
  const mine = current(visitors.get(visitor), now, SUMMARY_AUDIO_VISITOR_WINDOW_MS);
  if (mine.count >= SUMMARY_AUDIO_VISITOR_LIMIT) return false;
  if (hour.count >= SUMMARY_AUDIO_HOURLY_LIMIT) {
    if (hourCapLoggedFor !== hour.start) {
      hourCapLoggedFor = hour.start;
      console.warn(`[summary-audio] hourly synthesis cap (${SUMMARY_AUDIO_HOURLY_LIMIT}) reached; new clips refused until ${new Date(hour.start + HOUR_MS).toISOString()}`);
    }
    return false;
  }
  mine.count += 1;
  hour.count += 1;
  visitors.delete(visitor);
  visitors.set(visitor, mine);
  prune(now);
  return true;
}

/** Seconds until `visitor` may be charged again, for Retry-After. */
export function summaryAudioRetryAfterSeconds(visitor: string, now = Date.now()): number {
  let until = now;
  const mine = visitors.get(visitor);
  if (mine && now - mine.start < SUMMARY_AUDIO_VISITOR_WINDOW_MS && mine.count >= SUMMARY_AUDIO_VISITOR_LIMIT) {
    until = mine.start + SUMMARY_AUDIO_VISITOR_WINDOW_MS;
  }
  if (now - hour.start < HOUR_MS && hour.count >= SUMMARY_AUDIO_HOURLY_LIMIT) {
    until = Math.max(until, hour.start + HOUR_MS);
  }
  return Math.max(1, Math.ceil((until - now) / 1000));
}
