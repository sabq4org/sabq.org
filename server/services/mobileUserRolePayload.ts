// حمولة الدور لتطبيق الموبايل — مصدر واحد لـ login / register / profile.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { roles, userRoles } from "@shared/schema";
import { isReaderLikeRole, mergeRoleSignals, normalizeRoleKey, primaryRoleKey } from "@shared/effectiveRoles";
import { inferStaffRolesFromWork } from "./staffRoleInference";

const MOBILE_ROLE_LABELS: Record<string, string> = {
  system_admin: "مدير النظام",
  admin: "مسؤول",
  editor: "محرر",
  editor_in_chief: "رئيس التحرير",
  senior_editor: "محرر أول",
  reporter: "مراسل",
  correspondent: "مراسل",
  journalist: "صحفي",
  writer: "كاتب",
  author: "كاتب",
  article_writer: "كاتب مقال",
  article_author: "كاتب مقال",
  opinion_author: "كاتب مقال رأي",
  columnist: "كاتب عمود",
  managing_editor: "مدير تحرير",
  editorial_manager: "مدير تحرير",
  content_manager: "مدير محتوى",
  comments_moderator: "مشرف تعليقات",
  moderator: "مشرف",
  media_manager: "مدير وسائط",
  publisher: "ناشر",
  photographer: "مصور",
  contributor: "مساهم",
  reader: "قارئ",
};

export async function buildUserRolePayload(
  userId: string,
  legacyRole?: string | null,
  jobTitle?: string | null,
) {
  const rbacRoles = await db
    .select({ name: roles.name, nameAr: roles.nameAr })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  let merged = mergeRoleSignals(rbacRoles.map((r) => r.name), legacyRole);
  if (merged.every((role) => isReaderLikeRole(role)) && jobTitle?.trim()) {
    const inferred = await inferStaffRolesFromWork(userId);
    if (inferred.length > 0) {
      merged = mergeRoleSignals([...rbacRoles.map((r) => r.name), ...inferred], legacyRole);
    }
  }

  const effectiveRoleKey = primaryRoleKey(merged);
  const matchingRbac = rbacRoles.find((r) => normalizeRoleKey(r.name) === effectiveRoleKey);
  const explicitRoleLabel =
    matchingRbac?.nameAr ||
    MOBILE_ROLE_LABELS[effectiveRoleKey] ||
    (jobTitle?.trim() ? jobTitle.trim() : null) ||
    legacyRole ||
    "قارئ";

  return {
    role: effectiveRoleKey,
    roleLabel: explicitRoleLabel,
    membershipLabel: explicitRoleLabel,
    roles: rbacRoles.map((r) => ({ key: r.name, displayName: r.nameAr })),
  };
}
