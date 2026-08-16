/**
 * تعريب دوري روشن السعودي للمحترفين القادم من API-Football.
 * الأندية مربوطة بـ team id (لا الاسم) حتى لا تنكسر لو غيّر المزود التسمية.
 * قسم رياضي مخفي قيد التطوير — لا يمسّ تغطية المونديال (worldCupNames.ts).
 *
 * المعرّفات مأخوذة من /teams?league=307&season=2025 (18 ناديًا).
 */
import { localizePlayerName, WC_TEAM_AR } from "./worldCupNames";
import { isEnglishSports } from "./sportsLang";
import { correctSportsPlayerName } from "./sportsPlayerNameFixes";
import { toBinaryPlayerName } from "../../shared/sportsNames";
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
  // الدوري السعودي الممتاز للسيدات
  24884: "النصر", // Al Nassr W
  27712: "الأهلي", // Al Ahli SC W
  27713: "الهلال", // Al Hilal W
  27714: "الاتحاد", // Al Ittihad W
  27715: "القادسية", // Al Qadisiya W
  27716: "العلا", // Al-Ula W
  27717: "شعلة الشرقية", // Eastern Flames W
  27718: "نيوم", // Neom SC W
};

/**
 * تعريب أندية الدوريات الأوروبية الكبرى + كؤوس أوروبا (مربوطة بـ team id).
 * المعرّفات من /teams?league={39,140,135,78,61}&season=2025. الأندية غير
 * المُعرّبة هنا تظهر باسمها الإنجليزي الخام (fallback) ويتوسّع القاموس تدريجيًا.
 */
export const EURO_TEAM_AR: Record<number, string> = {
  // الدوري الإنجليزي
  33: "مانشستر يونايتد", 34: "نيوكاسل", 35: "بورنموث", 36: "فولهام",
  39: "وولفرهامبتون", 40: "ليفربول", 42: "آرسنال", 44: "بيرنلي",
  45: "إيفرتون", 47: "توتنهام", 48: "وست هام", 49: "تشيلسي",
  50: "مانشستر سيتي", 51: "برايتون", 52: "كريستال بالاس", 55: "برنتفورد",
  63: "ليدز يونايتد", 65: "نوتنغهام فورست", 66: "أستون فيلا", 746: "سندرلاند",
  // الدوري الإسباني
  529: "برشلونة", 530: "أتلتيكو مدريد", 531: "أتلتيك بلباو", 532: "فالنسيا",
  533: "فياريال", 536: "إشبيلية", 538: "سيلتا فيغو", 539: "ليفانتي",
  540: "إسبانيول", 541: "ريال مدريد", 542: "ألافيس", 543: "ريال بيتيس",
  546: "خيتافي", 547: "جيرونا", 548: "ريال سوسيداد", 718: "ريال أوفييدو",
  727: "أوساسونا", 728: "رايو فايكانو", 797: "إلتشي", 798: "مايوركا",
  // الدوري الإيطالي
  487: "لاتسيو", 488: "ساسولو", 489: "ميلان", 490: "كالياري",
  492: "نابولي", 494: "أودينيزي", 495: "جنوة", 496: "يوفنتوس",
  497: "روما", 499: "أتالانتا", 500: "بولونيا", 502: "فيورنتينا",
  503: "تورينو", 504: "هيلاس فيرونا", 505: "إنتر ميلان", 520: "كريمونيزي",
  523: "بارما", 801: "بيزا", 867: "ليتشي", 895: "كومو",
  // الدوري الألماني
  157: "بايرن ميونخ", 160: "فرايبورغ", 161: "فولفسبورغ", 162: "فيردر بريمن",
  163: "بوروسيا مونشنغلادباخ", 164: "ماينتس", 165: "بوروسيا دورتموند", 167: "هوفنهايم",
  168: "باير ليفركوزن", 169: "آينتراخت فرانكفورت", 170: "أوغسبورغ", 172: "شتوتغارت",
  173: "لايبزيغ", 175: "هامبورغ", 180: "هايدنهايم", 182: "يونيون برلين",
  185: "بادربورن", 186: "سانت باولي", 192: "كولن",
  // الدوري الفرنسي
  77: "أنجيه", 79: "ليل", 80: "ليون", 81: "مارسيليا",
  83: "نانت", 84: "نيس", 85: "باريس سان جيرمان", 91: "موناكو",
  94: "رين", 95: "ستراسبورغ", 96: "تولوز", 97: "لوريان",
  104: "ريد ستار", 106: "بريست", 108: "أوكسير", 111: "لوهافر",
  112: "ميتز", 114: "باريس إف سي", 116: "لانس", 1063: "سانت إيتيان", 1301: "رودي",
  // مشاركون في كؤوس أوروبا من خارج الدوريات الخمسة (دوري الأبطال/الأوروبي)
  228: "سبورتنغ لشبونة", 211: "بنفيكا", 212: "بورتو", 217: "براغا",
  194: "أياكس", 197: "آيندهوفن", 209: "فاينورد", 207: "أوترخت", 410: "غو أهيد إيغلز",
  553: "أولمبياكوس", 619: "باوك سالونيك", 617: "باناثينايكوس",
  645: "غلطة سراي", 611: "فنربخشة", 559: "ستيوا بوخارست",
  569: "كلوب بروج", 742: "غينك", 1393: "يونيون سان جيلواز",
  247: "سلتيك", 257: "رينجرز",
  551: "بازل", 565: "يونغ بويز", 571: "ريد بُل سالزبورغ", 637: "شتورم غراتس",
  400: "كوبنهاغن", 397: "ميتيلاند", 319: "بران", 375: "مالمو",
  560: "سلافيا براغ", 567: "بلزن", 620: "دينامو زغرب",
  598: "النجم الأحمر بلغراد", 651: "فرينكفاروش", 566: "لودوغوريتس",
  556: "قره باغ", 327: "بودو غليمت", 3403: "بافوس", 664: "كايرات ألماتي",
  604: "مكابي تل أبيب",
};

/**
 * تعريب أندية دوريات الخليج (الإمارات/قطر/الكويت/البحرين/عُمان) + كأس الخليج
 * للأندية. المعرّفات من /teams?league={301,305,330,417,406}&season=2025.
 * تُضاف لاحقة البلد للأندية التي يلتبس اسمها بأندية سعودية شهيرة (النصر/الأهلي…).
 */
export const GULF_TEAM_AR: Record<number, string> = {
  // الإمارات — دوري أدنوك للمحترفين
  2865: "العين", 2867: "دبا الفجيرة", 2870: "شباب الأهلي دبي", 2871: "الجزيرة",
  2872: "الوصل", 2873: "الظفرة", 2874: "الشارقة", 2875: "الوحدة",
  2876: "اتحاد كلباء", 2877: "بني ياس", 2879: "عجمان", 4912: "خورفكان",
  9136: "البطائح", 10155: "النصر (دبي)",
  // قطر — دوري نجوم قطر
  2893: "الشحانية", 2894: "الخريطيات", 2895: "السد", 2896: "الأهلي (الدوحة)",
  2897: "الريان", 2898: "السيلية", 2899: "أم صلال", 2900: "الوكرة",
  2903: "الغرافة", 2904: "الدحيل", 2905: "العربي (قطر)", 2907: "نادي قطر",
  2916: "الشمال",
  // الكويت — الدوري الكويتي الممتاز
  3532: "العربي (الكويت)", 3533: "الفحيحيل", 3534: "الجهراء", 3535: "الكويت",
  3536: "النصر (الكويت)", 3537: "القادسية (الكويت)", 3538: "السالمية", 3539: "التضامن",
  3540: "كاظمة", 3541: "الشباب (الكويت)",
  // البحرين — الدوري البحريني الممتاز
  5479: "النجمة (البحرين)", 5480: "الشباب (البحرين)", 5482: "الرفاع", 5483: "الحد",
  5484: "البديع", 5486: "المالكية", 5487: "المنامة", 5488: "المحرق",
  5580: "الأهلي (البحرين)", 5581: "الاتحاد (البحرين)", 5582: "البحرين", 10238: "سترة",
  17666: "الخالدية", 20386: "عالي",
  // عُمان — دوري عُمانتل للمحترفين
  2878: "النصر (عُمان)", 5327: "النهضة", 5328: "الرستاق", 5329: "الشباب (عُمان)",
  5330: "ظفار", 5334: "نادي عُمان", 5335: "صحم", 5336: "صحار",
  5337: "صور", 7504: "السيب", 7505: "بهلاء", 11380: "الخابورة",
  15960: "عبري", 15962: "سمائل",
};

/**
 * تعريب أندية دوري يلو (الدرجة الأولى السعودية، league 308).
 * المعرّفات من /teams?league=308&season=2025 (18 ناديًا).
 */
export const SPL_DIV1_TEAM_AR: Record<number, string> = {
  2926: "الباطن", 2930: "الفيصلي", 2935: "الرائد", 2937: "الوحدة",
  2942: "الطائي", 2947: "نادي جدة", 2950: "العدالة", 2951: "أبها",
  2958: "الجبلين", 2961: "العروبة", 2966: "البكيرية", 2971: "العربي (السعودي)",
  10503: "الأنوار", 10507: "الجندل", 10508: "الجبيل", 10524: "الزلفي",
  26357: "العلا", 26738: "الدرعية",
};

/**
 * تعريب أندية الدوريات العربية (مصر/المغرب/تونس/الجزائر/العراق/الأردن/لبنان/سوريا).
 * المعرّفات من /teams?league={233,200,202,186,542,387,390,425}&season=2025.
 * تُضاف لاحقة البلد لما يلتبس اسمه بأندية شهيرة (الأهلي/الاتحاد/النصر…).
 */
export const ARAB_TEAM_AR: Record<number, string> = {
  // مصر — الدوري المصري الممتاز
  1030: "الإسماعيلي", 1031: "المصري", 1036: "بيراميدز", 1037: "إنبي",
  1039: "طلائع الجيش", 1040: "الزمالك", 1041: "بتروجيت", 1044: "سموحة",
  1046: "وادي دجلة", 1572: "الاتحاد السكندري", 1574: "الجونة", 1575: "المقاولون العرب",
  1576: "حرس الحدود", 1577: "الأهلي (مصر)", 7520: "نادي مصر", 13819: "غزل المحلة",
  14651: "سيراميكا كليوباترا", 15570: "البنك الأهلي", 15736: "فاركو", 16431: "فيوتشر",
  20458: "كهرباء الإسماعيلية",
  // المغرب — البطولة الاحترافية
  962: "نهضة بركان", 964: "الدفاع الحسني الجديدي", 968: "الوداد البيضاوي", 969: "الجيش الملكي",
  971: "كوكب مراكش", 973: "حسنية أكادير", 974: "اتحاد طنجة", 975: "أولمبيك آسفي",
  976: "الرجاء البيضاوي", 977: "الفتح الرباطي", 3449: "نهضة الزمامرة", 3453: "المغرب الفاسي",
  3454: "أولمبيك الدشيرة", 14806: "اتحاد تواركة", 22218: "نادي مكناس", 25058: "يعقوب المنصور",
  // تونس — الرابطة المحترفة الأولى
  980: "الترجي التونسي", 981: "النادي البنزرتي", 983: "النادي الصفاقسي", 984: "نجم المتلوي",
  986: "اتحاد بن قردان", 987: "مستقبل قابس", 988: "النادي الأفريقي", 989: "نجم جرجيس",
  990: "النجم الساحلي", 991: "الملعب التونسي", 992: "الاتحاد المنستيري", 993: "شبيبة القيروان",
  6253: "مستقبل سليمان", 10368: "مستقبل المرسى", 10625: "أولمبيك باجة", 18284: "شبيبة العمران",
  // الجزائر — الرابطة المحترفة الأولى
  904: "شباب بلوزداد", 905: "وفاق سطيف", 906: "مولودية الجزائر", 907: "مولودية وهران",
  910: "اتحاد العاصمة", 911: "شباب قسنطينة", 914: "شبيبة الساورة", 915: "برادو",
  918: "شبيبة القبائل", 931: "جمعية الشلف", 1070: "مولودية مستغانم", 10743: "اتحاد البيض",
  10752: "اتحاد خنشلة", 10777: "مولودية الرويسات", 10780: "أولمبي أقبو", 10792: "نجم بن عكنون",
  // العراق — دوري نجوم العراق
  5242: "الشرطة (العراق)", 6689: "نوروز", 8009: "القوة الجوية", 8010: "الزوراء",
  11064: "الكهرباء", 11065: "الميناء", 11066: "النجف", 11067: "الطلبة",
  11069: "أمانة بغداد", 11070: "أربيل", 11071: "النفط", 11074: "نفط ميسان",
  15544: "الكرخ", 15546: "القاسم", 15547: "زاخو", 20463: "دهوك",
  20464: "كربلاء", 25061: "ديالى", 25062: "نوروز", 25063: "الكرمة",
  26598: "الموصل", 26600: "الغراف",
  // الأردن — دوري المحترفين
  4529: "الأهلي (الأردن)", 4530: "البقعة", 4531: "الفيصلي (الأردن)", 4532: "الحسين إربد",
  4533: "الجزيرة (الأردن)", 4534: "الرمثا", 4535: "السلط", 4537: "الوحدات",
  4539: "شباب الأردن", 17467: "مغير السرحان", 17469: "سما السرحان",
  // لبنان — الدوري الممتاز
  4567: "العهد", 4569: "الأنصار", 4570: "النجمة (لبنان)", 4572: "راسينغ بيروت",
  4573: "الصفاء", 4576: "شباب الساحل", 4577: "التضامن صور", 7516: "البرج",
  11879: "الحكمة", 11880: "المبرة", 22812: "الرياضي العباسية", 26399: "جويا",
  // سوريا — الدوري الممتاز
  8019: "الاتحاد (حلب)", 8035: "الوحدة (سوريا)", 8040: "الجيش (سوريا)", 9111: "الكرامة",
  9113: "الطليعة", 9114: "الفتوة", 9115: "حطين", 9116: "جبلة",
  9117: "تشرين", 9118: "الوثبة", 9123: "الشرطة (سوريا)", 15301: "الحرية",
  24992: "الشعلة", 27267: "خان شيخون", 27269: "أهلي دمشق", 27270: "أمية",
};

export function localizeSplTeamName(id: number | null | undefined, fallback: string): string {
  // الوضع الإنجليزي: أعِد اسم المزوّد الأصلي (إنجليزي) بلا تعريب.
  if (isEnglishSports()) return fallback;
  if (id != null) {
    if (SPL_TEAM_AR[id]) return SPL_TEAM_AR[id];
    if (SPL_DIV1_TEAM_AR[id]) return SPL_DIV1_TEAM_AR[id];
    if (EURO_TEAM_AR[id]) return EURO_TEAM_AR[id];
    if (GULF_TEAM_AR[id]) return GULF_TEAM_AR[id];
    if (ARAB_TEAM_AR[id]) return ARAB_TEAM_AR[id];
    if (WC_TEAM_AR[id]) return WC_TEAM_AR[id]; // منتخبات كأس العالم
  }
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

/** جولات دور مجموعات البطولات (المونديال وأشباهه) — نفس صيغة worldCupNames */
const SPL_GROUP_ROUND_AR: Record<string, string> = {
  "Group Stage - 1": "الجولة الأولى",
  "Group Stage - 2": "الجولة الثانية",
  "Group Stage - 3": "الجولة الثالثة",
};

/** "Regular Season - 12" → "الجولة 12"؛ وأدوار الكؤوس والمجموعات → عربي */
export function localizeSplRound(round: string): string {
  const r = round ?? "";
  // الوضع الإنجليزي: صيغة إنجليزية نظيفة (المصدر إنجليزي أصلًا؛ نلطّف «Regular
  // Season - N» فقط، والبقية «Final / Round of 16 / …» جاهزة للعرض).
  if (isEnglishSports()) {
    const rs = r.match(/Regular Season\s*-\s*(\d+)/i);
    return rs ? `Round ${rs[1]}` : r;
  }
  const league = r.match(/Regular Season\s*-\s*(\d+)/i);
  if (league) return `الجولة ${league[1]}`;
  if (SPL_ROUND_AR[r]) return SPL_ROUND_AR[r];
  if (SPL_GROUP_ROUND_AR[r]) return SPL_GROUP_ROUND_AR[r];
  const group = r.match(/Group Stage\s*-\s*(\d+)/i);
  if (group) return `الجولة ${group[1]} — دور المجموعات`;
  const knockoutLeg = r.match(/^(League Stage|League Phase)\s*-\s*(\d+)/i);
  if (knockoutLeg) return `الجولة ${knockoutLeg[2]} — مرحلة الدوري`;
  const qualifying = r.match(/^(\d+)(?:st|nd|rd|th)\s+Qualifying\s+Round/i);
  if (qualifying) {
    const labels: Record<string, string> = {
      "1": "الدور التأهيلي الأول",
      "2": "الدور التأهيلي الثاني",
      "3": "الدور التأهيلي الثالث",
    };
    return labels[qualifying[1]] ?? `الدور التأهيلي ${qualifying[1]}`;
  }
  if (/Play-?offs?/i.test(r)) return "الملحق";
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
  "Pro League": "دوري روشن السعودي",
  "Saudi League": "دوري روشن السعودي",
  "First Division": "دوري يلو لأندية الدرجة الأولى",
  "Division 1": "دوري يلو لأندية الدرجة الأولى",
  "Second Division": "دوري الدرجة الثانية السعودي",
  "King Cup": "كأس خادم الحرمين الشريفين",
  "King's Cup": "كأس خادم الحرمين الشريفين",
  "Super Cup": "كأس السوبر السعودي",
  "Women's Premier League": "الدوري السعودي الممتاز للسيدات",
  "Women Premier League": "الدوري السعودي الممتاز للسيدات",
  "Womens Premier League": "الدوري السعودي الممتاز للسيدات",
  "Saudi Women's Premier League": "الدوري السعودي الممتاز للسيدات",
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

// ---------- الملاعب والمدن ----------

/**
 * تعريب الملاعب الكبرى (مفتاح اسم المزود الإنجليزي الحرفي) — طبقة جودة مضمونة
 * فوق الترجمة الآلية؛ ما ليس هنا يعرَّب آليًا عبر sportsNamesService ويُعتمد
 * تحريريًا من اللوحة.
 */
export const SPL_VENUE_AR: Record<string, string> = {
  // السعودية
  "Kingdom Arena": "كينغدوم أرينا",
  "King Fahd International Stadium": "ملعب الملك فهد الدولي «الدرة»",
  "King Abdullah Sports City": "ملعب مدينة الملك عبدالله الرياضية «الجوهرة»",
  "King Abdullah Sports City Stadium": "ملعب مدينة الملك عبدالله الرياضية «الجوهرة»",
  "Al-Awwal Park": "ملعب الأول بارك",
  "King Saud University Stadium": "ملعب الأول بارك",
  "Prince Abdullah Al-Faisal Stadium": "ملعب الأمير عبدالله الفيصل",
  "Prince Faisal bin Fahd Stadium": "ملعب الأمير فيصل بن فهد",
  "Prince Mohamed bin Fahd Stadium": "ملعب الأمير محمد بن فهد",
  "Prince Saud bin Jalawi Stadium": "ملعب الأمير سعود بن جلوي",
  "Prince Sultan bin Abdul Aziz Stadium": "ملعب الأمير سلطان بن عبدالعزيز",
  "Prince Abdul Aziz bin Musa'ed Stadium": "ملعب الأمير عبدالعزيز بن مساعد",
  "King Abdul Aziz Stadium": "ملعب الملك عبدالعزيز",
  "King Khalid Sport City Stadium": "ملعب مدينة الملك خالد الرياضية",
  "Al-Ettifaq Club Stadium": "ملعب نادي الاتفاق",
  // الخليج والعالم (الأشهر في تغطيتنا)
  "Lusail Stadium": "استاد لوسيل",
  "Khalifa International Stadium": "استاد خليفة الدولي",
  "Jaber Al-Ahmad International Stadium": "استاد جابر الأحمد الدولي",
  "Mohammed Bin Zayed Stadium": "استاد محمد بن زايد",
  "Hazza bin Zayed Stadium": "استاد هزاع بن زايد",
  "Old Trafford": "أولد ترافورد",
  "Anfield": "أنفيلد",
  "Emirates Stadium": "ملعب الإمارات",
  "Etihad Stadium": "ملعب الاتحاد",
  "Tottenham Hotspur Stadium": "ملعب توتنهام هوتسبير",
  "Stamford Bridge": "ستامفورد بريدج",
  "Santiago Bernabéu": "سانتياغو برنابيو",
  "Estadio Santiago Bernabéu": "سانتياغو برنابيو",
  "Spotify Camp Nou": "كامب نو",
  "Camp Nou": "كامب نو",
  "San Siro": "سان سيرو",
  "Giuseppe Meazza": "سان سيرو",
  "Allianz Arena": "أليانز أرينا",
  "Signal Iduna Park": "سيغنال إيدونا بارك",
  "Parc des Princes": "حديقة الأمراء",
};

/** تعريب مدن الملاعب (الأشهر) — الباقي آليًا عبر sportsNamesService. */
export const SPL_CITY_AR: Record<string, string> = {
  Riyadh: "الرياض",
  Jeddah: "جدة",
  Jiddah: "جدة",
  Mecca: "مكة المكرمة",
  Makkah: "مكة المكرمة",
  Medina: "المدينة المنورة",
  Dammam: "الدمام",
  "Al-Khobar": "الخبر",
  Buraidah: "بريدة",
  Buraydah: "بريدة",
  Unaizah: "عنيزة",
  Abha: "أبها",
  "Al-Hofuf": "الهفوف",
  Hofuf: "الهفوف",
  Taif: "الطائف",
  "Ha'il": "حائل",
  Hail: "حائل",
  Najran: "نجران",
  Tabuk: "تبوك",
  Jubail: "الجبيل",
  "Al-Majma'ah": "المجمعة",
  Dubai: "دبي",
  "Abu Dhabi": "أبوظبي",
  Sharjah: "الشارقة",
  "Al-Ain": "العين",
  Doha: "الدوحة",
  "Al-Rayyan": "الريان",
  Lusail: "لوسيل",
  "Kuwait City": "مدينة الكويت",
  Manama: "المنامة",
  Muscat: "مسقط",
  London: "لندن",
  Manchester: "مانشستر",
  Liverpool: "ليفربول",
  Madrid: "مدريد",
  Barcelona: "برشلونة",
  Milan: "ميلانو",
  Turin: "تورينو",
  Rome: "روما",
  Naples: "نابولي",
  Munich: "ميونخ",
  Dortmund: "دورتموند",
  Paris: "باريس",
};

export function localizeSplCompetition(name: string): string {
  if (isEnglishSports()) return name;
  return SPL_COMPETITION_AR[name] ?? name;
}

export function localizeSplCountry(name: string): string {
  if (isEnglishSports()) return name;
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
  transfer: "انتقال", // المزوّد يرسلها لانتقال دائم بلا مبلغ معلن
  "-": "انتقال",
};

export function localizeSplTransferType(type: string | null | undefined): string {
  const raw = (type ?? "").trim();
  if (!raw) return isEnglishSports() ? "Unknown" : "غير معلوم";
  if (isEnglishSports()) return raw;
  const key = raw.toLowerCase();
  if (SPL_TRANSFER_TYPE_AR[key]) return SPL_TRANSFER_TYPE_AR[key];
  // مطابقة بالكلمة للصيغ المركّبة (Free agent / Loan / End of loan / Transfer)
  // قبل الرجوع للنصّ الخام — المزوّد يخلط الصيغ.
  if (/[€$£]/.test(raw) || /\d/.test(raw)) return raw; // مبلغ صفقة → كما ورد
  if (key.includes("loan") && key.includes("end")) return "انتهاء إعارة";
  if (key.includes("loan")) return "إعارة";
  if (key.includes("free")) return "انتقال حر";
  if (key.includes("transfer") || key === "-") return "انتقال";
  // نص غير معروف → يُعرض كما ورد.
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
  if (isEnglishSports()) return raw;
  return SPL_INJURY_TYPE_AR[raw.toLowerCase()] ?? raw;
}

// سبب الإصابة من TheSports (team/injury/list) نصّ إنجليزي حُرّ (مثل "calf muscle
// injury" / "knee surgery") — نعرّبه أفضل جهد. غير المعروف يبقى كما ورد بدل تشويهه.
const SPL_INJURY_PART_AR: Record<string, string> = {
  knee: "الركبة",
  hamstring: "أوتار الركبة الخلفية",
  ankle: "الكاحل",
  thigh: "الفخذ",
  calf: "عضلة الساق",
  "calf muscle": "عضلة الساق",
  groin: "أعلى الفخذ",
  muscle: "عضلية",
  back: "الظهر",
  shoulder: "الكتف",
  foot: "القدم",
  hip: "الورك",
  achilles: "وتر العرقوب",
  head: "الرأس",
  rib: "الأضلاع",
  wrist: "المعصم",
  toe: "إصبع القدم",
  finger: "الإصبع",
  neck: "الرقبة",
  elbow: "المرفق",
};

const SPL_INJURY_WHOLE_AR: Record<string, string> = {
  illness: "وعكة صحية",
  suspended: "إيقاف",
  suspension: "إيقاف",
  knock: "رضّة",
  fatigue: "إجهاد",
  "unknown injury": "إصابة غير محدّدة",
  "knee injury": "إصابة في الركبة",
};

export function localizeSplInjuryReason(en: string | null | undefined): string | null {
  if (!en) return null;
  const low = en.toLowerCase().trim();
  if (!low) return null;
  // في EN نُبقي نص المزوّد الإنجليزي كما هو.
  if (isEnglishSports()) return en;
  if (SPL_INJURY_WHOLE_AR[low]) return SPL_INJURY_WHOLE_AR[low];
  const m = low.match(/^(.+?)\s+(injury|problem|strain|knock|surgery)$/);
  if (m && SPL_INJURY_PART_AR[m[1]]) return `إصابة في ${SPL_INJURY_PART_AR[m[1]]}`;
  if (SPL_INJURY_PART_AR[low]) return `إصابة في ${SPL_INJURY_PART_AR[low]}`;
  return en; // غير معروف — نُبقي الإنجليزي بدل تشويهه
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
  // القادسية
  415049: "جابرييل كارفالو",
  44449: "أحمد الكسار", // كان يتسرب إنجليزيًا خامًا في التشكيلة (افتتاح روشن 2026-08-13)
  // الشباب — حادثة «ح. الحمامي/حمام الحمامي» (افتتاح روشن 2026-08-13): حرف H
  // ملتبس (هاء/حاء) والمعرّف مزدوج عند المزوّد (التشكيلة والأحداث بهويتين).
  463864: "همام الهمامي",
  543065: "همام الهمامي",
  465786: "مامادو باري", // الأحداث كانت تختصره «م. ت. باري» بينما التشكيلة «مامادو باري»
};

export const SPL_COACH_AR: Record<number, string> = {
  13959: "ماتياس يايسله",     // الأهلي
  2392: "سيموني إنزاغي",      // الهلال
  123: "جورجي جيزوس",         // النصر
  2204: "سيرجيو كونسيساو",    // الاتحاد
};

// محوّل اختياري بالذكاء الاصطناعي (resolveNames) للأسماء غير المغطّاة بالمعرّف؛
// لو لم يُمرَّر نسقط للقاموس الثابت فقط (سلوك متوافق مع النداءات القديمة).
type NameTranslator = (name: string | null | undefined) => string;

// حارس الخلط اللغوي: ترجمة ناقصة مثل «جابرييل كارvalho» (عربي ولاتيني في كلمة
// واحدة) أسوأ من الاسم اللاتيني كاملًا — نرفضها ونعيد الأصل (شوهدت في هدّاف
// كأس الملك 2026-07-05).
const MIXED_SCRIPT_TOKEN = /[؀-ۿ][^\s]*[A-Za-z]|[A-Za-z][^\s]*[؀-ۿ]/;
function rejectMixedScript(candidate: string, fallback: string): string {
  if (!candidate) return fallback || "";
  return MIXED_SCRIPT_TOKEN.test(candidate) ? fallback || "" : candidate;
}

export function localizeSplPlayerName(
  id: number | null | undefined,
  fallback: string,
  tr?: NameTranslator,
): string {
  if (isEnglishSports()) return fallback; // اسم اللاعب الأصلي (إنجليزي)
  if (id != null && SPL_PLAYER_AR[id]) return toBinaryPlayerName(SPL_PLAYER_AR[id]);
  const raw = tr ? tr(fallback) : localizePlayerName(fallback) || fallback || "";
  const candidate = rejectMixedScript(correctSportsPlayerName(fallback, raw) || "", fallback) || fallback || "";
  return toBinaryPlayerName(candidate);
}

export function localizeSplCoachName(
  id: number | null | undefined,
  fallback: string,
  tr?: NameTranslator,
): string {
  if (isEnglishSports()) return fallback; // اسم المدرّب الأصلي (إنجليزي)
  if (id != null && SPL_COACH_AR[id]) return SPL_COACH_AR[id];
  if (tr) return rejectMixedScript(tr(fallback) || "", fallback) || fallback || "";
  return rejectMixedScript(localizePlayerName(fallback) || "", fallback) || fallback || "";
}
