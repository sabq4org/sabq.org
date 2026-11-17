// أرشيف المحاضر والمهام — الدوال النقية + إثبات قواعد الاطلاع في الكود.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/meetingsService", () => ({
  logMeetingEvent: vi.fn(),
  meetingVisibilityFilter: vi.fn(),
}));

import {
  actualDurationMinutes,
  countMinutes,
  escapeLike,
  normalizeArchiveQuery,
  withTaskDone,
} from "../../server/services/meetingArchiveService";
import {
  DECISIONS_FORMS,
  MINUTES_FORMS,
  TASKS_FORMS,
  arCount,
  cleanMinutesForSave,
  minutesEqual,
  normalizeMinutes,
  transcriptDeletionDate,
} from "../../client/src/components/meetings/minutesShared";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("البحث في الأرشيف", () => {
  it("يقص ويحد الطول ويتجاهل غير النص", () => {
    expect(normalizeArchiveQuery("  ملف   الإسكان ")).toBe("ملف الإسكان");
    expect(normalizeArchiveQuery("x".repeat(500)).length).toBe(80);
    expect(normalizeArchiveQuery(["a"])).toBe("");
    expect(normalizeArchiveQuery(undefined)).toBe("");
  });

  it("يهرّب محارف LIKE فيُبحث عن النص حرفياً", () => {
    expect(escapeLike("100%_تم\\")).toBe("100\\%\\_تم\\\\");
    expect(escapeLike("ملف الإسكان")).toBe("ملف الإسكان");
  });
});

describe("المدة والعدّ", () => {
  it("المدة الفعلية بالدقائق، وnull حين ينقص وقت أو يكون سالباً", () => {
    const s = new Date("2026-11-16T06:00:00Z");
    expect(actualDurationMinutes(s, new Date("2026-11-16T06:34:10Z"))).toBe(34);
    expect(actualDurationMinutes(s, new Date("2026-11-16T06:00:20Z"))).toBe(1);
    expect(actualDurationMinutes(s, s)).toBeNull();
    expect(actualDurationMinutes(null, s)).toBeNull();
  });

  it("يعدّ القرارات والمهام والمفتوح منها، ويتحمل null", () => {
    expect(countMinutes(null)).toEqual({ decisions: 0, tasks: 0, openTasks: 0 });
    expect(
      countMinutes({
        summary: "",
        decisions: ["أ", "ب"],
        actionItems: [
          { task: "1", owner: null, due: null },
          { task: "2", owner: null, due: null, done: true },
          { task: "3", owner: "ريم", due: null, done: false },
        ],
        deferred: [],
      }),
    ).toEqual({ decisions: 2, tasks: 3, openTasks: 2 });
  });
});

describe("withTaskDone", () => {
  const base = {
    summary: "s",
    decisions: ["d"],
    actionItems: [
      { task: "أ", owner: "ريم", due: "الثلاثاء" },
      { task: "ب", owner: null, due: null },
    ],
    deferred: [],
  };

  it("يغيّر مهمة واحدة ولا يمس الأصل ولا بقية الحقول", () => {
    const next = withTaskDone(base, 1, true)!;
    expect(next.actionItems[1]).toEqual({ task: "ب", owner: null, due: null, done: true });
    expect(next.actionItems[0]).toEqual(base.actionItems[0]);
    expect(base.actionItems[1]).not.toHaveProperty("done");
    expect(next.summary).toBe("s");
    expect(withTaskDone(next, 1, false)!.actionItems[1].done).toBe(false);
  });

  it("نص المهمة يثبت الفهرس: قائمة تغيّرت في تبويب آخر → mismatch لا تعليم مهمة أخرى", () => {
    expect(withTaskDone(base, 1, true, "ب")).not.toBe("mismatch");
    expect(withTaskDone(base, 1, true, "أ")).toBe("mismatch");
    expect(withTaskDone(base, 5, true, "ب")).toBeNull();
  });

  it("فهرس خارج المدى أو غير صحيح → null", () => {
    for (const i of [-1, 2, 1.5, Number.NaN]) expect(withTaskDone(base, i, true)).toBeNull();
  });
});

describe("صياغة المعدود بالعربية", () => {
  it("مفرد ومثنى وجمع وتمييز — لا «1 بنود»", () => {
    expect(arCount(0, DECISIONS_FORMS)).toBe("بلا قرارات");
    expect(arCount(1, DECISIONS_FORMS)).toBe("قرار واحد");
    expect(arCount(2, DECISIONS_FORMS)).toBe("قراران");
    expect(arCount(3, DECISIONS_FORMS)).toBe("3 قرارات");
    expect(arCount(10, TASKS_FORMS)).toBe("10 مهام");
    expect(arCount(11, TASKS_FORMS)).toBe("11 مهمة");
    expect(arCount(34, MINUTES_FORMS)).toBe("34 دقيقة");
    expect(arCount(103, MINUTES_FORMS)).toBe("103 دقائق");
    expect(arCount(2, MINUTES_FORMS)).toBe("دقيقتان");
  });
});

describe("تطبيع المحضر وحفظه", () => {
  it("يتحمل null وحقولاً ناقصة أو بأنواع خاطئة", () => {
    expect(normalizeMinutes(null)).toEqual({ summary: "", decisions: [], actionItems: [], deferred: [] });
    expect(
      normalizeMinutes({ summary: 5, decisions: ["أ", 3], actionItems: [{ task: "م" }, { owner: "x" }, null] }),
    ).toEqual({ summary: "", decisions: ["أ"], actionItems: [{ task: "م", owner: null, due: null }], deferred: [] });
  });

  it("الحفظ يسقط البنود الفارغة ويبقي done", () => {
    const cleaned = cleanMinutesForSave({
      summary: "  ملخص  ",
      decisions: ["  قرار  ", "   "],
      actionItems: [
        { task: " مهمة ", owner: "  ", due: " الخميس ", done: true },
        { task: "  ", owner: "ريم", due: null },
      ],
      deferred: [""],
    });
    expect(cleaned).toEqual({
      summary: "ملخص",
      decisions: ["قرار"],
      actionItems: [{ task: "مهمة", owner: null, due: "الخميس", done: true }],
      deferred: [],
    });
  });

  it("minutesEqual يتجاهل الفراغات والبنود الفارغة", () => {
    const a = { summary: "س", decisions: ["أ"], actionItems: [], deferred: [] };
    expect(minutesEqual(a, { ...a, decisions: ["أ ", ""] })).toBe(true);
    expect(minutesEqual(a, { ...a, decisions: ["ب"] })).toBe(false);
  });

  it("التفريغ يُحذف بعد 30 يوماً من الانتهاء", () => {
    expect(transcriptDeletionDate("2026-11-16T06:34:00Z")!.toISOString()).toBe("2026-12-16T06:34:00.000Z");
    expect(transcriptDeletionDate(null)).toBeNull();
    expect(transcriptDeletionDate("ليس تاريخاً")).toBeNull();
  });
});

describe("قواعد الاطلاع في الكود", () => {
  const service = read("server/services/meetingArchiveService.ts");
  const routes = read("server/routes/meetingArchiveRoutes.ts");
  const meetingsRoutes = read("server/routes/meetingsRoutes.ts");
  const minutesRoutes = read("server/routes/meetingMinutesRoutes.ts");
  const minutesService = read("server/services/meetingMinutesService.ts");

  it("غير المضيف لا يرى في الأرشيف إلا المعتمد، وبقاعدة الظهور نفسها", () => {
    expect(service).toContain(
      'or(eq(meetings.hostUserId, viewerId), eq(meetings.minutesStatus, "approved"))',
    );
    expect(service).toContain("await meetingVisibilityFilter(viewerId, canManage)");
  });

  it("مسارات الأرشيف خلف تسجيل الدخول وصلاحية الاجتماعات، وبلا كاش وسيط", () => {
    expect(routes.match(/isAuthenticated,/g)?.length).toBe(3);
    expect(routes.match(/await requireMeetingsView\(req, res\)/g)?.length).toBe(2);
    expect(routes.match(/"private, no-store"/g)?.length).toBe(2);
    expect(routes).not.toMatch(/from "\.\.\/db"/);
  });

  it("لا مسح شامل: المسار والدالة أُزيلا مع زر «مسح الكل»", () => {
    expect(meetingsRoutes).not.toContain("purgeAllMeetings");
    expect(meetingsRoutes).not.toMatch(/router\.delete\(\s*"\/api\/meetings",/);
    expect(read("server/services/meetingsService.ts")).not.toContain("purgeAllMeetings");
  });

  it("جسم تحديث المهمة صارم ويحمل نص المهمة، والحد عبر أداة الترقيم الموحدة", () => {
    expect(routes).toContain("z.object({ done: z.boolean(), task: z.string().min(1).max(1000) }).strict()");
    expect(routes).toContain("parseLimit(req.query.limit, ARCHIVE_PAGE_SIZE, 50)");
    expect(service).toContain("boundedLimit(");
  });

  it("الاعتماد يجلب المستلمين قبل تغيير الحالة", () => {
    const fn = minutesService.slice(minutesService.indexOf("export async function approveAndDistributeMinutes"));
    expect(fn.indexOf(".from(meetingParticipants)")).toBeLessThan(fn.indexOf('minutesStatus: "approved"'));
  });

  it("تحديث المهمة للمضيف فقط وتحت قفل الصف", () => {
    expect(routes).toContain('!(await userHasPermission(userId, "meetings.manage"))');
    expect(service).toContain('.for("update")');
  });

  it("تفاصيل الاجتماع لا تسرّب مسودة المحضر لغير المضيف", () => {
    expect(meetingsRoutes).toContain(
      'minutes: isHost || meeting.minutesStatus === "approved" ? meeting.minutes : null,',
    );
  });

  it("الاعتماد ذرّي: مسودة → معتمد مرة واحدة، والطلب الثاني يُرفض بلا بريد", () => {
    expect(minutesService).toContain(
      '.where(and(eq(meetings.id, meeting.id), eq(meetings.minutesStatus, "draft")))',
    );
    expect(minutesRoutes).toContain("if (sent === null) {");
  });
});
