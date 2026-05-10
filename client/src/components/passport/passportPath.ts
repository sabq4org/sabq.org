export type PassportLanguage = "ar" | "en" | "ur";

export function buildPassportPath(slug: string, language: PassportLanguage): string {
  if (language === "en") return `/en/article/${slug}/passport`;
  if (language === "ur") return `/ur/article/${slug}/passport`;
  return `/article/${slug}/passport`;
}
