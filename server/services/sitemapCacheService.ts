/**
 * كاش خرائط الموقع — طبقتان: ذاكرة العملية ثم Redis.
 *
 * لماذا: كاش الذاكرة يتبخر مع كل نشرة/إعادة تشغيل (وأيام النشر المتتابع
 * يتبخر كل دقائق)، فيعيد كل pod توليد 70 ملف bucket من جديد — كان هذا
 * أكبر مستهلك قراءة في القاعدة (170M صف معادة عبر pg_stat_statements،
 * تقرير مراجعة Neon 2026-07-22). Redis يحفظ النسخة عبر النشرات ويشاركها
 * بين النسخ، والفشل فيه صامت: التوليد المباشر يبقى المسار الاحتياطي.
 *
 * لا يستورد db (ADR-001) — التوليد يصل جاهزًا عبر دالة build.
 */
import { getRedisClient } from "../redis";

const REDIS_PREFIX = "sitemap:xml:";
const memory = new Map<string, { xml: string; ts: number }>();

/**
 * ذاكرة ← Redis ← توليد، والكتابة للطبقتين. يعيد null فقط إذا أعاد
 * المولد null (مثل bucket خارج النطاق) — بلا تخزين حينها.
 */
export async function getOrBuildSitemapXml(
  key: string,
  ttlMs: number,
  build: () => Promise<string | null>,
): Promise<string | null> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && now - mem.ts < ttlMs) return mem.xml;

  const redis = getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get(REDIS_PREFIX + key);
      if (cached) {
        memory.set(key, { xml: cached, ts: now });
        return cached;
      }
    } catch {
      // انقطاع Redis لا يعطل الخرائط — نولّد مباشرة
    }
  }

  const xml = await build();
  if (xml === null) return null;

  memory.set(key, { xml, ts: now });
  if (redis) {
    try {
      await redis.set(REDIS_PREFIX + key, xml, {
        expiration: { type: "PX", value: Math.max(1000, Math.floor(ttlMs)) },
      });
    } catch {
      // best-effort — النسخة التالية ستحاول مجددًا
    }
  }
  return xml;
}
