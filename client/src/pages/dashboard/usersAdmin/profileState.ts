import type { StepState } from "@shared/userAdmin";
import type { OverrideItem, ProfileRole, UserProfile } from "./types";
import { PHONE_RE, STEP_LABELS } from "./format";

export type OverrideMap = Record<string, "allow" | "deny">;

export interface InfoDraft {
  firstName: string;
  lastName: string;
  firstNameEn: string;
  lastNameEn: string;
  phoneNumber: string;
  jobTitle: string;
  department: string;
}

export type StatusAction = "active" | "suspended" | "banned";

export interface StatusUi {
  action: StatusAction;
  /** "manual" أو عدد الأيام نصًا. */
  duration: string;
  reason: string;
  /** تعديل المدة أو السبب على حالة قائمة يعدّ تغييرًا. */
  touched: boolean;
}

export interface Draft {
  roleIds: string[];
  overrides: OverrideMap;
  info: InfoDraft;
  status: StatusUi;
}

export function toOverrideMap(list: OverrideItem[]): OverrideMap {
  return Object.fromEntries(list.map((o) => [o.code, o.effect]));
}

export function currentStatusAction(status: string): StatusAction {
  return status === "suspended" ? "suspended" : status === "banned" ? "banned" : "active";
}

export function baseDraft(p: UserProfile): Draft {
  const u = p.user;
  return {
    roleIds: p.roles.filter((r) => r.assigned).map((r) => r.id),
    overrides: toOverrideMap(p.overrides),
    info: {
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      firstNameEn: u.firstNameEn ?? "",
      lastNameEn: u.lastNameEn ?? "",
      phoneNumber: u.phoneNumber ?? "",
      jobTitle: u.jobTitle ?? "",
      department: u.department ?? "",
    },
    status: { action: currentStatusAction(u.status), duration: "manual", reason: "", touched: false },
  };
}

export function changedOverrideCodes(base: OverrideMap, cur: OverrideMap): string[] {
  const codes = new Set([...Object.keys(base), ...Object.keys(cur)]);
  return Array.from(codes).filter((c) => (base[c] ?? "role") !== (cur[c] ?? "role"));
}

export function changedRoleIds(base: string[], cur: string[]): string[] {
  return [...base.filter((r) => !cur.includes(r)), ...cur.filter((r) => !base.includes(r))];
}

export function changedInfoKeys(base: InfoDraft, cur: InfoDraft): Array<keyof InfoDraft> {
  return (Object.keys(cur) as Array<keyof InfoDraft>).filter((k) => base[k].trim() !== cur[k].trim());
}

export function statusChanged(profile: UserProfile, s: StatusUi): boolean {
  return s.action !== currentStatusAction(profile.user.status) || (s.action !== "active" && s.touched);
}

export function phoneError(value: string): string | null {
  const v = value.trim();
  if (!v || PHONE_RE.test(v)) return null;
  return "الرقم غير صحيح. اكتبه بصيغة 05XXXXXXXX";
}

export interface DirtyCounts {
  pub: number;
  roles: number;
  status: number;
  info: number;
  total: number;
}

export function countDirty(profile: UserProfile, draft: Draft, base: Draft, steps: StepState[]): DirtyCounts {
  const overrideChanged = new Set(changedOverrideCodes(base.overrides, draft.overrides));
  const before = new Map(profile.steps.map((s) => [s.code, s.granted]));
  steps.forEach((s) => {
    if (before.get(s.code) !== s.granted) overrideChanged.add(s.code);
  });
  const pub = overrideChanged.size;
  const roles = changedRoleIds(base.roleIds, draft.roleIds).length;
  const status = statusChanged(profile, draft.status) ? 1 : 0;
  const info = changedInfoKeys(base.info, draft.info).length;
  return { pub, roles, status, info, total: pub + roles + status + info };
}

/** مشاكل تمنع المراجعة. */
export function blockingIssues(profile: UserProfile, draft: Draft): string[] {
  const issues: string[] = [];
  if (phoneError(draft.info.phoneNumber)) issues.push("رقم الجوال غير صحيح");
  if (!draft.info.firstName.trim() && changedInfoKeys(baseDraft(profile).info, draft.info).includes("firstName")) {
    issues.push("الاسم الأول مطلوب");
  }
  if (statusChanged(profile, draft.status) && draft.status.action !== "active" && draft.status.reason.trim().length < 5) {
    issues.push("اكتب سبب تغيير الحالة (5 أحرف على الأقل)");
  }
  return issues;
}

export function buildPayload(profile: UserProfile, draft: Draft, generalReason: string) {
  const base = baseDraft(profile);
  const body: Record<string, unknown> = { expectedVersion: profile.version };

  const infoKeys = changedInfoKeys(base.info, draft.info);
  if (infoKeys.length > 0) {
    const info: Record<string, string | null> = {};
    const nullable = new Set<keyof InfoDraft>(["firstNameEn", "lastNameEn", "phoneNumber", "jobTitle", "department"]);
    for (const k of infoKeys) {
      const v = draft.info[k].trim();
      info[k] = v === "" && nullable.has(k) ? null : v;
    }
    body.profile = info;
  }
  if (changedRoleIds(base.roleIds, draft.roleIds).length > 0) body.roleIds = draft.roleIds;
  if (changedOverrideCodes(base.overrides, draft.overrides).length > 0) {
    body.overrides = Object.entries(draft.overrides).map(([code, effect]) => ({ code, effect }));
  }
  if (statusChanged(profile, draft.status)) {
    const s = draft.status;
    const days = s.duration === "manual" ? null : Number(s.duration);
    body.status = s.action === "active" ? { action: "active" } : { action: s.action, days, reason: s.reason.trim() };
  }
  if (generalReason.trim()) body.reason = generalReason.trim();
  return body;
}

// ───────────── نصوص المصدر والملخص ─────────────

export function roleNameAr(roles: ProfileRole[], name: string): string {
  return roles.find((r) => r.name === name)?.nameAr ?? name;
}

export function stepSource(step: StepState, roles: ProfileRole[]): { text: string; locked: boolean } {
  if (step.superuser) return { text: "كل الصلاحيات (حساب إداري)", locked: false };
  if (step.lockedBy.length > 0 && step.viaRoles.length === 0) {
    return { text: `محجوب دائمًا لدور ${roleNameAr(roles, step.lockedBy[0])}. لمنحه أسند دور «محرر».`, locked: true };
  }
  if (step.override === "deny") return { text: "استثناء شخصي: حجب", locked: false };
  if (step.override === "allow" && step.viaRoles.length === 0) return { text: "استثناء شخصي: منح", locked: false };
  if (step.viaRoles.length > 0) {
    const names = step.viaRoles.map((r) => roleNameAr(roles, r)).join("، ");
    return { text: step.granted ? `من دور: ${names}` : `يمنحها دور ${names} لكنها غير فعّالة حاليًا`, locked: false };
  }
  return { text: "لا يمنحها أي دور", locked: false };
}

export function summarize(steps: StepState[]): string {
  const y = (code: string) => steps.find((s) => s.code === code)?.granted ?? false;
  const can: string[] = [];
  if (y("articles.publish")) can.push("ينشر مباشرة");
  else if (y("articles.create")) can.push("يكتب ويرسل للمراجعة");
  if (y("articles.schedule")) can.push("يجدول");
  if (y("articles.edit_any")) can.push("يعدّل مواد الآخرين");
  if (y("opinion.review")) can.push("يراجع مقالات الرأي");
  if (y("social_publish.publish_now")) can.push("ينشر على X");
  const cant = ["articles.publish", "articles.edit_any", "articles.delete", "articles.unpublish"].filter((c) => !y(c)).map((c) => STEP_LABELS[c]);
  let s = `الصلاحيات: ${can.length ? can.join("، ") : "لا خطوة في مسار الخبر"}.`;
  if (cant.length) s += ` لا تشمل: ${cant.join("، ")}.`;
  return s;
}
