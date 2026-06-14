/**
 * مختبر البرومبت — مسار تحسين التعليمات (مصادقة مطلوبة).
 *
 *   POST /api/prompt-studio/optimize   يعيد صياغة برومبت وفق دليل Anthropic
 */
import { Router } from "express";
import { requireAuth } from "../rbac";
import {
  optimizePrompt,
  type OptimizePromptInput,
  type ToolBehavior,
  type ThinkingDepth,
  type PromptLanguage,
} from "../services/promptStudio";
import type { AIProvider } from "../ai-manager";

const router = Router();

const TOOL_BEHAVIORS: ToolBehavior[] = ["proactive", "conservative", "parallel", "none"];
const THINKING_DEPTHS: ThinkingDepth[] = ["none", "low", "medium", "high", "max"];
const PROVIDERS: AIProvider[] = ["anthropic", "openai", "gemini"];

// كلمة السر للرابط العام (خارج لوحة التحكم) — قابلة للتجاوز عبر متغير البيئة.
const PUBLIC_PASSWORD = process.env.PROMPT_STUDIO_PASSWORD || "Ali&Sultan";

function parseInput(body: any): OptimizePromptInput {
  const toolBehavior = TOOL_BEHAVIORS.includes(body.toolBehavior)
    ? (body.toolBehavior as ToolBehavior)
    : undefined;
  const thinking = THINKING_DEPTHS.includes(body.thinking)
    ? (body.thinking as ThinkingDepth)
    : undefined;
  const provider = PROVIDERS.includes(body.provider)
    ? (body.provider as AIProvider)
    : undefined;
  const language: PromptLanguage = body.language === "en" ? "en" : "ar";

  return {
    rawPrompt: String(body.rawPrompt || "").trim(),
    goal: body.goal ? String(body.goal) : undefined,
    role: body.role ? String(body.role) : undefined,
    context: body.context ? String(body.context) : undefined,
    outputFormat: body.outputFormat ? String(body.outputFormat) : undefined,
    examples: body.examples ? String(body.examples) : undefined,
    toolBehavior,
    thinking,
    constraints: Array.isArray(body.constraints)
      ? body.constraints.map((c: any) => String(c)).filter(Boolean)
      : undefined,
    targetModel: body.targetModel ? String(body.targetModel) : undefined,
    language,
    provider,
  };
}

router.post("/api/prompt-studio/optimize", requireAuth, async (req: any, res) => {
  try {
    const input = parseInput(req.body || {});
    if (!input.rawPrompt) {
      return res.status(400).json({ message: "البرومبت مطلوب" });
    }
    const result = await optimizePrompt(input);
    res.json(result);
  } catch (err) {
    console.error("[prompt-studio] optimize:", err);
    res.status(400).json({
      message: err instanceof Error ? err.message : "فشل في تحسين البرومبت",
    });
  }
});

// رابط عام محمي بكلمة سر مشتركة — للمتعاونين بدون حساب في سبق.
router.post("/api/prompt-studio/optimize-public", async (req: any, res) => {
  try {
    const body = req.body || {};
    const password = String(body.password || "");
    if (password !== PUBLIC_PASSWORD) {
      return res.status(401).json({ message: "كلمة السر غير صحيحة" });
    }

    const input = parseInput(body);
    if (!input.rawPrompt) {
      return res.status(400).json({ message: "البرومبت مطلوب" });
    }
    const result = await optimizePrompt(input);
    res.json(result);
  } catch (err) {
    console.error("[prompt-studio] optimize-public:", err);
    res.status(400).json({
      message: err instanceof Error ? err.message : "فشل في تحسين البرومبت",
    });
  }
});

export default router;
