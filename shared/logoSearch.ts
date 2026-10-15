/**
 * توحيد النص العربي للبحث في مكتبة الشعارات (logos.search_text).
 * طبّقه على نص البحث وعلى المخزَّن معًا، وإلا لن تتطابق «القابضة» مع «القابضه».
 */
export function normalizeArabicForSearch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "") // الحركات والتطويل
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildLogoSearchText(title: string, tags: readonly string[]): string {
  return normalizeArabicForSearch([title, ...tags].join(" "));
}
