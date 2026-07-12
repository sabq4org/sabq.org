import { describe, expect, it } from "vitest";
import { localizeAcTeam, localizeAcVenue } from "../../server/services/asianCupNames";
import { runWithSportsLang } from "../../server/services/sportsLang";

describe("Asian Cup request language", () => {
  it("keeps Arabic as the default contract", () => {
    expect(localizeAcTeam(23, "Saudi Arabia")).toBe("السعودية");
    expect(localizeAcVenue("King Saud University Stadium", "Riyadh")).toEqual({
      name: "ملعب جامعة الملك سعود",
      city: "الرياض",
    });
  });

  it("returns canonical provider names for English requests", () => {
    runWithSportsLang("en", () => {
      expect(localizeAcTeam(23, "Saudi Arabia")).toBe("Saudi Arabia");
      expect(localizeAcVenue("King Saud University Stadium", "Riyadh")).toEqual({
        name: "King Saud University Stadium",
        city: "Riyadh",
      });
    });
  });
});
