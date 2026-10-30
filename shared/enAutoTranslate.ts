/**
 * الترجمة الآلية للنسخة الإنجليزية: منطق صافٍ (بلا قاعدة بيانات ولا ذكاء اصطناعي)
 * لاختيار الأخبار المهمة غير المحلية البحتة. الخدمة في
 * server/services/enAutoTranslateService.ts تستدعي هذه الدوال.
 */
import { z } from "zod";

export const EN_AUTO_TRANSLATE_SETTINGS_KEY = "en_auto_translate_settings";

export const enAutoTranslateSettingsSchema = z.object({
  enabled: z.boolean(),
  /** publish = مثل زر الترجمة اليدوي؛ draft = تنتظر محررًا في لوحة النسخة الإنجليزية. */
  mode: z.enum(["publish", "draft"]),
  maxPerRun: z.number().int().min(1).max(10),
  minScore: z.number().int().min(1).max(10),
}).strict();
export type EnAutoTranslateSettings = z.infer<typeof enAutoTranslateSettingsSchema>;

export const DEFAULT_EN_AUTO_TRANSLATE_SETTINGS: EnAutoTranslateSettings = {
  enabled: true,
  mode: "publish",
  maxPerRun: 3,
  minScore: 7,
};

/** نافذة الفحص: آخر 3 ساعات (دورة كل ساعتين + هامش لدورة فائتة)، بعد مهلة 10 دقائق لتصحيح المحرر. */
export const EN_AUTO_LOOKBACK_MS = 3 * 60 * 60_000;
export const EN_AUTO_SETTLE_MS = 10 * 60_000;
export const EN_AUTO_MAX_CANDIDATES = 40;

export interface EnAutoCandidate {
  id: string;
  title: string;
  excerpt: string | null;
  categoryNameAr: string | null;
  newsType: string;
}

export interface EnAutoScore {
  id: string;
  score: number;
  reason: string;
}

export const EN_AUTO_SELECTION_SYSTEM = `You are the English-edition desk editor of Sabq (سبق), a leading Saudi news site.
Every two hours you pick which newly published Arabic stories deserve an English translation for an international audience.

The English edition carries (learned from its last 100 stories):
- Arab Coalition statements: interceptions of Houthi missiles/drones, strikes in Yemen, warnings.
- Official Saudi decisions and statements: Cabinet sessions, Royal Court, royal orders, the Crown Prince's calls, visits and meetings, ministers on official foreign duties, ministries' national-level decisions (travel bans, visas, health precautions, regulations with national reach).
- Civil Aviation / Civil Defense / Ministry of Interior / Ministry of Energy statements about attacks, casualties or national-level incidents.
- Major regional and international news with a clear Saudi or Gulf angle (Yemen war, Iran, US–Saudi relations, Gulf diplomacy, oil and OPEC+).
- Major national economy news (capital market reforms, national-level economic figures, big state projects).

It does NOT carry:
- Purely local or provincial items: rain, weather alerts, early-warning sirens and "danger has passed" notices, a municipality or governorate event, local hospitals, universities, festivals, camel or falcon auctions, mosque sermons.
- Routine security seizures (drugs, smuggling, border guards, environmental violations).
- Domestic sports results, celebrity and entertainment, general world news without a Saudi or Gulf angle.
- Advertorials, company PR, product launches.

Score each story 1–10 for how strongly it belongs in the English edition (10 = must translate now; 7 = clearly fits; 4 or less = local or minor).
If a story repeats an event already covered in the "Already in English" list, or another story in this batch covers the same event better, score it 3 or less.
Respond with JSON only: {"items":[{"id":"…","score":8,"reason":"short English reason"}]} — one entry per story, ids copied exactly.`;

function oneLine(text: string | null | undefined, max: number): string {
  const clean = (text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function buildEnAutoSelectionPrompt(
  candidates: EnAutoCandidate[],
  recentEnTitles: string[],
): string {
  const already = recentEnTitles.length
    ? recentEnTitles.map((t) => `- ${oneLine(t, 160)}`).join("\n")
    : "- (none)";
  const stories = candidates
    .map((c) => {
      const parts = [`id: ${c.id}`, `title: ${oneLine(c.title, 220)}`];
      if (c.categoryNameAr) parts.push(`section: ${c.categoryNameAr}`);
      if (c.newsType === "breaking") parts.push("flag: breaking");
      const excerpt = oneLine(c.excerpt, 280);
      if (excerpt) parts.push(`excerpt: ${excerpt}`);
      return parts.join("\n");
    })
    .join("\n\n");
  return `Already in English (last 48 hours):\n${already}\n\nNew Arabic stories:\n\n${stories}`;
}

/** يقرأ ردّ النموذج بتسامح (أسوار ```json أو نص حول الكائن) ويُسقط المعرّفات المجهولة. */
export function parseEnAutoScores(raw: string, candidateIds: Iterable<string>): EnAutoScore[] {
  const known = new Set(candidateIds);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: EnAutoScore[] = [];
  for (const item of items) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const score = Number(item?.score);
    if (!known.has(id) || seen.has(id) || !Number.isFinite(score)) continue;
    seen.add(id);
    out.push({
      id,
      score: Math.max(0, Math.min(10, Math.round(score))),
      reason: typeof item?.reason === "string" ? item.reason.slice(0, 200) : "",
    });
  }
  return out;
}

/** الأعلى درجة أولًا (ثم ترتيب المرشحين: الأحدث)، فوق الحد الأدنى، بسقف الدورة. */
export function pickEnAutoWinners(
  scores: EnAutoScore[],
  candidateOrder: string[],
  settings: Pick<EnAutoTranslateSettings, "maxPerRun" | "minScore">,
): EnAutoScore[] {
  const rank = new Map(candidateOrder.map((id, i) => [id, i]));
  return scores
    .filter((s) => s.score >= settings.minScore && rank.has(s.id))
    .sort((a, b) => b.score - a.score || (rank.get(a.id)! - rank.get(b.id)!))
    .slice(0, settings.maxPerRun);
}
