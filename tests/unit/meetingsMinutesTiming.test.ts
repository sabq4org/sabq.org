// توقيت توليد المحضر — حادثة 2026-11-17: كان يولَّد لحظة حذف الغرفة قبل آخر
// دفعة تفريغ، ونداء «إنهاء» ثانٍ كان يعيد توليد محضر معتمد.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/ai/gateway", () => ({ aiGateway: {} }));
vi.mock("../../server/services/email", () => ({ sendEmailNotification: vi.fn() }));
vi.mock("../../server/services/meetingsService", () => ({ logMeetingEvent: vi.fn() }));
vi.mock("../../server/services/meetingVocabulary", () => ({ loadMeetingVocabulary: vi.fn() }));

import {
  MINUTES_FALLBACK_DELAY_MS,
  STALE_GENERATION_MS,
  canStartMinutesGeneration,
  isStaleGeneration,
  parseAgentCompletion,
} from "../../server/services/meetingMinutesService";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

describe("canStartMinutesGeneration", () => {
  it("التلقائي: مرة واحدة من none/recording فقط", () => {
    expect(canStartMinutesGeneration("recording", "auto")).toBe(true);
    expect(canStartMinutesGeneration("none", "auto")).toBe(true);
    expect(canStartMinutesGeneration(null, "auto")).toBe(true);
    for (const s of ["generating", "draft", "approved", "failed"]) {
      expect(canStartMinutesGeneration(s, "auto")).toBe(false);
    }
  });

  it("اليدوي: يعيد توليد الفاشل والمسودة، ولا يلمس المعتمد ولا الجاري", () => {
    expect(canStartMinutesGeneration("failed", "manual")).toBe(true);
    expect(canStartMinutesGeneration("draft", "manual")).toBe(true);
    expect(canStartMinutesGeneration("approved", "manual")).toBe(false);
    expect(canStartMinutesGeneration("generating", "manual")).toBe(false);
  });
});

describe("isStaleGeneration", () => {
  const now = Date.parse("2026-11-17T10:00:00Z");
  const old = new Date(now - STALE_GENERATION_MS - 1);
  const fresh = new Date(now - 60_000);
  it("يُقاس من لحظة الحجز: حجز قديم = عالق", () => {
    expect(isStaleGeneration(old, fresh, now)).toBe(true);
  });
  it("إعادة توليد جارية لاجتماع قديم ليست عالقة (الحجز حديث)", () => {
    expect(isStaleGeneration(fresh, old, now)).toBe(false);
  });
  it("بلا حدث حجز يُرجع لوقت الانتهاء؛ وبلا أي وقت = ليس عالقاً", () => {
    expect(isStaleGeneration(null, old, now)).toBe(true);
    expect(isStaleGeneration(null, fresh, now)).toBe(false);
    expect(isStaleGeneration(null, null, now)).toBe(false);
  });
});

describe("parseAgentCompletion", () => {
  it("يقبل الأرقام والتشخيص ويطهّر ما عداها", () => {
    expect(
      parseAgentCompletion({
        tracks: 1,
        audioSeconds: 85.4,
        speechStarts: 0,
        finals: 0,
        uploaded: 0,
        pending: 0,
        diagnosis: "silent-audio",
        extra: "ignored",
      }),
    ).toEqual({
      tracks: 1,
      audioSeconds: 85.4,
      speechStarts: 0,
      finals: 0,
      uploaded: 0,
      pending: 0,
      diagnosis: "silent-audio",
    });
  });

  it("جسم فارغ أو خبيث → أصفار وتشخيص unknown مقصوص", () => {
    expect(parseAgentCompletion(null).diagnosis).toBe("unknown");
    const p = parseAgentCompletion({ tracks: -5, finals: "x", diagnosis: "a".repeat(500) });
    expect(p.tracks).toBe(0);
    expect(p.finals).toBe(0);
    expect(p.diagnosis.length).toBe(60);
  });
});

describe("الربط في الكود", () => {
  const service = read("server/services/meetingsService.ts");
  const minutes = read("server/services/meetingMinutesService.ts");
  const routes = read("server/routes/meetingMinutesRoutes.ts");

  it("endMeeting لا يولّد فوراً بل يضع المؤقت الاحتياطي", () => {
    const body = service.slice(service.indexOf("export async function endMeeting"));
    const fn = body.slice(0, body.indexOf("\n}\n"));
    expect(fn).not.toContain("generateMinutes(");
    expect(fn).toContain("scheduleMinutesFallback(meeting.id)");
  });

  it("endMeeting محروس بالحالة: الإنهاء مرة واحدة", () => {
    const body = service.slice(service.indexOf("export async function endMeeting"));
    const fn = body.slice(0, body.indexOf("\n}\n"));
    expect(fn).toContain('inArray(meetings.status, ["live", "scheduled"])');
    expect(fn).toContain("if (!ended.length) return;");
  });

  it("كنس لا يعتمد على ذاكرة العملية يلتقط ما ضاع مؤقته عند إعادة التشغيل", () => {
    expect(service).toContain("void sweepPendingMinutes();");
    expect(service).toContain('inArray(meetings.minutesStatus, ["none", "recording"])');
    expect(service).toContain('m.generateMinutes(row.id, "auto")');
  });

  it("كتابات نتيجة التوليد كلها مشروطة ببقاء الحجز — لا كتابة فوق معتمد", () => {
    const body = minutes.slice(minutes.indexOf("export async function generateMinutes"));
    const fn = body.slice(0, body.indexOf("\n}\n"));
    expect(fn.match(/finishGeneration\(meetingId, claimId,/g)?.length).toBe(3);
    expect(fn).not.toContain("db.update(meetings)");
  });

  it("الكنس يحرر التوليد العالق", () => {
    expect(service).toContain("await m.releaseStaleGenerations();");
  });

  it("المؤقت الاحتياطي أطول من مهلة إنهاء العامل (٨ث + ٢ث + الرفع)", () => {
    expect(MINUTES_FALLBACK_DELAY_MS).toBeGreaterThanOrEqual(30_000);
  });

  it("الحجز ذرّي بشرط الحالة، ومسار الاكتمال محمي بسر العامل", () => {
    // الحجز والتحرير وكتابة النتيجة كلها تحت قفل صف الاجتماع، ومربوطة بمعرّف الحجز
    expect(minutes.match(/await lockMinutesState\(tx, meetingId\)/g)?.length).toBe(3);
    expect(minutes).toContain('.for("update")');
    expect(minutes).toContain("if (claim?.id !== claimId) return false;");
    expect(routes).toMatch(
      /"\/api\/internal\/meetings-agent\/:id\/complete",\s*requireAgentSecret/,
    );
  });
});
