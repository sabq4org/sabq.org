/**
 * تجميع هدّافي وصنّاع أهداف النسخة الحالية من أحداث المباريات (API-Football
 * `fixtures?ids=`) — يُستخدم حين تتأخر قائمة `players/topscorers` لدى المزوّد عن
 * نتائج المباريات المنتهية. دالة صافية بلا اعتماديات لتُختبر وحدها.
 */

export interface GcTallyTeam {
  id: number;
  name: string;
  logo: string;
}

export interface GcTallyRow {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: GcTallyTeam;
  goals: number;
  assists: number;
  penalties: number;
  matches: number;
  minutes: number;
}

interface Tally {
  playerId: number;
  rawName: string;
  teamId: number;
  goals: number;
  assists: number;
  penalties: number;
  lastAt: number;
}

const playerPhoto = (id: number): string =>
  id > 0 ? `https://media.api-sports.io/football/players/${id}.png` : "";

/**
 * يعدّ الأهداف (دون العكسية والركلات الضائعة) والتمريرات الحاسمة من أحداث
 * المباريات الخام، ثم يرتّب: الأهداف ثم التمريرات ثم الأحدث تسجيلًا.
 */
export function tallyGcScorersFromFixtures(
  rawFixtures: any[],
  resolveName: (name: string) => string,
  resolveTeam: (teamId: number) => GcTallyTeam,
): { scorers: GcTallyRow[]; assists: GcTallyRow[] } {
  const tallies = new Map<string, Tally>();
  const bump = (
    playerId: number,
    rawName: string,
    teamId: number,
    at: number,
    apply: (t: Tally) => void,
  ) => {
    if (!rawName && !playerId) return;
    const key = playerId > 0 ? `id:${playerId}` : `name:${teamId}:${rawName}`;
    let tally = tallies.get(key);
    if (!tally) {
      tally = { playerId, rawName, teamId, goals: 0, assists: 0, penalties: 0, lastAt: at };
      tallies.set(key, tally);
    } else if (at > tally.lastAt) {
      tally.lastAt = at;
    }
    apply(tally);
  };

  for (const raw of Array.isArray(rawFixtures) ? rawFixtures : []) {
    const kickoff = Number(raw?.fixture?.timestamp ?? 0) || 0;
    for (const ev of Array.isArray(raw?.events) ? raw.events : []) {
      if (ev?.type !== "Goal") continue;
      const detail = String(ev?.detail ?? "");
      if (detail === "Own Goal" || detail === "Missed Penalty") continue;
      const teamId = Number(ev?.team?.id ?? 0) || 0;
      const at = kickoff + (Number(ev?.time?.elapsed ?? 0) || 0) * 60 + (Number(ev?.time?.extra ?? 0) || 0);
      bump(Number(ev?.player?.id ?? 0) || 0, String(ev?.player?.name ?? ""), teamId, at, (t) => {
        t.goals += 1;
        if (detail === "Penalty") t.penalties += 1;
      });
      const assistName = String(ev?.assist?.name ?? "");
      const assistId = Number(ev?.assist?.id ?? 0) || 0;
      if (assistName || assistId) {
        bump(assistId, assistName, teamId, at, (t) => {
          t.assists += 1;
        });
      }
    }
  }

  const toRow = (t: Tally, index: number): GcTallyRow => ({
    rank: index + 1,
    id: t.playerId,
    name: resolveName(t.rawName) || t.rawName,
    photo: playerPhoto(t.playerId),
    team: resolveTeam(t.teamId),
    goals: t.goals,
    assists: t.assists,
    penalties: t.penalties,
    matches: 0,
    minutes: 0,
  });

  const all = [...tallies.values()];
  return {
    scorers: all
      .filter((t) => t.goals > 0)
      .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.lastAt - a.lastAt)
      .map(toRow),
    assists: all
      .filter((t) => t.assists > 0)
      .sort((a, b) => b.assists - a.assists || b.goals - a.goals || b.lastAt - a.lastAt)
      .map(toRow),
  };
}
