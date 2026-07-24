import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

/**
 * القيم التي تكتبها مسارات البريد والواتساب فعلياً في `status`.
 * القوائم القديمة كانت تعرض `success` / `drafted` / `processing` وهي أسماء
 * لا يكتبها الخادم، فكان الفلتر يرجع صفر نتائج والبادج يعرض الحالة بالإنجليزية.
 */
export type LogStatus = "received" | "processed" | "published" | "rejected" | "failed";

interface StatusMeta {
  label: string;
  className: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  received: {
    label: "وارد",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  processed: {
    label: "تمت المعالجة",
    className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  },
  published: {
    label: "منشور",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  drafted: {
    label: "مسودة",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  rejected: {
    label: "مرفوض",
    className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  failed: {
    label: "فشل",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  },
};

export function getLogStatusMeta(status?: string | null): StatusMeta {
  if (status && STATUS_META[status]) return STATUS_META[status];
  return { label: status || "غير معروف", className: "bg-muted text-muted-foreground" };
}

export const EMAIL_STATUS_FILTERS = [
  { value: "all", label: "الكل" },
  { value: "received", label: "وارد" },
  { value: "published", label: "منشور" },
  { value: "processed", label: "مسودة" },
  { value: "rejected", label: "مرفوض" },
  { value: "failed", label: "فشل" },
];

export const WHATSAPP_STATUS_FILTERS = [
  { value: "all", label: "الكل" },
  { value: "received", label: "وارد" },
  { value: "processed", label: "تمت المعالجة" },
  { value: "rejected", label: "مرفوض" },
];

/** صف واحد بتاريخ فاسد كان يُسقط التبويب كاملاً بـ RangeError. */
function toValidDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelativeSafe(value?: string | Date | null): string {
  const date = toValidDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true, locale: ar }) : "—";
}

export function formatDateTimeSafe(value?: string | Date | null): string {
  const date = toValidDate(value);
  return date ? format(date, "dd MMM yyyy HH:mm", { locale: ar }) : "—";
}
