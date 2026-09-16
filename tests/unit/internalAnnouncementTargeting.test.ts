import { describe, expect, it } from "vitest";
import { matchesInternalAnnouncementAudience } from "../../server/utils/internalAnnouncementTargeting";

describe("internal announcement audience targeting", () => {
  it("shows an untargeted announcement to everyone", () => {
    expect(matchesInternalAnnouncementAudience(
      { audienceRoles: null, audienceUserIds: null },
      "user-1",
      ["reporter"],
    )).toBe(true);
  });

  it("treats empty target arrays as everyone", () => {
    expect(matchesInternalAnnouncementAudience(
      { audienceRoles: [], audienceUserIds: [] },
      "user-1",
      ["reader"],
    )).toBe(true);
  });

  it("shows a role-targeted announcement only to an exact matching role", () => {
    const announcement = { audienceRoles: ["editor"], audienceUserIds: null };

    expect(matchesInternalAnnouncementAudience(announcement, "editor-1", ["editor"])).toBe(true);
    expect(matchesInternalAnnouncementAudience(announcement, "reporter-1", ["reporter"])).toBe(false);
    expect(matchesInternalAnnouncementAudience(announcement, "chief-1", ["chief_editor"])).toBe(false);
  });

  it("supports users with multiple roles without leaking to unrelated roles", () => {
    const announcement = { audienceRoles: ["content_manager"], audienceUserIds: null };

    expect(matchesInternalAnnouncementAudience(announcement, "user-1", ["reporter", "content_manager"])).toBe(true);
    expect(matchesInternalAnnouncementAudience(announcement, "user-2", ["reporter", "reader"])).toBe(false);
  });

  it("allows an explicitly targeted user independently of their role", () => {
    const announcement = { audienceRoles: ["editor"], audienceUserIds: ["special-user"] };

    expect(matchesInternalAnnouncementAudience(announcement, "special-user", ["reporter"])).toBe(true);
    expect(matchesInternalAnnouncementAudience(announcement, "other-user", ["reporter"])).toBe(false);
  });
});
