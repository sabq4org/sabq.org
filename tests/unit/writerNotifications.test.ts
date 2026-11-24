import { describe, expect, it } from "vitest";
import {
  groupWriterNotifications,
  writerNotificationCategory,
  writerNotificationDay,
} from "@/lib/writerNotifications";
import { hasWriterRole, isWriterOnly } from "@/lib/writerAudience";

describe("writerNotificationCategory", () => {
  it("sorts known writer notifications", () => {
    expect(writerNotificationCategory("OpinionWriterFileNew")).toBe("files");
    expect(writerNotificationCategory("OpinionTicketReply")).toBe("tickets");
    expect(writerNotificationCategory("meeting_started")).toBe("meetings");
    expect(writerNotificationCategory("PublicBylineApproved")).toBe("articles");
    expect(writerNotificationCategory("Something", "/dashboard/opinion-author/tickets/5")).toBe("tickets");
  });
});

describe("writerNotificationDay", () => {
  const now = new Date(2026, 10, 24, 12, 0).getTime();
  it("groups by local day", () => {
    expect(writerNotificationDay(new Date(2026, 10, 24, 8).toISOString(), now)).toBe("اليوم");
    expect(writerNotificationDay(new Date(2026, 10, 23, 23).toISOString(), now)).toBe("أمس");
    expect(writerNotificationDay(new Date(2026, 10, 19, 9).toISOString(), now)).toBe("هذا الأسبوع");
    expect(writerNotificationDay(new Date(2026, 9, 1).toISOString(), now)).toBe("أقدم");
  });
  it("keeps group order", () => {
    const groups = groupWriterNotifications(
      [
        { createdAt: new Date(2026, 9, 1).toISOString() },
        { createdAt: new Date(2026, 10, 24, 9).toISOString() },
      ],
      now,
    );
    expect(groups.map((g) => g.day)).toEqual(["اليوم", "أقدم"]);
  });
});

describe("writer audience", () => {
  it("detects writer-only accounts", () => {
    expect(isWriterOnly({ roles: ["opinion_author"] })).toBe(true);
    expect(isWriterOnly({ roles: ["reporter", "reader"] })).toBe(true);
    expect(isWriterOnly({ roles: ["opinion_author", "editor"] })).toBe(false);
    expect(isWriterOnly({ roles: ["opinion_author"], permissions: ["*"] })).toBe(false);
    expect(isWriterOnly({ role: "editor" })).toBe(false);
    expect(hasWriterRole({ roles: ["opinion_author", "editor"] })).toBe(true);
  });
});
