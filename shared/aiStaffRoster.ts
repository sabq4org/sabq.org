/**
 * فريق سبق الذكي — سجلّ الموظفين الافتراضي.
 *
 * على نمط server/ai/gateway/defaults.ts: الثوابت هنا هي المصدر الافتراضي،
 * وجدول ai_staff في القاعدة يتقدم عليها متى زُرع (scripts/seed-ai-staff.ts) —
 * فيمكن تعديل السير الذاتية والربط من القاعدة لاحقًا دون نشر كود.
 *
 * قاعدة التصميم: هذه طبقة هوية فقط. لا محرك تنسيق جديدًا — كل موظف يشير إلى
 * مفاتيح ميزات قائمة في بوابة AI Hub (ai_feature_configs / ai_usage_logs)
 * ومنها تُشتق مؤشراته وتكلفته وحالته. AI لا ينشر: كل المخرجات مسودات
 * تنتظر محررًا بشريًا (دستور «محرر سبق»)، ولذلك قمة الهيكل بشرية دائمًا.
 */

export const AI_STAFF_DEPARTMENT_KEYS = [
  "rasd",
  "tahrir",
  "sports",
  "media",
  "audience",
  "quality",
] as const;
export type AiStaffDepartmentKey = (typeof AI_STAFF_DEPARTMENT_KEYS)[number];

export const AI_STAFF_DEPARTMENTS: Record<
  AiStaffDepartmentKey,
  { labelAr: string; noteAr: string; sortOrder: number }
> = {
  rasd: { labelAr: "الرصد والعاجل", noteAr: "رادار سبق", sortOrder: 1 },
  tahrir: { labelAr: "التحرير", noteAr: "المحرر الموحد والوكلاء", sortOrder: 2 },
  sports: { labelAr: "الرياضة", noteAr: "البطولات واللقطات", sortOrder: 3 },
  media: { labelAr: "الوسائط", noteAr: "صورة وصوت", sortOrder: 4 },
  audience: { labelAr: "الجمهور", noteAr: "تفاعل وقنوات", sortOrder: 5 },
  quality: { labelAr: "الجودة والحوكمة", noteAr: "فحص وتحليل", sortOrder: 6 },
};

/** كيف يعمل الموظف — نصوص موثقة لا pgEnum (عرف المستودع). */
export const AI_STAFF_TRIGGER_MODES = ["cron", "on-demand", "inline", "continuous"] as const;
export type AiStaffTriggerMode = (typeof AI_STAFF_TRIGGER_MODES)[number];

/**
 * gateway: مؤشراته تُشتق من ai_usage_logs عبر مفاتيح ميزاته.
 * pending: نظامه لا يمر بالبوابة بمفتاح خاص به بعد — الواجهة تعرض
 * «قيد الربط» بدل أصفار كاذبة (قاعدة المصداقية: لا أرقام وهمية).
 */
export type AiStaffMetricsSource = "gateway" | "pending";

export interface AiStaffMember {
  slug: string;
  employeeCode: string; // AI-001 …
  nameAr: string;
  titleAr: string;
  bioAr: string;
  departmentKey: AiStaffDepartmentKey;
  /** null = يتبع رئيس التحرير (البشري) مباشرة */
  managerSlug: string | null;
  avatarUrl: string;
  /** مفاتيح ميزات البوابة المملوكة لهذا الموظف حصريًا (مطابقة تامة) */
  featureKeys: string[];
  /** بادئات لمفاتيح ديناميكية مثل editorial-unified-<task> */
  featureKeyPrefixes: string[];
  /** أنظمة docs/systems/registry.json التي يجسّدها */
  systems: string[];
  triggerMode: AiStaffTriggerMode;
  scheduleNoteAr: string;
  metricsSource: AiStaffMetricsSource;
  sortOrder: number;
}

/** هل ينتمي سجل استخدام بهذا المفتاح إلى هذا الموظف؟ */
export function staffOwnsFeatureKey(member: Pick<AiStaffMember, "featureKeys" | "featureKeyPrefixes">, featureKey: string): boolean {
  if (member.featureKeys.includes(featureKey)) return true;
  return member.featureKeyPrefixes.some((prefix) => featureKey.startsWith(prefix));
}

export const AI_STAFF_ROSTER: AiStaffMember[] = [
  // ===== إدارة الرصد والعاجل (رادار سبق) =====
  {
    slug: "rased",
    employeeCode: "AI-001",
    nameAr: "راصد",
    titleAr: "محلل الرصد",
    bioAr:
      "أقرأ كل خبر يصل من مصادر الرادار، وأمنحه قيمة إخبارية من 100 بعد ترجمة تفسيرية واقتراح تصنيف. ما يتجاوز العتبة أسلّمه لزميلي سبّاق، والمكرر أستبعده. قراري الأقصى هو «يستحق نظر البشر».",
    departmentKey: "rasd",
    managerSlug: null,
    avatarUrl: "/ai-team/rased.jpg",
    featureKeys: ["radar", "radar-relevance", "radar-clustering"],
    featureKeyPrefixes: [],
    systems: ["radar"],
    triggerMode: "cron",
    scheduleNoteAr: "كل دقيقة، على مدار الساعة",
    metricsSource: "gateway",
    sortOrder: 1,
  },
  {
    slug: "sabbaq",
    employeeCode: "AI-002",
    nameAr: "سبّاق",
    titleAr: "محرر العاجل",
    bioAr:
      "حين يمنح راصد خبرًا قيمة عالية أتسلمه فورًا وأحوّله إلى مسودة عاجل بأسلوب سبق — ممنوع عليّ أي معلومة من خارج المادة المصدرية، وما أكتبه لا يُنشر قبل اعتماد محرر بشري.",
    departmentKey: "rasd",
    managerSlug: "rased",
    avatarUrl: "/ai-team/sabbaq.jpg",
    // التحويل يجري داخل دورة الرادار بنفس مفتاح "radar" — المفتاح محسوب
    // لراصد فلا نكرره هنا (لا عدّ مزدوجًا)؛ قياسه الدقيق من radar_stories
    // يأتي مع محوّلات المرحلة الثالثة.
    featureKeys: [],
    featureKeyPrefixes: [],
    systems: ["radar"],
    triggerMode: "inline",
    scheduleNoteAr: "تلقائي عند تجاوز عتبة العاجل",
    metricsSource: "pending",
    sortOrder: 2,
  },
  {
    slug: "muwathiq",
    employeeCode: "AI-003",
    nameAr: "موثّق",
    titleAr: "المدقق الباحث",
    bioAr:
      "مهمتي «طوّر ببحث»: أتحقق من الخبر وأثريه ببحث حي في المصادر، ولا أسلّم نصًا بلا مصادر مسماة. أنا تطبيق المرحلة الثانية من دستور محرر سبق.",
    departmentKey: "rasd",
    managerSlug: "rased",
    avatarUrl: "/ai-team/muwathiq.jpg",
    featureKeys: ["radar-develop"],
    featureKeyPrefixes: [],
    systems: ["radar", "editorial"],
    triggerMode: "on-demand",
    scheduleNoteAr: "عند طلب المحرر",
    metricsSource: "gateway",
    sortOrder: 3,
  },

  // ===== إدارة التحرير =====
  {
    slug: "qalam",
    employeeCode: "AI-004",
    nameAr: "قلم",
    titleAr: "المحرر الموحد",
    bioAr:
      "أعمل بدستور تحرير سبق في ثماني مهام: حرّر، طوّر، ادمج، راجع، تقرير، بروفايل، نسخة التطبيق، وفحص ما قبل النشر. أُخرج مسودات منظمة بعناوين بديلة وملاحظات محرر ومصادر — والاعتماد دائمًا للبشر.",
    departmentKey: "tahrir",
    managerSlug: null,
    avatarUrl: "/ai-team/qalam.jpg",
    featureKeys: ["ai-article-generator", "content-tools", "seo-generator", "muqtarab-ai"],
    featureKeyPrefixes: ["editorial-unified-"],
    systems: ["editorial"],
    triggerMode: "on-demand",
    scheduleNoteAr: "من داخل محرر المقالات",
    metricsSource: "gateway",
    sortOrder: 4,
  },
  {
    slug: "murasil",
    employeeCode: "AI-005",
    nameAr: "مراسل",
    titleAr: "الصحفي الآلي",
    bioAr:
      "أنفّذ التكليف الصحفي كاملًا في خمس خطوات متتبَّعة: بحث، تحليل، كتابة، وسائط، ثم عناوين مقترحة — وتظهر لك حالة تقدمي خطوة بخطوة في journalist_tasks.",
    departmentKey: "tahrir",
    managerSlug: "qalam",
    avatarUrl: "/ai-team/murasil.jpg",
    featureKeys: ["journalist-agent"],
    featureKeyPrefixes: [],
    systems: ["editorial"],
    triggerMode: "on-demand",
    scheduleNoteAr: "بتكليف من المحرر",
    metricsSource: "gateway",
    sortOrder: 5,
  },
  {
    slug: "ifox",
    employeeCode: "AI-006",
    nameAr: "آيفوكس",
    titleAr: "وحدة الإنتاج المجدول",
    bioAr:
      "أدير خط إنتاج المحتوى المجدول: توليد وفق القوالب والتقويم التحريري، وفحص جودة، وانضباط ميزانية — وبوابة نشر آمنة افتراضيًا (مسودة ما لم يقرر البشر غير ذلك).",
    departmentKey: "tahrir",
    managerSlug: "qalam",
    avatarUrl: "/ai-team/ifox.jpg",
    featureKeys: ["ifox-content", "ifox-quality", "ifox-strategy"],
    featureKeyPrefixes: [],
    systems: ["ifox"],
    triggerMode: "cron",
    scheduleNoteAr: "كل ربع ساعة",
    metricsSource: "gateway",
    sortOrder: 6,
  },

  // ===== إدارة الرياضة =====
  {
    slug: "maydan",
    employeeCode: "AI-007",
    nameAr: "ميدان",
    titleAr: "محرر الرياضة",
    bioAr:
      "أغطي البطولات لحظة بلحظة: أخبار الدوري والكؤوس، مشاهد المباريات، اللقطات، وتعريب أسماء اللاعبين — والنتيجة الرسمية هي الحكم دائمًا.",
    departmentKey: "sports",
    managerSlug: null,
    avatarUrl: "/ai-team/maydan.jpg",
    featureKeys: [
      "world-cup-news",
      "kings-cup-news",
      "sportmonks-news",
      "saudi-league-story",
      "saudi-league-preview",
      "sports-snaps",
      "sports-names",
    ],
    featureKeyPrefixes: ["sports-intel-"],
    systems: ["sports-tournaments"],
    triggerMode: "cron",
    scheduleNoteAr: "مستمر مع المباريات",
    metricsSource: "gateway",
    sortOrder: 7,
  },

  // ===== إدارة الوسائط =====
  {
    slug: "adasa",
    employeeCode: "AI-008",
    nameAr: "عدسة",
    titleAr: "محلل الصور",
    bioAr:
      "أفحص جودة الصور ومحتواها، وأكتب النص البديل بثلاث لغات، وأقترح الصور المصغرة والإنفوجرافيك — عين القسم البصرية.",
    departmentKey: "media",
    managerSlug: null,
    avatarUrl: "/ai-team/adasa.jpg",
    featureKeys: ["visual-ai", "smart-thumbnail", "media-caption", "infographic-ai"],
    featureKeyPrefixes: [],
    systems: ["media"],
    triggerMode: "on-demand",
    scheduleNoteAr: "مع كل صورة تدخل النظام",
    metricsSource: "gateway",
    sortOrder: 8,
  },
  {
    slug: "risha",
    employeeCode: "AI-009",
    nameAr: "ريشة",
    titleAr: "مولّد الصور",
    bioAr: "أولّد صور الأخبار بأنماط التوليد المعتمدة في سبق، بنموذج أساسي وخط احتياطي عند التعثر.",
    departmentKey: "media",
    managerSlug: "adasa",
    avatarUrl: "/ai-team/risha.jpg",
    featureKeys: ["image-generation", "nano-banana-images"],
    featureKeyPrefixes: [],
    systems: ["media"],
    triggerMode: "on-demand",
    scheduleNoteAr: "عند طلب المحرر أو تلقائيًا للمقالات",
    metricsSource: "gateway",
    sortOrder: 9,
  },
  {
    slug: "sada",
    employeeCode: "AI-010",
    nameAr: "صدى",
    titleAr: "المذيع الصوتي",
    bioAr: "أنتج الموجز الذكي والنشرات الصوتية بصوت سبق الإذاعي — من النص إلى الأذن.",
    departmentKey: "media",
    managerSlug: "adasa",
    avatarUrl: "/ai-team/sada.jpg",
    featureKeys: ["audio-newsletter"],
    featureKeyPrefixes: [],
    systems: ["audio-newsletter"],
    triggerMode: "cron",
    scheduleNoteAr: "مواعيد النشرات + عند الطلب",
    metricsSource: "gateway",
    sortOrder: 10,
  },

  // ===== إدارة الجمهور =====
  {
    slug: "hares",
    employeeCode: "AI-011",
    nameAr: "حارس",
    titleAr: "رقيب التعليقات",
    bioAr:
      "أفحص كل تعليق فور وروده: رصد الإساءة والسبام وحملات التكرار، بمعايرة مستمرة من قرارات المشرفين البشر — أتعلم من تصويباتهم.",
    departmentKey: "audience",
    managerSlug: null,
    avatarUrl: "/ai-team/hares.jpg",
    featureKeys: ["comment-moderation"],
    featureKeyPrefixes: [],
    systems: ["moderation"],
    triggerMode: "inline",
    scheduleNoteAr: "فوري مع كل تعليق + دورة كل ساعة",
    metricsSource: "gateway",
    sortOrder: 11,
  },
  {
    slug: "nabd",
    employeeCode: "AI-012",
    nameAr: "نبض",
    titleAr: "محلل المشاعر",
    bioAr: "أقيس نبض الجمهور: مشاعر التعليقات والمحتوى بالعربية والإنجليزية والأردو، بدرجات ثقة معلنة.",
    departmentKey: "audience",
    managerSlug: "hares",
    avatarUrl: "/ai-team/nabd.jpg",
    featureKeys: ["sentiment-analysis"],
    featureKeyPrefixes: [],
    systems: ["moderation"],
    triggerMode: "on-demand",
    scheduleNoteAr: "مع دورات الرقابة",
    metricsSource: "gateway",
    sortOrder: 12,
  },
  {
    slug: "daleel",
    employeeCode: "AI-013",
    nameAr: "دليل",
    titleAr: "محرك التوصيات",
    bioAr: "أرشّح لكل قارئ ما يعنيه: تغذية مخصصة مبنية على اهتماماته وسلوك القراءة، بلا مساس بخصوصيته.",
    departmentKey: "audience",
    managerSlug: "hares",
    avatarUrl: "/ai-team/daleel.jpg",
    // محرك التوصيات لا يمر بالبوابة بمفتاح مستقل (يعمل على المتجهات
    // والسلوك) — مؤشراته من جداوله تأتي مع محوّلات المرحلة الثالثة.
    featureKeys: [],
    featureKeyPrefixes: [],
    systems: ["recommendations"],
    triggerMode: "continuous",
    scheduleNoteAr: "مستمر مع تصفح القراء",
    metricsSource: "pending",
    sortOrder: 13,
  },
  {
    slug: "saai",
    employeeCode: "AI-014",
    nameAr: "ساعي",
    titleAr: "وكيل القنوات",
    bioAr:
      "أستقبل ما يصل سبق عبر البريد والواتساب، وأحرره بأسلوب سبق وأصنفه، وأصوغ الردود ومقترحات النشر الاجتماعي — بريد القسم الذكي.",
    departmentKey: "audience",
    managerSlug: null,
    avatarUrl: "/ai-team/saai.jpg",
    featureKeys: ["email-agent", "whatsapp-agent", "reply-polish", "social-post-suggest"],
    featureKeyPrefixes: [],
    systems: ["communications"],
    triggerMode: "inline",
    scheduleNoteAr: "فوري مع كل رسالة واردة",
    metricsSource: "gateway",
    sortOrder: 14,
  },

  // ===== إدارة الجودة والحوكمة =====
  {
    slug: "mizan",
    employeeCode: "AI-015",
    nameAr: "ميزان",
    titleAr: "محلل الجودة",
    bioAr:
      "أزن المحتوى قبل أن يراه القارئ: تقييم تحريري شامل، تصنيف دقيق، وأعلام مخاطر لما يستوجب مراجعة بشرية ثانية — أُعلّم ولا أُعدّل.",
    departmentKey: "quality",
    managerSlug: null,
    avatarUrl: "/ai-team/mizan.jpg",
    featureKeys: ["content-analyzer", "article-classification", "smart-categories", "smart-category-classifier"],
    featureKeyPrefixes: [],
    systems: ["editorial"],
    triggerMode: "on-demand",
    scheduleNoteAr: "مع كل مسودة تطلب الفحص",
    metricsSource: "gateway",
    sortOrder: 15,
  },
  {
    slug: "omq",
    employeeCode: "AI-016",
    nameAr: "عمق",
    titleAr: "المحلل الاستراتيجي",
    bioAr:
      "أكتب التحليل العميق بالقالب الذهبي: عشرة أقسام تفصل الخبر عن التحليل بوضوح، وقصص البيانات برسومها — قراءة المشهد لا سرد الحدث.",
    departmentKey: "quality",
    managerSlug: "mizan",
    avatarUrl: "/ai-team/omq.jpg",
    featureKeys: ["deep-analysis", "data-story", "smart-insights"],
    featureKeyPrefixes: [],
    systems: ["deep-analysis"],
    triggerMode: "on-demand",
    scheduleNoteAr: "بتكليف تحريري",
    metricsSource: "gateway",
    sortOrder: 16,
  },
];

const ROSTER_BY_SLUG = new Map(AI_STAFF_ROSTER.map((m) => [m.slug, m]));

export function getRosterMember(slug: string): AiStaffMember | undefined {
  return ROSTER_BY_SLUG.get(slug);
}
