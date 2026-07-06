import type {
  SnapFixtureFact,
  SnapRecentResultFact,
  TeamSnapFacts,
} from "./factsBuilder";
import {
  SNAP_BODY_MAX_CHARS,
  SNAP_HEADLINE_MAX_CHARS,
  type SportsSnapAccent,
  type SportsSnapKind,
} from "./config";

export interface SnapEntityRefs {
  fixtureId?: number;
  teamId?: number;
  opponentId?: number;
  competitionSlug?: string | null;
  kickoff?: string | null;
}

export interface TemplateSnap {
  kind: SportsSnapKind;
  headline: string;
  body: string;
  accent: SportsSnapAccent;
  importance: number;
  entities: SnapEntityRefs;
  ttlAt: Date | null;
  dedupeKey: string;
}

function kickoffTtl(fx: SnapFixtureFact): Date {
  return new Date(fx.kickoffTs * 1000);
}

function compact(value: string, max: number): string {
  const chars = Array.from(value.trim().replace(/\s+/g, " "));
  if (chars.length <= max) return chars.join("");
  return chars.slice(0, Math.max(0, max - 1)).join("").trimEnd();
}

function headline(value: string): string {
  return compact(value, SNAP_HEADLINE_MAX_CHARS);
}

function body(value: string): string {
  return compact(value, SNAP_BODY_MAX_CHARS);
}

function postMatchTtl(result: SnapRecentResultFact): Date {
  return new Date((result.kickoffTs + 48 * 60 * 60) * 1000);
}

function scoreText(result: SnapRecentResultFact): string {
  return `${result.goals.home}-${result.goals.away}`;
}

function nextMatchSuffix(next: SnapFixtureFact | null, latestFixtureId: number): string {
  if (!next || next.fixtureId === latestFixtureId) return "";
  return ` المباراة القادمة ${next.relativeDay} أمام ${next.opponent.name}.`;
}

function upcomingTemplate(facts: TeamSnapFacts): TemplateSnap | null {
  const fx = facts.nextMatch;
  if (!fx) return null;
  return {
    kind: "upcoming_match",
    headline: headline("موعد قريب"),
    body: body(`${fx.relativeDay} ${fx.kickoffLocalTime}: ${facts.teamName} يواجه ${fx.opponent.name} في ${fx.competition}`),
    accent: "green",
    importance: 90,
    entities: {
      fixtureId: fx.fixtureId,
      teamId: facts.teamId,
      opponentId: fx.opponent.id,
      competitionSlug: fx.competitionSlug,
      kickoff: fx.kickoff,
    },
    ttlAt: kickoffTtl(fx),
    dedupeKey: `snap:upcoming_match:${facts.teamId}:${fx.fixtureId}`,
  };
}

function behavioralBigMatchTemplate(facts: TeamSnapFacts): TemplateSnap | null {
  const fx = facts.bigMatch;
  if (!fx) return null;
  const standings =
    fx.targetStanding && fx.opponentStanding
      ? ` الفريقان في المركزين ${fx.targetStanding.rank} و${fx.opponentStanding.rank}.`
      : "";
  return {
    kind: "behavioral_big_match",
    headline: headline("مواجهة لافتة"),
    body: body(`${fx.relativeDay} ${fx.kickoffLocalTime}: ${facts.teamName} أمام ${fx.opponent.name} في ${fx.competition}.${standings}`),
    accent: "gold",
    importance: Math.max(82, fx.importance),
    entities: {
      fixtureId: fx.fixtureId,
      teamId: facts.teamId,
      opponentId: fx.opponent.id,
      competitionSlug: fx.competitionSlug,
      kickoff: fx.kickoff,
    },
    ttlAt: kickoffTtl(fx),
    dedupeKey: `snap:behavioral_big_match:${facts.teamId}:${fx.fixtureId}`,
  };
}

function postMatchTemplate(facts: TeamSnapFacts): TemplateSnap | null {
  const result = facts.latestResult;
  if (!result) return null;
  return {
    kind: "post_match_recap",
    headline: headline("آخر نتيجة"),
    body: body(`انتهت مباراة ${facts.teamName}: ${scoreText(result)} مع ${result.opponent.name}.${nextMatchSuffix(facts.nextMatch, result.fixtureId)}`),
    accent: result.outcome === "loss" ? "crimson" : "green",
    importance: 72,
    entities: {
      fixtureId: result.fixtureId,
      teamId: facts.teamId,
      opponentId: result.opponent.id,
      competitionSlug: result.competitionSlug,
    },
    ttlAt: postMatchTtl(result),
    dedupeKey: `snap:post_match_recap:${facts.teamId}:${result.fixtureId}`,
  };
}

export function deterministicSnaps(facts: TeamSnapFacts): TemplateSnap[] {
  return [
    upcomingTemplate(facts),
    behavioralBigMatchTemplate(facts),
    postMatchTemplate(facts),
  ].filter((snap): snap is TemplateSnap => Boolean(snap));
}

export function personalizeForFavorite(body: string): string {
  return body.startsWith("فريقك") ? body : `فريقك: ${body}`;
}

export function personalizeForViewedMatch(body: string, matchLabel?: string | null): string {
  const prefix = matchLabel ? `بما أنك تابعت ${matchLabel}:` : "بما أنك تابعت مباراة سابقة:";
  return `${prefix} ${body}`;
}
