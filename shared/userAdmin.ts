/**
 * إدارة المستخدمين والأدوار — منطق صافٍ مشترك بين الخادم والواجهة.
 *
 * يعيد تركيب حساب الصلاحيات الفعلية من نفس اللبنات التي يستخدمها
 * server/rbac.ts (resolveEffectivePermissions + denyPermissionsForRoles)، فتعرض
 * شاشة المستخدم وتُعاين التغييرات قبل الحفظ بالنتيجة نفسها التي ستطبقها البوابات.
 */
import { z } from "zod";
import {
  SUPERUSER_ROLE_NAMES,
  ROLE_PERMISSION_DENY_MAP,
  SYSTEM_ADMIN_TIER_ROLES,
  getPermissionsForRoles,
  denyPermissionsForRoles,
  resolveEffectivePermissions,
} from "./rbac-constants";
import { READER_LIKE_ROLE_KEYS } from "./effectiveRoles";

// ───────────────────────── حالة الدور ─────────────────────────

/**
 * active   — يُسند وتعمل صلاحياته.
 * closed   — لا يُسند لمستخدمين جدد؛ حاملوه يحتفظون به وتعمل صلاحياته.
 * disabled — لا يُسند، وتتوقف صلاحياته عند كل حامليه (يبقى الإسناد محفوظًا).
 * archived — مثل disabled ويُخفى من القوائم الافتراضية.
 */
export const ROLE_STATUSES = ["active", "closed", "disabled", "archived"] as const;
export type RoleStatus = (typeof ROLE_STATUSES)[number];

export const ROLE_STATUS_LABELS_AR: Record<RoleStatus, string> = {
  active: "مفعّل",
  closed: "مغلق للإسناد",
  disabled: "معطّل",
  archived: "مؤرشف",
};

/** حالات تتوقف فيها صلاحيات الدور عند حامليه. */
export const INACTIVE_ROLE_STATUSES: readonly RoleStatus[] = ["disabled", "archived"];
/** حالات يُمنع فيها إسناد الدور لمستخدم لا يحمله. */
export const UNASSIGNABLE_ROLE_STATUSES: readonly RoleStatus[] = ["closed", "disabled", "archived"];

export function normalizeRoleStatus(value: unknown): RoleStatus {
  return (ROLE_STATUSES as readonly string[]).includes(String(value)) ? (value as RoleStatus) : "active";
}

/** أدوار الإدارة العليا لا تُعطَّل ولا تُغلق ولا تُؤرشف — وإلا فقد النظام من يديره. */
export function isProtectedRoleName(name: string): boolean {
  return (SUPERUSER_ROLE_NAMES as readonly string[]).includes(name);
}

/** الانتقالات المسموحة بين حالات الدور. الأرشيف يعود إلى «معطّل» فقط. */
export function canTransitionRoleStatus(from: RoleStatus, to: RoleStatus): boolean {
  if (from === to) return false;
  if (from === "archived") return to === "disabled";
  return true;
}

// ───────────────────────── مسار الخبر ─────────────────────────

export interface PermissionStep {
  code: string;
  label: string;
  hint?: string;
}

export interface PermissionTrack {
  key: string;
  label: string;
  steps: PermissionStep[];
}

/** الصلاحيات التي يعرضها ملف المستخدم مرتبة كخطوات في رحلة المادة. */
export const PERMISSION_TRACKS: PermissionTrack[] = [
  {
    key: "articles",
    label: "الأخبار والتقارير",
    steps: [
      { code: "articles.create", label: "كتابة مسودة" },
      { code: "articles.edit_own", label: "تعديل مواده" },
      { code: "articles.edit_any", label: "تعديل مواد الآخرين" },
      { code: "articles.publish", label: "النشر المباشر" },
      { code: "articles.schedule", label: "جدولة النشر", hint: "تُستخدم مع النشر المباشر" },
      { code: "articles.unpublish", label: "سحب المنشور" },
      { code: "articles.archive", label: "الأرشفة" },
      { code: "articles.delete", label: "الحذف" },
      { code: "articles.feature", label: "التمييز في الواجهة" },
      { code: "articles.hide_homepage", label: "إخفاء من الرئيسية" },
    ],
  },
  {
    key: "opinion",
    label: "مقالات الرأي",
    steps: [
      { code: "opinion.create", label: "كتابة مقال رأي" },
      { code: "opinion.submit_review", label: "إرسال للمراجعة" },
      { code: "opinion.review", label: "مراجعة مقالات الكتّاب" },
      { code: "opinion.publish", label: "نشر مقال الرأي" },
      { code: "opinion.reject", label: "رفض مقال الرأي" },
      { code: "opinion.edit_any", label: "تعديل مقالات الكتّاب" },
    ],
  },
  {
    key: "social",
    label: "النشر على X",
    steps: [
      { code: "social_publish.create", label: "إعداد منشور" },
      { code: "social_publish.publish_now", label: "النشر الفوري" },
      { code: "social_publish.schedule", label: "جدولة المنشور" },
    ],
  },
  {
    key: "tools",
    label: "أدوات المحرر",
    steps: [
      { code: "articles.ai_generate", label: "التوليد الذكي الشامل" },
      { code: "articles.generate_images", label: "توليد الصور" },
      { code: "articles.infographics", label: "الإنفوجرافيك" },
      { code: "articles.polls", label: "استطلاع الرأي" },
      { code: "articles.smart_links", label: "الروابط الذكية" },
      { code: "articles.content_type_selector", label: "اختيار نوع المحتوى" },
    ],
  },
];

export const TRACK_PERMISSION_CODES: readonly string[] = PERMISSION_TRACKS.flatMap((t) => t.steps.map((s) => s.code));

// ───────────────────────── مستوى النشر ─────────────────────────

/** أعلى ما يبلغه المستخدم في مسار الخبر — يغذّي عمود القائمة وفلترها. */
export const PUBLISH_LEVELS = ["none", "writes_opinion", "submits", "reviews_opinion", "publishes", "all"] as const;
export type PublishLevel = (typeof PUBLISH_LEVELS)[number];

export const PUBLISH_LEVEL_LABELS_AR: Record<PublishLevel, string> = {
  none: "بلا صلاحية تحرير",
  writes_opinion: "يكتب الرأي للمراجعة",
  submits: "يرسل للمراجعة",
  reviews_opinion: "يراجع الرأي",
  publishes: "ينشر مباشرة",
  all: "كل الصلاحيات",
};

export function publishLevelRank(level: PublishLevel): number {
  return PUBLISH_LEVELS.indexOf(level);
}

export function publishLevelOf(resolved: { isSuperuser: boolean; permissions: ReadonlySet<string> }): PublishLevel {
  if (resolved.isSuperuser) return "all";
  const p = resolved.permissions;
  if (p.has("articles.publish")) return "publishes";
  if (p.has("opinion.review") || p.has("opinion.publish")) return "reviews_opinion";
  if (p.has("articles.create")) return "submits";
  if (p.has("opinion.create")) return "writes_opinion";
  return "none";
}

// ───────────────────────── حساب الصلاحيات ─────────────────────────

export type OverrideEffect = "allow" | "deny";
export interface PermissionOverride {
  code: string;
  effect: OverrideEffect;
}

export interface ResolveInput {
  /** users.role (العمود النصي القديم). */
  legacyRole: string | null | undefined;
  /** أسماء أدوار user_roles كلها، بما فيها المعطّلة. */
  assignedRoles: string[];
  /** أسماء الأدوار المعطّلة أو المؤرشفة. */
  inactiveRoles: ReadonlySet<string>;
  /** صلاحيات كل دور من role_permissions، بالاسم. */
  rolePermissions: Readonly<Record<string, readonly string[]>>;
  overrides: readonly PermissionOverride[];
}

export interface ResolvedPermissions {
  isSuperuser: boolean;
  /** الأدوار التي تُحتسب فعليًا (بعد استبعاد المعطّل). */
  activeRoles: string[];
  /** الأدوار المسندة لكنها معطّلة. */
  suspendedRoles: string[];
  permissions: Set<string>;
}

/**
 * نسخة صافية من loadEffectivePermData + getUserPermissionData في server/rbac.ts.
 * أي تعديل هناك يجب أن ينعكس هنا؛ tests/unit/userAdmin.test.ts يثبّت التكافؤ.
 */
export function resolveUserPermissions(input: ResolveInput): ResolvedPermissions {
  const inactive = input.inactiveRoles;
  const assigned = uniq(input.assignedRoles);
  const activeAssigned = assigned.filter((r) => !inactive.has(r));
  const suspendedRoles = assigned.filter((r) => inactive.has(r));
  const legacy = input.legacyRole && !inactive.has(input.legacyRole) ? input.legacyRole : null;

  const isSuper = (r: string | null) => !!r && (SUPERUSER_ROLE_NAMES as readonly string[]).includes(r);
  const isSuperuser = isSuper(legacy) || activeAssigned.some(isSuper);
  const activeRoles = activeAssigned.length > 0 ? activeAssigned : [legacy || "reader"];

  if (isSuperuser) {
    return { isSuperuser, activeRoles: uniq([...(legacy ? [legacy] : []), ...activeAssigned]), suspendedRoles, permissions: new Set(["*"]) };
  }

  const dbCodes = new Set<string>();
  for (const r of activeAssigned) for (const code of input.rolePermissions[r] || []) dbCodes.add(code);
  for (const o of input.overrides) {
    if (o.effect === "allow") dbCodes.add(o.code);
    else dbCodes.delete(o.code);
  }
  const denyRoleNames = uniq([...(legacy ? [legacy] : []), ...activeAssigned]);
  const afterRoleDeny = denyPermissionsForRoles(denyRoleNames, Array.from(dbCodes));
  const denied = input.overrides.filter((o) => o.effect === "deny").map((o) => o.code);
  const final = resolveEffectivePermissions(activeRoles, afterRoleDeny, denied);
  return { isSuperuser, activeRoles, suspendedRoles, permissions: new Set(final) };
}

export function hasPermission(resolved: ResolvedPermissions, code: string): boolean {
  return resolved.isSuperuser || resolved.permissions.has(code);
}

export interface StepState {
  code: string;
  granted: boolean;
  /** الأدوار الفعّالة التي تمنح هذه الصلاحية (من قاعدة البيانات أو خريطة الكود). */
  viaRoles: string[];
  override: OverrideEffect | null;
  /** أدوار تحجبها حجبًا ثابتًا لا يرفعه استثناء شخصي. */
  lockedBy: string[];
  superuser: boolean;
}

/** حالة كل خطوة مع مصدرها، لعرضها في ملف المستخدم. */
export function describeSteps(input: ResolveInput, resolved = resolveUserPermissions(input)): StepState[] {
  const overrideBy = new Map(input.overrides.map((o) => [o.code, o.effect] as const));
  const legacy = input.legacyRole && !input.inactiveRoles.has(input.legacyRole) ? input.legacyRole : null;
  const denyRoleNames = uniq([...(legacy ? [legacy] : []), ...resolved.activeRoles]);
  return TRACK_PERMISSION_CODES.map((code) => {
    const viaRoles = resolved.activeRoles.filter(
      (r) => (input.rolePermissions[r] || []).includes(code) || getPermissionsForRoles([r]).includes(code),
    );
    const lockedBy = resolved.isSuperuser
      ? []
      : denyPermissionsForRoles(denyRoleNames, [code]).length === 0
        ? denyRoleNames.filter((r) => (ROLE_PERMISSION_DENY_MAP[r] || []).includes(code))
        : [];
    return {
      code,
      granted: hasPermission(resolved, code),
      viaRoles,
      override: overrideBy.get(code) ?? null,
      lockedBy,
      superuser: resolved.isSuperuser,
    };
  });
}

// ───────────────────────── تصنيف المستخدم ─────────────────────────

/** منسوب = يحمل أي دور غير «قارئ». */
export function isStaffBySignals(legacyRole: string | null | undefined, roleNames: string[]): boolean {
  return [legacyRole, ...roleNames].some((r) => !!r && !READER_LIKE_ROLE_KEYS.has(r.trim().toLowerCase()));
}

export function isSystemAdminTier(roleNames: readonly string[]): boolean {
  return roleNames.some((r) => SYSTEM_ADMIN_TIER_ROLES.includes(r));
}

// ───────────────────────── عقد الحفظ ─────────────────────────

export const ACCOUNT_STATUS_ACTIONS = ["active", "suspended", "banned"] as const;
export type AccountStatusAction = (typeof ACCOUNT_STATUS_ACTIONS)[number];

const reason = z.string().trim().min(5, "اكتب السبب (5 أحرف على الأقل)").max(500);

export const userAdminSaveSchema = z
  .object({
    /** بصمة الملف التي رآها المحرر؛ يُرفض الحفظ (409) إن عدّل غيره المستخدم في الأثناء. */
    expectedVersion: z.string().min(8).max(128),
    profile: z
      .object({
        firstName: z.string().trim().max(80).optional(),
        lastName: z.string().trim().max(80).optional(),
        firstNameEn: z.string().trim().max(80).nullable().optional(),
        lastNameEn: z.string().trim().max(80).nullable().optional(),
        phoneNumber: z
          .string()
          .trim()
          .regex(/^(05\d{8}|\+9665\d{8})$/, "الرقم غير صحيح. اكتبه بصيغة 05XXXXXXXX")
          .nullable()
          .optional()
          .or(z.literal("").transform(() => null)),
        jobTitle: z.string().trim().max(120).nullable().optional(),
        department: z.string().trim().max(120).nullable().optional(),
      })
      .strict()
      .optional(),
    roleIds: z.array(z.string().min(1)).max(12).optional(),
    /** القائمة الكاملة لاستثناءات خطوات المسار؛ ما لم يُذكر من رموز المسار يُزال. */
    overrides: z
      .array(z.object({ code: z.string().min(1), effect: z.enum(["allow", "deny"]) }))
      .max(TRACK_PERMISSION_CODES.length)
      .optional(),
    status: z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("active") }),
        z.object({ action: z.literal("suspended"), days: z.number().int().min(1).max(365).nullable(), reason }),
        z.object({ action: z.literal("banned"), days: z.number().int().min(1).max(3650).nullable(), reason }),
      ])
      .optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export type UserAdminSave = z.infer<typeof userAdminSaveSchema>;

export const userAdminPreviewSchema = z
  .object({
    roleIds: z.array(z.string().min(1)).max(12),
    overrides: z.array(z.object({ code: z.string().min(1), effect: z.enum(["allow", "deny"]) })).max(TRACK_PERMISSION_CODES.length),
  })
  .strict();

export const roleStatusChangeSchema = z
  .object({ status: z.enum(ROLE_STATUSES), reason: z.string().trim().min(5, "اكتب السبب (5 أحرف على الأقل)").max(500) })
  .strict();

export const roleMetaSchema = z
  .object({
    nameAr: z.string().trim().min(2).max(60),
    description: z.string().trim().max(300).nullable(),
  })
  .strict();

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
