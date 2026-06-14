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

router.post("/api/prompt-studio/optimize", requireAuth, async (req: any, res) => {
  try {
    const body = req.body || {};

    const rawPrompt = String(body.rawPrompt || "").trim();
    if (!rawPrompt) {
      return res.status(400).json({ message: "البرومبت مطلوب" });
    }

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

    const input: OptimizePromptInput = {
      rawPrompt,
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

    const result = await optimizePrompt(input);
    res.json(result);
  } catch (err) {
    console.error("[prompt-studio] optimize:", err);
    res.status(400).json({
      message: err instanceof Error ? err.message : "فشل في تحسين البرومبت",
    });
  }
});

export default router;
