// «صوتي» لكتّاب الرأي:
//   GET    /api/opinion-author/voice                       حالة صوت الكاتب الحالي
//   POST   /api/opinion-author/voice                       إرسال التسجيل مع الموافقة (multipart: file, consent, consentVersion, durationSeconds)
//   DELETE /api/opinion-author/voice                       حذف الصوت وسحب الموافقة
//   GET    /api/opinion-author/voice/audio/:kind           تسجيلي (sample) أو الاستماع التجريبي (preview) — رابط مؤقت
//   GET    /api/admin/opinion-writer-voices                قائمة الحالة للمسؤول ومدير النظام فقط ("*")
//   GET    /api/admin/opinion-writer-voices/:userId/sample تسجيل كاتب للمسؤول فقط ("*")
// ADR-001: لا وصول مباشر لقاعدة البيانات هنا — الاستعلامات في writerVoiceService.

import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { WRITER_VOICE_MAX_BYTES } from "@shared/writerVoice";
import { getEffectiveUserPermissions, logActivity, requireAuth, userHasAnyRole } from "../rbac";
import {
  WriterVoiceError,
  getWriterVoiceAudioUrl,
  getWriterVoiceState,
  listWriterVoicesForAdmin,
  submitWriterVoiceSample,
  withdrawWriterVoice,
} from "../services/writerVoiceService";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: WRITER_VOICE_MAX_BYTES, files: 1 } });
const userIdOf = (req: Request) => (req.user as { id: string }).id;

async function isSuperuser(userId: string): Promise<boolean> {
  const permissions = await getEffectiveUserPermissions(userId);
  return permissions.includes("*");
}

async function requireWriter(req: Request, res: Response, next: NextFunction) {
  try {
    // مثل بقية /api/opinion-author (حارس opinionAuthorWorkspace): لكتّاب الرأي فقط.
    if (!(await userHasAnyRole(userIdOf(req), ["opinion_author"]))) {
      return res.status(403).json({ message: "«صوتي» مخصص لكتّاب الرأي" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    next();
  } catch (error) {
    next(error);
  }
}

async function requireSuperuser(req: Request, res: Response, next: NextFunction) {
  try {
    if (!(await isSuperuser(userIdOf(req)))) {
      return res.status(403).json({ message: "أصوات الكتّاب للمسؤول ومدير النظام فقط" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    next();
  } catch (error) {
    next(error);
  }
}

function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "حجم التسجيل أكبر من المسموح", code: "TOO_LARGE" });
    }
    return res.status(400).json({ message: "تعذر قراءة التسجيل", code: "BAD_UPLOAD" });
  });
}

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof WriterVoiceError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }
  console.error("[writer-voice]", error instanceof Error ? error.message : error);
  return res.status(500).json({ message: fallback });
}

const meta = (req: Request) => ({ ip: req.ip, userAgent: req.get("user-agent") });

router.get("/api/opinion-author/voice", requireAuth, requireWriter, async (req, res) => {
  try {
    return res.json({ voice: await getWriterVoiceState(userIdOf(req)) });
  } catch (error) {
    return sendError(res, error, "تعذر جلب حالة صوتك");
  }
});

router.post("/api/opinion-author/voice", requireAuth, requireWriter, handleUpload, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "لم يصل التسجيل", code: "EMPTY" });
    const userId = userIdOf(req);
    const voice = await submitWriterVoiceSample({
      userId,
      consent: req.body?.consent === "true",
      consentVersion: String(req.body?.consentVersion || ""),
      durationSeconds: Number(req.body?.durationSeconds),
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });
    await logActivity({
      userId,
      action: "writer_voice_consent",
      entityType: "opinion_writer_voice",
      entityId: userId,
      newValue: { consentVersion: voice.consentVersion, sampleSeconds: voice.sampleSeconds },
      metadata: meta(req),
    }).catch(() => {});
    return res.status(202).json({ voice });
  } catch (error) {
    return sendError(res, error, "تعذر إرسال التسجيل");
  }
});

router.delete("/api/opinion-author/voice", requireAuth, requireWriter, async (req, res) => {
  try {
    const userId = userIdOf(req);
    const voice = await withdrawWriterVoice(userId);
    await logActivity({
      userId,
      action: "writer_voice_withdraw",
      entityType: "opinion_writer_voice",
      entityId: userId,
      metadata: meta(req),
    }).catch(() => {});
    return res.json({ voice });
  } catch (error) {
    return sendError(res, error, "تعذر حذف صوتك");
  }
});

router.get("/api/opinion-author/voice/audio/:kind", requireAuth, requireWriter, async (req, res) => {
  try {
    const kind = req.params.kind === "sample" ? "sample" : req.params.kind === "preview" ? "preview" : null;
    if (!kind) return res.status(404).json({ message: "غير موجود" });
    const url = await getWriterVoiceAudioUrl(userIdOf(req), kind);
    if (!url) return res.status(404).json({ message: "الملف غير متاح" });
    return res.redirect(url);
  } catch (error) {
    return sendError(res, error, "تعذر تشغيل الملف");
  }
});

router.get("/api/admin/opinion-writer-voices", requireAuth, requireSuperuser, async (_req, res) => {
  try {
    return res.json({ voices: await listWriterVoicesForAdmin() });
  } catch (error) {
    return sendError(res, error, "تعذر جلب أصوات الكتّاب");
  }
});

router.get("/api/admin/opinion-writer-voices/:userId/sample", requireAuth, requireSuperuser, async (req, res) => {
  try {
    const url = await getWriterVoiceAudioUrl(req.params.userId, "sample");
    if (!url) return res.status(404).json({ message: "لا يوجد تسجيل محفوظ" });
    await logActivity({
      userId: userIdOf(req),
      action: "writer_voice_sample_listen",
      entityType: "opinion_writer_voice",
      entityId: req.params.userId,
      metadata: meta(req),
    }).catch(() => {});
    return res.redirect(url);
  } catch (error) {
    return sendError(res, error, "تعذر تشغيل التسجيل");
  }
});

export default router;
