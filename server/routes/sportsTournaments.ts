/**
 * راوتر سجلّ البطولات الموحّد (Sabq Sports 2.0).
 *
 *  - GET /api/sports/tournaments        — عام: البطولات المرئية فقط (ويب افتراضيًا،
 *    ?surface=app للتطبيقات). كاش HTTP قصير حتى يسري تغيير الداشبورد خلال دقيقة.
 *  - /api/admin/sports-tournaments/*    — إدارة (RBAC: system.manage_settings):
 *    قائمة كاملة، تعديل، إعادة ترتيب، وسجل التدقيق.
 *
 * ملتزم بـ ADR-001 — لا يستورد db؛ كل الوصول عبر sportsTournamentsService.
 */
import { Router } from "express";
import { requireAuth, requirePermission } from "../rbac";
import {
  listAllTournaments,
  listAudit,
  listVisibleTournaments,
  reorderTournaments,
  sanitizePatch,
  updateTournament,
  type TournamentSurface,
} from "../services/sportsTournamentsService";
import { getSportsHub } from "../services/sportsHubService";

const router: Router = Router();

// عام — مصدر الحقيقة للويب والتطبيقات. البطولات المرئية فقط بترتيب العرض
// (روشن anchor دائمًا أولًا). كاش قصير: التغيير من الداشبورد يسري خلال دقيقة.
router.get("/api/sports/tournaments", async (req, res) => {
  try {
    const surface: TournamentSurface = String(req.query.surface || "web") === "app" ? "app" : "web";
    const tournaments = await listVisibleTournaments(surface);
    res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    res.json({ tournaments });
  } catch (error) {
    console.error("[SportsTournaments] فشل جلب البطولات:", error);
    res.json({ tournaments: [] });
  }
});

// هب الويب — payload واحد جاهز لتجربة /sports22: بطولات غنية + مباشر الآن
// + قرار تحريري للواجهة (اللقطة الرئيسية والمسارات). نفس مصدر حقيقة الداشبورد.
router.get("/api/sports/hub", async (req, res) => {
  try {
    const surface: TournamentSurface = String(req.query.surface || "web") === "app" ? "app" : "web";
    const hub = await getSportsHub(surface);
    res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=90");
    res.json(hub);
  } catch (error) {
    console.error("[SportsHub] فشل جلب هب الويب:", error);
    res.status(502).json({ message: "تعذر جلب هب الرياضة حاليًا" });
  }
});

// إدارة — القائمة الكاملة بلا فلترة (تشمل المخفية) لصفحة الداشبورد.
router.get(
  "/api/admin/sports-tournaments",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (_req, res) => {
    try {
      const tournaments = await listAllTournaments();
      res.set("Cache-Control", "private, no-store");
      res.json({ tournaments });
    } catch (error) {
      console.error("[SportsTournaments] فشل جلب قائمة الإدارة:", error);
      res.status(500).json({ message: "فشل جلب البطولات" });
    }
  },
);

// إدارة — تعديل بطولة (toggles الظهور، الحالة، الموسم، التواريخ، الميزات...).
router.patch(
  "/api/admin/sports-tournaments/:id",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (req: any, res) => {
    try {
      const patch = sanitizePatch(req.body ?? {});
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ message: "لا حقول صالحة للتعديل" });
      }
      const userId = req.user?.claims?.sub ?? req.user?.id ?? null;
      const updated = await updateTournament(String(req.params.id), patch, userId);
      if (!updated) return res.status(404).json({ message: "البطولة غير موجودة" });
      res.json({ success: true, tournament: updated });
    } catch (error) {
      console.error("[SportsTournaments] فشل التعديل:", error);
      res.status(500).json({ message: "فشل تعديل البطولة" });
    }
  },
);

// إدارة — إعادة الترتيب بالسحب: body = { ids: string[] } بالترتيب الجديد.
router.post(
  "/api/admin/sports-tournaments/reorder",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (req: any, res) => {
    try {
      const ids: unknown = req.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
        return res.status(400).json({ message: "ids مطلوبة كمصفوفة معرّفات" });
      }
      const userId = req.user?.claims?.sub ?? req.user?.id ?? null;
      await reorderTournaments(ids as string[], userId);
      res.json({ success: true });
    } catch (error) {
      console.error("[SportsTournaments] فشل إعادة الترتيب:", error);
      res.status(500).json({ message: "فشل إعادة الترتيب" });
    }
  },
);

// إدارة — سجل التدقيق: من غيّر ماذا ومتى.
router.get(
  "/api/admin/sports-tournaments/audit",
  requireAuth,
  requirePermission("system.manage_settings"),
  async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const entries = await listAudit(limit);
      res.set("Cache-Control", "private, no-store");
      res.json({ entries });
    } catch (error) {
      console.error("[SportsTournaments] فشل جلب سجل التدقيق:", error);
      res.status(500).json({ message: "فشل جلب سجل التدقيق" });
    }
  },
);

export default router;
