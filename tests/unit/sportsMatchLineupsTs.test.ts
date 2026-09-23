/**
 * تشكيلات مركز المباراة — تحويل إحداثيات TheSports إلى شبكة الملعب
 * (نفس خوارزمية getMatchDetail الاحتياطية في saudiLeagueService).
 */
import { describe, expect, it } from "vitest";

type P = { id: string; starter: boolean; x: number | null; y: number | null };

function tsPlayersToSplGrid(players: P[]): Map<string, string> {
  const grid = new Map<string, string>();
  const withXy = players.filter((p) => p.starter && (p.x != null || p.y != null) && (p.x || p.y));
  if (withXy.length < 7) return grid;
  const sorted = [...withXy].sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  const rows: P[][] = [];
  for (const p of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs((last[0].x ?? 0) - (p.x ?? 0)) <= 6) last.push(p);
    else rows.push([p]);
  }
  rows.forEach((row, ri) => {
    row.sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    row.forEach((p, ci) => grid.set(p.id, `${ri + 1}:${ci + 1}`));
  });
  return grid;
}

describe("tsPlayersToSplGrid (lineup pitch)", () => {
  it("returns empty when fewer than 7 starters have coordinates", () => {
    const players: P[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      starter: true,
      x: 10 + i,
      y: 20,
    }));
    expect(tsPlayersToSplGrid(players).size).toBe(0);
  });

  it("builds row:col grid for a 4-3-3 shape", () => {
    // حارس + 4 دفاع + 3 وسط + 3 هجوم
    const players: P[] = [
      { id: "gk", starter: true, x: 5, y: 50 },
      { id: "d1", starter: true, x: 20, y: 15 },
      { id: "d2", starter: true, x: 20, y: 35 },
      { id: "d3", starter: true, x: 22, y: 65 },
      { id: "d4", starter: true, x: 21, y: 85 },
      { id: "m1", starter: true, x: 45, y: 25 },
      { id: "m2", starter: true, x: 45, y: 50 },
      { id: "m3", starter: true, x: 46, y: 75 },
      { id: "f1", starter: true, x: 75, y: 20 },
      { id: "f2", starter: true, x: 78, y: 50 },
      { id: "f3", starter: true, x: 76, y: 80 },
      { id: "bench", starter: false, x: 90, y: 50 },
    ];
    const grid = tsPlayersToSplGrid(players);
    expect(grid.get("gk")).toBe("1:1");
    expect(grid.get("d1")).toBe("2:1");
    expect(grid.get("d4")).toBe("2:4");
    expect(grid.get("m2")).toBe("3:2");
    expect(grid.get("f3")).toBe("4:3");
    expect(grid.has("bench")).toBe(false);
  });
});
