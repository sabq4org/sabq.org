// ----------------------------------------------------------------------------
// «عين المناوبة» — مسارات قراءة للبوت تحت /api/internal/bot-desk/duty/* (Bearer botpub_*):
//   GET /api/internal/bot-desk/duty/alerts?after=<id>&limit=   سجل التنبيهات بمؤشر (الاستدراك إن فات الدفع)
//   GET /api/internal/bot-desk/duty/alerts/:id                 تنبيه واحد
//   GET /api/internal/bot-desk/duty/now                        المناوبة الآن (getDutyCard)
//   GET /api/internal/bot-desk/duty/shifts/:key                تقرير وردية (getDutyRoom)؛ key = <shiftId>:<YYYY-MM-DD>:<userId>
//   GET /api/internal/bot-desk/duty/team                       أداء آخر 7 أيام (getDutyTeam)
// الصلاحية: مالك التوكن مسؤول (superuser) أو يملك content_duty.monitor، وإلا 403.
// قراءة فقط: لا تعديل للجدول ولا الإعدادات ولا التنبيهات. التوثيق: docs/systems/editorial/BOT_DESK_API.md
// ----------------------------------------------------------------------------
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { BOT_DESK_BASE_PATH, type BotDeskErrorBody } from "@shared/botDesk";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import type { BotPublisherPrincipal } from "@shared/botPublisherTokens";
import { userHasPermission } from "../rbac";
import { requireBotDeskAuth } from "./botDesk";
import { getDutyCard, getDutyRoom, getDutyTeam, type DutyViewer } from "../services/contentDuty/dutyMetricsService";
import { ContentDutyNotReadyError } from "../services/contentDuty/dutyRosterStore";
import { DutyAlertsNotReadyError, getDutyAlert, listDutyAlerts } from "../services/contentDuty/dutyBotService";

const router = Router();
const BASE = `${BOT_DESK_BASE_PATH}/duty`;

type DutyRequest = Request & { botPrincipal?: BotPublisherPrincipal };

function sendError(res: Response, status: number, body: BotDeskErrorBody): void {
  res.status(status).json(body);
}

/** superuser أو content_duty.monitor (userHasPermission يمرر المسؤول عبر "*"). */
export async function requireDutyMonitor(req: DutyRequest, res: Response, next: NextFunction) {
  try {
    const principal = req.botPrincipal;
    if (!principal) return sendError(res, 401, { code: "unauthorized", message: "Unauthorized" });
    if (!(await userHasPermission(principal.userId, PERMISSION_CODES.CONTENT_DUTY_MONITOR))) {
      return sendError(res, 403, {
        code: "forbidden",
        message: "لا تملك صلاحية متابعة المناوبات",
        details: { required: "superuser_or_content_duty.monitor" },
      });
    }
    return next();
  } catch (error) {
    console.error("[BotDesk duty] RBAC check failed:", error);
    return sendError(res, 500, { code: "server_error", message: "خطأ داخلي" });
  }
}

/** البوت يرى كل الأرقام كالمسؤول (قراءة فقط). */
const viewerOf = (req: DutyRequest): DutyViewer => ({ userId: req.botPrincipal!.userId, access: "lead" });

function fail(res: Response, error: unknown, label: string) {
  if (error instanceof ContentDutyNotReadyError) {
    return sendError(res, 503, { code: "content_duty_not_ready", message: "جدول المناوبات غير مفعّل بعد" });
  }
  if (error instanceof DutyAlertsNotReadyError) {
    return sendError(res, 503, { code: "duty_alerts_not_ready", message: "سجل تنبيهات المناوبة غير مفعّل بعد" });
  }
  console.error(`[BotDesk duty] ${label} failed`);
  return sendError(res, 500, { code: "server_error", message: "تعذر تحميل المناوبات" });
}

const alertsQuery = z.object({
  after: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get(`${BASE}/alerts`, requireBotDeskAuth, requireDutyMonitor, async (req: DutyRequest, res: Response) => {
  const parsed = alertsQuery.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 400, { code: "validation_error", message: "after وlimit أرقام صحيحة (limit من 1 إلى 200)" });
  }
  try {
    return res.json(await listDutyAlerts(parsed.data.after, parsed.data.limit));
  } catch (error) {
    return fail(res, error, "alerts");
  }
});

router.get(`${BASE}/alerts/:id`, requireBotDeskAuth, requireDutyMonitor, async (req: DutyRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return sendError(res, 400, { code: "validation_error", message: "معرف غير صالح" });
  try {
    const alert = await getDutyAlert(id);
    return alert ? res.json({ alert }) : sendError(res, 404, { code: "not_found", message: "التنبيه غير موجود" });
  } catch (error) {
    return fail(res, error, "alert");
  }
});

router.get(`${BASE}/now`, requireBotDeskAuth, requireDutyMonitor, async (req: DutyRequest, res: Response) => {
  try {
    return res.json(await getDutyCard(viewerOf(req)));
  } catch (error) {
    return fail(res, error, "now");
  }
});

router.get(`${BASE}/shifts/:key`, requireBotDeskAuth, requireDutyMonitor, async (req: DutyRequest, res: Response) => {
  const key = String(req.params.key ?? "").slice(0, 200);
  if (!/^[^:\s]+:\d{4}-\d{2}-\d{2}:[^:\s]+$/.test(key)) {
    return sendError(res, 400, { code: "validation_error", message: "المفتاح بصيغة <shiftId>:<YYYY-MM-DD>:<userId>" });
  }
  try {
    const room = await getDutyRoom(viewerOf(req), key);
    // getDutyRoom يرجع الوردية الجارية إن لم يجد المطلوبة؛ للبوت نطلب المطابقة الدقيقة.
    if (!room.shift || room.shift.key !== key) {
      return sendError(res, 404, { code: "not_found", message: "الوردية غير موجودة ضمن آخر 14 يومًا" });
    }
    return res.json(room);
  } catch (error) {
    return fail(res, error, "shift");
  }
});

router.get(`${BASE}/team`, requireBotDeskAuth, requireDutyMonitor, async (req: DutyRequest, res: Response) => {
  try {
    return res.json(await getDutyTeam(viewerOf(req)));
  } catch (error) {
    return fail(res, error, "team");
  }
});

export default router;
