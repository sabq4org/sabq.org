import { describe, it, expect } from "vitest";
import type { SmSquadPlayer } from "../../server/services/sportmonksService";
import type { SplSquadPlayer } from "../../server/services/saudiLeagueService";

describe("SportMonks Squad Integration & Enrichment", () => {
  it("validates SmSquadPlayer data structure and fields", () => {
    const rawSmPlayer: SmSquadPlayer = {
      id: 708727,
      playerId: 129890,
      teamId: 625,
      jerseyNumber: 5,
      positionId: 26,
      detailedPositionId: 149,
      detailedPositionAr: "وسط دفاعي",
      position: "Midfielder",
      positionAr: "لاعب وسط",
      captain: true,
      contractStart: "2023-07-01",
      contractEnd: "2030-06-30",
      name: "Manuel Locatelli",
      displayName: "M. Locatelli",
      commonName: "Manuel Locatelli",
      photo: "https://cdn.sportmonks.com/images/soccer/players/26/129890.png",
      height: 185,
      weight: 75,
      dateOfBirth: "1998-01-08",
      age: 28,
      nationality: {
        id: 251,
        name: "Italy",
        nameAr: "Italy",
        fifaName: "ITA",
        iso2: "IT",
        flagUrl: "https://cdn.sportmonks.com/images/soccer/countries/251.png",
      },
    };

    expect(rawSmPlayer.captain).toBe(true);
    expect(rawSmPlayer.jerseyNumber).toBe(5);
    expect(rawSmPlayer.detailedPositionAr).toBe("وسط دفاعي");
    expect(rawSmPlayer.nationality?.flagUrl).toBe("https://cdn.sportmonks.com/images/soccer/countries/251.png");
    expect(rawSmPlayer.nationality?.fifaName).toBe("ITA");
  });

  it("enriches SplSquadPlayer with captain, nationality, and contract metadata", () => {
    const player: SplSquadPlayer = {
      id: 129890,
      name: "مانويل لوكاتيلي",
      number: 5,
      position: "لاعب وسط",
      positionEn: "Midfielder",
      age: 28,
      photo: "https://cdn.sportmonks.com/images/soccer/players/26/129890.png",
      captain: true,
      nationality: {
        name: "إيطاليا",
        flag: "https://cdn.sportmonks.com/images/soccer/countries/251.png",
        code: "ITA",
      },
      height: 185,
      weight: 75,
      contract: {
        start: "2023-07-01",
        end: "2030-06-30",
      },
      detailedPosition: "وسط دفاعي",
    };

    expect(player.captain).toBe(true);
    expect(player.nationality?.code).toBe("ITA");
    expect(player.contract?.end).toBe("2030-06-30");
    expect(player.detailedPosition).toBe("وسط دفاعي");
  });

  it("handles fallback players gracefully when captain or nationality are absent", () => {
    const fallbackPlayer: SplSquadPlayer = {
      id: 99999,
      name: "لاعب تجريبي",
      number: 10,
      position: "مهاجم",
      positionEn: "Attacker",
      age: 22,
      photo: "",
    };

    expect(fallbackPlayer.captain).toBeUndefined();
    expect(fallbackPlayer.nationality).toBeUndefined();
    expect(fallbackPlayer.contract).toBeUndefined();
    expect(fallbackPlayer.detailedPosition).toBeUndefined();
  });
});
