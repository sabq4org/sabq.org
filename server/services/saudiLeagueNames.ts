/**
 * تعريب دوري روشن السعودي للمحترفين القادم من API-Football.
 * الأندية مربوطة بـ team id (لا الاسم) حتى لا تنكسر لو غيّر المزود التسمية.
 * قسم رياضي مخفي قيد التطوير — لا يمسّ تغطية المونديال (worldCupNames.ts).
 *
 * المعرّفات مأخوذة من /teams?league=307&season=2025 (18 ناديًا).
 */
import { localizePlayerName } from "./worldCupNames";
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

/**
 * مفاتيح إحصاءات النادي الشاملة (teams/statistics) من المزوّد → عربي.
 * تركيب البيانات: { total, fixtures, goals, biggest, clean_sheet, failed_to_score,
 *   cards, penalty, lineups }. نعرّب المفاتيح الفرعية الثابتة فقط هنا.
 */
export const SPL_TEAMSTAT_LEAGUE_PHASE_AR: Record<string, string> = {
  "Regular Season": "الدوري",
  "1st Phase": "الدور الأول",
  "2nd Phase": "الدور الثاني",
  "Final Stage": "المرحلة النهائية",
  "Final Phases": "المراحل النهائية",
};

/** ترتيب أكثر التشكيلات استخداماً (النتيجة) لا يحتاج تعريبًا — يُعرض كما هو (مثل 4-3-3). */
/** ألوان/أنواع البطاقات الإجمالية للنادي (yellow/red) → عربي قصير. */
export const SPL_TEAMSTAT_CARD_AR: Record<string, string> = {
  yellow: "صفراء",
  red: "حمراء",
};

/** تعريب سلسلة الأرقام (أطول فوز/خسارة/تعادل): "WWWDW" → تُحلّ رموزها عند العرض. */
export const SPL_FORM_LETTER_AR: Record<string, string> = {
  W: "فوز",
  D: "تعادل",
  L: "خسارة",
};

// ---------- الموجة 2/3: انتقالات وإصابات ----------

/**
 * نوع الانتقال (transfers[].type) → عربي. القيمة قد تكون كلمة (Free/Loan/N/A)
 * أو مبلغ صفقة (مثل "€ 20M") أو null. نعرّب الكلمات فقط، والمبلغ يُعرض كما هو.
 */
export const SPL_TRANSFER_TYPE_AR: Record<string, string> = {
  free: "انتقال حر",
  loan: "إعارة",
  "n/a": "غير معلوم",
  "loan end": "انتهاء إعارة",
  swap: "تبادل",
};

export function localizeSplTransferType(type: string | null | undefined): string {
  const raw = (type ?? "").trim();
  if (!raw) return "غير معلوم";
  const key = raw.toLowerCase();
  if (SPL_TRANSFER_TYPE_AR[key]) return SPL_TRANSFER_TYPE_AR[key];
  // مبلغ صفقة أو نص غير معروف → يُعرض كما ورد (الأرقام/العملات عالمية).
  return raw;
}

/** نوع الإصابة/الغياب (injuries[].type) → عربي. السبب (reason) نص حُرّ يُترك كما هو. */
export const SPL_INJURY_TYPE_AR: Record<string, string> = {
  "missing fixture": "غياب عن المباراة",
  injured: "مصاب",
  questionable: "مشكوك في جاهزيته",
};

export function localizeSplInjuryType(type: string | null | undefined): string {
  const raw = (type ?? "").trim();
  if (!raw) return "";
  return SPL_INJURY_TYPE_AR[raw.toLowerCase()] ?? raw;
}

// ---------- أسماء اللاعبين والمدربين (تعريب بالمعرّف) ----------
//
// المزوّد يعيد أسماء اللاعبين بصيغ مختلفة بين النقاط ("R. Mahrez" في التشكيلة،
// "Riyad Mahrez" في الهدّافين...) فالربط بالاسم النصّي هشّ. لذا نربط بـ player id
// المتوفّر في كل النقاط المهمّة (تشكيلة/هدّافون/تقييمات/بطاقات/انتقالات).
// نغطّي النجوم والدوليين السعوديين بأسماء مؤكّدة؛ غير المغطّى يسقط للإنجليزية.
export const SPL_PLAYER_AR: Record<number, string> = {
  // الأهلي
  432778: "عبدالله عبده",
  642081: "علي باخشوين",
  2986: "إدوار ميندي",
  383175: "زكريا الهوساوي",
  30521: "ميريح دميرال",
  30424: "روجر إيبانيز",
  44367: "علي مجرشي",
  1642: "فرانك كيسيه",
  162887: "إنزو ميو",
  44324: "فراس البريكان",
  41197: "جالينو",
  635: "رياض محرز",
  352372: "ماتيوس غونسالفيس",
  19974: "آيفان توني",
  414395: "ريكاردو ماتياس",
  269172: "زياد الجهني",
  // الهلال
  2701: "ياسين بونو",
  318: "كاليدو كوليبالي",
  46792: "بابلو ماري",
  44362: "حسن تمبكتي",
  44339: "ناصر الدوسري",
  44340: "سالم الدوسري",
  44349: "محمد كنو",
  1856: "سيرغي ميلينكوفيتش-سافيتش",
  2676: "روبن نيفيز",
  759: "كريم بنزيما",
  156: "مالكوم",
  267771: "ماركوس ليوناردو",
  51617: "داروين نونيز",
  47300: "تيو هيرنانديز",
  44507: "علي لاجامي",
  // النصر
  193288: "نواف العقيدي",
  10111: "بينتو",
  44475: "عبدالإله العمري",
  44309: "سلطان الغنام",
  2670: "إينيغو مارتينيز",
  22250: "موسى سيماكان",
  201: "ماركو بروزوفيتش",
  44382: "عبدالله الحمدان",
  508: "كينغسلي كومان",
  44447: "عبدالرحمن غريب",
  583: "جواو فيليكس",
  304: "ساديو ماني",
  874: "كريستيانو رونالدو",
  147812: "أيمن يحيى",
  44315: "عبدالله الخيبري",
  44509: "علي الحسن",
  // الاتحاد
  2814: "بريدراغ رايكوفيتش",
  299: "فابينيو",
  381: "دانيلو بيريرا",
  658: "حسام عوار",
  44551: "صالح الشهري",
  244: "ستيفن بيرغوين",
  277: "موسى ديابي",
  47422: "يوسف النصيري",
  325165: "روجر فيرنانديز",
  44335: "حسن كادش",
  44336: "أحمد شراحيلي",
  187953: "فيصل الغامدي",
  78583: "أحمد الغامدي",
  44586: "عبدالرحمن العبود",
};

export const SPL_COACH_AR: Record<number, string> = {
  13959: "ماتياس يايسله",     // الأهلي
  2392: "سيموني إنزاغي",      // الهلال
  123: "جورجي جيزوس",         // النصر
  2204: "سيرجيو كونسيساو",    // الاتحاد
};

export function localizeSplPlayerName(id: number | null | undefined, fallback: string): string {
  if (id != null && SPL_PLAYER_AR[id]) return SPL_PLAYER_AR[id];
  return localizePlayerName(fallback) || fallback || "";
}

export function localizeSplCoachName(id: number | null | undefined, fallback: string): string {
  if (id != null && SPL_COACH_AR[id]) return SPL_COACH_AR[id];
  return localizePlayerName(fallback) || fallback || "";
}
