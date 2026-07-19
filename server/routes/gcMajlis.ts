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
import rateLimit from "express-rate-limit";
import { requireAuth } from "../rbac";
import { cfKeyGenerator, cfValidate } from "../utils/rateLimiting";
import { isGcPredictionsEnabled } from "../services/gcFeatureFlags";
import {
  createMajlis,
  getMajlisLeaderboard,
  getMyMajalis,
  joinMajlis,
  leaveMajlis,
} from "../services/gcMajlisService";
import {
  getMajlisChampionPicks,
  getMajlisFantasy,
  getMajlisHarvest,
  getMajlisInvitePreview,
  getMajlisMatchday,
  getMajlisNotificationPreference,
  setMajlisNotificationPreference,
} from "../services/gcMajlisSocialService";
import {
  actOnMajlisDuel,
  createMajlisDuel,
  listMajlisDuels,
} from "../services/gcDuelsService";

const router = Router();

const majlisInviteLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message: { message: "طلبات كثيرة لرموز الدعوة. حاول بعد دقيقة." },
});

const majlisJoinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message: { message: "طلبات انضمام كثيرة. حاول بعد دقيقة." },
});

const REASON_MESSAGES: Record<string, { status: number; message: string }> = {
  INVALID_NAME: { status: 400, message: "اسم المجلس بين حرفين و60 حرفًا" },
  INVALID_CODE: { status: 400, message: "رمز الدعوة غير صالح" },
  NOT_FOUND: { status: 404, message: "المجلس غير موجود — تأكد من الرمز" },
  NOT_MEMBER: { status: 403, message: "هذا المجلس لأعضائه فقط" },
  FULL: { status: 409, message: "اكتمل المجلس (50 عضوًا) — أنشئوا مجلسًا ثانيًا" },
  LIMIT_OWNED: { status: 409, message: "بلغت حدّ 5 مجالس — احذف واحدًا لتنشئ غيره" },
  CODE_COLLISION: { status: 500, message: "تعذّر توليد رمز — حاول مجددًا" },
  ACTIVE_DUELS: { status: 409, message: "أنه تحديات المجلس النشطة قبل المغادرة أو الحذف" },
  INVALID_DATE: { status: 400, message: "صيغة التاريخ المطلوبة YYYY-MM-DD" },
  INVALID_STAKE: { status: 400, message: "الرهان من 10 إلى 100 نقطة وبمضاعفات 10" },
  SELF_CHALLENGE: { status: 400, message: "اختر عضوًا آخر للتحدي" },
  FIXTURE_NOT_FOUND: { status: 404, message: "المباراة غير موجودة" },
  TARGET_NOT_MEMBER: { status: 400, message: "العضو المختار ليس في هذا المجلس" },
  LOCKED: { status: 409, message: "أُغلق التحدي لانطلاق المباراة" },
  DAILY_CAP: { status: 409, message: "بلغت سقف الرهان اليومي (200 نقطة)" },
  INSUFFICIENT_POINTS: { status: 402, message: "رصيد نقاط الولاء غير كافٍ" },
  DUPLICATE: { status: 409, message: "يوجد تحدٍ بينكما لهذه المباراة" },
  NOT_ALLOWED: { status: 403, message: "لا تملك صلاحية تنفيذ هذا الإجراء" },
  INVALID_STATE: { status: 409, message: "حالة التحدي لا تسمح بهذا الإجراء" },
  EXPIRED: { status: 409, message: "انتهت مهلة التحدي وأُعيد الرهان" },
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

router.get("/api/gulf-cup/majlis/invite/:code", majlisInviteLookupLimiter, async (req, res) => {
  if (!guard(res)) return;
  try {
    const result = await getMajlisInvitePreview(String(req.params.code ?? ""));
    if (!result.ok) return fail(res, result.reason);
    res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    res.json(result.data);
  } catch (error) {
    console.error("[GC Majlis] invite preview error:", error);
    res.status(502).json({ message: "تعذّر جلب بطاقة الدعوة حاليًا" });
  }
});

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

router.post("/api/gulf-cup/majlis/join", majlisJoinLimiter, requireAuth, async (req: any, res) => {
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

router.get("/api/gulf-cup/majlis/:id/matchday", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    const date = typeof req.query?.date === "string" ? req.query.date : undefined;
    const result = await getMajlisMatchday(req.user.id, String(req.params.id), date);
    if (!result.ok) return fail(res, result.reason);
    res.json(result.data);
  } catch (error) {
    console.error("[GC Majlis] matchday error:", error);
    res.status(502).json({ message: "تعذّر جلب يوم المجلس حاليًا" });
  }
});

router.get("/api/gulf-cup/majlis/:id/fantasy", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    const result = await getMajlisFantasy(req.user.id, String(req.params.id));
    if (!result.ok) return fail(res, result.reason);
    res.json(result.data);
  } catch (error) {
    console.error("[GC Majlis] fantasy error:", error);
    res.status(502).json({ message: "تعذّر جلب فانتازي المجلس حاليًا" });
  }
});

router.get("/api/gulf-cup/majlis/:id/champion-picks", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    const result = await getMajlisChampionPicks(req.user.id, String(req.params.id));
    if (!result.ok) return fail(res, result.reason);
    res.json(result.data);
  } catch (error) {
    console.error("[GC Majlis] champion picks error:", error);
    res.status(502).json({ message: "تعذّر جلب توقعات البطل حاليًا" });
  }
});

router.get("/api/gulf-cup/majlis/:id/harvest", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    const result = await getMajlisHarvest(req.user.id, String(req.params.id));
    if (!result.ok) return fail(res, result.reason);
    res.json(result.data);
  } catch (error) {
    console.error("[GC Majlis] harvest error:", error);
    res.status(502).json({ message: "تعذّر جلب حصاد المجلس حاليًا" });
  }
});

router.get("/api/gulf-cup/majlis/:id/duels", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    const result = await listMajlisDuels(req.user.id, String(req.params.id));
    if (!result.ok) return fail(res, result.reason);
    res.json(result.data);
  } catch (error) {
    console.error("[GC Majlis] duels list error:", error);
    res.status(502).json({ message: "تعذّر جلب تحديات المجلس حاليًا" });
  }
});

router.post("/api/gulf-cup/majlis/:id/duels", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    const result = await createMajlisDuel({
      challengerId: req.user.id,
      majlisId: String(req.params.id),
      fixtureId: Number(req.body?.fixtureId),
      challengedUserId: String(req.body?.challengedUserId ?? ""),
      stake: Number(req.body?.stake),
    });
    if (!result.ok) return fail(res, result.reason);
    res.status(201).json({ duel: result.data });
  } catch (error) {
    console.error("[GC Majlis] duel create error:", error);
    res.status(502).json({ message: "تعذّر إنشاء التحدي حاليًا" });
  }
});

for (const action of ["accept", "decline", "cancel"] as const) {
  router.post(`/api/gulf-cup/majlis/duels/:duelId/${action}`, requireAuth, async (req: any, res) => {
    if (!guard(res)) return;
    noStore(res);
    try {
      const result = await actOnMajlisDuel(req.user.id, String(req.params.duelId), action);
      if (!result.ok) return fail(res, result.reason);
      res.json({ duel: result.data });
    } catch (error) {
      console.error(`[GC Majlis] duel ${action} error:`, error);
      res.status(502).json({ message: "تعذّر تحديث التحدي حاليًا" });
    }
  });
}

router.get("/api/gulf-cup/majlis/notification-preference", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  try {
    res.json(await getMajlisNotificationPreference(req.user.id));
  } catch (error) {
    console.error("[GC Majlis] notification preference error:", error);
    res.status(502).json({ message: "تعذّر جلب إعداد الإشعارات" });
  }
});

router.put("/api/gulf-cup/majlis/notification-preference", requireAuth, async (req: any, res) => {
  if (!guard(res)) return;
  noStore(res);
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ message: "enabled يجب أن تكون boolean" });
  try {
    res.json(await setMajlisNotificationPreference(req.user.id, req.body.enabled));
  } catch (error) {
    console.error("[GC Majlis] notification preference update error:", error);
    res.status(502).json({ message: "تعذّر حفظ إعداد الإشعارات" });
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
