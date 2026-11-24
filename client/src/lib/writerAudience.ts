// من هو «الكاتب» في لوحة التحكم: كاتب رأي أو مراسل. يقرر أين يُدار حسابه
// («ملفي وخدماتي» بدل «الملف الشخصي») ومن يرى جرس لوحة الكاتب.

type AudienceUser = { role?: string | null; roles?: string[] | null; permissions?: string[] | null } | null | undefined;

const WRITER_ROLES = ["opinion_author", "reporter"] as const;
/** أدوار لا تغيّر صفة الكاتب (حساب القارئ الأساسي). */
const NEUTRAL_ROLES = ["reader", "member", "user", "subscriber"];

function roleList(user: AudienceUser): string[] {
  if (!user) return [];
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return roles.length > 0 ? roles : user.role ? [user.role] : [];
}

/** يملك دور كاتب رأي أو مراسل (قد يملك أدوارًا أخرى أيضًا). */
export function hasWriterRole(user: AudienceUser): boolean {
  return roleList(user).some((r) => (WRITER_ROLES as readonly string[]).includes(r));
}

/** كاتب فقط: لا صلاحية شاملة ولا دور تحريري أو إداري إلى جانبه. */
export function isWriterOnly(user: AudienceUser): boolean {
  if (!hasWriterRole(user)) return false;
  if (Array.isArray(user?.permissions) && user!.permissions!.includes("*")) return false;
  return roleList(user).every(
    (r) => (WRITER_ROLES as readonly string[]).includes(r) || NEUTRAL_ROLES.includes(r),
  );
}

export const WRITER_ACCOUNT_PATH = "/dashboard/my-services#account";
