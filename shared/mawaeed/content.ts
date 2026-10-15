/**
 * نصوص الصفحة والأسئلة الشائعة.
 * أجوبة «يُستكمل» تبقى في الصفحة وتُستبعد من FAQPage.
 */

export type FaqItem = { question: string; answer: string; inSchema: boolean };

export type FaqCard = {
  title: string;
  dateLine: string;
  countdownText: string;
  sourceTitle: string;
  isPast: boolean;
};

export type FaqSeries = {
  slug: string;
  next: FaqCard | null;
  following: FaqCard | null;
  upcoming: FaqCard[];
};

export const METHODOLOGY = [
  "نأخذ كل موعد من صفحة الجهة أو حسابها الرسمي، ونذكر الرابط تحت البطاقة. التغطيات الإعلامية لا تكفي وحدها لنشر تاريخ.",
  "التاريخ الميلادي هو ما كتبه المحرر من الوثيقة. التاريخ الهجري يُحسب بتقويم أم القرى بتوقيت السعودية، وإذا طبعت الجهة صيغة مختلفة تُعرض كما هي.",
  "شارة «مؤكد» تعني أن الجهة نشرت هذا اليوم نصًا. شارة «متوقع» تعني أن التاريخ محسوب من قاعدة الجهة المعتادة ولم يصدر إعلان هذه الدفعة بعد. ما زال «يحتاج تحقق» لا يُعرض حتى يؤكده محرر ويربطه بمصدر.",
  "بعد مرور اليوم تظهر كلمة «صُرفت» على مواعيد الرواتب والإيداع والمعاشات، و«انتهت» على الإجازة، ويبدأ العدّاد على الموعد التالي. العدّاد يتغير كل يوم، وتاريخ تعديل الصفحة لا يتغير إلا إذا تغيّر موعد أو مصدر أو حالة.",
].join(" ");

function cardLine(card: FaqCard | null, empty: string): string {
  if (!card || card.isPast) return empty;
  return `${card.title}: ${card.dateLine}، ${card.countdownText}. المصدر: ${card.sourceTitle}.`;
}

function listUpcoming(cards: FaqCard[]): string {
  const upcoming = cards.filter((card) => !card.isPast);
  if (upcoming.length === 0) return "لا توجد مواعيد قادمة معلنة في هذا القسم.";
  return upcoming.map((card) => `${card.title} (${card.dateLine})`).join("، ");
}

export function buildFaq(slug: string, series: FaqSeries | null, updatedLabel: string): FaqItem[] {
  if (!series) return [];
  if (slug === "school-calendar-1448") return schoolFaq(series, updatedLabel);
  if (slug === "citizen-account") return citizenFaq(series);
  if (slug === "salaries") return salaryFaq(series);
  if (slug === "social-security") return socialFaq(series);
  if (slug === "pensions") return pensionFaq(series);
  return [];
}

function schoolFaq(series: FaqSeries, updatedLabel: string): FaqItem[] {
  const next = series.next;
  const follow = series.following;
  const nearest = next
    ? `أقرب إجازة معلنة: ${next.title}، ${next.dateLine}، ${next.countdownText}.${follow ? ` تليها ${follow.title}، ${follow.dateLine}.` : ""} آخر تحديث ${updatedLabel}.`
    : "لا توجد إجازة قادمة معلنة حاليًا.";
  const extras = series.upcoming.filter((card) => card.title.includes("إضافية") && !card.isPast);
  const extraAnswer = extras.length
    ? `الإجازات الإضافية المعلنة للرياض والقصيم ومعظم المناطق: ${extras.map((card) => card.dateLine).join("، ")}. كل إدارة تعليم تعلن إجازات منطقتها. مواعيد مكة المكرمة والمدينة المنورة وجدة والطائف لا تُعرض هنا إلا بعد تأكيدها من مصدر الإدارة.`
    : "لم تُنشر بعد إجازات إضافية مؤكدة لهذه المنطقة.";
  return [
    { question: "متى أقرب إجازة للمدارس؟ وكم باقي؟", answer: nearest, inSchema: true },
    { question: "ما مواعيد الإجازات الإضافية للعام الدراسي 1448؟", answer: extraAnswer, inSchema: true },
    {
      question: "ما الإجازات المطوّلة في العام الدراسي 1448؟",
      answer:
        "في الرياض والقصيم ومعظم المناطق، إجازة 25 أكتوبر 2026 تمد العطلة من الجمعة 23 إلى الأحد 25 أكتوبر. إجازة 29 نوفمبر تلي إجازة الخريف مباشرة، وإجازة 7 يناير تسبق إجازة منتصف العام بيوم. إجازة 11 أبريل تمد العطلة من الجمعة 9 إلى الأحد 11 أبريل.",
      inSchema: true,
    },
    {
      question: "متى إجازة الخريف 1448؟",
      answer: findNamed(series, "الخريف", "تبدأ إجازة الخريف حسب وزارة التعليم.") + " تاريخ النهاية والعودة يُستكمل من المصدر الرسمي، لأن بيانات الوزارة تنشر تاريخ البداية.",
      inSchema: false,
    },
    {
      question: "متى إجازة منتصف العام الدراسي؟",
      answer: findNamed(series, "منتصف العام", "تبدأ إجازة منتصف العام حسب وزارة التعليم.") + " تاريخ العودة يُستكمل من المصدر الرسمي.",
      inSchema: false,
    },
    {
      question: "متى إجازة يوم التأسيس وعيد الفطر وعيد الأضحى للمدارس؟",
      answer: `${findNamed(series, "التأسيس", "يوم التأسيس حسب وزارة التعليم.")} ${findNamed(series, "الفطر", "عيد الفطر حسب وزارة التعليم.")} ${findNamed(series, "الأضحى", "عيد الأضحى حسب وزارة التعليم.")} هذه تواريخ بداية، والعيد يثبت بالرؤية.`,
      inSchema: true,
    },
    {
      question: "متى تنتهي الدراسة؟",
      answer: findNamed(series, "نهاية العام", "تبدأ إجازة نهاية العام الدراسي 1448-1449هـ حسب وزارة التعليم."),
      inSchema: true,
    },
    {
      question: "متى عودة المدارس للعام الدراسي الجديد؟",
      answer: `${findNamed(series, "عودة المعلمين", "عودة المعلمين حسب وزارة التعليم.")} ${findNamed(series, "عودة الطلاب", "عودة الطلاب حسب وزارة التعليم.")}`,
      inSchema: true,
    },
    {
      question: "هل تقويم مكة والمدينة وجدة والطائف مختلف؟",
      answer:
        "الوزارة تمنح إدارات تعليم مكة المكرمة والمدينة المنورة والطائف وجدة صلاحيات تراعي مواسم الحج والعمرة. يمكن اختيار المنطقة أعلى الصفحة. مواعيدها الإضافية تُستكمل من المصدر الرسمي لكل إدارة، ولا نعرض تاريخًا لم يُؤكد.",
      inSchema: false,
    },
  ];
}

function citizenFaq(series: FaqSeries): FaqItem[] {
  return [
    {
      question: "متى موعد إيداع حساب المواطن للدفعة القادمة؟",
      answer: cardLine(series.next, "لا توجد دفعة قادمة معلنة.") + " يودع البرنامج الدعم عادة يوم 10 من الشهر الميلادي حسب سجل إيداعاته في 2026.",
      inSchema: Boolean(series.next),
    },
    {
      question: "ماذا لو وافق يوم 10 الجمعة أو السبت؟",
      answer:
        "لم نجد قاعدة منشورة نصًا. سجل البرنامج في 2026 يُظهر أن 10 أبريل و10 يوليو (جمعة) أُودعا الخميس 9، وأن 10 يناير (سبت) أُودع الأحد 11. يُعتمد إعلان البرنامج لكل دفعة.",
      inSchema: true,
    },
    {
      question: "في أي ساعة يبدأ الإيداع؟",
      answer:
        "يعلن الحساب الرسمي عادة عند منتصف الليل بتوقيت السعودية أن الإيداع بدأ ويستمر حتى نهاية اليوم.",
      inSchema: true,
    },
    {
      question: "كيف أعرف مبلغ استحقاقي؟",
      answer: "عبر البوابة الإلكترونية للبرنامج أو تطبيقه، كما يذكر الحساب الرسمي في إعلانات الإيداع.",
      inSchema: true,
    },
    {
      question: "ما رقم التواصل مع حساب المواطن؟",
      answer: "يُستكمل من المصدر الرسمي. تعذّر فتح ca.gov.sa عند التحقق في 27 سبتمبر 2026.",
      inSchema: false,
    },
    {
      question: "هل يتغير موعد الإيداع في رمضان أو العيد؟",
      answer:
        "دفعة مارس 2027 يوافق موعدها المعتاد 10 مارس، و2 شوال 1448 وفق أم القرى، أي داخل عطلة عيد الفطر المتوقعة. الموعد الفعلي يُستكمل من المصدر الرسمي، والعيد يثبت بالرؤية.",
      inSchema: false,
    },
    {
      question: "هل الدعم يشمل الدعم الإضافي؟",
      answer: "إعلانات إيداع 2026 الرسمية تقول إن الدعم المخصص للشهر يشمل الدعم الإضافي. أي تغيير لاحق يُستكمل من المصدر الرسمي.",
      inSchema: false,
    },
    {
      question: "ما الدفعات القادمة المحسوبة؟",
      answer: listUpcoming(series.upcoming),
      inSchema: true,
    },
  ];
}

function salaryFaq(series: FaqSeries): FaqItem[] {
  return [
    {
      question: "متى تنزل رواتب موظفي الدولة هذا الشهر؟",
      answer: cardLine(series.next, "لا يوجد راتب قادم معلن.") + " يشمل الموعد موظفي الدولة المدنيين والعسكريين.",
      inSchema: Boolean(series.next),
    },
    {
      question: "هل الرواتب بالتقويم الهجري أم الميلادي؟",
      answer: "بالميلادي. جدول وزارة المالية مرتب بالأشهر الميلادية، والصرف يوم 27.",
      inSchema: true,
    },
    {
      question: "ماذا لو وافق يوم 27 الجمعة أو السبت؟",
      answer: "حسب وزارة المالية، يُصرف الخميس الذي قبله إن وافق الجمعة، والأحد الذي بعده إن وافق السبت.",
      inSchema: true,
    },
    {
      question: "هل تُقدَّم الرواتب قبل العيد؟",
      answer: "حدث ذلك في جدول 2026، فقد صُرف راتب مايو الأحد 24 مايو 2026. أي تقديم في 2027 يُستكمل من المصدر الرسمي عند نشر جدول 2027.",
      inSchema: false,
    },
    {
      question: "هل يشمل الموعد العسكريين والقطاع الخاص والمتقاعدين؟",
      answer:
        "جدول وزارة المالية هنا يخص رواتب موظفي الدولة المدنيين والعسكريين. لا يشمل القطاع الخاص. معاشات المتقاعدين المدنيين والعسكريين في قسم التقاعد.",
      inSchema: true,
    },
    {
      question: "ما مواعيد الرواتب القادمة؟",
      answer: listUpcoming(series.upcoming),
      inSchema: true,
    },
  ];
}

function socialFaq(series: FaqSeries): FaqItem[] {
  return [
    {
      question: "متى ينزل الضمان الاجتماعي المطوّر؟",
      answer: cardLine(series.next, "لا يوجد صرف قادم معلن.") + " القاعدة المنشورة: اليوم الأول من كل شهر ميلادي للمستحقين.",
      inSchema: Boolean(series.next),
    },
    {
      question: "متى تُعلن نتائج أهلية الضمان؟",
      answer: "يوم 27 من كل شهر ميلادي، حسب وزارة الموارد البشرية.",
      inSchema: true,
    },
    {
      question: "ماذا لو وافق اليوم الأول عطلة؟",
      answer: "لم نجد قاعدة رسمية معلنة لإزاحة العطلة. إن وافق اليوم الأول جمعة أو سبتًا يبقى الموعد بانتظار إعلان الوزارة ولا يُعرض عدّاد ليوم غير مؤكد.",
      inSchema: true,
    },
    {
      question: "هل يؤثر حساب المواطن على معاش الضمان؟",
      answer:
        "حسب حساب العناية بالمستفيدين (@HRSD_Care)، يُستثنى من الدخل حساب المواطن، والإعانة المالية في التأهيل الشامل، والمكافأة الجامعية التي لا تتجاوز 1000 ريال.",
      inSchema: true,
    },
    {
      question: "متى تُصرف الحقيبة المدرسية لمستفيدي الضمان؟",
      answer: "مرة واحدة في بداية كل فصل دراسي، تلقائيًا، للطلاب من 6 إلى 18 سنة، حسب @HRSD_Care.",
      inSchema: true,
    },
    {
      question: "متى يبدأ صرف المعاش للمستفيد الجديد؟",
      answer: "يُستكمل من المصدر الرسمي على موقع وزارة الموارد البشرية.",
      inSchema: false,
    },
  ];
}

function pensionFaq(series: FaqSeries): FaqItem[] {
  return [
    {
      question: "متى تنزل رواتب المتقاعدين؟",
      answer: cardLine(series.next, "لا يوجد صرف قادم معلن في الجدول المنشور."),
      inSchema: Boolean(series.next),
    },
    {
      question: "ما مواعيد صرف المعاشات المنشورة؟",
      answer: listUpcoming(series.upcoming),
      inSchema: true,
    },
    {
      question: "هل يشمل الموعد المتقاعدين المدنيين والعسكريين؟",
      answer: "نعم. الجدول الرسمي لعملاء نظامَي التقاعد المدني والعسكري والتأمينات الاجتماعية.",
      inSchema: true,
    },
    {
      question: "ماذا لو وافق الأول من الشهر عطلة؟",
      answer: "لا قاعدة مكتوبة وجدناها. في جدول 2026 قُدّم معاش أغسطس إلى الخميس 30 يوليو لأن 1 أغسطس وافق السبت.",
      inSchema: true,
    },
    {
      question: "متى معاش يناير 2027؟",
      answer: "يُستكمل من المصدر الرسمي. يوافق 1 يناير 2027 الجمعة، ولم يُنشر جدول 2027، لذلك لا نعرض هذا اليوم للعموم حتى تؤكده التأمينات.",
      inSchema: false,
    },
  ];
}

function findNamed(series: FaqSeries, needle: string, fallback: string): string {
  const card = series.upcoming.find((item) => item.title.includes(needle)) ?? null;
  if (!card) return fallback;
  return `${card.title}: ${card.dateLine}.`;
}
