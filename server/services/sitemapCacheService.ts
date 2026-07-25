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
