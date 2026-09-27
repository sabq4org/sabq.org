import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { daysPhrase, formatHijri, hijriParts, liveCountdown, riyadhDateISO } from "@shared/mawaeed/dates";
import {
  classifySeed,
  occurrenceVisibleInRegion,
  planOccurrenceWrite,
  type OccurrenceRecord,
  type SeriesRecord,
} from "@shared/mawaeed/model";
import { presentMawaeed } from "@shared/mawaeed/present";
import { parseSeedCsv } from "@shared/mawaeed/seed";

const NOW = new Date("2026-09-27T12:00:00+03:00");

function series(partial: Partial<SeriesRecord> & Pick<SeriesRecord, "id" | "slug" | "kind">): SeriesRecord {
  return {
    titleAr: partial.slug,
    summaryAr: "ملخص",
    sortOrder: 1,
    published: true,
    contentUpdatedAt: "2026-09-27T00:00:00.000+03:00",
    ...partial,
  };
}

function row(partial: Partial<OccurrenceRecord> & Pick<OccurrenceRecord, "id" | "seriesId" | "startsOn" | "titleAr">): OccurrenceRecord {
  return {
    endsOn: null,
    sourceUrl: "https://example.sa/source",
    sourceTitle: "جهة رسمية",
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

describe("mawaeed dates", () => {
  it("converts a civil Riyadh day with Umm al-Qura", () => {
    const parts = hijriParts("2026-10-25");
    expect(parts.day).toBe(14);
    expect(parts.year).toBe(1448);
    expect(formatHijri("2026-10-25")).toContain("جمادى");
    expect(formatHijri("2026-10-25")).toContain("14");
    expect(formatHijri("2026-10-25", "14 جمادى الأولى 1448هـ")).toBe("14 جمادى الأولى 1448هـ");
  });

  it("uses Riyadh civil dates across midnight UTC", () => {
    expect(riyadhDateISO(new Date("2026-09-27T23:30:00Z"))).toBe("2026-09-28");
  });

  it("phrases the no-JS countdown in Arabic", () => {
    expect(daysPhrase(0, "تُصرف اليوم")).toBe("تُصرف اليوم");
    expect(daysPhrase(1, "تُصرف اليوم")).toBe("بعد يوم واحد");
    expect(daysPhrase(2, "تُصرف اليوم")).toBe("بعد يومين");
    expect(daysPhrase(4, "تُصرف اليوم")).toBe("بعد 4 أيام");
    expect(daysPhrase(28, "تُصرف اليوم")).toBe("بعد 28 يوماً");
  });

  it("counts live hours until Riyadh midnight of the start day", () => {
    const frozen = new Date("2026-10-26T21:30:00+03:00");
    const live = liveCountdown(frozen, "2026-10-27", "تُصرف اليوم");
    expect(live.calendarDays).toBe(1);
    expect(live.staticText).toBe("بعد يوم واحد");
    expect(live.days).toBe(0);
    expect(live.hours).toBe(2);
    expect(live.liveText).toContain("ساعت");
  });
});

describe("mawaeed presentation", () => {
  const salary = series({ id: "s-salary", slug: "salaries", kind: "salary", sortOrder: 3, titleAr: "رواتب موظفي الدولة" });
  const school = series({ id: "s-school", slug: "school-calendar-1448", kind: "school_holiday", sortOrder: 1, titleAr: "التقويم الدراسي 1448" });

  const occurrences: OccurrenceRecord[] = [
    row({ id: "sep", seriesId: "s-salary", titleAr: "رواتب سبتمبر", startsOn: "2026-09-27" }),
    row({ id: "oct", seriesId: "s-salary", titleAr: "رواتب أكتوبر", startsOn: "2026-10-27" }),
    row({ id: "extra-r", seriesId: "s-school", titleAr: "إجازة إضافية للرياض", startsOn: "2026-10-25", regionGroup: "riyadh_most" }),
    row({ id: "extra-w", seriesId: "s-school", titleAr: "إجازة إضافية للغرب", startsOn: "2026-10-25", regionGroup: "western", published: false, certainty: "unverified" }),
    row({ id: "autumn", seriesId: "s-school", titleAr: "إجازة الخريف", startsOn: "2026-11-20" }),
  ];

  it("marks today as disbursed-today and the next row after a passed date", () => {
    const today = presentMawaeed({ pageSlug: "salaries", now: NOW, series: [salary], occurrences });
    expect(today.notFound).toBe(false);
    if (today.notFound) return;
    expect(today.view.series[0].next?.countdownText).toBe("تُصرف اليوم");
    expect(today.view.series[0].next?.startsOn).toBe("2026-09-27");

    const later = presentMawaeed({
      pageSlug: "salaries",
      now: new Date("2026-09-28T09:00:00+03:00"),
      series: [salary],
      occurrences,
    });
    if (later.notFound) throw new Error("expected salaries page");
    expect(later.view.series[0].previous?.pastLabel).toBe("صُرفت");
    expect(later.view.series[0].next?.startsOn).toBe("2026-10-27");
    expect(later.view.series[0].next?.countdownText).toBe("بعد 29 يوماً");
  });

  it("keeps dateModified on the data stamp", () => {
    const page = presentMawaeed({
      now: new Date("2026-10-01T08:00:00+03:00"),
      series: [salary],
      occurrences,
    });
    if (page.notFound) throw new Error("expected home");
    expect(page.view.dateModified).toBe("2026-09-26T21:00:00.000Z");
    expect(JSON.stringify(page.view.jsonLd)).not.toContain("foundingDate");
    expect(JSON.stringify(page.view.jsonLd)).not.toContain("eventAttendanceMode");
  });

  it("filters school extras by region and hides unverified drafts", () => {
    const riyadh = presentMawaeed({
      pageSlug: "school-calendar-1448",
      region: "riyadh",
      now: NOW,
      series: [school],
      occurrences,
    });
    const makkah = presentMawaeed({
      pageSlug: "school-calendar-1448",
      region: "makkah",
      now: NOW,
      series: [school],
      occurrences,
    });
    if (riyadh.notFound || makkah.notFound) throw new Error("expected school page");
    const riyadhTitles = riyadh.view.series[0].upcoming.map((card) => card.title);
    const makkahTitles = makkah.view.series[0].upcoming.map((card) => card.title);
    expect(riyadhTitles).toContain("إجازة إضافية للرياض");
    expect(riyadhTitles).not.toContain("إجازة إضافية للغرب");
    expect(makkahTitles).not.toContain("إجازة إضافية للرياض");
    expect(makkahTitles).not.toContain("إجازة إضافية للغرب");
    expect(makkah.view.series[0].next?.title).toBe("إجازة الخريف");
    expect(occurrenceVisibleInRegion("western", "jeddah")).toBe(true);
    expect(occurrenceVisibleInRegion("riyadh_most", "taif")).toBe(false);
  });

  it("uses انتهت for a passed school holiday", () => {
    const page = presentMawaeed({
      pageSlug: "school-calendar-1448",
      now: new Date("2026-11-21T12:00:00+03:00"),
      series: [school],
      occurrences,
    });
    if (page.notFound) throw new Error("expected school page");
    expect(page.view.series[0].previous?.pastLabel).toBe("انتهت");
  });

  it("logs a public change only when a public field moves", () => {
    const before = row({ id: "a", seriesId: "s-salary", titleAr: "رواتب", startsOn: "2026-10-27", ruleNote: "داخلي" });
    const noteOnly = { ...before, ruleNote: "ملاحظة داخلية جديدة" };
    expect(planOccurrenceWrite(before, noteOnly).publicChanged).toBe(false);
    expect(planOccurrenceWrite(before, { ...before, startsOn: "2026-10-26" }).publicChanged).toBe(true);
    expect(planOccurrenceWrite(null, before).action).toBe("create");
  });
});

describe("mawaeed seed file", () => {
  const rows = parseSeedCsv(readFileSync("data/mawaeed/2026-09-27-mawaeed-dates.csv", "utf8"));

  it("keeps 38 rows and the review split", () => {
    expect(rows).toHaveLength(38);
    expect(rows.filter((item) => !item.published)).toHaveLength(7);
    expect(rows.filter((item) => item.published && item.certainty === "expected")).toHaveLength(12);
    expect(rows.filter((item) => item.published && item.certainty === "confirmed")).toHaveLength(19);
    expect(rows.every((item) => item.officialSourceUrl.startsWith("http"))).toBe(true);
    expect(classifySeed("يحتاج تحقق", "محسوب")).toEqual({ published: false, certainty: "unverified" });
  });
});
