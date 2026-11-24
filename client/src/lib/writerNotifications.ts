// إشعارات لوحة الكاتب (المرحلة 3): التصنيف والتجميع باليوم. منطق خالص يُختبر.

export type WriterNotificationCategory = "articles" | "tickets" | "files" | "meetings";

export const WRITER_NOTIFICATION_FILTERS: Array<{ key: "all" | "unread" | WriterNotificationCategory; label: string }> = [
  { key: "all", label: "الكل" },
  { key: "unread", label: "غير مقروءة" },
  { key: "articles", label: "مقالاتي" },
  { key: "tickets", label: "استفساراتي" },
  { key: "files", label: "ملفات وتعاميم" },
  { key: "meetings", label: "الاجتماعات" },
];

export type WriterNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  deeplink: string | null;
  read: boolean;
  createdAt: string;
};

/** التصنيف من نوع الإشعار ورابطه. ما لا يُعرف يُحسب على «مقالاتي». */
export function writerNotificationCategory(type: string, deeplink?: string | null): WriterNotificationCategory {
  const t = type || "";
  const link = deeplink || "";
  if (/WriterFile/i.test(t) || link.includes("/opinion-author/files")) return "files";
  if (/ticket/i.test(t) || link.includes("/opinion-author/tickets")) return "tickets";
  if (/meeting/i.test(t) || link.includes("/meetings")) return "meetings";
  return "articles";
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** «اليوم» و«أمس» و«هذا الأسبوع» و«أقدم» بتوقيت الجهاز. */
export function writerNotificationDay(createdAt: string, now: number = Date.now()): string {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return "أقدم";
  const today = startOfDay(now);
  const day = 24 * 60 * 60 * 1000;
  if (t >= today) return "اليوم";
  if (t >= today - day) return "أمس";
  if (t >= today - 6 * day) return "هذا الأسبوع";
  return "أقدم";
}

/** الوقت للإشعار: الساعة لليوم وأمس، والتاريخ لما قبلهما. أرقام لاتينية وتقويم ميلادي. */
export function writerNotificationTime(createdAt: string, now: number = Date.now()): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  const group = writerNotificationDay(createdAt, now);
  if (group === "اليوم" || group === "أمس") {
    return d.toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long" });
}

export function groupWriterNotifications<T extends { createdAt: string }>(items: T[], now: number = Date.now()) {
  const order = ["اليوم", "أمس", "هذا الأسبوع", "أقدم"];
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = writerNotificationDay(item.createdAt, now);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return order.filter((k) => groups.has(k)).map((day) => ({ day, items: groups.get(day)! }));
}

export function asWriterNotifications(raw: unknown): WriterNotification[] {
  const list = (raw as { notifications?: unknown } | null)?.notifications;
  return Array.isArray(list) ? (list as WriterNotification[]) : [];
}

export const WRITER_NOTIFICATIONS_QUERY = ["/api/notifications", { limit: 100 }] as const;
