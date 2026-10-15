import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/email", () => ({ sendEmailNotification: vi.fn() }));
vi.mock("../../server/services/editorialNotifications", () => ({ notifyAuthorOfSocialPostStatus: vi.fn() }));
vi.mock("../../server/services/socialPublishing/suggestService", () => ({ suggestSocialPostForArticle: vi.fn() }));
vi.mock("../../server/services/publisherPortalService", () => ({
  listPublisherMembers: vi.fn(),
  notifyAdmins: vi.fn(),
  notifyPublisherMembers: vi.fn(),
}));
import {
  agencyAiRemaining,
  agencyPostMedia,
  agencySocialMode,
  agencySocialWindow,
  allowedAgencyActions,
  AGENCY_SOCIAL_AI_DAILY_LIMIT,
} from "../../server/services/publisherSocialService";

describe("agency social publishing rules", () => {
  it("treats every unknown mode as approval, the default", () => {
    expect(agencySocialMode({ socialPublishMode: "approval" })).toBe("approval");
    expect(agencySocialMode({ socialPublishMode: "direct" })).toBe("direct");
    expect(agencySocialMode({ socialPublishMode: "off" })).toBe("off");
    expect(agencySocialMode({ socialPublishMode: "" })).toBe("approval");
  });

  it("lets approval agencies only submit, and direct agencies publish or schedule", () => {
    expect(allowedAgencyActions("approval")).toEqual(["submit"]);
    expect(allowedAgencyActions("direct")).toEqual(["publish_now", "schedule"]);
    expect(allowedAgencyActions("off")).toEqual([]);
  });

  it("opens a 48-hour window from the story's publish time", () => {
    const published = new Date("2026-10-06T08:00:00Z");
    expect(agencySocialWindow(published, new Date("2026-10-08T07:59:00Z"))).toEqual({
      eligible: true,
      expiresAt: "2026-10-08T08:00:00.000Z",
    });
    expect(agencySocialWindow(published, new Date("2026-10-08T08:00:00Z")).eligible).toBe(false);
    expect(agencySocialWindow(null).eligible).toBe(false);
  });

  it("maps the media choice onto the existing post fields", () => {
    expect(agencyPostMedia("article", [], "https://img/a.jpg")).toEqual({
      imageSource: "article",
      imageUrl: "https://img/a.jpg",
      mediaKind: "none",
      mediaUrls: [],
    });
    expect(() => agencyPostMedia("article", [], null)).toThrow("الخبر بلا صورة");
    expect(agencyPostMedia("images", [" a ", "", "b"], null)).toMatchObject({ mediaKind: "image", mediaUrls: ["a", "b"] });
    expect(agencyPostMedia("video", ["v.mp4"], "x")).toMatchObject({ imageSource: "none", mediaKind: "video" });
    expect(agencyPostMedia("none", ["ignored"], "x")).toMatchObject({ mediaKind: "none", mediaUrls: [] });
  });

  it("starts each agency with the full daily AI allowance", () => {
    expect(agencyAiRemaining("fresh-agency")).toBe(AGENCY_SOCIAL_AI_DAILY_LIMIT);
  });
});
