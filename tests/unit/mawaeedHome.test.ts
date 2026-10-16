import { describe, expect, it } from "vitest";
import { boardBlocks, heroFollowsRegion, nearestCard, schoolBlock, schoolRows } from "@shared/mawaeed/home";
import type { MawaeedCard, MawaeedSeriesBlock } from "@shared/mawaeed/present";

function card(over: Partial<MawaeedCard> & Pick<MawaeedCard, "id" | "seriesSlug" | "kind" | "startsOn">): MawaeedCard {
  return {
    seriesTitle: over.seriesSlug,
    title: over.id,
    endsOn: null,
    dateLine: "",
    hijriLabel: "",
    gregorianLabel: "",
    countdownText: "",
    todayLabel: "اليوم",
    isPast: false,
    isToday: false,
    isOngoing: false,
    endLabel: null,
    pastLabel: null,
    certainty: "confirmed",
    certaintyLabel: "مؤكد",
    expectedHint: null,
    sourceUrl: "",
    sourceTitle: "",
    publicNote: null,
    visionNote: null,
    regionGroup: "all",
    ...over,
  };
}

function block(slug: string, kind: MawaeedSeriesBlock["kind"], upcoming: MawaeedCard[]): MawaeedSeriesBlock {
  const live = upcoming.filter((c) => !c.isPast);
  return {
    slug,
    title: slug,
    kind,
    href: `/services/${slug}`,
    summary: "",
    previous: null,
    next: live[0] ?? null,
    following: live[1] ?? null,
    upcoming,
    answerLine: "",
    followLine: null,
  };
}

const school = block("school-calendar-1448", "school_holiday", [
  card({ id: "old", seriesSlug: "school-calendar-1448", kind: "school_holiday", startsOn: "2026-09-23", isPast: true }),
  card({ id: "oct25", seriesSlug: "school-calendar-1448", kind: "school_holiday", startsOn: "2026-10-25" }),
  card({ id: "nov", seriesSlug: "school-calendar-1448", kind: "school_holiday", startsOn: "2026-11-22" }),
]);
const salary = block("salaries", "salary", [card({ id: "oct27", seriesSlug: "salaries", kind: "salary", startsOn: "2026-10-27" })]);
const citizen = block("citizen", "citizen_account", [card({ id: "nov10", seriesSlug: "citizen", kind: "citizen_account", startsOn: "2026-11-10" })]);
const pension = block("pension", "pension", []);

describe("mawaeed home view", () => {
  it("picks the earliest next card across series", () => {
    expect(nearestCard([salary, school, citizen])?.id).toBe("oct25");
    expect(nearestCard([pension])).toBeNull();
  });

  it("school rows skip past cards and keep order", () => {
    expect(schoolBlock([salary, school])?.slug).toBe("school-calendar-1448");
    expect(schoolRows(school).map((c) => c.id)).toEqual(["oct25", "nov"]);
    expect(schoolRows(null)).toEqual([]);
  });

  it("board leaves out the school series and the hero's series, nearest first, empty last", () => {
    const hero = nearestCard([salary, school, citizen, pension]);
    expect(boardBlocks([pension, citizen, salary, school], hero).map((b) => b.slug)).toEqual(["salaries", "citizen", "pension"]);
    const salaryHero = nearestCard([salary, citizen]);
    expect(boardBlocks([pension, citizen, salary, school], salaryHero).map((b) => b.slug)).toEqual(["citizen", "pension"]);
  });

  it("hero follows the region only when it is a school holiday", () => {
    expect(heroFollowsRegion(school.next)).toBe(true);
    expect(heroFollowsRegion(salary.next)).toBe(false);
    expect(heroFollowsRegion(null)).toBe(false);
  });
});
