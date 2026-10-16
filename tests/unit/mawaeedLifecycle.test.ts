import { describe, expect, it } from "vitest";
// @ts-expect-error Pages function has no TypeScript declaration.
import { renderMawaeedHtml } from "../../functions/mawaeedPage.js";
import { displayTitle, planOccurrenceWrite, type OccurrenceRecord, type SeriesRecord } from "@shared/mawaeed/model";
import { presentMawaeed } from "@shared/mawaeed/present";
import { occurrenceWriteSchema } from "@shared/mawaeed/validate";
import { buildServiceCalendar } from "@shared/servicePages/calendar";
import { presentServicePage } from "@shared/servicePages/present";
import { renderServiceSemanticHtml } from "@shared/servicePages/semanticHtml";

const school: SeriesRecord = {
  id: "s-school",
  slug: "school-calendar-1448",
  kind: "school_holiday",
  titleAr: "التقويم الدراسي 1448",
  summaryAr: "ملخص",
  sortOrder: 1,
  published: true,
  contentUpdatedAt: "2026-09-27T00:00:00.000+03:00",
};

function row(partial: Partial<OccurrenceRecord> & Pick<OccurrenceRecord, "id" | "startsOn" | "titleAr">): OccurrenceRecord {
  return {
    seriesId: "s-school",
    endsOn: null,
    sourceUrl: "https://moe.gov.sa",
    sourceTitle: "وزارة التعليم",
    certainty: "confirmed",
    status: "scheduled",
    published: true,
    regionGroup: "all",
    hijriLabel: null,
    publicNote: null,
    ruleNote: null,
    ...partial,
  };
}

const autumn = row({ id: "autumn", titleAr: "إجازة الخريف", startsOn: "2026-11-20", endsOn: "2026-11-28" });
const midYear = row({ id: "mid", titleAr: "إجازة منتصف العام", startsOn: "2027-01-08" });

function at(iso: string) {
  const presented = presentMawaeed({
    pageSlug: school.slug,
    now: new Date(iso),
    series: [school],
    occurrences: [autumn, midYear],
  });
  if (presented.notFound) throw new Error("expected school view");
  return presented.view;
}

describe("multi-day occurrences", () => {
  it("keeps a holiday ongoing until its last day, then past", () => {
    const during = at("2026-11-21T12:00:00+03:00").series[0];
    expect(during.next?.id).toBe("autumn");
    expect(during.next?.isPast).toBe(false);
    expect(during.next?.isOngoing).toBe(true);
    expect(during.next?.countdownText).toBe("جارية حتى 28 نوفمبر");

    const lastDay = at("2026-11-28T23:00:00+03:00").series[0];
    expect(lastDay.next?.id).toBe("autumn");

    const after = at("2026-11-29T00:30:00+03:00").series[0];
    expect(after.next?.id).toBe("mid");
    expect(after.previous?.id).toBe("autumn");
    expect(after.previous?.pastLabel).toBe("انتهت");
  });

  it("carries the end through the service page and ends the ICS event after the last day", () => {
    const model = presentServicePage("school-calendar-date", at("2026-11-21T12:00:00+03:00"));
    if (!model) throw new Error("expected service page");
    expect(model.next?.isOngoing).toBe(true);
    expect(model.next?.endsOn).toBe("2026-11-28");
    expect(model.leadPrefix).toBe("الإجازة المدرسية الجارية في الرياض بدأت");
    const ics = buildServiceCalendar(model) ?? "";
    expect(ics).toContain("DTSTART;VALUE=DATE:20261120\r\nDTEND;VALUE=DATE:20261129");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270108\r\nDTEND;VALUE=DATE:20270109");
    const html = renderServiceSemanticHtml(model, []);
    expect(html).toContain("جارية حتى 28 نوفمبر");
    expect(html).not.toContain("data-countdown");
  });

  it("renders an ongoing holiday on /mawaeed without a live countdown that would say «today»", () => {
    const html = renderMawaeedHtml(at("2026-11-21T12:00:00+03:00"), { nowMs: Date.parse("2026-11-21T12:00:00+03:00") });
    expect(html).toContain("جارية حتى 28 نوفمبر");
    expect(html).toContain("حتى 28 نوفمبر");
    expect(html).not.toContain('data-date="2026-11-20"');
  });
});

describe("live countdown wording", () => {
  it("says «less than an hour» before midnight instead of «today»", () => {
    const html = renderMawaeedHtml(at("2026-10-16T12:00:00+03:00"));
    expect(html).toContain("بعد أقل من ساعة");
    expect(html).toContain("location.reload()");
  });
});

describe("section moves and stamps", () => {
  it("stamps both the old and the new section when an occurrence moves", () => {
    const before = row({ id: "a", startsOn: "2026-10-27", titleAr: "رواتب", seriesId: "s-old" });
    const plan = planOccurrenceWrite(before, { ...before, seriesId: "s-new" });
    expect(plan.publicChanged).toBe(true);
    expect(plan.stampSeriesIds).toEqual(["s-old", "s-new"]);
    expect(plan.before?.seriesId).toBe("s-old");
    expect(plan.after.seriesId).toBe("s-new");
  });

  it("stamps nothing for an internal-note edit", () => {
    const before = row({ id: "a", startsOn: "2026-10-27", titleAr: "رواتب" });
    expect(planOccurrenceWrite(before, { ...before, ruleNote: "جديد" }).stampSeriesIds).toEqual([]);
  });
});

describe("date validation", () => {
  const base = {
    seriesId: "s",
    titleAr: "رواتب",
    sourceUrl: "https://www.mof.gov.sa",
    sourceTitle: "وزارة المالية",
    certainty: "confirmed",
    published: true,
    regionGroup: "all",
  };

  it("rejects calendar dates that do not exist", () => {
    expect(occurrenceWriteSchema.safeParse({ ...base, startsOn: "2027-02-31" }).success).toBe(false);
    expect(occurrenceWriteSchema.safeParse({ ...base, startsOn: "2026-13-01" }).success).toBe(false);
    expect(occurrenceWriteSchema.safeParse({ ...base, startsOn: "2026-10-27", endsOn: "2026-11-31" }).success).toBe(false);
    expect(occurrenceWriteSchema.safeParse({ ...base, startsOn: "2028-02-29" }).success).toBe(true);
  });
});

describe("stored titles with relative words", () => {
  it("drops «(اليوم)» from a stored title", () => {
    expect(displayTitle("رواتب موظفي الدولة — سبتمبر 2026 (اليوم)")).toBe("رواتب موظفي الدولة — سبتمبر 2026");
    expect(displayTitle("إجازة الخريف")).toBe("إجازة الخريف");
  });
});
