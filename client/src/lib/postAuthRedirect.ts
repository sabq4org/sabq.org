const POST_AUTH_RETURN_KEY = "sabq:post-auth-return:v1";
const MAJLIS_JOIN_INTENT_KEY = "sabq:gc-majlis-join-intent:v1";

const MAX_INTENT_AGE_MS = 30 * 60 * 1000;
const AUTH_PATHS = [
  "/login",
  "/register",
  "/logout",
  "/forgot-password",
  "/reset-password",
  "/set-password",
  "/verify-email",
  "/2fa-verify",
  "/admin/login",
];

type StoredReturn = { path: string; createdAt: number };
type StoredMajlisIntent = { code: string; createdAt: number };

function currentOrigin(): string {
  return typeof window === "undefined" ? "https://sabq.org" : window.location.origin;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isFresh(createdAt: unknown): createdAt is number {
  return typeof createdAt === "number" && Date.now() - createdAt <= MAX_INTENT_AGE_MS;
}

/**
 * يقبل وجهة داخل النطاق الحالي فقط، ويعيد pathname/search/hash. هذا الحارس
 * مشترك بين جميع مسارات الدخول حتى لا تتحول returnTo إلى open redirect.
 */
export function sanitizePostAuthReturn(raw: string | null | undefined, origin = currentOrigin()): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (raw.startsWith("//") || raw.includes("\\")) return null;

  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/")) return null;
    if (AUTH_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function rememberPostAuthReturn(raw: string): string | null {
  const path = sanitizePostAuthReturn(raw);
  const store = storage();
  if (!path || !store) return null;
  const value: StoredReturn = { path, createdAt: Date.now() };
  store.setItem(POST_AUTH_RETURN_KEY, JSON.stringify(value));
  return path;
}

/**
 * يحفظ الوجهة الحالية فقط عندما لا توجد رحلة مصادقة قائمة. يفيد حراس
 * إكمال الحساب التي قد تمر عبر /dashboard بعد OAuth؛ فلا تستبدل دعوة مجلس
 * سبق أن وافق المستخدم على استكمالها.
 */
export function rememberPostAuthReturnIfAbsent(raw: string): string | null {
  const pending = peekPostAuthReturn();
  return pending ?? rememberPostAuthReturn(raw);
}

export function peekPostAuthReturn(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const value = JSON.parse(store.getItem(POST_AUTH_RETURN_KEY) || "null") as StoredReturn | null;
    if (!value || !isFresh(value.createdAt)) {
      store.removeItem(POST_AUTH_RETURN_KEY);
      return null;
    }
    const path = sanitizePostAuthReturn(value.path);
    if (!path) store.removeItem(POST_AUTH_RETURN_KEY);
    return path;
  } catch {
    store.removeItem(POST_AUTH_RETURN_KEY);
    return null;
  }
}

export function consumePostAuthReturn(fallback = "/"): string {
  const store = storage();
  const path = peekPostAuthReturn();
  store?.removeItem(POST_AUTH_RETURN_KEY);
  return path ?? fallback;
}

export function normalizeMajlisInviteCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{4,8}$/.test(code) ? code : null;
}

/** يسجّل موافقة صريحة سبقت تسجيل الدخول؛ وجود code في الرابط وحده لا يكفي. */
export function rememberMajlisJoinIntent(rawCode: string): string | null {
  const code = normalizeMajlisInviteCode(rawCode);
  const store = storage();
  if (!code || !store) return null;
  const value: StoredMajlisIntent = { code, createdAt: Date.now() };
  store.setItem(MAJLIS_JOIN_INTENT_KEY, JSON.stringify(value));
  return code;
}

export function hasMajlisJoinIntent(rawCode: string): boolean {
  const code = normalizeMajlisInviteCode(rawCode);
  const store = storage();
  if (!code || !store) return false;
  try {
    const value = JSON.parse(store.getItem(MAJLIS_JOIN_INTENT_KEY) || "null") as StoredMajlisIntent | null;
    if (!value || !isFresh(value.createdAt)) {
      store.removeItem(MAJLIS_JOIN_INTENT_KEY);
      return false;
    }
    return value.code === code;
  } catch {
    store.removeItem(MAJLIS_JOIN_INTENT_KEY);
    return false;
  }
}

export function clearMajlisJoinIntent(): void {
  storage()?.removeItem(MAJLIS_JOIN_INTENT_KEY);
}
