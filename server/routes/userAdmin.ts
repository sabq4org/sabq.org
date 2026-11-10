// شاشات إدارة المستخدمين والأدوار الجديدة. المنطق والحراسات في
// server/services/userAdminService.ts؛ هنا التحقق من المدخلات والبوابة العامة فقط.
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requirePermission } from "../rbac";
import {
  PUBLISH_LEVELS,
  ROLE_STATUSES,
  roleMetaSchema,
  roleStatusChangeSchema,
  userAdminPreviewSchema,
  userAdminSaveSchema,
} from "@shared/userAdmin";
import {
  UserAdminError,
  changeRoleStatus,
  deleteUnusedRole,
  getUserProfile,
  listRoles,
  listSummary,
  listUsers,
  loadActor,
  previewUserChange,
  roleStatusImpact,
  saveUser,
  updateRoleMeta,
} from "../services/userAdminService";

const router: Router = Router();
const BASE = "/api/admin/user-admin";

function actorIdOf(req: Request): string {
  const id = (req.user as { id?: string } | undefined)?.id;
  if (!id) throw new UserAdminError(401, "Unauthorized");
  return id;
}

function ctxOf(req: Request) {
  return { ip: req.ip, userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300) };
}

function fail(res: Response, error: unknown, label: string) {
  if (error instanceof UserAdminError) {
    return res.status(error.status).json({ message: error.message, code: error.code, details: error.details });
  }
  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return res.status(400).json({ message: first?.message ?? "بيانات غير صحيحة", issues: error.issues });
  }
  console.error(`[user-admin] ${label}:`, error);
  return res.status(500).json({ message: "تعذّر إكمال الطلب. أعد المحاولة بعد قليل." });
}

const listQuerySchema = z.object({
  kind: z.enum(["staff", "readers", "all"]).default("staff"),
  q: z.string().trim().max(120).optional().transform((v) => v || undefined),
  roleId: z.string().trim().max(64).optional().transform((v) => v || undefined),
  status: z.enum(["active", "pending", "suspended", "banned", "locked", "restricted"]).optional(),
  publish: z.enum(PUBLISH_LEVELS).optional(),
  sort: z.enum(["activity", "newest", "name"]).default("activity"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
});

router.get(`${BASE}/users`, requireAuth, requirePermission("users.view"), async (req, res) => {
  try {
    const params = listQuerySchema.parse(req.query);
    if (params.publish && params.kind !== "staff") {
      return res.status(400).json({ message: "فلتر صلاحية النشر متاح في عرض المنسوبين فقط" });
    }
    res.set("Cache-Control", "private, no-store");
    res.json(await listUsers(params));
  } catch (error) {
    fail(res, error, "list users");
  }
});

router.get(`${BASE}/summary`, requireAuth, requirePermission("users.view"), async (_req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await listSummary());
  } catch (error) {
    fail(res, error, "summary");
  }
});

router.get(`${BASE}/users/:id`, requireAuth, requirePermission("users.view"), async (req, res) => {
  try {
    const actor = await loadActor(actorIdOf(req));
    res.set("Cache-Control", "private, no-store");
    res.json(await getUserProfile(actor, req.params.id));
  } catch (error) {
    fail(res, error, "get user");
  }
});

// معاينة أثر أدوار/استثناءات مقترحة دون حفظ.
router.post(`${BASE}/users/:id/preview`, requireAuth, requirePermission("users.view"), async (req, res) => {
  try {
    const body = userAdminPreviewSchema.parse(req.body);
    res.json(await previewUserChange(req.params.id, body));
  } catch (error) {
    fail(res, error, "preview");
  }
});

// حفظ ذري: البيانات + الأدوار + الاستثناءات + الحالة في معاملة واحدة.
// الصلاحية الدقيقة لكل جزء تُفحص في الخدمة.
router.patch(`${BASE}/users/:id`, requireAuth, requirePermission("users.view"), async (req, res) => {
  try {
    const body = userAdminSaveSchema.parse(req.body);
    const actor = await loadActor(actorIdOf(req));
    res.json(await saveUser(actor, req.params.id, body, ctxOf(req)));
  } catch (error) {
    fail(res, error, "save user");
  }
});

// ───────── الأدوار ─────────

router.get(`${BASE}/roles`, requireAuth, requirePermission("system.manage_roles"), async (_req, res) => {
  try {
    res.set("Cache-Control", "private, no-store");
    res.json(await listRoles());
  } catch (error) {
    fail(res, error, "list roles");
  }
});

router.get(`${BASE}/roles/:id/impact`, requireAuth, requirePermission("system.manage_roles"), async (req, res) => {
  try {
    const to = z.enum(ROLE_STATUSES).parse(req.query.to);
    res.json(await roleStatusImpact(req.params.id, to));
  } catch (error) {
    fail(res, error, "role impact");
  }
});

router.patch(`${BASE}/roles/:id/status`, requireAuth, requirePermission("system.manage_roles"), async (req, res) => {
  try {
    const body = roleStatusChangeSchema.parse(req.body);
    const actor = await loadActor(actorIdOf(req));
    res.json(await changeRoleStatus(actor, req.params.id, body.status, body.reason, ctxOf(req)));
  } catch (error) {
    fail(res, error, "role status");
  }
});

router.patch(`${BASE}/roles/:id`, requireAuth, requirePermission("system.manage_roles"), async (req, res) => {
  try {
    const body = roleMetaSchema.parse(req.body);
    const actor = await loadActor(actorIdOf(req));
    await updateRoleMeta(actor, req.params.id, body, ctxOf(req));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, "role meta");
  }
});

router.delete(`${BASE}/roles/:id`, requireAuth, requirePermission("system.manage_roles"), async (req, res) => {
  try {
    const actor = await loadActor(actorIdOf(req));
    await deleteUnusedRole(actor, req.params.id, ctxOf(req));
    res.json({ ok: true });
  } catch (error) {
    fail(res, error, "delete role");
  }
});

export default router;
