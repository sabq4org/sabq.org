/**
 * المساعد الرياضي المحادثي (RAG) — يجيب من بياناتنا الحيّة لا من معرفة عامة.
 * يستخرج البطولات المذكورة في السؤال، يحقن سياقاً وقائعياً (ترتيب/هدّافون/
 * مباريات اليوم + خلاصة المشهد)، ثم يجيب بتأريض صارم. مخزَّن بمفتاح السؤال
 * لضبط الكلفة (إجابات متكرّرة تُخدَم من الكاش).
 */
import { createHash } from "crypto";
import { withSWR } from "../../memoryCache";
import {
  getGlobalTodayFixtures,
  getStandings,
  getTopScorers,
  SAUDI_COMPETITIONS,
  type SaudiCompetition,
} from "../saudiLeagueService";
import { copilotPrompt } from "./prompts";
import { generateText, isAiAvailable } from "./aiClient";
import { getScene } from "./sceneReader";

const COPILOT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_COMP = "pro-league"; // سياق افتراضي: دوري روشن السعودي

export interface CopilotAnswer {
  answer: string;
  usedCompetitions: string[];
  generatedAt: number;
}

/** يلتقط البطولات المذكورة صراحةً في السؤال (بالاسم أو الـslug). */
function detectCompetitions(question: string): SaudiCompetition[] {
  const q = question.toLowerCase();
  const found = SAUDI_COMPETITIONS.filter((c) => {
    if (q.includes(c.slug)) return true;
    // مطابقة جزئية على الاسم العربي (أول كلمتين تكفيان عادةً: «دوري روشن»).
    const key = c.name.split(" ").slice(0, 2).join(" ");
    return key.length >= 4 && question.includes(key);
  });
  return found.slice(0, 2);
}

async function compContext(comp: SaudiCompetition): Promise<string> {
  const [standings, scorers] = await Promise.all([
    comp.hasStandings ? getStandings(comp).catch(() => []) : Promise.resolve([]),
    comp.hasScorers ? getTopScorers(comp).catch(() => []) : Promise.resolve([]),
  ]);
  const lines: string[] = [`## ${comp.name}`];
  if (standings.length > 0) {
    lines.push("الترتيب (الأوائل):");
    for (const r of standings.slice(0, 6)) {
      lines.push(`- ${r.rank}. ${r.team.name}: ${r.points} نقطة (لعب ${r.played}، فارق ${r.goalsDiff})`);
    }
  }
  if (scorers.length > 0) {
    lines.push("الهدّافون:");
    for (const s of scorers.slice(0, 5)) lines.push(`- ${s.name} (${s.team.name}): ${s.goals}`);
  }
  return lines.join("\n");
}

async function buildContext(question: string): Promise<{ block: string; comps: string[] }> {
  const detected = detectCompetitions(question);
  const comps = detected.length > 0 ? detected : [SAUDI_COMPETITIONS.find((c) => c.slug === DEFAULT_COMP)!];

  const blocks: string[] = [];

  const scene = await getScene().catch(() => []);
  const sceneCards = scene.filter((s) => s.kind === "scene" || s.kind === "scene_summary").slice(0, 5);
  if (sceneCards.length > 0) {
    blocks.push("## المشهد الآن\n" + sceneCards.map((s) => `- ${s.headline}: ${s.body}`).join("\n"));
  }

  const today = await getGlobalTodayFixtures().catch(() => []);
  if (today.length > 0) {
    blocks.push(
      "## مباريات اليوم\n" +
        today
          .slice(0, 12)
          .map((f) => {
            const st = f.status.live
              ? `جارية ${f.status.elapsed ?? ""}'`
              : f.status.finished
                ? "انتهت"
                : "قادمة";
            return `- ${f.competition}: ${f.home.name} ${f.goals.home ?? "-"}-${f.goals.away ?? "-"} ${f.away.name} (${st})`;
          })
          .join("\n"),
    );
  }

  for (const comp of comps) {
    blocks.push(await compContext(comp));
  }

  return { block: blocks.join("\n\n"), comps: comps.map((c) => c.slug) };
}

/** يجيب عن سؤال رياضي من بياناتنا الحيّة فقط. يُرجِع null إن لا مزوّد AI. */
export async function askCopilot(question: string): Promise<CopilotAnswer | null> {
  const clean = question.trim().slice(0, 400);
  if (!clean) return null;
  if (!isAiAvailable()) return null;

  const key = `intel:copilot:${createHash("sha1").update(clean).digest("hex")}`;
  return withSWR(key, COPILOT_TTL_MS, COPILOT_TTL_MS * 2, async () => {
    const { block, comps } = await buildContext(clean);
    const answer = await generateText(copilotPrompt(clean, block), {
      feature: "sports-intel-copilot",
      tier: "strong",
      maxTokens: 500,
    });
    if (!answer) return null;
    return { answer, usedCompetitions: comps, generatedAt: Date.now() };
  });
}
