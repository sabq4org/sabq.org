/**
 * قواميس الصلة السعودية — مضمَّنة في الحزمة. كانت ملفات JSON تُقرأ بـ readFileSync
 * من data/ بجوار الملف، لكن صورة Railway (dist/index.js) لا تنسخ ذلك المجلد،
 * فكانت القواميس تُحمَّل فارغة بصمت في الإنتاج.
 */
export const SAUDI_POSITIVE_TERMS: string[] = [
  "السعودية",
  "السعودي",
  "الرياض",
  "جدة",
  "مكة",
  "المدينة",
  "نيوم",
  "أرامكو",
  "ولي العهد",
  "رؤية 2030",
  "أوبك",
  "الحج",
  "العمرة",
  "الهلال",
  "النصر",
  "الاتحاد",
  "الأهلي",
  "الشباب",
  "الدوري السعودي",
  "مجلس الوزراء",
  "وزارة الخارجية",
  "saudi",
  "saudi arabia",
  "riyadh",
  "jeddah",
  "neom",
  "aramco",
  "mbs",
  "vision 2030",
  "opec",
  "hajj",
  "umrah",
  "al hilal",
  "al nassr",
  "al ittihad",
  "gcc",
  "الخليج",
  "الكويت",
  "الإمارات",
  "قطر",
  "البحرين",
  "عمان"
];

export const SAUDI_NEGATIVE_TERMS: string[] = [
  "city council",
  "school board",
  "parking",
  "nfl draft",
  "mlb",
  "nba playoffs",
  "county fair",
  "high school football",
  "local bake",
  "zoning",
  "مجلس مدينة أمريكي",
  "دوري أمريكي محلي"
];
