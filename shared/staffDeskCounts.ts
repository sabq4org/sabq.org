// عدّادات «مكتب سبق» في طلب واحد — GET /api/v1/staff/counts (2026-11-09).
// منطق خالص بلا قاعدة بيانات: حجب كل عدّاد بصلاحيته، ومجموع رقم الأيقونة.
// التوثيق: docs/systems/editorial/STAFF_APP_API.md § العدّادات.

import type { StaffCapabilities } from "./staffApp";
import type { StaffDeskEventKind, StaffDeskNotification } from "./staffNotifications";

/**
 * تنبيهات الجرس التي لا تدخل رقم الأيقونة: «مسودة جديدة» تُحسب أصلًا من
 * مصدرها (مقترحات التغريدات ومسودات الرأي)، فعدّها هنا يكرّر العنصر نفسه.
 */
export const STAFF_BADGE_EXCLUDED_BELL_KINDS: readonly StaffDeskEventKind[] = [
  "tweet_draft",
  "opinion_draft",
  // منذ 2026-11-10: تُحسب من تبويب «الأخبار» وصندوق الرسائل. مسودة البوت (news_bot_draft) لا مصدر آخر يعدّها فتبقى.
  "news_draft",
  "news_edit_request",
  "ticket_message",
];

/** الأعداد الخام قبل الحجب بالصلاحيات. null = فشل المصدر أو لم يُطلب. */
export interface StaffDeskRawCounts {
  tickets: number | null;
  social: number | null;
  opinionPending: number | null;
  newsReporters: number | null;
  newsEmail: number | null;
  editRequests: number | null;
  bellUnread: number | null;
  /** غير المقروء في الجرس دون STAFF_BADGE_EXCLUDED_BELL_KINDS. */
  bellActionable: number | null;
  bellLatest: StaffDeskNotification | null;
  urgentAlerts: number | null;
}

export interface StaffDeskCountsResponse {
  /** الوارد — يطابق GET /unread-counts. */
  inbox: { tickets: number; social: number; total: number };
  /** مسودات الرأي بانتظار المكتب — يطابق pendingCount في GET /opinion/board. */
  opinionPending: number;
  /** الأخبار — يطابق counts في GET /news. */
  news: { all: number; reporters: number; editRequests: number; email: number };
  /** الجرس — يطابق GET /notifications/unread. */
  notifications: { unreadCount: number; latest: StaffDeskNotification | null };
  /** تنبيهات الإدارة العاجلة — يطابق urgentCount في GET /alerts. خارج رقم الأيقونة. */
  urgentAlerts: number;
  /** رقم أيقونة التطبيق: كل ما ينتظر قرار هذا العضو، بلا تكرار. */
  badge: number;
  generatedAt: string;
}

type CountCapabilities = Pick<
  StaffCapabilities,
  "canTickets" | "canSocial" | "canOpinion" | "canNews" | "canPublisherNews" | "canAdminAlerts"
>;

function safeCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** هل يرى العضو أي تبويب من مركز التنبيهات؟ (القاعدة نفسها في visibleStaffDeskCategories). */
export function canSeeStaffDeskBell(caps: CountCapabilities): boolean {
  return Boolean(caps.canSocial?.view || caps.canOpinion?.view || caps.canPublisherNews);
}

/**
 * يحجب كل عدّاد بصلاحية مساره الأصلي (بلا صلاحية = 0، وlatest = null)
 * ويحسب رقم الأيقونة. المصدر الفاشل (null) يُعامل صفرًا.
 */
export function buildStaffDeskCounts(
  caps: CountCapabilities,
  raw: StaffDeskRawCounts,
  now: Date = new Date(),
): StaffDeskCountsResponse {
  const tickets = caps.canTickets ? safeCount(raw.tickets) : 0;
  const social = caps.canSocial?.view ? safeCount(raw.social) : 0;
  const opinionPending = caps.canOpinion?.view ? safeCount(raw.opinionPending) : 0;
  const reporters = caps.canNews ? safeCount(raw.newsReporters) : 0;
  const email = caps.canNews ? safeCount(raw.newsEmail) : 0;
  const editRequests = caps.canNews ? safeCount(raw.editRequests) : 0;
  const bell = canSeeStaffDeskBell(caps);
  const bellUnread = bell ? safeCount(raw.bellUnread) : 0;
  const bellActionable = bell ? Math.min(safeCount(raw.bellActionable), bellUnread) : 0;
  const urgentAlerts = caps.canAdminAlerts ? safeCount(raw.urgentAlerts) : 0;

  return {
    inbox: { tickets, social, total: tickets + social },
    opinionPending,
    news: { all: reporters + email + editRequests, reporters, editRequests, email },
    notifications: { unreadCount: bellUnread, latest: bell ? raw.bellLatest : null },
    urgentAlerts,
    // مقترحات التغريدات تُحسب مرة واحدة (هي نفسها social في الوارد).
    badge: tickets + social + opinionPending + reporters + email + editRequests + bellActionable,
    generatedAt: now.toISOString(),
  };
}
