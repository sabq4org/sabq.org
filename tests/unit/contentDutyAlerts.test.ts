import { describe, expect, it } from "vitest";
import { expandOccurrences, riyadhMidnight, type ActivityKind, type DutyOccurrence } from "../../shared/contentDuty";
import {
  DEFAULT_DUTY_ALERT_SETTINGS,
  alertKey,
  deferredUntilFor,
  dutyAlertText,
  dutyDigestText,
  evaluateBreakingAlerts,
  evaluateOccurrenceAlerts,
  inQuietHours,
  normalizeAlertSettings,
  occurrenceAlertKey,
  riyadhTime,
  summaryDataFromReport,
  type DutyAlertCandidate,
  type DutyAlertSettings,
  type SentAlert,
} from "../../shared/contentDutyAlerts";
import { computeShiftReport, DEFAULT_DUTY_THRESHOLDS } from "../../shared/contentDuty";

const MIN = 60_000;
// الخميس 26 نوفمبر 2026، وردية 14:00–20:00 بتوقيت الرياض
const THU = riyadhMidnight("2026-11-26");
const occ: DutyOccurrence = {
  key: "s1:2026-11-26", shiftId: "s1", userId: "u1", coveredUserId: null, dutyDate: "2026-11-26",
  start: THU + 14 * 60 * MIN, end: THU + 20 * 60 * MIN,
};

/** دقائق نشاط بإزاحات من بداية الوردية. */
function activity(occStart: number, spec: Array<[number, number, ActivityKind]>): Map<number, ActivityKind> {
  const m = new Map<number, ActivityKind>();
  for (const [from, to, kind] of spec) for (let i = from; i < to; i++) m.set(occStart + i * MIN, kind);
  return m;
}

interface Fired extends DutyAlertCandidate { at: number; offset: number }

/** يشغّل المنطق كل دقيقة كما يفعل المحرك، ويحفظ ما يطلقه في sent. */
function simulate(o: DutyOccurrence, minutes: Map<number, ActivityKind>, opts: {
  fromOffset?: number; toOffset?: number; settings?: DutyAlertSettings; trackedFrom?: number; lastWorkAt?: (now: number) => number | null;
} = {}): Fired[] {
  const sent = new Map<string, SentAlert>();
  const fired: Fired[] = [];
  const from = opts.fromOffset ?? -30;
  const to = opts.toOffset ?? Math.round((o.end - o.start) / MIN) + 20;
  for (let i = from; i <= to; i++) {
    const now = o.start + i * MIN;
    const out = evaluateOccurrenceAlerts({
      occ: o, now, minutes, sent,
      lastWorkAt: opts.lastWorkAt ? opts.lastWorkAt(now) : null,
      settings: opts.settings ?? DEFAULT_DUTY_ALERT_SETTINGS,
      trackedFrom: opts.trackedFrom,
    });
    for (const c of out) {
      sent.set(c.dedupeKey, { at: now, data: c.data });
      fired.push({ ...c, at: now, offset: i });
    }
  }
  return fired;
}
const kinds = (f: Fired[]) => f.map((x) => `${x.kind}@${x.offset}`);

describe("settings", () => {
  it("defaults: absent 60, idle 90, late 15, every kind on, quiet 02:00–06:00 Riyadh", () => {
    const s = normalizeAlertSettings(null);
    expect(s.absentMin).toBe(60);
    expect(s.idleMin).toBe(90);
    expect(s.lateMin).toBe(15);
    expect(Object.values(s.enabled).every(Boolean)).toBe(true);
    expect(s.quietHours).toEqual({ enabled: true, startMinute: 120, endMinute: 360 });
  });
  it("clamps bad values and keeps valid ones", () => {
    const s = normalizeAlertSettings({ absentMin: 3, idleMin: 120, enabled: { idle: false, bogus: true }, quietHours: { enabled: false, startMinute: 0, endMinute: 420 } });
    expect(s.absentMin).toBe(60);
    expect(s.idleMin).toBe(120);
    expect(s.enabled.idle).toBe(false);
    expect(s.quietHours).toEqual({ enabled: false, startMinute: 0, endMinute: 420 });
    expect(normalizeAlertSettings({ quietHours: { startMinute: 300, endMinute: 300 } }).quietHours).toEqual(DEFAULT_DUTY_ALERT_SETTINGS.quietHours);
  });
});

describe("started / late", () => {
  it("first activity (even 20 min early) is the start; fires once", () => {
    const f = simulate(occ, activity(occ.start, [[-20, 300, "action"]]));
    expect(kinds(f)).toEqual(["started@0", "summary@360"]);
    expect(f[0].data).toMatchObject({ firstAt: occ.start - 20 * MIN, lateMin: 0 });
    expect(f[0].dedupeKey).toBe("s1:2026-11-26:u1:started");
  });
  it("late fires once at 15 min, then started when he shows up with the delay", () => {
    const f = simulate(occ, activity(occ.start, [[40, 330, "action"]]));
    expect(kinds(f)).toEqual(["late@15", "started@41", "summary@360"]);
    expect(f[1].data.lateMin).toBe(40);
  });
  it("no late before tracking started (shift began before staff activity was recorded)", () => {
    const f = simulate(occ, activity(occ.start, [[150, 330, "action"]]), { trackedFrom: occ.start + 140 * MIN });
    expect(kinds(f)).toEqual(["started@151", "summary@360"]);
    expect(f[0].data.lateMin).toBeNull();
  });
  it("a never-attended shift: late then summary only (no absent without a first activity)", () => {
    expect(kinds(simulate(occ, new Map()))).toEqual(["late@15", "summary@360"]);
  });
});

describe("absent / returned rounds", () => {
  it("one alert per absence (60 min with no request), returned closes it, next round after new activity", () => {
    // حاضر 0–30، غائب 30–100، حاضر 100–150، غائب 150–220، حاضر 220–330
    const f = simulate(occ, activity(occ.start, [[0, 30, "action"], [100, 150, "action"], [220, 330, "action"]]));
    expect(kinds(f)).toEqual(["started@1", "absent@90", "returned@101", "absent@210", "returned@221", "summary@360"]);
    expect(f[1].dedupeKey).toBe(alertKey("s1:2026-11-26:u1", "absent", 1));
    expect(f[1].data).toMatchObject({ since: occ.start + 30 * MIN, minutes: 60 });
    expect(f[2].data).toMatchObject({ gapMin: 70 });
    expect(f[3].dedupeKey).toBe(alertKey("s1:2026-11-26:u1", "absent", 2));
  });
  it("caps at 5 absence rounds per shift", () => {
    const longOcc = { ...occ, end: occ.start + 12 * 60 * MIN };
    const spec: Array<[number, number, ActivityKind]> = [];
    for (let k = 0; k < 7; k++) spec.push([k * 100, k * 100 + 5, "action"]);
    const f = simulate(longOcc, activity(longOcc.start, spec));
    expect(f.filter((x) => x.kind === "absent")).toHaveLength(5);
  });
  it("still opens a new round when «returned» is switched off", () => {
    const settings = normalizeAlertSettings({ enabled: { returned: false } });
    const f = simulate(occ, activity(occ.start, [[0, 30, "action"], [100, 150, "action"], [220, 330, "action"]]), { settings });
    expect(kinds(f)).toEqual(["started@1", "absent@90", "absent@210", "summary@360"]);
  });
  it("pre-shift presence does not count toward an absence (clamped to the shift start)", () => {
    const f = simulate(occ, activity(occ.start, [[-25, -20, "view"], [70, 330, "action"]]));
    expect(kinds(f)).toEqual(["started@0", "absent@60", "returned@71", "summary@360"]);
  });
});

describe("idle (open dashboard, no save or publish for 90 min)", () => {
  it("fires once per idle stretch and again only after new work", () => {
    // عمل 0–10، مشاهدة فقط 10–130، عمل 130–140، مشاهدة 140–330
    const f = simulate(occ, activity(occ.start, [[0, 10, "action"], [10, 130, "view"], [130, 140, "action"], [140, 330, "view"]]));
    expect(kinds(f)).toEqual(["started@1", "idle@100", "idle@230", "summary@360"]);
    expect(f[1].data).toMatchObject({ minutes: 90 });
  });
  it("article saves (lastWorkAt from versions) count as work", () => {
    const f = simulate(occ, activity(occ.start, [[0, 330, "view"]]), { lastWorkAt: (now) => now - 5 * MIN });
    expect(f.some((x) => x.kind === "idle")).toBe(false);
  });
  it("does not fire while absent (not currently present)", () => {
    const f = simulate(occ, activity(occ.start, [[0, 5, "view"]]));
    expect(f.some((x) => x.kind === "idle")).toBe(false);
  });
});

describe("quiet tail and summary window", () => {
  it("no late/absent/idle in the last 15 minutes of the shift", () => {
    // آخر نشاط عند 285: الغياب كان سيُطلق عند 345 وهي ضمن آخر 15 دقيقة
    const f = simulate(occ, activity(occ.start, [[0, 285, "action"]]));
    expect(kinds(f)).toEqual(["started@1", "summary@360"]);
    const shortOcc = { ...occ, end: occ.start + 20 * MIN };
    expect(simulate(shortOcc, new Map()).map((x) => x.kind)).toEqual(["summary"]);
  });
  it("summary is only produced within 20 minutes after the end", () => {
    const f = simulate(occ, activity(occ.start, [[0, 330, "action"]]), { fromOffset: 381, toOffset: 400 });
    expect(f).toHaveLength(0);
  });
  it("summary data comes from computeShiftReport fields", () => {
    const minutes = activity(occ.start, [[0, 330, "action"]]);
    const report = computeShiftReport({
      occ, now: occ.end + 5 * MIN, minutes, ownVersions: [], ownReviews: [], items: [], breakingIds: new Set(), thresholds: DEFAULT_DUTY_THRESHOLDS,
    });
    const data = summaryDataFromReport(report, occ);
    expect(data).toMatchObject({ published: 0, leftAtHandoff: 0, startAt: occ.start, endAt: occ.end });
    expect(dutyAlertText("summary", "فلان", data)).toContain("انتهت وردية فلان (14:00–20:00)");
  });
});

describe("leave and cover", () => {
  const shifts = [{ id: "s1", userId: "u1", days: [4], startMinute: 14 * 60, endMinute: 20 * 60 }];
  it("a registered leave removes the occurrence: no late, no absence", () => {
    const occs = expandOccurrences(shifts, [{ id: "e1", dutyDate: "2026-11-26", userId: "u1", coverUserId: null }], THU, THU + 24 * 60 * MIN);
    expect(occs).toHaveLength(0);
  });
  it("the cover is tracked under their own name and key", () => {
    const [cover] = expandOccurrences(shifts, [{ id: "e1", dutyDate: "2026-11-26", userId: "u1", coverUserId: "u2" }], THU, THU + 24 * 60 * MIN);
    expect(cover.userId).toBe("u2");
    expect(occurrenceAlertKey(cover)).toBe("s1:2026-11-26:u2");
    const f = simulate(cover, new Map());
    expect(f[0]).toMatchObject({ kind: "late", userId: "u2", dedupeKey: "s1:2026-11-26:u2:late" });
  });
});

describe("breaking_overdue", () => {
  const settings = DEFAULT_DUTY_ALERT_SETTINGS;
  const now = occ.start + 60 * MIN;
  const item = { articleId: "a1", title: "عاجل", breaking: true, waitingSince: now - 20 * MIN, decidedAt: null };
  const base = { items: [item], now, thresholds: DEFAULT_DUTY_THRESHOLDS, lockedIds: new Set<string>(), live: [occ], sent: new Set<string>(), settings };
  it("fires for an overdue breaking item nobody opened, attributed to the on-duty manager", () => {
    const [c] = evaluateBreakingAlerts(base);
    expect(c).toMatchObject({ kind: "breaking_overdue", userId: "u1", dedupeKey: `breaking:a1:${Math.floor(item.waitingSince / MIN)}` });
    expect(c.data.waitMin).toBe(20);
  });
  it("skips when locked, not overdue, not breaking, already sent, or no live shift", () => {
    expect(evaluateBreakingAlerts({ ...base, lockedIds: new Set(["a1"]) })).toHaveLength(0);
    expect(evaluateBreakingAlerts({ ...base, items: [{ ...item, waitingSince: now - 10 * MIN }] })).toHaveLength(0);
    expect(evaluateBreakingAlerts({ ...base, items: [{ ...item, breaking: false }] })).toHaveLength(0);
    expect(evaluateBreakingAlerts({ ...base, sent: new Set([`breaking:a1:${Math.floor(item.waitingSince / MIN)}`]) })).toHaveLength(0);
    expect(evaluateBreakingAlerts({ ...base, live: [] })).toHaveLength(0);
    expect(evaluateBreakingAlerts({ ...base, settings: normalizeAlertSettings({ enabled: { breaking_overdue: false } }) })).toHaveLength(0);
  });
});

describe("quiet hours (02:00–06:00 Riyadh) defer to one morning digest", () => {
  const q = DEFAULT_DUTY_ALERT_SETTINGS.quietHours;
  const at = (hh: number, mm = 0) => THU + (hh * 60 + mm) * MIN;
  it("window bounds: 02:00 inside, 05:59 inside, 06:00 and 01:59 outside", () => {
    expect(inQuietHours(at(2), q)).toBe(true);
    expect(inQuietHours(at(5, 59), q)).toBe(true);
    expect(inQuietHours(at(6), q)).toBe(false);
    expect(inQuietHours(at(1, 59), q)).toBe(false);
    expect(inQuietHours(at(3), { ...q, enabled: false })).toBe(false);
  });
  it("deferred_until is the next 06:00 Riyadh", () => {
    expect(deferredUntilFor(at(2, 5, ), q)).toBe(at(6));
    expect(deferredUntilFor(at(5, 59), q)).toBe(at(6));
    expect(deferredUntilFor(at(12), q)).toBeNull();
    // نافذة تعبر منتصف الليل 23:00–07:00
    const wrap = { enabled: true, startMinute: 23 * 60, endMinute: 7 * 60 };
    expect(deferredUntilFor(at(23, 30), wrap)).toBe(at(31));
    expect(deferredUntilFor(at(1), wrap)).toBe(at(7));
  });
  it("the night-shift summary at 02:05 is deferred to 06:00", () => {
    const night: DutyOccurrence = { ...occ, key: "s2:2026-11-26", start: at(20), end: at(26) };
    const f = simulate(night, activity(night.start, [[0, 350, "action"]]));
    const summary = f.find((x) => x.kind === "summary");
    expect(summary?.at).toBe(at(26));
    expect(deferredUntilFor(summary!.at, q)).toBe(at(30));
  });
  it("digest text lists each alert with its Riyadh time", () => {
    const text = dutyDigestText([{ text: "ب", createdAt: at(3) }, { text: "أ", createdAt: at(2, 10) }], q);
    expect(text.split("\n")).toEqual(["ملخص ساعات الهدوء (02:00–06:00 بتوقيت الرياض): 2 تنبيه.", "• 02:10 أ", "• 03:00 ب"]);
    expect(riyadhTime(at(14, 5))).toBe("14:05");
  });
});
