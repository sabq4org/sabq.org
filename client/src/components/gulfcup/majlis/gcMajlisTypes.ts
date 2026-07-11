export interface GcMajlisSummary {
  id: string;
  name: string;
  code: string;
  isOwner: boolean;
  membersCount: number;
  createdAt?: string;
}

export interface GcMajlisInvitePreview {
  id?: string;
  majlisId?: string;
  name: string;
  code: string;
  membersCount: number;
  maxMembers?: number;
  full?: boolean;
  joinUrl?: string;
  isMember?: boolean;
}

export interface GcMajlisMemberPrediction {
  userId: string;
  name: string;
  avatar: string | null;
  isOwner?: boolean;
  hasPredicted: boolean;
  predHome?: number | null;
  predAway?: number | null;
  status?: string | null;
  tier?: string | null;
  pointsAwarded?: number;
  provisional?: boolean;
}

export interface GcMajlisMatchdayMatch {
  fixtureId: string;
  kickoffAt: string;
  status: string;
  locked: boolean;
  live: boolean;
  settled: boolean;
  voided: boolean;
  homeTeam: { name: string; logo?: string | null };
  awayTeam: { name: string; logo?: string | null };
  finalHome?: number | null;
  finalAway?: number | null;
  members: GcMajlisMemberPrediction[];
}

export interface GcMajlisChampion {
  userId: string;
  name: string;
  avatar?: string | null;
  points: number;
}

export interface GcMajlisMatchdayResponse {
  majlis?: GcMajlisSummary;
  dayKey?: string;
  matches: GcMajlisMatchdayMatch[];
  champions: GcMajlisChampion[];
}

export interface GcMajlisLeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  isOwner: boolean;
  totalPoints: number;
  correctCount: number;
  exactCount: number;
  playedCount: number;
}

export interface GcMajlisFantasyRow {
  rank: number;
  userId: string;
  name: string;
  avatar?: string | null;
  totalPoints: number;
  captainName?: string | null;
  hasSquad?: boolean;
}

export interface GcMajlisChampionPickRow {
  userId: string;
  name: string;
  avatar?: string | null;
  teamId?: number | null;
  teamName?: string | null;
  teamLogo?: string | null;
  hasPicked?: boolean;
}

export interface GcMajlisDuel {
  id: string;
  status: string;
  stake: number;
  fixtureId?: string;
  challengerId?: string;
  challengedId?: string;
  challengerName: string;
  challengedName: string;
  homeTeamName?: string;
  awayTeamName?: string;
  winnerId?: string | null;
  createdAt?: string;
  challenger?: { userId: string; name: string; avatar?: string | null };
  challenged?: { userId: string; name: string; avatar?: string | null };
}

export interface GcMajlisHarvestAward {
  key: string;
  title: string;
  description?: string;
  userId?: string;
  name: string;
  avatar?: string | null;
  value?: string | number;
}

export interface GcMajlisHarvestResponse {
  ready: boolean;
  title?: string;
  awards: GcMajlisHarvestAward[];
}

export const gcMajlisKeys = {
  mine: ["/api/gulf-cup/majlis/mine"] as const,
  invite: (code: string) => [`/api/gulf-cup/majlis/invite/${code}`] as const,
  leaderboard: (id: string) => [`/api/gulf-cup/majlis/${id}/leaderboard`] as const,
  matchday: (id: string, date?: string) => date
    ? [`/api/gulf-cup/majlis/${id}/matchday`, { date }] as const
    : [`/api/gulf-cup/majlis/${id}/matchday`] as const,
  fantasy: (id: string) => [`/api/gulf-cup/majlis/${id}/fantasy`] as const,
  championPicks: (id: string) => [`/api/gulf-cup/majlis/${id}/champion-picks`] as const,
  duels: (id: string) => [`/api/gulf-cup/majlis/${id}/duels`] as const,
  harvest: (id: string) => [`/api/gulf-cup/majlis/${id}/harvest`] as const,
};

export function unwrapInvite(data: unknown, fallbackCode: string): GcMajlisInvitePreview | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const value = (root.invite ?? root.majlis ?? root) as Record<string, unknown>;
  const name = typeof value.name === "string" ? value.name : "";
  if (!name) return null;
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    majlisId: typeof value.majlisId === "string" ? value.majlisId : undefined,
    name,
    code: typeof value.code === "string" ? value.code : fallbackCode,
    membersCount: Number(value.membersCount ?? 0),
    maxMembers: typeof value.maxMembers === "number" ? value.maxMembers : undefined,
    full: value.full === true,
    joinUrl: typeof value.joinUrl === "string" ? value.joinUrl : undefined,
    isMember: value.isMember === true,
  };
}
