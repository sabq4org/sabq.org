/**
 * Server-side HTML sanitizer for article/topic bodies that get injected RAW into
 * an SSR / edge response (server/seoInjector.ts, server/routes/edgeMeta.ts).
 *
 * Replaces the previous hand-rolled regex stripper, which only removed *quoted*
 * event handlers and left `<img src=x onerror=...>` intact — stored XSS that ran
 * in every reader's browser (security audit #5). The field is editor-controlled
 * in theory, but AI-generation and foreign-news import also write it, so it is
 * not fully trusted.
 *
 * DOMPurify removes ALL event handlers (quoted or not), javascript: URLs, and
 * unknown/dangerous tags by default. We additionally forbid embedding/scripting
 * containers that an article body never legitimately needs.
 */
import { clearWindow, sanitize } from "isomorphic-dompurify";

let resetScheduled = false;

/**
 * isomorphic-dompurify keeps one JSDOM Window for the process. jsdom's selector
 * engine attaches listeners/state to that Window while parsing documents, so a
 * long-running server must close it periodically. Coalescing to one reset per
 * event-loop turn avoids rebuilding JSDOM for every request during a burst.
 */
function scheduleWindowReset(): void {
  if (resetScheduled) return;
  resetScheduled = true;

  const immediate = setImmediate(() => {
    resetScheduled = false;
    clearWindow();
  });
  immediate.unref?.();
}

/**
 * تخطيط صور المحرر (العرض المخصص والمحاذاة) يعيش في `data-width` / `data-align`
 * ووسم `style`. المُعقِّم يحذف `style` كليًا ويحذف كل `data-*`، فكانت الصورة
 * المضبوطة على 25% تخرج للـSSR/الزواحف بلا عرض فتُعرض بعرض المقال كاملًا.
 *
 * لذلك: نسمح صراحةً بسمات التخطيط الثلاث (وهي بيانات وصفية لا تنفّذ شيئًا)،
 * ثم نعيد بناء `style` للصور فقط من قيمة `data-width` بعد التعقيم — بقيمة
 * مُتحقَّق منها (نسبة أو بكسل) لا تأتي من نص المستخدم مباشرة. أي `style`
 * آخر يبقى محذوفًا كما كان.
 */
const IMAGE_LAYOUT_ATTRS = ["data-width", "data-align", "data-caption"];

const SAFE_IMAGE_WIDTH = /^(?:\d{1,3}(?:\.\d+)?%|\d{1,4}(?:\.\d+)?px)$/;

function restoreImageWidths(html: string): string {
  if (!html.includes("data-width")) return html;

  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = tag.match(/\sdata-width\s*=\s*"([^"]*)"/i);
    const width = match?.[1]?.trim();
    if (!width) return tag;

    // قيمة غير مطابقة للنمط الآمن = بقايا لصق أو محاولة حقن: تُحذف السمة.
    if (!SAFE_IMAGE_WIDTH.test(width)) {
      return tag.replace(/\sdata-width\s*=\s*"[^"]*"/i, "");
    }
    if (/\sstyle\s*=/i.test(tag)) return tag;

    const style = ` style="width: ${width}; max-width: 100%; height: auto;"`;
    return tag.endsWith("/>")
      ? `${tag.slice(0, -2)}${style}/>`
      : `${tag.slice(0, -1)}${style}>`;
  });
}

export function sanitizeArticleHtml(html: string): string {
  if (!html) return "";
  try {
    const clean = sanitize(html, {
      FORBID_TAGS: ["script", "style", "iframe", "embed", "object", "form", "svg", "math"],
      FORBID_ATTR: ["style"],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: IMAGE_LAYOUT_ATTRS,
    });
    return restoreImageWidths(clean);
  } finally {
    scheduleWindowReset();
  }
}
