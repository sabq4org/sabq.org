// ----------------------------------------------------------------------------
// «أمين المحضر» — مسارات التفريغ والمحضر (ADR-001: البيانات في الخدمة)
//
// مساران داخليان لعامل التفريغ (توثيق بسر مشترك MEETINGS_AGENT_SECRET في
// ترويسة x-agent-secret)، والبقية للمضيف والمشاركين عبر جلسة اللوحة.
// سياسة الاطلاع: التفريغ الخام للمضيف فقط؛ المحضر المعتمد لكل مشارك مؤهل.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from "express";
import { isAuthenticated } from "../auth";
import { userHasPermission } from "../rbac";
import type { Meeting, MeetingMinutes } from "@shared/schema";
import {
  getMeeting,
  isUserEligible,
} from "../services/meetingsService";
import {
  approveAndDistributeMinutes,
  cleanupOldTranscripts,
  generateMinutes,
  getTranscript,
  getTranscriptStats,
  ingestTranscriptSegments,
  updateDraftMinutes,
  verifyAgentSecret,
} from "../services/meetingMinutesService";

const router = Router();

async function hasManage(req: Request): Promise<boolean> {
  const user = req.user as { id: string } | undefined;
  if (!user) return false;
  return userHasPermission(user.id, "meetings.manage");
}

async function loadAsHost(req: Request, res: Response): Promise<Meeting | null> {
  const userId = (req.user as { id: string }).id;
  const meeting = await getMeeting(req.params.id);
  if (!meeting) {
    res.status(404).json({ message: "الاجتماع غير موجود" });
    return null;
  }
  if (meeting.hostUserId !== userId && !(await hasManage(req))) {
    res.status(403).json({ message: "هذا الإجراء للمضيف فقط" });
    return null;
  }
  return meeting;
}

// ────────────────────────────────────────────────────────────────────
// المسارات الداخلية — عامل التفريغ
// ────────────────────────────────────────────────────────────────────

function requireAgentSecret(req: Request, res: Response, next: () => void) {
  if (!verifyAgentSecret(req.headers["x-agent-secret"] as string | undefined)) {
    return res.status(401).json({ message: "unauthorized" });
  }
  next();
}

// دفعة مقاطع تفريغ من العامل أثناء الاجتماع
router.post(
  "/api/internal/meetings-agent/:id/transcripts",
  requireAgentSecret,
  async (req: Request, res: Response) => {
    try {
      const meeting = await getMeeting(req.params.id);
      if (!meeting || !meeting.minutesEnabled) {
        return res.status(404).json({ message: "not found" });
      }
      const segments = Array.isArray(req.body?.segments) ? req.body.segments : [];
      const inserted = await ingestTranscriptSegments(meeting.id, segments);
      res.json({ ok: true, inserted });
    } catch (error) {
      console.error("[Minutes] ingest error:", error);
      res.status(500).json({ message: "server error" });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
// مسارات اللوحة
// ────────────────────────────────────────────────────────────────────

// حالة المحضر ومحتواه — المضيف يرى المسودة، والمشارك المؤهل يرى المعتمد فقط
router.get(
  "/api/meetings/:id/minutes",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as { id: string }).id;
      const meeting = await getMeeting(req.params.id);
      if (!meeting) return res.status(404).json({ message: "الاجتماع غير موجود" });

      const canManage = await hasManage(req);
      const isHost = meeting.hostUserId === userId || canManage;
      if (!isHost && !(await isUserEligible(meeting, userId, canManage))) {
        return res.status(403).json({ message: "غير مصرح" });
      }

      const showMinutes = isHost || meeting.minutesStatus === "approved";
      const stats = isHost && meeting.minutesEnabled
        ? await getTranscriptStats(meeting.id)
        : undefined;
      void cleanupOldTranscripts();

      res.json({
        minutesEnabled: meeting.minutesEnabled,
        minutesStatus: meeting.minutesStatus,
        minutes: showMinutes ? meeting.minutes : null,
        minutesGeneratedAt: meeting.minutesGeneratedAt,
        minutesApprovedAt: meeting.minutesApprovedAt,
        isHost,
        stats,
      });
    } catch (error) {
      console.error("[Minutes] get error:", error);
      res.status(500).json({ message: "تعذر جلب المحضر" });
    }
  },
);

// التفريغ الخام — للمضيف فقط
router.get(
  "/api/meetings/:id/transcript",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const meeting = await loadAsHost(req, res);
      if (!meeting) return;
      const rows = await getTranscript(meeting.id);
      res.json({
        segments: rows.map((r) => ({
          speakerName: r.speakerName,
          text: r.text,
          startMs: r.startMs,
        })),
      });
    } catch (error) {
      console.error("[Minutes] transcript error:", error);
      res.status(500).json({ message: "تعذر جلب التفريغ" });
    }
  },
);

// إعادة توليد المحضر (بعد فشل أو لتحسين النتيجة قبل الاعتماد)
router.post(
  "/api/meetings/:id/minutes/regenerate",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const meeting = await loadAsHost(req, res);
      if (!meeting) return;
      if (meeting.status !== "ended") {
        return res.status(409).json({ message: "المحضر يولَّد بعد انتهاء الاجتماع" });
      }
      if (meeting.minutesStatus === "approved") {
        return res.status(409).json({ message: "المحضر معتمد — لا يعاد توليده" });
      }
      const minutes = await generateMinutes(meeting.id);
      if (!minutes) {
        return res.status(422).json({ message: "لا يوجد تفريغ كافٍ لتوليد المحضر" });
      }
      res.json({ ok: true, minutes });
    } catch (error) {
      console.error("[Minutes] regenerate error:", error);
      res.status(500).json({ message: "تعذر توليد المحضر" });
    }
  },
);

// تحرير المسودة قبل الاعتماد
router.patch(
  "/api/meetings/:id/minutes",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const meeting = await loadAsHost(req, res);
      if (!meeting) return;
      if (meeting.minutesStatus !== "draft") {
        return res.status(409).json({ message: "لا توجد مسودة قابلة للتحرير" });
      }
      const body = req.body || {};
      const minutes: MeetingMinutes = {
        summary: String(body.summary || "").slice(0, 8000),
        decisions: Array.isArray(body.decisions)
          ? body.decisions.map(String).filter(Boolean).slice(0, 50)
          : [],
        actionItems: Array.isArray(body.actionItems)
          ? body.actionItems
              .map((a: any) => ({
                task: String(a?.task || "").slice(0, 1000),
                owner: a?.owner ? String(a.owner).slice(0, 200) : null,
                due: a?.due ? String(a.due).slice(0, 200) : null,
              }))
              .filter((a: { task: string }) => a.task)
              .slice(0, 100)
          : [],
        deferred: Array.isArray(body.deferred)
          ? body.deferred.map(String).filter(Boolean).slice(0, 50)
          : [],
      };
      await updateDraftMinutes(meeting.id, minutes);
      res.json({ ok: true });
    } catch (error) {
      console.error("[Minutes] update error:", error);
      res.status(500).json({ message: "تعذر حفظ التعديلات" });
    }
  },
);

// اعتماد المحضر وتوزيعه بالبريد على المشاركين
router.post(
  "/api/meetings/:id/minutes/approve",
  isAuthenticated,
  async (req: Request, res: Response) => {
    try {
      const meeting = await loadAsHost(req, res);
      if (!meeting) return;
      if (meeting.minutesStatus !== "draft" || !meeting.minutes) {
        return res.status(409).json({ message: "لا توجد مسودة جاهزة للاعتماد" });
      }
      const sent = await approveAndDistributeMinutes(meeting);
      res.json({ ok: true, emailsSent: sent });
    } catch (error) {
      console.error("[Minutes] approve error:", error);
      res.status(500).json({ message: "تعذر اعتماد المحضر" });
    }
  },
);

export default router;
