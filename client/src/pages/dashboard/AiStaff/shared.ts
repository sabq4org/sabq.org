// فريق سبق الذكي — أنواع الواجهة (مطابقة لعقد server/services/aiStaffService.ts)
// وألوان الإدارات. لون الإدارة ثابت بالهوية (entity-fixed) لا بالترتيب.

export interface AiStaffKpis {
  todayOps: number;
  todaySuccessRate: number | null;
  monthOps: number;
  monthCostUsd: number;
  monthP95LatencyMs: number | null;
}

export interface AiStaffEntry {
  slug: string;
  employeeCode: string;
  nameAr: string;
  titleAr: string;
  bioAr: string;
  departmentKey: string;
  managerSlug: string | null;
  avatarUrl: string;
  featureKeys: string[];
  featureKeyPrefixes: string[];
  systems: string[];
  triggerMode: string;
  scheduleNoteAr: string;
  metricsSource: "gateway" | "pending";
  sortOrder: number;
  status: "active" | "paused";
  kpis: AiStaffKpis | null;
}

export interface AiStaffTeamPayload {
  generatedAt: string;
  departments: { key: string; labelAr: string; noteAr: string }[];
  staff: AiStaffEntry[];
  totals: {
    todayOps: number;
    todaySuccessRate: number | null;
    monthCostUsd: number;
    activeCount: number;
    totalCount: number;
  };
}

export interface AiStaffToolInfo {
  featureKey: string;
  displayName: string;
  primaryModel: string;
  fallbackCount: number;
  isEnabled: boolean;
}

export interface AiStaffWorkItem {
  createdAt: string;
  featureKey: string;
  featureName: string;
  operation: string;
  status: string;
  latencyMs: number;
  costUsd: number;
  taskType: string | null;
}

export interface AiStaffProfilePayload {
  member: AiStaffEntry;
  managerName: string | null;
  tools: AiStaffToolInfo[];
  recentWork: AiStaffWorkItem[];
}

/** لون تمييز كل إدارة — يظهر في وسام البطاقة وحرف الصورة الاحتياطي */
export const DEPARTMENT_COLORS: Record<string, string> = {
  rasd: "#0E76B8",
  tahrir: "#3A6B8F",
  sports: "#2F9E6E",
  media: "#7B6BAA",
  audience: "#C98A2B",
  quality: "#8A5A44",
};

export const WORK_STATUS_META: Record<string, { label: string; className: string }> = {
  success: { label: "نجاح", className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900" },
  fallback: { label: "تحويل", className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900" },
  failed: { label: "فشل", className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900" },
};

export const TRIGGER_MODE_LABELS: Record<string, string> = {
  cron: "دوام مجدول",
  "on-demand": "عند الطلب",
  inline: "فوري",
  continuous: "مستمر",
};

export function formatOps(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatCostUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** «قبل ٤٠ ثانية» — لعرض توقيت سجل الأعمال */
export function timeAgoAr(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `قبل ${seconds} ثانية`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `قبل ${days} يوم`;
}
