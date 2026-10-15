/**
 * بيانات تجريبية لمعاينة إعادة تصميم صفحة إدارة المقالات.
 *
 * الغرض: إظهار التصميم والتفاعل فقط — لا تُقرأ ولا تُكتب في قاعدة البيانات.
 * كل الإجراءات في الصفحة تُعدّل هذه النسخة المحلية في الذاكرة وحدها.
 */

export type DemoStatus = "published" | "scheduled" | "draft" | "archived";
export type DemoArticleType =
  | "news"
  | "opinion"
  | "analysis"
  | "column"
  | "weekly_photos"
  | "infographic";
export type DemoSource = "manual" | "email" | "whatsapp" | "ios-app" | "android-app";
export type DemoReviewStatus = "pending_review" | "needs_changes" | null;

export interface DemoAuthor {
  id: string;
  name: string;
  initials: string;
}

export interface DemoCategory {
  id: string;
  name: string;
  color: string;
}

export interface DemoArticle {
  id: string;
  title: string;
  excerpt: string;
  status: DemoStatus;
  reviewStatus: DemoReviewStatus;
  reviewedAt: string | null;
  reviewNotes: string | null;
  articleType: DemoArticleType;
  newsType: "regular" | "breaking";
  isFeatured: boolean;
  isReading: boolean;
  views: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  source: DemoSource;
  author: DemoAuthor | null;
  category: DemoCategory;
  tags: string[];
  isAiGeneratedThumbnail: boolean;
  aiBullets: string[];
  wordCount: number;
  readingTime: number;
}

export const CATEGORIES: Record<string, DemoCategory> = {
  politics: { id: "politics", name: "سياسة", color: "#2563eb" },
  economy: { id: "economy", name: "اقتصاد", color: "#059669" },
  sports: { id: "sports", name: "رياضة", color: "#16a34a" },
  local: { id: "local", name: "محليات", color: "#0891b2" },
  tech: { id: "tech", name: "تقنية", color: "#7c3aed" },
  culture: { id: "culture", name: "ثقافة", color: "#db2777" },
  health: { id: "health", name: "صحة", color: "#0d9488" },
  opinion: { id: "opinion", name: "رأي", color: "#d97706" },
};

export const AUTHORS: Record<string, DemoAuthor> = {
  faisal: { id: "u-faisal", name: "فيصل الحربي", initials: "فح" },
  noura: { id: "u-noura", name: "نورة القحطاني", initials: "نق" },
  mohammed: { id: "u-mohammed", name: "محمد العتيبي", initials: "مع" },
  sara: { id: "u-sara", name: "سارة الدوسري", initials: "سد" },
  abdullah: { id: "u-abdullah", name: "عبدالله الشمري", initials: "عش" },
  reem: { id: "u-reem", name: "ريم الزهراني", initials: "رز" },
  khalid: { id: "u-khalid", name: "خالد البقمي", initials: "خب" },
  lama: { id: "u-lama", name: "لمى السبيعي", initials: "لس" },
};

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const fromNow = (hours: number) => new Date(NOW + hours * HOUR).toISOString();

interface Seed {
  id: string;
  title: string;
  excerpt: string;
  status: DemoStatus;
  type: DemoArticleType;
  category: keyof typeof CATEGORIES;
  author: keyof typeof AUTHORS | null;
  tags: string[];
  bullets: string[];
  words: number;
  createdH: number;
  updatedH: number;
  newsType?: "regular" | "breaking";
  source?: DemoSource;
  views?: number;
  featured?: boolean;
  reading?: boolean;
  ai?: boolean;
  publishedH?: number;
  scheduledH?: number;
  reviewStatus?: DemoReviewStatus;
  reviewedH?: number;
  reviewNotes?: string;
}

const SEEDS: Seed[] = [
  // ---------- منشور ----------
  {
    id: "a-1001",
    title: "عاجل: الدفاع المدني يعلن السيطرة على حريق مستودع شرق الرياض",
    excerpt:
      "أعلنت مديرية الدفاع المدني بالرياض السيطرة على حريق اندلع في مستودع للمواد القابلة للاشتعال، دون تسجيل إصابات.",
    status: "published",
    type: "news",
    category: "local",
    author: "mohammed",
    tags: ["الرياض", "الدفاع المدني", "حوادث"],
    bullets: [
      "السيطرة على الحريق دون إصابات بشرية",
      "إخلاء المنشآت المجاورة احترازياً",
      "فتح تحقيق لمعرفة الأسباب",
    ],
    words: 420,
    createdH: -6,
    updatedH: -2,
    publishedH: -2,
    newsType: "breaking",
    views: 48210,
    featured: true,
  },
  {
    id: "a-1002",
    title: "النفط يتجاوز 92 دولاراً بعد قرار أوبك+ بخفض الإنتاج",
    excerpt:
      "ارتفعت أسعار خام برنت إلى أعلى مستوى لها في ثلاثة أشهر عقب إعلان التحالف تمديد التخفيضات الطوعية.",
    status: "published",
    type: "news",
    category: "economy",
    author: "noura",
    tags: ["النفط", "أوبك", "أسواق"],
    bullets: [
      "برنت يتجاوز 92 دولاراً للبرميل",
      "تمديد التخفيضات حتى نهاية الربع",
      "توقعات بضغط على أسعار الوقود محلياً",
    ],
    words: 510,
    createdH: -8,
    updatedH: -5,
    publishedH: -5,
    views: 23140,
  },
  {
    id: "a-1003",
    title: "الأخضر يبلغ نهائي كأس الخليج بعد الفوز على عمان",
    excerpt:
      "حجز المنتخب السعودي مقعده في نهائي كأس الخليج إثر فوزه على نظيره العماني بهدفين مقابل هدف في مباراة مثيرة.",
    status: "published",
    type: "news",
    category: "sports",
    author: "khalid",
    tags: ["الأخضر", "كأس الخليج", "منتخب"],
    bullets: [
      "هدف قاتل في الدقيقة 88 يمنح التأهل",
      "الجماهير تكتسح مدرجات الملعب",
      "الموعد مع النهائي يوم الجمعة",
    ],
    words: 380,
    createdH: -12,
    updatedH: -7,
    publishedH: -7,
    newsType: "breaking",
    views: 68900,
    featured: true,
  },
  {
    id: "a-1004",
    title: "وزارة التعليم تعلن مواعيد الاختبارات النهائية للفصل الدراسي الأول",
    excerpt:
      "حددت الوزارة الأسبوع الأول من الشهر المقبل موعداً لانطلاق الاختبارات في جميع المراحل، مع إتاحة الجدولة عبر منصة مدرستي.",
    status: "published",
    type: "news",
    category: "local",
    author: "sara",
    tags: ["التعليم", "الاختبارات", "مدرستي"],
    bullets: [
      "الاختبارات تبدأ الأسبوع الأول من الشهر المقبل",
      "جداول موحدة عبر منصة مدرستي",
      "تخصيص خط دعم للاستفسارات",
    ],
    words: 300,
    createdH: -14,
    updatedH: -9,
    publishedH: -9,
    views: 15420,
  },
  {
    id: "a-1005",
    title: "البنك المركزي يرفع سعر الفائدة 25 نقطة أساس",
    excerpt:
      "قرر البنك المركزي السعودي رفع معدل إعادة الشراء، تماشياً مع قرار مجلس الاحتياطي الفيدرالي الأميركي.",
    status: "published",
    type: "news",
    category: "economy",
    author: "faisal",
    tags: ["البنك المركزي", "الفائدة", "التمويل"],
    bullets: [
      "رفع سعر إعادة الشراء 25 نقطة أساس",
      "تأثير محدود على القروض الاستهلاكية",
      "ترقب لقرارات البنوك التجارية",
    ],
    words: 360,
    createdH: -20,
    updatedH: -15,
    publishedH: -15,
    views: 9870,
  },
  {
    id: "a-1006",
    title: "أرامكو تعلن اكتشاف حقل غاز جديد في الربع الخالي",
    excerpt:
      "أعلنت الشركة عن اكتشاف حقل غاز غير تقليدي باحتياطيات مبدئية كبيرة، ضمن خططها لتوسيع إنتاج الغاز.",
    status: "published",
    type: "analysis",
    category: "economy",
    author: "abdullah",
    tags: ["أرامكو", "الغاز", "الطاقة"],
    bullets: [
      "اكتشاف غاز غير تقليدي بحجم واعد",
      "يدعم هدف مضاعفة إنتاج الغاز",
      "التقييم الكامل خلال العام المقبل",
    ],
    words: 640,
    createdH: -30,
    updatedH: -26,
    publishedH: -26,
    views: 33210,
    featured: true,
  },
  {
    id: "a-1007",
    title: "اكتمال المرحلة الأولى من مشروع القدية الترفيهي",
    excerpt:
      "أعلنت الشركة المطوّرة عن تسليم المرحلة الأولى من الوجهة الترفيهية، وسط توقعات بجذب ملايين الزوار سنوياً.",
    status: "published",
    type: "weekly_photos",
    category: "culture",
    author: "reem",
    tags: ["القدية", "الترفيه", "مشاريع"],
    bullets: [
      "تسليم المرحلة الأولى من المشروع",
      "طاقة استيعابية لملايين الزوار",
      "افتتاح تجريبي خلال أسابيع",
    ],
    words: 280,
    createdH: -28,
    updatedH: -24,
    publishedH: -24,
    views: 12300,
  },
  {
    id: "a-1008",
    title: "الاتحاد يكشف عن صفقة جديدة بقيمة 30 مليون يورو",
    excerpt:
      "أنهى نادي الاتحاد إجراءات التعاقد مع لاعب دولي، في صفقة تُعد الأغلى في تاريخ النادي هذا الموسم.",
    status: "published",
    type: "news",
    category: "sports",
    author: "khalid",
    tags: ["الاتحاد", "انتقالات", "دوري روشن"],
    bullets: [
      "صفقة بقيمة 30 مليون يورو",
      "اللاعب يصل خلال 48 ساعة",
      "تدعيم لخط الهجوم قبل الميركاتو الشتوي",
    ],
    words: 340,
    createdH: -34,
    updatedH: -30,
    publishedH: -30,
    views: 45200,
  },
  {
    id: "a-1009",
    title: "دراسة: 40% من الشباب السعودي يفضلون الشراء عبر التطبيقات",
    excerpt:
      "كشفت دراسة حديثة عن تحوّل واضح في سلوك التسوق نحو المنصات الرقمية، مع تصاعد ثقة المستهلك في الدفع الإلكتروني.",
    status: "published",
    type: "analysis",
    category: "tech",
    author: "lama",
    tags: ["تجارة إلكترونية", "سلوك المستهلك", "تقنية"],
    bullets: [
      "40% يفضلون التسوق عبر التطبيقات",
      "نمو الدفع الإلكتروني 18% سنوياً",
      "المنافسة تنتقل إلى تجربة ما بعد الشراء",
    ],
    words: 720,
    createdH: -40,
    updatedH: -36,
    publishedH: -36,
    views: 8420,
  },
  {
    id: "a-1010",
    title: "الصحة تكشف عن حملة تطعيم وطنية ضد الإنفلونزا",
    excerpt:
      "أعلنت وزارة الصحة انطلاق حملة مجانية للتطعيم ضد الإنفلونزا الموسمية في مراكز الرعاية الأولية.",
    status: "published",
    type: "news",
    category: "health",
    author: "sara",
    tags: ["الصحة", "التطعيم", "الإنفلونزا"],
    bullets: [
      "التطعيم مجاني في جميع المراكز",
      "الفئات الأكثر عرضة للخطر أولاً",
      "الحملة تستمر حتى نهاية الموسم",
    ],
    words: 260,
    createdH: -44,
    updatedH: -42,
    publishedH: -42,
    views: 6710,
  },
  {
    id: "a-1011",
    title: "ولي العهد يبحث تعزيز العلاقات مع قادة آسيا الوسطى",
    excerpt:
      "تناولت المباحثات سبل تطوير التعاون الاقتصادي والاستثماري في قطاعات الطاقة والبنية التحتية.",
    status: "published",
    type: "news",
    category: "politics",
    author: "faisal",
    tags: ["دبلوماسية", "آسيا الوسطى", "استثمار"],
    bullets: [
      "تعزيز الشراكات الاقتصادية",
      "اتفاقيات في الطاقة والبنية التحتية",
      "خارطة طريق للتعاون حتى 2030",
    ],
    words: 480,
    createdH: -50,
    updatedH: -48,
    publishedH: -48,
    views: 27800,
  },
  {
    id: "a-1012",
    title: "الاقتصاد الرقمي وتحديات الثقة",
    excerpt: "التحول الرقمي منح الاقتصاد سرعة وجمهوراً، لكنه فتح أسئلة جديدة عن الثقة وحماية البيانات.",
    status: "published",
    type: "opinion",
    category: "opinion",
    author: "noura",
    tags: ["رأي", "اقتصاد رقمي", "ثقة"],
    bullets: [
      "الثقة أصل اقتصادي لا يقل عن رأس المال",
      "التنظيم المرن يجذب الاستثمار",
      "حماية البيانات شرط للنمو المستدام",
    ],
    words: 900,
    createdH: -56,
    updatedH: -52,
    publishedH: -52,
    views: 3120,
  },
  {
    id: "a-1013",
    title: "ماذا يعني انضمام السعودية إلى بريكس اقتصادياً؟",
    excerpt:
      "تحليل لتداعيات الانضمام على التجارة والأسواق المالية، وما تقدمه العضوية من فرص في التمويل والطاقة.",
    status: "published",
    type: "analysis",
    category: "economy",
    author: "abdullah",
    tags: ["بريكس", "تجارة", "تحليل"],
    bullets: [
      "تنويع الشراكات التجارية",
      "أدوات تمويل بديلة للمشاريع الكبرى",
      "انعكاسات على أسواق العملات",
    ],
    words: 810,
    createdH: -60,
    updatedH: -58,
    publishedH: -58,
    views: 18760,
  },
  {
    id: "a-1014",
    title: "إنفوجرافيك: 8 أرقام تلخص ميزانية 2026",
    excerpt: "قراءة بصرية سريعة لأبرز مؤشرات الميزانية العامة: الإيرادات، المصروفات، والعجز المتوقع.",
    status: "published",
    type: "infographic",
    category: "economy",
    author: "reem",
    tags: ["ميزانية", "إنفوجرافيك", "أرقام"],
    bullets: [
      "نمو الإيرادات غير النفطية 12%",
      "الإنفاق الرأسمالي في الصدارة",
      "العجز ضمن النطاق المستهدف",
    ],
    words: 180,
    createdH: -66,
    updatedH: -64,
    publishedH: -64,
    views: 21050,
  },
  {
    id: "a-1015",
    title: "صور: كسوة الكعبة.. رحلة خطوط الذهب",
    excerpt: "تقرير مصوّر يوثّق مراحل تجهيز كسوة الكعبة المشرفة ومراحل خياطتها وتطريزها بأيدي حرفيين مهرة.",
    status: "published",
    type: "weekly_photos",
    category: "culture",
    author: "reem",
    tags: ["كسوة", "الحرم", "صور"],
    bullets: [
      "مراحل دقيقة لتجهيز الكسوة",
      "حرفيون يتوارثون الصنعة",
      "خطوط الذهب والفضة بأيدٍ سعودية",
    ],
    words: 220,
    createdH: -72,
    updatedH: -70,
    publishedH: -70,
    views: 39210,
  },
  {
    id: "a-1016",
    title: "التقنية المالية في السعودية تسجل نمواً بنسبة 24%",
    excerpt:
      "ارتفع عدد المنشآت المالية التقنية المرخّصة، مدفوعاً بالطلب على المدفوعات الرقمية وتمويل الشركات الناشئة.",
    status: "published",
    type: "news",
    category: "tech",
    author: "lama",
    tags: ["فينتك", "مدفوعات", "شركات ناشئة"],
    bullets: [
      "نمو 24% في عدد المنشآت",
      "المدفوعات الرقمية في المقدمة",
      "تمويل قياسي للشركات الناشئة",
    ],
    words: 400,
    createdH: -80,
    updatedH: -78,
    publishedH: -78,
    views: 11230,
    ai: true,
  },
  {
    id: "a-1017",
    title: "منتدى صحي: أنماط النوم تؤثر على المناعة",
    excerpt: "أوصى مختصون بأهمية انتظام النوم لجودة الحياة، محذرين من تأثير السهر على الصحة المناعية.",
    status: "published",
    type: "news",
    category: "health",
    author: "sara",
    tags: ["النوم", "المناعة", "صحة عامة"],
    bullets: [
      "7-9 ساعات يومياً للبالغين",
      "السهر يرفع خطر الالتهابات",
      "روتين ثابت أفضل من التعويض",
    ],
    words: 310,
    createdH: -90,
    updatedH: -88,
    publishedH: -88,
    views: 4230,
  },
  {
    id: "a-1018",
    title: "الشورى يناقش مشروع نظام المعاملات المدنية",
    excerpt: "استعرض المجلس مواد المشروع الذي ينظم العلاقات المدنية ويقلل النزاعات التجارية.",
    status: "published",
    type: "news",
    category: "politics",
    author: "faisal",
    tags: ["الشورى", "أنظمة", "معاملات"],
    bullets: [
      "تنظيم دقيق للمعاملات المدنية",
      "تقليل النزاعات وتعزيز الاستقرار",
      "مزيد من المراجعات قبل الإقرار",
    ],
    words: 350,
    createdH: -100,
    updatedH: -98,
    publishedH: -98,
    views: 7620,
  },
  {
    id: "a-1019",
    title: "مشروع نيوم يعلن عن أول مدينة سكنية ذكية",
    excerpt:
      "كشفت نيوم عن تصاميم أول مجتمع سكني متكامل الخدمات بتقنيات تشغيل ذاتي وأنظمة تنقل ذكية.",
    status: "published",
    type: "news",
    category: "economy",
    author: "abdullah",
    tags: ["نيوم", "مدن ذكية", "إسكان"],
    bullets: [
      "أول مجتمع سكني متكامل في نيوم",
      "أنظمة تشغيل ذاتية وتنقل ذكي",
      "تسليم المرحلة الأولى 2027",
    ],
    words: 460,
    createdH: -110,
    updatedH: -108,
    publishedH: -108,
    views: 51200,
    featured: true,
  },
  {
    id: "a-1020",
    title: "الشباب ورأس المال البشري في رؤية 2030",
    excerpt: "الاستثمار في المهارات ليس بنداً في الميزانية، بل هو المحرك الأول لأي تحول اقتصادي.",
    status: "published",
    type: "opinion",
    category: "opinion",
    author: "lama",
    tags: ["رأي", "رؤية 2030", "شباب"],
    bullets: [
      "المهارات أولوية اقتصادية",
      "الشراكة بين القطاعين ضرورة",
      "قياس الأثر لا عدد البرامج",
    ],
    words: 850,
    createdH: -130,
    updatedH: -128,
    publishedH: -128,
    views: 2980,
  },

  // ---------- مجدول ----------
  {
    id: "a-2001",
    title: "قرعة دوري أبطال آسيا تُجرى مساء اليوم",
    excerpt: "تتجه الأنظار إلى مقر الاتحاد الآسيوي حيث تُسحب قرعة دور المجموعات بمشاركة أندية سعودية.",
    status: "scheduled",
    type: "news",
    category: "sports",
    author: "khalid",
    tags: ["أبطال آسيا", "قرعة", "أندية"],
    bullets: [
      "سحب القرعة مساء اليوم",
      "مشاركة ثلاثة أندية سعودية",
      "ترقب لمواجهات قوية",
    ],
    words: 300,
    createdH: -5,
    updatedH: -3,
    scheduledH: 5,
  },
  {
    id: "a-2002",
    title: "منتدى الاستثمار السعودي ينطلق غداً في نسخته الثامنة",
    excerpt: "يجمع المنتدى نخبة من المستثمرين وصنّاع القرار لبحث الفرص في القطاعات الواعدة.",
    status: "scheduled",
    type: "news",
    category: "economy",
    author: "noura",
    tags: ["استثمار", "منتدى", "اقتصاد"],
    bullets: [
      "أكثر من 2000 مشارك",
      "جلسات عن التقنية والطاقة",
      "إعلان مبادرات استثمارية",
    ],
    words: 380,
    createdH: -30,
    updatedH: -4,
    scheduledH: 20,
    featured: true,
  },
  {
    id: "a-2003",
    title: "إعلان نتائج الربع الثالث لشركات التعدين",
    excerpt: "تترقب السوق إفصاحات شركات التعدين وسط ارتفاع أسعار المعادن عالمياً.",
    status: "scheduled",
    type: "analysis",
    category: "economy",
    author: "abdullah",
    tags: ["تعدين", "نتائج", "أسواق"],
    bullets: [
      "نتائج مدعومة بأسعار المعادن",
      "توسعات تشغيلية جديدة",
      "تحديث التوجيهات للربع القادم",
    ],
    words: 620,
    createdH: -40,
    updatedH: -20,
    scheduledH: 48,
  },
  {
    id: "a-2004",
    title: "مؤتمر الذكاء الاصطناعي يبدأ فعالياته الأسبوع المقبل",
    excerpt: "يستضيف المؤتمر متحدثين دوليين لبحث تطبيقات الذكاء الاصطناعي في القطاعات الحيوية.",
    status: "scheduled",
    type: "news",
    category: "tech",
    author: "lama",
    tags: ["ذكاء اصطناعي", "مؤتمر", "تقنية"],
    bullets: [
      "ورش عمل تطبيقية",
      "إطلاق منصة وطنية للذكاء الاصطناعي",
      "مشاركة أكثر من 30 متحدثاً",
    ],
    words: 340,
    createdH: -50,
    updatedH: -30,
    scheduledH: 96,
    ai: true,
  },
  {
    id: "a-2005",
    title: "موسم جدة يكشف عن برنامجه الكامل",
    excerpt: "حزمة فعاليات متنوعة تشمل حفلات ومناطق ترفيهية وأنشطة عائلية على مدار أشهر.",
    status: "scheduled",
    type: "weekly_photos",
    category: "culture",
    author: "reem",
    tags: ["موسم جدة", "ترفيه", "فعاليات"],
    bullets: [
      "برنامج يمتد لأشهر",
      "مناطق ترفيهية جديدة",
      "حفلات لنجوم عرب",
    ],
    words: 260,
    createdH: -60,
    updatedH: -40,
    scheduledH: 140,
  },

  // ---------- مسودات ----------
  {
    id: "a-3001",
    title: "تقرير خاص: مستقبل الطاقة المتجددة في المملكة",
    excerpt: "قراءة موسّعة في مشاريع الطاقة الشمسية وطاقة الرياح ومساهمتها في مزيج الطاقة.",
    status: "draft",
    type: "analysis",
    category: "economy",
    author: "abdullah",
    tags: ["طاقة متجددة", "استدامة", "تقرير"],
    bullets: [
      "حصة المتجددة تتجاوز المستهدف",
      "مشاريع بطاقة قياسية",
      "فرص توطين الصناعة",
    ],
    words: 700,
    createdH: -10,
    updatedH: -4,
  },
  {
    id: "a-3002",
    title: "الحوار الوطني حول تطوير التعليم يختتم أعماله",
    excerpt: "توصيات بضرورة ربط المناهج بمهارات سوق العمل وتعزيز التدريب المهني.",
    status: "draft",
    type: "news",
    category: "local",
    author: "sara",
    tags: ["تعليم", "حوار وطني", "تدريب"],
    bullets: [
      "ربط المناهج بسوق العمل",
      "تعزيز التدريب المهني",
      "متابعة تنفيذ التوصيات",
    ],
    words: 320,
    createdH: -28,
    updatedH: -1,
    reviewStatus: "pending_review",
  },
  {
    id: "a-3003",
    title: "تعليق: أزمة سلاسل الإمداد ودرس المرونة",
    excerpt: "ما تعلمته الأسواق من تعطل سلاسل الإمداد، وكيف نبني منظومة أكثر مرونة.",
    status: "draft",
    type: "opinion",
    category: "opinion",
    author: "noura",
    tags: ["رأي", "سلاسل إمداد", "اقتصاد"],
    bullets: [
      "المرونة أهم من الكفاءة وحدها",
      "تنويع الموردين ضرورة",
      "المخزون الاستراتيجي عاد للواجهة",
    ],
    words: 880,
    createdH: -34,
    updatedH: -3,
    reviewStatus: "pending_review",
    reviewedH: -20,
  },
  {
    id: "a-3004",
    title: "ملف: المدن الذكية بين الطموح والتنفيذ",
    excerpt: "استعراض لتجارب المدن الذكية ومقاربة الواقع بالطموح في المشاريع الكبرى.",
    status: "draft",
    type: "analysis",
    category: "tech",
    author: "lama",
    tags: ["مدن ذكية", "تحليل", "بنية تحتية"],
    bullets: [
      "البيانات أساس التشغيل الذكي",
      "التكامل بين الأنظمة تحدٍ رئيسي",
      "قياس الأثر على جودة الحياة",
    ],
    words: 760,
    createdH: -46,
    updatedH: -8,
    reviewStatus: "needs_changes",
    reviewedH: -6,
    reviewNotes: "يحتاج مصادر إضافية وأرقاماً محدّثة، وتوضيح الفرق بين الطموح والمنفّذ فعلياً.",
  },
  {
    id: "a-3005",
    title: "تحقيق ميداني: الأسواق الشعبية تعود للحياة",
    excerpt: "جولة ميدانية توثّق عودة الحركة إلى الأسواق الشعبية بعد تطويرها.",
    status: "draft",
    type: "weekly_photos",
    category: "culture",
    author: "reem",
    tags: ["أسواق", "تحقيق", "ثقافة"],
    bullets: [
      "حركة تجارية متصاعدة",
      "تطويرات في البنية والتنظيم",
      "شهادات التجّار والزوّار",
    ],
    words: 540,
    createdH: -70,
    updatedH: -52,
    reviewStatus: "needs_changes",
    reviewedH: -48,
    reviewNotes: "أضف شهادات مباشرة وصوراً من الميدان، ووثّق المصادر بالأسماء.",
  },
  {
    id: "a-3006",
    title: "تغطية بطولة الأندية العربية",
    excerpt: "مسودة تغطية شاملة لمشاركة الأندية العربية ونتائج الجولات الأولى.",
    status: "draft",
    type: "news",
    category: "sports",
    author: "khalid",
    tags: ["بطولة عربية", "تغطية", "رياضة"],
    bullets: [
      "نتائج الجولات الأولى",
      "أبرز اللاعبين",
      "المواعيد القادمة",
    ],
    words: 400,
    createdH: -130,
    updatedH: -120,
  },

  // ---------- مؤرشف ----------
  {
    id: "a-4001",
    title: "تفاصيل ميزانية 2025 بالأرقام",
    excerpt: "قراءة في أرقام ميزانية العام الماضي ومقارنتها بالتقديرات.",
    status: "archived",
    type: "news",
    category: "economy",
    author: "faisal",
    tags: ["ميزانية", "2025", "أرشيف"],
    bullets: ["أرقام الإيرادات", "بنود الإنفاق", "المقارنة السنوية"],
    words: 300,
    createdH: -900,
    updatedH: -860,
    publishedH: -870,
    reviewNotes: "تكرار المحتوى ومرور الفترة الزمنية على الأرقام.",
    views: 8900,
  },
  {
    id: "a-4002",
    title: "إعلان مؤجل: مهرجان الربيع",
    excerpt: "خبر قديم عن مهرجان أُلغيت تغطيته بقرار تحريري.",
    status: "archived",
    type: "news",
    category: "culture",
    author: "reem",
    tags: ["مهرجان", "أرشيف"],
    bullets: ["موعد الفعالية", "برنامج مبدئي"],
    words: 220,
    createdH: -1100,
    updatedH: -1050,
    publishedH: -1060,
    reviewNotes: "قرار تحريري بإلغاء التغطية ودمجها في ملف موسمي.",
    views: 3400,
  },
  {
    id: "a-4003",
    title: "عمود: كرة القدم لم تعد كما كانت",
    excerpt: "مقال رأي قديم أُرشف لعدم توافقه مع سياسة النشر.",
    status: "archived",
    type: "column",
    category: "opinion",
    author: "khalid",
    tags: ["رأي", "كرة قدم", "أرشيف"],
    bullets: ["تحولات اللعبة", "مقارنة الأجيال"],
    words: 820,
    createdH: -1400,
    updatedH: -1380,
    publishedH: -1385,
    reviewNotes: "لا يتوافق مع سياسة النشر التحريرية.",
    views: 1500,
  },
];

function buildArticle(seed: Seed): DemoArticle {
  const words = seed.words;
  const readingTime = Math.max(1, Math.round(words / 200));
  const author = seed.author ? AUTHORS[seed.author] : null;
  return {
    id: seed.id,
    title: seed.title,
    excerpt: seed.excerpt,
    status: seed.status,
    reviewStatus: seed.reviewStatus ?? null,
    reviewedAt: seed.reviewedH != null ? fromNow(seed.reviewedH) : null,
    reviewNotes: seed.reviewNotes ?? null,
    articleType: seed.type,
    newsType: seed.newsType ?? "regular",
    isFeatured: seed.featured ?? false,
    isReading: seed.reading ?? false,
    views: seed.views ?? 0,
    publishedAt: seed.status === "published" ? fromNow(seed.publishedH ?? seed.updatedH) : null,
    scheduledAt: seed.status === "scheduled" && seed.scheduledH != null ? fromNow(seed.scheduledH) : null,
    createdAt: fromNow(seed.createdH),
    updatedAt: fromNow(seed.updatedH),
    source: seed.source ?? "manual",
    author,
    category: CATEGORIES[seed.category],
    tags: seed.tags,
    isAiGeneratedThumbnail: seed.ai ?? false,
    aiBullets: seed.bullets,
    wordCount: words,
    readingTime,
  };
}

export const DEMO_ARTICLES: DemoArticle[] = SEEDS.map(buildArticle);
