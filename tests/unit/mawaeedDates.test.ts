import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dayUnitWord, daysPhrase, formatHijri, hijriParts, hoursPhrase, liveCountdown, riyadhDateISO } from "@shared/mawaeed/dates";
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
    // الشهران الأخيران مجروران بعد اليوم: «ذي القعدة» و«ذي الحجة» لا «ذو»
    expect(formatHijri("2027-04-20")).toContain("ذي القعدة");
    expect(formatHijri("2027-05-10")).toContain("ذي الحجة");
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
    // تمييز المئات يتبع ما بعد المئة: 100 يوم، 103 أيام، 115 يوماً
    expect(daysPhrase(100, "اليوم")).toBe("بعد 100 يوم");
    expect(daysPhrase(103, "اليوم")).toBe("بعد 103 أيام");
    expect(daysPhrase(115, "اليوم")).toBe("بعد 115 يوماً");
    expect(dayUnitWord(210)).toBe("أيام");
    // ساعتان بعد الواو مجرورة: «وساعتين»
    expect(hoursPhrase(2)).toBe("وساعتين");
    expect(hoursPhrase(1)).toBe("وساعة");
    expect(hoursPhrase(5)).toBe("و5 ساعات");
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
    // 28 يوماً و15 ساعة حتى منتصف ليل 27 أكتوبر: الأيام كالعدّاد الحي (24 ساعة) لا فرق التقويم (29)
    expect(later.view.series[0].next?.countdownText).toBe("بعد 28 يوماً");
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

  it("keeps the internal note out of everything the public sees", () => {
    const school = series({ id: "s-school", slug: "school-calendar-1448", kind: "school_holiday" });
    const secret = "مسودة داخلية: رابط التغريدة يُستكمل. تصنع عطلة مطولة من الجمعة 23 إلى الأحد 25 أكتوبر — لا تُنشر";
    const page = presentMawaeed({
      pageSlug: "school-calendar-1448",
      now: NOW,
      series: [school],
      occurrences: [
        row({ id: "x", seriesId: "s-school", titleAr: "الإجازة الإضافية الأولى", startsOn: "2026-10-25", regionGroup: "riyadh_most", ruleNote: secret }),
        row({ id: "y", seriesId: "s-school", titleAr: "إجازة الخريف", startsOn: "2026-11-20", ruleNote: "عيد الفطر رمضان مطول تصنع" }),
      ],
    });
    if (page.notFound) throw new Error("expected school page");
    const text = JSON.stringify(page.view);
    expect(text).not.toContain("تصنع");
    expect(text).not.toContain("لا تُنشر");
    expect(text).not.toContain("مسودة داخلية");
    expect(page.view.series[0].upcoming.every((card) => card.publicNote === null && card.visionNote === null)).toBe(true);
  });

  it("shows the reader note only from the public note field", () => {
    const school = series({ id: "s-school", slug: "school-calendar-1448", kind: "school_holiday" });
    const page = presentMawaeed({
      pageSlug: "school-calendar-1448",
      now: NOW,
      series: [school],
      occurrences: [row({
        id: "x",
        seriesId: "s-school",
        titleAr: "الإجازة الإضافية الأولى",
        startsOn: "2026-10-25",
        publicNote: "تصنع عطلة مطوّلة من الجمعة 23 إلى الأحد 25 أكتوبر.",
        ruleNote: "داخلي",
      })],
    });
    if (page.notFound) throw new Error("expected school page");
    expect(page.view.series[0].next?.publicNote).toBe("تصنع عطلة مطوّلة من الجمعة 23 إلى الأحد 25 أكتوبر.");
  });

  it("derives the Eid sighting note from the title or the Hijri date, never the internal note", () => {
    const citizen = series({ id: "s-citizen", slug: "citizen-account", kind: "citizen_account" });
    const school = series({ id: "s-school", slug: "school-calendar-1448", kind: "school_holiday", sortOrder: 2 });
    const page = presentMawaeed({
      now: NOW,
      series: [citizen, school],
      occurrences: [
        // 3 رمضان 1448
        row({ id: "ramadan", seriesId: "s-citizen", titleAr: "الدفعة 111", startsOn: "2027-02-10" }),
        // 29 رجب، والملاحظة الداخلية تذكر العيد
        row({ id: "rajab", seriesId: "s-citizen", titleAr: "الدفعة 110", startsOn: "2027-01-10", ruleNote: "قبل عيد الفطر" }),
        row({ id: "eid", seriesId: "s-school", titleAr: "إجازة عيد الفطر", startsOn: "2027-02-26" }),
        // يوم التأسيس في رمضان: إجازة ثابتة، لا ملاحظة رؤية
        row({ id: "founding", seriesId: "s-school", titleAr: "إجازة يوم التأسيس", startsOn: "2027-02-19" }),
      ],
    });
    if (page.notFound) throw new Error("expected home page");
    const cards = page.view.series.flatMap((block) => block.upcoming);
    const vision = (id: string) => cards.find((card) => card.id === id)?.visionNote ?? null;
    expect(vision("ramadan")).toContain("بالرؤية");
    expect(vision("rajab")).toBeNull();
    expect(vision("eid")).toContain("بالرؤية");
    // إجازة مدرسية: لا «صرف» في الملاحظة
    expect(vision("eid")).not.toContain("الصرف");
    expect(vision("eid")).toContain("الإجازة");
    expect(vision("ramadan")).toContain("الصرف");
    expect(vision("founding")).toBeNull();
  });

  it("records the internal note and section in the audit snapshot without moving the public stamp", () => {
    const before = row({ id: "a", seriesId: "s-salary", titleAr: "رواتب", startsOn: "2026-10-27", ruleNote: "قديم" });
    const plan = planOccurrenceWrite(before, { ...before, ruleNote: "جديد" });
    expect(plan.publicChanged).toBe(false);
    expect(plan.before?.ruleNote).toBe("قديم");
    expect(plan.after.ruleNote).toBe("جديد");
    expect(plan.after.seriesId).toBe("s-salary");
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
