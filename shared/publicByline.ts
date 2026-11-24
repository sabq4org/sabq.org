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
