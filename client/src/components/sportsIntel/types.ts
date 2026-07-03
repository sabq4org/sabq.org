/**
 * أنواع مشتركة لمكوّنات واجهة محرّك الذكاء الرياضي (تستهلك /api/sports/intel/*).
 */
export interface IntelInsight {
  id: string;
  scope: "global" | "competition" | "match" | "user";
  kind: string;
  importance: number;
  competitionSlug: string | null;
  headline: string;
  body: string;
  entities: { fixtureId?: number; home?: string; away?: string; phase?: string } | null;
  createdAt: string;
}

export interface SceneResponse {
  configured: boolean;
  summary: IntelInsight | null;
  cards: IntelInsight[];
}

export interface TrendsResponse {
  configured: boolean;
  cards: IntelInsight[];
}

export interface SmartMatchCard {
  fixtureId: number;
  phase: "pre" | "live" | "post";
  headline: string;
  body: string;
  bullets: string[];
  generatedAt: number;
}

export interface ExplainedPrediction {
  fixtureId: number;
  headline: string;
  body: string;
  probabilities: { home: number; draw: number; away: number } | null;
  generatedAt: number;
}

export interface MatchIntelResponse {
  configured: boolean;
  card: SmartMatchCard | null;
  prediction: ExplainedPrediction | null;
}

export interface DigestResponse {
  configured: boolean;
  digest: { headline: string; body: string; generatedAt: number } | null;
}

export interface CopilotResponse {
  configured: boolean;
  answer: string | null;
  usedCompetitions?: string[];
  generatedAt?: number;
}
