import { describe, expect, it } from "vitest";
import {
  buildOpinionTicketStaffNotice,
  countUnansweredTickets,
  shouldNotifyDeskOfTicketMessage,
} from "../../server/services/opinionTicketNotice";

describe("opinion ticket desk notices", () => {
  it("notifies the desk only when the writer sends", () => {
    expect(shouldNotifyDeskOfTicketMessage("writer")).toBe(true);
    expect(shouldNotifyDeskOfTicketMessage("admin")).toBe(false);
  });

  it("counts open tickets as unanswered", () => {
    expect(
      countUnansweredTickets([
        { status: "open" },
        { status: "answered" },
        { status: "open" },
        { status: "closed" },
      ]),
    ).toBe(2);
  });

  it("builds an in-app notice that opens the ticket", () => {
    const notice = buildOpinionTicketStaffNotice({
      kind: "new_ticket",
      ticketId: "t-1",
      title: "موعد المقال",
      writerName: "سارة",
      message: "متى آخر موعد للإرسال هذا الأسبوع؟",
    });
    expect(notice.type).toBe("OpinionTicketInquiry");
    expect(notice.title).toContain("سارة");
    expect(notice.body).toContain("موعد المقال");
    expect(notice.deeplink).toBe("/dashboard/opinion-tickets/t-1");
    expect(notice.metadata.kind).toBe("new_ticket");
  });

  it("uses a reply title for a later writer message", () => {
    const notice = buildOpinionTicketStaffNotice({
      kind: "writer_message",
      ticketId: "t-2",
      title: "متابعة",
      writerName: null,
      message: "أضفت التفاصيل",
    });
    expect(notice.title).toContain("رسالة جديدة");
    expect(notice.title).toContain("مساهم");
  });
});
