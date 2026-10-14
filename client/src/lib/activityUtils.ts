import {
  PlusCircle,
  RefreshCcw,
  Trash2,
  Megaphone,
  ShieldCheck,
  Link2,
  KeyRound,
  Activity,
  LogIn,
  LogOut,
  CheckCircle,
  XCircle,
  Eye,
  Download,
  Upload,
  Archive,
  Star,
  StarOff,
  Send,
  Ban,
  UserPlus,
  UserMinus,
  Settings,
  FileText,
  Sparkles,
  Bot,
  Calendar,
  ArrowUpDown,
  Zap,
  RotateCcw,
  Share2,
  Lock,
  Unlock,
  SearchCheck,
  Tags,
  type LucideIcon,
} from "lucide-react";

export interface ActionPresentation {
  label: string;
  icon: LucideIcon;
  bgColor: string;
  textColor: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
  category?: "create" | "update" | "publish" | "delete" | "ai" | "security" | "bot" | "system";
}

const actionPresentations: Record<string, ActionPresentation> = {
  // ── الإنشاء ──
  create: {
    label: "إنشاء",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  created: {
    label: "إنشاء",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  created_opinion: {
    label: "إنشاء مقال رأي",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  article_created_from_calendar: {
    label: "إنشاء مقال من الأجندة",
    icon: Calendar,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  create_smart_block: {
    label: "إنشاء بلوك ذكي",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  create_en_smart_block: {
    label: "إنشاء بلوك ذكي (EN)",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  calendar_event_created: {
    label: "إضافة حدث بالأجندة",
    icon: Calendar,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  calendar_assignment_created: {
    label: "إنشاء تكليف تحريري",
    icon: Calendar,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  calendar_reminder_created: {
    label: "إنشاء تذكير بالأجندة",
    icon: Calendar,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  smart_entity_created: {
    label: "إنشاء كيان ذكي",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  smart_term_created: {
    label: "إضافة مصطلح ذكي",
    icon: Tags,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  entity_type_created: {
    label: "إنشاء نوع كيان",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  survey_created: {
    label: "إنشاء استبيان",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  experimentcreated: {
    label: "إنشاء تجربة A/B",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  variantcreated: {
    label: "إضافة نسخة تجربة",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },
  storycreated: {
    label: "إنشاء ملف متابعة",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "create",
  },

  // ── التحديث والتعديل ──
  update: {
    label: "تحديث",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  updated: {
    label: "تحديث",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  updated_opinion: {
    label: "تحديث مقال رأي",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  modify: {
    label: "تعديل",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  update_bulk: {
    label: "تحديث جماعي",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  update_smart_block: {
    label: "تحديث بلوك ذكي",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  update_en_smart_block: {
    label: "تحديث بلوك ذكي (EN)",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  quad_categories_settings_update: {
    label: "تحديث المربع الرباعي",
    icon: Settings,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  en_quad_categories_settings_update: {
    label: "تحديث المربع الرباعي (EN)",
    icon: Settings,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  ur_quad_categories_settings_update: {
    label: "تحديث المربع الرباعي (UR)",
    icon: Settings,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  calendar_event_updated: {
    label: "تحديث حدث بالأجندة",
    icon: Calendar,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  calendar_assignment_updated: {
    label: "تحديث تكليف تحريري",
    icon: Calendar,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  calendar_assignment_completed: {
    label: "إنجاز تكليف تحريري",
    icon: CheckCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "update",
  },
  smart_entity_updated: {
    label: "تحديث كيان ذكي",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  update_analysis_status: {
    label: "تحديث حالة التحليل",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  articles_reordered: {
    label: "إعادة ترتيب المقالات",
    icon: ArrowUpDown,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-600 dark:text-indigo-400",
    badgeVariant: "secondary",
    category: "update",
  },
  reordered: {
    label: "إعادة ترتيب",
    icon: ArrowUpDown,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-600 dark:text-indigo-400",
    badgeVariant: "secondary",
    category: "update",
  },
  toggle_breaking: {
    label: "تبديل شارة عاجل",
    icon: Zap,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "update",
  },
  toggle_featured: {
    label: "تبديل حالة التمييز",
    icon: Star,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "update",
  },
  toggle_status: {
    label: "تغيير الحالة",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  experimentupdated: {
    label: "تحديث تجربة A/B",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  variantupdated: {
    label: "تحديث نسخة تجربة",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },
  storyupdated: {
    label: "تحديث ملف متابعة",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "update",
  },

  // ── الذكاء الاصطناعي والأتمتة ──
  auto_categorize_article: {
    label: "تصنيف ذكي تلقائي",
    icon: Sparkles,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "secondary",
    category: "ai",
  },
  generate_seo_metadata: {
    label: "توليد بيانات SEO ذكية",
    icon: SearchCheck,
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    textColor: "text-purple-600 dark:text-purple-400",
    badgeVariant: "secondary",
    category: "ai",
  },
  analyze_sentiment: {
    label: "تحليل المشاعر (AI)",
    icon: Sparkles,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "secondary",
    category: "ai",
  },
  batch_analyze_sentiment: {
    label: "تحليل مشاعر جماعي (AI)",
    icon: Sparkles,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "secondary",
    category: "ai",
  },
  calendar_ai_draft_generated: {
    label: "توليد مسودة ذكية",
    icon: Sparkles,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "secondary",
    category: "ai",
  },
  analyze: {
    label: "تحليل بالذكاء الاصطناعي",
    icon: Sparkles,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "secondary",
    category: "ai",
  },
  generate: {
    label: "توليد بالذكاء الاصطناعي",
    icon: Sparkles,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "secondary",
    category: "ai",
  },
  process: {
    label: "معالجة آلية",
    icon: Bot,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-600 dark:text-indigo-400",
    badgeVariant: "secondary",
    category: "ai",
  },

  // ── النشر وسير العمل التحريري ──
  publish: {
    label: "نشر",
    icon: Megaphone,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "default",
    category: "publish",
  },
  published: {
    label: "نشر",
    icon: Megaphone,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "default",
    category: "publish",
  },
  articlepublished: {
    label: "نشر مقال",
    icon: Megaphone,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "default",
    category: "publish",
  },
  published_opinion: {
    label: "نشر مقال رأي",
    icon: Megaphone,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "default",
    category: "publish",
  },
  approve_publish: {
    label: "اعتماد ونشر",
    icon: CheckCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "publish",
  },
  unpublish: {
    label: "إلغاء النشر",
    icon: Archive,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "publish",
  },
  unpublished: {
    label: "إلغاء النشر",
    icon: Archive,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "publish",
  },
  schedule: {
    label: "جدولة نشر",
    icon: Calendar,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "publish",
  },
  scheduled_opinion: {
    label: "جدولة مقال رأي",
    icon: Calendar,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "publish",
  },
  submitted_for_review: {
    label: "إرسال للمراجعة",
    icon: Send,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "publish",
  },
  draft_submitted: {
    label: "إرسال مسودة للمراجعة",
    icon: Send,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "publish",
  },
  approve: {
    label: "اعتماد",
    icon: CheckCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "publish",
  },
  approved_opinion: {
    label: "اعتماد مقال رأي",
    icon: CheckCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "publish",
  },
  reject: {
    label: "رفض",
    icon: XCircle,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "publish",
  },
  rejected_opinion: {
    label: "رفض مقال رأي",
    icon: XCircle,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "publish",
  },
  archive: {
    label: "أرشفة",
    icon: Archive,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "publish",
  },
  archived: {
    label: "أرشفة",
    icon: Archive,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "publish",
  },
  bulk_archive: {
    label: "أرشفة جماعية",
    icon: Archive,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "publish",
  },
  bulk_archived: {
    label: "أرشفة جماعية",
    icon: Archive,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "publish",
  },
  restored: {
    label: "استعادة من الأرشيف",
    icon: RotateCcw,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "publish",
  },
  restore_version: {
    label: "استعادة نسخة سابقة",
    icon: RotateCcw,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "publish",
  },
  featured: {
    label: "إضافة للمميز",
    icon: Star,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "default",
    category: "publish",
  },
  unfeatured: {
    label: "إزالة من المميز",
    icon: StarOff,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "secondary",
    category: "publish",
  },

  // ── الحذف ──
  delete: {
    label: "حذف",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  deleted: {
    label: "حذف",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  deleted_opinion: {
    label: "حذف مقال رأي",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  permanent_delete: {
    label: "حذف نهائي",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  deleted_permanently: {
    label: "حذف نهائي",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  bulk_delete: {
    label: "حذف جماعي",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  bulk_deleted_permanently: {
    label: "حذف جماعي نهائي",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  delete_smart_block: {
    label: "حذف بلوك ذكي",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  delete_en_smart_block: {
    label: "حذف بلوك ذكي (EN)",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  calendar_event_deleted: {
    label: "حذف حدث من الأجندة",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  calendar_reminder_deleted: {
    label: "حذف تذكير من الأجندة",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  smart_entity_deleted: {
    label: "حذف كيان ذكي",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  experimentdeleted: {
    label: "حذف تجربة A/B",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  variantdeleted: {
    label: "حذف نسخة تجربة",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },
  storydeleted: {
    label: "حذف ملف متابعة",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "delete",
  },

  // ── البوت والنشر الاجتماعي ──
  bot_schedule_stopped: {
    label: "إيقاف جدولة البوت",
    icon: Bot,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "bot",
  },
  bot_publisher_token_issued: {
    label: "إصدار توكن ناشر للبوت",
    icon: KeyRound,
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
    textColor: "text-teal-600 dark:text-teal-400",
    badgeVariant: "default",
    category: "security",
  },
  bot_publisher_token_revoked: {
    label: "إبطال توكن ناشر للبوت",
    icon: Ban,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "security",
  },
  bot_publisher_token_rotated: {
    label: "تدوير توكن ناشر للبوت",
    icon: RefreshCcw,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "security",
  },
  bot_social_suggest: {
    label: "اقتراح منشور اجتماعي (بوت)",
    icon: Share2,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "bot",
  },
  bot_social_publish: {
    label: "نشر اجتماعي عبر البوت",
    icon: Share2,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-600 dark:text-indigo-400",
    badgeVariant: "default",
    category: "bot",
  },
  bot_social_schedule: {
    label: "جدولة منشور اجتماعي (بوت)",
    icon: Calendar,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "bot",
  },
  bot_social_cancel: {
    label: "إلغاء منشور اجتماعي (بوت)",
    icon: XCircle,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "bot",
  },

  // ── الصلاحيات والأمان والحسابات ──
  login: {
    label: "تسجيل دخول",
    icon: LogIn,
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
    textColor: "text-teal-600 dark:text-teal-400",
    badgeVariant: "outline",
    category: "security",
  },
  logout: {
    label: "تسجيل خروج",
    icon: LogOut,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "outline",
    category: "security",
  },
  enable_2fa: {
    label: "تفعيل التحقق الثنائي (2FA)",
    icon: ShieldCheck,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "security",
  },
  disable_2fa: {
    label: "تعطيل التحقق الثنائي (2FA)",
    icon: Unlock,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "security",
  },
  update_2fa_method: {
    label: "تحديث طريقة التحقق الثنائي",
    icon: ShieldCheck,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
    category: "security",
  },
  regenerate_backup_codes: {
    label: "توليد رموز احتياطية (2FA)",
    icon: KeyRound,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
    category: "security",
  },
  update_role_permissions: {
    label: "تعديل صلاحيات الدور",
    icon: ShieldCheck,
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    textColor: "text-orange-600 dark:text-orange-400",
    badgeVariant: "secondary",
    category: "security",
  },
  assign_role: {
    label: "تعيين دور وظيفي",
    icon: UserPlus,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "security",
  },
  remove_role: {
    label: "إزالة دور وظيفي",
    icon: UserMinus,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "security",
  },
  reset_password: {
    label: "إعادة ضبط كلمة المرور",
    icon: KeyRound,
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    textColor: "text-yellow-600 dark:text-yellow-400",
    badgeVariant: "secondary",
    category: "security",
  },
  change_password: {
    label: "تغيير كلمة المرور",
    icon: KeyRound,
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    textColor: "text-yellow-600 dark:text-yellow-400",
    badgeVariant: "secondary",
    category: "security",
  },
  ban: {
    label: "حظر حساب",
    icon: Ban,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "security",
  },
  unban: {
    label: "رفع الحظر",
    icon: CheckCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "security",
  },
  lock: {
    label: "قفل",
    icon: Lock,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
    category: "security",
  },
  unlock: {
    label: "فتح القفل",
    icon: Unlock,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
    category: "security",
  },

  // ── عمليات أخرى ──
  short_link: {
    label: "إنشاء رابط مختصر",
    icon: Link2,
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    textColor: "text-cyan-600 dark:text-cyan-400",
    badgeVariant: "secondary",
    category: "system",
  },
  update_settings: {
    label: "تحديث الإعدادات",
    icon: Settings,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "secondary",
    category: "system",
  },
  view: {
    label: "عرض",
    icon: Eye,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "outline",
  },
  view_stats: {
    label: "عرض الإحصاءات",
    icon: Eye,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "outline",
  },
  view_metrics: {
    label: "عرض المؤشرات",
    icon: Eye,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "outline",
  },
  list: {
    label: "استعراض القائمة",
    icon: Eye,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "outline",
  },
  export: {
    label: "تصدير بيانات",
    icon: Download,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-600 dark:text-indigo-400",
    badgeVariant: "secondary",
  },
  import: {
    label: "استيراد بيانات",
    icon: Upload,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-600 dark:text-indigo-400",
    badgeVariant: "secondary",
  },
  upload: {
    label: "رفع ملف",
    icon: Upload,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-600 dark:text-indigo-400",
    badgeVariant: "secondary",
  },
  send: {
    label: "إرسال",
    icon: Send,
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
    textColor: "text-teal-600 dark:text-teal-400",
    badgeVariant: "default",
  },
  survey_sent: {
    label: "إرسال استبيان",
    icon: Send,
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
    textColor: "text-teal-600 dark:text-teal-400",
    badgeVariant: "default",
  },
  moderate: {
    label: "مراجعة رقابية",
    icon: ShieldCheck,
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    textColor: "text-orange-600 dark:text-orange-400",
    badgeVariant: "secondary",
  },
  flag: {
    label: "إبلاغ",
    icon: Ban,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
  },
  link: {
    label: "ربط",
    icon: Link2,
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    textColor: "text-cyan-600 dark:text-cyan-400",
    badgeVariant: "secondary",
  },
  unlink: {
    label: "فك ارتباط",
    icon: Link2,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
  },
  cancel: {
    label: "إلغاء",
    icon: XCircle,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
  },
  record: {
    label: "تسجيل",
    icon: FileText,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "secondary",
  },
  seeded: {
    label: "تهيئة بيانات أولية",
    icon: Settings,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "secondary",
  },
  experimentstarted: {
    label: "بدء تجربة A/B",
    icon: Zap,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
  },
  experimentpaused: {
    label: "إيقاف مؤقت لتجربة A/B",
    icon: Archive,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
  },
  experimentcompleted: {
    label: "اكتمال تجربة A/B",
    icon: CheckCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
  },
  keyword_followed: {
    label: "متابعة كلمة مفتاحية",
    icon: Star,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
  },
  keyword_unfollowed: {
    label: "إلغاء متابعة كلمة مفتاحية",
    icon: StarOff,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "outline",
  },
  user_followed: {
    label: "متابعة كاتب",
    icon: UserPlus,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
  },
  user_unfollowed: {
    label: "إلغاء متابعة كاتب",
    icon: UserMinus,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "outline",
  },
  storyfollowed: {
    label: "متابعة قصة",
    icon: Star,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
  },
  storyunfollowed: {
    label: "إلغاء متابعة قصة",
    icon: StarOff,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "outline",
  },
  success: {
    label: "نجاح",
    icon: CheckCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
  },
  fail: {
    label: "فشل",
    icon: XCircle,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
  },
};

const defaultPresentation: ActionPresentation = {
  label: "عملية نظام",
  icon: Activity,
  bgColor: "bg-slate-100 dark:bg-slate-900/30",
  textColor: "text-slate-600 dark:text-slate-400",
  badgeVariant: "outline",
};

export function getActionPresentation(action: string, entityType?: string): ActionPresentation {
  const normalizedAction = (action || "").trim().toLowerCase().replace(/-/g, "_");
  const normalizedEntity = (entityType || "").trim().toLowerCase().replace(/-/g, "_");

  // تخصيص سياقي للروابط المختصرة عند كون العملية create
  if ((normalizedAction === "create" || normalizedAction === "created") && normalizedEntity === "short_link") {
    return actionPresentations.short_link;
  }

  if (actionPresentations[normalizedAction]) {
    return actionPresentations[normalizedAction];
  }

  // مطابقة آمنة تمنع الخلط بين publish/unpublish أو featured/unfeatured أو lock/unlock
  if (normalizedAction.includes("unpublish")) return actionPresentations.unpublish;
  if (normalizedAction.includes("unfeatured")) return actionPresentations.unfeatured;
  if (normalizedAction.includes("unban")) return actionPresentations.unban;
  if (normalizedAction.includes("unlock")) return actionPresentations.unlock;
  if (normalizedAction.includes("unfollow")) return actionPresentations.keyword_unfollowed;
  if (normalizedAction.includes("categorize")) return actionPresentations.auto_categorize_article;
  if (normalizedAction.includes("seo")) return actionPresentations.generate_seo_metadata;
  if (normalizedAction.includes("sentiment")) return actionPresentations.analyze_sentiment;
  if (normalizedAction.includes("permanently") || normalizedAction.includes("permanent_delete")) {
    return actionPresentations.deleted_permanently;
  }
  if (normalizedAction.includes("delete")) return actionPresentations.delete;
  if (normalizedAction.includes("archive")) return actionPresentations.archive;
  if (normalizedAction.includes("publish")) return actionPresentations.publish;
  if (normalizedAction.includes("schedule")) return actionPresentations.schedule;
  if (normalizedAction.includes("create")) return actionPresentations.create;
  if (normalizedAction.includes("update") || normalizedAction.includes("modify")) return actionPresentations.update;
  if (normalizedAction.includes("approve")) return actionPresentations.approve;
  if (normalizedAction.includes("reject")) return actionPresentations.reject;

  return { ...defaultPresentation, label: action || "عملية غير معروفة" };
}

export const entityTypeLabels: Record<string, string> = {
  article: "مقال",
  en_article: "مقال إنجليزي",
  ur_article: "مقال أردو",
  publisher_article: "مقال ناشر",
  publisher_credit: "رصيد ناشر",
  publisher: "ناشر / وكالة",
  bot_publisher_token: "توكن ناشر البوت",
  social_post: "منشور اجتماعي",
  comment: "تعليق",
  user: "مستخدم",
  category: "تصنيف",
  en_category: "تصنيف إنجليزي",
  ur_category: "تصنيف أردو",
  quad_categories_settings: "إعدادات المربع الرباعي",
  en_quad_categories_settings: "المربع الرباعي (EN)",
  ur_quad_categories_settings: "المربع الرباعي (UR)",
  media: "ملف وسائط",
  settings: "إعدادات النظام",
  system_setting: "إعدادات النظام",
  role: "دور وظيفي",
  permission: "صلاحية",
  "2fa": "التحقق الثنائي (2FA)",
  newsletter: "نشرة بريدية",
  tag: "وسم",
  article_tag: "وسم مقال",
  announcement: "تعميم",
  internal_announcement: "تعميم داخلي",
  reaction: "تفاعل",
  bookmark: "إشارة مرجعية",
  session: "جلسة",
  notification: "إشعار",
  smart_link: "رابط ذكي",
  short_link: "رابط مختصر",
  smart_block: "بلوك ذكي",
  en_smart_block: "بلوك ذكي (EN)",
  ur_smart_block: "بلوك ذكي (UR)",
  smart_entity: "كيان ذكي",
  smart_term: "مصطلح ذكي",
  entity_type: "نوع كيان",
  deep_analysis: "تحليل معمّق",
  audio_newsletter: "نشرة صوتية",
  muqtarab_topic: "موضوع مقترب",
  muqtarab_angle: "زاوية مقترب",
  angle: "زاوية مقترب",
  article_angle: "مقال مقترب",
  angle_submission: "مشاركة مقترب",
  ifox_article: "مقال آيفوكس",
  ifox_articles: "مقالات آيفوكس",
  ifox_category: "تصنيف آيفوكس",
  ifox_category_settings: "إعدادات تصنيف آيفوكس",
  ifox_media: "وسائط آيفوكس",
  ifox_schedule: "جدولة آيفوكس",
  ifox_settings: "إعدادات آيفوكس",
  ifox_ai: "ذكاء آيفوكس",
  ifox_analytics: "تحليلات آيفوكس",
  correspondent_application: "طلب مراسل",
  opinion_author_application: "طلب كاتب رأي",
  calendar_event: "حدث بالأجندة",
  calendar_assignment: "تكليف تحريري",
  calendar_reminder: "تذكير بالأجندة",
  calendar_ai_draft: "مسودة ذكية بالأجندة",
  campaign: "حملة إعلانية",
  ad: "إعلان",
  short: "فيديو قصير",
  story: "ملف متابعة",
  experiment: "تجربة A/B",
  experimentvariant: "نسخة تجربة A/B",
  survey: "استبيان",
  email_template: "قالب بريد",
  themes: "سمات الواجهة",
};

export function getEntityTypeLabel(entityType: string): string {
  const normalized = (entityType || "").trim().toLowerCase().replace(/-/g, "_");
  return entityTypeLabels[normalized] || entityType || "كيان غير معروف";
}

export function getActionIcon(action: string, entityType?: string) {
  return getActionPresentation(action, entityType).icon;
}

export function getActionLabel(action: string, entityType?: string): string {
  return getActionPresentation(action, entityType).label;
}

export function getActionBadgeVariant(action: string, entityType?: string): "default" | "secondary" | "destructive" | "outline" {
  return getActionPresentation(action, entityType).badgeVariant;
}

// ── تشخيص دقيق للمنفّذ (يميز بين المستخدم الفعلي، الذكاء الاصطناعي، البوت، النظام الآلي، والمستخدم المحذوف) ──

export interface ResolvedActivityActor {
  kind: "user" | "ai_system" | "bot_system" | "shortlink_system" | "system" | "deleted_user";
  name: string;
  subtitle: string;
  initials: string;
  profileImageUrl?: string | null;
  badge?: {
    label: string;
    tone: string;
  } | null;
}

const AI_ACTIONS = new Set([
  "auto_categorize_article",
  "generate_seo_metadata",
  "analyze_sentiment",
  "batch_analyze_sentiment",
  "calendar_ai_draft_generated",
  "analyze",
  "generate",
]);

export function resolveActivityActor(log: {
  userId: string | null;
  action: string;
  entityType: string;
  metadata?: Record<string, any> | null;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  } | null;
}): ResolvedActivityActor {
  const normAction = (log.action || "").trim().toLowerCase().replace(/-/g, "_");
  const normEntity = (log.entityType || "").trim().toLowerCase().replace(/-/g, "_");
  const isAiAction = AI_ACTIONS.has(normAction) || normEntity === "ifox_ai";
  const botName = typeof log.metadata?.bot === "string" && log.metadata.bot.trim() ? log.metadata.bot.trim() : null;
  const isBotChannel = Boolean(botName || (typeof log.metadata?.channel === "string" && log.metadata.channel.startsWith("bot-")));

  // 1) المستخدم موجود في قاعدة البيانات
  if (log.user && (log.user.firstName || log.user.lastName || log.user.email)) {
    const fullName = `${log.user.firstName || ""} ${log.user.lastName || ""}`.trim();
    const name = fullName || log.user.email;
    const initials =
      `${log.user.firstName?.[0] || ""}${log.user.lastName?.[0] || ""}`.trim() ||
      log.user.email?.[0]?.toUpperCase() ||
      "م";

    let badge: ResolvedActivityActor["badge"] = null;
    if (isAiAction) {
      badge = {
        label: "مساند الذكاء الاصطناعي",
        tone: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
      };
    } else if (isBotChannel) {
      badge = {
        label: botName ? `عبر بوت «${botName}»` : "عبر البوت",
        tone: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
      };
    }

    return {
      kind: "user",
      name,
      subtitle: log.user.email,
      initials,
      profileImageUrl: log.user.profileImageUrl,
      badge,
    };
  }

  // 2) لا يوجد userId إطلاقاً → عملية آلية من النظام (وليست مستخدماً محذوفاً!)
  if (!log.userId) {
    if (normEntity === "short_link") {
      return {
        kind: "shortlink_system",
        name: "النظام الآلي",
        subtitle: "خدمة اختصار الروابط التلقائية",
        initials: "🔗",
        badge: {
          label: "تلقائي",
          tone: "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300",
        },
      };
    }
    if (isAiAction) {
      return {
        kind: "ai_system",
        name: "محرك الذكاء الاصطناعي",
        subtitle: "معالجة ذكية تلقائية",
        initials: "AI",
        badge: {
          label: "ذكاء اصطناعي",
          tone: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
        },
      };
    }
    if (isBotChannel) {
      return {
        kind: "bot_system",
        name: botName ? `بوت «${botName}»` : "بوت النشر الآلي",
        subtitle: "عملية آلية عبر البوت",
        initials: "🤖",
        badge: {
          label: "بوت",
          tone: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
        },
      };
    }
    return {
      kind: "system",
      name: "النظام الآلي",
      subtitle: "عملية تلقائية من النظام",
      initials: "⚙️",
      badge: {
        label: "آلي",
        tone: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300",
      },
    };
  }

  // 3) يوجد userId في السجل لكن لم يُعثر على المستخدم في جدول users → مستخدم محذوف فعلياً
  return {
    kind: "deleted_user",
    name: "مستخدم محذوف",
    subtitle: `معرّف سابق: ${log.userId.slice(0, 8)}…`,
    initials: "×",
    badge: null,
  };
}

// ── قاموس تسميات الحقول بالعربية لعرض الفروقات (Diff) وملخص التعديلات ──

export const FIELD_LABELS_AR: Record<string, string> = {
  title: "العنوان",
  subtitle: "العنوان الفرعي",
  excerpt: "الموجز / الملخص",
  content: "محتوى المادة",
  status: "الحالة",
  newsType: "نوع الخبر",
  articleType: "تصنيف المادة",
  categoryId: "معرّف التصنيف",
  primary: "التصنيف الذكي الأساسي",
  suggested: "التصنيفات المقترحة",
  confidence: "نسبة الثقة",
  metaTitle: "عنوان محركات البحث (SEO)",
  seoTitle: "عنوان محركات البحث (SEO)",
  metaDescription: "وصف محركات البحث (SEO)",
  seoDescription: "وصف محركات البحث (SEO)",
  keywords: "الكلمات المفتاحية (SEO)",
  seoKeywords: "الكلمات المفتاحية (SEO)",
  socialTitle: "عنوان المشاركة الاجتماعية",
  socialDescription: "وصف المشاركة الاجتماعية",
  imageUrl: "الصورة البارزة",
  thumbnailUrl: "الصورة المصغرة",
  imageAltText: "النص البديل للصورة",
  isFeatured: "خبر مميز",
  isBreaking: "خبر عاجل",
  hideFromHomepage: "إخفاء من الرئيسية",
  displayOrder: "ترتيب العرض",
  slug: "الرابط الدائم (Slug)",
  englishSlug: "الرابط المختصر للمقال",
  shortCode: "الرمز المختصر",
  originalUrl: "الرابط الأصلي",
  publishedAt: "تاريخ النشر",
  scheduledAt: "موعد الجدولة",
  reviewNotes: "ملاحظات المراجعة / الأرشفة",
  reviewStatus: "حالة المراجعة",
  authorId: "معرّف الكاتب",
  reporterId: "معرّف المراسل",
  role: "الدور الوظيفي",
  email: "البريد الإلكتروني",
  firstName: "الاسم الأول",
  lastName: "اسم العائلة",
  phoneNumber: "رقم الجوال",
  nameAr: "الاسم بالعربية",
  nameEn: "الاسم بالإنجليزية",
  name: "الاسم",
  description: "الوصف",
  count: "العدد المتأثر",
  provider: "مزوّد الذكاء الاصطناعي",
  model: "نموذج الذكاء الاصطناعي",
  reason: "السبب",
  revokedAt: "تاريخ الإبطال",
};

const STATUS_VALUES_AR: Record<string, string> = {
  published: "منشور",
  draft: "مسودة",
  scheduled: "مجدول",
  archived: "مؤرشف",
  ready_to_publish: "جاهز للنشر",
  pending_review: "بانتظار المراجعة",
  needs_revision: "يحتاج تعديل",
  approved: "معتمد",
  rejected: "مرفوض",
  breaking: "عاجل",
  regular: "عادي",
  news: "خبر",
  opinion: "مقال رأي",
  analysis: "تحليل",
  column: "عمود",
  visible: "مرئي",
  hidden: "مخفي",
  active: "نشط",
  inactive: "غير نشط",
};

const IGNORED_DIFF_KEYS = new Set([
  "id",
  "updatedAt",
  "updated_at",
  "createdAt",
  "created_at",
  "lastEditedAt",
  "last_edited_at",
  "views",
  "engagementScore",
  "commentsCount",
  "reactionsCount",
]);

function stripHtmlPreview(value: string, maxLen = 180): string {
  const plain = value
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}… (${plain.length.toLocaleString("en-US")} حرف)`;
}

export function formatAuditFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "number") {
    if (key === "confidence" && value <= 1 && value > 0) {
      return `${Math.round(value * 100)}%`;
    }
    if (key === "confidence" && value > 1 && value <= 100) {
      return `${Math.round(value)}%`;
    }
    return value.toLocaleString("en-US");
  }
  if (typeof value === "string") {
    if (STATUS_VALUES_AR[value]) return STATUS_VALUES_AR[value];
    if (key === "content" || /<[a-z][\s\S]*>/i.test(value)) {
      return stripHtmlPreview(value);
    }
    if (value.length > 220) {
      return `${value.slice(0, 220)}…`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      return value.slice(0, 12).join("، ") + (value.length > 12 ? ` (+${value.length - 12})` : "");
    }
    return `${value.length.toLocaleString("en-US")} عناصر`;
  }
  if (typeof value === "object") {
    try {
      const str = JSON.stringify(value);
      return str.length > 160 ? `${str.slice(0, 160)}…` : str;
    } catch {
      return "[كائن بيانات]";
    }
  }
  return String(value);
}

export interface StructuredFieldDiff {
  key: string;
  label: string;
  oldFormatted: string | null;
  newFormatted: string | null;
  isUrl?: boolean;
}

export function computeStructuredDiff(
  oldValue: Record<string, unknown> | null | undefined,
  newValue: Record<string, unknown> | null | undefined
): StructuredFieldDiff[] {
  const ov = oldValue && typeof oldValue === "object" ? oldValue : null;
  const nv = newValue && typeof newValue === "object" ? newValue : null;
  if (!ov && !nv) return [];

  // في حال وجود القديم والجديد معاً: نعرض فقط الحقول التي تغيرت فعلاً
  if (ov && nv) {
    const allKeys = Array.from(new Set([...Object.keys(nv), ...Object.keys(ov)]));
    const diffs: StructuredFieldDiff[] = [];

    for (const key of allKeys) {
      if (IGNORED_DIFF_KEYS.has(key)) continue;
      const before = ov[key];
      const after = nv[key];
      if (JSON.stringify(before ?? null) === JSON.stringify(after ?? null)) continue;

      diffs.push({
        key,
        label: FIELD_LABELS_AR[key] || key,
        oldFormatted: formatAuditFieldValue(key, before),
        newFormatted: formatAuditFieldValue(key, after),
        isUrl: key === "originalUrl" || key === "imageUrl" || key === "thumbnailUrl",
      });
    }
    return diffs;
  }

  // في حال وجود أحدهما فقط (إنشاء أو حذف أو تصنيف ذكي أو رابط مختصر): نعرض أهم الحقول المفيدة
  const target = nv || ov || {};
  const priorityKeys = [
    "title",
    "subtitle",
    "status",
    "newsType",
    "primary",
    "confidence",
    "suggested",
    "metaTitle",
    "seoTitle",
    "metaDescription",
    "seoDescription",
    "keywords",
    "seoKeywords",
    "shortCode",
    "originalUrl",
    "nameAr",
    "name",
    "email",
    "role",
    "count",
    "reviewNotes",
    "reason",
    "provider",
    "model",
    "revokedAt",
  ];

  const chosenKeys = [
    ...priorityKeys.filter((k) => k in target && target[k] !== null && target[k] !== undefined && target[k] !== ""),
    ...Object.keys(target).filter(
      (k) =>
        !priorityKeys.includes(k) &&
        !IGNORED_DIFF_KEYS.has(k) &&
        target[k] !== null &&
        target[k] !== undefined &&
        target[k] !== "" &&
        typeof target[k] !== "object"
    ),
  ].slice(0, 10);

  return chosenKeys.map((key) => ({
    key,
    label: FIELD_LABELS_AR[key] || key,
    oldFormatted: ov ? formatAuditFieldValue(key, ov[key]) : null,
    newFormatted: nv ? formatAuditFieldValue(key, nv[key]) : null,
    isUrl: key === "originalUrl" || key === "imageUrl" || key === "thumbnailUrl",
  }));
}

export interface ExtractedLogSummary {
  title: string | null;
  detail: string | null;
  url: string | null;
  statusLabel: string | null;
  shortCode: string | null;
}

export function extractLogSummary(log: {
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, any> | null;
  newValue?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  entityInfo?: {
    title: string | null;
    subtitle?: string | null;
    url?: string | null;
    status?: string | null;
  } | null;
}): ExtractedLogSummary {
  const nv = log.newValue || {};
  const ov = log.oldValue || {};
  const normAction = (log.action || "").trim().toLowerCase().replace(/-/g, "_");
  const normEntity = (log.entityType || "").trim().toLowerCase().replace(/-/g, "_");

  const title: string | null =
    log.entityInfo?.title ||
    (typeof nv.title === "string" && nv.title.trim() ? nv.title.trim() : null) ||
    (typeof ov.title === "string" && ov.title.trim() ? ov.title.trim() : null) ||
    (typeof nv.nameAr === "string" && nv.nameAr.trim() ? nv.nameAr.trim() : null) ||
    (typeof nv.name === "string" && nv.name.trim() ? nv.name.trim() : null) ||
    (typeof nv.email === "string" && nv.email.trim() ? nv.email.trim() : null) ||
    null;

  const shortCode = typeof nv.shortCode === "string" ? nv.shortCode : null;
  const rawStatus = log.entityInfo?.status || (typeof nv.status === "string" ? nv.status : null);
  const statusLabel = rawStatus ? STATUS_VALUES_AR[rawStatus] || rawStatus : null;

  let detail: string | null = log.entityInfo?.subtitle || null;

  if (!detail) {
    if (normAction === "auto_categorize_article" && typeof nv.primary === "string") {
      const suggested =
        Array.isArray(nv.suggested) && nv.suggested.length > 0
          ? ` · مقترحات: ${nv.suggested.slice(0, 3).join("، ")}`
          : "";
      detail = `التصنيف الذكي: ${nv.primary}${suggested}`;
    } else if (normAction === "generate_seo_metadata") {
      if (typeof nv.metaTitle === "string" && nv.metaTitle.trim()) {
        detail = `عنوان SEO: ${nv.metaTitle}`;
      } else {
        detail = "توليد عنوان ووصف محركات البحث والكلمات المفتاحية";
      }
    } else if (normEntity === "short_link") {
      const orig = typeof nv.originalUrl === "string" ? nv.originalUrl : null;
      detail = shortCode ? `sabq.org/s/${shortCode}` : orig;
    } else if (ov && nv && Object.keys(ov).length > 0 && Object.keys(nv).length > 0) {
      const diffs = computeStructuredDiff(ov, nv);
      if (diffs.length > 0) {
        const labels = diffs.slice(0, 4).map((d) => d.label);
        detail = `الحقول المعدّلة: ${labels.join("، ")}${diffs.length > 4 ? ` (+${diffs.length - 4})` : ""}`;
      }
    } else if (typeof log.metadata?.reason === "string" && log.metadata.reason.trim()) {
      detail = `السبب: ${log.metadata.reason.trim()}`;
    } else if (typeof nv.reviewNotes === "string" && nv.reviewNotes.trim()) {
      detail = `ملاحظة: ${nv.reviewNotes.trim()}`;
    }
  }

  return {
    title,
    detail,
    url: log.entityInfo?.url || (typeof nv.originalUrl === "string" ? nv.originalUrl : null),
    statusLabel,
    shortCode,
  };
}
