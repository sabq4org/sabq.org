/**
 * كاشف الأنماط/الشذوذ (قصص الموسم) + التوقّعات المفسّرة. الإشارات تُحسَب حتمياً
 * من الترتيب والهدّافين (لا AI)، ثم يحوّلها الـAI إلى «قصص» مقروءة مؤرَّضة على
 * الأرقام. التوقّع المفسّر يحوّل ترجيح المزوّد + السياق إلى تعليل بشري.
 */
import { withSWR } from "../../memoryCache";
import {
  getCompetition,
  getFixturePrediction,
  getHeadToHead,
  getMatchDetail,
  getStandings,
  getTopScorers,
  type SplScorer,
  type SplStandingRow,
} from "../saudiLeagueService";
import type { InsightKind } from "./config";
import { predictionPrompt, trendsPrompt } from "./prompts";
import { generateJson, isAiAvailable } from "./aiClient";
import { queryInsights, replaceInsights, type UpsertInsight } from "./insightsStore";
import type { SportsInsight } from "@shared/schema";

const TRENDS_TTL_MS = 6 * 60 * 60 * 1000; // قصص الموسم تتغيّر ببطء (بعد كل جولة)
const TREND_KINDS: InsightKind[] = ["trend", "anomaly"];

/** أطول سلسلة حاليّة (من ذيل سلسلة form مثل "WWLDW") لرمز محدّد. */
function currentStreak(form: string | null, ch: "W" | "L" | "D"): number {
  if (!form) return 0;
  let n = 0;
  for (let i = form.length - 1; i >= 0; i--) {
    if (form[i] === ch) n++;
    else break;
  }
  return n;
}

/** يبني إشارات رقمية ذات دلالة من الترتيب والهدّافين. */
function buildSignals(standings: SplStandingRow[], scorers: SplScorer[]): string[] {
  const sig: string[] = [];

  if (standings.length >= 2) {
    const [first, second] = standings;
    const gap = first.points - second.points;
    sig.push(
      `المتصدّر ${first.team.name} بـ${first.points} نقطة، والوصيف ${second.team.name} بـ${second.points} (الفارق ${gap}).`,
    );
    if (gap <= 2) sig.push(`صراع صدارة محتدم: الفارق ${gap} نقطة فقط.`);
    if (gap >= 10) sig.push(`المتصدّر ${first.team.name} يهرب بفارق ${gap} نقطة.`);

    const bestAttack = [...standings].sort((a, b) => b.goalsFor - a.goalsFor)[0];
    const bestDefense = [...standings].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];
    sig.push(`أعلى هجوم: ${bestAttack.team.name} (${bestAttack.goalsFor} هدفاً).`);
    sig.push(`أقوى دفاع: ${bestDefense.team.name} (${bestDefense.goalsAgainst} هدفاً عليه).`);

    for (const row of standings) {
      const w = currentStreak(row.form, "W");
      const l = currentStreak(row.form, "L");
      if (w >= 4) sig.push(`${row.team.name} في سلسلة ${w} انتصارات متتالية (المركز ${row.rank}).`);
      if (l >= 4) sig.push(`${row.team.name} في سلسلة ${l} خسائر متتالية (المركز ${row.rank}).`);
    }

    const bottom = standings[standings.length - 1];
    const safe = standings[Math.max(0, standings.length - 4)];
    if (bottom && safe && bottom !== safe) {
      sig.push(`قاع الترتيب: ${bottom.team.name} (${bottom.points} نقطة) يصارع الهبوط.`);
    }
  }

  if (scorers.length >= 1) {
    const top = scorers[0];
    sig.push(`الهدّاف: ${top.name} (${top.team.name}) برصيد ${top.goals} هدفاً في ${top.matches} مباراة.`);
    if (scorers.length >= 2) {
      const gap = top.goals - scorers[1].goals;
      if (gap >= 4) sig.push(`${top.name} يتفوّق على أقرب منافسيه بفارق ${gap} أهداف.`);
    }
  }

  return sig;
}

let inFlight = new Map<string, Promise<number>>();

/** يولّد قصص موسم لبطولة ويخزّنها (يستبدل القديمة). يُرجِع عدد البطاقات. */
export async function refreshCompetitionTrends(slug: string): Promise<number> {
  const existing = inFlight.get(slug);
  if (existing) return existing;

  const run = (async () => {
    const comp = getCompetition(slug);
    if (!comp || !isAiAvailable()) return 0;

    const [standings, scorers] = await Promise.all([
      comp.hasStandings ? getStandings(comp).catch(() => []) : Promise.resolve([]),
      comp.hasScorers ? getTopScorers(comp).catch(() => []) : Promise.resolve([]),
    ]);
    const signals = buildSignals(standings, scorers);
    if (signals.length === 0) {
      await replaceInsights("competition", slug, TREND_KINDS, []);
      return 0;
    }

    const parsed = await generateJson<{
      cards?: { kind?: string; importance?: number; headline?: string; body?: string }[];
    }>(trendsPrompt(signals.map((s) => `- ${s}`).join("\n")), {
      feature: "sports-intel-trends",
      tier: "cheap",
      maxTokens: 1200,
    });
    if (!parsed) return 0;

    const records: UpsertInsight[] = [];
    let idx = 0;
    for (const card of parsed.cards ?? []) {
      if (!card.headline || !card.body) continue;
      const kind: InsightKind = card.kind === "anomaly" ? "anomaly" : "trend";
      records.push({
        scope: "competition",
        refId: slug,
        competitionSlug: slug,
        kind,
        importance: typeof card.importance === "number" ? Math.max(0, Math.min(100, card.importance)) : 60,
        headline: String(card.headline).trim(),
        body: String(card.body).trim(),
        sourceStats: { signals },
        dedupeKey: `trend:${slug}:${idx++}`,
        ttlMs: TRENDS_TTL_MS,
      });
    }
    await replaceInsights("competition", slug, TREND_KINDS, records);
    return records.length;
  })().finally(() => {
    inFlight.delete(slug);
  });

  inFlight.set(slug, run);
  return run;
}

/** قصص الموسم الجاهزة لبطولة — تقرأ المخزَّن، وتولّد عند أول طلب إن كان فارغاً. */
export async function getCompetitionTrends(slug: string): Promise<SportsInsight[]> {
  let rows = await queryInsights({ scope: "competition", refId: slug, kinds: TREND_KINDS, limit: 12 });
  if (rows.length === 0 && isAiAvailable()) {
    await refreshCompetitionTrends(slug).catch(() => 0);
    rows = await queryInsights({ scope: "competition", refId: slug, kinds: TREND_KINDS, limit: 12 });
  }
  return rows;
}

export interface ExplainedPrediction {
  fixtureId: number;
  headline: string;
  body: string;
  probabilities: { home: number; draw: number; away: number } | null;
  generatedAt: number;
}

/** توقّع مفسَّر لمباراة: يحوّل ترجيح المزوّد + المواجهات إلى تعليل بشري. مخزَّن. */
export async function getExplainedPrediction(fixtureId: number): Promise<ExplainedPrediction | null> {
  return withSWR(`intel:prediction:${fixtureId}`, 30 * 60 * 1000, 60 * 60 * 1000, async () => {
    if (!isAiAvailable()) return null;
    const detail = await getMatchDetail(fixtureId);
    if (!detail) return null;
    const fx = detail.fixture;
    if (fx.status.finished) return null; // لا تفسير لتوقّع مباراة انتهت

    const [prediction, h2h] = await Promise.all([
      getFixturePrediction(fixtureId).catch(() => null),
      getHeadToHead(fx.home.id, fx.away.id).catch(() => null),
    ]);
    if (!prediction) return null;

    const lines: string[] = [];
    lines.push(`المباراة: ${fx.home.name} ضد ${fx.away.name}`);
    lines.push(
      `الترجيحات: فوز ${fx.home.name} ${prediction.homePct}%، تعادل ${prediction.drawPct}%، فوز ${fx.away.name} ${prediction.awayPct}%`,
    );
    if (prediction.advice) lines.push(`توصية المزوّد: ${prediction.advice}`);
    if (h2h?.summary && h2h.summary.total > 0) {
      lines.push(
        `المواجهات السابقة (${h2h.summary.total}): فوز ${fx.home.name} ${h2h.summary.homeWins}، تعادل ${h2h.summary.draws}، فوز ${fx.away.name} ${h2h.summary.awayWins}`,
      );
    }

    const parsed = await generateJson<{ headline?: string; body?: string }>(
      predictionPrompt(lines.join("\n")),
      { feature: "sports-intel-prediction", tier: "cheap", maxTokens: 500 },
    );
    if (!parsed || !parsed.headline || !parsed.body) return null;

    return {
      fixtureId,
      headline: String(parsed.headline).trim(),
      body: String(parsed.body).trim(),
      probabilities: { home: prediction.homePct, draw: prediction.drawPct, away: prediction.awayPct },
      generatedAt: Date.now(),
    };
  });
}
