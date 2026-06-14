/**
 * مختبر البرومبت — Prompt Studio.
 *
 * يأخذ برومبت خام + متطلبات المستخدم، ويعيد صياغته وفق دليل Anthropic الرسمي
 * لهندسة التعليمات (Claude prompting best practices):
 *   - واضح ومباشر + سبب المهمة
 *   - تنظيم بوسوم XML
 *   - دور (role) + أمثلة few-shot داخل <example>
 *   - صيغة مخرجات صريحة (قل ماذا تفعل لا ماذا تتجنب)
 *   - مقاطع جاهزة لسلوك الأدوات/التفكير/منع المبالغة/منع الهلوسة
 *
 * يستخدم aiManager (Anthropic افتراضياً لأن الدليل خاص بنماذج Claude).
 */
import { aiManager, type AIProvider } from "../ai-manager";

export type ToolBehavior = "proactive" | "conservative" | "parallel" | "none";
export type ThinkingDepth = "none" | "low" | "medium" | "high" | "max";
export type PromptLanguage = "ar" | "en";

export interface OptimizePromptInput {
  rawPrompt: string;
  goal?: string;
  role?: string;
  context?: string;
  outputFormat?: string;
  examples?: string;
  toolBehavior?: ToolBehavior;
  thinking?: ThinkingDepth;
  constraints?: string[];
  targetModel?: string;
  language?: PromptLanguage;
  provider?: AIProvider;
}

export interface PromptChecklistItem {
  label: string;
  pass: boolean;
  note: string;
}

export interface OptimizePromptResult {
  optimizedPrompt: string;
  score: number;
  checklist: PromptChecklistItem[];
  improvements: string[];
  explanation: string;
  provider: AIProvider;
  model: string;
}

const PROVIDER_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.1",
  gemini: "gemini-3-pro-preview",
};

function extractJson(raw: string): any | null {
  const trimmed = (raw || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const CONSTRAINT_SNIPPETS: Record<string, string> = {
  "no-overengineering":
    "Avoid over-engineering: only make changes directly requested or clearly necessary; no extra files, abstractions, or speculative flexibility.",
  "no-hallucination":
    "Never speculate about code/files not opened; investigate and read relevant sources BEFORE answering; give grounded, hallucination-free answers.",
  "minimal-markdown":
    "Write in clear flowing prose; reserve markdown for inline code, code blocks, and simple headings; avoid excessive bullet lists.",
  "no-preamble":
    "Respond directly without preamble (no 'Here is...', 'Based on...').",
  "plain-text-math":
    "Format math in plain text only (no LaTeX/MathJax); use / for division, * for multiplication, ^ for exponents.",
  "ask-before-destructive":
    "Take local reversible actions freely, but ask before destructive or hard-to-reverse actions (deletes, force-push, shared systems).",
  "cleanup-temp-files":
    "If you create temporary/helper files for iteration, remove them at the end of the task.",
};

const TOOL_BEHAVIOR_SNIPPETS: Record<ToolBehavior, string> = {
  proactive:
    "<default_to_action>By default, implement changes rather than only suggesting them. If intent is unclear, infer the most useful action and proceed, using tools to discover missing details instead of guessing.</default_to_action>",
  conservative:
    "<do_not_act_before_instructions>Do not change files unless clearly instructed. When intent is ambiguous, default to research and recommendations rather than taking action.</do_not_act_before_instructions>",
  parallel:
    "<use_parallel_tool_calls>If you intend to call multiple tools with no dependencies between them, make all independent calls in parallel rather than sequentially to maximize speed. If a call depends on a previous result, call sequentially. Never guess missing parameters.</use_parallel_tool_calls>",
  none: "",
};

function buildMetaPrompt(input: OptimizePromptInput): string {
  const lang = input.language === "en" ? "en" : "ar";
  const targetModel = input.targetModel || "Claude Opus 4.8";

  const requirements: string[] = [];
  if (input.goal) requirements.push(`Goal / task: ${input.goal}`);
  if (input.role) requirements.push(`Desired role for the assistant: ${input.role}`);
  if (input.context) requirements.push(`Context & why it matters: ${input.context}`);
  if (input.outputFormat) requirements.push(`Desired output format: ${input.outputFormat}`);
  if (input.examples) requirements.push(`Few-shot examples to include (wrap each in <example>): ${input.examples}`);
  if (input.toolBehavior && input.toolBehavior !== "none") {
    requirements.push(
      `Tool behavior = ${input.toolBehavior}. Include this snippet: ${TOOL_BEHAVIOR_SNIPPETS[input.toolBehavior]}`,
    );
  }
  if (input.thinking && input.thinking !== "none") {
    requirements.push(
      `Thinking depth = ${input.thinking}. Add guidance to calibrate reasoning depth (use adaptive thinking / effort=${input.thinking}); reason only as much as the task needs.`,
    );
  }
  const constraintSnippets = (input.constraints || [])
    .map((c) => CONSTRAINT_SNIPPETS[c])
    .filter(Boolean);
  if (constraintSnippets.length) {
    requirements.push(`Constraints to embed verbatim or paraphrased:\n- ${constraintSnippets.join("\n- ")}`);
  }
  requirements.push(`Target model: ${targetModel}`);

  const outputLangLabel = lang === "ar" ? "Arabic" : "English";

  return `You are an expert prompt engineer who rewrites prompts to follow Anthropic's official "Claude prompting best practices" guide for the latest Claude models.

Apply these principles when rewriting the user's prompt:
1. Be clear and direct; specify the exact desired output and constraints. Use sequential numbered steps when order matters.
2. Add context/motivation ("why") so the model can generalize.
3. Use few-shot examples wrapped in <example> tags when examples are provided.
4. Structure the prompt with descriptive XML tags (e.g. <instructions>, <context>, <examples>, <output_format>). Nest when there is natural hierarchy.
5. Give the model a clear role.
6. For output formatting, tell it what TO do (not what to avoid); use XML format indicators when helpful.
7. Place any long reference data near the top, the actual instruction/question near the end.
8. Include tool-use, thinking-depth, anti-overengineering, and anti-hallucination guidance ONLY when the requirements ask for it. Use normal phrasing, not aggressive "CRITICAL: YOU MUST" language (newer models overtrigger on that).
9. Keep it minimal and focused — do not invent requirements the user did not ask for.

<user_raw_prompt>
${input.rawPrompt}
</user_raw_prompt>

<requirements>
${requirements.join("\n")}
</requirements>

Produce the rewritten prompt itself in ${outputLangLabel} (matching the raw prompt's language is preferred). All your explanatory text (notes, checklist labels, improvements, explanation) MUST be written in ${outputLangLabel}.

Return ONLY a valid JSON object (no markdown fences) with exactly this shape:
{
  "optimizedPrompt": "the full rewritten, ready-to-copy prompt",
  "score": <integer 0-100 rating how well the ORIGINAL raw prompt followed the best practices>,
  "checklist": [
    {"label": "<principle name>", "pass": <true|false>, "note": "<short note on the original prompt>"}
  ],
  "improvements": ["<short actionable improvement>", "..."],
  "explanation": "<2-4 sentences summarizing the key changes you made>"
}

The checklist must cover at least: clarity & directness, context/why, examples, XML structure, role, explicit output format. Base "score" and "pass"/"note" on the ORIGINAL raw prompt, not your rewrite.`;
}

export async function optimizePrompt(
  input: OptimizePromptInput,
): Promise<OptimizePromptResult> {
  const raw = (input.rawPrompt || "").trim();
  if (raw.length < 5) {
    throw new Error("البرومبت قصير جداً — اكتب نصاً أوضح لتحسينه");
  }

  const provider: AIProvider = input.provider || "anthropic";
  const model = PROVIDER_MODELS[provider] || PROVIDER_MODELS.anthropic;
  const prompt = buildMetaPrompt(input);

  const res = await aiManager.generate(prompt, {
    provider,
    model,
    maxTokens: 4000,
    temperature: 0.4,
    jsonMode: provider === "openai",
  });

  if (res.error) throw new Error(res.error);

  const parsed = extractJson(res.content || "");
  if (!parsed || typeof parsed.optimizedPrompt !== "string" || !parsed.optimizedPrompt.trim()) {
    throw new Error("تعذّر تحليل استجابة الذكاء الاصطناعي — حاول مرة أخرى");
  }

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  const checklist: PromptChecklistItem[] = Array.isArray(parsed.checklist)
    ? parsed.checklist
        .map((item: any) => ({
          label: String(item?.label || "").trim(),
          pass: Boolean(item?.pass),
          note: String(item?.note || "").trim(),
        }))
        .filter((item: PromptChecklistItem) => item.label)
    : [];
  const improvements: string[] = Array.isArray(parsed.improvements)
    ? parsed.improvements.map((s: any) => String(s).trim()).filter(Boolean)
    : [];

  return {
    optimizedPrompt: String(parsed.optimizedPrompt).trim(),
    score,
    checklist,
    improvements,
    explanation: String(parsed.explanation || "").trim(),
    provider: res.provider,
    model: res.model,
  };
}
