/**
 * مزادات إنفاذ — JSON عام لصفحة /infath، ولوحة خلف infath.submit / infath.approve.
 * حساب إنفاذ (infath.submit) يُدخل ويرسل، ومحرر سبق (infath.approve) يعتمد أو يعيد.
 * الأدمن يمر لأن userHasPermission يختصر حسابات المسؤول.
 */
import { Router, type Request, type Response } from "express";
import * as Sentry from "@sentry/node";
import { ZodError } from "zod";
import { requireAnyPermission, requirePermission } from "../rbac";
import { purgeContentSurfaces } from "../services/cloudflarePurge";
import {
  InfathError,
  approveWeek,
  createWeek,
  getPreview,
  getPublicView,
  getWeekDetail,
  listWeeks,
  returnWeek,
  saveAuctions,
  submitWeek,
} from "../services/infathService";
import { INFATH_FIELD_LABELS } from "@shared/infath";

const router = Router();
const PUBLIC_CACHE = "public, max-age=30, s-maxage=60";
const EDIT = ["infath.submit", "infath.approve"];

function actorId(req: Request): string | null {
  const id = (req.user as { id?: string } | undefined)?.id;
  return id || null;
}

function reportUnexpected(error: unknown) {
  console.error("[infath]", error);
  const cause = error instanceof Error ? error.cause : undefined;
  const pgCode = cause && typeof cause === "object" && "code" in cause ? String((cause as { code?: unknown }).code) : undefined;
  Sentry.captureException(error, {
    tags: { subsystem: "infath", ...(pgCode ? { pgCode } : {}) },
    extra: { cause: cause instanceof Error ? cause.message : cause ?? null },
  });
}

function sendError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    // {الحقل: [رسائل]} — الشكل الذي يعرضه apiRequest في اللوحة. أخطاء الصفوف تحمل رقم الصف في الرسالة.
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = String(issue.path[0] === "auctions" && issue.path.length > 2 ? issue.path[2] : issue.path[0] ?? "");
      const label = INFATH_FIELD_LABELS[key] ?? (key || "الإدخال");
      (fieldErrors[label] ||= []).push(issue.message);
    }
    return res.status(400).json({ message: "بيانات غير صالحة", errors: fieldErrors });
  }
  if (error instanceof InfathError) {
    return res.status(error.status).json({ message: error.message });
  }
  reportUnexpected(error);
  return res.status(500).json({ message: "تعذر تنفيذ الطلب" });
}

async function purgeInfath(weekStart: string | null) {
  const urls = ["/infath", "/api/infath"];
  if (weekStart) urls.push(`/infath?week=${weekStart}`, `/api/infath?week=${weekStart}`);
  try {
    await purgeContentSurfaces(urls, { immediate: true });
  } catch (error) {
    console.error("[infath] purge failed", error);
  }
}

router.get("/api/infath", async (req, res) => {
  try {
    const week = typeof req.query.week === "string" ? req.query.week : null;
    const view = await getPublicView(week);
    res.setHeader("Cache-Control", PUBLIC_CACHE);
    if (!view) return res.status(404).json({ message: "لا توجد مزادات منشورة" });
    res.json(view);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/api/infath/admin/weeks", requireAnyPermission(...EDIT), async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await listWeeks());
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/api/infath/admin/weeks", requireAnyPermission(...EDIT), async (req, res) => {
  try {
    const userId = actorId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    res.status(201).json(await createWeek(userId, req.body));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/api/infath/admin/weeks/:id", requireAnyPermission(...EDIT), async (req, res) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await getWeekDetail(req.params.id));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/api/infath/admin/weeks/:id/preview", requireAnyPermission(...EDIT), async (req, res) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await getPreview(req.params.id));
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/api/infath/admin/weeks/:id/auctions", requireAnyPermission(...EDIT), async (req, res) => {
  try {
    const userId = actorId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    res.json(await saveAuctions(userId, req.params.id, req.body));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/api/infath/admin/weeks/:id/submit", requireAnyPermission(...EDIT), async (req, res) => {
  try {
    const userId = actorId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    res.json(await submitWeek(userId, req.params.id, req.body));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/api/infath/admin/weeks/:id/approve", requirePermission("infath.approve"), async (req, res) => {
  try {
    const userId = actorId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const detail = await approveWeek(userId, req.params.id, req.body);
    await purgeInfath(detail.weekStart);
    res.json(detail);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/api/infath/admin/weeks/:id/return", requirePermission("infath.approve"), async (req, res) => {
  try {
    const userId = actorId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    res.json(await returnWeek(userId, req.params.id, req.body));
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
