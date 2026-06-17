/**
 * تعريب دوري روشن السعودي للمحترفين القادم من API-Football.
 * الأندية مربوطة بـ team id (لا الاسم) حتى لا تنكسر لو غيّر المزود التسمية.
 * قسم رياضي مخفي قيد التطوير — لا يمسّ تغطية المونديال (worldCupNames.ts).
 *
 * المعرّفات مأخوذة من /teams?league=307&season=2025 (18 ناديًا).
 */
export const SPL_TEAM_AR: Record<number, string> = {
  2928: "الخليج", // Al Khaleej Saihat
  2929: "الأهلي", // Al-Ahli Jeddah
  2931: "الفتح", // Al-Fateh
  2932: "الهلال", // Al-Hilal Saudi FC
  2933: "القادسية", // Al-Qadisiyah FC
  2934: "الاتفاق", // Al-Ettifaq
  2936: "التعاون", // Al Taawon
  2938: "الاتحاد", // Al-Ittihad FC
  2939: "النصر", // Al-Nassr
  2940: "الشباب", // Al Shabab
  2944: "الفيحاء", // Al-Fayha
  2945: "الحزم", // Al-Hazm
  2956: "ضمك", // Damac
  2977: "الأخدود", // Al Okhdood
  2992: "النجمة", // Al Najma
  10509: "الخلود", // Al Kholood
  10511: "الرياض", // Al Riyadh
  10513: "نيوم", // NEOM
};

export function localizeSplTeamName(id: number | null | undefined, fallback: string): string {
  if (id != null && SPL_TEAM_AR[id]) return SPL_TEAM_AR[id];
  return fallback;
}

/** أسماء إحصاءات المباراة (مفتاح المزود الإنجليزي) → عربي */
export const SPL_STAT_AR: Record<string, string> = {
  "Shots on Goal": "تسديدات على المرمى",
  "Shots off Goal": "تسديدات خارج المرمى",
  "Total Shots": "إجمالي التسديدات",
  "Blocked Shots": "تسديدات محجوبة",
  "Shots insidebox": "تسديدات داخل المنطقة",
  "Shots outsidebox": "تسديدات خارج المنطقة",
  Fouls: "الأخطاء",
  "Corner Kicks": "الركلات الركنية",
  Offsides: "التسلل",
  "Ball Possession": "الاستحواذ",
  "Yellow Cards": "البطاقات الصفراء",
  "Red Cards": "البطاقات الحمراء",
  "Goalkeeper Saves": "تصديات الحارس",
  "Total passes": "إجمالي التمريرات",
  "Passes accurate": "التمريرات الدقيقة",
  "Passes %": "دقة التمرير",
  expected_goals: "الأهداف المتوقعة (xG)",
  goals_prevented: "الأهداف الممنوعة",
};

/** ترتيب عرض الإحصاءات الأهم أولًا (لغة الأرقام التي يطلبها الجمهور) */
export const SPL_STAT_ORDER = [
  "Ball Possession",
  "expected_goals",
  "Total Shots",
  "Shots on Goal",
  "Total passes",
  "Passes %",
  "Corner Kicks",
  "Fouls",
  "Offsides",
  "Yellow Cards",
  "Red Cards",
  "Goalkeeper Saves",
];

/** أدوار الكؤوس (الإقصائية) */
const SPL_ROUND_AR: Record<string, string> = {
  Final: "النهائي",
  "Semi-finals": "نصف النهائي",
  "Quarter-finals": "ربع النهائي",
  "Round of 16": "دور الـ16",
  "Round of 32": "دور الـ32",
  "Round of 64": "دور الـ64",
  "3rd Place Final": "تحديد المركز الثالث",
};

/** "Regular Season - 12" → "الجولة 12"؛ وأدوار الكؤوس → عربي */
export function localizeSplRound(round: string): string {
  const r = round ?? "";
  const league = r.match(/Regular Season\s*-\s*(\d+)/i);
  if (league) return `الجولة ${league[1]}`;
  if (SPL_ROUND_AR[r]) return SPL_ROUND_AR[r];
  const ro = r.match(/Round of\s*(\d+)/i);
  if (ro) return `دور الـ${ro[1]}`;
  return r;
}
