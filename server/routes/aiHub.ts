// AI Hub admin API — /api/admin/ai-hub/*
// Protected with requirePermission (NOT role-text checks): superusers pass
// automatically; the ai_hub.view / ai_hub.manage codes are seeded by
// scripts/seed-ai-hub.ts for granting to non-superuser roles.

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import {
  createModel,
  getDailySeries,
  getIncidents,
  getOverviewStats,
  getProviderDistribution,
  getTopFeatures,
  listAudit,
  listBudgets,
  listFeatures,
  listModels,
  listUsageLogs,
  testFeature,
  testProviders,
  updateFeature,
  updateModel,
  upsertBudget,
  type Actor,
} from "../services/aiHubService";

const router = Router();

router.use("/api/admin/ai-hub", requireAuth);

function actorFrom(req: { user?: unknown }): Actor {
  const user = (req.user ?? {}) as { id?: string; firstName?: string; lastName?: string; email?: string };
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "unknown";
  return { id: user.id ?? "unknown", name };
}

// ── Overview ──

router.get("/api/admin/ai-hub/overview", requirePermission("ai_hub.view"), async (_req, res) => {
  try {
    res.json(await getOverviewStats());
  } catch (err) {
    console.error("[AI Hub] overview failed:", err);
    res.status(500).json({ message: "تعذر تحميل النظرة العامة" });
  }
});

router.get("/api/admin/ai-hub/series", requirePermission("ai_hub.view"), async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    res.json(await getDailySeries(days));
  } catch (err) {
    console.error("[AI Hub] series failed:", err);
    res.status(500).json({ message: "تعذر تحميل السلسلة الزمنية" });
  }
});

router.get("/api/admin/ai-hub/distribution", requirePermission("ai_hub.view"), async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 120);
    const [providers, features] = await Promise.all([
      getProviderDistribution(days),
      getTopFeatures(days, 10),
    ]);
    res.json({ providers, features });
  } catch (err) {
    console.error("[AI Hub] distribution failed:", err);
    res.status(500).json({ message: "تعذر تحميل التوزيع" });
  }
});

router.get("/api/admin/ai-hub/incidents", requirePermission("ai_hub.view"), async (_req, res) => {
  try {
    res.json(await getIncidents(25));
  } catch (err) {
    console.error("[AI Hub] incidents failed:", err);
    res.status(500).json({ message: "تعذر تحميل الحوادث" });
  }
});

// ── Features ──

router.get("/api/admin/ai-hub/features", requirePermission("ai_hub.view"), async (_req, res) => {
  try {
    res.json(await listFeatures());
  } catch (err) {
    console.error("[AI Hub] features failed:", err);
    res.status(500).json({ message: "تعذر تحميل الميزات" });
  }
});

const featurePatchSchema = z.object({
  primaryModelId: z.string().min(1).optional(),
  fallbackChain: z.array(z.string()).max(5).optional(),
  maxTokens: z.number().int().min(1).max(200_000).nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  isEnabled: z.boolean().optional(),
  allowFailover: z.boolean().optional(),
});

router.patch("/api/admin/ai-hub/features/:key", requirePermission("ai_hub.manage"), async (req, res) => {
  const parsed = featurePatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "بيانات غير صالحة", issues: parsed.error.issues });
  }
  try {
    const result = await updateFeature(req.params.key, parsed.data, actorFrom(req));
    if (!result.ok) return res.status(400).json({ message: result.error });
    res.json({ ok: true });
  } catch (err) {
    console.error("[AI Hub] feature update failed:", err);
    res.status(500).json({ message: "تعذر حفظ التعديل" });
  }
});

router.post("/api/admin/ai-hub/features/:key/test", requirePermission("ai_hub.manage"), async (req, res) => {
  try {
    res.json(await testFeature(req.params.key));
  } catch (err) {
    console.error("[AI Hub] feature test failed:", err);
    res.status(500).json({ message: "فشل الاختبار" });
  }
});

// ── Models & providers ──

router.get("/api/admin/ai-hub/models", requirePermission("ai_hub.view"), async (_req, res) => {
  try {
    res.json(await listModels());
  } catch (err) {
    console.error("[AI Hub] models failed:", err);
    res.status(500).json({ message: "تعذر تحميل النماذج" });
  }
});

const modelPatchSchema = z.object({
  displayName: z.string().min(1).max(128).optional(),
  costPer1MInput: z.number().min(0).optional(),
  costPer1MOutput: z.number().min(0).optional(),
  costPerUnit: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

router.patch("/api/admin/ai-hub/models/:id", requirePermission("ai_hub.manage"), async (req, res) => {
  const parsed = modelPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "بيانات غير صالحة", issues: parsed.error.issues });
  }
  try {
    const result = await updateModel(req.params.id, parsed.data, actorFrom(req));
    if (!result.ok) return res.status(400).json({ message: result.error });
    res.json({ ok: true });
  } catch (err) {
    console.error("[AI Hub] model update failed:", err);
    res.status(500).json({ message: "تعذر حفظ التعديل" });
  }
});

const newModelSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "elevenlabs"]),
  modelId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(128),
  capabilities: z.array(z.enum(["complete", "embed", "image", "tts"])).min(1),
  pricingUnit: z.enum(["tokens", "chars", "image"]),
  costPer1MInput: z.number().min(0).default(0),
  costPer1MOutput: z.number().min(0).default(0),
  costPerUnit: z.number().min(0).default(0),
});

router.post("/api/admin/ai-hub/models", requirePermission("ai_hub.manage"), async (req, res) => {
  const parsed = newModelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "بيانات غير صالحة", issues: parsed.error.issues });
  }
  try {
    const result = await createModel(parsed.data, actorFrom(req));
    if (!result.ok) return res.status(400).json({ message: result.error });
    res.json({ ok: true, id: result.id });
  } catch (err) {
    console.error("[AI Hub] model create failed:", err);
    res.status(500).json({ message: "تعذر إضافة النموذج" });
  }
});

router.post("/api/admin/ai-hub/providers/test", requirePermission("ai_hub.manage"), async (_req, res) => {
  try {
    res.json(await testProviders());
  } catch (err) {
    console.error("[AI Hub] providers test failed:", err);
    res.status(500).json({ message: "فشل فحص المزودين" });
  }
});

// ── Logs, audit & budgets ──

router.get("/api/admin/ai-hub/logs", requirePermission("ai_hub.view"), async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 50, 10), 200);
    const result = await listUsageLogs({
      featureKey: (req.query.feature as string) || undefined,
      provider: (req.query.provider as string) || undefined,
      status: (req.query.status as string) || undefined,
      from: req.query.from ? new Date(String(req.query.from)) : undefined,
      to: req.query.to ? new Date(String(req.query.to)) : undefined,
      page,
      pageSize,
    });
    res.json(result);
  } catch (err) {
    console.error("[AI Hub] logs failed:", err);
    res.status(500).json({ message: "تعذر تحميل السجل" });
  }
});

router.get("/api/admin/ai-hub/audit", requirePermission("ai_hub.view"), async (_req, res) => {
  try {
    res.json(await listAudit(50));
  } catch (err) {
    console.error("[AI Hub] audit failed:", err);
    res.status(500).json({ message: "تعذر تحميل سجل التغييرات" });
  }
});

router.get("/api/admin/ai-hub/budgets", requirePermission("ai_hub.view"), async (_req, res) => {
  try {
    res.json(await listBudgets());
  } catch (err) {
    console.error("[AI Hub] budgets failed:", err);
    res.status(500).json({ message: "تعذر تحميل الميزانيات" });
  }
});

const budgetSchema = z.object({
  scope: z.enum(["global", "provider", "feature"]),
  scopeKey: z.string().max(64).default(""),
  monthlyLimitUsd: z.number().min(0),
  alertAt80: z.boolean().default(true),
  alertAt100: z.boolean().default(true),
  isEnabled: z.boolean().default(true),
});

router.put("/api/admin/ai-hub/budgets", requirePermission("ai_hub.manage"), async (req, res) => {
  const parsed = budgetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "بيانات غير صالحة", issues: parsed.error.issues });
  }
  try {
    const result = await upsertBudget(parsed.data, actorFrom(req));
    res.json(result);
  } catch (err) {
    console.error("[AI Hub] budget upsert failed:", err);
    res.status(500).json({ message: "تعذر حفظ الميزانية" });
  }
});

export { router as aiHubRouter };
