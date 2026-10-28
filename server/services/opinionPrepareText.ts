// منطق نقي لـ«جهّز وجدول» (بلا قاعدة بيانات ولا ذكاء): تطبيق تصحيحات التدقيق
// على HTML المقال، وتحليل رد الملحقات. مختبَر في tests/unit/opinionPrepareText.test.ts.

export interface TextFix {
  original: string;
  suggestion: string;
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}_]/u;
const BLOCK_TAG = /^<\/?(p|div|h[1-6]|li|ul|ol|blockquote|br|hr|tr|td|th|table|figure|figcaption|section|article|img|iframe)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * يطبّق تصحيحات التدقيق على النص المرئي فقط: لا يلمس الوسوم ولا السمات ولا
 * الروابط ولا script/style، ويستبدل الكلمة كاملة (حدود كلمة على الجانبين، وعبر
 * الوسوم السطرية مثل <b>). مطابقة تعبر وسماً أو كيان HTML تُترك كما هي.
 */
export function applyTextFixesToHtml(html: string, fixes: TextFix[]): { html: string; applied: number } {
  const parts = html.split(/(<[^>]*>)/);
  const isTag = (i: number) => i % 2 === 1;
  const skipped = new Set<number>();
  let rawTag: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    if (isTag(i)) {
      const open = /^<(script|style)\b/i.exec(parts[i]);
      if (!rawTag && open) rawTag = open[1].toLowerCase();
      else if (rawTag && new RegExp(`^</${rawTag}\\s*>`, "i").test(parts[i])) rawTag = null;
    } else if (rawTag) {
      skipped.add(i);
    }
  }

  // الحرف المجاور خارج المقطع: الوسم الكتلي فاصل، والسطري شفاف.
  const neighbor = (index: number, step: 1 | -1): string => {
    for (let i = index + step; i >= 0 && i < parts.length; i += step) {
      if (isTag(i)) {
        if (BLOCK_TAG.test(parts[i])) return " ";
        continue;
      }
      if (parts[i]) return step === -1 ? parts[i].slice(-1) : parts[i][0];
    }
    return " ";
  };

  let applied = 0;
  for (const fix of fixes) {
    const source = fix.original.replace(/\s+/g, " ").trim();
    const suggestion = fix.suggestion.replace(/\s+/g, " ").trim();
    if (!source || !suggestion || source === suggestion) continue;
    const pattern = new RegExp(source.split(" ").map(escapeRegExp).join("\\s+"), "gu");
    const startsWord = WORD_CHAR.test(source[0]);
    const endsWord = WORD_CHAR.test(source[source.length - 1]);
    let hit = false;
    for (let i = 0; i < parts.length; i += 2) {
      if (skipped.has(i) || !parts[i]) continue;
      const text = parts[i];
      parts[i] = text.replace(pattern, (match: string, offset: number) => {
        const before = offset > 0 ? text[offset - 1] : neighbor(i, -1);
        const end = offset + match.length;
        const after = end < text.length ? text[end] : neighbor(i, 1);
        if (startsWord && WORD_CHAR.test(before)) return match;
        if (endsWord && WORD_CHAR.test(after)) return match;
        hit = true;
        return escapeHtmlText(suggestion);
      });
    }
    if (hit) applied++;
  }
  return { html: parts.join(""), applied };
}

export interface OpinionEnrichment {
  summary: string;
  bullets: string[];
  keywords: string[];
  metaTitle: string | null;
  metaDescription: string | null;
  socialTitle: string | null;
  socialDescription: string | null;
  imageAltText: string | null;
  newsletterSubtitle: string | null;
  newsletterExcerpt: string | null;
  imageBrief: string | null;
  categorySlug: string | null;
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function cleanList(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const item = cleanString(entry, maxLen);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

/** يحلل رد النموذج (JSON، وقد يأتي داخل أسوار كود). يرمي إن غاب الموجز. */
export function parseOpinionEnrichment(raw: string): OpinionEnrichment {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const first = stripped.indexOf("{");
    const last = stripped.lastIndexOf("}");
    if (first < 0 || last <= first) throw new Error("enrichment_not_json");
    parsed = JSON.parse(stripped.slice(first, last + 1));
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("enrichment_not_object");
  const obj = parsed as Record<string, unknown>;
  const summary = cleanString(obj.summary, 1200);
  if (!summary) throw new Error("enrichment_missing_summary");
  return {
    summary,
    bullets: cleanList(obj.bullets, 3, 300),
    keywords: cleanList(obj.keywords, 8, 60),
    metaTitle: cleanString(obj.metaTitle, 70),
    metaDescription: cleanString(obj.metaDescription, 170),
    socialTitle: cleanString(obj.socialTitle, 80),
    socialDescription: cleanString(obj.socialDescription, 160),
    imageAltText: cleanString(obj.imageAltText, 200),
    newsletterSubtitle: cleanString(obj.newsletterSubtitle, 100),
    newsletterExcerpt: cleanString(obj.newsletterExcerpt, 300),
    imageBrief: cleanString(obj.imageBrief, 1200),
    categorySlug: cleanString(obj.categorySlug, 120),
  };
}

/** وصف الصورة المرسل لـ GPT: المشهد الرمزي إن وُجد، وإلا العنوان والموجز (نمط محرر الويب). */
export function buildOpinionImagePrompt(input: { title: string; summary: string; imageBrief: string | null }): string {
  const base = input.imageBrief
    ? `صورة رمزية لمقال رأي بعنوان «${input.title}».\nالمشهد: ${input.imageBrief}`
    : `صورة توضيحية لمقال رأي: ${input.title}\n${input.summary}`;
  return `${base}\nبلا أي نص مكتوب، وبلا وجوه أشخاص حقيقيين أو شعارات.`.slice(0, 4000);
}
