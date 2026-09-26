/**
 * كاش عدّ المقالات المنشورة (الإجمالي + منشورات اليوم بتوقيت الرياض).
 *
 * الاستعلام يمشي على كل الصفوف المنشورة، لذلك نُبقيه خارج كل طلب:
 * ذاكرة العملية 60 ثانية، ثم Redis إن كان متصلًا ليشاركه أكثر من نسخة.
 * خطأ Redis لا يُرمى — نكمل من القاعدة. الفوات المتزامن يشترك في جلب واحد.
 * فشل القاعدة يبقى خطأً ولا يُخزَّن.
 */
import { getRedisClient } from "../redis";

export const PUBLISHED_ARTICLE_COUNTS_TTL_MS = 60_000;

const REDIS_KEY = "ai-public-stats:published-article-counts";

export interface PublishedArticleCounts {
  totalPublished: number;
  todayPublished: number;
}

interface CachedPayload extends PublishedArticleCounts {
  cachedAt: number;
}

let memory: CachedPayload | null = null;
let inflight: Promise<PublishedArticleCounts> | null = null;
let generation = 0;

export function resetPublishedArticleCountsCacheForTests(): void {
  generation += 1;
  memory = null;
  inflight = null;
}

function isFresh(entry: CachedPayload, now: number): boolean {
  const age = now - entry.cachedAt;
  return age >= 0 && age < PUBLISHED_ARTICLE_COUNTS_TTL_MS;
}

function toCounts(entry: CachedPayload): PublishedArticleCounts {
  return { totalPublished: entry.totalPublished, todayPublished: entry.todayPublished };
}

function parseCached(raw: string, now: number): CachedPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const totalPublished = record.totalPublished;
    const todayPublished = record.todayPublished;
    const cachedAt = record.cachedAt;
    if (typeof totalPublished !== "number" || !Number.isFinite(totalPublished)) return null;
    if (typeof todayPublished !== "number" || !Number.isFinite(todayPublished)) return null;
    if (typeof cachedAt !== "number" || !Number.isFinite(cachedAt)) return null;
    const entry = { totalPublished, todayPublished, cachedAt };
    return isFresh(entry, now) ? entry : null;
  } catch {
    return null;
  }
}

function startRedisRead(): Promise<string | null> | null {
  try {
    const redis = getRedisClient();
    if (!redis) return null;
    return redis.get(REDIS_KEY);
  } catch {
    return null;
  }
}

async function writeRedis(entry: CachedPayload): Promise<void> {
  try {
    const redis = getRedisClient();
    if (!redis) return;
    await redis.set(REDIS_KEY, JSON.stringify(entry), {
      expiration: { type: "PX", value: PUBLISHED_ARTICLE_COUNTS_TTL_MS },
    });
  } catch {
    // فشل الكتابة لا يمنع إرجاع الرقم الذي قرأناه من القاعدة
  }
}

export function readPublishedArticleCounts(
  load: () => Promise<PublishedArticleCounts>,
): Promise<PublishedArticleCounts> {
  const now = Date.now();
  if (memory && isFresh(memory, now)) return Promise.resolve(toCounts(memory));
  if (inflight) return inflight;

  const gen = generation;
  // ابدأ قراءة Redis بشكل متزامن. إن لم يكن متصلًا نصل إلى load() في نفس
  // الدورة حتى يُحتسب استعلام القاعدة قبل أي انتظار — مهم لدمج الطلبات.
  const redisGet = startRedisRead();
  const task = (async () => {
    if (redisGet) {
      try {
        const raw = await redisGet;
        const fromRedis = raw ? parseCached(raw, Date.now()) : null;
        if (fromRedis) {
          if (gen === generation) memory = fromRedis;
          return toCounts(fromRedis);
        }
      } catch {
        // Redis تعطّل: نكمل من القاعدة ولا نرمي
      }
    }

    const loaded = await load();
    if (gen !== generation) return loaded;

    const entry: CachedPayload = { ...loaded, cachedAt: Date.now() };
    memory = entry;
    await writeRedis(entry);
    return loaded;
  })();

  inflight = task;
  const clear = () => {
    if (inflight === task) inflight = null;
  };
  void task.then(clear, clear);
  return task;
}
