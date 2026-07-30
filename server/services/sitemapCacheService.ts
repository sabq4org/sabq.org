/**
 * كاش خرائط الموقع في Redis فقط.
 *
 * ملفات الـ bucket كبيرة جدًا (نحو 12MiB للملف العربي في الإنتاج). إبقاء
 * نسخة ثانية منها في Map داخل عملية Node كان يرفع الـ working set بمئات
 * الميغابايت كلما مرّت العناكب على الدلاء. Redis يحفظ النسخة عبر النشرات
 * ويشاركها بين النسخ، بينما single-flight أدناه يمنع توليد المفتاح نفسه
 * مرتين بالتوازي من دون الاحتفاظ بالـ XML بعد اكتمال الطلب.
 *
 * لا يستورد db (ADR-001) — التوليد يصل جاهزًا عبر دالة build.
 */
import { getRedisClient } from "../redis";

const REDIS_PREFIX = "sitemap:xml:";
const inflight = new Map<string, Promise<string | null>>();

async function readThroughRedis(
  key: string,
  ttlMs: number,
  build: () => Promise<string | null>,
): Promise<string | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get(REDIS_PREFIX + key);
      if (cached) return cached;
    } catch {
      // انقطاع Redis لا يعطل الخرائط — نولّد مباشرة
    }
  }

  const xml = await build();
  if (xml === null) return null;

  if (redis) {
    try {
      await redis.set(REDIS_PREFIX + key, xml, {
        expiration: { type: "PX", value: Math.max(1000, Math.floor(ttlMs)) },
      });
    } catch {
      // best-effort — الطلب التالي سيحاول مجددًا
    }
  }
  return xml;
}

/**
 * Redis ← توليد. الطلبات المتزامنة للمفتاح نفسه تشترك في Promise واحد،
 * ويُحذف فور settlement حتى لا يتحول single-flight إلى كاش ذاكرة دائم.
 * يعيد null فقط إذا أعاد المولد null (مثل bucket خارج النطاق).
 */
export function getOrBuildSitemapXml(
  key: string,
  ttlMs: number,
  build: () => Promise<string | null>,
): Promise<string | null> {
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = readThroughRedis(key, ttlMs, build);
  inflight.set(key, task);

  const clear = () => {
    if (inflight.get(key) === task) inflight.delete(key);
  };
  void task.then(clear, clear);

  return task;
}

/**
 * Drop Redis-cached sitemap XML keys. Used after EN publish/translate so
 * sitemap-en-articles-* and the index pick up new URLs without waiting 6h TTL.
 * Best-effort — Redis blips are ignored.
 */
export async function invalidateSitemapXmlCache(
  keyPrefixes: string[] = ["__sitemapEnArticles", "index"],
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  for (const prefix of keyPrefixes) {
    const match = REDIS_PREFIX + prefix + "*";
    try {
      let cursor = "0";
      do {
        const result = await redis.scan(cursor, "MATCH", match, "COUNT", 100);
        const next = Array.isArray(result) ? String(result[0] ?? "0") : "0";
        const keys: string[] = Array.isArray(result?.[1]) ? result[1] : [];
        if (keys.length > 0) {
          await redis.del(keys).catch(() => 0);
        }
        cursor = next;
      } while (cursor !== "0");
    } catch (err) {
      console.warn(`[SitemapCache] invalidate failed for ${match}:`, err);
    }
  }

  // Exact key "index" (no suffix)
  if (keyPrefixes.includes("index")) {
    await redis.del(REDIS_PREFIX + "index").catch(() => 0);
  }

  for (const key of inflight.keys()) {
    if (keyPrefixes.some((p) => key === p || key.startsWith(p + "_") || key.startsWith(p))) {
      inflight.delete(key);
    }
  }
}
