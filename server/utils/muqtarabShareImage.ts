/** أولوية صورة المشاركة لمواضيع/زوايا مُقترب */
export function pickMuqtarabShareImageRaw(...candidates: Array<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function toAbsoluteShareImage(
  raw: string | null | undefined,
  baseUrl: string,
  ensureAbsoluteUrl: (url: string, base: string) => string,
  fallbackPath = "/branding/sabq-og-image.png",
): string {
  const picked = pickMuqtarabShareImageRaw(raw);
  if (picked) return ensureAbsoluteUrl(picked, baseUrl);
  return `${baseUrl}${fallbackPath}`;
}
