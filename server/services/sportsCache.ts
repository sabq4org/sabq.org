/**
 * كاش الرياضة الموزّع: ذاكرة العملية L1 + Redis L2.
 *
 * Redis يحفظ نسختين: fresh للاستخدام الطبيعي وstale كشبكة أمان عند بطء
 * المزوّد. إذا تجاوز الجلب ميزانية الطلب (3 ثوانٍ افتراضيًا) نعيد stale فورًا
 * ونترك الجلب الجاري يكمل ويحفظ النسخة الجديدة في الخلفية.
 */
import { withSWR as withMemorySWR } from "../memoryCache";
import { getRedisClient } from "../redis";
import { isEnglishSports } from "./sportsLang";
import { currentSportsPriority } from "./sportsRequestContext";

const REDIS_PREFIX = "sabq:sports:v1";
const REDIS_READ_BUDGET_MS = 200;
const DEFAULT_SOURCE_BUDGET_MS = 3_000;

interface SportsCacheEnvelope<T> {
  version: 1;
  cachedAt: number;
  data: T;
}

export interface SportsCachedValue<T> {
  data: T;
  cachedAt: number;
  state: "fresh" | "stale";
}

export class SportsSourceTimeoutError extends Error {
  constructor(public readonly cacheKey: string, public readonly timeoutMs: number) {
    super(`Sports source timed out after ${timeoutMs}ms (${cacheKey})`);
    this.name = "SportsSourceTimeoutError";
  }
}

function localizedKey(cacheKey: string): string {
  return isEnglishSports() ? `${cacheKey}:en` : cacheKey;
}

function redisKey(cacheKey: string, state: "fresh" | "stale"): string {
  return `${REDIS_PREFIX}:${state}:${cacheKey}`;
}

async function within<T>(promise: Promise<T>, timeoutMs: number, error: Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(error), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseEnvelope<T>(raw: string | null): SportsCacheEnvelope<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SportsCacheEnvelope<T>>;
    if (parsed.version !== 1 || typeof parsed.cachedAt !== "number" || !("data" in parsed)) return null;
    return parsed as SportsCacheEnvelope<T>;
  } catch {
    return null;
  }
}

async function readRedisEnvelope<T>(key: string): Promise<SportsCacheEnvelope<T> | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await within(redis.get(key), REDIS_READ_BUDGET_MS, new Error("Redis sports read timeout"));
    return parseEnvelope<T>(raw);
  } catch {
    // Redis تحسين أداء وليس شرطًا لصحة المسار؛ الذاكرة/المزوّد يظلان fallback.
    return null;
  }
}

export async function getSportsCachedValue<T>(cacheKey: string): Promise<SportsCachedValue<T> | null> {
  const key = localizedKey(cacheKey);
  const fresh = await readRedisEnvelope<T>(redisKey(key, "fresh"));
  if (fresh) return { data: fresh.data, cachedAt: fresh.cachedAt, state: "fresh" };
  const stale = await readRedisEnvelope<T>(redisKey(key, "stale"));
  return stale ? { data: stale.data, cachedAt: stale.cachedAt, state: "stale" } : null;
}

export async function setSportsCachedValue<T>(
  cacheKey: string,
  data: T,
  ttlMs: number,
  staleWhileRevalidateMs: number,
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const key = localizedKey(cacheKey);
  const payload = JSON.stringify({ version: 1, cachedAt: Date.now(), data } satisfies SportsCacheEnvelope<T>);
  const freshSeconds = Math.max(1, Math.ceil(ttlMs / 1_000));
  const staleSeconds = Math.max(freshSeconds, Math.ceil((ttlMs + staleWhileRevalidateMs) / 1_000));
  try {
    await Promise.all([
      redis.set(redisKey(key, "fresh"), payload, { expiration: { type: "EX", value: freshSeconds } }),
      redis.set(redisKey(key, "stale"), payload, { expiration: { type: "EX", value: staleSeconds } }),
    ]);
  } catch (error) {
    console.warn(`[Sports Cache] Redis write failed for ${key}:`, (error as Error)?.message);
  }
}

export async function withSportsSWR<T>(
  cacheKey: string,
  ttl: number,
  staleWhileRevalidate: number,
  fetcher: () => Promise<T>,
  forceFresh = false,
  sourceBudgetMs?: number,
): Promise<T> {
  const effectiveKey = localizedKey(cacheKey);
  const priority = currentSportsPriority();
  const budgetMs = sourceBudgetMs ?? (priority === "interactive" ? DEFAULT_SOURCE_BUDGET_MS : priority === "background" ? 30_000 : 8_000);
  return withMemorySWR(
    cacheKey,
    ttl,
    staleWhileRevalidate,
    async () => {
      const cached = forceFresh ? null : await getSportsCachedValue<T>(cacheKey);
      if (cached?.state === "fresh") return cached.data;

      // نبدأ الجلب ونتركه يكمل حتى لو انتهت ميزانية طلب المستخدم؛ نجاحه يحدّث
      // Redis ليستفيد الطلب التالي بدل إهدار العمل الجاري.
      const sourcePromise = fetcher().then((data) => {
        void setSportsCachedValue(cacheKey, data, ttl, staleWhileRevalidate);
        return data;
      });

      try {
        return await within(
          sourcePromise,
          budgetMs,
          new SportsSourceTimeoutError(effectiveKey, budgetMs),
        );
      } catch (error) {
        if (cached) {
          console.warn(
            `[Sports Cache] stale fallback key=${effectiveKey} sourceBudgetMs=${budgetMs} ageMs=${Date.now() - cached.cachedAt} reason=${error instanceof Error ? error.name : "unknown"}`,
          );
          return cached.data;
        }
        throw error;
      }
    },
    forceFresh,
  );
}
