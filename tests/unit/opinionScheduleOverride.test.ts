// تجاوز قاعدة الفاصل الأسبوعي للكاتب نفسه (overrideWeeklyGap) واتساق slot-check مع رفض 409.
// حالة حقيقية: مقال الهاجري f0cdcf56 على 2026-11-23 09:45 الرياض، ومقاله الآخر منشور 2026-11-19 09:00 الرياض.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const rowsQueue: unknown[][] = [];
  const updates: unknown[] = [];
  const chain = (): any => {
    const obj: any = {};
    for (const m of ["from", "where", "innerJoin", "leftJoin", "limit", "orderBy", "groupBy"]) obj[m] = () => obj;
    obj.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rowsQueue.length ? rowsQueue.shift() : []).then(resolve, reject);
    return obj;
  };
  return {
    rowsQueue,
    updates,
    mockDb: {
      select: vi.fn(() => chain()),
      update: vi.fn(() => ({
        set: (values: unknown) => {
          updates.push(values);
          return {
            where: () => ({
              returning: async () => [{
                id: "f0cdcf56", title: "جودة التنمية المجتمعية", slug: "s", englishSlug: null, articleType: "opinion",
                status: "scheduled", scheduledAt: (values as { scheduledAt: Date }).scheduledAt, publishedAt: null,
                authorId: "w1", reporterId: null, submitterId: null,
              }],
            }),
          };
        },
      })),
    },
  };
});

vi.mock("../../server/db", () => ({ db: h.mockDb }));

import { scheduleApprovedOpinionArticle } from "../../server/services/opinionWritersService";
import { checkOpinionSlotClashes, hasWeeklyGapConflict } from "../../server/services/staffOpinionDeskService";
import { findScheduleGapConflicts } from "../../server/services/opinionScheduleRules";
import { buildWriterGapWarnings } from "../../server/services/opinionSlotClash";
import { staffOpinionScheduleSchema, withDefaultOpinionScheduleMode } from "../../shared/staffApp";

const TARGET = new Date("2026-11-23T09:45:00+03:00");
const existing = { id: "f0cdcf56", status: "scheduled", reviewStatus: "approved", authorId: "w1" };
const publishedSibling = {
  id: "cdff9b4c", title: "لا يؤكد المؤكد", status: "published", reviewStatus: "approved",
  publishedAt: new Date("2026-11-19T06:00:00.000Z"), scheduledAt: null, updatedAt: new Date("2026-11-19T06:00:00.000Z"),
};

beforeEach(() => {
  h.rowsQueue.length = 0;
  h.updates.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T16:30:00.000Z"));
});

describe("findScheduleGapConflicts", () => {
  it("returns the conflicting rows with their instants, same rule as scheduleConflictsWith", () => {
    const rows = [publishedSibling, { ...publishedSibling, id: "old", publishedAt: new Date("2026-11-10T06:00:00.000Z") }];
    const out = findScheduleGapConflicts(TARGET, rows);
    expect(out.map((c) => c.row.id)).toEqual(["cdff9b4c"]);
    expect(out[0].at.toISOString()).toBe("2026-11-19T06:00:00.000Z");
    expect(findScheduleGapConflicts(new Date("x"), rows)).toEqual([]);
  });

  it("builds a blocking writer_gap warning", () => {
    const [w] = buildWriterGapWarnings([{ articleId: "cdff9b4c", title: "لا يؤكد المؤكد", status: "published", at: new Date("2026-11-19T06:00:00.000Z") }]);
    expect(w).toMatchObject({
      code: "writer_gap", otherArticleId: "cdff9b4c", otherTitle: "لا يؤكد المؤكد",
      otherStatus: "published", otherAt: "2026-11-19T06:00:00.000Z", blocking: true,
    });
    expect(w.message).toContain("«لا يؤكد المؤكد» منشور");
    expect(w.message).toContain("09:00 (الرياض)");
  });
});

describe("scheduleApprovedOpinionArticle overrideWeeklyGap", () => {
  it("still rejects 409 without the override and writes nothing", async () => {
    h.rowsQueue.push([existing], [publishedSibling]);
    const r = await scheduleApprovedOpinionArticle("f0cdcf56", TARGET);
    expect(r).toEqual({ ok: false, status: 409, message: "هذا الموعد قريب من مقال آخر للكاتب نفسه. اختر أسبوعاً مختلفاً." });
    expect(h.updates).toHaveLength(0);
  });

  it("schedules with the override and reports overrodeWeeklyGap", async () => {
    h.rowsQueue.push([existing], [publishedSibling]);
    const r = await scheduleApprovedOpinionArticle("f0cdcf56", TARGET, { overrideWeeklyGap: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.overrodeWeeklyGap).toBe(true);
      expect(r.article.scheduledAt?.toISOString()).toBe("2026-11-23T06:45:00.000Z");
    }
    expect(h.updates).toHaveLength(1);
  });

  it("overrodeWeeklyGap=false when there was nothing to override", async () => {
    h.rowsQueue.push([existing], []);
    const r = await scheduleApprovedOpinionArticle("f0cdcf56", TARGET, { overrideWeeklyGap: true });
    expect(r.ok && r.overrodeWeeklyGap).toBe(false);
  });

  it("override does not bypass the other validations", async () => {
    h.rowsQueue.push([{ ...existing, status: "published" }]);
    expect(await scheduleApprovedOpinionArticle("f0cdcf56", TARGET, { overrideWeeklyGap: true }))
      .toMatchObject({ ok: false, status: 400, message: "المقال منشور بالفعل" });
    h.rowsQueue.push([{ ...existing, reviewStatus: "rejected" }]);
    expect(await scheduleApprovedOpinionArticle("f0cdcf56", TARGET, { overrideWeeklyGap: true }))
      .toMatchObject({ ok: false, status: 400 });
    h.rowsQueue.push([existing]);
    expect(await scheduleApprovedOpinionArticle("f0cdcf56", new Date("2026-11-22T10:00:00.000Z"), { overrideWeeklyGap: true }))
      .toMatchObject({ ok: false, status: 400, message: "موعد الجدولة يجب أن يكون في المستقبل" });
    expect(h.updates).toHaveLength(0);
  });
});

describe("checkOpinionSlotClashes (slot-check) agrees with the 409", () => {
  it("reports the same-writer gap conflict as a blocking writer_gap warning", async () => {
    // loadOpinionArticle → كتّاب آخرون في الدقيقة نفسها → مقالات الكاتب نفسه
    h.rowsQueue.push([{ ...existing, slug: "s" }], [], [publishedSibling]);
    const warnings = await checkOpinionSlotClashes("f0cdcf56", TARGET);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ code: "writer_gap", otherArticleId: "cdff9b4c", blocking: true });
    expect(hasWeeklyGapConflict(warnings)).toBe(true);
  });

  it("no gap warning a week later", async () => {
    h.rowsQueue.push([{ ...existing, slug: "s" }], [], [publishedSibling]);
    const warnings = await checkOpinionSlotClashes("f0cdcf56", new Date("2026-11-30T09:45:00+03:00"));
    expect(warnings).toEqual([]);
    expect(hasWeeklyGapConflict(warnings)).toBe(false);
  });
});

describe("schedule body schema", () => {
  it("accepts overrideWeeklyGap on both shapes and defaults a bare override to fixed_slot", () => {
    expect(staffOpinionScheduleSchema.parse({ scheduledAt: "2026-11-23T09:45:00+03:00", overrideWeeklyGap: true }))
      .toEqual({ scheduledAt: "2026-11-23T09:45:00+03:00", overrideWeeklyGap: true });
    expect(staffOpinionScheduleSchema.parse(withDefaultOpinionScheduleMode({ overrideWeeklyGap: true })))
      .toEqual({ mode: "fixed_slot", overrideWeeklyGap: true });
    expect(withDefaultOpinionScheduleMode({})).toEqual({ mode: "fixed_slot" });
    expect(withDefaultOpinionScheduleMode(undefined)).toEqual({ mode: "fixed_slot" });
    expect(staffOpinionScheduleSchema.safeParse({ scheduledAt: "2026-11-23T09:45:00+03:00", overrideWeeklyGap: "yes" }).success).toBe(false);
  });
});
