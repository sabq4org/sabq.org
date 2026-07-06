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

function targetScoreText(result: SnapRecentResultFact): string {
  return result.targetSide === "home"
    ? `${result.goals.home}-${result.goals.away}`
    : `${result.goals.away}-${result.goals.home}`;
}

function outcomeText(result: SnapRecentResultFact, teamName: string): string {
  const score = targetScoreText(result);
  if (result.outcome === "win") return `آخر نتيجة: فوز ${teamName} ${score} على ${result.opponent.name}.`;
  if (result.outcome === "loss") return `آخر نتيجة: خسارة ${teamName} ${score} أمام ${result.opponent.name}.`;
  return `آخر نتيجة: تعادل ${teamName} ${score} مع ${result.opponent.name}.`;
}

function standingsAngle(fx: SnapFixtureFact, teamName: string): string | null {
  if (!fx.targetStanding || !fx.opponentStanding) return null;
  if (fx.pointsGap != null && fx.pointsGap <= 6) {
    return `الفارق بينهما ${fx.pointsGap} نقاط في الجدول.`;
  }
  return `${teamName} في المركز ${fx.targetStanding.rank} بـ${fx.targetStanding.points} نقطة، و${fx.opponent.name} في المركز ${fx.opponentStanding.rank} بـ${fx.opponentStanding.points}.`;
}

function matchAngle(fx: SnapFixtureFact, facts: TeamSnapFacts): string {
  const standing = standingsAngle(fx, facts.teamName);
  if (standing) return standing;
  if (facts.latestResult) return outcomeText(facts.latestResult, facts.teamName);
  if (fx.round) return `المباراة ضمن ${fx.round}.`;
  return "افتح مركز المباراة لمتابعة التفاصيل.";
}

function nextMatchSuffix(next: SnapFixtureFact | null, latestFixtureId: number): string {
  if (!next || next.fixtureId === latestFixtureId) return "";
  return ` التالية ${next.relativeDay} أمام ${next.opponent.name}.`;
}

function upcomingTemplate(facts: TeamSnapFacts): TemplateSnap | null {
  const fx = facts.nextMatch;
  if (!fx) return null;
  return {
    kind: "upcoming_match",
    headline: headline(`${facts.teamName} × ${fx.opponent.name}`),
    body: body(`${fx.relativeDay} ${fx.kickoffLocalTime}: ${facts.teamName} أمام ${fx.opponent.name}. ${matchAngle(fx, facts)}`),
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
    standingsAngle(fx, facts.teamName) ?? matchAngle(fx, facts);
  return {
    kind: "behavioral_big_match",
    headline: headline("مواجهة لافتة"),
    body: body(`${fx.relativeDay} ${fx.kickoffLocalTime}: ${facts.teamName} أمام ${fx.opponent.name}. ${standings}`),
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
    body: body(`${outcomeText(result, facts.teamName)}${nextMatchSuffix(facts.nextMatch, result.fixtureId)}`),
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
