/**
 * غرفة عمليات سبق الذكية — النموذج المشترك (خادم + واجهة + اختبارات).
 *
 * المبدأ: الوكلاء لا يتحادثون؛ يتواصلون عبر سجل مهام مركزي ومخرجات منظمة.
 * القيم المقيّدة نصوص موثقة (عرف المستودع — لا pgEnum). الإنسان صاحب
 * القرار النهائي: لا نشر ولا إرسال خارجي في النسخة التجريبية إطلاقًا.
 */

// ── حالات المهمة وانتقالاتها ──

export const OPS_TASK_STATUSES = [
  "new",               // جديدة
  "analyzing",         // قيد التحليل
  "planning",          // في انتظار التوزيع
  "ready",             // جاهزة للتنفيذ
  "running",           // قيد التنفيذ
  "waiting",           // في انتظار مهمة أخرى (تبعية)
  "awaiting_approval", // في انتظار اعتماد بشري
  "needs_info",        // تحتاج معلومات
  "needs_changes",     // تحتاج تعديلًا
  "completed",         // مكتملة
  "failed",            // فشلت
  "stopped",           // أوقفت
  "cancelled",         // ألغيت
] as const;
export type OpsTaskStatus = (typeof OPS_TASK_STATUSES)[number];

export const OPS_STATUS_LABELS_AR: Record<OpsTaskStatus, string> = {
  new: "جديدة",
  analyzing: "قيد التحليل",
  planning: "في انتظار التوزيع",
  ready: "جاهزة للتنفيذ",
  running: "قيد التنفيذ",
  waiting: "في انتظار مهمة أخرى",
  awaiting_approval: "في انتظار اعتماد بشري",
  needs_info: "تحتاج معلومات",
  needs_changes: "تحتاج تعديلًا",
  completed: "مكتملة",
  failed: "فشلت",
  stopped: "أوقفت",
  cancelled: "ألغيت",
};

/** الانتقالات المسموحة — أي قفزة خارجها تُرفض وتُسجَّل كخطأ. */
export const OPS_STATUS_TRANSITIONS: Record<OpsTaskStatus, readonly OpsTaskStatus[]> = {
  new: ["analyzing", "cancelled"],
  analyzing: ["planning", "failed", "cancelled"],
  planning: ["ready", "failed", "cancelled"],
  ready: ["running", "waiting", "stopped", "cancelled"],
  running: ["completed", "failed", "awaiting_approval", "needs_info", "needs_changes", "ready", "stopped", "waiting"],
  waiting: ["ready", "stopped", "cancelled"],
  awaiting_approval: ["completed", "needs_changes", "ready", "stopped", "cancelled", "running"],
  needs_info: ["ready", "stopped", "cancelled"],
  needs_changes: ["ready", "stopped", "cancelled"],
  completed: ["ready"], // إعادة تكليف بشرية فقط (تُسجَّل)
  failed: ["ready", "cancelled"],
  stopped: ["ready", "cancelled"],
  cancelled: [],
};

export function canTransition(from: OpsTaskStatus, to: OpsTaskStatus): boolean {
  return OPS_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const OPS_ACTIVE_STATUSES: readonly OpsTaskStatus[] = [
  "new", "analyzing", "planning", "ready", "running", "waiting", "awaiting_approval", "needs_info", "needs_changes",
];
export const OPS_TERMINAL_STATUSES: readonly OpsTaskStatus[] = ["completed", "failed", "stopped", "cancelled"];

// ── أنواع المهام والأولويات والمخاطر ──

export const OPS_TASK_TYPES = [
  "breaking",      // خبر عاجل
  "standard",      // خبر اعتيادي
  "analysis",      // تقرير تحليلي
  "sports",        // محتوى رياضي
  "factcheck",     // تدقيق خبر أو ادعاء
  "notification",  // تجهيز إشعار
  "visual",        // تجهيز محتوى مرئي
  "comments",      // مراجعة تعليقات الجمهور
] as const;
export type OpsTaskType = (typeof OPS_TASK_TYPES)[number];

export const OPS_TASK_TYPE_LABELS_AR: Record<OpsTaskType, string> = {
  breaking: "خبر عاجل",
  standard: "خبر اعتيادي",
  analysis: "تقرير تحليلي",
  sports: "محتوى رياضي",
  factcheck: "تدقيق خبر أو ادعاء",
  notification: "تجهيز إشعار",
  visual: "تجهيز محتوى مرئي",
  comments: "مراجعة تعليقات الجمهور",
};

export const OPS_PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type OpsPriority = (typeof OPS_PRIORITIES)[number];
export const OPS_PRIORITY_LABELS_AR: Record<OpsPriority, string> = {
  low: "منخفضة", normal: "عادية", high: "عالية", critical: "حرجة",
};

export const OPS_RISK_LEVELS = ["low", "medium", "high"] as const;
export type OpsRiskLevel = (typeof OPS_RISK_LEVELS)[number];

export const OPS_ORIGINS = ["manual", "radar", "system"] as const;
export type OpsOrigin = (typeof OPS_ORIGINS)[number];

// ── الوكلاء ──

export const OPS_AGENT_SLUGS = [
  "rased", "muwathiq", "murasil", "sabbaq", "qalam", "maydan", "infox",
  "adasa", "risha", "sada", "hares", "nabd", "daleel", "saai", "mizan", "omq",
] as const;
export type OpsAgentSlug = (typeof OPS_AGENT_SLUGS)[number];

export interface OpsAgentMeta {
  slug: OpsAgentSlug;
  nameAr: string;
  roleAr: string;
  /** الأدوات المسموح بها — أي أداة خارجها محظورة وتُرفض في المحرك */
  tools: readonly string[];
  /** عمليات محظورة صراحة (للتوثيق والفحص) */
  forbiddenAr: readonly string[];
  maxAttempts: number;
  timeoutMs: number;
  /** ربط بموظف فريق سبق الذكي (الصورة الرمزية) */
  avatarUrl: string;
}

export const OPS_AGENTS: Record<OpsAgentSlug, OpsAgentMeta> = {
  rased:    { slug: "rased",    nameAr: "راصد",   roleAr: "التقاط الحدث وإنشاء إشارة رصد موثقة", tools: ["model", "radar_read"], forbiddenAr: ["كتابة خبر نهائي", "النشر"], maxAttempts: 2, timeoutMs: 60_000, avatarUrl: "/ai-team/rased.jpg" },
  muwathiq: { slug: "muwathiq", nameAr: "موثّق", roleAr: "جمع الأدلة وفصل الحقائق عن الادعاءات", tools: ["model", "web_search"], forbiddenAr: ["تحويل ادعاء غير مؤكد إلى حقيقة"], maxAttempts: 2, timeoutMs: 90_000, avatarUrl: "/ai-team/muwathiq.jpg" },
  murasil:  { slug: "murasil",  nameAr: "مراسل", roleAr: "صياغة مسودة أولية من المواد المعتمدة", tools: ["model", "editorial_task"], forbiddenAr: ["اختلاق اقتباسات أو مشاهدات"], maxAttempts: 2, timeoutMs: 120_000, avatarUrl: "/ai-team/murasil.jpg" },
  sabbaq:   { slug: "sabbaq",   nameAr: "سبّاق", roleAr: "صياغة عاجلة قصيرة قابلة للمراجعة", tools: ["model", "editorial_task"], forbiddenAr: ["أي معلومة من خارج المادة المعتمدة", "النشر"], maxAttempts: 2, timeoutMs: 90_000, avatarUrl: "/ai-team/sabbaq.jpg" },
  qalam:    { slug: "qalam",    nameAr: "قلم",   roleAr: "تحرير لغوي وأسلوبي دون تغيير الحقائق", tools: ["model", "editorial_task"], forbiddenAr: ["تغيير الحقائق"], maxAttempts: 2, timeoutMs: 120_000, avatarUrl: "/ai-team/qalam.jpg" },
  maydan:   { slug: "maydan",   nameAr: "ميدان", roleAr: "معالجة المحتوى الرياضي وربطه بالبطولات", tools: ["model"], forbiddenAr: ["اختلاق نتائج أو إحصاءات"], maxAttempts: 2, timeoutMs: 90_000, avatarUrl: "/ai-team/maydan.jpg" },
  infox:    { slug: "infox",    nameAr: "إنفوكس", roleAr: "استخراج الأرقام واقتراح تمثيل بصري", tools: ["model"], forbiddenAr: ["رقم بلا مصدر"], maxAttempts: 2, timeoutMs: 90_000, avatarUrl: "/ai-team/ifox.jpg" },
  adasa:    { slug: "adasa",    nameAr: "عدسة",  roleAr: "تحليل الصور وفحص ملاءمتها واقتراح الوصف", tools: ["model", "image_analysis"], forbiddenAr: ["الجزم بهوية الأشخاص أو المواقع"], maxAttempts: 2, timeoutMs: 90_000, avatarUrl: "/ai-team/adasa.jpg" },
  risha:    { slug: "risha",    nameAr: "ريشة",  roleAr: "توليد صور عند طلب المحرر فقط، موسومة", tools: ["model", "image_generation"], forbiddenAr: ["تمرير صورة مولدة كصورة خبرية"], maxAttempts: 1, timeoutMs: 120_000, avatarUrl: "/ai-team/risha.jpg" },
  sada:     { slug: "sada",     nameAr: "صدى",   roleAr: "إعداد النص الملائم للصوت من المادة المعتمدة", tools: ["model"], forbiddenAr: ["الخروج عن المادة المعتمدة"], maxAttempts: 2, timeoutMs: 90_000, avatarUrl: "/ai-team/sada.jpg" },
  hares:    { slug: "hares",    nameAr: "حارس",  roleAr: "تحليل التعليقات وتصنيف سبب المراجعة", tools: ["model"], forbiddenAr: ["حجب نهائي دون إحالة الملتبس للبشر"], maxAttempts: 2, timeoutMs: 90_000, avatarUrl: "/ai-team/hares.jpg" },
  nabd:     { slug: "nabd",     nameAr: "نبض",   roleAr: "مؤشرات تفاعل الجمهور والمشاعر مجمعة", tools: ["model"], forbiddenAr: ["اعتبار المشاعر دليلًا على صحة الخبر"], maxAttempts: 2, timeoutMs: 90_000, avatarUrl: "/ai-team/nabd.jpg" },
  daleel:   { slug: "daleel",   nameAr: "دليل",  roleAr: "اقتراح موضوعات وتوصيات مع تفسير كل توصية", tools: ["model"], forbiddenAr: ["تجاوز سياسات الخصوصية"], maxAttempts: 2, timeoutMs: 90_000, avatarUrl: "/ai-team/daleel.jpg" },
  saai:     { slug: "saai",     nameAr: "ساعي",  roleAr: "تجهيز الإشعار: عنوان ونص وجمهور وتوقيت", tools: ["model"], forbiddenAr: ["إرسال الإشعار"], maxAttempts: 2, timeoutMs: 60_000, avatarUrl: "/ai-team/saai.jpg" },
  mizan:    { slug: "mizan",    nameAr: "ميزان", roleAr: "فحص الجودة والمصادر والمخاطر بنتيجة منظمة", tools: ["model", "editorial_task"], forbiddenAr: ["التعديل المباشر على النص"], maxAttempts: 2, timeoutMs: 120_000, avatarUrl: "/ai-team/mizan.jpg" },
  omq:      { slug: "omq",      nameAr: "عمق",   roleAr: "تحليل استراتيجي يفصل الحقائق عن الاستنتاج", tools: ["model"], forbiddenAr: ["خلط الحقيقة بالتحليل"], maxAttempts: 2, timeoutMs: 150_000, avatarUrl: "/ai-team/omq.jpg" },
};

// ── المسارات التعريفية ──

export interface OpsRouteStep {
  key: string;            // مفتاح فريد داخل المسار
  agent: OpsAgentSlug;
  dependsOn: string[];    // مفاتيح خطوات سابقة
  /** بوابة اعتماد بشري بعد اكتمال هذه الخطوة */
  approvalGate?: boolean;
  /** خطوات متوازية تُطلق فقط بعد اعتماد هذه الخطوة */
  titleAr: string;
}

export interface OpsRoute {
  type: OpsTaskType;
  titleAr: string;
  steps: OpsRouteStep[];
}

/**
 * المسار لكل نوع. إضافة نوع جديد = إضافة كائن هنا فقط. المنسق يقرأ هذه
 * التعريفات ولا يحوي منطقًا ثابتًا لكل نوع.
 */
export const OPS_ROUTES: Record<OpsTaskType, OpsRoute> = {
  breaking: {
    type: "breaking",
    titleAr: "خبر عاجل من إشارة رصد",
    steps: [
      { key: "signal",    agent: "rased",    dependsOn: [],                 titleAr: "إشارة الرصد" },
      { key: "verify",    agent: "muwathiq", dependsOn: ["signal"],         titleAr: "التحقق وجمع المصادر" },
      { key: "draft",     agent: "sabbaq",   dependsOn: ["verify"],         titleAr: "المسودة العاجلة" },
      { key: "edit",      agent: "qalam",    dependsOn: ["draft"],          titleAr: "التحرير اللغوي" },
      { key: "qa",        agent: "mizan",    dependsOn: ["edit"],           titleAr: "فحص الجودة والمخاطر", approvalGate: true },
      { key: "image",     agent: "adasa",    dependsOn: ["qa"],             titleAr: "الصورة", approvalGate: true },
      { key: "push",      agent: "saai",     dependsOn: ["qa"],             titleAr: "الإشعار", approvalGate: true },
    ],
  },
  standard: {
    type: "standard",
    titleAr: "خبر اعتيادي",
    steps: [
      { key: "signal", agent: "rased",    dependsOn: [],           titleAr: "إشارة الرصد" },
      { key: "verify", agent: "muwathiq", dependsOn: ["signal"],   titleAr: "التحقق وجمع المصادر" },
      { key: "draft",  agent: "murasil",  dependsOn: ["verify"],   titleAr: "المسودة الأولية" },
      { key: "edit",   agent: "qalam",    dependsOn: ["draft"],    titleAr: "التحرير اللغوي" },
      { key: "qa",     agent: "mizan",    dependsOn: ["edit"],     titleAr: "فحص الجودة والمخاطر", approvalGate: true },
      { key: "image",  agent: "adasa",    dependsOn: ["qa"],       titleAr: "الصورة", approvalGate: true },
      { key: "push",   agent: "saai",     dependsOn: ["qa"],       titleAr: "الإشعار", approvalGate: true },
    ],
  },
  analysis: {
    type: "analysis",
    titleAr: "تقرير تحليلي",
    steps: [
      { key: "verify",   agent: "muwathiq", dependsOn: [],             titleAr: "التحقق وجمع المصادر" },
      { key: "analysis", agent: "omq",      dependsOn: ["verify"],     titleAr: "التحليل الاستراتيجي" },
      { key: "numbers",  agent: "infox",    dependsOn: ["verify"],     titleAr: "الأرقام والمحاور" },
      { key: "edit",     agent: "qalam",    dependsOn: ["analysis", "numbers"], titleAr: "التحرير اللغوي" },
      { key: "qa",       agent: "mizan",    dependsOn: ["edit"],       titleAr: "فحص الجودة والمخاطر", approvalGate: true },
    ],
  },
  sports: {
    type: "sports",
    titleAr: "محتوى رياضي",
    steps: [
      { key: "verify", agent: "muwathiq", dependsOn: [],           titleAr: "التحقق وجمع المصادر" },
      { key: "sports", agent: "maydan",   dependsOn: ["verify"],   titleAr: "المعالجة الرياضية" },
      { key: "edit",   agent: "qalam",    dependsOn: ["sports"],   titleAr: "التحرير اللغوي" },
      { key: "qa",     agent: "mizan",    dependsOn: ["edit"],     titleAr: "فحص الجودة والمخاطر", approvalGate: true },
      { key: "push",   agent: "saai",     dependsOn: ["qa"],       titleAr: "الإشعار", approvalGate: true },
    ],
  },
  factcheck: {
    type: "factcheck",
    titleAr: "تدقيق خبر أو ادعاء",
    steps: [
      { key: "verify", agent: "muwathiq", dependsOn: [],         titleAr: "التحقق وجمع المصادر" },
      { key: "qa",     agent: "mizan",    dependsOn: ["verify"], titleAr: "حكم الجودة والمخاطر", approvalGate: true },
    ],
  },
  notification: {
    type: "notification",
    titleAr: "تجهيز إشعار",
    steps: [
      { key: "push", agent: "saai", dependsOn: [], titleAr: "مقترح الإشعار", approvalGate: true },
    ],
  },
  visual: {
    type: "visual",
    titleAr: "تجهيز محتوى مرئي",
    steps: [
      { key: "image", agent: "adasa", dependsOn: [], titleAr: "تحليل الصورة واقتراح الوصف", approvalGate: true },
    ],
  },
  comments: {
    type: "comments",
    titleAr: "مراجعة تعليقات الجمهور",
    steps: [
      { key: "moderate", agent: "hares", dependsOn: [],             titleAr: "تصنيف التعليقات" },
      { key: "pulse",    agent: "nabd",  dependsOn: ["moderate"],   titleAr: "مؤشرات التفاعل", approvalGate: true },
    ],
  },
};

/** يتحقق أن التبعيات داخل المسار سليمة وبلا دورات (يُستدعى في الاختبارات وعند الإقلاع). */
export function validateRoute(route: OpsRoute): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const s of route.steps) {
    if (keys.has(s.key)) errors.push(`duplicate step key: ${s.key}`);
    keys.add(s.key);
  }
  const index = new Map(route.steps.map((s) => [s.key, s]));
  for (const s of route.steps) {
    for (const d of s.dependsOn) {
      if (!index.has(d)) errors.push(`${s.key}: unknown dependency ${d}`);
    }
  }
  // كشف الدورات
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (k: string, trail: string[]) => {
    if (done.has(k)) return;
    if (visiting.has(k)) { errors.push(`cycle: ${[...trail, k].join(" → ")}`); return; }
    visiting.add(k);
    for (const d of index.get(k)?.dependsOn ?? []) visit(d, [...trail, k]);
    visiting.delete(k);
    done.add(k);
  };
  for (const s of route.steps) visit(s.key, []);
  return errors;
}

// ── الصلاحيات ──

export const OPS_PERMISSIONS = {
  view: "ops_room.view",
  create: "ops_room.create",
  edit: "ops_room.edit",
  reassign: "ops_room.reassign",
  stop: "ops_room.stop",
  agentsManage: "ops_room.agents.manage",
  outputsView: "ops_room.outputs.view",
  approve: "ops_room.approve",
  publish: "ops_room.publish", // محجوزة للمستقبل — لا مسار ينفذها في النسخة التجريبية
  settings: "ops_room.settings",
} as const;
export type OpsPermission = (typeof OPS_PERMISSIONS)[keyof typeof OPS_PERMISSIONS];

export const OPS_PERMISSION_SEED: { code: OpsPermission; label: string; labelAr: string; module: string }[] = [
  { code: "ops_room.view", label: "View ops room", labelAr: "مشاهدة غرفة العمليات", module: "ops_room" },
  { code: "ops_room.create", label: "Create ops task", labelAr: "إنشاء مهمة", module: "ops_room" },
  { code: "ops_room.edit", label: "Edit ops task", labelAr: "تعديل المهمة", module: "ops_room" },
  { code: "ops_room.reassign", label: "Reassign ops task", labelAr: "إعادة التكليف", module: "ops_room" },
  { code: "ops_room.stop", label: "Stop ops task", labelAr: "إيقاف مهمة", module: "ops_room" },
  { code: "ops_room.agents.manage", label: "Enable/disable agents", labelAr: "تشغيل أو إيقاف وكيل", module: "ops_room" },
  { code: "ops_room.outputs.view", label: "View sources & outputs", labelAr: "الاطلاع على المصادر والمخرجات", module: "ops_room" },
  { code: "ops_room.approve", label: "Approve material", labelAr: "اعتماد المادة", module: "ops_room" },
  { code: "ops_room.publish", label: "Publish/send (future)", labelAr: "السماح بالنشر أو الإرسال (مستقبلًا)", module: "ops_room" },
  { code: "ops_room.settings", label: "Manage agent settings", labelAr: "إدارة إعدادات الوكلاء", module: "ops_room" },
];

/** فحص صلاحية مع احترام wildcard "*" — يُستخدم في الخادم والواجهة والاختبارات. */
export function hasOpsPermission(perms: readonly string[] | null | undefined, code: OpsPermission): boolean {
  if (!perms) return false;
  if (perms.includes("*")) return true;
  return perms.includes(code);
}

// ── الأحداث ──

export const OPS_EVENT_TYPES = [
  "created", "analyzed", "planned", "dispatched", "started", "tool_call", "completed", "failed", "retry",
  "needs_info", "needs_changes", "awaiting_approval", "approved", "changes_requested", "reassigned",
  "info_provided", "stopped", "resumed", "cancelled", "status_changed", "blocked", "output_rejected",
] as const;
export type OpsEventType = (typeof OPS_EVENT_TYPES)[number];
export type OpsActorType = "agent" | "human" | "system";

// ── مخرج الوكيل الموحد ──

/** الحد الأدنى الذي يلتزم به كل وكيل، وكل وكيل يضيف حقوله الخاصة داخل result. */
export interface OpsAgentOutputBase {
  summaryAr: string;
  factsUsed: string[];
  sources: { title: string; url: string }[];
  confidence: number;          // 0–100
  missingInfo: string[];
  warnings: string[];
  nextActionAr: string;
}

export interface OpsHumanAction {
  action: "approve" | "request_changes" | "reassign" | "request_info" | "provide_info" | "stop" | "cancel" | "resume" | "retry";
  note?: string;
  /** لإعادة التكليف: مفتاح الخطوة التي يُعاد التنفيذ منها */
  stepKey?: string;
  /** للتعديل البشري: مخرج معدّل يحل محل مخرج الخطوة (يُوسم كتعديل بشري) */
  editedResult?: Record<string, unknown>;
}

/** أقصى عدد لإعادة التكليف البشري لنفس المهمة — يمنع دوران الحلقة بين الوكلاء. */
export const OPS_MAX_REASSIGNMENTS = 3;
/** أقصى عودة تلقائية من ميزان إلى قلم عند «يحتاج تعديلًا» قبل التصعيد للبشر. */
export const OPS_MAX_AUTO_RETURNS = 1;
/** الحد الأعلى لطول أي نص خارجي يدخل المحرك (حماية من الحقن والتضخم). */
export const OPS_MAX_INPUT_CHARS = 20_000;
