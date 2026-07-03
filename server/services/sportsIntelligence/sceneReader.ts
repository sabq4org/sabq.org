/**
 * قارئ المشهد — يقرأ مباريات اليوم/البثّ الحيّ عبر كل بطولاتنا مجتمعةً، يرتّبها
 * بالأهمية (حتمياً)، ويطلب من الـAI «التقاطات» موجزة للأبرز منها، ثم يخزّنها
 * كلقطات global. الواجهة تقرأ المخزَّن (لا انتظار LLM). التوليد في الخلفية
 * (cron) أو عند أول طلب إن كان المخزَّن فارغاً.
 */
import {
  getCompetition,
  getGlobalTodayFixtures,
  getWorldLiveFixtures,
  type SplLiveBoardItem,
} from "../saudiLeagueService";
import { matchImportance, SCENE_MAX_CARDS, type InsightKind } from "./config";
import { sceneCardsPrompt } from "./prompts";
import { generateJson, isAiAvailable } from "./aiClient";
import { queryInsights, replaceInsights, type UpsertInsight } from "./insightsStore";
import type { SportsInsight } from "@shared/schema";

const SCENE_REF = "global";
const SCENE_KINDS: InsightKind[] = ["scene", "scene_summary"];
const SCENE_TTL_MS = 20 * 60 * 1000; // اللقطة صالحة ٢٠ دقيقة (تُجدَّد بالـcron)

interface SceneCandidate {
  item: SplLiveBoardItem;
  importance: number;
  category: string | null;
}

/** يجمع مرشّحي المشهد (اليوم + الحيّ عالمياً) بلا تكرار، مرتّبين بالأهمية. */
async function collectCandidates(): Promise<SceneCandidate[]> {
  const [today, worldLive] = await Promise.all([
    getGlobalTodayFixtures().catch(() => [] as SplLiveBoardItem[]),
    getWorldLiveFixtures().catch(() => [] as SplLiveBoardItem[]),
  ]);

  const byId = new Map<number, SplLiveBoardItem>();
  for (const it of [...worldLive, ...today]) {
    if (!byId.has(it.id)) byId.set(it.id, it);
  }

  const candidates: SceneCandidate[] = [];
  for (const item of byId.values()) {
    const comp = item.competitionSlug ? getCompetition(item.competitionSlug) : undefined;
    const category = comp?.category ?? null;
    const importance = matchImportance({
      category,
      competitionSlug: item.competitionSlug,
      status: item.status,
      goals: item.goals,
    });
    candidates.push({ item, importance, category });
  }

  return candidates.sort((a, b) => {
    if (a.item.status.live !== b.item.status.live) return a.item.status.live ? -1 : 1;
    return b.importance - a.importance;
  });
}

function factLine(c: SceneCandidate): string {
  const f = c.item;
  const score = `${f.home.name} ${f.goals.home ?? 0} - ${f.goals.away ?? 0} ${f.away.name}`;
  const state = f.status.live
    ? `جارية — الدقيقة ${f.status.elapsed ?? "?"}`
    : f.status.finished
      ? "انتهت"
      : "لم تبدأ";
  return `- fixtureId=${f.id} | ${f.competition} | ${score} | ${state} | أهمية=${c.importance}`;
}

let inFlight: Promise<number> | null = null;

/**
 * يولّد لقطات المشهد ويخزّنها (يستبدل القديمة). يُرجِع عدد البطاقات المخزَّنة.
 * محميّ من التزاحم بقفل inFlight — نداءات متزامنة تشترك في نفس الدورة.
 */
export async function refreshScene(): Promise<number> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    if (!isAiAvailable()) return 0;
    const candidates = await collectCandidates();
    const notable = candidates
      .filter((c) => c.item.status.live || c.item.status.finished)
      .slice(0, SCENE_MAX_CARDS);
    if (notable.length === 0) {
      await replaceInsights("global", SCENE_REF, SCENE_KINDS, []);
      return 0;
    }

    const factsBlock = notable.map(factLine).join("\n");
    const parsed = await generateJson<{
      cards?: { fixtureId?: number; headline?: string; body?: string }[];
      summary?: string;
    }>(sceneCardsPrompt(factsBlock), { feature: "sports-intel-scene", tier: "cheap", maxTokens: 1100 });

    if (!parsed) return 0;

    const impById = new Map(notable.map((c) => [c.item.id, c]));
    const records: UpsertInsight[] = [];

    for (const card of parsed.cards ?? []) {
      const cand = card.fixtureId != null ? impById.get(Number(card.fixtureId)) : undefined;
      if (!card.headline || !card.body) continue;
      records.push({
        scope: "global",
        refId: SCENE_REF,
        competitionSlug: cand?.item.competitionSlug ?? null,
        kind: "scene",
        importance: cand?.importance ?? 55,
        headline: String(card.headline).trim(),
        body: String(card.body).trim(),
        entities: cand
          ? { fixtureId: cand.item.id, home: cand.item.home.name, away: cand.item.away.name }
          : null,
        sourceStats: cand
          ? {
              competition: cand.item.competition,
              goals: cand.item.goals,
              status: cand.item.status,
            }
          : null,
        dedupeKey: cand ? `scene:${cand.item.id}` : undefined,
        ttlMs: SCENE_TTL_MS,
      });
    }

    if (parsed.summary && String(parsed.summary).trim()) {
      records.push({
        scope: "global",
        refId: SCENE_REF,
        kind: "scene_summary",
        importance: 100, // يُعرَض أولاً كترويسة للمشهد
        headline: "المشهد الآن",
        body: String(parsed.summary).trim(),
        dedupeKey: "scene:summary",
        ttlMs: SCENE_TTL_MS,
      });
    }

    await replaceInsights("global", SCENE_REF, SCENE_KINDS, records);
    return records.length;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * لقطات المشهد الجاهزة للواجهة. تقرأ المخزَّن؛ وإن كان فارغاً (وبيئة التوليد
 * مفعّلة) تطلق دورة توليد واحدة ثم تعيد القراءة — كي لا تكون الصفحة فارغة أول مرة.
 */
export async function getScene(): Promise<SportsInsight[]> {
  let rows = await queryInsights({ scope: "global", refId: SCENE_REF, limit: SCENE_MAX_CARDS + 1 });
  if (rows.length === 0 && isAiAvailable()) {
    await refreshScene().catch(() => 0);
    rows = await queryInsights({ scope: "global", refId: SCENE_REF, limit: SCENE_MAX_CARDS + 1 });
  }
  return rows;
}
