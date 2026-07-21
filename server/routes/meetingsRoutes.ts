// ----------------------------------------------------------------------------
// اجتماعات سبق — مسارات لوحة التحكم /api/meetings/*
//
// البوابة: صلاحيات meetings.view / meetings.create / meetings.manage
// (admin يمر عبر superuser shortcut في getUserPermissions). لا استيراد db
// هنا (ADR-001) — كل البيانات عبر meetingsService.
//
// مسارات invite/* عامة عمداً (رابط الدعوة يصل لضيوف بلا حسابات) — الضيف
// يمر إجبارياً بغرفة الانتظار ولا يستلم تذكرة إلا بعد موافقة المضيف.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { getUserPermissions } from "../rbac";
import {
  createMeeting,
  endMeeting,
  getMeeting,
  getMeetingByInviteToken,
  getMeetingFormOptions,
  getRequestStatus,
  getRoster,
  isMeetingsConfigured,
  isUserEligible,
  listMeetingsForUser,
  markParticipantLeft,
  meetingsDisabledMessage,
  muteParticipantMic,
  removeParticipantFromRoom,
  requestGuestJoin,
  requestJoin,
  resolveJoinRequest,
  setMeetingLocked,
  subscribeMeetingEvents,
} from "../services/meetingsService";
import type { Meeting as MeetingRow } from "@shared/schema";

const router = Router();

// ────────────────────────────────────────────────────────────────────
// أدوات الصلاحيات (نفس نمط staffProfiles)
// ────────────────────────────────────────────────────────────────────

async function userPerms(req: Request): Promise<string[]> {
  const user = req.user as { id: string } | undefined;
  if (!user) return [];
  return getUserPermissions(user.id);
}

function can(perms: string[], code: string): boolean {
  return perms.includes(code) || perms.includes("*");
}

function requirePermission(code: string) {
  return async (req: Request, res: Response, next: () => void) => {
    const perms = await userPerms(req);
    if (!(req.user as { id: string } | undefined)) {
      return res.status(401).json({ message: "غير مصرح" });
    }
    if (can(perms, code) || can(perms, "meetings.manage")) return next();
    return res.status(403).json({ message: "لا تملك صلاحية الوصول للاجتماعات" });
  };
}

function requireConfigured(_req: Request, res: Response, next: () => void) {
  if (!isMeetingsConfigured()) {
    return res.status(503).json({ message: meetingsDisabledMessage() });
  }
  next();
}

/** يجلب الاجتماع ويتحقق أن المستخدم مضيفه (أو يملك meetings.manage) */
async function loadMeetingAsHost(
  req: Request,
  res: Response,
): Promise<{ meeting: MeetingRow; userId: string } | null> {
  const userId = (req.user as { id: string }).id;
  const meeting = await getMeeting(req.params.id);
  if (!meeting) {
    res.status(404).json({ message: "الاجتماع غير موجود" });
    return null;
  }
  const perms = await userPerms(req);
  if (meeting.hostUserId !== userId && !can(perms, "meetings.manage")) {
    res.status(403).json({ message: "هذا الإجراء للمضيف فقط" });
    return null;
  }
  return { meeting, userId };
}

// ────────────────────────────────────────────────────────────────────
// رابط الدعوة — مسارات عامة (تُسجَّل قبل /:id حتى لا تُلتقط كمعرّف)
// ────────────────────────────────────────────────────────────────────

router.get("/api/meetings/invite/:token", requireConfigured, async (req, res) => {
  try {
    const meeting = await getMeetingByInviteToken(req.params.token);
    if (!meeting || meeting.status === "cancelled") {
      return res.status(404).json({ message: "رابط الدعوة غير صالح" });
    }
    const authedUserId = (req.user as { id: string } | undefined)?.id ?? null;
    res.json({
      meetingId: meeting.id,
      title: meeting.title,
      description: meeting.description,
      status: meeting.status,
      scheduledAt: meeting.scheduledAt,
      isLocked: meeting.isLocked,
      isAuthenticated: Boolean(authedUserId),
    });
  } catch (error) {
    console.error("[Meetings] invite info error:", error);
    res.status(500).json({ message: "تعذر جلب بيانات الدعوة" });
  }
});

const guestJoinSchema = z.object({
  guestName: z.string().trim().min(2, "الاسم قصير").max(60).optional(),
});

router.post("/api/meetings/invite/:token/join", requireConfigured, async (req, res) => {
  try {
    const meeting = await getMeetingByInviteToken(req.params.token);
    if (!meeting) return res.status(404).json({ message: "رابط الدعوة غير صالح" });

    const authedUser = req.user as { id: string } | undefined;
    if (authedUser) {
      // منسوب مسجَّل وصل عبر الرابط: يدخل بهويته الحقيقية (بموافقة المضيف إن كانت مفعّلة)
      const perms = await userPerms(req);
      const result = await requestJoin(meeting, authedUser.id, can(perms, "meetings.manage"));
      if ("error" in result) return res.status(result.code).json({ message: result.error });
      return res.json(result);
    }

    const parsed = guestJoinSchema.safeParse(req.body);
    if (!parsed.success || !parsed.data.guestName) {
      return res.status(400).json({ message: "اكتب اسمك للانضمام كضيف" });
    }
    const result = await requestGuestJoin(meeting, parsed.data.guestName);
    if ("error" in result) return res.status(result.code).json({ message: result.error });
    res.json(result);
  } catch (error) {
    console.error("[Meetings] invite join error:", error);
    res.status(500).json({ message: "تعذر الانضمام" });
  }
});

// المنتظِر (منسوباً أو ضيفاً) يستطلع قرار المضيف — الضيف يثبت ملكيته بمفتاحه
router.get("/api/meetings/invite/:token/status", requireConfigured, async (req, res) => {
  try {
    const meeting = await getMeetingByInviteToken(req.params.token);
    if (!meeting) return res.status(404).json({ message: "رابط الدعوة غير صالح" });
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      return res.json({ status: "ended" });
    }
    const participantId = String(req.query.participantId || "");
    const guestKey = req.query.guestKey ? String(req.query.guestKey) : undefined;
    const userId = (req.user as { id: string } | undefined)?.id;
    if (!participantId) return res.status(400).json({ message: "طلب غير مكتمل" });
    const status = await getRequestStatus(meeting, participantId, { userId, guestKey });
    if (!status) return res.status(404).json({ message: "الطلب غير موجود" });
    res.json(status);
  } catch (error) {
    console.error("[Meetings] invite status error:", error);
    res.status(500).json({ message: "تعذر جلب حالة الطلب" });
  }
});

// ────────────────────────────────────────────────────────────────────
// مركز الاجتماعات
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/meetings",
  isAuthenticated,
  requirePermission("meetings.view"),
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      const perms = await userPerms(req);
      const lists = await listMeetingsForUser(userId, can(perms, "meetings.manage"));
      res.json({ ...lists, configured: isMeetingsConfigured() });
    } catch (error) {
      console.error("[Meetings] list error:", error);
      res.status(500).json({ message: "تعذر جلب الاجتماعات" });
    }
  },
);

router.get(
  "/api/meetings/form-options",
  isAuthenticated,
  requirePermission("meetings.create"),
  async (_req: Request, res: Response) => {
    try {
      res.json(await getMeetingFormOptions());
    } catch (error) {
      console.error("[Meetings] form options error:", error);
      res.status(500).json({ message: "تعذر جلب القوائم" });
    }
  },
);

const createMeetingSchema = z
  .object({
    title: z.string().trim().min(3, "العنوان قصير").max(120),
    description: z.string().trim().max(500).optional(),
    accessType: z.enum(["all", "department", "selected", "link"]),
    departmentId: z.string().optional(),
    memberIds: z.array(z.string()).max(200).optional(),
    requireApproval: z.boolean().default(true),
    muteOnJoin: z.boolean().default(true),
    scheduledAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => v.accessType !== "department" || Boolean(v.departmentId), {
    message: "اختر الإدارة المستهدفة",
  })
  .refine((v) => v.accessType !== "selected" || (v.memberIds?.length ?? 0) > 0, {
    message: "اختر عضواً واحداً على الأقل",
  });

router.post(
  "/api/meetings",
  isAuthenticated,
  requireConfigured,
  requirePermission("meetings.create"),
  async (req: Request, res: Response) => {
    try {
      const parsed = createMeetingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "بيانات غير صالحة" });
      }
      const userId = (req.user as { id: string }).id;
      const meeting = await createMeeting(userId, parsed.data);
      res.status(201).json(meeting);
    } catch (error) {
      console.error("[Meetings] create error:", error);
      res.status(500).json({ message: "تعذر إنشاء الاجتماع" });
    }
  },
);

router.get(
  "/api/meetings/:id",
  isAuthenticated,
  requirePermission("meetings.view"),
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      const meeting = await getMeeting(req.params.id);
      if (!meeting) return res.status(404).json({ message: "الاجتماع غير موجود" });
      const perms = await userPerms(req);
      const canManage = can(perms, "meetings.manage");
      if (!(await isUserEligible(meeting, userId, canManage))) {
        return res.status(403).json({ message: "هذا الاجتماع غير متاح لك" });
      }
      const isHost = meeting.hostUserId === userId || canManage;
      res.json({
        ...meeting,
        inviteToken: isHost ? meeting.inviteToken : null,
        isHost,
      });
    } catch (error) {
      console.error("[Meetings] get error:", error);
      res.status(500).json({ message: "تعذر جلب الاجتماع" });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
// الانضمام والمغادرة
// ────────────────────────────────────────────────────────────────────

router.post(
  "/api/meetings/:id/join",
  isAuthenticated,
  requireConfigured,
  requirePermission("meetings.view"),
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      const meeting = await getMeeting(req.params.id);
      if (!meeting) return res.status(404).json({ message: "الاجتماع غير موجود" });
      const perms = await userPerms(req);
      const canManage = can(perms, "meetings.manage");
      if (!(await isUserEligible(meeting, userId, canManage))) {
        return res.status(403).json({ message: "هذا الاجتماع غير متاح لك" });
      }
      const result = await requestJoin(meeting, userId, canManage);
      if ("error" in result) return res.status(result.code).json({ message: result.error });
      res.json(result);
    } catch (error) {
      console.error("[Meetings] join error:", error);
      res.status(500).json({ message: "تعذر الانضمام للاجتماع" });
    }
  },
);

router.post(
  "/api/meetings/:id/leave",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      await markParticipantLeft(req.params.id, userId);
      res.json({ ok: true });
    } catch (error) {
      console.error("[Meetings] leave error:", error);
      res.status(500).json({ message: "تعذر تسجيل المغادرة" });
    }
  },
);

// حالة طلب الانتظار للمنسوب المسجَّل (استطلاع احتياطي إن انقطع SSE)
router.get(
  "/api/meetings/:id/my-request",
  isAuthenticated,
  requireConfigured,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      const meeting = await getMeeting(req.params.id);
      if (!meeting) return res.status(404).json({ message: "الاجتماع غير موجود" });
      if (meeting.status !== "live") return res.json({ status: meeting.status === "ended" ? "ended" : "waiting" });
      const participantId = String(req.query.participantId || "");
      if (!participantId) return res.status(400).json({ message: "طلب غير مكتمل" });
      const status = await getRequestStatus(meeting, participantId, { userId });
      if (!status) return res.status(404).json({ message: "الطلب غير موجود" });
      res.json(status);
    } catch (error) {
      console.error("[Meetings] my-request error:", error);
      res.status(500).json({ message: "تعذر جلب حالة الطلب" });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
// قائمة المشاركين وطلبات الانتظار
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/meetings/:id/participants",
  isAuthenticated,
  requirePermission("meetings.view"),
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      const meeting = await getMeeting(req.params.id);
      if (!meeting) return res.status(404).json({ message: "الاجتماع غير موجود" });
      const perms = await userPerms(req);
      const canManage = can(perms, "meetings.manage");
      if (!(await isUserEligible(meeting, userId, canManage))) {
        return res.status(403).json({ message: "هذا الاجتماع غير متاح لك" });
      }
      const isHost = meeting.hostUserId === userId || canManage;
      // طلبات الانتظار تظهر للمضيف فقط
      const roster = await getRoster(meeting, isHost);
      res.json({ roster, isHost });
    } catch (error) {
      console.error("[Meetings] participants error:", error);
      res.status(500).json({ message: "تعذر جلب المشاركين" });
    }
  },
);

router.post(
  "/api/meetings/:id/requests/:participantId",
  isAuthenticated,
  requireConfigured,
  async (req: Request, res: Response) => {
    try {
      const loaded = await loadMeetingAsHost(req, res);
      if (!loaded) return;
      const action = String(req.body?.action || "");
      if (action !== "approve" && action !== "deny") {
        return res.status(400).json({ message: "إجراء غير معروف" });
      }
      const p = await resolveJoinRequest(
        loaded.meeting,
        req.params.participantId,
        action === "approve",
        loaded.userId,
      );
      if (!p) return res.status(404).json({ message: "الطلب غير موجود أو حُسم مسبقاً" });
      res.json({ ok: true, status: p.status });
    } catch (error) {
      console.error("[Meetings] resolve request error:", error);
      res.status(500).json({ message: "تعذر حسم الطلب" });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
// أدوات المضيف
// ────────────────────────────────────────────────────────────────────

router.post(
  "/api/meetings/:id/participants/:participantId/remove",
  isAuthenticated,
  requireConfigured,
  async (req: Request, res: Response) => {
    try {
      const loaded = await loadMeetingAsHost(req, res);
      if (!loaded) return;
      const ok = await removeParticipantFromRoom(loaded.meeting, req.params.participantId, loaded.userId);
      if (!ok) return res.status(404).json({ message: "المشارك غير موجود" });
      res.json({ ok: true });
    } catch (error) {
      console.error("[Meetings] remove participant error:", error);
      res.status(500).json({ message: "تعذر إخراج المشارك" });
    }
  },
);

router.post(
  "/api/meetings/:id/participants/mute",
  isAuthenticated,
  requireConfigured,
  async (req: Request, res: Response) => {
    try {
      const loaded = await loadMeetingAsHost(req, res);
      if (!loaded) return;
      const identity = String(req.body?.identity || "");
      if (!identity) return res.status(400).json({ message: "طلب غير مكتمل" });
      const ok = await muteParticipantMic(loaded.meeting, identity, loaded.userId);
      res.json({ ok });
    } catch (error) {
      console.error("[Meetings] mute error:", error);
      res.status(500).json({ message: "تعذر كتم المشارك" });
    }
  },
);

router.post(
  "/api/meetings/:id/lock",
  isAuthenticated,
  requireConfigured,
  async (req: Request, res: Response) => {
    try {
      const loaded = await loadMeetingAsHost(req, res);
      if (!loaded) return;
      const locked = Boolean(req.body?.locked);
      await setMeetingLocked(loaded.meeting, locked, loaded.userId);
      res.json({ ok: true, locked });
    } catch (error) {
      console.error("[Meetings] lock error:", error);
      res.status(500).json({ message: "تعذر تغيير قفل الغرفة" });
    }
  },
);

router.post(
  "/api/meetings/:id/end",
  isAuthenticated,
  requireConfigured,
  async (req: Request, res: Response) => {
    try {
      const loaded = await loadMeetingAsHost(req, res);
      if (!loaded) return;
      await endMeeting(loaded.meeting, loaded.userId);
      res.json({ ok: true });
    } catch (error) {
      console.error("[Meetings] end error:", error);
      res.status(500).json({ message: "تعذر إنهاء الاجتماع" });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
// قناة الأحداث اللحظية (SSE) — طلبات الانتظار، القرارات، حالة الاجتماع
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/meetings/:id/events",
  isAuthenticated,
  requirePermission("meetings.view"),
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      const meeting = await getMeeting(req.params.id);
      if (!meeting) return res.status(404).json({ message: "الاجتماع غير موجود" });
      const perms = await userPerms(req);
      const canManage = can(perms, "meetings.manage");
      if (!(await isUserEligible(meeting, userId, canManage))) {
        return res.status(403).json({ message: "هذا الاجتماع غير متاح لك" });
      }
      const isHost = meeting.hostUserId === userId || canManage;

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(`event: connected\ndata: {}\n\n`);

      const unsubscribe = subscribeMeetingEvents(meeting.id, (event) => {
        // تفاصيل طلبات الانتظار للمضيف فقط؛ البقية تكفيهم أحداث الحالة العامة
        if (event.type === "join_requested" && !isHost) return;
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload || {})}\n\n`);
      });

      const heartbeat = setInterval(() => {
        res.write(`: ping\n\n`);
      }, 25_000);

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (error) {
      console.error("[Meetings] SSE error:", error);
      if (!res.headersSent) res.status(500).json({ message: "تعذر فتح قناة الأحداث" });
    }
  },
);

export default router;
