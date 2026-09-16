/**
 * تحذير مخنوق: يطبع الرسالة مرة واحدة لكل مفتاح داخل النافذة الزمنية.
 *
 * الدافع (تشخيص 2026-07-27): رسائل «deadline exceeded» في مسارات الرياضة
 * تُطبع لكل طلب. الواجهة تعيد المحاولة بعد 503 (Retry-After: 2)، وموجة
 * زوار على لاعب رائج تكرّر السطر نفسه عشرات المرات في الدقيقة — فيغرق
 * سجل Railway وتضيع الإشارة الأولى (المهمة) وسط التكرار. الخنق لكل
 * (مفتاح، نافذة) يبقي أول ظهور ويكتم الصدى.
 *
 * ليست عدّادًا دقيقًا ولا مقياسًا — أداة ضجيج سجلات فقط. الفقد المحتمل
 * (تكرار داخل النافذة لا يُطبع) مقصود، وحجم الخريطة محدود بتشذيب كسول.
 */

const lastLoggedAt = new Map<string, number>();

const DEFAULT_WINDOW_MS = 60_000;

/** سقف مفاتيح الخريطة — فوقه تشذيب كسول ثم إسقاط الأقدم إدراجًا. */
const MAX_KEYS = 2_000;

function pruneIfNeeded(now: number, windowMs: number): void {
  if (lastLoggedAt.size < MAX_KEYS) return;
  for (const [key, at] of lastLoggedAt) {
    if (now - at >= windowMs) lastLoggedAt.delete(key);
  }
  // ما زالت ممتلئة (نافذة طويلة + مفاتيح كثيرة): أسقط الأقدم إدراجًا حتى
  // النصف — خسارة خنقٍ مقبولة مقابل سقف ذاكرة صلب.
  if (lastLoggedAt.size >= MAX_KEYS) {
    let toDrop = Math.floor(MAX_KEYS / 2);
    for (const key of lastLoggedAt.keys()) {
      if (toDrop-- <= 0) break;
      lastLoggedAt.delete(key);
    }
  }
}

/**
 * يطبع `message` عبر console.warn إن لم يُطبع نفس `key` خلال `windowMs`.
 * يعيد true إن طُبعت فعلًا — مفيد للاختبار ولمن يريد إلحاق سلوك بأول ظهور.
 */
export function warnThrottled(key: string, message: string, windowMs: number = DEFAULT_WINDOW_MS): boolean {
  const now = Date.now();
  const last = lastLoggedAt.get(key);
  if (last !== undefined && now - last < windowMs) return false;
  pruneIfNeeded(now, windowMs);
  lastLoggedAt.set(key, now);
  console.warn(message);
  return true;
}

/** لعزل الاختبارات فقط. */
export function resetThrottledWarnState(): void {
  lastLoggedAt.clear();
}
