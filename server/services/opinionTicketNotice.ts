/** نسخ إشعار استفسارات الكتّاب — بلا قاعدة بيانات حتى يُختبر بمعزل. */
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";
import { isReaderLikeRole, normalizeRoleKey } from "@shared/effectiveRoles";

export const OPINION_TICKET_NOTICE_TYPE = "OpinionTicketInquiry";

export type OpinionTicketNoticeKind = "new_ticket" | "writer_message";

export function shouldNotifyDeskOfTicketMessage(senderRole: "writer" | "admin"): boolean {
  return senderRole === "writer";
}

/** من يصله إشعار الاستفسار (صندوق + بريد): مسؤول/مدير النظام فقط، لا المحرر. */
export const OPINION_TICKET_NOTIFY_ROLE_NAMES: readonly string[] = [...SUPERUSER_ROLE_NAMES];

/** من يفتح كل التذاكر في مركز رسائل الكتّاب. */
export const OPINION_DESK_ROLE_NAMES: readonly string[] = [...SUPERUSER_ROLE_NAMES, "editor"];

/**
 * دور في users.role من القائمة يكفي. أما صف user_roles وحده فلا يُحتسب إذا كان
 * users.role قارئًا: هذا صف قديم بقي بعد تخفيض الدور، واللوحة تُظهر صاحبه «قارئ».
 */
export function hasLiveRole(
  legacyRole: string | null | undefined,
  rbacRoleNames: Array<string | null | undefined>,
  allowed: readonly string[],
): boolean {
  const set = new Set(allowed);
  if (set.has(normalizeRoleKey(legacyRole))) return true;
  if (isReaderLikeRole(legacyRole)) return false;
  return rbacRoleNames.some((name) => set.has(normalizeRoleKey(name)));
}

/** هل يصل إشعار الاستفسار (وفيه نص رسالة المساهم) إلى هذا الحساب؟ */
export function isOpinionTicketNotifyRecipient(
  legacyRole: string | null | undefined,
  rbacRoleNames: Array<string | null | undefined>,
): boolean {
  return hasLiveRole(legacyRole, rbacRoleNames, OPINION_TICKET_NOTIFY_ROLE_NAMES);
}

/** هل يرى هذا الحساب كل التذاكر في مركز الرسائل؟ */
export function isOpinionDeskViewer(
  legacyRole: string | null | undefined,
  rbacRoleNames: Array<string | null | undefined>,
): boolean {
  return hasLiveRole(legacyRole, rbacRoleNames, OPINION_DESK_ROLE_NAMES);
}

export function countUnansweredTickets(rows: Array<{ status?: string | null }>): number {
  return rows.reduce((total, row) => total + (row.status === "open" ? 1 : 0), 0);
}

function clip(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

export function buildOpinionTicketStaffNotice(input: {
  kind: OpinionTicketNoticeKind;
  ticketId: string;
  title: string;
  writerName?: string | null;
  message: string;
}): {
  type: string;
  title: string;
  body: string;
  deeplink: string;
  metadata: { ticketId: string; kind: OpinionTicketNoticeKind };
} {
  const who = input.writerName?.trim() || "مساهم";
  const subject = clip(input.title || "استفسار", 80);
  const excerpt = clip(input.message || "", 180);
  const title =
    input.kind === "new_ticket"
      ? `استفسار جديد من ${who}`
      : `رسالة جديدة من ${who}`;
  const body = excerpt ? `«${subject}» — ${excerpt}` : `«${subject}»`;
  return {
    type: OPINION_TICKET_NOTICE_TYPE,
    title,
    body,
    deeplink: `/dashboard/opinion-tickets/${input.ticketId}`,
    metadata: { ticketId: input.ticketId, kind: input.kind },
  };
}
