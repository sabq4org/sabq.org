/**
 * «قفل المسودات»: قفل دائم يضعه محرر على مسودة فلا يعدّلها أو ينشرها أو
 * يجدولها أو يؤرشفها أو يحذفها أحد غيره حتى يفكّه. يختلف عن قفل التحرير
 * المؤقت (article_edit_locks، عشر دقائق مع النبض).
 *
 * القفل فعّال ما دامت المادة مسودة فقط. مسؤول النظام («*») يفك قفل زميل
 * بسبب مكتوب، ويصل صاحب القفل إشعار، ويُسجَّل في سجل المقال.
 */

export const DRAFT_LOCK_NOTE_MAX = 200;
export const DRAFT_LOCK_REASON_MIN = 3;
export const DRAFT_LOCK_REASON_MAX = 300;
export const DRAFT_LOCKED_CODE = "DRAFT_LOCKED" as const;

export interface DraftLockFields {
  status?: string | null;
  draftLockedBy?: string | null;
  draftLockedByName?: string | null;
  draftLockedAt?: Date | string | null;
  draftLockNote?: string | null;
}

export interface DraftLockState {
  locked: boolean;
  lockedBy: { id: string; name: string } | null;
  lockedAt: string | null;
  note: string | null;
  isOwner: boolean;
}

/** القفل لا يعمل إلا على مسودة. */
export function isDraftLockActive(article: DraftLockFields | null | undefined): boolean {
  return Boolean(article?.draftLockedBy) && article?.status === "draft";
}

/** هل يمنع القفلُ هذا المستخدم من الكتابة على المادة؟ */
export function draftLockBlocksUser(article: DraftLockFields | null | undefined, userId: string | null | undefined): boolean {
  if (!isDraftLockActive(article)) return false;
  return !userId || article!.draftLockedBy !== userId;
}

/** فك قفل زميل: لمسؤول النظام وحده (صلاحية «*»). */
export function canOverrideDraftLock(permissions: readonly string[]): boolean {
  return permissions.includes("*");
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function draftLockState(article: DraftLockFields | null | undefined, userId: string | null | undefined): DraftLockState {
  if (!isDraftLockActive(article)) {
    return { locked: false, lockedBy: null, lockedAt: null, note: null, isOwner: false };
  }
  const id = article!.draftLockedBy!;
  return {
    locked: true,
    lockedBy: { id, name: article!.draftLockedByName?.trim() || "محرر" },
    lockedAt: iso(article!.draftLockedAt),
    note: article!.draftLockNote?.trim() || null,
    isOwner: Boolean(userId) && id === userId,
  };
}

export function draftLockedMessage(lockedByName: string | null | undefined): string {
  return `هذه المسودة مقفلة لدى ${lockedByName?.trim() || "محرر آخر"}. لا يمكن تعديلها أو نشرها أو جدولتها أو حذفها حتى يفك القفل.`;
}

export function normalizeDraftLockNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.replace(/\s+/g, " ").trim();
  return note ? note.slice(0, DRAFT_LOCK_NOTE_MAX) : null;
}

/** سبب فك قفل زميل: مطلوب، ومن 3 إلى 300 حرف. */
export function normalizeOverrideReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const reason = raw.replace(/\s+/g, " ").trim();
  if (reason.length < DRAFT_LOCK_REASON_MIN) return null;
  return reason.slice(0, DRAFT_LOCK_REASON_MAX);
}

export type DraftLockSurface = "web" | "mobile";

const ID = "([^/]+)";
const WEB_RULES: Array<{ methods: string[]; pattern: RegExp }> = [
  // تعديل المسودة وحذفها وكل أفعالها من اللوحة
  { methods: ["PATCH", "PUT", "DELETE"], pattern: new RegExp(`^/api/admin/articles/${ID}$`) },
  { methods: ["POST", "PATCH", "PUT", "DELETE"], pattern: new RegExp(`^/api/admin/articles/${ID}/(publish|request-revision|feature|archive|restore|translate-to-english|toggle-breaking|permanent|resend-notification|angles|revisions|versions)(/.*)?$`) },
  // أخذ قفل التحرير المؤقت يعني فتح المحرر للكتابة
  { methods: ["POST"], pattern: new RegExp(`^/api/admin/articles/${ID}/lock$`) },
  { methods: ["PUT", "DELETE"], pattern: new RegExp(`^/api/dashboard/articles/${ID}$`) },
  { methods: ["POST"], pattern: new RegExp(`^/api/my/articles/${ID}/submit-review$`) },
  { methods: ["POST"], pattern: new RegExp(`^/api/articles/${ID}/(auto-categorize|media-assets)$`) },
  { methods: ["POST", "DELETE"], pattern: new RegExp(`^/api/articles/${ID}/tags(/.*)?$`) },
  { methods: ["POST"], pattern: new RegExp(`^/api/admin/opinion-writers/schedule-article/${ID}$`) },
];
const MOBILE_RULES: Array<{ methods: string[]; pattern: RegExp }> = [
  { methods: ["PATCH", "DELETE"], pattern: new RegExp(`^/admin/articles/${ID}$`) },
  { methods: ["POST", "DELETE"], pattern: new RegExp(`^/admin/articles/${ID}/(publish|archive|request-revision|permanent)$`) },
  { methods: ["PUT"], pattern: new RegExp(`^/articles/${ID}/resubmit$`) },
];
const WEB_BULK = new Set(["/api/admin/articles/bulk-archive", "/api/admin/articles/bulk-delete-permanent"]);
const NOT_AN_ID = new Set(["bulk-archive", "bulk-delete-permanent", "update-order", "metrics", "draft-locks"]);

/**
 * المواد التي يمسّها طلب كتابة، لفحص القفل قبل وصوله لمعالجه.
 * null = الطلب لا يكتب على مادة بعينها.
 */
export function draftLockTargets(surface: DraftLockSurface, method: string, path: string, body?: unknown): string[] | null {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "OPTIONS") return null;
  const cleanPath = path.split("?")[0].replace(/\/+$/, "");
  if (surface === "web" && verb === "POST" && WEB_BULK.has(cleanPath)) {
    const ids = (body as { articleIds?: unknown; ids?: unknown } | undefined)?.articleIds
      ?? (body as { ids?: unknown } | undefined)?.ids;
    if (!Array.isArray(ids)) return null;
    const list = ids.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 500);
    return list.length ? list : null;
  }
  for (const rule of surface === "web" ? WEB_RULES : MOBILE_RULES) {
    if (!rule.methods.includes(verb)) continue;
    const match = rule.pattern.exec(cleanPath);
    if (!match) continue;
    const id = decodeURIComponent(match[1]);
    if (NOT_AN_ID.has(id)) return null;
    return [id];
  }
  return null;
}
