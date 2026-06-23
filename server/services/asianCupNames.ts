/**
 * تعريب كأس آسيا 2027 — قاموس محلّي موثوق (لا يعتمد تعريب TheSports المحجوب).
 * يغطّي المنتخبات الـ24 المتأهّلة (بمعرّف API-Football) وملاعب الاستضافة السعودية.
 * للإضافة مستقبلًا: أضف الصفّ هنا فقط.
 */

/** المنتخبات حسب معرّف API-Football (league=7, season=2027). */
export const AC_TEAM_AR: Record<number, string> = {
  12: "اليابان",
  17: "كوريا الجنوبية",
  20: "أستراليا",
  22: "إيران",
  23: "السعودية",
  1536: "طاجيكستان",
  1542: "فيتنام",
  1546: "سنغافورة",
  1547: "البحرين",
  1548: "الأردن",
  1550: "اليمن",
  1552: "عُمان",
  1554: "قيرغيزستان",
  1561: "كوريا الشمالية",
  1562: "فلسطين",
  1563: "الإمارات",
  1564: "تايلاند",
  1565: "سوريا",
  1566: "الصين",
  1567: "العراق",
  1568: "أوزبكستان",
  1569: "قطر",
  1570: "الكويت",
  1571: "إندونيسيا",
};

/** مدن الاستضافة (إنجليزي → عربي) — احتياط لأي ملعب غير مُعرَّف بالاسم. */
export const AC_CITY_AR: Record<string, string> = {
  Riyadh: "الرياض",
  Jeddah: "جدة",
  Khobar: "الخبر",
  "Al Khobar": "الخبر",
  "Al-Khobar": "الخبر",
  Dammam: "الدمام",
  "Al Ula": "العُلا",
  AlUla: "العُلا",
  Abha: "أبها",
  Neom: "نيوم",
};

/** الملاعب (اسم API-Football الإنجليزي → اسم ومدينة بالعربية). */
export const AC_VENUE_AR: Record<string, { name: string; city: string }> = {
  "King Saud University Stadium": { name: "ملعب جامعة الملك سعود", city: "الرياض" },
  "King Fahd International Stadium": { name: "استاد الملك فهد الدولي", city: "الرياض" },
  "Imam Mohammed Ibn Saud University Stadium": {
    name: "ملعب جامعة الإمام محمد بن سعود",
    city: "الرياض",
  },
  "King Abdullah Sports City": { name: "مدينة الملك عبدالله الرياضية", city: "جدة" },
  "Aramco Stadium": { name: "ملعب أرامكو", city: "الخبر" },
  "Kingdom Arena": { name: "أرينا", city: "الرياض" },
  "Al-Shabab Club Stadium": { name: "ملعب نادي الشباب", city: "الرياض" },
  "Prince Abdullah al-Faisal Stadium": { name: "ملعب الأمير عبدالله الفيصل", city: "جدة" },
};

/** اسم منتخب بالعربية (معرّف API-Football) — fallback للاسم الإنجليزي إن لم يُعرَّف. */
export function localizeAcTeam(id: number | null | undefined, fallback: string): string {
  if (id != null && AC_TEAM_AR[id]) return AC_TEAM_AR[id];
  return fallback;
}

/** ملعب بالعربية (اسم + مدينة) مع تعريب المدينة احتياطًا إن لم يُعرَّف الملعب بالاسم. */
export function localizeAcVenue(
  name: string | null | undefined,
  city: string | null | undefined,
): { name: string; city: string } {
  const mapped = name ? AC_VENUE_AR[name] : undefined;
  const cityAr = mapped?.city ?? (city ? (AC_CITY_AR[city] ?? city) : "");
  return { name: mapped?.name ?? name ?? "", city: cityAr };
}
