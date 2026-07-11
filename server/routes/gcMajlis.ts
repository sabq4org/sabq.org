/**
 * «مجالس التوقعات» — مسارات HTTP (كلها requireAuth، خلف علم المسابقة نفسه).
 *
 *   POST   /api/gulf-cup/majlis                    إنشاء مجلس {name} → {id, code}
 *   POST   /api/gulf-cup/majlis/join               انضمام برمز {code}
 *   GET    /api/gulf-cup/majlis/mine               مجالسي
 *   GET    /api/gulf-cup/majlis/:id/leaderboard    ترتيب مجلس (أعضاؤه فقط)
 *   DELETE /api/gulf-cup/majlis/:id                مغادرة (عضو) أو حذف (مالك)
 *
 * ADR-001: كل استعلامات Drizzle في gcMajlisService — هذا المسار لا يستورد db.
 */
import { Router } from "express";
import { requireAuth } from "../rbac";
import { isGcPredictionsEnabled } from "../services/gcPredictionsService";
import {
  createMajlis,
  getMajlisLeaderboard,
  getMyMajalis,
  joinMajlis,
  leaveMajlis,
} from "../services/gcMajlisService";

const router = Router();

const REASON_MESSAGES: Record<string, { status: number; message: string }> = {
  INVALID_NAME: { status: 400, message: "اسم المجلس بين حرفين و60 حرفًا" },
  INVALID_CODE: { status: 400, message: "رمز الدعوة غير صالح" },
  NOT_FOUND: { status: 404, message: "المجلس غير موجود — تأكد من الرمز" },
  NOT_MEMBER: { status: 403, message: "هذا المجلس لأعضائه فقط" },
  FULL: { status: 409, message: "اكتمل المجلس (50 عضوًا) — أنشئوا مجلسًا ثانيًا" },
  LIMIT_OWNED: { status: 409, message: "بلغت حدّ 5 مجالس — احذف واحدًا لتنشئ غيره" },
  CODE_COLLISION: { status: 500, message: "تعذّر توليد رمز — حاول مجددًا" },
};

function guard(res: any): boolean {
  if (!isGcPredictionsEnabled()) {
    res.status(503).json({ configured: false, message: "مسابقة توقّعات خليجي 27 غير مفعّلة حاليًا" });
    return false;
  }
  return true;
}

function fail(res: any, reason: string): void {
  const m = REASON_MESSAGES[reason] ?? { status: 500, message: "تعذّر تنفيذ الطلب" };
  res.status(m.status).json({ message: m.message, reason });
}

const noStore = (res: any) => res.set("Cache-Control", "private, no-store");

router.post("/api/gulf-cup/majlis", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  try {
    const result = await createMajlis(req.user.id, String(req.body?.name ?? ""));
    if (!result.ok) return fail(res, result.reason);
    noStore(res);
    res.status(201).json(result.data);
  } catch (error) {
    console.error("[GC Majlis] create error:", error);
    res.status(502).json({ message: "تعذّر إنشاء المجلس حاليًا" });
  }
});

router.post("/api/gulf-cup/majlis/join", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  try {
    const result = await joinMajlis(req.user.id, String(req.body?.code ?? ""));
    if (!result.ok) return fail(res, result.reason);
    noStore(res);
    res.json(result.data);
  } catch (error) {
    console.error("[GC Majlis] join error:", error);
    res.status(502).json({ message: "تعذّر الانضمام حاليًا" });
  }
});

router.get("/api/gulf-cup/majlis/mine", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  try {
    noStore(res);
    res.json({ majalis: await getMyMajalis(req.user.id) });
  } catch (error) {
    console.error("[GC Majlis] mine error:", error);
    res.status(502).json({ message: "تعذّر جلب مجالسك حاليًا" });
  }
});

router.get("/api/gulf-cup/majlis/:id/leaderboard", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  try {
    const result = await getMajlisLeaderboard(req.user.id, String(req.params.id));
    if (!result.ok) return fail(res, result.reason);
    noStore(res);
    res.json(result.data);
  } catch (error) {
    console.error("[GC Majlis] leaderboard error:", error);
    res.status(502).json({ message: "تعذّر جلب ترتيب المجلس حاليًا" });
  }
});

router.delete("/api/gulf-cup/majlis/:id", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  try {
    const result = await leaveMajlis(req.user.id, String(req.params.id));
    if (!result.ok) return fail(res, result.reason);
    noStore(res);
    res.json(result.data);
  } catch (error) {
    console.error("[GC Majlis] leave error:", error);
    res.status(502).json({ message: "تعذّر تنفيذ الطلب حاليًا" });
  }
});

// ---------- «رجل المباراة — الجمهور ضد الأرقام» ----------
// GET عام (يعرض التوزيعة للجميع)؛ POST للمسجّلين ضمن نافذة التصويت.

import { getMotmBoard, voteMotm } from "../services/gcMotmService";

const MOTM_REASONS: Record<string, { status: number; message: string }> = {
  INVALID_PLAYER: { status: 400, message: "اختر لاعبًا صالحًا" },
  NOT_FOUND: { status: 404, message: "المباراة غير موجودة" },
  TOO_EARLY: { status: 409, message: "التصويت يُفتح من الشوط الثاني" },
  NOT_STARTED: { status: 409, message: "التصويت يُفتح بعد انطلاق المباراة" },
  CLOSED: { status: 409, message: "أُغلق التصويت لهذه المباراة" },
};

router.get("/api/gulf-cup/motm/:fixtureId", async (req: any, res) => {
  if (!guard(res)) return;
  const fixtureId = Number(req.params.fixtureId);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    res.status(400).json({ message: "معرّف مباراة غير صالح" });
    return;
  }
  try {
    const userId = req.isAuthenticated?.() && req.user ? req.user.id : undefined;
    const board = await getMotmBoard(fixtureId, userId);
    if (userId) noStore(res);
    else res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
    res.json(board);
  } catch (error) {
    console.error("[GC MOTM] board error:", error);
    res.status(502).json({ message: "تعذّر جلب التصويت حاليًا" });
  }
});

router.post("/api/gulf-cup/motm/:fixtureId", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  const fixtureId = Number(req.params.fixtureId);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    res.status(400).json({ message: "معرّف مباراة غير صالح" });
    return;
  }
  try {
    const result = await voteMotm(
      req.user.id,
      fixtureId,
      String(req.body?.playerId ?? ""),
      String(req.body?.playerName ?? ""),
    );
    if (!result.ok) {
      const m = MOTM_REASONS[result.reason] ?? { status: 500, message: "تعذّر حفظ الصوت" };
      res.status(m.status).json({ message: m.message, reason: result.reason });
      return;
    }
    noStore(res);
    res.json({ saved: true });
  } catch (error) {
    console.error("[GC MOTM] vote error:", error);
    res.status(502).json({ message: "تعذّر حفظ الصوت حاليًا" });
  }
});

export default router;
