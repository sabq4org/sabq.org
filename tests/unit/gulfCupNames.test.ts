import { describe, expect, it } from "vitest";
import { formatDateRange } from "../../client/src/components/gulfcup/gcTypes";
import { dedupeGcVenues, localizeGcVenue } from "../../server/services/gulfCupNames";

describe("gulf cup venue localization", () => {
  it("maps the long Prince Abdullah Sports City name to Arabic", () => {
    const venue = localizeGcVenue("Prince Abdullah Al-Faisal Sports City Stadium", "Jeddah");
    expect(venue).toEqual({ name: "ملعب الأمير عبدالله الفيصل", city: "جدة" });
  });

  it("maps King Abdullah variants to the same Arabic name", () => {
    expect(localizeGcVenue("King Abdullah Sports City Stadium", "Jeddah").name).toBe(
      "مدينة الملك عبدالله الرياضية",
    );
    expect(localizeGcVenue("مدينة الملك عبدالله الرياضية", "جدة").name).toBe(
      "مدينة الملك عبدالله الرياضية",
    );
  });

  it("dedupes English and Arabic rows of the same stadium", () => {
    const venues = dedupeGcVenues([
      { name: "King Abdullah Sports City Stadium", city: "Jeddah" },
      { name: "مدينة الملك عبدالله الرياضية", city: "جدة" },
      { name: "Prince Abdullah Al-Faisal Sports City Stadium", city: "Jeddah" },
    ]);
    expect(venues).toEqual([
      { name: "مدينة الملك عبدالله الرياضية", city: "جدة" },
      { name: "ملعب الأمير عبدالله الفيصل", city: "جدة" },
    ]);
  });
});

describe("gulf cup date range", () => {
  it("formats the tournament window with Latin digits", () => {
    const range = formatDateRange("2026-09-23T18:00:00.000Z", "2026-10-06T18:00:00.000Z");
    expect(range).not.toMatch(/[٠-٩]/);
    expect(range).toContain("23");
    expect(range).toContain("2026");
    expect(range).toContain("سبتمبر");
  });
});
