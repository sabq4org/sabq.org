/**
 * غلاف رقيق فوق aiManager للمحرّك الرياضي: اختيار طبقة النموذج (رخيص للتصنيف/
 * اللقطات القصيرة، قوي للسرد)، وتوليد JSON مُؤرَّض مع تحليل متسامح (يقشّر أسوار
 * الكود ويلتقط أول كتلة JSON). فشل التوليد يُرجِع null — لا يرمي — فالمحرّك يمضي
 * بلا لقطة بدل أن يسقط.
 */
import { aiManager, AI_MODELS, type AIModelConfig } from "../../ai-manager";

export type ModelTier = "cheap" | "strong" | "mini";

function pickModel(tier: ModelTier): AIModelConfig {
  // «mini» = gpt-4o-mini للصياغات القصيرة عالية التكرار المحمية بمدقّق وسقوط
  // حتمي (لقطات VARA): مثبت في الإنتاج للعربية (sports-names، فلترة التعليقات)
  // وأرخص من gpt-5.1 بفارق كبير على حجم الاستدعاءات هذا.
  if (tier === "mini") return { ...AI_MODELS.GPT_4O_MINI };
  // «cheap»/«strong»: gpt-5.1. الطبقة «الرخيصة» كانت تختار Gemini Flash عند
  // توفّر مفتاح Gemini، لكن نموذج البوابة GEMINI_FLASH (gemini-2.5-flash)
  // متوقّف/في cooldown على الإنتاج فيفشل التوليد بـ«no available model» (بطاقات فارغة)،
  // بينما لا يظهر محلياً لغياب مفتاح Gemini. gpt-5.1 مثبت أنه يعمل.
  return { ...AI_MODELS.GPT_5_1 };
}

/** يقشّر ```json ... ``` ويلتقط أول كتلة {..} أو [..] متوازنة. */
function extractJson(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.search(/[[{]/);
  if (start < 0) return null;
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export interface GenerateJsonOpts {
  feature: string;
  tier?: ModelTier;
  maxTokens?: number;
}

/** يولّد JSON مُؤرَّض ويحلّله؛ يُرجِع null عند أي فشل (توليد/تحليل). */
export async function generateJson<T = unknown>(
  prompt: string,
  opts: GenerateJsonOpts,
): Promise<T | null> {
  const model = pickModel(opts.tier ?? "cheap");
  try {
    const res = await aiManager.generate(prompt, {
      ...model,
      maxTokens: opts.maxTokens ?? 900,
      feature: opts.feature,
      // JSON mode آمن مع OpenAI؛ نتركه لـGemini عبر تعليمات المطالبة + المحلّل المتسامح.
      ...(model.provider === "openai" ? { jsonMode: true } : {}),
    });
    const text = extractJson(res.content || "");
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (error) {
    console.error(`[SportsIntel] generateJson(${opts.feature}) failed:`, error);
    return null;
  }
}

export interface GenerateTextOpts {
  feature: string;
  tier?: ModelTier;
  maxTokens?: number;
}

/** يولّد نصّاً عربياً مُؤرَّضاً؛ يُرجِع "" عند الفشل. */
export async function generateText(
  prompt: string,
  opts: GenerateTextOpts,
): Promise<string> {
  const model = pickModel(opts.tier ?? "strong");
  try {
    const res = await aiManager.generate(prompt, {
      ...model,
      maxTokens: opts.maxTokens ?? 700,
      feature: opts.feature,
    });
    return (res.content || "").trim();
  } catch (error) {
    console.error(`[SportsIntel] generateText(${opts.feature}) failed:`, error);
    return "";
  }
}

/** هل يوجد مزوّد AI مُهيّأ أصلاً؟ (نمتنع عن التوليد إن لا مزوّد). */
export function isAiAvailable(): boolean {
  return (
    aiManager.isProviderConfigured("openai") ||
    aiManager.isProviderConfigured("anthropic") ||
    aiManager.isProviderConfigured("gemini")
  );
}
