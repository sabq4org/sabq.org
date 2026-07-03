/**
 * بطاقة المباراة الذكية — موحّدة عبر كل البطولات وبأطوارها الثلاثة (قبل/أثناء/
 * بعد). تبني الوقائع من getMatchDetail (نفس مصدر السرد الحالي) وتضيف — للطور
 * «قبل» — سجل المواجهات والترجيحات، ثم تطلب من الـAI عنواناً + جملتين + نقاطاً
 * مؤرَّضة. مخزَّنة عبر SWR (لا انتظار متكرّر) وتُحفظ كلقطة match للتدقيق/الشبكة.
 */
import { withSWR } from "../../memoryCache";
import {
  getFixturePrediction,
  getHeadToHead,
  getMatchDetail,
  SAUDI_COMPETITIONS,
  type SplMatchDetail,
} from "../saudiLeagueService";
import { matchImportance } from "./config";
import { matchLivePrompt, matchPostPrompt, matchPrePrompt } from "./prompts";
import { generateJson, isAiAvailable } from "./aiClient";
import { saveInsights } from "./insightsStore";

export type MatchPhase = "pre" | "live" | "post";

export interface SmartMatchCard {
  fixtureId: number;
  phase: MatchPhase;
  headline: string;
  body: string;
  bullets: string[];
  generatedAt: number;
}

const LIVE_TTL = 90 * 1000;
const PRE_TTL = 30 * 60 * 1000;
const POST_TTL = 24 * 60 * 60 * 1000;

function compByLeagueId(id: number | null) {
  return id != null ? SAUDI_COMPETITIONS.find((c) => c.id === id) : undefined;
}

function baseFacts(detail: SplMatchDetail): string[] {
  const fx = detail.fixture;
  const lines: string[] = [];
  lines.push(`المباراة: ${fx.home.name} (المضيف) ضد ${fx.away.name}`);
  if (fx.round) lines.push(`البطولة/الجولة: ${fx.round}`);
  lines.push(`النتيجة الحالية: ${fx.home.name} ${fx.goals.home ?? 0} - ${fx.goals.away ?? 0} ${fx.away.name}`);
  if (detail.events.length > 0) {
    lines.push("الأحداث:");
    for (const e of detail.events.slice(0, 20)) {
      const min = e.minute != null ? `${e.minute}'${e.extra ? `+${e.extra}` : ""}` : "";
      lines.push(`- ${min} ${e.label} | ${e.player}${e.assist ? ` (صناعة ${e.assist})` : ""} | ${e.team}`);
    }
  }
  if (detail.statistics) {
    const keys = ["Ball Possession", "Total Shots", "Shots on Goal", "Corner Kicks", "expected_goals"];
    const picked = detail.statistics.rows.filter((r) => keys.includes(r.type));
    if (picked.length > 0) {
      lines.push(`إحصاءات (${fx.home.name} / ${fx.away.name}):`);
      for (const r of picked) lines.push(`- ${r.label}: ${r.home ?? "-"} / ${r.away ?? "-"}`);
    }
  }
  return lines;
}

async function preFacts(detail: SplMatchDetail): Promise<string[]> {
  const fx = detail.fixture;
  const lines: string[] = [];
  lines.push(`المباراة المرتقبة: ${fx.home.name} (المضيف) ضد ${fx.away.name}`);
  if (fx.round) lines.push(`البطولة/الجولة: ${fx.round}`);
  const [h2h, prediction] = await Promise.all([
    getHeadToHead(fx.home.id, fx.away.id).catch(() => null),
    getFixturePrediction(fx.id).catch(() => null),
  ]);
  if (h2h?.summary && h2h.summary.total > 0) {
    lines.push(
      `المواجهات السابقة (${h2h.summary.total}): فوز ${fx.home.name} ${h2h.summary.homeWins}، تعادل ${h2h.summary.draws}، فوز ${fx.away.name} ${h2h.summary.awayWins}`,
    );
  }
  if (prediction) {
    lines.push(
      `الترجيحات: فوز ${fx.home.name} ${prediction.homePct}%، تعادل ${prediction.drawPct}%، فوز ${fx.away.name} ${prediction.awayPct}%`,
    );
    if (prediction.advice) lines.push(`توصية المزوّد: ${prediction.advice}`);
  }
  return lines;
}

/**
 * البطاقة الذكية للمباراة. تُرجِع null إن تعذّر جلب المباراة أو التوليد.
 * الطور يُشتقّ من حالة المباراة؛ لكل طور مطالبة ومدة كاش مختلفة.
 */
export async function getMatchInsight(fixtureId: number): Promise<SmartMatchCard | null> {
  const detail = await getMatchDetail(fixtureId);
  if (!detail) return null;
  const fx = detail.fixture;
  const phase: MatchPhase = fx.status.live ? "live" : fx.status.finished ? "post" : "pre";
  const ttl = phase === "live" ? LIVE_TTL : phase === "post" ? POST_TTL : PRE_TTL;

  return withSWR(`intel:matchcard:${fixtureId}:${phase}`, ttl, ttl * 2, async () => {
    if (!isAiAvailable()) return null;

    const lines = phase === "pre" ? await preFacts(detail) : baseFacts(detail);
    const factsBlock = lines.join("\n");
    const prompt =
      phase === "pre"
        ? matchPrePrompt(factsBlock)
        : phase === "live"
          ? matchLivePrompt(factsBlock)
          : matchPostPrompt(factsBlock);

    const parsed = await generateJson<{ headline?: string; body?: string; bullets?: string[] }>(prompt, {
      feature: `sports-intel-match-${phase}`,
      tier: "strong",
      maxTokens: 800,
    });
    if (!parsed || !parsed.headline || !parsed.body) return null;

    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 3)
      : [];

    const card: SmartMatchCard = {
      fixtureId,
      phase,
      headline: String(parsed.headline).trim(),
      body: String(parsed.body).trim(),
      bullets,
      generatedAt: Date.now(),
    };

    const comp = compByLeagueId(detail.leagueId);
    const importance = matchImportance({
      category: comp?.category ?? null,
      competitionSlug: comp?.slug ?? null,
      status: fx.status,
      goals: fx.goals,
    });

    // حفظ كلقطة match للتدقيق وإعادة الاستخدام (الشبكة/الموجز). لا يعطّل الإرجاع.
    saveInsights([
      {
        scope: "match",
        refId: String(fixtureId),
        competitionSlug: comp?.slug ?? null,
        kind: phase === "pre" ? "match_pre" : phase === "live" ? "match_live" : "match_post",
        importance,
        headline: card.headline,
        body: card.body,
        entities: { fixtureId, home: fx.home.name, away: fx.away.name, phase },
        sourceStats: { goals: fx.goals, status: fx.status, bullets },
        dedupeKey: `match:${fixtureId}:${phase}`,
        ttlMs: ttl * 4,
      },
    ]).catch((e) => console.error("[SportsIntel] saveInsights(match) failed:", e));

    return card;
  });
}
