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
  Image,
  MessageSquare,
  Tag,
  Folder,
  Lock,
  Unlock,
  type LucideIcon,
} from "lucide-react";

export interface ActionPresentation {
  label: string;
  icon: LucideIcon;
  bgColor: string;
  textColor: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
}

const actionPresentations: Record<string, ActionPresentation> = {
  create: {
    label: "إنشاء",
    icon: PlusCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
  },
  update: {
    label: "تحديث",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
  },
  delete: {
    label: "حذف",
    icon: Trash2,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
  },
  publish: {
    label: "نشر",
    icon: Megaphone,
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
    textColor: "text-violet-600 dark:text-violet-400",
    badgeVariant: "default",
  },
  unpublish: {
    label: "إلغاء النشر",
    icon: Archive,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
  },
  approve: {
    label: "اعتماد",
    icon: CheckCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
  },
  reject: {
    label: "رفض",
    icon: XCircle,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
  },
  login: {
    label: "تسجيل دخول",
    icon: LogIn,
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
    textColor: "text-teal-600 dark:text-teal-400",
    badgeVariant: "outline",
  },
  logout: {
    label: "تسجيل خروج",
    icon: LogOut,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "outline",
  },
  view: {
    label: "عرض",
    icon: Eye,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "outline",
  },
  export: {
    label: "تصدير",
    icon: Download,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-600 dark:text-indigo-400",
    badgeVariant: "secondary",
  },
  import: {
    label: "استيراد",
    icon: Upload,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-600 dark:text-indigo-400",
    badgeVariant: "secondary",
  },
  archive: {
    label: "أرشفة",
    icon: Archive,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary",
  },
  featured: {
    label: "إضافة للمميز",
    icon: Star,
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    textColor: "text-amber-600 dark:text-amber-400",
    badgeVariant: "default",
  },
  unfeatured: {
    label: "إزالة من المميز",
    icon: StarOff,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "secondary",
  },
  send: {
    label: "إرسال",
    icon: Send,
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
    textColor: "text-teal-600 dark:text-teal-400",
    badgeVariant: "default",
  },
  ban: {
    label: "حظر",
    icon: Ban,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
  },
  unban: {
    label: "رفع الحظر",
    icon: CheckCircle,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
  },
  update_role_permissions: {
    label: "تعديل صلاحيات الدور",
    icon: ShieldCheck,
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    textColor: "text-orange-600 dark:text-orange-400",
    badgeVariant: "secondary",
  },
  assign_role: {
    label: "تعيين دور",
    icon: UserPlus,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
  },
  remove_role: {
    label: "إزالة دور",
    icon: UserMinus,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
  },
  short_link: {
    label: "إنشاء رابط مختصر",
    icon: Link2,
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
    textColor: "text-cyan-600 dark:text-cyan-400",
    badgeVariant: "secondary",
  },
  reset_password: {
    label: "إعادة ضبط كلمة المرور",
    icon: KeyRound,
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    textColor: "text-yellow-600 dark:text-yellow-400",
    badgeVariant: "secondary",
  },
  change_password: {
    label: "تغيير كلمة المرور",
    icon: KeyRound,
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    textColor: "text-yellow-600 dark:text-yellow-400",
    badgeVariant: "secondary",
  },
  update_settings: {
    label: "تحديث الإعدادات",
    icon: Settings,
    bgColor: "bg-slate-100 dark:bg-slate-900/30",
    textColor: "text-slate-600 dark:text-slate-400",
    badgeVariant: "secondary",
  },
  upload: {
    label: "رفع ملف",
    icon: Upload,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    textColor: "text-indigo-600 dark:text-indigo-400",
    badgeVariant: "secondary",
  },
  lock: {
    label: "قفل",
    icon: Lock,
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
    textColor: "text-rose-600 dark:text-rose-400",
    badgeVariant: "destructive",
  },
  unlock: {
    label: "فتح القفل",
    icon: Unlock,
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default",
  },
  moderate: {
    label: "مراجعة",
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
  modify: {
    label: "تعديل",
    icon: RefreshCcw,
    bgColor: "bg-sky-100 dark:bg-sky-900/30",
    textColor: "text-sky-600 dark:text-sky-400",
    badgeVariant: "secondary",
  },
};

const defaultPresentation: ActionPresentation = {
  label: "",
  icon: Activity,
  bgColor: "bg-slate-100 dark:bg-slate-900/30",
  textColor: "text-slate-600 dark:text-slate-400",
  badgeVariant: "outline",
};

export function getActionPresentation(action: string): ActionPresentation {
  const normalizedAction = action.toLowerCase().replace(/-/g, "_");
  
  if (actionPresentations[normalizedAction]) {
    return actionPresentations[normalizedAction];
  }
  
  for (const [key, value] of Object.entries(actionPresentations)) {
    if (normalizedAction.includes(key)) {
      return { ...value, label: value.label };
    }
  }
  
  return { ...defaultPresentation, label: action };
}

export const entityTypeLabels: Record<string, string> = {
  article: "مقال",
  comment: "تعليق",
  user: "مستخدم",
  category: "تصنيف",
  media: "ملف وسائط",
  settings: "إعدادات",
  role: "دور",
  permission: "صلاحية",
  newsletter: "نشرة",
  tag: "وسم",
  announcement: "إعلان",
  reaction: "تفاعل",
  bookmark: "إشارة مرجعية",
  session: "جلسة",
  notification: "إشعار",
  smart_link: "رابط ذكي",
  short_link: "رابط مختصر",
  deep_analysis: "تحليل معمق",
  audio_newsletter: "نشرة صوتية",
  muqtarab_topic: "موضوع مقترب",
  muqtarab_angle: "زاوية مقترب",
  ifox_article: "مقال آيفوكس",
  publisher: "ناشر",
  campaign: "حملة إعلانية",
  ad: "إعلان",
};

export function getEntityTypeLabel(entityType: string): string {
  const normalized = entityType.toLowerCase().replace(/-/g, "_");
  return entityTypeLabels[normalized] || "كيان غير معروف";
}

export function getActionIcon(action: string) {
  return getActionPresentation(action).icon;
}

export function getActionLabel(action: string): string {
  return getActionPresentation(action).label;
}

export function getActionBadgeVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  return getActionPresentation(action).badgeVariant;
}
