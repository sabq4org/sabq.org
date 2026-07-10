import { describe, expect, it, beforeEach } from "vitest";
import {
  applyTheSportsMqttPayload,
  clearTheSportsMqttLiveForTests,
  getTheSportsMqttMatchCount,
} from "../../server/services/theSportsService";

describe("applyTheSportsMqttPayload", () => {
  beforeEach(() => {
    clearTheSportsMqttLiveForTests();
  });

  it("merges score rows shaped like detail_live score arrays", () => {
    const touched = applyTheSportsMqttPayload({
      score: [
        ["abc123", 2, [1, 0, 0, 0, 2, 0, 0], [0, 0, 0, 0, 1, 0, 0], 1_720_000_000, ""],
      ],
    });
    expect(touched).toBe(1);
    expect(getTheSportsMqttMatchCount()).toBe(1);
  });

  it("keeps prior incidents when a later message only updates score", () => {
    applyTheSportsMqttPayload({
      incidents: [
        {
          id: "m1",
          incidents: [{ type: 1, position: 1, time: 12, player_name: "Ali" }],
        },
      ],
    });
    applyTheSportsMqttPayload({
      score: [["m1", 2, [1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], 1_720_000_000, ""]],
    });
    expect(getTheSportsMqttMatchCount()).toBe(1);
    // إعادة تطبيق incidents+score معًا تثبت الدمج الميداني
    const again = applyTheSportsMqttPayload({
      score: [["m1", 2, [2, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0], 1_720_000_000, ""]],
      incidents: [
        {
          id: "m1",
          incidents: [
            { type: 1, position: 1, time: 12, player_name: "Ali" },
            { type: 1, position: 1, time: 40, player_name: "Sara" },
          ],
        },
      ],
    });
    expect(again).toBe(1);
  });

  it("accepts a full single-match object", () => {
    const touched = applyTheSportsMqttPayload({
      id: "xyz",
      score: ["xyz", 4, [2, 1, 0, 0, 3, 0, 0], [1, 0, 0, 1, 2, 0, 0], 1_720_000_100, ""],
      stats: [{ type: 25, home: 55, away: 45 }],
      incidents: [{ type: 3, position: 2, time: 67, player_name: "X" }],
    });
    expect(touched).toBe(1);
    expect(getTheSportsMqttMatchCount()).toBe(1);
  });

  it("ignores invalid payloads", () => {
    expect(applyTheSportsMqttPayload(null)).toBe(0);
    expect(applyTheSportsMqttPayload("not-json")).toBe(0);
    expect(applyTheSportsMqttPayload({})).toBe(0);
  });
});
