import { describe, expect, it } from "vitest";
import {
  buildGcMajlisOvertakeNotifications,
  detectGcMajlisOvertakes,
  selectGcMajlisReminderCandidates,
  type GcMajlisRankSnapshotRow,
} from "../../server/services/gcMajlisNotificationsLogic";

describe("selectGcMajlisReminderCandidates", () => {
  it("selects one most-active council per user", () => {
    const createdAt = new Date("2026-07-01T00:00:00Z");
    const selected = selectGcMajlisReminderCandidates([
      { userId: "u1", majlisId: "m1", majlisName: "الأول", predictedPeers: 2, createdAt },
      { userId: "u1", majlisId: "m2", majlisName: "النشط", predictedPeers: 5, createdAt },
      { userId: "u2", majlisId: "m3", majlisName: "الثالث", predictedPeers: 1, createdAt },
    ]);

    expect(selected).toHaveLength(2);
    expect(selected.find((row) => row.userId === "u1")?.majlisId).toBe("m2");
  });

  it("breaks equal activity by oldest council then stable id", () => {
    const selected = selectGcMajlisReminderCandidates([
      {
        userId: "u1",
        majlisId: "m-new",
        majlisName: "الجديد",
        predictedPeers: 3,
        createdAt: new Date("2026-07-02T00:00:00Z"),
      },
      {
        userId: "u1",
        majlisId: "m-old",
        majlisName: "القديم",
        predictedPeers: 3,
        createdAt: new Date("2026-07-01T00:00:00Z"),
      },
    ]);

    expect(selected[0]?.majlisId).toBe("m-old");
  });
});

function rankRow(
  overrides: Partial<GcMajlisRankSnapshotRow> & Pick<GcMajlisRankSnapshotRow, "userId" | "name">,
): GcMajlisRankSnapshotRow {
  return {
    majlisId: "m1",
    majlisName: "ديوانية الأصدقاء",
    joinedAt: new Date("2026-07-01T00:00:00Z"),
    points: 0,
    exact: 0,
    correct: 0,
    fixturePoints: 0,
    fixtureExact: 0,
    fixtureCorrect: 0,
    ...overrides,
  };
}

describe("detectGcMajlisOvertakes", () => {
  it("emits only when a member crosses from behind to ahead", () => {
    const events = detectGcMajlisOvertakes([
      rankRow({ userId: "ali", name: "علي", points: 100 }),
      rankRow({
        userId: "saad",
        name: "سعد",
        points: 110,
        fixturePoints: 30,
        fixtureCorrect: 1,
        correct: 1,
      }),
    ]);

    expect(events).toEqual([
      {
        majlisId: "m1",
        majlisName: "ديوانية الأصدقاء",
        overtakerId: "saad",
        overtakerName: "سعد",
        overtakenId: "ali",
      },
    ]);
  });

  it("does not notify for an unchanged order", () => {
    const events = detectGcMajlisOvertakes([
      rankRow({ userId: "ali", name: "علي", points: 100 }),
      rankRow({ userId: "saad", name: "سعد", points: 90, fixturePoints: 5 }),
    ]);

    expect(events).toEqual([]);
  });

  it("uses the same joined-at tie break as the council leaderboard", () => {
    const events = detectGcMajlisOvertakes([
      rankRow({
        userId: "ali",
        name: "علي",
        points: 100,
        joinedAt: new Date("2026-07-02T00:00:00Z"),
      }),
      rankRow({
        userId: "saad",
        name: "سعد",
        points: 100,
        fixturePoints: 10,
        joinedAt: new Date("2026-07-01T00:00:00Z"),
      }),
    ]);

    expect(events.map((event) => [event.overtakerId, event.overtakenId])).toEqual([
      ["saad", "ali"],
    ]);
  });

  it("sends at most one event to the overtaken member", () => {
    const events = detectGcMajlisOvertakes([
      rankRow({ userId: "leader", name: "المتصدر", points: 100 }),
      rankRow({ userId: "first", name: "الأول", points: 140, fixturePoints: 60 }),
      rankRow({ userId: "second", name: "الثاني", points: 120, fixturePoints: 35 }),
    ]);

    const forLeader = events.filter((event) => event.overtakenId === "leader");
    expect(forLeader).toHaveLength(1);
    expect(forLeader[0]?.overtakerId).toBe("first");
  });
});

describe("buildGcMajlisOvertakeNotifications", () => {
  it("builds a deterministic outbox row from the transaction-local fixture label", () => {
    const [notification] = buildGcMajlisOvertakeNotifications([{
      majlisId: "m 1",
      majlisName: "ديوانية الأصدقاء",
      overtakerId: "saad",
      overtakerName: "سعد",
      overtakenId: "ali",
    }], "42", "السعودية وعُمان");

    expect(notification).toMatchObject({
      userId: "ali",
      majlisId: "m 1",
      fixtureId: "42",
      type: "gc.majlis.overtake",
      dedupeKey: "gc-majlis:overtake:m 1:42:ali",
      body: "تجاوزك سعد في ترتيب «ديوانية الأصدقاء» بعد مباراة السعودية وعُمان.",
      deeplink: "/gulf-cup/majlis?id=m+1&fixture=42",
      payload: {
        overtakerId: "saad",
        pushDeeplink: "https://sabq.org/gulf-cup/majlis?id=m+1&fixture=42",
      },
    });
  });
});
