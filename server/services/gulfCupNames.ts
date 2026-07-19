/**
 * تعريب كأس الخليج العربي 27 «خليجي 27» (تستضيفها السعودية — جدة، سبتمبر/أكتوبر 2026).
 * قاموس محلّي موثوق للمنتخبات الثمانية المشاركة (بمعرّف API-Football) وملعبَي
 * الاستضافة في جدة. للإضافة مستقبلًا: أضف الصفّ هنا فقط.
 */

/** المنتخبات الثمانية حسب معرّف API-Football (league=25 — Gulf Cup of Nations). */
export const GC_TEAM_AR: Record<number, string> = {
  23: "السعودية",
  1547: "البحرين",
  1550: "اليمن",
  1552: "عُمان",
  1563: "الإمارات",
  1567: "العراق",
  1569: "قطر",
  1570: "الكويت",
};

/** مدن الاستضافة (إنجليزي → عربي) — احتياط لأي ملعب غير مُعرَّف بالاسم. */
export const GC_CITY_AR: Record<string, string> = {
  Jeddah: "جدة",
  Jiddah: "جدة",
};

/** الملاعب (اسم API-Football الإنجليزي → اسم ومدينة بالعربية). */
export const GC_VENUE_AR: Record<string, { name: string; city: string }> = {
  "King Abdullah Sports City": { name: "مدينة الملك عبدالله الرياضية", city: "جدة" },
  "King Abdullah Sports City Stadium": { name: "مدينة الملك عبدالله الرياضية", city: "جدة" },
  "Prince Abdullah al-Faisal Stadium": { name: "ملعب الأمير عبدالله الفيصل", city: "جدة" },
  "Prince Abdullah Al Faisal Stadium": { name: "ملعب الأمير عبدالله الفيصل", city: "جدة" },
};

/** اسم منتخب بالعربية (معرّف API-Football) — fallback للاسم الإنجليزي إن لم يُعرَّف. */
export function localizeGcTeam(id: number | null | undefined, fallback: string): string {
  if (id != null && GC_TEAM_AR[id]) return GC_TEAM_AR[id];
  return fallback;
}

/** ملعب بالعربية (اسم + مدينة) مع تعريب المدينة احتياطًا إن لم يُعرَّف الملعب بالاسم. */
export function localizeGcVenue(
  name: string | null | undefined,
  city: string | null | undefined,
): { name: string; city: string } {
  const mapped = name ? GC_VENUE_AR[name] : undefined;
  const cityAr = mapped?.city ?? (city ? (GC_CITY_AR[city] ?? city) : "");
  return { name: mapped?.name ?? name ?? "", city: cityAr };
}
