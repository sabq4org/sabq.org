// Password policy used at every password-setting route in the codebase.
// Security audit M6 (2026-05-11): the codebase had min 6 in three places
// and min 8 in one; consolidated here.
//
// Banned list is a curated subset of the most commonly leaked passwords —
// not a replacement for haveibeenpwned-style checks, but it catches the
// 80% of trivial choices that account for most credential-stuffing
// success in real-world breaches.

export const PASSWORD_MIN_LENGTH = 8;

const BANNED_LOWERCASED = new Set<string>([
  "12345678", "123456789", "1234567890", "password", "password1",
  "password123", "qwerty123", "qwertyuiop", "admin123", "admin1234",
  "welcome123", "letmein", "letmein123", "iloveyou", "monkey123",
  "abc12345", "11111111", "00000000", "passw0rd", "p@ssw0rd",
  "p@ssword", "trustno1", "12341234", "asdfasdf", "qazwsx123",
  "zaq12wsx", "1qaz2wsx", "1q2w3e4r", "1q2w3e4r5t", "qwerty1234",
  // Arabic-keyboard common picks (the same physical keys, Arabic layout)
  "ابتنمكي", "ضصثقفغ", "شسيبل",
  // Sabq-specific (don't let admin set these)
  "sabq1234", "sabq2024", "sabq2025", "sabq2026", "sabqsabq",
]);

export interface PasswordValidationResult {
  ok: boolean;
  /** Arabic message safe to surface to the user. */
  message?: string;
}

export function validatePassword(pw: unknown): PasswordValidationResult {
  if (typeof pw !== "string") {
    return { ok: false, message: "كلمة المرور مطلوبة" };
  }
  if (pw.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `كلمة المرور يجب أن تكون ${PASSWORD_MIN_LENGTH} أحرف على الأقل` };
  }
  if (pw.length > 128) {
    return { ok: false, message: "كلمة المرور طويلة جداً (الحد 128 حرفاً)" };
  }
  if (BANNED_LOWERCASED.has(pw.toLowerCase())) {
    return { ok: false, message: "كلمة المرور هذه شائعة جداً ومُسرّبة في كشوفات معروفة. اختر كلمة مرور أقوى" };
  }
  return { ok: true };
}
