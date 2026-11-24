// فرصة تغيير الموعد الأسبوعي لكاتب الرأي: الإدارة تفتحها وتغلقها، والكاتب يستخدمها مرة.
// ADR-001: لا وصول لقاعدة البيانات هنا — الاستعلامات في opinionSlotChangeService.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { SLOT_CHANGE_DURATION_DAYS } from "@shared/opinionSlotChange";
import { requireAuth, requirePermission, userHasAnyRole, logActivity } from "../rbac";
import {
  applyWriterSlotChange,
  closeSlotChangeRound,
  getSlotChangeAdminSummary,
  getWriterSlotChangeState,
  openSlotChangeRound,
} from "../services/opinionSlotChangeService";

const router = Router();

const requestUserId = (req: Request) => (req.user as { id: string }).id;

// ── جهة الكاتب ──

router.get("/api/opinion-author/slot-change", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = requestUserId(req);
    if (!(await userHasAnyRole(userId, ["opinion_author"]))) {
      return res.status(403).json({ message: "هذه المساحة خاصة بكتّاب الرأي" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await getWriterSlotChangeState(userId));
  } catch (error) {
    console.error("[opinion-slot-change] state failed:", error);
    res.status(500).json({ message: "تعذر جلب فرصة تغيير الموعد" });
  }
});

const applySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  acceptedTerms: z.literal(true),
});

router.post("/api/opinion-author/slot-change", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = requestUserId(req);
    if (!(await userHasAnyRole(userId, ["opinion_author"]))) {
      return res.status(403).json({ message: "هذه المساحة خاصة بكتّاب الرأي" });
    }
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "اختر يومًا ووقتًا ووافق على الإيضاحات" });
    }
    const result = await applyWriterSlotChange(userId, parsed.data);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    void logActivity({
      userId,
      action: "opinion_writer_slot_changed",
      entityType: "opinion_writer_schedule",
      entityId: userId,
      oldValue: result.from,
      newValue: result.to,
      metadata: { roundId: result.roundId, termsAccepted: true },
    }).catch(() => undefined);
    res.json({ ok: true, from: result.from, to: result.to });
  } catch (error) {
    console.error("[opinion-slot-change] apply failed:", error);
    res.status(500).json({ message: "تعذر حفظ الموعد الجديد" });
  }
});

// ── جهة الإدارة ──

router.get(
  "/api/admin/opinion-writers/slot-change",
  requireAuth,
  requirePermission(PERMISSION_CODES.OPINION_REVIEW),
  async (_req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      res.json(await getSlotChangeAdminSummary());
    } catch (error) {
      console.error("[opinion-slot-change] summary failed:", error);
      res.status(500).json({ message: "تعذر جلب فرصة تغيير الموعد" });
    }
  },
);

const openSchema = z.object({
  days: z
    .number()
    .int()
    .refine((d) => (SLOT_CHANGE_DURATION_DAYS as readonly number[]).includes(d))
    .nullable(),
  note: z.string().trim().max(300).nullable().optional(),
});

router.post(
  "/api/admin/opinion-writers/slot-change/open",
  requireAuth,
  requirePermission(PERMISSION_CODES.OPINION_REVIEW),
  async (req: Request, res: Response) => {
    try {
      const parsed = openSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "مدة الفرصة غير صالحة" });
      const adminId = requestUserId(req);
      const round = await openSlotChangeRound(adminId, { days: parsed.data.days, note: parsed.data.note || null });
      void logActivity({
        userId: adminId,
        action: "opinion_slot_change_opened",
        entityType: "opinion_slot_change_round",
        entityId: round.id,
        newValue: { closesAt: round.closesAt, note: round.note },
      }).catch(() => undefined);
      res.json({ round });
    } catch (error) {
      console.error("[opinion-slot-change] open failed:", error);
      res.status(500).json({ message: "تعذر فتح فرصة تغيير الموعد" });
    }
  },
);

router.post(
  "/api/admin/opinion-writers/slot-change/close",
  requireAuth,
  requirePermission(PERMISSION_CODES.OPINION_REVIEW),
  async (req: Request, res: Response) => {
    try {
      const adminId = requestUserId(req);
      const closed = await closeSlotChangeRound(adminId);
      void logActivity({
        userId: adminId,
        action: "opinion_slot_change_closed",
        entityType: "opinion_slot_change_round",
        entityId: "current",
        metadata: { closed },
      }).catch(() => undefined);
      res.json({ ok: true, closed });
    } catch (error) {
      console.error("[opinion-slot-change] close failed:", error);
      res.status(500).json({ message: "تعذر إغلاق الفرصة" });
    }
  },
);

export default router;
