// حارس للمسارات القديمة التي تغيّر دور مستخدم أو حالته (server/routes.ts).
//
// يُضاف في سطر تعريف المسار نفسه بعد requirePermission، فيفرض قبل المعالج:
// منع التعديل على النفس، ورتبة الهدف (لا يمس مدير النظام إلا مدير نظام)، ومنع إسناد
// دور مغلق أو معطّل، وحارس آخر حساب إداري. وبعد نجاح الرد: يبطل كاش الصلاحيات
// والجلسة، وينهي الجلسات عند التعليق أو الحظر، ويسجّل في سجل التدقيق ما لم يكن
// المعالج يسجّل بنفسه.
import type { NextFunction, Request, Response } from "express";
import {
  UserAdminError,
  afterLegacyUserAction,
  checkLegacyUserAction,
  loadRoleCatalog,
  snapshotLegacyTargets,
} from "../services/userAdminService";

export type LegacyUserAction =
  | "suspend" | "unsuspend" | "ban" | "unban" | "soft_delete" | "restore" | "role"
  | "bulk_suspend" | "bulk_ban" | "bulk_role"
  | "admin_patch" | "admin_roles" | "admin_delete";

const BLOCKING_STATUSES = new Set(["suspended", "banned", "locked", "deleted"]);

interface Plan {
  targets: string[];
  blocksAccess: boolean;
  nextRoleNames?: string[];
  auditAction: string;
  log: boolean;
  revoke: boolean;
  details: Record<string, unknown>;
}

async function planFor(action: LegacyUserAction, req: Request): Promise<Plan> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const one = [String(req.params.id ?? "")];
  const many = Array.isArray(body.userIds) ? body.userIds.map(String) : [];
  const reason = typeof body.reason === "string" ? body.reason : undefined;
  switch (action) {
    case "suspend":
      return { targets: one, blocksAccess: true, auditAction: "status_updated", log: true, revoke: true, details: { status: "suspended", reason, duration: body.duration } };
    case "ban":
      return { targets: one, blocksAccess: true, auditAction: "status_updated", log: true, revoke: true, details: { status: "banned", reason, isPermanent: body.isPermanent, duration: body.duration } };
    case "bulk_suspend":
      return { targets: many, blocksAccess: true, auditAction: "status_updated", log: true, revoke: true, details: { status: "suspended", reason, duration: body.duration, bulk: true } };
    case "bulk_ban":
      return { targets: many, blocksAccess: true, auditAction: "status_updated", log: true, revoke: true, details: { status: "banned", reason, isPermanent: body.isPermanent, duration: body.duration, bulk: true } };
    case "unsuspend":
    case "unban":
    case "restore":
      return { targets: one, blocksAccess: false, auditAction: "status_updated", log: true, revoke: false, details: { action } };
    case "soft_delete":
      return { targets: one, blocksAccess: true, auditAction: "user_deleted", log: true, revoke: false, details: { softDelete: true } };
    case "role":
      return { targets: one, blocksAccess: false, nextRoleNames: [String(body.role ?? "")], auditAction: "roles_updated", log: true, revoke: false, details: { role: body.role } };
    case "bulk_role":
      return { targets: many, blocksAccess: false, nextRoleNames: [String(body.role ?? "")], auditAction: "roles_updated", log: true, revoke: false, details: { role: body.role, bulk: true } };
    case "admin_patch": {
      const blocks = typeof body.status === "string" && BLOCKING_STATUSES.has(body.status);
      let nextRoleNames: string[] | undefined;
      if (typeof body.roleId === "string" && body.roleId) {
        const role = (await loadRoleCatalog()).find((r) => r.id === body.roleId);
        nextRoleNames = role ? [role.name] : undefined;
      }
      return { targets: one, blocksAccess: blocks, nextRoleNames, auditAction: "", log: false, revoke: blocks, details: {} };
    }
    case "admin_roles": {
      const ids = Array.isArray(body.roleIds) ? body.roleIds.map(String) : [];
      const catalog = await loadRoleCatalog();
      const nextRoleNames = catalog.filter((r) => ids.includes(r.id)).map((r) => r.name);
      return { targets: one, blocksAccess: false, nextRoleNames, auditAction: "", log: false, revoke: false, details: {} };
    }
    case "admin_delete":
      return { targets: one, blocksAccess: true, auditAction: "", log: false, revoke: false, details: {} };
  }
}

export function legacyUserActionGuard(action: LegacyUserAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const actorId = (req.user as { id?: string } | undefined)?.id;
    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const plan = await planFor(action, req);
      const targets = plan.targets.filter(Boolean);
      // بلا أهداف: يتولى المعالج رسالة «قائمة المستخدمين مطلوبة».
      if (targets.length === 0) return next();
      if (targets.includes(actorId)) {
        return res.status(403).json({ message: "لا يمكنك تغيير دورك أو حالة حسابك بنفسك", code: "SELF_EDIT" });
      }
      await checkLegacyUserAction(actorId, targets, { blocksAccess: plan.blocksAccess, nextRoleNames: plan.nextRoleNames });
      const before = await snapshotLegacyTargets(targets);
      res.on("finish", () => {
        if (res.statusCode >= 400) return;
        afterLegacyUserAction({
          actorId,
          targetIds: targets,
          action: plan.auditAction,
          before,
          details: plan.details,
          revokeSessions: plan.revoke,
          ctx: { ip: req.ip, userAgent: String(req.headers["user-agent"] ?? "").slice(0, 300) },
          log: plan.log,
        }).catch((error) => console.error(`[legacyUserActionGuard] after ${action} failed:`, error));
      });
      next();
    } catch (error) {
      if (error instanceof UserAdminError) {
        return res.status(error.status).json({ message: error.message, code: error.code });
      }
      console.error(`[legacyUserActionGuard] ${action}:`, error);
      return res.status(500).json({ message: "تعذّر التحقق من الصلاحية. أعد المحاولة." });
    }
  };
}
