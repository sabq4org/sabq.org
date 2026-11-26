// سجل «تحرير وتوليد شامل»: للمسؤول ومدير النظام فقط (صلاحية "*").
// GET /api/admin/articles/:id/smart-edit-runs  تشغيلات الخبر (بلا نصوص)
// GET /api/admin/smart-edit-runs/:runId         تشغيل بنصوصه كاملة + نص الخبر الحالي
// GET /api/admin/smart-edit-usage?days=7        ملخص المحررين

import { Router, type NextFunction, type Request, type Response } from "express";
import * as Sentry from "@sentry/node";
import { getEffectiveUserPermissions, requireAuth } from "../rbac";
import {
  getSmartEditRun,
  listSmartEditRunsForArticle,
  smartEditUsageSummary,
} from "../services/smartEditRunsService";

const router = Router();

async function requireSuperuser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = (req.user as { id?: string } | undefined)?.id;
    const permissions = id ? await getEffectiveUserPermissions(id) : [];
    if (!permissions.includes("*")) {
      return res.status(403).json({ message: "سجل المحرر الذكي للمسؤول ومدير النظام فقط" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    next();
  } catch (error) {
    next(error);
  }
}

function sendError(res: Response, error: unknown) {
  // قبل تنفيذ ملف SQL في الإنتاج: الجدول غير موجود
  if ((error as { code?: string; cause?: { code?: string } })?.code === "42P01"
    || (error as { cause?: { code?: string } })?.cause?.code === "42P01") {
    return res.status(503).json({ message: "سجل المحرر الذكي لم يُفعَّل بعد" });
  }
  console.error("[smart-edit-runs]", error);
  Sentry.captureException(error, { tags: { subsystem: "smart-edit-runs" } });
  return res.status(500).json({ message: "تعذر تحميل سجل المحرر الذكي" });
}

router.get("/api/admin/articles/:id/smart-edit-runs", requireAuth, requireSuperuser, async (req, res) => {
  try {
    res.json({ runs: await listSmartEditRunsForArticle(String(req.params.id)) });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/api/admin/smart-edit-runs/:runId", requireAuth, requireSuperuser, async (req, res) => {
  try {
    const run = await getSmartEditRun(String(req.params.runId));
    if (!run) return res.status(404).json({ message: "التشغيل غير موجود" });
    res.json(run);
  } catch (error) {
    sendError(res, error);
  }
});

const DAY_OPTIONS = new Set([1, 7, 30]);

router.get("/api/admin/smart-edit-usage", requireAuth, requireSuperuser, async (req, res) => {
  try {
    const requested = Number(req.query.days);
    const days = DAY_OPTIONS.has(requested) ? requested : 7;
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    res.json({ days, from, to, ...(await smartEditUsageSummary({ from, to })) });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
