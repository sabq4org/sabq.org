/**
 * Hardening for "link an OAuth identity onto an existing account by email".
 *
 * Pre-hijack (audit 2026-11-10): registration does not prove ownership of the
 * address, so an attacker could register victim@example.com with a password
 * of their own and simply wait. When the real owner later signed in with
 * Google/Apple the identity was attached to that same row — and the attacker's
 * password and live sessions kept working on the account the owner now uses.
 *
 * So when the identity is linked for the first time onto a row whose email was
 * never verified, whoever set its password is not known to own the address:
 * drop the password and (in the caller) revoke every session. The provider has
 * just vouched for the address, so it becomes verified. The owner can set a new
 * password through the normal reset flow.
 */
export interface LinkableAccount {
  emailVerified?: boolean | null;
  passwordHash?: string | null;
}

export interface UnverifiedLinkUpdates {
  passwordHash: null;
  emailVerified: true;
}

/** Returns the columns to reset, or null when the account needs no hardening. */
export function unverifiedLinkUpdates(account: LinkableAccount): UnverifiedLinkUpdates | null {
  if (account.emailVerified) return null;
  return { passwordHash: null, emailVerified: true };
}
