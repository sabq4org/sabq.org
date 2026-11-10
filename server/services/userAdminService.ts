// إدارة المستخدمين والأدوار (شاشات /dashboard/users و/dashboard/roles الجديدة).
//
// كل قراءة وكتابة هنا؛ server/routes/userAdmin.ts يتحقق من الجلسة والصلاحية العامة
// ثم يستدعي هذه الدوال. الحراسات الدقيقة (رتبة الهدف، آخر مدير، إسناد الأدوار
// المغلقة، الحجب الثابت) تُفرض هنا داخل معاملة واحدة حتى لا تتجاوزها أي واجهة.
import { createHash } from "node:crypto";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { roles, staff, userPermissionOverrides, userRoles, users } from "@shared/schema";
import { READER_LIKE_ROLE_KEYS, mergeRoleSignals, primaryRoleKey } from "@shared/effectiveRoles";
import { ROLE_NAMES, SUPERUSER_ROLE_NAMES, canAssignRole } from "@shared/rbac-constants";
import {
  INACTIVE_ROLE_STATUSES,
  PUBLISH_LEVELS,
  ROLE_STATUS_LABELS_AR,
  TRACK_PERMISSION_CODES,
  UNASSIGNABLE_ROLE_STATUSES,
  canTransitionRoleStatus,
  describeSteps,
  isProtectedRoleName,
  isSystemAdminTier,
  normalizeRoleStatus,
  publishLevelOf,
  resolveUserPermissions,
  type PermissionOverride,
  type PublishLevel,
  type ResolveInput,
  type RoleStatus,
  type StepState,
  type UserAdminSave,
} from "@shared/userAdmin";
import {
  getEffectiveUserPermissions,
  getRoleAssignmentAuthority,
  invalidateUserPermissionCache,
  logActivity,
} from "../rbac";
import { invalidateAllUserSessions, invalidateUserSessionCache } from "../auth";
import { assertPhoneAvailable } from "./phoneAuth";
import { getInactiveRoleNames, invalidateInactiveRoleNames } from "./roleStatusCache";

// ───────────────────────── أخطاء ─────────────────────────

export class UserAdminError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

// ───────────────────────── أدوات ─────────────────────────

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}

function sqlList(values: readonly string[]): SQL {
  return sql.join(values.map((v) => sql`${v}`), sql`, `);
}

const READER_LIKE = Array.from(READER_LIKE_ROLE_KEYS);
const SUPERUSERS = SUPERUSER_ROLE_NAMES as readonly string[];

function displayName(u: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  const n = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return n || u.email || "بلا اسم";
}

/** الحالة الفعلية بنفس أولويات getUserEffectiveStatus (shared/schema.ts). */
const EFF_STATUS_SQL = sql`CASE
  WHEN u.status = 'banned' AND (u.banned_until IS NULL OR u.banned_until > now()) THEN 'banned'
  WHEN u.status = 'suspended' AND (u.suspended_until IS NULL OR u.suspended_until > now()) THEN 'suspended'
  WHEN u.account_locked AND u.locked_until > now() THEN 'locked'
  WHEN NOT u.email_verified THEN 'pending'
  ELSE 'active' END`;

const IS_STAFF_SQL = sql`(
  lower(coalesce(u.role, 'reader')) NOT IN (${sqlList(READER_LIKE)})
  OR EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = u.id AND lower(r.name) NOT IN (${sqlList(READER_LIKE)})
  ))`;

// ───────────────────────── كتالوج الأدوار ─────────────────────────

export interface CatalogRole {
  id: string;
  name: string;
  nameAr: string;
  description: string | null;
  isSystem: boolean;
  status: RoleStatus;
  permissions: string[];
}

/** الأدوار مع حالتها وصلاحياتها. to_jsonb يقرأ status دون أن يفشل قبل تنفيذ الهجرة. */
export async function loadRoleCatalog(): Promise<CatalogRole[]> {
  const [roleRows, permRows] = await Promise.all([
    db.execute(sql`SELECT r.id, r.name, r.name_ar, r.description, r.is_system,
      COALESCE(to_jsonb(r) ->> 'status', 'active') AS status
      FROM roles r ORDER BY r.created_at, r.name`),
    db.execute(sql`SELECT rp.role_id, p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id`),
  ]);
  const byRole = new Map<string, string[]>();
  for (const row of rowsOf<{ role_id: string; code: string }>(permRows)) {
    const list = byRole.get(row.role_id) ?? [];
    list.push(row.code);
    byRole.set(row.role_id, list);
  }
  return rowsOf<{ id: string; name: string; name_ar: string; description: string | null; is_system: boolean; status: string }>(roleRows).map((r) => ({
    id: r.id,
    name: r.name,
    nameAr: r.name_ar,
    description: r.description,
    isSystem: !!r.is_system,
    status: normalizeRoleStatus(r.status),
    permissions: byRole.get(r.id) ?? [],
  }));
}

function rolePermissionsByName(catalog: CatalogRole[]): Record<string, string[]> {
  return Object.fromEntries(catalog.map((r) => [r.name, r.permissions]));
}

function inactiveFromCatalog(catalog: CatalogRole[]): Set<string> {
  return new Set(catalog.filter((r) => INACTIVE_ROLE_STATUSES.includes(r.status)).map((r) => r.name));
}

// ───────────────────────── سياق المنفّذ ─────────────────────────

export interface ActorContext {
  id: string;
  perms: string[];
  authority: string;
}

export async function loadActor(actorId: string): Promise<ActorContext> {
  const [perms, authority] = await Promise.all([getEffectiveUserPermissions(actorId), getRoleAssignmentAuthority(actorId)]);
  return { id: actorId, perms, authority };
}

function can(actor: ActorContext, ...codes: string[]): boolean {
  return actor.perms.includes("*") || codes.some((c) => actor.perms.includes(c));
}

// ───────────────────────── إشارات المستخدم ─────────────────────────

interface UserSignals {
  legacyRole: string | null;
  roleIds: string[];
  roleNames: string[];
  overrides: PermissionOverride[];
}

async function loadSignals(userIds: string[]): Promise<Map<string, UserSignals>> {
  const out = new Map<string, UserSignals>();
  if (userIds.length === 0) return out;
  const [legacy, assigned, overrides] = await Promise.all([
    db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.id, userIds)),
    db
      .select({ userId: userRoles.userId, roleId: roles.id, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, userIds)),
    db
      .select({ userId: userPermissionOverrides.userId, code: userPermissionOverrides.permissionCode, effect: userPermissionOverrides.effect })
      .from(userPermissionOverrides)
      .where(inArray(userPermissionOverrides.userId, userIds)),
  ]);
  for (const u of legacy) out.set(u.id, { legacyRole: u.role, roleIds: [], roleNames: [], overrides: [] });
  for (const a of assigned) {
    const s = out.get(a.userId);
    if (s) {
      s.roleIds.push(a.roleId);
      s.roleNames.push(a.name);
    }
  }
  for (const o of overrides) {
    const s = out.get(o.userId);
    if (s && (o.effect === "allow" || o.effect === "deny")) s.overrides.push({ code: o.code, effect: o.effect });
  }
  return out;
}

function resolveInputFor(s: UserSignals, catalog: CatalogRole[], inactive: Set<string>): ResolveInput {
  return {
    legacyRole: s.legacyRole,
    assignedRoles: s.roleNames,
    inactiveRoles: inactive,
    rolePermissions: rolePermissionsByName(catalog),
    overrides: s.overrides,
  };
}

function allRoleSignals(s: UserSignals): string[] {
  return [...(s.legacyRole ? [s.legacyRole] : []), ...s.roleNames];
}

// ───────────────────────── القائمة ─────────────────────────

export interface ListParams {
  kind: "staff" | "readers" | "all";
  q?: string;
  roleId?: string;
  status?: "active" | "pending" | "suspended" | "banned" | "locked" | "restricted";
  publish?: PublishLevel;
  sort: "activity" | "newest" | "name";
  page: number;
  pageSize: number;
}

interface ListRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_number: string | null;
  profile_image_url: string | null;
  job_title: string | null;
  last_activity_at: Date | null;
  created_at: Date;
  eff_status: string;
  suspended_until: Date | null;
  banned_until: Date | null;
  is_staff: boolean;
}

function orderSql(sort: ListParams["sort"]): SQL {
  if (sort === "newest") return sql`u.created_at DESC, u.id`;
  if (sort === "name") return sql`lower(coalesce(nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''), u.email, '')) ASC, u.id`;
  return sql`u.last_activity_at DESC NULLS LAST, u.created_at DESC, u.id`;
}

function filterSql(p: ListParams, roleName: string | null): SQL {
  const parts: SQL[] = [sql`u.deleted_at IS NULL`];
  if (p.kind === "staff") parts.push(IS_STAFF_SQL);
  if (p.kind === "readers") parts.push(sql`NOT ${IS_STAFF_SQL}`);
  if (p.q) {
    const like = `%${p.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    parts.push(sql`(
      (coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')) ILIKE ${like}
      OR u.email ILIKE ${like} OR u.phone_number ILIKE ${like})`);
  }
  if (p.roleId) {
    parts.push(sql`(EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = ${p.roleId})
      ${roleName ? sql`OR u.role = ${roleName}` : sql``})`);
  }
  if (p.status === "restricted") parts.push(sql`${EFF_STATUS_SQL} IN ('suspended', 'banned')`);
  else if (p.status) parts.push(sql`${EFF_STATUS_SQL} = ${p.status}`);
  return sql.join(parts, sql` AND `);
}

export interface ListedUser {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  profileImageUrl: string | null;
  jobTitle: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  status: string;
  suspendedUntil: string | null;
  bannedUntil: string | null;
  isStaff: boolean;
  roles: Array<{ id: string; name: string; nameAr: string; status: RoleStatus }>;
  publishLevel: PublishLevel;
  isSuperuser: boolean;
}

const STAFF_SCAN_LIMIT = 5000;

export async function listUsers(p: ListParams) {
  const catalog = await loadRoleCatalog();
  const inactive = inactiveFromCatalog(catalog);
  const roleName = p.roleId ? catalog.find((r) => r.id === p.roleId)?.name ?? null : null;
  const where = filterSql(p, roleName);
  const select = sql`SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.profile_image_url,
    u.job_title, u.last_activity_at, u.created_at, u.suspended_until, u.banned_until,
    ${EFF_STATUS_SQL} AS eff_status, ${IS_STAFF_SQL} AS is_staff
    FROM users u WHERE ${where}`;

  let rows: ListRow[];
  let total: number;
  const levels = new Map<string, { level: PublishLevel; isSuperuser: boolean }>();
  let signals: Map<string, UserSignals>;

  // فلتر مستوى النشر يحتاج حساب الصلاحيات لكل صف قبل التقسيم إلى صفحات؛
  // ينطبق على المنسوبين فقط (القارئ مستواه «بلا صلاحية تحرير» دائمًا).
  if (p.publish && p.kind === "staff") {
    const all = rowsOf<ListRow>(await db.execute(sql`${select} ORDER BY ${orderSql(p.sort)} LIMIT ${STAFF_SCAN_LIMIT}`));
    signals = await loadSignals(all.map((r) => r.id));
    for (const r of all) {
      const s = signals.get(r.id);
      if (!s) continue;
      const resolved = resolveUserPermissions(resolveInputFor(s, catalog, inactive));
      levels.set(r.id, { level: publishLevelOf(resolved), isSuperuser: resolved.isSuperuser });
    }
    const filtered = all.filter((r) => levels.get(r.id)?.level === p.publish);
    total = filtered.length;
    rows = filtered.slice((p.page - 1) * p.pageSize, p.page * p.pageSize);
  } else {
    const [pageRows, countRows] = await Promise.all([
      db.execute(sql`${select} ORDER BY ${orderSql(p.sort)} LIMIT ${p.pageSize} OFFSET ${(p.page - 1) * p.pageSize}`),
      db.execute(sql`SELECT count(*)::int AS n FROM users u WHERE ${where}`),
    ]);
    rows = rowsOf<ListRow>(pageRows);
    total = rowsOf<{ n: number }>(countRows)[0]?.n ?? 0;
    signals = await loadSignals(rows.map((r) => r.id));
    for (const r of rows) {
      const s = signals.get(r.id);
      if (!s) continue;
      const resolved = resolveUserPermissions(resolveInputFor(s, catalog, inactive));
      levels.set(r.id, { level: publishLevelOf(resolved), isSuperuser: resolved.isSuperuser });
    }
  }

  const byId = new Map(catalog.map((r) => [r.id, r]));
  const items: ListedUser[] = rows.map((r) => {
    const s = signals.get(r.id);
    const assigned = (s?.roleIds ?? []).map((id) => byId.get(id)).filter((x): x is CatalogRole => !!x);
    const legacyOnly = s?.legacyRole && !READER_LIKE_ROLE_KEYS.has(s.legacyRole) && !assigned.some((a) => a.name === s.legacyRole)
      ? catalog.find((c) => c.name === s.legacyRole)
      : undefined;
    const shown = legacyOnly ? [...assigned, legacyOnly] : assigned;
    return {
      id: r.id,
      name: displayName({ firstName: r.first_name, lastName: r.last_name, email: r.email }),
      email: r.email,
      phoneNumber: r.phone_number,
      profileImageUrl: r.profile_image_url,
      jobTitle: r.job_title,
      lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
      status: r.eff_status,
      suspendedUntil: r.suspended_until ? new Date(r.suspended_until).toISOString() : null,
      bannedUntil: r.banned_until ? new Date(r.banned_until).toISOString() : null,
      isStaff: !!r.is_staff,
      roles: shown.map((x) => ({ id: x.id, name: x.name, nameAr: x.nameAr, status: x.status })),
      publishLevel: levels.get(r.id)?.level ?? "none",
      isSuperuser: levels.get(r.id)?.isSuperuser ?? false,
    };
  });

  return { items, total, page: p.page, pageSize: p.pageSize };
}

/** أرقام البطاقات العلوية. */
export async function listSummary() {
  const catalog = await loadRoleCatalog();
  const inactive = inactiveFromCatalog(catalog);
  const counts = rowsOf<{ staff: number; readers: number; restricted: number }>(
    await db.execute(sql`SELECT
      count(*) FILTER (WHERE s.is_staff)::int AS staff,
      count(*) FILTER (WHERE NOT s.is_staff)::int AS readers,
      count(*) FILTER (WHERE s.is_staff AND s.eff_status IN ('suspended','banned'))::int AS restricted
      FROM (SELECT ${IS_STAFF_SQL} AS is_staff, ${EFF_STATUS_SQL} AS eff_status FROM users u WHERE u.deleted_at IS NULL) s`),
  )[0] ?? { staff: 0, readers: 0, restricted: 0 };
  const staffIds = rowsOf<{ id: string }>(
    await db.execute(sql`SELECT u.id FROM users u WHERE u.deleted_at IS NULL AND ${IS_STAFF_SQL} AND ${EFF_STATUS_SQL} NOT IN ('suspended','banned') LIMIT ${STAFF_SCAN_LIMIT}`),
  ).map((r) => r.id);
  const signals = await loadSignals(staffIds);
  let publishers = 0;
  for (const s of Array.from(signals.values())) {
    const level = publishLevelOf(resolveUserPermissions(resolveInputFor(s, catalog, inactive)));
    if (level === "publishes" || level === "all") publishers++;
  }
  return { staff: counts.staff, readers: counts.readers, restricted: counts.restricted, publishers };
}

// ───────────────────────── ملف المستخدم ─────────────────────────

type UserRow = typeof users.$inferSelect;

function effectiveStatus(u: UserRow): string {
  const now = Date.now();
  if (u.deletedAt) return "deleted";
  if (u.status === "banned" && (!u.bannedUntil || u.bannedUntil.getTime() > now)) return "banned";
  if (u.status === "suspended" && (!u.suspendedUntil || u.suspendedUntil.getTime() > now)) return "suspended";
  if (u.accountLocked && u.lockedUntil && u.lockedUntil.getTime() > now) return "locked";
  if (!u.emailVerified) return "pending";
  return "active";
}

function versionOf(u: UserRow, s: UserSignals): string {
  const payload = JSON.stringify({
    f: [u.firstName, u.lastName, u.firstNameEn, u.lastNameEn, u.phoneNumber, u.jobTitle, u.department],
    st: [u.status, u.suspendedUntil?.toISOString() ?? null, u.bannedUntil?.toISOString() ?? null, u.deletedAt ? 1 : 0],
    r: [u.role, [...s.roleIds].sort()],
    o: s.overrides.filter((o) => TRACK_PERMISSION_CODES.includes(o.code)).map((o) => `${o.code}:${o.effect}`).sort(),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

interface TargetGuard {
  isSelf: boolean;
  /** سبب منع المنفّذ من تعديل الأدوار/الحالة/الاستثناءات، أو null. */
  blockedReason: string | null;
}

function guardTarget(actor: ActorContext, targetId: string, targetSignals: string[]): TargetGuard {
  const isSelf = actor.id === targetId;
  if (isSelf) return { isSelf, blockedReason: "لا يمكنك تغيير أدوارك أو حالة حسابك أو صلاحياتك بنفسك" };
  if (isSystemAdminTier(targetSignals) && actor.authority !== ROLE_NAMES.SYSTEM_ADMIN) {
    return { isSelf, blockedReason: "هذا حساب مدير نظام؛ لا يعدّله إلا مدير نظام" };
  }
  if (targetSignals.some((r) => SUPERUSERS.includes(r)) && !actor.authority) {
    return { isSelf, blockedReason: "هذا حساب إداري؛ لا يعدّله إلا مسؤول أو مدير نظام" };
  }
  return { isSelf, blockedReason: null };
}

function assignabilityOf(actor: ActorContext, role: CatalogRole, alreadyHeld: boolean): string | null {
  if (!alreadyHeld && UNASSIGNABLE_ROLE_STATUSES.includes(role.status)) {
    return `الدور ${ROLE_STATUS_LABELS_AR[role.status]} ولا يُسند لمستخدمين جدد`;
  }
  if (!canAssignRole(actor.authority, role.name)) {
    return actor.authority ? "لا يسنده إلا مدير النظام" : "إسناد الأدوار للمسؤول ومدير النظام فقط";
  }
  return null;
}

async function loadUserRow(id: string): Promise<UserRow> {
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u || u.deletedAt) throw new UserAdminError(404, "المستخدم غير موجود");
  return u;
}

export async function getUserProfile(actor: ActorContext, id: string) {
  const [u, catalog, signalsMap] = await Promise.all([loadUserRow(id), loadRoleCatalog(), loadSignals([id])]);
  const s = signalsMap.get(id)!;
  const inactive = inactiveFromCatalog(catalog);
  const input = resolveInputFor(s, catalog, inactive);
  const resolved = resolveUserPermissions(input);
  const guard = guardTarget(actor, id, allRoleSignals(s));
  const held = new Set(s.roleIds);

  return {
    version: versionOf(u, s),
    user: {
      id: u.id,
      name: displayName(u),
      firstName: u.firstName,
      lastName: u.lastName,
      firstNameEn: u.firstNameEn,
      lastNameEn: u.lastNameEn,
      email: u.email,
      phoneNumber: u.phoneNumber,
      profileImageUrl: u.profileImageUrl,
      jobTitle: u.jobTitle,
      department: u.department,
      createdAt: u.createdAt?.toISOString() ?? null,
      lastActivityAt: u.lastActivityAt?.toISOString() ?? null,
      emailVerified: u.emailVerified,
      status: effectiveStatus(u),
      suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
      suspensionReason: u.suspensionReason,
      bannedUntil: u.bannedUntil?.toISOString() ?? null,
      banReason: u.banReason,
      legacyRole: u.role,
    },
    roles: catalog
      .filter((r) => r.status !== "archived" || held.has(r.id))
      .map((r) => ({
        id: r.id,
        name: r.name,
        nameAr: r.nameAr,
        description: r.description,
        status: r.status,
        isSuperuserRole: SUPERUSERS.includes(r.name),
        assigned: held.has(r.id),
        notAssignableReason: guard.blockedReason ?? assignabilityOf(actor, r, held.has(r.id)),
      })),
    overrides: s.overrides.filter((o) => TRACK_PERMISSION_CODES.includes(o.code)),
    otherOverridesCount: s.overrides.filter((o) => !TRACK_PERMISSION_CODES.includes(o.code)).length,
    resolved: {
      isSuperuser: resolved.isSuperuser,
      publishLevel: publishLevelOf(resolved),
      activeRoles: resolved.activeRoles,
      suspendedRoles: resolved.suspendedRoles,
    },
    steps: describeSteps(input, resolved),
    access: {
      isSelf: guard.isSelf,
      blockedReason: guard.blockedReason,
      canEditProfile: !guard.blockedReason && can(actor, "users.update"),
      canChangeRoles: !guard.blockedReason && can(actor, "users.change_role"),
      canChangeStatus: !guard.blockedReason && can(actor, "users.manage", "users.suspend", "users.ban"),
      canEditEmail: actor.authority === ROLE_NAMES.SYSTEM_ADMIN,
    },
  };
}

// ───────────────────────── المعاينة ─────────────────────────

function diffSteps(before: StepState[], after: StepState[]) {
  const prev = new Map(before.map((s) => [s.code, s.granted]));
  return {
    gained: after.filter((s) => s.granted && !prev.get(s.code)).map((s) => s.code),
    lost: after.filter((s) => !s.granted && prev.get(s.code)).map((s) => s.code),
  };
}

function sanitizeOverrides(list: PermissionOverride[]): PermissionOverride[] {
  const seen = new Map<string, PermissionOverride>();
  for (const o of list) {
    if (!TRACK_PERMISSION_CODES.includes(o.code)) {
      throw new UserAdminError(400, `صلاحية غير قابلة للتعديل من هذه الشاشة: ${o.code}`);
    }
    seen.set(o.code, o);
  }
  return Array.from(seen.values());
}

export async function previewUserChange(id: string, proposal: { roleIds: string[]; overrides: PermissionOverride[] }) {
  const [catalog, signalsMap] = await Promise.all([loadRoleCatalog(), loadSignals([id])]);
  const s = signalsMap.get(id);
  if (!s) throw new UserAdminError(404, "المستخدم غير موجود");
  const inactive = inactiveFromCatalog(catalog);
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const unknown = proposal.roleIds.filter((rid) => !byId.has(rid));
  if (unknown.length) throw new UserAdminError(400, "دور غير موجود");

  const overrides = sanitizeOverrides(proposal.overrides);
  const otherOverrides = s.overrides.filter((o) => !TRACK_PERMISSION_CODES.includes(o.code));
  const nextNames = proposal.roleIds.map((rid) => byId.get(rid)!.name);
  const beforeInput = resolveInputFor(s, catalog, inactive);
  const afterInput: ResolveInput = {
    ...beforeInput,
    legacyRole: primaryRoleKey(mergeRoleSignals(nextNames)),
    assignedRoles: nextNames,
    overrides: [...otherOverrides, ...overrides],
  };
  const beforeResolved = resolveUserPermissions(beforeInput);
  const afterResolved = resolveUserPermissions(afterInput);
  const before = describeSteps(beforeInput, beforeResolved);
  const after = describeSteps(afterInput, afterResolved);
  return {
    steps: after,
    resolved: {
      isSuperuser: afterResolved.isSuperuser,
      publishLevel: publishLevelOf(afterResolved),
      activeRoles: afterResolved.activeRoles,
      suspendedRoles: afterResolved.suspendedRoles,
    },
    diff: diffSteps(before, after),
  };
}

// ───────────────────────── الحفظ ─────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** عدد حسابات الإدارة العليا النشطة غير المحذوفة، باستثناء مستخدمين معيّنين. */
async function countOtherActiveSuperusers(tx: Pick<Tx, "execute">, exceptUserIds: string | string[], inactive: Set<string>): Promise<number> {
  const names = SUPERUSERS.filter((n) => !inactive.has(n));
  if (names.length === 0) return 0;
  const except = Array.isArray(exceptUserIds) ? exceptUserIds : [exceptUserIds];
  const result = await tx.execute(sql`SELECT count(DISTINCT u.id)::int AS n FROM users u
    WHERE u.id NOT IN (${sqlList(except)}) AND u.deleted_at IS NULL
      AND NOT (u.status = 'banned' AND (u.banned_until IS NULL OR u.banned_until > now()))
      AND NOT (u.status = 'suspended' AND (u.suspended_until IS NULL OR u.suspended_until > now()))
      AND (u.role IN (${sqlList(names)}) OR EXISTS (
        SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = u.id AND r.name IN (${sqlList(names)})))`);
  return rowsOf<{ n: number }>(result)[0]?.n ?? 0;
}

const USER_ADMIN_LOCK_KEY = 0x55a3d1; // قفل استشاري واحد لكل تعديلات الأدوار والحالة

export interface SaveContext {
  ip?: string;
  userAgent?: string;
}

export async function saveUser(actor: ActorContext, id: string, payload: UserAdminSave, ctx: SaveContext) {
  const wantsRoles = payload.roleIds !== undefined;
  const wantsOverrides = payload.overrides !== undefined;
  const wantsStatus = payload.status !== undefined;
  const wantsProfile = !!payload.profile && Object.keys(payload.profile).length > 0;
  if (!wantsRoles && !wantsOverrides && !wantsStatus && !wantsProfile) {
    throw new UserAdminError(400, "لا توجد تغييرات للحفظ");
  }

  // صلاحيات عامة لكل جزء
  if (wantsProfile && !can(actor, "users.update")) throw new UserAdminError(403, "لا تملك صلاحية تعديل بيانات المستخدمين");
  if ((wantsRoles || wantsOverrides) && !can(actor, "users.change_role")) throw new UserAdminError(403, "لا تملك صلاحية تغيير الأدوار والصلاحيات");
  if (wantsStatus) {
    const action = payload.status!.action;
    const ok = action === "suspended" ? can(actor, "users.manage", "users.suspend")
      : action === "banned" ? can(actor, "users.manage", "users.ban")
      : can(actor, "users.manage", "users.suspend", "users.ban");
    if (!ok) throw new UserAdminError(403, "لا تملك صلاحية تغيير حالة الحساب");
  }

  const catalog = await loadRoleCatalog();
  const inactive = inactiveFromCatalog(catalog);
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const overrides = wantsOverrides ? sanitizeOverrides(payload.overrides!) : null;

  // الجوال: نفس تحقق المسار القديم (صيغة E.164 + عدم التكرار)، وتغييره يُسقط توثيقه.
  let phoneE164: string | null | undefined;
  if (wantsProfile && payload.profile!.phoneNumber !== undefined) {
    const check = await assertPhoneAvailable(payload.profile!.phoneNumber, id);
    if (!check.ok) throw new UserAdminError(409, check.message, "PHONE_UNAVAILABLE");
    phoneE164 = check.e164;
  }

  const audit: Array<Parameters<typeof logActivity>[0]> = [];
  let revokeSessions = false;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${USER_ADMIN_LOCK_KEY})`);
    const [u] = await tx.select().from(users).where(eq(users.id, id)).limit(1).for("update");
    if (!u || u.deletedAt) throw new UserAdminError(404, "المستخدم غير موجود");

    const assigned = await tx
      .select({ roleId: roles.id, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, id));
    const currentOverrides = await tx
      .select({ code: userPermissionOverrides.permissionCode, effect: userPermissionOverrides.effect })
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.userId, id));
    const signals: UserSignals = {
      legacyRole: u.role,
      roleIds: assigned.map((a) => a.roleId),
      roleNames: assigned.map((a) => a.name),
      overrides: currentOverrides.filter((o) => o.effect === "allow" || o.effect === "deny") as PermissionOverride[],
    };

    if (versionOf(u, signals) !== payload.expectedVersion) {
      throw new UserAdminError(409, "عدّل شخص آخر هذا المستخدم بعد أن فتحت الصفحة. حدّث الصفحة ثم أعد التعديل.", "STALE_VERSION");
    }

    const guard = guardTarget(actor, id, allRoleSignals(signals));
    // البيانات الأساسية أيضًا: تغيير جوال حساب أعلى رتبة يفتح الدخول إليه برمز الجوال.
    if (guard.blockedReason) {
      throw new UserAdminError(403, guard.blockedReason, "TARGET_PROTECTED");
    }

    // ── الأدوار
    let nextRoleIds = signals.roleIds;
    let nextNames = signals.roleNames;
    let nextLegacy = u.role;
    if (wantsRoles) {
      nextRoleIds = Array.from(new Set(payload.roleIds!));
      const missing = nextRoleIds.filter((rid) => !byId.has(rid));
      if (missing.length) throw new UserAdminError(400, "دور غير موجود");
      const held = new Set(signals.roleIds);
      const added = nextRoleIds.filter((rid) => !held.has(rid));
      const removed = signals.roleIds.filter((rid) => !nextRoleIds.includes(rid));
      for (const rid of [...added, ...removed]) {
        const role = byId.get(rid)!;
        const reason = assignabilityOf(actor, role, held.has(rid));
        if (reason) throw new UserAdminError(403, `${role.nameAr}: ${reason}`, "ROLE_NOT_ASSIGNABLE");
      }
      nextNames = nextRoleIds.map((rid) => byId.get(rid)!.name);
      nextLegacy = primaryRoleKey(mergeRoleSignals(nextNames));
    }

    // استثناء «منح» على خطوة محجوبة حجبًا ثابتًا لا أثر له؛ نرفضه بدل حفظ وهم.
    if (overrides && overrides.some((o) => o.effect === "allow")) {
      const proposed = describeSteps({
        legacyRole: nextLegacy, assignedRoles: nextNames, inactiveRoles: inactive,
        rolePermissions: rolePermissionsByName(catalog), overrides,
      });
      const locked = proposed.filter((st) => st.lockedBy.length > 0 && overrides.some((o) => o.code === st.code && o.effect === "allow"));
      if (locked.length) {
        throw new UserAdminError(400, `«منح» لا يعمل على خطوة محجوبة دائمًا لهذا الدور (${locked.map((l) => l.code).join("، ")}). أسند دورًا يمنحها.`, "LOCKED_STEP");
      }
    }

    // ── الحالة
    const nextStatus = wantsStatus ? payload.status!.action : null;

    // ── حارس آخر مدير
    const blocked = (st: string) => st === "banned" || st === "suspended";
    const superBefore = resolveUserPermissions({ legacyRole: u.role, assignedRoles: signals.roleNames, inactiveRoles: inactive, rolePermissions: {}, overrides: [] }).isSuperuser;
    const superAfter = resolveUserPermissions({ legacyRole: nextLegacy, assignedRoles: nextNames, inactiveRoles: inactive, rolePermissions: {}, overrides: [] }).isSuperuser;
    const blockedNow = blocked(effectiveStatus(u));
    const blockedNext = nextStatus === null ? blockedNow : nextStatus !== "active";
    if (superBefore && !blockedNow && !(superAfter && !blockedNext)
      && (await countOtherActiveSuperusers(tx, id, inactive)) === 0) {
      throw new UserAdminError(409, "هذا آخر حساب إداري نشط. أسند دور «مسؤول» لحساب آخر أولًا.", "LAST_ADMIN");
    }

    // ── الكتابة
    const now = new Date();
    if (wantsProfile) {
      const p = payload.profile!;
      const update: Partial<UserRow> = {};
      const before: Record<string, unknown> = {};
      const next = { ...p, ...(phoneE164 !== undefined ? { phoneNumber: phoneE164 } : {}) };
      for (const key of ["firstName", "lastName", "firstNameEn", "lastNameEn", "phoneNumber", "jobTitle", "department"] as const) {
        if (next[key] !== undefined && next[key] !== u[key]) {
          (update as Record<string, unknown>)[key] = next[key];
          before[key] = u[key];
        }
      }
      if (update.phoneNumber !== undefined) update.phoneVerified = false;
      if (Object.keys(update).length) {
        await tx.update(users).set(update).where(eq(users.id, id));
        if (update.firstName !== undefined || update.lastName !== undefined) {
          const full = `${update.firstName ?? u.firstName ?? ""} ${update.lastName ?? u.lastName ?? ""}`.trim();
          if (full) await tx.update(staff).set({ nameAr: full, name: full }).where(eq(staff.userId, id));
        }
        audit.push({ userId: actor.id, action: "user_profile_updated", entityType: "user", entityId: id, oldValue: before, newValue: update, metadata: { ...ctx } });
      }
    }

    if (wantsRoles) {
      const before = signals.roleNames.slice().sort();
      const after = nextNames.slice().sort();
      if (before.join() !== after.join() || u.role !== nextLegacy) {
        await tx.delete(userRoles).where(eq(userRoles.userId, id));
        if (nextRoleIds.length) {
          await tx.insert(userRoles).values(nextRoleIds.map((roleId) => ({ userId: id, roleId, assignedBy: actor.id })));
        }
        await tx.update(users).set({ role: nextLegacy }).where(eq(users.id, id));
        audit.push({
          userId: actor.id, action: "roles_updated", entityType: "user", entityId: id,
          oldValue: { roles: before, primaryRole: u.role }, newValue: { roles: after, primaryRole: nextLegacy },
          metadata: { ...ctx, reason: payload.reason },
        });
      }
    }

    if (overrides) {
      const beforeTrack = signals.overrides.filter((o) => TRACK_PERMISSION_CODES.includes(o.code));
      const key = (list: PermissionOverride[]) => list.map((o) => `${o.code}:${o.effect}`).sort().join();
      if (key(beforeTrack) !== key(overrides)) {
        await tx.delete(userPermissionOverrides).where(and(
          eq(userPermissionOverrides.userId, id),
          inArray(userPermissionOverrides.permissionCode, [...TRACK_PERMISSION_CODES]),
        ));
        if (overrides.length) {
          await tx.insert(userPermissionOverrides).values(overrides.map((o) => ({
            userId: id, permissionCode: o.code, effect: o.effect, grantedBy: actor.id, reason: payload.reason ?? null,
          })));
        }
        audit.push({
          userId: actor.id, action: "permission_overrides_updated", entityType: "user", entityId: id,
          oldValue: { overrides: beforeTrack }, newValue: { overrides }, metadata: { ...ctx, reason: payload.reason },
        });
      }
    }

    if (wantsStatus) {
      const st = payload.status!;
      const prevStatus = effectiveStatus(u);
      const until = "days" in st && st.days ? new Date(now.getTime() + st.days * 86_400_000) : null;
      if (st.action === "active") {
        await tx.update(users).set({ status: "active", suspendedUntil: null, suspensionReason: null, bannedUntil: null, banReason: null }).where(eq(users.id, id));
      } else if (st.action === "suspended") {
        await tx.update(users).set({ status: "suspended", suspendedUntil: until, suspensionReason: st.reason, bannedUntil: null, banReason: null }).where(eq(users.id, id));
        revokeSessions = true;
      } else {
        await tx.update(users).set({ status: "banned", bannedUntil: until, banReason: st.reason, suspendedUntil: null, suspensionReason: null }).where(eq(users.id, id));
        revokeSessions = true;
      }
      audit.push({
        userId: actor.id, action: "status_updated", entityType: "user", entityId: id,
        oldValue: { status: prevStatus, suspendedUntil: u.suspendedUntil, bannedUntil: u.bannedUntil },
        newValue: { status: st.action, until },
        metadata: { ...ctx, reason: "reason" in st ? st.reason : payload.reason },
      });
    }
  });

  invalidateUserPermissionCache(id);
  invalidateUserSessionCache(id);
  if (revokeSessions) await invalidateAllUserSessions(id);
  for (const entry of audit) await logActivity(entry);

  return getUserProfile(actor, id);
}

// ───────────────────────── الأدوار ─────────────────────────

async function roleHolderIds(roleId: string, roleName: string): Promise<string[]> {
  const result = await db.execute(sql`SELECT DISTINCT u.id FROM users u
    WHERE u.deleted_at IS NULL AND (u.role = ${roleName}
      OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = ${roleId}))`);
  return rowsOf<{ id: string }>(result).map((r) => r.id);
}

export async function listRoles() {
  const catalog = await loadRoleCatalog();
  const counts = rowsOf<{ role_id: string; n: number }>(
    await db.execute(sql`SELECT r.id AS role_id, count(DISTINCT u.id)::int AS n FROM roles r
      JOIN users u ON u.deleted_at IS NULL AND (u.role = r.name
        OR EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id))
      GROUP BY r.id`),
  );
  const countBy = new Map(counts.map((c) => [c.role_id, c.n]));
  const perms = rolePermissionsByName(catalog);
  return catalog.map((r) => {
    // الدور وحده، كأنه مفعّل، لعرض ما يمنحه في مصفوفة المقارنة.
    const input: ResolveInput = { legacyRole: r.name, assignedRoles: [r.name], inactiveRoles: new Set(), rolePermissions: perms, overrides: [] };
    const resolved = resolveUserPermissions(input);
    const steps = describeSteps(input, resolved);
    return {
      id: r.id,
      name: r.name,
      nameAr: r.nameAr,
      description: r.description,
      isSystem: r.isSystem,
      isProtected: isProtectedRoleName(r.name),
      status: r.status,
      userCount: countBy.get(r.id) ?? 0,
      permissionCount: resolved.isSuperuser ? null : resolved.permissions.size,
      publishLevel: publishLevelOf(resolved),
      steps: steps.map((s) => ({ code: s.code, granted: s.granted, locked: s.lockedBy.length > 0 })),
    };
  });
}

async function requireRole(roleId: string): Promise<CatalogRole> {
  const role = (await loadRoleCatalog()).find((r) => r.id === roleId);
  if (!role) throw new UserAdminError(404, "الدور غير موجود");
  return role;
}

/** أثر تغيير حالة دور على حامليه، يُعرض قبل التأكيد. */
export async function roleStatusImpact(roleId: string, to: RoleStatus) {
  const catalog = await loadRoleCatalog();
  const role = catalog.find((r) => r.id === roleId);
  if (!role) throw new UserAdminError(404, "الدور غير موجود");
  const holders = await roleHolderIds(role.id, role.name);
  const inactiveNow = inactiveFromCatalog(catalog);
  const inactiveNext = new Set(inactiveNow);
  if (INACTIVE_ROLE_STATUSES.includes(to)) inactiveNext.add(role.name);
  else inactiveNext.delete(role.name);

  const signals = await loadSignals(holders);
  let losing = 0;
  let gaining = 0;
  const leftWithoutEditorial: Array<{ id: string; name: string }> = [];
  const names = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(holders.length ? inArray(users.id, holders) : sql`false`);
  const nameOf = new Map(names.map((n) => [n.id, displayName(n)]));
  for (const [uid, s] of Array.from(signals.entries())) {
    const before = resolveUserPermissions(resolveInputFor(s, catalog, inactiveNow));
    const after = resolveUserPermissions(resolveInputFor(s, catalog, inactiveNext));
    const lost = before.isSuperuser !== after.isSuperuser ? before.isSuperuser : Array.from(before.permissions).some((p) => !after.permissions.has(p));
    const gained = before.isSuperuser !== after.isSuperuser ? after.isSuperuser : Array.from(after.permissions).some((p) => !before.permissions.has(p));
    if (lost) losing++;
    if (gained) gaining++;
    if (publishLevelOf(before) !== "none" && publishLevelOf(after) === "none") {
      leftWithoutEditorial.push({ id: uid, name: nameOf.get(uid) ?? uid });
    }
  }
  return {
    role: { id: role.id, nameAr: role.nameAr, status: role.status },
    to,
    holders: holders.length,
    losing,
    gaining,
    leftWithoutEditorial: leftWithoutEditorial.slice(0, 50),
    leftWithoutEditorialCount: leftWithoutEditorial.length,
  };
}

function assertRoleStatusChange(role: CatalogRole, to: RoleStatus) {
  if (isProtectedRoleName(role.name)) throw new UserAdminError(403, "أدوار الإدارة العليا لا تُعطَّل ولا تُغلق", "ROLE_PROTECTED");
  if (!canTransitionRoleStatus(role.status, to)) {
    throw new UserAdminError(400, `لا يمكن الانتقال من «${ROLE_STATUS_LABELS_AR[role.status]}» إلى «${ROLE_STATUS_LABELS_AR[to]}»`);
  }
}

export async function changeRoleStatus(actor: ActorContext, roleId: string, to: RoleStatus, reason: string, ctx: SaveContext) {
  const role = await requireRole(roleId);
  assertRoleStatusChange(role, to);
  const impact = await roleStatusImpact(roleId, to);
  try {
    await db.execute(sql`UPDATE roles SET status = ${to}, updated_at = now() WHERE id = ${roleId}`);
  } catch (error: unknown) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "42703") throw new UserAdminError(503, "حالة الأدوار غير مفعّلة بعد في قاعدة البيانات (ينقص ملف الهجرة 20261110_roles_status.sql)", "MIGRATION_PENDING");
    throw error;
  }
  invalidateInactiveRoleNames();
  for (const uid of await roleHolderIds(role.id, role.name)) {
    invalidateUserPermissionCache(uid);
    invalidateUserSessionCache(uid);
  }
  await logActivity({
    userId: actor.id, action: "role_status_updated", entityType: "role", entityId: roleId,
    oldValue: { status: role.status }, newValue: { status: to },
    metadata: { ...ctx, reason, holders: impact.holders, losing: impact.losing, leftWithoutEditorial: impact.leftWithoutEditorialCount },
  });
  return impact;
}

export async function updateRoleMeta(actor: ActorContext, roleId: string, meta: { nameAr: string; description: string | null }, ctx: SaveContext) {
  const role = await requireRole(roleId);
  await db.update(roles).set({ nameAr: meta.nameAr, description: meta.description, updatedAt: new Date() }).where(eq(roles.id, roleId));
  await logActivity({
    userId: actor.id, action: "role_updated", entityType: "role", entityId: roleId,
    oldValue: { nameAr: role.nameAr, description: role.description }, newValue: meta, metadata: { ...ctx },
  });
}

/** الحذف النهائي لدور لم يُسند قط؛ غير ذلك يُؤرشف. */
export async function deleteUnusedRole(actor: ActorContext, roleId: string, ctx: SaveContext) {
  const role = await requireRole(roleId);
  if (role.isSystem || isProtectedRoleName(role.name)) throw new UserAdminError(403, "أدوار النظام لا تُحذف", "ROLE_PROTECTED");
  const holders = await roleHolderIds(role.id, role.name);
  if (holders.length) throw new UserAdminError(409, `الدور مسند لـ${holders.length} مستخدم؛ أرشفه بدل حذفه`, "ROLE_IN_USE");
  const everAssigned = rowsOf<{ n: number }>(await db.execute(sql`SELECT count(*)::int AS n FROM activity_logs
    WHERE action = 'roles_updated' AND (old_value::text LIKE ${`%"${role.name}"%`} OR new_value::text LIKE ${`%"${role.name}"%`})`))[0]?.n ?? 0;
  if (everAssigned > 0) throw new UserAdminError(409, "أُسند هذا الدور سابقًا وله أثر في السجلات؛ أرشفه بدل حذفه", "ROLE_HAS_HISTORY");
  await db.delete(roles).where(eq(roles.id, roleId));
  await logActivity({ userId: actor.id, action: "role_deleted", entityType: "role", entityId: roleId, oldValue: { name: role.name, nameAr: role.nameAr }, metadata: { ...ctx } });
}

export { PUBLISH_LEVELS };

// ───────────────────────── حراسة المسارات القديمة ─────────────────────────
// مسارات /api/dashboard/users/* و/api/admin/users/* القديمة ما زالت تخدم التطبيقات
// والشاشات المؤقتة (‎-legacy). server/middleware/legacyUserActionGuard.ts يمرّرها
// عبر هذه الدوال حتى لا تبقى بابًا خلفيًا لما تمنعه الشاشة الجديدة.

export interface LegacyActionPlan {
  /** يمنع الدخول (تعليق، حظر، حذف). */
  blocksAccess: boolean;
  /** أسماء الأدوار بعد التغيير لكل الأهداف، أو undefined إن لم تتغير الأدوار. */
  nextRoleNames?: string[];
}

export async function checkLegacyUserAction(actorId: string, targetIds: string[], plan: LegacyActionPlan): Promise<void> {
  const ids = Array.from(new Set(targetIds.filter((x) => typeof x === "string" && x)));
  if (ids.length === 0) return;
  const [actor, catalog, signals] = await Promise.all([loadActor(actorId), loadRoleCatalog(), loadSignals(ids)]);
  const inactive = inactiveFromCatalog(catalog);
  const byName = new Map(catalog.map((r) => [r.name, r]));
  let losingSuper = false;
  for (const id of ids) {
    const s = signals.get(id);
    if (!s) continue;
    const guard = guardTarget(actor, id, allRoleSignals(s));
    if (guard.blockedReason) throw new UserAdminError(403, guard.blockedReason, "TARGET_PROTECTED");
    if (plan.nextRoleNames) {
      const held = new Set(allRoleSignals(s));
      for (const name of plan.nextRoleNames) {
        const role = byName.get(name);
        if (role && !held.has(name) && UNASSIGNABLE_ROLE_STATUSES.includes(role.status)) {
          throw new UserAdminError(403, `${role.nameAr}: الدور ${ROLE_STATUS_LABELS_AR[role.status]} ولا يُسند لمستخدمين جدد`, "ROLE_NOT_ASSIGNABLE");
        }
      }
    }
    const before = resolveUserPermissions({ legacyRole: s.legacyRole, assignedRoles: s.roleNames, inactiveRoles: inactive, rolePermissions: {}, overrides: [] }).isSuperuser;
    const after = plan.blocksAccess ? false : plan.nextRoleNames
      ? resolveUserPermissions({ legacyRole: primaryRoleKey(mergeRoleSignals(plan.nextRoleNames)), assignedRoles: plan.nextRoleNames, inactiveRoles: inactive, rolePermissions: {}, overrides: [] }).isSuperuser
      : before;
    if (before && !after) losingSuper = true;
  }
  if (losingSuper && (await countOtherActiveSuperusers(db, ids, inactive)) === 0) {
    throw new UserAdminError(409, "هذا آخر حساب إداري نشط. أسند دور «مسؤول» لحساب آخر أولًا.", "LAST_ADMIN");
  }
}

export async function snapshotLegacyTargets(ids: string[]) {
  if (ids.length === 0) return new Map<string, { status: string; role: string }>();
  const rows = await db.select().from(users).where(inArray(users.id, ids));
  return new Map(rows.map((u) => [u.id, { status: effectiveStatus(u), role: u.role }]));
}

export async function afterLegacyUserAction(params: {
  actorId: string;
  targetIds: string[];
  action: string;
  before: Map<string, { status: string; role: string }>;
  details: Record<string, unknown>;
  revokeSessions: boolean;
  ctx: SaveContext;
  log: boolean;
}): Promise<void> {
  const after = await snapshotLegacyTargets(params.targetIds);
  for (const id of params.targetIds) {
    invalidateUserPermissionCache(id);
    invalidateUserSessionCache(id);
    if (params.revokeSessions) await invalidateAllUserSessions(id);
    if (params.log) {
      await logActivity({
        userId: params.actorId, action: params.action, entityType: "user", entityId: id,
        oldValue: params.before.get(id), newValue: { ...after.get(id), ...params.details },
        metadata: { ...params.ctx, via: "legacy" },
      });
    }
  }
}
