/** Escape a value used inside an XML attribute. */
export function escapeXmlAttribute(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;');
}

/** Escape a value used as ordinary XML text. */
export function escapeXmlText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Keep arbitrary text valid inside a CDATA section. */
export function cdata(value: unknown): string {
  return `<![CDATA[${String(value ?? '').replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/** Public Arabic article URLs use the short canonical slug when available. */
export function articleCanonicalUrl(baseUrl: string, article: { englishSlug?: string | null; slug: string }): string {
  return `${baseUrl}/article/${article.englishSlug || article.slug}`;
}
