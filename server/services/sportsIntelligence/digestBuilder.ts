/**
 * الموجز الرياضي المخصّص — يقرأ متابعات المستخدم (sportsFollows)، يجمع ما فاته
 * (آخر نتائج فِرقه) وسياق بطولاته (المتصدّر/الهدّاف)، ثم يطلب من الـAI موجزاً
 * شخصياً مؤرَّضاً. مخزَّن عبر SWR ومحفوظ كلقطة user.
 */
import { withSWR } from "../../memoryCache";
import {
  getCompetition,
  getStandings,
  getTeamRecentResults,
  getTopScorers,
} from "../saudiLeagueService";
import { listFollows } from "../sportsFollowsService";
import { digestPrompt } from "./prompts";
import { generateJson, isAiAvailable } from "./aiClient";
import { queryInsights, saveInsights } from "./insightsStore";

const DIGEST_TTL_MS = 30 * 60 * 1000;

export interface SportsDigest {
  headline: string;
  body: string;
  generatedAt: number;
}

async function buildFacts(userId: string): Promise<string | null> {
  const follows = await listFollows(userId).catch(() => []);
  if (follows.length === 0) return null;

  const lines: string[] = [];
  const teams = follows.filter((f) => f.kind === "team").slice(0, 6);
  const comps = follows.filter((f) => f.kind === "competition").slice(0, 4);

  for (const t of teams) {
    const teamId = Number(t.refId);
    if (!Number.isFinite(teamId)) continue;
    const recent = await getTeamRecentResults(teamId, 3).catch(() => []);
    if (recent.length === 0) {
      lines.push(`الفريق ${t.refName}: لا نتائج حديثة متاحة.`);
      continue;
    }
    const results = recent
      .map((m) => `${m.home.name} ${m.goals.home ?? 0}-${m.goals.away ?? 0} ${m.away.name}`)
      .join("؛ ");
    lines.push(`الفريق ${t.refName} — آخر النتائج: ${results}.`);
  }

  for (const c of comps) {
    const comp = getCompetition(c.refId);
    if (!comp) continue;
    const [standings, scorers] = await Promise.all([
      comp.hasStandings ? getStandings(comp).catch(() => []) : Promise.resolve([]),
      comp.hasScorers ? getTopScorers(comp).catch(() => []) : Promise.resolve([]),
    ]);
    const parts: string[] = [];
    if (standings.length >= 1) parts.push(`المتصدّر ${standings[0].team.name} (${standings[0].points} نقطة)`);
    if (scorers.length >= 1) parts.push(`الهدّاف ${scorers[0].name} (${scorers[0].goals})`);
    lines.push(`البطولة ${c.refName}${parts.length ? ` — ${parts.join("، ")}` : ""}.`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

/** يبني الموجز المخصّص (يولّد ويخزّن). يُرجِع null إن لا متابعات أو تعذّر التوليد. */
export async function buildDigest(userId: string): Promise<SportsDigest | null> {
  return withSWR(`intel:digest:${userId}`, DIGEST_TTL_MS, DIGEST_TTL_MS * 2, async () => {
    if (!isAiAvailable()) return null;
    const facts = await buildFacts(userId);
    if (!facts) return null;

    const parsed = await generateJson<{ headline?: string; body?: string }>(digestPrompt(facts), {
      feature: "sports-intel-digest",
      tier: "strong",
      maxTokens: 600,
    });
    if (!parsed || !parsed.headline || !parsed.body) return null;

    const digest: SportsDigest = {
      headline: String(parsed.headline).trim(),
      body: String(parsed.body).trim(),
      generatedAt: Date.now(),
    };

    saveInsights([
      {
        scope: "user",
        refId: userId,
        kind: "digest",
        importance: 80,
        headline: digest.headline,
        body: digest.body,
        sourceStats: { facts },
        dedupeKey: `digest:${userId}`,
        ttlMs: DIGEST_TTL_MS * 2,
      },
    ]).catch((e) => console.error("[SportsIntel] saveInsights(digest) failed:", e));

    return digest;
  });
}

/** الموجز المخزَّن (بلا توليد) — للاستخدام السريع/الشبكة. */
export async function getStoredDigest(userId: string) {
  const rows = await queryInsights({ scope: "user", refId: userId, kinds: ["digest"], limit: 1 });
  return rows[0] ?? null;
}
