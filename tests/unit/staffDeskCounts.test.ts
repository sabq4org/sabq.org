import { describe, expect, it } from "vitest";
import {
  STAFF_BADGE_EXCLUDED_BELL_KINDS,
  buildStaffDeskCounts,
  canSeeStaffDeskBell,
  type StaffDeskRawCounts,
} from "../../shared/staffDeskCounts";

const NOW = new Date("2026-11-09T07:00:00Z");

const ALL = {
  canTickets: true,
  canSocial: { view: true, publish: true, schedule: true, reject: true },
  canOpinion: { view: true },
  canNews: true,
  canPublisherNews: true,
  canAdminAlerts: true,
} as Parameters<typeof buildStaffDeskCounts>[0];

const NONE = {
  canTickets: false,
  canSocial: { view: false, publish: false, schedule: false, reject: false },
  canOpinion: { view: false },
  canNews: false,
  canPublisherNews: false,
  canAdminAlerts: false,
} as Parameters<typeof buildStaffDeskCounts>[0];

const LATEST = { id: "e1" } as unknown as StaffDeskRawCounts["bellLatest"];

const RAW: StaffDeskRawCounts = {
  tickets: 2,
  social: 3,
  opinionPending: 4,
  newsReporters: 5,
  newsEmail: 1,
  editRequests: 2,
  bellUnread: 7,
  bellActionable: 3,
  bellLatest: LATEST,
  urgentAlerts: 6,
};

describe("staff desk counts (shared)", () => {
  it("mirrors each underlying endpoint and sums the badge once per item", () => {
    const counts = buildStaffDeskCounts(ALL, RAW, NOW);
    expect(counts.inbox).toEqual({ tickets: 2, social: 3, total: 5 });
    expect(counts.opinionPending).toBe(4);
    expect(counts.news).toEqual({ all: 8, reporters: 5, editRequests: 2, email: 1 });
    expect(counts.notifications).toEqual({ unreadCount: 7, latest: LATEST });
    expect(counts.urgentAlerts).toBe(6);
    // 2 + 3 + 4 + 5 + 1 + 2 + 3: الجرس بلا «مسودة جديدة»، وتنبيهات الإدارة خارج الرقم.
    expect(counts.badge).toBe(20);
    expect(counts.generatedAt).toBe("2026-11-09T07:00:00.000Z");
  });

  it("returns zeros for a member without any permission", () => {
    const counts = buildStaffDeskCounts(NONE, RAW, NOW);
    expect(counts.inbox).toEqual({ tickets: 0, social: 0, total: 0 });
    expect(counts.opinionPending).toBe(0);
    expect(counts.news).toEqual({ all: 0, reporters: 0, editRequests: 0, email: 0 });
    expect(counts.notifications).toEqual({ unreadCount: 0, latest: null });
    expect(counts.urgentAlerts).toBe(0);
    expect(counts.badge).toBe(0);
  });

  it("gates every count by its own permission", () => {
    const ticketsOnly = buildStaffDeskCounts({ ...NONE, canTickets: true }, RAW, NOW);
    expect(ticketsOnly.inbox).toEqual({ tickets: 2, social: 0, total: 2 });
    expect(ticketsOnly.badge).toBe(2);

    const newsOnly = buildStaffDeskCounts({ ...NONE, canNews: true }, RAW, NOW);
    expect(newsOnly.news.all).toBe(8);
    expect(newsOnly.notifications.unreadCount).toBe(0);
    expect(newsOnly.badge).toBe(8);

    // canPublisherNews يفتح الجرس وحده، بلا تبويب الأخبار.
    const bellOnly = buildStaffDeskCounts({ ...NONE, canPublisherNews: true }, RAW, NOW);
    expect(bellOnly.news.all).toBe(0);
    expect(bellOnly.notifications.unreadCount).toBe(7);
    expect(bellOnly.badge).toBe(3);

    const adminOnly = buildStaffDeskCounts({ ...NONE, canAdminAlerts: true }, RAW, NOW);
    expect(adminOnly.urgentAlerts).toBe(6);
    expect(adminOnly.badge).toBe(0);
  });

  it("treats a failed source as zero without failing the rest", () => {
    const counts = buildStaffDeskCounts(
      ALL,
      { ...RAW, social: null, newsReporters: null, newsEmail: null, bellUnread: null, bellActionable: null, bellLatest: null },
      NOW,
    );
    expect(counts.inbox).toEqual({ tickets: 2, social: 0, total: 2 });
    expect(counts.news).toEqual({ all: 2, reporters: 0, editRequests: 2, email: 0 });
    expect(counts.notifications).toEqual({ unreadCount: 0, latest: null });
    expect(counts.badge).toBe(2 + 4 + 2);
  });

  it("never lets bad numbers through", () => {
    const counts = buildStaffDeskCounts(
      ALL,
      { ...RAW, tickets: -3, social: Number.NaN, bellUnread: 2, bellActionable: 9 },
      NOW,
    );
    expect(counts.inbox.total).toBe(0);
    // الجزء الداخل في الرقم لا يتجاوز غير المقروء نفسه.
    expect(counts.badge).toBe(4 + 5 + 1 + 2 + 2);
  });

  it("opens the bell with any notifications tab and skips duplicate draft kinds", () => {
    expect(canSeeStaffDeskBell(NONE)).toBe(false);
    expect(canSeeStaffDeskBell({ ...NONE, canOpinion: { view: true } } as typeof NONE)).toBe(true);
    expect(STAFF_BADGE_EXCLUDED_BELL_KINDS).toEqual([
      "tweet_draft",
      "opinion_draft",
      "news_draft",
      "news_edit_request",
      "ticket_message",
    ]);
    // مسودة البوت لا يعدّها مصدر آخر، فتدخل رقم الأيقونة.
    expect(STAFF_BADGE_EXCLUDED_BELL_KINDS).not.toContain("news_bot_draft");
  });
});
