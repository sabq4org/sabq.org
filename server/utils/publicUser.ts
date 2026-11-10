/**
 * Strips server-owned secrets from a `users` row before it goes to a client.
 *
 * The codebase already had an ad-hoc version of this inline:
 *   const { passwordHash, twoFactorSecret, ...safeUser } = user;
 * It stripped two fields and missed `twoFactorBackupCodes` and `fcmToken` —
 * which is exactly how the audit found redeemable 2FA backup codes being
 * shipped to browsers. A one-off destructure at each call site cannot stay
 * correct as the table grows; this constant plus the drift test in
 * tests/unit/publicUser.test.ts is what keeps it correct.
 *
 * NOTE ON THE 2FA FIELDS: `twoFactorSecret` and `twoFactorBackupCodes` are
 * stored in cleartext (server/routes/twoFactorRoutes.ts feeds them straight to
 * verifyToken/verifyBackupCode), so leaking either is a permanent 2FA bypass
 * for that account — not merely an information disclosure.
 */

/** Columns that must never reach a client, for any user, ever. */
export const SENSITIVE_USER_FIELDS = [
  "passwordHash",
  "twoFactorSecret",
  "twoFactorBackupCodes",
  "fcmToken",
] as const;

export type PublicUser<T extends Record<string, unknown>> = Omit<
  T,
  (typeof SENSITIVE_USER_FIELDS)[number]
>;

/**
 * Returns a copy of the row without the sensitive columns.
 *
 * A denylist rather than an allowlist, deliberately: `/api/auth/user` feeds the
 * whole dashboard (role, permissions, publisher link, language flags, profile
 * completion…) and an allowlist would silently drop a field some screen needs.
 * The safety net for the denylist's weakness — a new secret column being added
 * and forgotten — is the drift test, which fails when `users` gains a
 * password/secret/token/hash-shaped column that is not listed here.
 */
export function toPublicUser<T extends Record<string, any>>(user: T): PublicUser<T>;
export function toPublicUser<T extends Record<string, any>>(user: T | null | undefined): PublicUser<T> | null;
export function toPublicUser<T extends Record<string, any>>(user: T | null | undefined) {
  if (!user) return null;
  const out: Record<string, unknown> = { ...user };
  for (const field of SENSITIVE_USER_FIELDS) delete out[field];
  return out as PublicUser<T>;
}

/** The only columns an anonymous visitor may see about another user. */
export const PUBLIC_PROFILE_FIELDS = [
  "id",
  "firstName",
  "lastName",
  "firstNameEn",
  "lastNameEn",
  "profileImageUrl",
  "bio",
] as const;

export type PublicProfile = Partial<Record<(typeof PUBLIC_PROFILE_FIELDS)[number], unknown>>;

/**
 * Allowlist projection for surfaces that anyone can read (follower lists,
 * assignment bylines). Unlike `toPublicUser` it also drops email, phone, role
 * and every other column: a public reader has no business seeing them.
 */
export function toPublicProfile(user: Record<string, any> | null | undefined): PublicProfile | null {
  if (!user) return null;
  const out: PublicProfile = {};
  for (const field of PUBLIC_PROFILE_FIELDS) {
    if (user[field] !== undefined) out[field] = user[field];
  }
  return out;
}

/**
 * Removes the sensitive columns from every object nested in `value`.
 *
 * For legacy `storage.ts` queries that join the whole `users` row under an
 * arbitrary key (`createdBy`, `assignedTo`, `reporter`…) and cannot be changed
 * at the source while that file is frozen. Returns a copy; Dates and other
 * non-plain objects pass through untouched.
 */
export function stripSensitiveUserFields<T>(value: T, depth = 0): T {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitiveUserFields(item, depth + 1)) as unknown as T;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if ((SENSITIVE_USER_FIELDS as readonly string[]).includes(key)) continue;
    out[key] = stripSensitiveUserFields(inner, depth + 1);
  }
  return out as T;
}
