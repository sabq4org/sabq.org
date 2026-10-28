/** Reader-chosen size for the article body text (the phone sheet's slider). */
export const ARTICLE_TEXT_SCALE_STEPS = [0.9, 1, 1.1, 1.2, 1.3] as const;
export const ARTICLE_TEXT_SCALE_PREF = "sabq:article-text-scale";

const LABELS: Record<number, string> = {
  0.9: "أصغر",
  1: "عادي",
  1.1: "كبير",
  1.2: "أكبر",
  1.3: "الأكبر",
};

export function normalizeArticleTextScale(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && (ARTICLE_TEXT_SCALE_STEPS as readonly number[]).includes(n) ? n : 1;
}

export function articleTextScaleLabel(scale: number): string {
  return LABELS[normalizeArticleTextScale(scale)];
}

export function readArticleTextScale(): number {
  try {
    return normalizeArticleTextScale(window.localStorage.getItem(ARTICLE_TEXT_SCALE_PREF));
  } catch {
    return 1;
  }
}

export function writeArticleTextScale(scale: number): void {
  try {
    window.localStorage.setItem(ARTICLE_TEXT_SCALE_PREF, String(normalizeArticleTextScale(scale)));
  } catch {
    // storage blocked (private mode): the choice lasts for this page only
  }
}
