/**
 * كاش خرائط الموقع في Redis — الطبقة الثانية فوق كاش ذاكرة العملية.
 *
 * لماذا: كاش الذاكرة يتبخر مع كل نشرة/إعادة تشغيل (وأيام النشر المتتابع
 * يتبخر كل دقائق)، فيعيد كل pod توليد 70 ملف bucket من جديد — كان هذا
 * أكبر مستهلك قراءة في القاعدة (170M صف معادة عبر pg_stat_statements،
 * تقرير مراجعة Neon 2026-07-22). Redis يحفظ النسخة عبر النشرات ويشاركها
 * بين النسخ، والفشل فيه صامت: التوليد المباشر يبقى المسار الاحتياطي.
 *
 * لا يستورد db (ADR-001) — التوليد نفسه يبقى في مكانه، هنا التخزين فقط.
 */
import { getRedisClient } from "../redis";

const KEY_PREFIX = "sitemap:xml:";

export async function getSitemapXmlFromRedis(key: string): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    return await redis.get(KEY_PREFIX + key);
  } catch {
    return null; // انقطاع Redis لا يعطل الخرائط — نولّد مباشرة
  }
}

export async function setSitemapXmlInRedis(key: string, xml: string, ttlMs: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(KEY_PREFIX + key, xml, {
      expiration: { type: "PX", value: Math.max(1000, Math.floor(ttlMs)) },
    });
  } catch {
    // best-effort — النسخة التالية ستحاول مجددًا
  }
}
