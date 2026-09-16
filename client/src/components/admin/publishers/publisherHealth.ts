/**
 * حالة الوكالة الواحدة كما يشتقها الخادم (`derivePublisherHealth`).
 * كل ألوان البطاقة تُشتق من هنا لا من عدد الأيام المتبقية وحده — البطاقة
 * القديمة كانت تعرض شارة خضراء «الباقة: بعد ٣٠٠ يوم» لوكالة موقوفة.
 */
export type PublisherHealth =
  | "suspended"
  | "window_ended"
  | "no_package"
  | "package_expired"
  | "credits_out"
  | "expiring_soon"
  | "healthy";

export interface HealthMeta {
  label: string;
  /** نبرة الشارة داخل البطاقة */
  badgeClass: string;
  /** شريط جانبي يلوّن البطاقة كلها */
  accentClass: string;
  /** الوكالة قادرة على النشر الآن؟ يحدد إن كان يُسمح بأي لون أخضر */
  operational: boolean;
}

export const HEALTH_META: Record<PublisherHealth, HealthMeta> = {
  suspended: {
    label: "موقوفة",
    badgeClass: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    accentClass: "bg-red-500",
    operational: false,
  },
  window_ended: {
    label: "انتهت نافذة النشر",
    badgeClass: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    accentClass: "bg-red-500",
    operational: false,
  },
  package_expired: {
    label: "انتهت الباقة",
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200",
    accentClass: "bg-orange-500",
    operational: false,
  },
  credits_out: {
    label: "نفدت المواد",
    badgeClass: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-200",
    accentClass: "bg-orange-500",
    operational: false,
  },
  no_package: {
    label: "بلا باقة",
    badgeClass: "border-border bg-muted text-muted-foreground",
    accentClass: "bg-muted-foreground/40",
    operational: false,
  },
  expiring_soon: {
    label: "تنتهي قريباً",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    accentClass: "bg-amber-500",
    operational: true,
  },
  healthy: {
    label: "تعمل",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    accentClass: "bg-emerald-500",
    operational: true,
  },
};

export function getHealthMeta(health?: string | null): HealthMeta {
  return HEALTH_META[(health as PublisherHealth) ?? "no_package"] ?? HEALTH_META.no_package;
}

export const HEALTH_FILTERS = [
  { value: "all", label: "كل الوكالات" },
  { value: "attention", label: "تحتاج انتباه" },
  { value: "healthy", label: "تعمل بلا مشاكل" },
  { value: "expiring_soon", label: "تنتهي قريباً" },
  { value: "no_package", label: "بلا باقة" },
  { value: "package_expired", label: "انتهت باقتها" },
  { value: "credits_out", label: "نفدت موادها" },
  { value: "window_ended", label: "انتهت نافذتها" },
  { value: "suspended", label: "موقوفة" },
];

const ATTENTION: PublisherHealth[] = [
  "suspended",
  "window_ended",
  "package_expired",
  "credits_out",
  "no_package",
  "expiring_soon",
];

export function matchesHealthFilter(health: string, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return ATTENTION.includes(health as PublisherHealth);
  return health === filter;
}
