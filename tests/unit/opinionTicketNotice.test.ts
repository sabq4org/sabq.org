import { describe, expect, it } from "vitest";
import {
  buildOpinionTicketStaffNotice,
  countUnansweredTickets,
  isOpinionDeskViewer,
  isOpinionTicketNotifyRecipient,
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

describe("opinion ticket notice recipients", () => {
  it("notifies system admins only", () => {
    expect(isOpinionTicketNotifyRecipient("admin", [])).toBe(true);
    expect(isOpinionTicketNotifyRecipient("system_admin", ["system_admin"])).toBe(true);
  });

  it("does not notify editors", () => {
    expect(isOpinionTicketNotifyRecipient("editor", ["editor"])).toBe(false);
    expect(isOpinionTicketNotifyRecipient("reporter", ["reporter", "editor"])).toBe(false);
  });

  it("ignores a leftover admin row on an account shown as a reader", () => {
    expect(isOpinionTicketNotifyRecipient("reader", ["admin"])).toBe(false);
    expect(isOpinionTicketNotifyRecipient(null, ["system_admin"])).toBe(false);
    expect(isOpinionTicketNotifyRecipient("", ["admin"])).toBe(false);
  });

  it("keeps a staff member whose admin role sits only in user_roles", () => {
    expect(isOpinionTicketNotifyRecipient("content_manager", ["content_manager", "admin"])).toBe(true);
  });

  it("excludes contributors and readers", () => {
    expect(isOpinionTicketNotifyRecipient("opinion_author", ["opinion_author"])).toBe(false);
    expect(isOpinionTicketNotifyRecipient("reader", [])).toBe(false);
  });
});

describe("opinion ticket desk viewers", () => {
  it("lets admins and editors open all tickets", () => {
    expect(isOpinionDeskViewer("admin", [])).toBe(true);
    expect(isOpinionDeskViewer("editor", ["editor"])).toBe(true);
  });

  it("does not let a reader with a leftover desk row open all tickets", () => {
    expect(isOpinionDeskViewer("reader", ["admin"])).toBe(false);
    expect(isOpinionDeskViewer("reader", ["editor", "reader"])).toBe(false);
  });
});
