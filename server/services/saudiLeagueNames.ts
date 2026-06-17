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

// ---------- صفحة النادي وبطاقة اللاعب ----------

/** مراكز اللاعبين كما يعيدها المزود (إنجليزية) → عربي */
export const SPL_POSITION_AR: Record<string, string> = {
  Goalkeeper: "حراسة المرمى",
  Defender: "الدفاع",
  Midfielder: "الوسط",
  Attacker: "الهجوم",
};

/** ترتيب عرض المراكز في التشكيلة (حراسة → دفاع → وسط → هجوم) */
export const SPL_POSITION_ORDER: Record<string, number> = {
  Goalkeeper: 0,
  Defender: 1,
  Midfielder: 2,
  Attacker: 3,
};

/** مراكز الألقاب في الكؤوس → عربي */
export const SPL_TROPHY_PLACE_AR: Record<string, string> = {
  Winner: "بطل",
  "2nd Place": "وصيف",
  "3rd Place": "المركز الثالث",
};

/**
 * أسماء البطولات (مسيرة اللاعب وألقابه) → عربي. مأخوذة من تغطية API-Football،
 * مع تركيز على البطولات السعودية والخليجية والعربية والقارية وأبرز الدوريات.
 * غير المعروف يبقى كما هو بدل تشويهه.
 */
export const SPL_COMPETITION_AR: Record<string, string> = {
  "Pro League": "دوري المحترفين",
  "Saudi League": "الدوري السعودي",
  "First Division": "دوري الدرجة الأولى",
  "Division 1": "دوري الدرجة الأولى",
  "Second Division": "دوري الدرجة الثانية",
  "King Cup": "كأس الملك",
  "King's Cup": "كأس الملك",
  "Super Cup": "كأس السوبر",
  "Crown Prince Cup": "كأس ولي العهد",
  "AFC Champions League": "دوري أبطال آسيا",
  "AFC Champions League Elite": "دوري أبطال آسيا للنخبة",
  "AFC Champions League Two": "دوري أبطال آسيا الثاني",
  "AFC Cup": "كأس الاتحاد الآسيوي",
  "Asian Cup": "كأس آسيا",
  "Gulf Cup": "كأس الخليج",
  "Arab Cup": "كأس العرب",
  "Arab Club Champions Cup": "كأس العرب للأندية الأبطال",
  "World Cup": "كأس العالم",
  "Club World Cup": "كأس العالم للأندية",
  "FIFA Club World Cup": "كأس العالم للأندية",
  "Confederations Cup": "كأس القارات",
  "UEFA Champions League": "دوري أبطال أوروبا",
  "Champions League": "دوري الأبطال",
  "UEFA Europa League": "الدوري الأوروبي",
  "Europa League": "الدوري الأوروبي",
  "Premier League": "الدوري الإنجليزي الممتاز",
  "La Liga": "الدوري الإسباني",
  "Serie A": "الدوري الإيطالي",
  Bundesliga: "الدوري الألماني",
  "Ligue 1": "الدوري الفرنسي",
  Eredivisie: "الدوري الهولندي",
  "Primeira Liga": "الدوري البرتغالي",
  "Major League Soccer": "الدوري الأمريكي",
  "FA Cup": "كأس الاتحاد الإنجليزي",
  "Copa del Rey": "كأس ملك إسبانيا",
  "Coppa Italia": "كأس إيطاليا",
  "CAF Champions League": "دوري أبطال أفريقيا",
  "Africa Cup of Nations": "كأس الأمم الأفريقية",
  "Copa America": "كوبا أمريكا",
  "Euro Championship": "كأس أمم أوروبا",
  Friendlies: "مباريات ودية",
  "U20 World Cup": "كأس العالم للشباب",
  "U23 Asian Cup": "كأس آسيا تحت 23 عامًا",
  "AFC U23 Asian Cup": "كأس آسيا تحت 23 عامًا",
};

/** دول الميلاد والألقاب → عربي (أبرز دول كرة القدم). */
export const SPL_COUNTRY_AR: Record<string, string> = {
  "Saudi Arabia": "السعودية",
  World: "العالم",
  Asia: "آسيا",
  Africa: "أفريقيا",
  Europe: "أوروبا",
  Brazil: "البرازيل",
  Argentina: "الأرجنتين",
  Portugal: "البرتغال",
  Spain: "إسبانيا",
  France: "فرنسا",
  England: "إنجلترا",
  Italy: "إيطاليا",
  Germany: "ألمانيا",
  Netherlands: "هولندا",
  Belgium: "بلجيكا",
  Croatia: "كرواتيا",
  Serbia: "صربيا",
  Morocco: "المغرب",
  Tunisia: "تونس",
  Algeria: "الجزائر",
  Egypt: "مصر",
  Qatar: "قطر",
  "United Arab Emirates": "الإمارات",
  Kuwait: "الكويت",
  Bahrain: "البحرين",
  Oman: "عُمان",
  Jordan: "الأردن",
  Iraq: "العراق",
  Lebanon: "لبنان",
  Syria: "سوريا",
  Yemen: "اليمن",
  Sudan: "السودان",
  Mali: "مالي",
  Senegal: "السنغال",
  Ghana: "غانا",
  Nigeria: "نيجيريا",
  Cameroon: "الكاميرون",
  "Ivory Coast": "ساحل العاج",
  "South Africa": "جنوب أفريقيا",
  Colombia: "كولومبيا",
  Uruguay: "أوروغواي",
  Ecuador: "الإكوادور",
  Paraguay: "باراغواي",
  Chile: "تشيلي",
  Mexico: "المكسيك",
  USA: "الولايات المتحدة",
  "South Korea": "كوريا الجنوبية",
  "Korea Republic": "كوريا الجنوبية",
  Japan: "اليابان",
  Australia: "أستراليا",
  Iran: "إيران",
  Uzbekistan: "أوزبكستان",
  Turkey: "تركيا",
  Türkiye: "تركيا",
  Greece: "اليونان",
  Poland: "بولندا",
  Sweden: "السويد",
  Denmark: "الدنمارك",
  Norway: "النرويج",
  Switzerland: "سويسرا",
  Austria: "النمسا",
};

export function localizeSplCompetition(name: string): string {
  return SPL_COMPETITION_AR[name] ?? name;
}

export function localizeSplCountry(name: string): string {
  if (!name) return "";
  return SPL_COUNTRY_AR[name] ?? name;
}
