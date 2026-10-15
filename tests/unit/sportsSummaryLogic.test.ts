/**
 * اختبارات منطق موجز البطولات (sportsSummaryService):
 * - اختيار المباراة القادمة / الجارية (عدم اختيار مباراة منتهية اليوم كـ nextMatch)
 * - احتساب المتصدّر بالترتيب المبدئي اللحظي والمنتهية المعلّقة
 */
import { describe, it, expect } from "vitest";
import {
  applyProvisionalTable,
  selectUnabsorbedFinished,
  isLeagueTableRound,
  mergeSeasonWithLive,
  type StandingRowLike,
  type LiveFixtureLike,
} from "../../server/services/liveStandings";

interface TestFixture extends LiveFixtureLike {
  id: number;
  timestamp: number;
  round: string;
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
}

const NOW = Math.floor(Date.UTC(2026, 7, 13, 18, 0, 0) / 1000); // 2026-08-13 21:00:00 الرياض
const RIYADH_TZ = "Asia/Riyadh";
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: RIYADH_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const riyadhDayKey = (ts: number): string => dayKeyFmt.format(new Date(ts * 1000));

describe("منطق موجز البطولات — اختيار المباراة القادمة / الجارية", () => {
  const todayKey = riyadhDayKey(NOW);

  it("مباراة منتهية اليوم لا تُختار كـ nextMatch إن وُجدت مباراة قادمة غداً أو لاحقاً", () => {
    const finishedEarlierToday: TestFixture = {
      id: 101,
      home: { id: 1, name: "أبها", logo: "" },
      away: { id: 2, name: "الحزم", logo: "" },
      goals: { home: 0, away: 2 },
      status: { live: false, finished: true },
      timestamp: NOW - 3 * 3600, // قبل 3 ساعات (اليوم)
      round: "الجولة 1",
    };
    const upcomingTomorrow: TestFixture = {
      id: 102,
      home: { id: 3, name: "الهلال", logo: "" },
      away: { id: 4, name: "الرياض", logo: "" },
      goals: { home: null, away: null },
      status: { live: false, finished: false },
      timestamp: NOW + 24 * 3600, // غداً
      round: "الجولة 1",
    };

    const fixtures: TestFixture[] = [finishedEarlierToday, upcomingTomorrow];

    const liveMatches = fixtures.filter((f) => f.status.live);
    const todayMatches = fixtures.filter((f) => riyadhDayKey(f.timestamp) === todayKey);
    const todayUpcoming = todayMatches
      .filter((f) => !f.status.finished && !f.status.live)
      .sort((a, b) => a.timestamp - b.timestamp);
    const futureUpcoming = fixtures
      .filter(
        (f) =>
          !f.status.finished &&
          !f.status.live &&
          riyadhDayKey(f.timestamp) !== todayKey &&
          f.timestamp * 1000 >= NOW * 1000,
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    const anchor = liveMatches[0] ?? todayUpcoming[0] ?? futureUpcoming[0] ?? null;

    expect(todayMatches.length).toBe(1);
    expect(todayUpcoming.length).toBe(0);
    expect(anchor).not.toBeNull();
    expect(anchor?.id).toBe(102); // يختار مباراة الغد القادمة، وليس منتهية اليوم
  });

  it("مباراة جارية الآن تتصدر وتُختار كـ nextMatch", () => {
    const liveNow: TestFixture = {
      id: 201,
      home: { id: 5, name: "النصر", logo: "" },
      away: { id: 6, name: "الاتحاد", logo: "" },
      goals: { home: 1, away: 0 },
      status: { live: true, finished: false },
      timestamp: NOW - 1800,
      round: "الجولة 1",
    };
    const upcomingLater: TestFixture = {
      id: 202,
      home: { id: 7, name: "الأهلي", logo: "" },
      away: { id: 8, name: "الشباب", logo: "" },
      goals: { home: null, away: null },
      status: { live: false, finished: false },
      timestamp: NOW + 7200,
      round: "الجولة 1",
    };

    const fixtures = [liveNow, upcomingLater];
    const liveMatches = fixtures.filter((f) => f.status.live);
    const todayUpcoming = fixtures.filter((f) => !f.status.finished && !f.status.live);

    const anchor = liveMatches[0] ?? todayUpcoming[0] ?? null;
    expect(anchor?.id).toBe(201);
  });
});

describe("منطق موجز البطولات — احتساب المتصدر في بداية الموسم والجولات", () => {
  it("الجدول الرسمي 0 نقاط يُحدَّث بانتصار الحزم ليصبح الحزم متصدراً بنقاطه وفارق الأهداف", () => {
    const baseStandings: StandingRowLike[] = [
      { team: { id: 10 }, rank: 1, played: 0, win: 0, draw: 0, lose: 0, goalsFor: 0, goalsAgainst: 0, goalsDiff: 0, points: 0 }, // الهلال (افتراضي 0)
      { team: { id: 2 }, rank: 2, played: 0, win: 0, draw: 0, lose: 0, goalsFor: 0, goalsAgainst: 0, goalsDiff: 0, points: 0 },  // الحزم
      { team: { id: 1 }, rank: 3, played: 0, win: 0, draw: 0, lose: 0, goalsFor: 0, goalsAgainst: 0, goalsDiff: 0, points: 0 },  // أبها
    ];

    const finishedMatch: TestFixture = {
      id: 301,
      home: { id: 1, name: "أبها", logo: "" },
      away: { id: 2, name: "الحزم", logo: "" },
      goals: { home: 0, away: 2 },
      status: { live: false, finished: true },
      timestamp: NOW - 3600,
      round: "الجولة 1",
    };

    const pending = selectUnabsorbedFinished(baseStandings, [finishedMatch], {
      isCountedRound: isLeagueTableRound,
      nowMs: NOW * 1000,
    });
    const provisional = applyProvisionalTable(baseStandings, [finishedMatch], pending);

    const leader = provisional[0];
    expect(leader.team.id).toBe(2); // الحزم
    expect(leader.points).toBe(3);
    expect(leader.goalsDiff).toBe(2);
  });
});
