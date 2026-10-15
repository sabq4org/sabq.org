/** نسخ إشعار استفسارات الكتّاب — بلا قاعدة بيانات حتى يُختبر بمعزل. */

export const OPINION_TICKET_NOTICE_TYPE = "OpinionTicketInquiry";

export type OpinionTicketNoticeKind = "new_ticket" | "writer_message";

export function shouldNotifyDeskOfTicketMessage(senderRole: "writer" | "admin"): boolean {
  return senderRole === "writer";
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
