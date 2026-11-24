// عنوان صفحة «لحظة بلحظة» ووصفها في نتائج البحث.
// تجربة التقرير الأسبوعي للبحث (أسبوع 13–19 نوفمبر 2026): الصفحة في الموضع 1.1
// ونسبة النقر 1.4%، فالعنوان والوصف يوضحان الآن أنها أحدث الأخبار لحظة نشرها،
// والوصف يحمل آخر عنوان منشور.

export const MOMENT_BY_MOMENT_TITLE = "لحظة بلحظة: آخر الأخبار العاجلة الآن — سبق";

const BASE_DESC = "أحدث الأخبار العاجلة في السعودية والعالم لحظة نشرها، تتجدد على مدار الساعة.";
const MAX_DESC = 160;

export function momentByMomentDescription(latestTitle?: string | null): string {
  const headline = (latestTitle || "").replace(/\s+/g, " ").trim();
  if (!headline) return BASE_DESC;
  const prefix = `${BASE_DESC} الآن: `;
  const room = MAX_DESC - prefix.length;
  if (room < 20) return BASE_DESC;
  const cut = headline.length > room ? `${headline.slice(0, room - 1).trimEnd()}…` : headline;
  return prefix + cut;
}
