// فئات المدعوين في الاجتماعات — منطق نقي مشترك بين الخادم والواجهة.
// المضيف يجمع فئات أدوار (المراسلون، كتّاب الرأي…) وإدارات وأسماء متفرقة؛
// عند الإنشاء تُحوَّل كلها إلى قائمة أسماء واحدة بلا تكرار (لقطة وقت الإنشاء).

export const MEETING_ROLE_GROUPS = [
  { id: "reporter", label: "المراسلون", roles: ["reporter"] },
  { id: "opinion_author", label: "كتّاب الرأي", roles: ["opinion_author"] },
  { id: "editor", label: "المحررون", roles: ["editor"] },
  { id: "content_manager", label: "مديرو المحتوى", roles: ["content_manager"] },
] as const;

export type MeetingRoleGroupId = (typeof MEETING_ROLE_GROUPS)[number]["id"];

export const MEETING_ROLE_GROUP_IDS = MEETING_ROLE_GROUPS.map((g) => g.id) as MeetingRoleGroupId[];

/** كل أسماء الأدوار التي تغطيها الفئات — يقرؤها الخادم لجلب أصحابها */
export const MEETING_GROUP_ROLE_NAMES: string[] = Array.from(
  new Set(MEETING_ROLE_GROUPS.flatMap((g) => [...g.roles])),
);

export interface InviteeCandidate {
  userId: string;
  roles: string[];
  departmentId: string | null;
}

export interface InviteeSelection {
  roleGroups?: string[];
  departmentIds?: string[];
  memberIds?: string[];
}

export function roleGroupMembers(staff: InviteeCandidate[], groupId: string): string[] {
  const group = MEETING_ROLE_GROUPS.find((g) => g.id === groupId);
  if (!group) return [];
  const wanted = new Set<string>(group.roles);
  return staff.filter((s) => s.roles.some((r) => wanted.has(r))).map((s) => s.userId);
}

export function departmentMembers(staff: InviteeCandidate[], departmentId: string): string[] {
  return staff.filter((s) => s.departmentId === departmentId).map((s) => s.userId);
}

/**
 * يجمع الفئات والإدارات والأسماء في قائمة واحدة بلا تكرار.
 * viaGroup: من دخل عبر فئة أو إدارة (للواجهة: «ضمن فئة»).
 * extraNames: الأسماء المختارة يدوياً وليست ضمن أي فئة مختارة.
 */
export function resolveMeetingInvitees(
  staff: InviteeCandidate[],
  selection: InviteeSelection,
): { userIds: string[]; viaGroup: Set<string>; extraNames: number } {
  const viaGroup = new Set<string>();
  for (const g of selection.roleGroups ?? []) {
    for (const id of roleGroupMembers(staff, g)) viaGroup.add(id);
  }
  for (const d of selection.departmentIds ?? []) {
    for (const id of departmentMembers(staff, d)) viaGroup.add(id);
  }
  const all = new Set<string>(viaGroup);
  let extraNames = 0;
  for (const id of selection.memberIds ?? []) {
    if (!all.has(id)) {
      all.add(id);
      extraNames += 1;
    }
  }
  return { userIds: Array.from(all), viaGroup, extraNames };
}
