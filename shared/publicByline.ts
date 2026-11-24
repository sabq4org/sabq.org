// منطق صافٍ لصفة الكاتب وسيرته العامة — يستخدمه server/services/publicBylineService.ts.

export type PublicStaffType = "reporter" | "opinion_author";

/** الأدوار التي لها صفحة كاتب عامة، بالأولوية: كاتب الرأي قبل المراسل. */
export function pickPublicStaffType(roleNames: readonly string[]): PublicStaffType | null {
  if (roleNames.includes("opinion_author")) return "opinion_author";
  if (roleNames.includes("reporter")) return "reporter";
  return null;
}

/** نص النبذة كما يُحفظ للعامة: يقص المسافات، والفارغ يعني «لا شيء». */
export function normalizePublicBio(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\r\n/g, "\n").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** مفاتيح كاش ملف الكاتب لكل لغة ونافذة (المفتاح يقبل slug أو userId). */
export function reporterProfileCachePatterns(tokens: Array<string | null | undefined>): string[] {
  return Array.from(new Set(tokens.filter((t): t is string => !!t && t.length > 0))).map(
    (token) => `^reporter:profile:v3:[a-z]+:${escapeRegex(token)}:`,
  );
}

/** حدود «صفتك تحت اسمك»: الصفة سطر واحد، والنبذة فقرة قصيرة. */
export const PUBLIC_TITLE_MAX = 40;
export const PUBLIC_BIO_MAX = 600;

export const PUBLIC_BYLINE_STATUSES = ["pending", "needs_changes", "approved", "withdrawn"] as const;
export type PublicBylineStatus = (typeof PUBLIC_BYLINE_STATUSES)[number];

/** يقص المسافات ويوحّد الأسطر في الصفة (سطر واحد بلا فواصل). */
export function normalizePublicTitle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length > 0 ? oneLine : null;
}

export type PublicBylineValidation =
  | { ok: true; titleAr: string | null; bioAr: string | null }
  | { ok: false; message: string };

/** تحقق طلب الكاتب: نص واحد على الأقل، وضمن الحدود. */
export function validatePublicBylineInput(input: { titleAr?: unknown; bioAr?: unknown }): PublicBylineValidation {
  const titleAr = normalizePublicTitle(input.titleAr);
  const bioAr = normalizePublicBio(input.bioAr);
  if (!titleAr && !bioAr) return { ok: false, message: "اكتب صفتك أو نبذتك" };
  if (titleAr && titleAr.length > PUBLIC_TITLE_MAX) {
    return { ok: false, message: `الصفة لا تتجاوز ${PUBLIC_TITLE_MAX} حرفًا` };
  }
  if (bioAr && bioAr.length > PUBLIC_BIO_MAX) {
    return { ok: false, message: `النبذة لا تتجاوز ${PUBLIC_BIO_MAX} حرف` };
  }
  return { ok: true, titleAr, bioAr };
}
