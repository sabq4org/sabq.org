// أزرار المحرر (الموجز، العناوين، العناصر الذكية، تحليل SEO) عبر بوابة الذكاء
// بدل استدعاء OpenAI مباشرة: النموذج والبديل يُحددان من مركز الذكاء (أو من
// defaults.ts عند غياب صف للميزة)، وكل محاولة تُسجَّل في ai_usage_logs.
// الافتراضي منذ 2026-11-09: Claude Sonnet 5.5 أولًا، ثم GPT-5.1، ثم Gemini Flash.

import { createHash } from "node:crypto";
import { aiGateway } from "./gateway";

export interface EditorTextRequest {
  system: string;
  user: string;
  maxTokens: number;
  /** يُتجاهل تلقائيًا لنماذج Claude الجديدة التي ترفضه. */
  temperature?: number;
  json?: boolean;
  /** تعليمات نظام ثابتة بين الطلبات: تُخزَّن مؤقتًا لدى Anthropic. */
  cacheSystemPrompt?: boolean;
  /**
   * طلبان متطابقان في الوقت نفسه (ضغطتان على الزر) يتشاركان استدعاءً واحدًا،
   * كما كان trackedOpenAICompletion يفعل. لا يُحفظ أي رد بعد اكتماله.
   */
  deduplicate?: boolean;
}

export interface EditorTextResult {
  content: string;
  truncated: boolean;
  provider: string;
  modelId: string;
}

const pending = new Map<string, Promise<EditorTextResult>>();
const MAX_PENDING = 200;

async function run(feature: string, req: EditorTextRequest): Promise<EditorTextResult> {
  const res = await aiGateway.complete({
    feature,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    options: {
      maxTokens: req.maxTokens,
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.json ? { jsonMode: true } : {}),
      ...(req.cacheSystemPrompt ? { cacheSystemPrompt: true } : {}),
    },
  });
  return { content: res.content ?? "", truncated: res.truncated, provider: res.provider, modelId: res.modelId };
}

export async function completeEditorText(feature: string, req: EditorTextRequest): Promise<EditorTextResult> {
  if (!req.deduplicate || pending.size >= MAX_PENDING) return run(feature, req);
  // المفتاح بصمة فقط؛ النص نفسه لا يُخزَّن ولا يُسجَّل.
  const key = createHash("sha256").update(JSON.stringify([feature, req])).digest("hex");
  const existing = pending.get(key);
  if (existing) return { ...(await existing) };
  const request = run(feature, req);
  pending.set(key, request);
  try {
    return { ...(await request) };
  } finally {
    pending.delete(key);
  }
}

/**
 * يحلل JSON من رد نموذج. Claude لا يملك وضع JSON بلا مخطط، فقد يغلّف الرد
 * بأسوار كود أو يضيف سطرًا قبله؛ نزيل الأسوار ثم نأخذ من أول { إلى آخر }.
 */
export function parseModelJson<T = Record<string, unknown>>(raw: string): T {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const first = stripped.indexOf("{");
    const last = stripped.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("model response is not JSON");
    return JSON.parse(stripped.slice(first, last + 1)) as T;
  }
}
