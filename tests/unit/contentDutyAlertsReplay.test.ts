// يعيد تشغيل شكل نشاط حقيقي من الإنتاج (مجهّل، tests/fixtures/contentDutyActivityReplay.json)
// دقيقة بدقيقة كما يفعل المحرك، ويتحقق من التنبيهات الناتجة.
import { describe, expect, it } from "vitest";
import fixture from "../fixtures/contentDutyActivityReplay.json";
import { expandOccurrences, riyadhMidnight, type ActivityKind } from "../../shared/contentDuty";
import {
  DEFAULT_DUTY_ALERT_SETTINGS,
  DUTY_EARLY_START_MIN,
  DUTY_SUMMARY_WINDOW_MIN,
  deferredUntilFor,
  evaluateOccurrenceAlerts,
  type SentAlert,
} from "../../shared/contentDutyAlerts";

const MIN = 60_000;
const BASE = riyadhMidnight("2026-11-22") + 20 * 60 * MIN;
const trackedFrom = BASE + fixture.trackedFromOffset * MIN;
const minutes = new Map<string, Map<number, ActivityKind>>();
for (const [user, seq] of Object.entries(fixture.activity)) {
  const m = new Map<number, ActivityKind>();
  for (const tok of seq.split(",")) m.set(BASE + Number(tok.slice(0, -1)) * MIN, tok.endsWith("a") ? "action" : "view");
  minutes.set(user, m);
}
const exceptions = fixture.leave.map((l, i) => ({ id: `e${i}`, dutyDate: l.dutyDate, userId: l.userId, coverUserId: null }));

function replay(fromOffset: number, toOffset: number, sent = new Map<string, SentAlert>()) {
  const fired: Array<{ user: string; kind: string; offset: number; deferredOffset: number | null; data: Record<string, unknown>; inWindow: boolean }> = [];
  for (let i = fromOffset; i <= toOffset; i++) {
    const now = BASE + i * MIN;
    const occs = expandOccurrences(fixture.shifts, exceptions, now - 24 * 60 * MIN, now + 60 * MIN)
      .filter((o) => o.start - DUTY_EARLY_START_MIN * MIN <= now && now < o.end + DUTY_SUMMARY_WINDOW_MIN * MIN);
    for (const occ of occs) {
      const out = evaluateOccurrenceAlerts({
        occ, now, minutes: minutes.get(occ.userId) ?? new Map(), lastWorkAt: null, sent, settings: DEFAULT_DUTY_ALERT_SETTINGS, trackedFrom,
      });
      for (const c of out) {
        sent.set(c.dedupeKey, { at: now, data: c.data });
        const d = deferredUntilFor(now, DEFAULT_DUTY_ALERT_SETTINGS.quietHours);
        fired.push({
          user: occ.userId, kind: c.kind, offset: i, data: c.data,
          deferredOffset: d === null ? null : (d - BASE) / MIN,
          inWindow: now >= occ.start - DUTY_EARLY_START_MIN * MIN && now < occ.end + DUTY_SUMMARY_WINDOW_MIN * MIN,
        });
      }
    }
  }
  return fired;
}

describe("replay of real (anonymized) prod activity, 2026-11-22 22:23 → 2026-11-23 21:00 Riyadh", () => {
  const fired = replay(fixture.trackedFromOffset, 1500);

  it("produces exactly the expected alerts", () => {
    expect(fired.map((f) => `${f.user}:${f.kind}@${f.offset}${f.deferredOffset === null ? "" : `→${f.deferredOffset}`}`)).toEqual([
      // الوردية الليلية للأحد 20:00–02:00: أول نشاط مسجّل 22:23 (بداية التسجيل) فلا تأخر يُنسب له
      "U2:started@144",
      // الملخص عند 02:00 يقع في ساعات الهدوء فيُؤجل إلى 06:00
      "U2:summary@360→600",
      // الاثنين: U4 في إجازة (لا شيء)، U1 لم يظهر بعد 14:00، وU2 لم يظهر بعد 20:00 (البيانات تنتهي قبلها)
      "U1:late@1095",
      "U1:summary@1440",
      "U2:late@1455",
    ]);
  });
  it("started carries no lateness when the shift began before tracking", () => {
    expect(fired[0].data.lateMin).toBeNull();
  });
  it("no alert outside a shift window (U1 at 00:10–00:45 and U2 after 02:00 are off shift)", () => {
    expect(fired.every((f) => f.inWindow)).toBe(true);
  });
  it("leave days never produce alerts", () => {
    expect(fired.some((f) => f.user === "U4")).toBe(false);
  });
  it("is idempotent: a second instance replaying with the stored keys adds nothing", () => {
    const sent = new Map<string, SentAlert>();
    expect(replay(fixture.trackedFromOffset, 1500, sent)).toHaveLength(fired.length);
    expect(replay(fixture.trackedFromOffset, 1500, sent)).toHaveLength(0);
  });
});
