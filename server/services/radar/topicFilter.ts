/**
 * فلتر اهتمام سبق — للمصادر الأجنبية (أمريكية/عالمية) لا نُدخل كل شيء؛
 * نُبقي ما يمس: السعودية، تصعيد أمريكا/إيران، كأس العالم، لاعبين مشهورين، حدثاً كبيراً.
 * المصادر الخليجية/السعودية تمرّ بلا فلتر.
 */
import type { RadarSource } from "@shared/schema";

/** يُفعَّل افتراضياً — عطّله بـ RADAR_TOPIC_FILTER_ENABLED=false */
export function isTopicFilterEnabled(): boolean {
  return process.env.RADAR_TOPIC_FILTER_ENABLED !== "false";
}

/** مصادر تُفلتر (أجنبية). الخليج/السعودية تمرّ كاملة. */
export function shouldApplyTopicFilter(source: RadarSource): boolean {
  if (!isTopicFilterEnabled()) return false;
  if (source.type === "x" && source.xType === "trend") return false;
  const region = (source.region ?? "").toLowerCase();
  if (region === "gulf" || region === "saudi" || region === "local") return false;
  if (source.packId === "saudi-gulf") return false;
  // حسابات/RSS أمريكية أو عالمية أو بلا منطقة مع لغة إنجليزية
  if (region === "us" || region === "global" || region === "eu" || region === "world") return true;
  if (!region && (source.language === "en" || source.language === "es" || source.language === "fr")) {
    return true;
  }
  return false;
}

/** كلمات اهتمام سبق — إنجليزية + عربية (مطابقة غير حسّاسة لحالة الأحرف) */
export const SABQ_INTEREST_TERMS: string[] = [
  // —— السعودية / الخليج ——
  "saudi",
  "saudi arabia",
  "ksa",
  "riyadh",
  "jeddah",
  "neom",
  "aramco",
  "mbs",
  "mohammed bin salman",
  "vision 2030",
  "opec",
  "hajj",
  "umrah",
  "mecca",
  "medina",
  "red sea",
  "persian gulf",
  "arabian gulf",
  "gulf cooperation",
  "gcc",
  // كيانات سعودية لا تحمل كلمة Saudi في النص الأجنبي
  "public investment fund",
  "liv golf",
  "turki alalshikh",
  "alula",
  "al-ula",
  "diriyah",
  "qiddiya",
  "expo 2030",
  "king salman",
  "bin salman",
  "kaust",
  "sabic",
  "flynas",
  "sindalah",
  "roshn",
  "esports world cup",
  // «السعودية» بلغات العالم — تجعل الفلتر يعمل على مواد GDELT وأي خلاصة غير إنجليزية
  "saoudite", // فرنسية: Arabie saoudite
  "saudita", // إسبانية/إيطالية/برتغالية
  "suudi", // تركية: Suudi Arabistan
  "саудовская", // روسية
  "سعودی", // فارسية/أردو
  "सऊदी", // هندية
  "サウジ", // يابانية
  "沙特", // صينية مبسطة
  "הסעודית", // عبرية
  "السعودية",
  "السعودي",
  "الرياض",
  "جدة",
  "نيوم",
  "أرامكو",
  "ولي العهد",
  "رؤية 2030",
  "أوبك",
  "الحج",
  "العمرة",
  "صندوق الاستثمارات",
  "موسم الرياض",
  "موسم جدة",
  "العلا",
  "الدرعية",
  "القدية",
  "إكسبو",
  "الملك سلمان",
  "بن سلمان",
  "سابك",
  "طيران ناس",
  "روشن",
  "تركي آل الشيخ",
  // —— أمريكا / إيران والتصعيد ——
  "iran",
  "iranian",
  "tehran",
  "irgc",
  "revolutionary guard",
  "strait of hormuz",
  "hormuz",
  "hezbollah",
  "houthis",
  "houthi",
  "israel-iran",
  "iran-israel",
  "us-iran",
  "iran-us",
  "pentagon",
  "إيران",
  "طهران",
  "الحرس الثوري",
  "مضيق هرمز",
  "الحوثي",
  "حزب الله",
  // —— كأس العالم ——
  "world cup",
  "fifa",
  "wc2026",
  "wc 2026",
  "world cup 2026",
  "world cup 2034",
  "كأس العالم",
  "المونديال",
  "فيفا",
  // —— لاعبون مشهورون (عالم + ارتباط سعودي) ——
  "ronaldo",
  "cristiano",
  "messi",
  "mbappe",
  "mbappé",
  "haaland",
  "neymar",
  "benzema",
  "vinicius",
  "vinícius",
  "salah",
  "bellingham",
  "yamal",
  "lamine yamal",
  "al-nassr",
  "al nassr",
  "al-hilal",
  "al hilal",
  "al-ittihad",
  "al ittihad",
  "saudi pro league",
  "spl",
  "رونالدو",
  "ميسي",
  "مبابي",
  "هالاند",
  "نيمار",
  "بنزيما",
  "صلاح",
  "الهلال",
  "النصر",
  "الاتحاد",
  // —— حدث كبير (ضيّق عمداً — لا نمرّر "Breaking" وحده) ——
  "assassination",
  "earthquake",
  "tsunami",
  "coup",
  "nuclear weapon",
  "nuclear strike",
  "state of emergency",
  "martial law",
  "ceasefire",
  "declaration of war",
  "اغتيال",
  "زلزال",
  "تسونامي",
  "انقلاب",
  "حالة طوارئ",
  "وقف إطلاق النار",
];

const NORMALIZED_TERMS = SABQ_INTEREST_TERMS.map((t) => t.toLowerCase());

/** استعلام X مضغوط يُلحق بـ from:account لخفض الضوضاء عند الجلب */
export function sabqInterestXQueryClause(): string {
  // مجموعة مختصرة ضمن حدود طول استعلام recent search
  const compact = [
    "Saudi",
    '"Saudi Arabia"',
    "Riyadh",
    "NEOM",
    "Aramco",
    "OPEC",
    "Iran",
    "Tehran",
    "IRGC",
    "Hormuz",
    "Houthi",
    '"World Cup"',
    "FIFA",
    "Ronaldo",
    "Messi",
    "Mbappe",
    "Haaland",
    "Neymar",
    "Benzema",
    '"Al Hilal"',
    '"Al Nassr"',
    "earthquake",
    "assassination",
    "ceasefire",
  ];
  return `(${compact.join(" OR ")})`;
}

export function matchesSabqInterest(text: string): boolean {
  if (!text.trim()) return false;
  const hay = text.toLowerCase();
  return NORMALIZED_TERMS.some((term) => hay.includes(term));
}

export function filterItemsBySabqInterest<T extends { title: string; excerpt?: string | null }>(
  items: T[]
): T[] {
  return items.filter((item) =>
    matchesSabqInterest(`${item.title}\n${item.excerpt ?? ""}`)
  );
}
