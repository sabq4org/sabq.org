/**
 * تقرير البحث الأسبوعي (Search Console) — للمسؤول ومدير النظام ("*") فقط.
 * القراءة والقرارات هنا؛ المنطق في server/services/seoWeeklyService.ts وshared/seoWeekly.ts.
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import * as Sentry from "@sentry/node";
import { getEffectiveUserPermissions, requireAuth } from "../rbac";
import {
  SeoWeeklyError,
  checkSeoWeeklyAccess,
  generateSeoWeeklyReport,
  getSeoWeeklyReport,
  listSeoWeeklyReports,
  setSeoExperimentVerdict,
  updateSeoOpportunity,
} from "../services/seoWeeklyService";

const router = Router();
const BASE = "/api/admin/seo-weekly";

function actorId(req: Request): string | null {
  return (req.user as { id?: string } | undefined)?.id ?? null;
}

async function requireSuperuser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = actorId(req);
    const permissions = id ? await getEffectiveUserPermissions(id) : [];
    if (!permissions.includes("*")) {
      return res.status(403).json({ message: "تقرير البحث الأسبوعي للمسؤول ومدير النظام فقط" });
    }
    next();
  } catch (error) {
    next(error);
  }
}

function sendError(res: Response, error: unknown) {
  if (error instanceof SeoWeeklyError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  console.error("[seo-weekly]", error);
  Sentry.captureException(error, { tags: { subsystem: "seo-weekly" } });
  return res.status(500).json({ message: "تعذر تنفيذ الطلب" });
}

router.get(BASE, requireAuth, requireSuperuser, async (_req, res) => {
  try {
    res.json(await listSeoWeeklyReports());
  } catch (error) {
    sendError(res, error);
  }
});

router.get(`${BASE}/status`, requireAuth, requireSuperuser, async (_req, res) => {
  try {
    res.json(await checkSeoWeeklyAccess());
  } catch (error) {
    sendError(res, error);
  }
});

router.post(`${BASE}/run`, requireAuth, requireSuperuser, async (req, res) => {
  try {
    res.json(await generateSeoWeeklyReport({ force: true, actorId: actorId(req) }));
  } catch (error) {
    sendError(res, error);
  }
});

router.get(`${BASE}/:id`, requireAuth, requireSuperuser, async (req, res) => {
  try {
    res.json(await getSeoWeeklyReport(req.params.id));
  } catch (error) {
    sendError(res, error);
  }
});

router.patch(`${BASE}/:id/opportunities/:key`, requireAuth, requireSuperuser, async (req, res) => {
  try {
    res.json(await updateSeoOpportunity(req.params.id, req.params.key, req.body ?? {}, actorId(req)));
  } catch (error) {
    sendError(res, error);
  }
});

router.patch(`${BASE}/:id/reviews/:key`, requireAuth, requireSuperuser, async (req, res) => {
  try {
    res.json(await setSeoExperimentVerdict(req.params.id, req.params.key, req.body?.verdict ?? null, actorId(req)));
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
