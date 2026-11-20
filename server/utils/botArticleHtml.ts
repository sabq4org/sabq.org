/**
 * تنظيف متن المقال عند الحفظ من مسارات البوت (Bot Drafts ونشر سبق ومكتب الرأي).
 *
 * سبب وجوده: تطبيق أندرويد القديم يقرأ HTML المتن بمحلّل يتعثّر بعد فقرة فارغة
 * `<p style="text-align: right">&nbsp;</p>` (انظر HtmlSimpleParser). والفقرات الفارغة
 * و`text-align: right` على مقال عربي لا قيمة لهما أصلًا، فلا نحفظهما من البوت.
 *
 * محافظ ولا يمسّ النص: لا يحذف إلا
 *  - فقرة `<p>` لا يوجد داخلها شيء سوى فراغات و`&nbsp;` و`<br>` (فقرة فيها صورة أو أي وسم آخر تبقى)،
 *  - تصريح `text-align: right|start` من style على p/h1-h6/li/blockquote/div (محاذاة اللغة العربية الافتراضية)،
 *    ويُترك center/left/justify كما هي. ولا يُمسّ عنصر فيه dir صريح.
 * idempotent: تشغيله مرتين يعطي النتيجة نفسها.
 */

const EMPTY_PARAGRAPH =
  /<p\b[^>]*>(?:\s|&nbsp;|&#0*160;|&#x0*a0;|\u00a0|<br\b[^>]*>)*<\/p>/gi;

const BLOCK_TAG_WITH_STYLE = /<(p|h[1-6]|li|blockquote|div)\b([^>]*?)>/gi;
const STYLE_ATTR = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const HAS_DIR_ATTR = /\sdir\s*=/i;
const REDUNDANT_ALIGN = /^\s*text-align\s*:\s*(?:right|start)\s*(?:!important)?\s*$/i;

function stripRedundantAlignFromTag(tag: string, name: string, attrs: string): string {
  if (HAS_DIR_ATTR.test(attrs)) return tag;
  const match = STYLE_ATTR.exec(attrs);
  if (!match) return tag;
  const body = match[1] ?? match[2] ?? "";
  const kept = body.split(";").map((d) => d.trim()).filter((d) => d && !REDUNDANT_ALIGN.test(d));
  if (kept.length === body.split(";").map((d) => d.trim()).filter(Boolean).length) return tag;
  const nextAttrs = attrs.replace(STYLE_ATTR, kept.length ? ` style="${kept.join("; ")}"` : "");
  return `<${name}${nextAttrs}>`;
}

export function stripRedundantRtlAlign(html: string): string {
  return html.replace(BLOCK_TAG_WITH_STYLE, (tag, name: string, attrs: string) => stripRedundantAlignFromTag(tag, name, attrs));
}

export function dropEmptyParagraphs(html: string): string {
  return html.replace(EMPTY_PARAGRAPH, "").replace(/\n{3,}/g, "\n\n");
}

export function cleanBotArticleHtml(html: string, options: { rtl?: boolean } = {}): string {
  if (!html || typeof html !== "string") return html;
  const rtl = options.rtl !== false;
  let out = dropEmptyParagraphs(html);
  if (rtl) out = stripRedundantRtlAlign(out);
  return out.trim();
}

const MEDIA_TAG = /<(img|a|iframe|video|audio|source|embed)\b([^>]*)>/gi;
const MEDIA_ATTRS = ["src", "href", "alt", "poster", "data-src", "srcset"];

/** يُبقي من وسوم الوسائط والروابط قيمها الدلالية فقط (src/href/alt…) ويُسقط ما يضيفه المنظِّف من class/style/data-align. */
function reduceMediaTags(html: string): string {
  return html.replace(MEDIA_TAG, (_tag, name: string, attrs: string) => {
    const kept = MEDIA_ATTRS.map((key) => {
      const m = new RegExp(`\\s${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(attrs);
      return m ? `${key}=${(m[1] ?? m[2] ?? "").trim()}` : "";
    }).filter(Boolean);
    return `<${name.toLowerCase()} ${kept.join(" ")}>`;
  });
}

function canonicalForCompare(html: string, rtl: boolean): string {
  return reduceMediaTags(cleanBotArticleHtml(String(html ?? ""), { rtl })).replace(/\s+/g, " ").replace(/>\s+</g, "><").trim();
}

/**
 * هل الفرق بين المتنين هو التنظيف المعروف فقط (فقرات فارغة / text-align الزائد / فراغات)؟
 * نطبّق التنظيف نفسه على الطرفين ثم نقارن HTML كاملاً، فأي صورة أو رابط (src/href/alt) أو نص أو وسم
 * مضاف أو مستبدل (حتى بلا تغيّر في النص المجرد) يُعدّ تغييراً ظاهراً للقارئ.
 * سمات العرض التي يضيفها المنظِّف على الصور (class/style/data-align) لا تُحتسب.
 */
export function isCleanupOnlyChange(before: unknown, after: unknown, options: { rtl?: boolean } = {}): boolean {
  if (typeof before !== "string" || typeof after !== "string") return false;
  const rtl = options.rtl !== false;
  return canonicalForCompare(before, rtl) === canonicalForCompare(after, rtl);
}
