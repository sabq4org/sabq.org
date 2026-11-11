/**
 * كلمات محظورة من النشر — إدارة القائمة من اللوحة. للمسؤول ومدير النظام فقط
 * (هما المستثنيان من المنع، فلا يدير القائمة من يخضع لها).
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import * as Sentry from "@sentry/node";
import { getEffectiveUserPermissions, requireAuth } from "../rbac";
import {
  PublishBannedWordsError,
  addBannedWord,
  listBannedWords,
  previewBannedWordImpact,
  removeBannedWord,
  setBannedWordActive,
} from "../services/publishBannedWordsService";

const router = Router();
const BASE = "/api/admin/publish-banned-words";

function actorId(req: Request): string | null {
  return (req.user as { id?: string } | undefined)?.id ?? null;
}

async function requireSuperuser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = actorId(req);
    const permissions = id ? await getEffectiveUserPermissions(id) : [];
    if (!permissions.includes("*")) {
      return res.status(403).json({ message: "إدارة الكلمات المحظورة للمسؤول ومدير النظام فقط" });
    }
    next();
  } catch (error) {
    next(error);
  }
}

function sendError(res: Response, error: unknown) {
  if (error instanceof PublishBannedWordsError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error("[publish-banned-words]", error);
  Sentry.captureException(error, { tags: { subsystem: "publish-banned-words" } });
  return res.status(500).json({ message: "تعذر تنفيذ الطلب" });
}

router.get(BASE, requireAuth, requireSuperuser, async (_req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await listBannedWords());
  } catch (error) {
    sendError(res, error);
  }
});

router.get(`${BASE}/preview`, requireAuth, requireSuperuser, async (req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await previewBannedWordImpact(req.query.word));
  } catch (error) {
    sendError(res, error);
  }
});

router.post(BASE, requireAuth, requireSuperuser, async (req, res) => {
  try {
    const row = await addBannedWord({ word: req.body?.word, note: req.body?.note, actorId: actorId(req) });
    res.status(201).json(row);
  } catch (error) {
    sendError(res, error);
  }
});

router.patch(`${BASE}/:id`, requireAuth, requireSuperuser, async (req, res) => {
  try {
    if (typeof req.body?.isActive !== "boolean") {
      return res.status(400).json({ message: "حدّد حالة التفعيل" });
    }
    res.json(await setBannedWordActive(req.params.id, req.body.isActive));
  } catch (error) {
    sendError(res, error);
  }
});

router.delete(`${BASE}/:id`, requireAuth, requireSuperuser, async (req, res) => {
  try {
    res.json(await removeBannedWord(req.params.id));
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
