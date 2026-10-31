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
    categorySlug: cleanString(obj.categorySlug, 120),
  };
}

/**
 * وصف الصورة المرسل لـ GPT، بنفس صيغة نافذة «صور GPT» في محرر الويب (العنوان
 * والموجز + نمط «تعبيري رمزي»)، فيبقى أسلوب سبق في الغلاف هو المسيطر. لا مشهد
 * تفصيلي من النموذج: المشهد المكتوب كان يغيّر الأسلوب كلياً (إضاءة ليلية سينمائية).
 */
export function buildOpinionImagePrompt(input: { title: string; summary: string }): string {
  const summary = input.summary.replace(/\s+/g, " ").trim().slice(0, 300);
  const base = `صورة توضيحية للخبر: ${input.title}${summary ? `\n${summary}` : ""}`;
  return `${base}\nتكوين فني تعبيري رمزي هادئ وعميق يناسب المقالات والتحليلات الصحفية، ألوان متناسقة، بدون أي نصوص أو حروف داخل الصورة.`.slice(0, 4000);
}

// ── تنظيف رأس النص ─────────────────────────────────────────────────────────
// يزيل من بداية نص مقال الرأي الأسطر الزائدة قبل أول فقرة حقيقية فقط:
// «جاهز للنشر:»، وتكرار العنوان، واسم الكاتب، وعنوان فرعي قصير (أو فقرة كلها
// h1-h4/strong)، ثم الفقرات الفارغة. محافظ: لا يحذف فقرة طويلة أبداً، ولا يحذف
// شيئاً إن لم تبقَ بعده فقرة حقيقية.

const HEADER_MAX_CHARS = 120;
const HEADER_MAX_WORDS = 14;
const HEADER_MAX_LINES = 6;
const READY_PREFIX = "جاهز للنشر";

const ENTITY_MAP: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", laquo: "«", raquo: "»" };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITY_MAP[code.toLowerCase()] ?? m;
  });
}

function blockText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/[\s\u00a0\u200b-\u200f\u202a-\u202e\u2066-\u2069]+/g, " ")
    .trim();
}

/** تطبيع للمقارنة: الهمزات، ة/ه، ى/ي، التشكيل والتطويل، الترقيم والمسافات. */
export function normalizeArabicForCompare(value: string): string {
  return blockText(value)
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripWriterPrefix(norm: string): string {
  return norm.replace(/^(بقلم|الكاتب|الكاتبه|كتب|كتبه|كتبت|د|الدكتور|الدكتوره|ا|الاستاذ|الاستاذه|م|المهندس)\s+/, "");
}

interface HeaderBlock { raw: string; inner: string; tag: string }

function splitLeadingBlocks(html: string): { blocks: HeaderBlock[]; rest: string } | null {
  const blocks: HeaderBlock[] = [];
  const re = /^\s*(?:<(p|h[1-6]|div)\b[^>]*>([\s\S]*?)<\/\1>|(<br\s*\/?>))/i;
  let rest = html;
  while (blocks.length < HEADER_MAX_LINES + 4) {
    const m = re.exec(rest);
    if (!m) break;
    blocks.push({ raw: m[0], inner: m[2] ?? "", tag: (m[1] ?? "br").toLowerCase() });
    rest = rest.slice(m[0].length);
  }
  return blocks.length ? { blocks, rest } : null;
}

function isEmptyBlock(b: HeaderBlock): boolean {
  return b.tag === "br" || (!/<img|<iframe|<video|<figure/i.test(b.inner) && blockText(b.inner) === "");
}

function isEmphasisOnly(b: HeaderBlock): boolean {
  if (/^h[1-4]$/.test(b.tag)) return true;
  const inner = b.inner.trim();
  return /^<(strong|b)\b[^>]*>[\s\S]*<\/(strong|b)>$/i.test(inner) && blockText(inner.replace(/<(strong|b)\b[^>]*>[\s\S]*?<\/(strong|b)>/gi, "")) === "";
}

function isShortLine(text: string): boolean {
  return text.length <= HEADER_MAX_CHARS && text.split(" ").length <= HEADER_MAX_WORDS;
}

function looksLikeTitle(norm: string, titleNorm: string): boolean {
  if (!norm || !titleNorm) return false;
  if (norm === titleNorm) return true;
  const shorter = norm.length < titleNorm.length ? norm : titleNorm;
  const longer = shorter === norm ? titleNorm : norm;
  return shorter.length >= 8 && longer.startsWith(shorter) && shorter.length / longer.length >= 0.6;
}

export function stripOpinionHeaderLines(
  html: string,
  ctx: { title: string; writerName?: string | null },
): { html: string; headerLinesRemoved: number } {
  const split = splitLeadingBlocks(html || "");
  if (!split) return { html, headerLinesRemoved: 0 };
  const titleNorm = normalizeArabicForCompare(ctx.title || "");
  const writerNorm = stripWriterPrefix(normalizeArabicForCompare(ctx.writerName || ""));
  const { blocks } = split;
  let i = 0;
  let removed = 0;
  let headerRemoved = 0;
  while (i < blocks.length && headerRemoved < HEADER_MAX_LINES) {
    const b = blocks[i];
    if (isEmptyBlock(b)) { i++; continue; }
    const text = blockText(b.inner);
    if (!isShortLine(text)) break; // أول فقرة حقيقية: لا نتجاوزها أبداً
    const norm = normalizeArabicForCompare(text);
    const ready = text.replace(/^[\s:«"]+/, "").startsWith(READY_PREFIX);
    const isTitle = looksLikeTitle(norm, titleNorm);
    const isWriter = !!writerNorm && writerNorm.length >= 4 && stripWriterPrefix(norm) === writerNorm;
    const noTerminal = !/[.!?؟…:؛»"”)]$/.test(text);
    const isSubtitle = isEmphasisOnly(b) || (noTerminal && text.split(" ").length <= 10);
    if (!(ready || isTitle || isWriter || isSubtitle)) break;
    i++;
    headerRemoved++;
    removed = i;
  }
  if (!headerRemoved) return { html, headerLinesRemoved: 0 };
  // الفقرات الفارغة بعد الرأس
  while (removed < blocks.length && isEmptyBlock(blocks[removed])) removed++;
  const remaining = blocks.slice(removed).map((b) => b.raw).join("") + split.rest;
  // محافظ: يجب أن تبقى فقرة حقيقية بعد الحذف
  if (blockText(remaining).length < 40) return { html, headerLinesRemoved: 0 };
  return { html: remaining.replace(/^\s+/, ""), headerLinesRemoved: headerRemoved };
}
