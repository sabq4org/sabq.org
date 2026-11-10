import type { PublishLevel, RoleStatus, StepState } from "@shared/userAdmin";

export const API = "/api/admin/user-admin";

export type UserKind = "staff" | "readers" | "all";
export type AccountStatus = "active" | "pending" | "suspended" | "banned" | "locked";

export interface RoleRef {
  id: string;
  name: string;
  nameAr: string;
  status: RoleStatus;
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
  roles: RoleRef[];
  publishLevel: PublishLevel;
  isSuperuser: boolean;
}

export interface ListResponse {
  items: ListedUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SummaryResponse {
  staff: number;
  readers: number;
  restricted: number;
  publishers: number;
}

export interface ProfileUser {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  firstNameEn: string | null;
  lastNameEn: string | null;
  email: string | null;
  phoneNumber: string | null;
  profileImageUrl: string | null;
  jobTitle: string | null;
  department: string | null;
  createdAt: string | null;
  lastActivityAt: string | null;
  emailVerified: boolean;
  status: string;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  bannedUntil: string | null;
  banReason: string | null;
  legacyRole: string | null;
}

export interface ProfileRole {
  id: string;
  name: string;
  nameAr: string;
  description: string | null;
  status: RoleStatus;
  isSuperuserRole: boolean;
  assigned: boolean;
  notAssignableReason: string | null;
}

export interface ResolvedInfo {
  isSuperuser: boolean;
  publishLevel: PublishLevel;
  activeRoles: string[];
  suspendedRoles: string[];
}

export interface OverrideItem {
  code: string;
  effect: "allow" | "deny";
}

export interface UserProfile {
  version: string;
  user: ProfileUser;
  roles: ProfileRole[];
  overrides: OverrideItem[];
  otherOverridesCount: number;
  resolved: ResolvedInfo;
  steps: StepState[];
  access: {
    isSelf: boolean;
    blockedReason: string | null;
    canEditProfile: boolean;
    canChangeRoles: boolean;
    canChangeStatus: boolean;
    canEditEmail: boolean;
  };
}

export interface PreviewResponse {
  steps: StepState[];
  resolved: ResolvedInfo;
  diff: { gained: string[]; lost: string[] };
}

export interface AdminRole {
  id: string;
  name: string;
  nameAr: string;
  description: string | null;
  isSystem: boolean;
  isProtected: boolean;
  status: RoleStatus;
  userCount: number;
  permissionCount: number | null;
  publishLevel: PublishLevel;
  steps: Array<{ code: string; granted: boolean; locked: boolean }>;
}

export interface RoleImpact {
  role: { id: string; nameAr: string; status: RoleStatus };
  to: RoleStatus;
  holders: number;
  losing: number;
  gaining: number;
  leftWithoutEditorial: Array<{ id: string; name: string }>;
  leftWithoutEditorialCount: number;
}

export type StatusDraft =
  | { action: "active" }
  | { action: "suspended"; days: number | null; reason: string }
  | { action: "banned"; days: number | null; reason: string };
