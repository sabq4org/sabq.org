/**
 * تعريب بيانات كأس العالم 2026 القادمة من API-Football.
 * كل ما يصل للقارئ عربي — الإنجليزية تبقى داخلية فقط.
 * المنتخبات مربوطة بـ team id (وليس الاسم) حتى لا تنكسر لو غيّر المزود التسمية.
 */

export const WC_TEAM_AR: Record<number, string> = {
  1: "بلجيكا",
  2: "فرنسا",
  3: "كرواتيا",
  5: "السويد",
  6: "البرازيل",
  7: "أوروغواي",
  8: "كولومبيا",
  9: "إسبانيا",
  10: "إنجلترا",
  11: "بنما",
  12: "اليابان",
  13: "السنغال",
  15: "سويسرا",
  16: "المكسيك",
  17: "كوريا الجنوبية",
  20: "أستراليا",
  22: "إيران",
  23: "السعودية",
  25: "ألمانيا",
  26: "الأرجنتين",
  27: "البرتغال",
  28: "تونس",
  31: "المغرب",
  32: "مصر",
  770: "التشيك",
  775: "النمسا",
  777: "تركيا",
  1090: "النرويج",
  1108: "اسكتلندا",
  1113: "البوسنة والهرسك",
  1118: "هولندا",
  1501: "ساحل العاج",
  1504: "غانا",
  1508: "الكونغو الديمقراطية",
  1531: "جنوب أفريقيا",
  1532: "الجزائر",
  1533: "الرأس الأخضر",
  1548: "الأردن",
  1567: "العراق",
  1568: "أوزبكستان",
  1569: "قطر",
  2380: "باراغواي",
  2382: "الإكوادور",
  2384: "الولايات المتحدة",
  2386: "هايتي",
  4673: "نيوزيلندا",
  5529: "كندا",
  5530: "كوراساو",
};

export const SAUDI_TEAM_ID = 23;

/**
 * المنتخبات العربية المتأهلة لكأس العالم 2026 (بمعرّف API-Football، لا الاسم).
 * تُستخدم لتوليد «تقرير المنتخبات العربية بعد كل جولة» — تجميع نتائج كل منتخب
 * عربي في الجولة الواحدة في مادة تحليلية واحدة. حدّث القائمة إن تأهّل/خرج منتخب.
 */
export const ARAB_TEAM_IDS = new Set<number>([
  23, // السعودية
  28, // تونس
  31, // المغرب
  32, // مصر
  1532, // الجزائر
  1548, // الأردن
  1567, // العراق
  1569, // قطر
]);

export const isArabTeam = (id: number | null | undefined): boolean =>
  id != null && ARAB_TEAM_IDS.has(id);

/** الملاعب الـ16 المضيفة (المفتاح = الاسم الإنجليزي كما يرسله المزود) */
export const WC_VENUE_AR: Record<string, { name: string; city: string }> = {
  "AT&T Stadium": { name: "ملعب إيه تي آند تي", city: "دالاس" },
  "Arrowhead Stadium": { name: "ملعب أروهيد", city: "كانساس سيتي" },
  "BC Place": { name: "ملعب بي سي بلايس", city: "فانكوفر" },
  "BMO Field": { name: "ملعب بي إم أو", city: "تورونتو" },
  "Estadio Akron": { name: "ملعب أكرون", city: "غوادالاخارا" },
  "Estadio Azteca": { name: "ملعب أزتيكا", city: "مكسيكو سيتي" },
  "Estadio BBVA": { name: "ملعب بي بي في إيه", city: "مونتيري" },
  "Gillette Stadium": { name: "ملعب جيليت", city: "بوسطن" },
  "Hard Rock Stadium": { name: "ملعب هارد روك", city: "ميامي" },
  "Levi's Stadium": { name: "ملعب ليفايس", city: "سان فرانسيسكو" },
  "Lincoln Financial Field": { name: "ملعب لينكولن فاينانشال", city: "فيلادلفيا" },
  "Lumen Field": { name: "ملعب لومن", city: "سياتل" },
  "Mercedes-Benz Stadium": { name: "ملعب مرسيدس-بنز", city: "أتلانتا" },
  "MetLife Stadium": { name: "ملعب متلايف", city: "نيويورك" },
  "NRG Stadium": { name: "ملعب إن آر جي", city: "هيوستن" },
  "SoFi Stadium": { name: "ملعب سوفي", city: "لوس أنجلوس" },
};

/** حالات المباراة (الرموز القصيرة للمزود) */
export const WC_STATUS_AR: Record<string, string> = {
  TBD: "لم يُحدد الموعد",
  NS: "لم تبدأ",
  "1H": "الشوط الأول",
  HT: "استراحة الشوطين",
  "2H": "الشوط الثاني",
  ET: "الوقت الإضافي",
  BT: "استراحة الوقت الإضافي",
  P: "ركلات الترجيح",
  SUSP: "موقوفة",
  INT: "متوقفة مؤقتًا",
  FT: "انتهت",
  AET: "انتهت بعد الوقت الإضافي",
  PEN: "انتهت بركلات الترجيح",
  PST: "مؤجلة",
  CANC: "ملغاة",
  ABD: "ألغيت",
  AWD: "محسومة إداريًا",
  WO: "انسحاب",
  LIVE: "مباشر",
};

export const WC_LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"]);
export const WC_FINISHED_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

const GROUP_STAGE_ROUND_AR: Record<string, string> = {
  "Group Stage - 1": "الجولة الأولى",
  "Group Stage - 2": "الجولة الثانية",
  "Group Stage - 3": "الجولة الثالثة",
};

const KNOCKOUT_ROUND_AR: Record<string, string> = {
  "Round of 32": "دور الـ32",
  "Round of 16": "دور الـ16",
  "Quarter-finals": "ربع النهائي",
  "Semi-finals": "نصف النهائي",
  "3rd Place Final": "مباراة المركز الثالث",
  "Third place": "مباراة المركز الثالث",
  Final: "النهائي",
};

export function localizeRound(round: string): string {
  return GROUP_STAGE_ROUND_AR[round] ?? KNOCKOUT_ROUND_AR[round] ?? round;
}

/**
 * "Group A" أو "Group Stage - Group A" → "المجموعة A".
 * المزود غيّر التسمية مع أول إعادة حساب للجداول أثناء البطولة — نلتقط
 * الحرف في نهاية الاسم لنصمد أمام الصيغتين.
 */
export function localizeGroup(group: string): string {
  const m = group.match(/Group\s+([A-L])\s*$/i);
  return m ? `المجموعة ${m[1].toUpperCase()}` : group;
}

/** أحداث المباراة: النوع + التفصيل → وصف عربي */
export function localizeEvent(type: string, detail: string): { type: string; label: string } {
  const t = type.toLowerCase();
  if (t === "goal") {
    if (detail === "Own Goal") return { type: "goal", label: "هدف عكسي" };
    if (detail === "Penalty") return { type: "goal", label: "هدف من ركلة جزاء" };
    if (detail === "Missed Penalty") return { type: "missed-penalty", label: "ركلة جزاء ضائعة" };
    return { type: "goal", label: "هدف" };
  }
  if (t === "card") {
    if (detail === "Red Card") return { type: "red-card", label: "بطاقة حمراء" };
    return { type: "yellow-card", label: "بطاقة صفراء" };
  }
  if (t === "subst") return { type: "substitution", label: "تبديل" };
  if (t === "var") {
    const varDetail: Record<string, string> = {
      "Goal cancelled": "إلغاء هدف بعد مراجعة الفار",
      "Goal confirmed": "تأكيد هدف بعد مراجعة الفار",
      "Penalty confirmed": "احتساب ركلة جزاء بعد مراجعة الفار",
      "Penalty cancelled": "إلغاء ركلة جزاء بعد مراجعة الفار",
      "Goal Disallowed - offside": "إلغاء هدف بداعي التسلل",
      "Goal Disallowed - Foul": "إلغاء هدف بداعي خطأ",
      "Goal Disallowed - Handball": "إلغاء هدف بداعي لمسة يد",
      "Penalty - Foul": "احتساب ركلة جزاء بعد مراجعة الفار",
      "Red card": "بطاقة حمراء بعد مراجعة الفار",
      "Red Card": "بطاقة حمراء بعد مراجعة الفار",
      "Card upgrade": "ترقية بطاقة بعد مراجعة الفار",
    };
    // لا نُسرّب التفصيل الإنجليزي الخام؛ غير المعروف يعود إلى العبارة العامة المعرّبة.
    return { type: "var", label: varDetail[detail] ?? "مراجعة الفار" };
  }
  return { type: t, label: detail || type };
}

/**
 * تعريب أسماء أبرز النجوم (الأسماء غير المدرجة تبقى كما يرسلها المزود).
 * المفتاح بالصيغة التي يرسلها المزود في قوائم الهدافين: "L. Messi".
 */
export const WC_PLAYER_AR: Record<string, string> = {
  "L. Messi": "ليونيل ميسي",
  "Lionel Messi": "ليونيل ميسي",
  "K. Mbappé": "كيليان مبابي",
  "Kylian Mbappé": "كيليان مبابي",
  "Cristiano Ronaldo": "كريستيانو رونالدو",
  "E. Haaland": "إيرلينغ هالاند",
  "Erling Haaland": "إيرلينغ هالاند",
  "H. Kane": "هاري كين",
  "Harry Kane": "هاري كين",
  "Vinícius Júnior": "فينيسيوس جونيور",
  "Vinicius Junior": "فينيسيوس جونيور",
  "J. Bellingham": "جود بيلينغهام",
  "Jude Bellingham": "جود بيلينغهام",
  "Lamine Yamal": "لامين يامال",
  "Rodrygo": "رودريغو",
  "Neymar": "نيمار",
  "M. Salah": "محمد صلاح",
  "Mohamed Salah": "محمد صلاح",
  "H. Hassan": "هيثم حسن",
  "Haythem Hassan": "هيثم حسن",
  "Haitham Hassan": "هيثم حسن",
  "Haisam Hassan": "هيثم حسن",
  "A. Hakimi": "أشرف حكيمي",
  "Achraf Hakimi": "أشرف حكيمي",
  "B. Diaz": "إبراهيم دياز",
  "Brahim Díaz": "إبراهيم دياز",
  "S. Al-Dawsari": "سالم الدوسري",
  "Salem Al-Dawsari": "سالم الدوسري",
  "F. Al-Buraikan": "فراس البريكان",
  "Firas Al-Buraikan": "فراس البريكان",
  "S. Al-Shehri": "صالح الشهري",
  "A. Radif": "عبدالله رديف",
  // قائمة الأخضر في المونديال — بالصيغ الكاملة التي يرسلها المزود في players/squads
  "Nawaf Al Aqidi": "نواف العقيدي",
  "Ahmed Al Kassar": "أحمد الكسار",
  "Mohammed Al Owais": "محمد العويس",
  "Saud Abdulhamid": "سعود عبدالحميد",
  "Mohammed Abu Al Shamat": "محمد أبو الشامات",
  "Waheb Saleh": "صالح أبو الشامات",
  "Saleh Abu Al Shamat": "صالح أبو الشامات",
  "Nawaf Boushal": "نواف بوشل",
  "Abdulelah Al Amri": "عبدالإله العمري",
  "Moteb Al Harbi": "متعب الحربي",
  "Hassan Kadesh": "حسن كادش",
  "Ali Lajami": "علي لاجامي",
  "Ali Majrashi": "علي مجرشي",
  "Hassan Tambakti": "حسان تمبكتي",
  "J. Thakri": "جلال ذكري",
  "Nasser Al Dawsari": "ناصر الدوسري",
  "Mohamed Kanno": "محمد كنو",
  "Ziyad Al Johani": "زياد الجهني",
  "Musab Al Juwayr": "مصعب الجوير",
  "Abdullah Al Khaibari": "عبدالله الخيبري",
  "Ala Al Haji": "علاء الحجي",
  "Khalid Al Ghannam": "خالد الغنام",
  "Sultan Mandash": "سلطان مندش",
  "Ayman Yahya": "أيمن يحيى",
  "Feras Al Brikan": "فراس البريكان",
  "Abdullah Al Hamdan": "عبدالله الحمدان",
  "Saleh Al Shehri": "صالح الشهري",
  "Salem Al Dawsari": "سالم الدوسري",
  "M. Kudus": "محمد قدوس",
  "V. Osimhen": "فيكتور أوسيمين",
  "S. Mané": "ساديو ماني",
  "Sadio Mané": "ساديو ماني",
  "K. De Bruyne": "كيفين دي بروين",
  "Kevin De Bruyne": "كيفين دي بروين",
  "F. Wirtz": "فلوريان فيرتز",
  "Florian Wirtz": "فلوريان فيرتز",
  "J. Musiala": "جمال موسيالا",
  "Jamal Musiala": "جمال موسيالا",
  "L. Martínez": "لاوتارو مارتينيز",
  "Lautaro Martínez": "لاوتارو مارتينيز",
  "J. Álvarez": "جوليان ألفاريز",
  "Julián Álvarez": "جوليان ألفاريز",
  "F. Valverde": "فيدريكو فالفيردي",
  "Federico Valverde": "فيدريكو فالفيردي",
  "D. Núñez": "داروين نونيز",
  "Darwin Núñez": "داروين نونيز",
  "Son Heung-Min": "سون هيونغ مين",
  "H. Son": "سون هيونغ مين",
  "T. Kubo": "تاكيفوسا كوبو",
  "K. Mitoma": "كاورو ميتوما",
  "C. Pulisic": "كريستيان بوليسيتش",
  "Christian Pulisic": "كريستيان بوليسيتش",
  "A. Davies": "ألفونسو ديفيز",
  "Alphonso Davies": "ألفونسو ديفيز",
  "J. David": "جوناثان ديفيد",
  "Jonathan David": "جوناثان ديفيد",
  "Pedri": "بيدري",
  "Gavi": "غافي",
  "N. Williams": "نيكو ويليامز",
  "Nico Williams": "نيكو ويليامز",
  "Á. Morata": "ألفارو موراتا",
  "Álvaro Morata": "ألفارو موراتا",
  "R. Lewandowski": "روبرت ليفاندوفسكي",
  "B. Saka": "بوكايو ساكا",
  "Bukayo Saka": "بوكايو ساكا",
  "P. Foden": "فيل فودين",
  "Phil Foden": "فيل فودين",
  "L. Modrić": "لوكا مودريتش",
  "Luka Modrić": "لوكا مودريتش",
  "M. Ødegaard": "مارتن أوديغارد",
  "Martin Ødegaard": "مارتن أوديغارد",
  "V. Gyökeres": "فيكتور غيوكيريش",
  "Viktor Gyökeres": "فيكتور غيوكيريش",
  "A. Isak": "ألكسندر إيساك",
  "Alexander Isak": "ألكسندر إيساك",
  "M. Depay": "ممفيس ديباي",
  "Memphis Depay": "ممفيس ديباي",
  "C. Gakpo": "كودي خاكبو",
  "Cody Gakpo": "كودي خاكبو",
  "H. Aktürkoğlu": "كرم أكتوركوغلو",
  "Kerem Aktürkoğlu": "كرم أكتوركوغلو",
  "A. Güler": "أردا غولر",
  "Arda Güler": "أردا غولر",
  "M. Taremi": "مهدي طارمي",
  "Mehdi Taremi": "مهدي طارمي",
  "A. Hussein": "أيمن حسين",
  "Aymen Hussein": "أيمن حسين",
  "M. Al-Naimat": "علي علوان",
  "Y. Burhan": "يزن النعيمات",
  "Akram Afif": "أكرم عفيف",
  "A. Afif": "أكرم عفيف",
  "Almoez Ali": "المعز علي",
  "A. Ali": "المعز علي",

  // أندية الدوري السعودي — تظهر في مسيرة اللاعبين (بطاقة اللاعب)، والقاموس
  // الثابت يتقدم على الـAI فيصحح أخطاء نقلها الصوتي (مثل Al Taee ≠ التعاون)
  "Al-Nassr": "النصر",
  "Al Nassr": "النصر",
  "Al-Hilal": "الهلال",
  "Al Hilal": "الهلال",
  "Al-Ittihad": "الاتحاد",
  "Al Ittihad": "الاتحاد",
  "Al-Ahli": "الأهلي",
  "Al Ahli": "الأهلي",
  "Al-Shabab": "الشباب",
  "Al Shabab": "الشباب",
  "Al-Ettifaq": "الاتفاق",
  "Al Ettifaq": "الاتفاق",
  "Al-Fateh": "الفتح",
  "Al Fateh": "الفتح",
  "Al-Taawoun": "التعاون",
  "Al Taawoun": "التعاون",
  "Al Taee": "الطائي",
  "Al-Taee": "الطائي",
  "Al-Fayha": "الفيحاء",
  "Al Fayha": "الفيحاء",
  "Al-Raed": "الرائد",
  "Al Raed": "الرائد",
  "Al-Khaleej": "الخليج",
  "Al Khaleej": "الخليج",
  "Al-Wehda": "الوحدة",
  "Al Wehda Club": "الوحدة",
  "Al-Riyadh": "الرياض",
  "Al Riyadh": "الرياض",
  "Al-Okhdood": "الأخدود",
  "Al Okhdood": "الأخدود",
  "Al-Qadsiah": "القادسية",
  "Al Qadisiyah": "القادسية",
  Damac: "ضمك",
  "Damac FC": "ضمك",
  "Al-Kholood": "الخلود",
  "Al Kholood": "الخلود",
  "Neom SC": "نيوم",
  NEOM: "نيوم",
  "Al-Hazem": "الحزم",
  "Al Hazem": "الحزم",
  "Al-Najma": "النجمة",
  "Al Najma": "النجمة",
  "Abha Club": "أبها",
  Abha: "أبها",
  "Al-Batin": "الباطن",
  "Al Batin": "الباطن",
};

export function localizePlayerName(name: string | null | undefined): string {
  if (!name) return "";
  return WC_PLAYER_AR[name] ?? name;
}

export function localizeTeamName(id: number | null | undefined, fallback: string): string {
  if (id != null && WC_TEAM_AR[id]) return WC_TEAM_AR[id];
  return fallback;
}

export function localizeVenue(name: string | null | undefined, city: string | null | undefined): {
  name: string;
  city: string;
} {
  const mapped = name ? WC_VENUE_AR[name] : undefined;
  return { name: mapped?.name ?? name ?? "", city: mapped?.city ?? city ?? "" };
}
