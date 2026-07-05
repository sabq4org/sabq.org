/**
 * تعريب أسماء اللاعبين تلقائيًا — مرة واحدة لكل اسم، ثم كاش للأبد.
 *
 * منذ طبقة الأسماء الموحّدة (sportsNamesService) صار هذا الملف غلافًا رقيقًا
 * يحافظ على واجهة resolveNames القديمة (عشرات النداءات عبر الخدمات) بينما
 * التخزين الجديد في sports_name_translations (يخضع للاعتماد التحريري من
 * /dashboard/sports-names). جدول wc_player_names القديم يبقى مقروءًا كطبقة
 * تراثية حتى ترحيل صفوفه (scripts/seed-sports-names.ts).
 *
 * طبقات الحلّ: قاموس WC_PLAYER_AR الثابت ← ذاكرة ← الجدول الموحّد ←
 * wc_player_names ← الـAI دفعة واحدة ثم الحفظ الدائم. كلها «أفضل جهد».
 */
import { resolveSportsNames } from "./sportsNamesService";
import { WC_PLAYER_AR } from "./worldCupNames";

/**
 * يرجّع دالة بحث متزامنة بعد ضمان تعريب كل الأسماء المطلوبة.
 * استخدمها هكذا:
 *   const tr = await resolveNames([...allRawNames]);
 *   const arabic = tr(rawName);
 *
 * skipAi: يُرجع فورًا بالمتاح (قاموس/DB) — لمسارات لا تحتمل مهلة الترجمة داخل
 * الطلب؛ الاستدعاء الكامل بالخلفية يملأ الجدول للمرّة التالية.
 */
export async function resolveNames(
  rawNames: (string | null | undefined)[],
  opts?: { skipAi?: boolean },
): Promise<(name: string | null | undefined) => string> {
  return resolveSportsNames(
    "player",
    rawNames.map((name) => ({ name })),
    {
      skipAi: opts?.skipAi,
      staticDict: WC_PLAYER_AR,
      legacyPlayerTable: true,
    },
  );
}
