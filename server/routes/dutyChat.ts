// «محادثة المناوب» — رسائل ثنائية بين المسؤول ومديري المحتوى داخل لوحة التحكم
// (docs/systems/editorial/SYSTEM.md § محادثة المناوب). كل المسارات private, no-store.
// ADR-001: لا وصول لقاعدة البيانات هنا — كل الاستعلامات في dutyChatService.
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import {
  DUTY_CHAT_HEARTBEAT_MS,
  DUTY_CHAT_MAX_ATTACHMENT_BYTES,
  DUTY_CHAT_FORBIDDEN_MESSAGE,
  DUTY_CHAT_MAX_BODY,
  isAllowedAttachmentMime,
  normalizeBody,
  safeFileName,
} from "@shared/dutyChat";
import {
  DutyChatAccessError,
  DutyChatInputError,
  DutyChatNotReadyError,
  ackMessage,
  canUseDutyChat,
  getAttachment,
  getInbox,
  getThread,
  markDelivered,
  markRead,
  pushFallback,
  sendMessage,
  sendTyping,
  subscribeDutyChat,
  touchPresence,
} from "../services/contentDuty/dutyChatService";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DUTY_CHAT_MAX_ATTACHMENT_BYTES, files: 1 },
});

const userIdOf = (req: Request) => (req.user as { id?: string } | undefined)?.id ?? null;

function noStore(_req: Request, res: Response, next: NextFunction) {
  res.set("Cache-Control", "private, no-store");
  next();
}

async function eligible(req: Request, res: Response, next: NextFunction) {
  const userId = userIdOf(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  try {
    if (!(await canUseDutyChat(userId))) {
      return res.status(403).json({ error: "DUTY_CHAT_FORBIDDEN", message: DUTY_CHAT_FORBIDDEN_MESSAGE });
    }
    return next();
  } catch (error) {
    return fail(res, error, "eligibility");
  }
}

function fail(res: Response, error: unknown, label: string) {
  if (error instanceof DutyChatNotReadyError) {
    return res.status(503).json({ error: error.code, message: "المحادثة غير مفعّلة بعد" });
  }
  if (error instanceof DutyChatAccessError) {
    return res.status(403).json({ error: error.code, message: error.message });
  }
  if (error instanceof DutyChatInputError) {
    return res.status(400).json({ error: error.code, message: error.message });
  }
  console.error(`[DutyChat] ${label} failed:`, (error as Error)?.message);
  return res.status(500).json({ message: "تعذر تنفيذ الطلب" });
}

const base = [isAuthenticated, noStore, eligible] as const;

router.get("/api/duty-chat/inbox", ...base, async (req, res) => {
  try {
    const me = userIdOf(req)!;
    // فتح الصندوق يعني أن ما وصلني صار على جهازي.
    await markDelivered(me);
    return res.json(await getInbox(me));
  } catch (error) {
    return fail(res, error, "inbox");
  }
});

router.get("/api/duty-chat/thread/:peerId", ...base, async (req, res) => {
  try {
    const before = typeof req.query.before === "string" ? req.query.before.slice(0, 40) : null;
    return res.json(await getThread(userIdOf(req)!, req.params.peerId, before));
  } catch (error) {
    return fail(res, error, "thread");
  }
});

function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "حجم المرفق يتجاوز 10 ميجابايت" });
    }
    return res.status(400).json({ message: "تعذر قراءة المرفق" });
  });
}

const sendBody = z.object({
  body: z.string().max(20_000).optional(),
  kind: z.enum(["normal", "alert"]).optional(),
});

router.post("/api/duty-chat/thread/:peerId/messages", ...base, handleUpload, async (req, res) => {
  try {
    const parsed = sendBody.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "بيانات الرسالة غير صحيحة" });
    // نرفض الطويل صراحة بدل قصّه بصمت، فلا تصل الرسالة ناقصة دون علم المرسل.
    if ((parsed.data.body ?? "").replace(/\r\n/g, "\n").trim().length > DUTY_CHAT_MAX_BODY) {
      return res.status(400).json({ message: `الرسالة أطول من ${DUTY_CHAT_MAX_BODY} حرف، قسّمها إلى رسالتين` });
    }
    const file = req.file;
    if (file && !isAllowedAttachmentMime(file.mimetype)) {
      return res.status(400).json({ message: "المرفق المسموح: صورة (JPG أو PNG أو WebP أو GIF) أو PDF" });
    }
    const message = await sendMessage(userIdOf(req)!, req.params.peerId, {
      body: normalizeBody(parsed.data.body),
      kind: parsed.data.kind ?? "normal",
      file: file
        ? { buffer: file.buffer, mime: file.mimetype.toLowerCase(), name: safeFileName(file.originalname, file.mimetype) }
        : null,
    });
    return res.status(201).json({ message });
  } catch (error) {
    return fail(res, error, "send");
  }
});

router.post("/api/duty-chat/thread/:peerId/read", ...base, async (req, res) => {
  try {
    return res.json({ updated: await markRead(userIdOf(req)!, req.params.peerId) });
  } catch (error) {
    return fail(res, error, "read");
  }
});

router.post("/api/duty-chat/thread/:peerId/typing", ...base, async (req, res) => {
  try {
    await sendTyping(userIdOf(req)!, req.params.peerId);
    return res.status(204).end();
  } catch (error) {
    return fail(res, error, "typing");
  }
});

router.post("/api/duty-chat/delivered", ...base, async (req, res) => {
  try {
    return res.json({ updated: await markDelivered(userIdOf(req)!) });
  } catch (error) {
    return fail(res, error, "delivered");
  }
});

// إشعار «مكتب سبق» بديلًا حين لا يستطيع المتصفح عرض الإشعار (انظر DutyChatNotifier).
router.post("/api/duty-chat/messages/:id/push-fallback", ...base, async (req, res) => {
  try {
    return res.json({ sent: await pushFallback(userIdOf(req)!, req.params.id) });
  } catch (error) {
    return fail(res, error, "push-fallback");
  }
});

router.post("/api/duty-chat/messages/:id/ack", ...base, async (req, res) => {
  try {
    return res.json({ message: await ackMessage(userIdOf(req)!, req.params.id) });
  } catch (error) {
    return fail(res, error, "ack");
  }
});

router.get("/api/duty-chat/attachments/:id", ...base, async (req, res) => {
  try {
    const file = await getAttachment(userIdOf(req)!, req.params.id);
    if (!file) return res.status(404).json({ message: "المرفق غير موجود" });
    const upstream = await fetch(file.signedUrl, { signal: AbortSignal.timeout(20_000) });
    if (!upstream.ok) return res.status(502).json({ message: "تعذر جلب المرفق من التخزين" });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", file.mime);
    res.setHeader("X-Content-Type-Options", "nosniff");
    const disposition = file.mime.startsWith("image/") && req.query.download !== "1" ? "inline" : "attachment";
    res.setHeader("Content-Disposition", `${disposition}; filename="file"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    return res.send(buffer);
  } catch (error) {
    return fail(res, error, "attachment");
  }
});

// قناة البث: رسائل وحالات وكتابة. كل نبضة تحدّث «آخر ظهور».
router.get("/api/duty-chat/stream", isAuthenticated, eligible, async (req, res) => {
  const me = userIdOf(req)!;
  try {
    await touchPresence(me);
  } catch (error) {
    return fail(res, error, "stream");
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "private, no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: connected\ndata: {}\n\n`);

  const unsubscribe = subscribeDutyChat(me, (event) => {
    const payload = event.type === "message"
      ? { ...event, message: { ...event.message, mine: event.message.senderId === me } }
      : event;
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`);
  });
  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
    touchPresence(me).catch(() => {});
  }, DUTY_CHAT_HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
